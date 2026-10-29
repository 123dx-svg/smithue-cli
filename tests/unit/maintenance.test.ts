import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireMaintenanceLock } from '../../src/maintenance.js';

let directory: string;
let release: (() => void) | undefined;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'smithue-maintenance-'));
});

afterEach(() => {
  release?.();
  release = undefined;
  rmSync(directory, { recursive: true, force: true });
});

it('excludes another owner and allows acquisition after release', () => {
  release = acquireMaintenanceLock({ directory, inherit: false });
  expect(() => acquireMaintenanceLock({ directory, inherit: false })).toThrow('maintenance is locked');
  release();
  expect(existsSync(join(directory, 'maintenance.lock'))).toBe(false);
  release = acquireMaintenanceLock({ directory, inherit: false });
});

it('lets the npm child inherit ownership without releasing its parent lock', () => {
  release = acquireMaintenanceLock({ directory, inherit: false });
  const childRelease = acquireMaintenanceLock({ directory });
  childRelease();
  expect(existsSync(join(directory, 'maintenance.lock'))).toBe(true);
});

it('excludes an independent OS process and permits a delegated npm child', () => {
  release = acquireMaintenanceLock({ directory, inherit: false });
  const helper = fileURLToPath(new URL('../../scripts/maintenance-lock.cjs', import.meta.url));
  const script = `const lock=require(process.argv[1]); const release=lock.acquireMaintenanceLock({directory:process.argv[2]});release();`;
  const independentEnv = { ...process.env };
  delete independentEnv.SMITHUE_MAINTENANCE_TOKEN;
  delete independentEnv.SMITHUE_MAINTENANCE_OWNER_PID;
  const independent = spawnSync(process.execPath, ['-e', script, helper, directory], { env: independentEnv });
  expect(independent.status).not.toBe(0);
  const delegated = spawnSync(process.execPath, ['-e', script, helper, directory], { env: process.env });
  expect(delegated.status).toBe(0);
  expect(existsSync(join(directory, 'maintenance.lock'))).toBe(true);
});

it('deploys the actual postinstall bundle under an inherited parent lock', () => {
  const lockDirectory = join(directory, '.smithue');
  release = acquireMaintenanceLock({ directory: lockDirectory, inherit: false });
  const postinstall = fileURLToPath(new URL('../../scripts/postinstall.cjs', import.meta.url));
  const home = join(directory, 'home');
  const result = spawnSync(process.execPath, [postinstall], {
    env: { ...process.env, LOCALAPPDATA: directory, USERPROFILE: home, HOME: home,
      npm_config_global: 'true', SMITHUE_SKILL_NO_AUTOINSTALL: '0' },
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  expect(existsSync(join(home, '.agents', 'skills', 'smithue-control', 'SKILL.md'))).toBe(true);
  expect(existsSync(join(home, '.agents', 'skills', 'smithue-control', 'scripts'))).toBe(true);
  expect(existsSync(join(lockDirectory, 'maintenance.lock'))).toBe(true);
});