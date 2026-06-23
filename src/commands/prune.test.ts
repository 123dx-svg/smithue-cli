import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm, readdir } from 'fs/promises';
import os from 'os';
import path from 'path';
import { prunePortfiles } from './prune.js';

vi.mock('../proc.js', () => ({
  isProcessAlive: vi.fn(),
}));

import { isProcessAlive } from '../proc.js';

function makePortfile(port: number, pid: number): string {
  return JSON.stringify({ port, pid, project: '/Test/Test.uproject', project_name: 'Test', started_at: '2024-01-01T00:00:00.000Z', plugin_version: '1.0.0' });
}

describe('prunePortfiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'smithue-prune-test-'));
    vi.resetAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns zeros when directory does not exist', async () => {
    const result = await prunePortfiles(path.join(tmpDir, 'nonexistent'));
    expect(result).toEqual({ scanned: 0, pruned: 0, kept: 0 });
  });

  it('returns zeros when directory is empty', async () => {
    const result = await prunePortfiles(tmpDir);
    expect(result).toEqual({ scanned: 0, pruned: 0, kept: 0 });
  });

  it('deletes malformed portfile (invalid JSON)', async () => {
    await writeFile(path.join(tmpDir, 'bad.port'), 'not json', 'utf-8');
    vi.mocked(isProcessAlive).mockReturnValue(true);

    const result = await prunePortfiles(tmpDir);

    expect(result).toEqual({ scanned: 1, pruned: 1, kept: 0 });
    expect(await readdir(tmpDir)).toHaveLength(0);
  });

  it('deletes portfile with invalid port field', async () => {
    await writeFile(path.join(tmpDir, '1234.port'), JSON.stringify({ port: 'not-a-number', pid: 1234 }), 'utf-8');
    vi.mocked(isProcessAlive).mockReturnValue(true);

    const result = await prunePortfiles(tmpDir);

    expect(result).toEqual({ scanned: 1, pruned: 1, kept: 0 });
  });

  it('deletes portfile when PID is dead, even if port could respond', async () => {
    const pid = 99998;
    await writeFile(path.join(tmpDir, `${pid}.port`), makePortfile(13721, pid), 'utf-8');
    vi.mocked(isProcessAlive).mockReturnValue(false);

    const result = await prunePortfiles(tmpDir);

    expect(result).toEqual({ scanned: 1, pruned: 1, kept: 0 });
    // File must be deleted
    expect(await readdir(tmpDir)).toHaveLength(0);
  });

  it('prunes 4 dead-PID portfiles sharing the same port, leaves none kept (HTTP unavailable)', async () => {
    // Reproduces the reported bug: 5 portfiles all with port=13721,
    // 4 with dead PIDs. Old logic kept all 5; new logic should prune the 4 dead ones.
    const deadPids = [11111, 22222, 33333, 44444];
    for (const pid of deadPids) {
      await writeFile(path.join(tmpDir, `${pid}.port`), makePortfile(13721, pid), 'utf-8');
    }

    vi.mocked(isProcessAlive).mockImplementation((pid: number) => deadPids.indexOf(pid) === -1);

    const result = await prunePortfiles(tmpDir);

    expect(result.scanned).toBe(4);
    expect(result.pruned).toBe(4);
    expect(result.kept).toBe(0);
    expect(await readdir(tmpDir)).toHaveLength(0);
  });

  it('keeps portfile when PID is alive and HTTP probe succeeds', async () => {
    const pid = 55555;
    await writeFile(path.join(tmpDir, `${pid}.port`), makePortfile(13721, pid), 'utf-8');

    vi.mocked(isProcessAlive).mockReturnValue(true);

    // Mock global fetch to simulate a live /ready response
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const result = await prunePortfiles(tmpDir);

    expect(result).toEqual({ scanned: 1, pruned: 0, kept: 1 });
    expect(await readdir(tmpDir)).toHaveLength(1);

    fetchSpy.mockRestore();
  });

  it('deletes portfile when PID is alive but HTTP probe fails', async () => {
    const pid = 66666;
    await writeFile(path.join(tmpDir, `${pid}.port`), makePortfile(13721, pid), 'utf-8');

    vi.mocked(isProcessAlive).mockReturnValue(true);

    // Mock global fetch to simulate connection refused
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await prunePortfiles(tmpDir);

    expect(result).toEqual({ scanned: 1, pruned: 1, kept: 0 });
    expect(await readdir(tmpDir)).toHaveLength(0);

    fetchSpy.mockRestore();
  });

  it('ignores non-.port files in directory', async () => {
    await writeFile(path.join(tmpDir, 'readme.txt'), 'hello', 'utf-8');
    await writeFile(path.join(tmpDir, 'registry.json'), '{}', 'utf-8');
    vi.mocked(isProcessAlive).mockReturnValue(false);

    const result = await prunePortfiles(tmpDir);

    expect(result).toEqual({ scanned: 0, pruned: 0, kept: 0 });
    // Non-port files must be untouched
    expect(await readdir(tmpDir)).toHaveLength(2);
  });
});
