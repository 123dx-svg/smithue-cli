import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

let root: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'smithue-skill-routing-'));
  mkdirSync(join(root, '.smithue', 'sessions'), { recursive: true });
  env = { ...process.env, LOCALAPPDATA: root };
  for (const key of ['SMITHUE_PORT', 'SMITHUE_PID', 'SMITHUE_PROJECT', 'SMITHUE_SESSION']) delete env[key];
  for (const pid of [1001, 1002]) {
    writeFileSync(join(root, '.smithue', `${pid}.port`), JSON.stringify({
      pid, port: pid + 10000, project: `C:/Projects/${pid}.uproject`, project_name: String(pid),
    }));
  }
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

for (const language of ['node', 'powershell']) {
  const supported = language === 'node' || process.platform === 'win32';
  const script = fileURLToPath(new URL(`../../skill/scripts/${language === 'node' ? 'smithue-exec.mjs' : 'smithue.ps1'}`, import.meta.url));
  const run = () => spawnSync(language === 'node' ? process.execPath : 'powershell.exe',
    language === 'node' ? [script, 'ping', '{}'] : ['-NoProfile', '-File', script, 'ping', '{}'],
    { env, encoding: 'utf8' });

  it.skipIf(!supported)(`${language} fallback refuses an ambiguous editor target`, () => {
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Multiple editors');
  });

  it.skipIf(!supported)(`${language} fallback never replaces an exited session target`, () => {
    env.SMITHUE_SESSION = 'stale-session';
    const key = createHash('sha256').update(env.SMITHUE_SESSION).digest('hex');
    writeFileSync(join(root, '.smithue', 'sessions', `${key}.json`), JSON.stringify({
      pinned: { pid: 9999, port: 19999, project: 'C:/Projects/Missing.uproject' },
    }));
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No running SmithUE editor');
  });
}