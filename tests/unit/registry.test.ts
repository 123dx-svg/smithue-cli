import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readRegistry,
  updateLastUsed,
  getPinned,
  setPinned,
  clearPinned,
  getMostRecent,
  type RegistryEntry,
} from '../../src/registry.js';

let rootDir: string;
let originalLocalAppData: string | undefined;

function entry(projectId: string, n: number): RegistryEntry {
  return {
    projectId,
    pid: 1000 + n,
    port: 2000 + n,
    project: `C:\\Projects\\${projectId}`,
    project_name: `Project ${n}`,
    lastConnectedAt: new Date(Date.UTC(2026, 0, n + 1)).toISOString(),
  };
}

beforeEach(() => {
  originalLocalAppData = process.env.LOCALAPPDATA;
  rootDir = mkdtempSync(join(tmpdir(), 'smithue-registry-'));
  process.env.LOCALAPPDATA = rootDir;
});

afterEach(() => {
  process.env.LOCALAPPDATA = originalLocalAppData;
  rmSync(rootDir, { recursive: true, force: true });
});

it('readRegistry() returns empty registry when file missing', async () => {
  await expect(readRegistry()).resolves.toEqual({ entries: [] });
});

it('updateLastUsed() prepends and deduplicates by projectId', async () => {
  mkdirSync(join(rootDir, '.smithue'), { recursive: true });

  const first = entry('proj-a', 1);
  const second = { ...entry('proj-a', 2), pid: 3002, port: 4002 };

  await updateLastUsed(first);
  await updateLastUsed(second);

  const reg = await readRegistry();
  expect(reg.entries).toHaveLength(1);
  expect(reg.entries[0]).toEqual(second);
});

it('updateLastUsed() caps entries at 20', async () => {
  mkdirSync(join(rootDir, '.smithue'), { recursive: true });

  for (let i = 0; i < 21; i += 1) {
    await updateLastUsed(entry(`proj-${i}`, i));
  }

  const reg = await readRegistry();
  expect(reg.entries).toHaveLength(20);
  expect(reg.entries[0]?.projectId).toBe('proj-20');
  expect(reg.entries[19]?.projectId).toBe('proj-1');
});

it('setPinned(), getPinned(), and clearPinned() work end to end', async () => {
  mkdirSync(join(rootDir, '.smithue'), { recursive: true });

  const pinned = entry('pinned-project', 1);

  await expect(getPinned()).resolves.toBeUndefined();
  await setPinned(pinned);
  await expect(getPinned()).resolves.toEqual(pinned);
  await clearPinned();
  await expect(getPinned()).resolves.toBeUndefined();
});

it('getMostRecent() returns the first entry', async () => {
  mkdirSync(join(rootDir, '.smithue'), { recursive: true });

  const first = entry('proj-a', 1);
  const second = entry('proj-b', 2);

  await updateLastUsed(first);
  await updateLastUsed(second);

  await expect(getMostRecent()).resolves.toEqual(second);
});

it('writes registry atomically through a temp file', async () => {
  mkdirSync(join(rootDir, '.smithue'), { recursive: true });

  const value = entry('proj-atomic', 1);
  await setPinned(value);

  const dir = join(rootDir, '.smithue');
  const finalPath = join(dir, 'last-used.json');
  const tmpPath = finalPath + '.tmp';

  expect(existsSync(finalPath)).toBe(true);
  expect(existsSync(tmpPath)).toBe(false);
  expect(JSON.parse(readFileSync(finalPath, 'utf-8'))).toMatchObject({ pinned: value });
});
