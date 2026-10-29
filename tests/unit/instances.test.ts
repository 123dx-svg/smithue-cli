import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listInstances } from '../../src/commands/instances.js';
import { isProcessAlive } from '../../src/proc.js';

vi.mock('../../src/proc.js', () => ({ isProcessAlive: vi.fn() }));

let root: string;
let directory: string;
let fetchSpy: ReturnType<typeof vi.spyOn>;

async function addInstance(pid: number) {
  await writeFile(join(directory, `${pid}.port`), JSON.stringify({
    pid, port: pid + 10000, project: `C:/Projects/${pid}.uproject`, project_name: String(pid),
    started_at: '2026-10-29T00:00:00Z', plugin_version: '1.15.0', instance_id: `instance-${pid}`,
  }));
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'smithue-instances-'));
  directory = join(root, '.smithue');
  await mkdir(directory);
  vi.stubEnv('LOCALAPPDATA', root);
  vi.mocked(isProcessAlive).mockReturnValue(true);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const port = Number(new URL(String(url)).port);
    return new Response(JSON.stringify({ pid: port - 10000, instance_id: `instance-${port - 10000}`, ready: true }));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

it('reports zero when no editors were discovered', async () => {
  await expect(listInstances()).resolves.toMatchObject({ discovered_count: 0, online_count: 0, ready_count: 0, instances: [] });
});

it('verifies each editor and reports an exact online and ready count', async () => {
  await addInstance(1001);
  await addInstance(1002);
  const result = await listInstances();
  expect(result.online_count).toBe(2);
  expect(result.ready_count).toBe(2);
  expect(result.instances.map((instance) => instance.pid)).toEqual([1001, 1002]);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

it('does not count a crashed process with a stale portfile as online', async () => {
  await addInstance(1001);
  vi.mocked(isProcessAlive).mockReturnValue(false);
  const result = await listInstances();
  expect(result.online_count).toBe(0);
  expect(result.instances[0]?.state).toBe('stale');
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(await readdir(directory)).toEqual(['1001.port']);
});

it('does not count a recycled port with a different process as online', async () => {
  await addInstance(1001);
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ pid: 1002, ready: true })));
  const result = await listInstances();
  expect(result.online_count).toBe(0);
  expect(result.instances[0]?.state).toBe('identity_mismatch');
});

it('reports legacy endpoints as unverified, not ready editors', async () => {
  await addInstance(1001);
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ready: true })));
  const result = await listInstances();
  expect(result.online_count).toBe(0);
  expect(result.instances[0]?.state).toBe('unverified');
});

it('separates starting editors from ready editors', async () => {
  await addInstance(1001);
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ pid: 1001, instance_id: 'instance-1001', ready: false }), { status: 503 }));
  const result = await listInstances();
  expect(result.online_count).toBe(1);
  expect(result.ready_count).toBe(0);
  expect(result.instances[0]?.state).toBe('starting');
});

it('reports an unreachable live process without deleting its record', async () => {
  await addInstance(1001);
  fetchSpy.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
  const result = await listInstances(10);
  expect(result.online_count).toBe(0);
  expect(result.instances[0]).toMatchObject({ state: 'unreachable', process_alive: true });
  expect(await readdir(directory)).toEqual(['1001.port']);
});

it('ignores malformed or invalid portfile records safely', async () => {
  await writeFile(join(directory, 'bad.port'), 'null');
  await writeFile(join(directory, 'invalid.port'), JSON.stringify({ pid: '1001', port: -1 }));
  await expect(listInstances()).resolves.toMatchObject({ discovered_count: 0 });
});

it('rejects invalid probe timeouts', async () => {
  await expect(listInstances(0)).rejects.toMatchObject({ exitCode: 1 });
});

it('marks a PID-only endpoint as unverified without a stable instance identifier', async () => {
  await addInstance(1001);
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ pid: 1001, ready: true })));
  const result = await listInstances();
  expect(result.online_count).toBe(0);
  expect(result.instances[0]?.state).toBe('unverified');
});

it('detects an instance restart with the same PID and port', async () => {
  await addInstance(1001);
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ pid: 1001, ready: true, instance_id: 'restarted' })));
  const result = await listInstances();
  expect(result.online_count).toBe(0);
  expect(result.instances[0]?.state).toBe('identity_mismatch');
});