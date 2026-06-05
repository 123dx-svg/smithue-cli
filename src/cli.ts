#!/usr/bin/env node
import { Command } from 'commander';
import { readdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { execCommand } from './commands/exec.js';
import { listCommand } from './commands/list.js';
import { searchCommand } from './commands/search.js';
import { statusCommand } from './commands/status.js';
import { purge } from './commands/purge.js';
import { printResult, printError } from './output.js';

const program = new Command();

program
  .name('smithue')
  .description('CLI for SmithUE Unreal Engine plugin')
  .version('0.7.0')
  .option('--pid <pid>', 'target SmithUE instance by PID', parseInt)
  .option('--project <path>', 'target SmithUE instance by project path')
  .option('--port <port>', 'connect directly to port (skip discovery)', parseInt);

// ---------------------------------------------------------------------------
// exec
// ---------------------------------------------------------------------------
program
  .command('exec <command> [params]')
  .description('Execute a SmithUE command')
  .action(async (command: string, params: string | undefined) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number }>();
    let parsedParams: Record<string, unknown> = {};
    if (params) {
      try {
        parsedParams = JSON.parse(params) as Record<string, unknown>;
      } catch {
        printError(new Error(`params must be valid JSON, got: ${params}`));
        return;
      }
    }
    await execCommand(command, parsedParams, globals);
  });

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
program
  .command('list [domain]')
  .description('List available tools, optionally filtered by domain')
  .action(async (domain: string | undefined) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number }>();
    await listCommand(domain, globals);
  });

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
program
  .command('search <keyword>')
  .description('Search tools by keyword')
  .action(async (keyword: string) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number }>();
    await searchCommand(keyword, globals);
  });

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
program
  .command('status')
  .description('Get SmithUE editor status')
  .option('--wait <seconds>', 'wait up to N seconds for editor to be ready', parseInt)
  .action(async (cmdOpts: { wait?: number }) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number }>();
    await statusCommand({ ...globals, wait: cmdOpts.wait });
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
// Parse
// ---------------------------------------------------------------------------
await program.parseAsync(process.argv);
