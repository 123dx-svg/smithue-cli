import { readdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { isProcessAlive } from '../proc.js';
import { printResult } from '../output.js';

export interface PruneResult {
  scanned: number;
  pruned: number;
  kept: number;
}

/**
 * Scan `dir` for `.port` files and remove stale ones.
 *
 * A portfile is considered stale if ANY of the following is true:
 *   1. It cannot be parsed (malformed JSON / missing `port` field).
 *   2. The `pid` recorded in the file is no longer alive — even if the port
 *      happens to respond (another process may have reused that port).
 *   3. The PID is alive but the HTTP `/ready` probe fails (connection refused).
 *
 * Only a file whose PID is alive AND whose port responds is kept.
 */
export async function prunePortfiles(dir: string): Promise<PruneResult> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { scanned: 0, pruned: 0, kept: 0 };
  }

  const portFiles = entries.filter((e) => e.endsWith('.port'));
  let scanned = 0;
  let pruned = 0;
  let kept = 0;

  for (const entry of portFiles) {
    const filePath = join(dir, entry);
    scanned++;

    // --- Step 1: parse portfile ---
    let port: number;
    let pid: number;
    try {
      const content = await readFile(filePath, 'utf8');
      const data = JSON.parse(content) as { port?: unknown; pid?: unknown };
      port = data.port as number;
      pid = typeof data.pid === 'number' ? data.pid : 0;
      if (!Number.isInteger(port) || port <= 0) throw new Error('bad port');
    } catch {
      // malformed portfile — treat as stale
      try { await unlink(filePath); } catch { /* best effort */ }
      pruned++;
      continue;
    }

    // --- Step 2: PID alive check (NEW) ---
    // If the owning process is dead, the portfile is stale regardless of
    // whether some other process happens to be listening on the same port.
    if (pid > 0 && !isProcessAlive(pid)) {
      try { await unlink(filePath); } catch { /* best effort */ }
      pruned++;
      continue;
    }

    // --- Step 3: HTTP liveness probe ---
    let alive = false;
    try {
      await fetch(`http://127.0.0.1:${port}/ready`, {
        signal: AbortSignal.timeout(1000),
      });
      // any HTTP response = server is alive (including 503 during startup)
      alive = true;
    } catch {
      alive = false;
    }

    if (alive) {
      kept++;
    } else {
      try { await unlink(filePath); } catch { /* best effort */ }
      pruned++;
    }
  }

  return { scanned, pruned, kept };
}

export async function prune(): Promise<void> {
  const localAppData = process.env['LOCALAPPDATA'];
  if (!localAppData) {
    printResult({ scanned: 0, pruned: 0, kept: 0 });
    return;
  }

  const dir = join(localAppData, '.smithue');
  const result = await prunePortfiles(dir);
  printResult(result);
}
