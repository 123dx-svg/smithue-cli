#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { execCommand } from './commands/exec.js';
import { listCommand } from './commands/list.js';
import { searchCommand } from './commands/search.js';
import { statusCommand } from './commands/status.js';
import { useCommand } from './commands/use.js';
import { purge } from './commands/purge.js';
import { prune } from './commands/prune.js';
import { upgradeCommand } from './commands/upgrade.js';
import { batchCommand } from './commands/batch.js';
import { factoryCommand } from './commands/factory.js';
import { skillCommand } from './commands/skill.js';
import { specInferCommand } from './commands/spec.js';
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
    await execCommand(command, parsedParams, { ...globals });
  });

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
program
  .command('list [domain]')
  .description('List available tools, optionally filtered by domain')
.action(async (domain: string | undefined) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number; strict?: boolean }>();
    await listCommand(domain, { ...globals });
  });

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
program
  .command('search <keyword>')
  .description('Search tools by keyword')
.action(async (keyword: string) => {
    const globals = program.opts<{ pid?: number; project?: string; port?: number; strict?: boolean }>();
    await searchCommand(keyword, { ...globals });
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
    await statusCommand({ ...globals, wait: cmdOpts.wait });
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
    await prune();
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
// skill
// ---------------------------------------------------------------------------
program
  .command('skill')
  .description('Print or install the bundled SKILL.md for AI agent integration')
  .option('--print', 'print SKILL.md to stdout')
  .option('--install <dir>', 'install SKILL.md into the specified directory')
  .action(async (cmdOpts: { print?: boolean; install?: string }) => {
    await skillCommand(cmdOpts);
  });

// ---------------------------------------------------------------------------
// spec
// ---------------------------------------------------------------------------
const spec = program.command('spec').description('Spec utilities');

spec
  .command('infer')
  .description('Infer a draft spec from a golden blueprint')
  .requiredOption('--from <bp_path>', 'source blueprint path for bp_describe_components')
  .requiredOption('--out <spec.json>', 'write inferred spec JSON to this file')
  .option('--spec-id <id>', 'override inferred spec id')
  .option('--spec-name <name>', 'override inferred spec name')
  .action(
    async (cmdOpts: { from: string; out: string; specId?: string; specName?: string }) => {
      const globals = program.opts<{ pid?: number; project?: string; port?: number; strict?: boolean }>();
      await specInferCommand({ ...cmdOpts, ...globals });
    },
  );

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------
program
  .command('factory <specId>')
  .description('Plan asset-to-blueprint factory operations')
  .option('--dry-run', 'emit the factory plan without writing assets', true)
  .action(async (specId: string, cmdOpts: { dryRun?: boolean }) => {
    const globals = program.opts<{
      pid?: number;
      project?: string;
      port?: number;
      strict?: boolean;
      terse?: boolean;
      out?: string;
    }>();
    await factoryCommand(
      { specId, dryRun: cmdOpts.dryRun ?? true, ...globals },
      { terse: globals.terse, outPath: globals.out },
    );
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
