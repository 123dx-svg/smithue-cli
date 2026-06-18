#!/usr/bin/env node
import { Command } from 'commander';
import { readdir, readFile, unlink } from 'fs/promises';
import { createRequire } from 'module';
import { join } from 'path';
import { execCommand } from './commands/exec.js';
import { listCommand } from './commands/list.js';
import { searchCommand } from './commands/search.js';
import { statusCommand } from './commands/status.js';
import { useCommand } from './commands/use.js';
import { purge } from './commands/purge.js';
import { upgradeCommand } from './commands/upgrade.js';
import { batchCommand } from './commands/batch.js';
import { printResult, printError, setOutputOptions } from './output.js';

const program = new Command();
const require = createRequire(import.meta.url);
const { version: cliVersion } = require('../package.json') as { version: string };

program
  .name('smithue-cli')
  .description('CLI for SmithUE Unreal Engine plugin')
  .version(cliVersion)
  .option('--pid <pid>', 'target SmithUE instance by PID', parseInt)
  .option('--project <path>', 'target SmithUE instance by project path')
  .option('--port <port>', 'connect directly to port (skip discovery)', parseInt)
  .option('--terse', 'emit minified JSON output')
  .option('--out <file>', 'write result to file instead of stdout')
  .option('--strict', 'require explicit instance selection; error on multiple instances (CI mode)');

program.hook('preAction', () => {
  const opts = program.opts<{ terse?: boolean; out?: string; strict?: boolean }>();
  setOutputOptions({ terse: opts.terse, outPath: opts.out });
  // SMITHUE_STRICT=1 env var acts as global --strict
  if (!opts.strict && process.env['SMITHUE_STRICT'] === '1') {
    program.setOptionValue('strict', true);
  }
});

// ---------------------------------------------------------------------------
// exec
// ---------------------------------------------------------------------------
program
  .command('exec <command> [params]')
  .description('Execute a SmithUE command')
.action(async (command: string, params: string | undefined) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number; strict?: boolean }>();
    let parsedParams: Record<string, unknown> = {};
    if (params) {
      try {
        parsedParams = JSON.parse(params) as Record<string, unknown>;
      } catch {
        printError(new Error(`params must be valid JSON, got: ${params}`));
        return;
      }
    }
    await execCommand(command, parsedParams, { ...globals, cliVersion });
  });

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
program
  .command('list [domain]')
  .description('List available tools, optionally filtered by domain')
.action(async (domain: string | undefined) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number; strict?: boolean }>();
    await listCommand(domain, { ...globals, cliVersion });
  });

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
program
  .command('search <keyword>')
  .description('Search tools by keyword')
.action(async (keyword: string) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number; strict?: boolean }>();
    await searchCommand(keyword, { ...globals, cliVersion });
  });

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
program
  .command('status')
  .description('Get SmithUE editor status')
  .option('--wait <seconds>', 'wait up to N seconds for editor to be ready', parseInt)
  .action(async (cmdOpts: { wait?: number }) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number; strict?: boolean }>();
    await statusCommand({ ...globals, wait: cmdOpts.wait, cliVersion });
  });

// ---------------------------------------------------------------------------
// use
// ---------------------------------------------------------------------------
program
  .command('use')
  .description('Pin a default SmithUE instance. Use --clear to unpin.')
  .option('--pid <pid>', 'pin instance by PID', parseInt)
  .option('--project <path>', 'pin instance by project path or name')
  .option('--clear', 'remove the pinned instance')
  .action(async (cmdOpts: { pid?: number; project?: string; clear?: boolean }) => {
    await useCommand(cmdOpts);
  });

// ---------------------------------------------------------------------------
// prune
// ---------------------------------------------------------------------------
program
  .command('prune')
  .description('Remove stale portfiles for SmithUE instances that are no longer running')
  .action(async () => {
    const localAppData = process.env['LOCALAPPDATA'];
    if (!localAppData) {
      printResult({ scanned: 0, pruned: 0, kept: 0 });
      return;
    }

    const dir = join(localAppData, '.smithue');
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      printResult({ scanned: 0, pruned: 0, kept: 0 });
      return;
    }

    const portFiles = entries.filter((e) => e.endsWith('.port'));
    let scanned = 0;
    let pruned = 0;
    let kept = 0;

    for (const entry of portFiles) {
      const filePath = join(dir, entry);
      scanned++;

      let port: number;
      try {
        const content = await readFile(filePath, 'utf8');
        const data = JSON.parse(content) as { port?: unknown };
        port = data.port as number;
        if (!Number.isInteger(port) || port <= 0) throw new Error('bad port');
      } catch {
        // malformed portfile - treat as stale
        try { await unlink(filePath); } catch { /* best effort */ }
        pruned++;
        continue;
      }

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
        try {
          await unlink(filePath);
        } catch {
          // best effort
        }
        pruned++;
      }
    }

    printResult({ scanned, pruned, kept });
  });

// ---------------------------------------------------------------------------
// purge
// ---------------------------------------------------------------------------
program
  .command('purge')
  .description('Remove the .smithue directory entirely (full uninstall cleanup)')
  .option('--force', 'skip liveness check and delete all files including unknown ones')
  .option('--dry-run', 'show what would be deleted without modifying anything')
  .option('-y, --yes', 'skip confirmation prompt (required for non-interactive use)')
  .action(async (cmdOpts: { force?: boolean; dryRun?: boolean; yes?: boolean }) => {
    await purge({
      force: cmdOpts.force ?? false,
      dryRun: cmdOpts.dryRun ?? false,
      yes: cmdOpts.yes ?? false,
    });
  });

// ---------------------------------------------------------------------------
// upgrade
// ---------------------------------------------------------------------------
program
  .command('upgrade')
  .description('Update smithue-cli globally via npm')
  .action(async () => {
    await upgradeCommand();
  });

// ---------------------------------------------------------------------------
// batch
// ---------------------------------------------------------------------------
program
  .command('batch [commands...]')
  .description('Execute multiple read-only commands sequentially')
.action(async (commands: string[] = []) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number; strict?: boolean }>();
    await batchCommand(commands, globals);
  });

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------
await program.parseAsync(process.argv);
