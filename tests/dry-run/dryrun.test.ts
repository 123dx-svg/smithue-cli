import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cliPath = join(__dirname, '../../dist/cli.js');
const pkgPath = join(__dirname, '../../package.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

describe('T26 dry-run CLI fixture tests', () => {
  it('Test 1: --version matches package.json version (exit 0)', () => {
    const result = spawnSync('node', [cliPath, '--version'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  it('Test 2: --help lists all 5 subcommands (exit 0)', () => {
    const result = spawnSync('node', [cliPath, '--help'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    const output = result.stdout + result.stderr;
    for (const cmd of ['exec', 'list', 'search', 'status', 'prune', 'purge']) {
      expect(output).toContain(cmd);
    }
  });

  it('Test 3: exec with SMITHUE_PORT=19999 fails (no editor, exit != 0, stderr has error)', () => {
    const result = spawnSync('node', [cliPath, 'exec', 'ping', '{}'], {
      encoding: 'utf-8',
      env: { ...process.env, SMITHUE_PORT: '19999' },
      timeout: 10000,
    });
    expect(result.status).not.toBe(0);
    const errOutput = result.stderr + result.stdout;
    expect(errOutput.toLowerCase()).toContain('error');
  });
});
