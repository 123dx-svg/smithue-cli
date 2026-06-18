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
  port: number;
  pid: number;
  project: string;
  project_name: string;
  started_at: string;
  plugin_version: string;
}

export interface DiscoverResult {
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
    await fetch(`http://127.0.0.1:${port}/ready`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    // any HTTP response = server is alive (including 503 during startup)
    return { busy: false };
  } catch (err) {
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
        `  Fallback: curl -s http://127.0.0.1:${port}/api/v1/execute -d '{"command":"ping","params":{}}'`,
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
  // 1. SMITHUE_PORT env override — skip discovery entirely
  const envPort = process.env['SMITHUE_PORT'];
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (isNaN(port) || port <= 0) {
      throw new SmithUEError(`SMITHUE_PORT is not a valid port number: "${envPort}"`, 1);
    }
    return { port, pid: 0, project: '', project_name: '', selection_mode: 'explicit', busy: false };
  }

  // 2. --port flag shortcut (already resolved by caller, treated same as env override)
  if (opts.port !== undefined) {
    return { port: opts.port, pid: 0, project: '', project_name: '', selection_mode: 'explicit', busy: false };
  }

  let selectionMode: DiscoverResult['selection_mode'] = 'explicit';

  // 3. Determine effective PID filter (--pid > SMITHUE_PID env)
  let pidFilter: number | undefined = opts.pid;
  if (pidFilter === undefined) {
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
      `  Direct connect: set SMITHUE_PORT=<port> or use --port <port>.`,
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
  } else if (opts.project !== undefined) {
    const query = opts.project;

    // 1. Try exact absolute path comparison (backward-compatible, M7)
    let matched = candidates.filter((c) => c.data.project === query);

    // 2. Fuzzy fallback: match by project_name or basename of project path
    if (matched.length === 0) {
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

  // 6. Multi-instance: select most-recent or hard-error in strict mode
  if (candidates.length > 1) {
    if (opts.strict) {
      const list = candidates
        .map((c) => `  PID ${c.data.pid}  ${c.data.project_name}  (port ${c.data.port})`)
        .join('\n');
      throw new SmithUEError(
        `Multiple SmithUE instances are running. Use --pid or --project to select one:\n${list}`,
        1,
      );
    }

    const pinned = registry.getPinned ? await registry.getPinned() : undefined;
    if (pinned) {
      const pinnedCandidate = candidates.find(
        (c) => c.data.pid === pinned.pid && c.data.port === pinned.port,
      );
      if (pinnedCandidate) {
        process.stderr.write(
          `[smithue] selected PID ${pinned.pid} ${pinned.project_name} (pinned)\n`,
        );
        selectionMode = 'pinned';
        candidates = [pinnedCandidate];
      }
    }

    const recent = await registry.getMostRecent();
    if (recent) {
      const recentCandidate = candidates.find(
        (c) => c.data.pid === recent.pid && c.data.port === recent.port,
      );
      if (recentCandidate) {
        process.stderr.write(
          `[smithue] selected PID ${recent.pid} ${recent.project_name} (most recent)\n`,
        );
        selectionMode = 'most-recent';
        candidates = [recentCandidate];
      }
    }

    if (candidates.length > 1) {
      const list = candidates
        .map((c) => `  PID ${c.data.pid}  ${c.data.project_name}  (port ${c.data.port})`)
        .join('\n');
      throw new SmithUEError(
        `Multiple SmithUE instances are running. Use --pid or --project to select one:\n${list}`,
        1,
      );
    }
  }

  // 7. Single candidate — liveness check
  const { file, data } = candidates[0]!;
  const liveness = await checkLiveness(data.port, file, data.pid);

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
    pid: data.pid,
    project: data.project,
    project_name: data.project_name,
    plugin_version: data.plugin_version,
    selection_mode: selectionMode,
    busy: liveness.busy,
  };
}
