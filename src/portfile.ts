import { readdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

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
}

export interface DiscoverOpts {
  pid?: number;
  project?: string;
  port?: number;
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

async function checkLiveness(port: number, filePath: string): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}/ready`, {
      signal: AbortSignal.timeout(3000),
    });
    // any HTTP response = server is alive (including 503 during startup)
    return;
  } catch {
    // network failure = truly stale
    try {
      await unlink(filePath);
    } catch {
      // best effort
    }
    throw new SmithUEError(
      `SmithUE instance on port ${port} is not responding. Stale portfile removed.`,
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
    return { port, pid: 0, project: '', project_name: '' };
  }

  // 2. --port flag shortcut (already resolved by caller, treated same as env override)
  if (opts.port !== undefined) {
    return { port: opts.port, pid: 0, project: '', project_name: '' };
  }

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
      'No SmithUE portfiles found. Is the SmithUE plugin running in Unreal Editor?',
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
    // Exact absolute path comparison (M7)
    candidates = candidates.filter((c) => c.data.project === opts.project);
    if (candidates.length === 0) {
      throw new SmithUEError(
        `No SmithUE instance found for project "${opts.project}".`,
        2,
      );
    }
  }

  // 6. Multi-instance error (no disambiguation possible)
  if (candidates.length > 1) {
    const list = candidates
      .map((c) => `  PID ${c.data.pid}  ${c.data.project_name}  (port ${c.data.port})`)
      .join('\n');
    throw new SmithUEError(
      `Multiple SmithUE instances are running. Use --pid or --project to select one:\n${list}`,
      1,
    );
  }

  // 7. Single candidate — liveness check
  const { file, data } = candidates[0]!;
  await checkLiveness(data.port, file);

  return {
    port: data.port,
    pid: data.pid,
    project: data.project,
    project_name: data.project_name,
    plugin_version: data.plugin_version,
  };
}
