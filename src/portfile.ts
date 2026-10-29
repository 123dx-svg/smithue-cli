import { readdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { isProcessAlive } from './proc.js';
import * as registry from './registry.js';
import { projectId } from './identity.js';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class SmithUEError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = 'SmithUEError';
  }
}

// ---------------------------------------------------------------------------
// Portfile shape
// ---------------------------------------------------------------------------

export interface PortfileData {
  instance_id?: string;
  port: number;
  pid: number;
  project: string;
  project_name: string;
  started_at: string;
  plugin_version: string;
}

export interface DiscoverResult {
  instance_id?: string;
  port: number;
  pid: number;
  project: string;
  project_name: string;
  plugin_version?: string;
  selection_mode?: 'pinned' | 'most-recent' | 'explicit';
  busy?: boolean;
}

export interface DiscoverOpts {
  pid?: number;
  project?: string;
  port?: number;
  /** When true, revert to hard-error on multi-instance (CI/script mode). Default: false. */
  strict?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getPortfileDir(): string {
  const localAppData = process.env['LOCALAPPDATA'];
  if (!localAppData) {
    throw new SmithUEError(
      'LOCALAPPDATA environment variable is not set. This command requires Windows.',
      2,
    );
  }
  return join(localAppData, '.smithue');
}

export async function readPortfiles(dir: string): Promise<Array<{ file: string; data: PortfileData }>> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const portfiles: Array<{ file: string; data: PortfileData }> = [];

  for (const entry of entries) {
    if (!entry.endsWith('.port')) continue;
    const filePath = join(dir, entry);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as PortfileData;
        if (!data || !Number.isInteger(data.pid) || data.pid <= 0
          || !Number.isInteger(data.port) || data.port < 1 || data.port > 65535
          || typeof data.project !== 'string' || typeof data.project_name !== 'string'
          || entry !== `${data.pid}.port`) continue;
      portfiles.push({ file: filePath, data });
    } catch {
      // Ignore malformed portfiles
    }
  }

  return portfiles;
}

async function checkLiveness(port: number, filePath: string, pid: number): Promise<{ busy: boolean }> {
  const timeoutMs = parseInt(process.env['SMITHUE_PROBE_TIMEOUT'] ?? '10000', 10);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/ready`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (typeof response.json === 'function') {
      const identity = await response.json() as { pid?: number };
      if (identity.pid !== undefined && identity.pid !== pid) {
        throw new SmithUEError(`Editor identity mismatch on port ${port}: expected PID ${pid}, received ${identity.pid}.`, 2);
      }
    }
    // any HTTP response = server is alive (including 503 during startup)
    return { busy: false };
  } catch (err) {
    if (err instanceof SmithUEError) throw err;
    const error = err as Error;

    // Timeout means the editor may be busy running a long command.
    // Keep the portfile and treat the instance as alive/busy.
    if (error.name === 'AbortError') {
      return { busy: true };
    }

    const processAlive = pid > 0 && isProcessAlive(pid);

    if (processAlive) {
      throw new SmithUEError(
        `SmithUE instance on port ${port} is unreachable, but process ${pid} is still running. Try again or restart the editor.\n` +
        `  Probe failure: ${error.message}\n` +
        `  Inspect with smithue-cli instances. Keep the current session binding; do not retry writes or switch editors.`,
        2,
      );
    }

    // Connection-level failure is stale only when the owning process is dead.
    try {
      await unlink(filePath);
    } catch {
      // best effort
    }
    throw new SmithUEError(
      `SmithUE instance on port ${port} is not responding and process ${pid} is dead. Stale portfile removed.`,
      2,
    );
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function discoverPort(opts: DiscoverOpts = {}): Promise<DiscoverResult> {
  const session = process.env['SMITHUE_SESSION'];
  if (opts.port !== undefined && (opts.pid !== undefined || opts.project !== undefined || session)) {
    throw new SmithUEError('--port cannot be combined with a PID, project, or session binding.', 1);
  }
  // 1. SMITHUE_PORT env override — skip discovery entirely
  const envPort = process.env['SMITHUE_PORT'];
  if (envPort && opts.port === undefined && opts.pid === undefined && opts.project === undefined && !session) {
    const port = parseInt(envPort, 10);
    if (!/^\d+$/.test(envPort) || port <= 0 || port > 65535) {
      throw new SmithUEError(`SMITHUE_PORT is not a valid port number: "${envPort}"`, 1);
    }
    return { port, pid: 0, project: '', project_name: '', selection_mode: 'explicit', busy: false };
  }

  // 2. --port flag shortcut (already resolved by caller, treated same as env override)
  if (opts.port !== undefined) {
    if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
      throw new SmithUEError('--port must be an integer between 1 and 65535.', 1);
    }
    return { port: opts.port, pid: 0, project: '', project_name: '', selection_mode: 'explicit', busy: false };
  }

  let selectionMode: DiscoverResult['selection_mode'] = 'explicit';

  // 3. Determine effective PID filter (--pid > SMITHUE_PID env)
  let pidFilter: number | undefined = opts.pid;
  if (pidFilter === undefined && opts.project === undefined && !session) {
    const envPid = process.env['SMITHUE_PID'];
    if (envPid) {
      const p = parseInt(envPid, 10);
      if (!isNaN(p) && p > 0) {
        pidFilter = p;
      }
    }
  }

  // 4. Read all portfiles
  const dir = getPortfileDir();
  const all = await readPortfiles(dir);

  if (all.length === 0) {
    throw new SmithUEError(
      `No SmithUE portfiles found. Is the SmithUE plugin running in Unreal Editor?\n` +
      `  Check: status bar SmithUE green dot in UE Editor.\n` +
      `  Port dir: ${dir}\n` +
      `  Re-run smithue-cli instances after the editor starts, then explicitly confirm and bind the intended target.`,
      2,
    );
  }

  // 5. Apply filters
  let candidates = all;

  if (pidFilter !== undefined) {
    candidates = candidates.filter((c) => c.data.pid === pidFilter);
    if (candidates.length === 0) {
      throw new SmithUEError(
        `No SmithUE instance found with PID ${pidFilter}.`,
        2,
      );
    }
  }
  if (opts.project !== undefined) {
    const query = opts.project;

    // 1. Try exact absolute path comparison (backward-compatible, M7)
    let matched = candidates.filter((c) => projectId(c.data.project) === projectId(query));

    // 2. Fuzzy fallback: match by project_name or basename of project path
    if (matched.length === 0 && !/[\\/]/.test(query)) {
      const q = query.toLowerCase();
      matched = candidates.filter((c) => {
        const name = c.data.project_name?.toLowerCase() ?? '';
        const base = c.data.project.split(/[\\/]/).pop()?.toLowerCase() ?? '';
        return name === q || base === q || name.includes(q);
      });
    }

    if (matched.length === 0) {
      throw new SmithUEError(
        `No SmithUE instance found for project "${query}". Use --pid to select by process ID.`,
        2,
      );
    }

    // Multiple fuzzy matches → give list so user can disambiguate with --pid
    if (matched.length > 1) {
      const list = matched
        .map((c) => `  PID ${c.data.pid}  ${c.data.project_name}  (port ${c.data.port})`)
        .join('\n');
      throw new SmithUEError(
        `Multiple SmithUE instances match "${query}". Use --pid to select one:\n${list}`,
        1,
      );
    }

    candidates = matched;
  }

  if (session && pidFilter === undefined && opts.project === undefined) {
    const pinned = await registry.getPinned();
    if (!pinned) {
      throw new SmithUEError('Session has no editor binding. Select --pid or --project first.', 1);
    }
    const bound = candidates.filter((candidate) => candidate.data.pid === pinned.pid
      && candidate.data.port === pinned.port
      && candidate.data.instance_id === pinned.instance_id
      && projectId(candidate.data.project) === pinned.projectId);
    if (bound.length !== 1) {
      throw new SmithUEError('The session-bound editor is unavailable. Explicitly rebind with --pid or --project; no fallback is allowed.', 2);
    }
    candidates = bound;
    selectionMode = 'pinned';
  }

  if (candidates.length > 1) {
    const list = candidates
      .map((candidate) => `  PID ${candidate.data.pid}  ${candidate.data.project_name}  (port ${candidate.data.port})`)
      .join('\n');
    throw new SmithUEError(
      `Multiple SmithUE instances are running. Use --pid or --project to select one:\n${list}`, 1,
    );
  }

  // 7. Single candidate — liveness check
  const { file, data } = candidates[0]!;
  const liveness = await checkLiveness(data.port, file, data.pid);

  if (session && selectionMode === 'explicit') {
    await registry.setPinned({
      projectId: projectId(data.project), pid: data.pid, port: data.port,
      ...(data.instance_id ? { instance_id: data.instance_id } : {}),
      project: data.project, project_name: data.project_name,
      lastConnectedAt: new Date().toISOString(),
    });
  }

  try {
    await registry.updateLastUsed({
      projectId: projectId(data.project || ''),
      pid: data.pid,
      port: data.port,
      project: data.project,
      project_name: data.project_name,
      lastConnectedAt: new Date().toISOString(),
    });
  } catch {
    // best effort
  }

  return {
    port: data.port,
    ...(data.instance_id ? { instance_id: data.instance_id } : {}),
    pid: data.pid,
    project: data.project,
    project_name: data.project_name,
    plugin_version: data.plugin_version,
    selection_mode: selectionMode,
    busy: liveness.busy,
  };
}
