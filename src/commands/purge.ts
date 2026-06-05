import { readdir, readFile, lstat, unlink, rmdir } from 'fs/promises';
import { join } from 'path';
import { createInterface } from 'readline';
import { getPortfileDir, SmithUEError } from '../portfile.js';
import { printResult, printError } from '../output.js';
import type { PurgeOptions, PurgeResult } from '../types.js';

export async function purge(opts: PurgeOptions): Promise<void> {
  if (!process.env['LOCALAPPDATA']) {
    printError(new SmithUEError('LOCALAPPDATA env not set; smithue-cli purge is Windows-only', 2));
    return;
  }

  const dir = getPortfileDir();

  let dirStat: Awaited<ReturnType<typeof lstat>>;
  try {
    dirStat = await lstat(dir);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'ENOENT') {
      printResult({
        status: 'nothing_to_purge',
        path: dir,
        scanned: 0,
        deleted: 0,
        skipped_live: 0,
        failed: 0,
        directory_removed: false,
        errors: [],
        warnings: [],
      });
      return;
    }
    throw e;
  }

  if (dirStat.isSymbolicLink()) {
    printError(new SmithUEError('Refusing to purge symlinked .smithue directory', 3));
    return;
  }

  const entries = await readdir(dir);
  const portEntries = entries.filter((e) => e.endsWith('.port'));
  const unknownEntries = entries.filter((e) => !e.endsWith('.port'));
  const scanned = portEntries.length;

  type FileEntry = { path: string; dead: boolean };
  const portFiles: FileEntry[] = [];
  let skipped_live = 0;

  if (opts.force) {
    for (const name of portEntries) {
      portFiles.push({ path: join(dir, name), dead: true });
    }
  } else {
    for (const name of portEntries) {
      const filePath = join(dir, name);
      let port: number;
      try {
        const raw = await readFile(filePath, 'utf-8');
        const data = JSON.parse(raw) as { port?: unknown };
        port = data.port as number;
      } catch {
        portFiles.push({ path: filePath, dead: true });
        continue;
      }

      let alive = false;
      try {
        await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(1000) });
        alive = true;
      } catch {
        alive = false;
      }

      portFiles.push({ path: filePath, dead: !alive });
      if (alive) skipped_live++;
    }
  }

  const toDelete: string[] = opts.force
    ? [...portFiles.map((f) => f.path), ...unknownEntries.map((e) => join(dir, e))]
    : portFiles.filter((f) => f.dead).map((f) => f.path);

  const warnings: string[] = [];
  if (!opts.force && unknownEntries.length > 0) {
    warnings.push(`${unknownEntries.length} unknown file(s) skipped (use --force to remove): ${unknownEntries.join(', ')}`);
  }

  if (!opts.yes && !opts.dryRun) {
    if (!process.stdin.isTTY) {
      printError(new SmithUEError('Refusing to delete in non-interactive mode without -y/--yes', 1));
      return;
    }

    const promptMsg = [
      `Path: ${dir}`,
      `  Files to delete: ${toDelete.length}`,
      skipped_live > 0 ? `  Live portfiles skipped: ${skipped_live}` : null,
      `Delete ${toDelete.length} file(s) from ${dir}? [y/N] `,
    ].filter(Boolean).join('\n');

    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const answer = await new Promise<string>((resolve) => {
      rl.question(promptMsg, (ans: string) => {
        rl.close();
        resolve(ans);
      });
    });

    if (!/^y(es)?$/i.test(answer)) {
      printResult({
        status: 'cancelled',
        path: dir,
        scanned,
        deleted: 0,
        skipped_live,
        failed: 0,
        directory_removed: false,
        errors: [],
        warnings,
      });
      return;
    }
  }

  if (opts.dryRun) {
    printResult({
      status: 'dry_run',
      path: dir,
      scanned,
      deleted: toDelete.length,
      skipped_live,
      failed: 0,
      directory_removed: false,
      errors: [],
      warnings,
    });
    return;
  }

  const errors: string[] = [];
  let deleted = 0;
  let failed = 0;
  for (const filePath of toDelete) {
    try {
      await unlink(filePath);
      deleted++;
    } catch (e: unknown) {
      failed++;
      errors.push(`${filePath}: ${(e as Error).message}`);
    }
  }

  let directory_removed = false;
  const remaining = await readdir(dir);
  if (remaining.length === 0 && skipped_live === 0) {
    try {
      await rmdir(dir);
      directory_removed = true;
    } catch (e: unknown) {
      warnings.push(`Failed to remove directory ${dir}: ${(e as Error).message}`);
    }
  }

  const status: PurgeResult['status'] = skipped_live > 0 || failed > 0 ? 'partial' : 'purged';
  printResult({ status, path: dir, scanned, deleted, skipped_live, failed, directory_removed, errors, warnings });
}
