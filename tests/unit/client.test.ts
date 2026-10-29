import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmithUEClient } from '../../src/client.js';
import { SmithUEError } from '../../src/portfile.js';

const PORT = 13721;
const HOST = '127.0.0.1';

function makeClient() {
  return new SmithUEClient({ host: HOST, port: PORT, timeout: 5000 });
}

function mockFetch(responseBody: unknown, status = 200) {
  return vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('SmithUEClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('target identity preflight', () => {
    it('rejects a restarted instance even when PID and port are unchanged', async () => {
      const spy = mockFetch({ ready: true, pid: 1001, instance_id: 'new-instance' });
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001, expectedInstanceId: 'old-instance' });
      await expect(client.executeCommand('delete_asset')).rejects.toThrow('instance identity mismatch');
      expect(spy).toHaveBeenCalledOnce();
    });

    it('includes receiver-side PID and instance guards on the actual command', async () => {
      const spy = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true, pid: 1001, instance_id: 'instance-a' })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success', data: {} })));
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001 });
      await client.executeCommand('ping');
      expect(spy.mock.calls[1]?.[1]?.headers).toMatchObject({
        'X-SmithUE-Expected-Pid': '1001', 'X-SmithUE-Expected-Instance': 'instance-a',
      });
    });

    it('does not retry after the receiving editor rejects a stale identity', async () => {
      const spy = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true, pid: 1001, instance_id: 'instance-a' })))
        .mockResolvedValueOnce(new Response('{}', { status: 409 }));
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001 });
      await expect(client.executeCommand('delete_asset')).rejects.toMatchObject({ exitCode: 2 });
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('never resubmits a timed-out protected write as an async task', async () => {
      const spy = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true, pid: 1001, instance_id: 'instance-a' })))
        .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001 });
      await expect(client.executeWithFailover('delete_asset')).rejects.toThrow('Do NOT re-send');
      expect(spy.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    });

    it('refuses PID-only plugins that cannot reject stale requests', async () => {
      const spy = mockFetch({ ready: true, pid: 1001 });
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001 });
      await expect(client.executeCommand('delete_asset')).rejects.toThrow('does not provide an instance identifier');
      expect(spy).toHaveBeenCalledOnce();
    });

    it('sends no edit to a different process after port reuse', async () => {
      const spy = mockFetch({ ready: true, pid: 1002 });
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001 });
      await expect(client.executeCommand('delete_asset')).rejects.toMatchObject({ exitCode: 2 });
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]?.[0]).toContain('/ready');
    });

    it('sends no edit when the target has exited or crashed', async () => {
      const spy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed'));
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001 });
      await expect(client.executeCommand('delete_asset')).rejects.toThrow('unreachable');
      expect(spy).toHaveBeenCalledOnce();
    });

    it('refuses a legacy endpoint without verifiable identity', async () => {
      const spy = mockFetch({ ready: true });
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001 });
      await expect(client.executeCommand('delete_asset')).rejects.toThrow('does not provide PID identity');
      expect(spy).toHaveBeenCalledOnce();
    });

    it('does not send an edit while the target is starting', async () => {
      const spy = mockFetch({ ready: false, pid: 1001, instance_id: 'instance-a' }, 503);
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001 });
      await expect(client.executeCommand('delete_asset')).rejects.toThrow('not ready');
      expect(spy).toHaveBeenCalledOnce();
    });

    it('checks identity again before every command', async () => {
      const spy = vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true, pid: 1001, instance_id: 'instance-a' })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success', data: {} })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true, pid: 1002 })));
      const client = new SmithUEClient({ host: HOST, port: PORT, expectedPid: 1001 });
      await client.executeCommand('ping');
      await expect(client.executeCommand('delete_asset')).rejects.toThrow('identity mismatch');
      expect(spy.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    });
  });

  describe('constructor', () => {
    it('accepts {host, port, timeout} config object', () => {
      const client = makeClient();
      expect(client).toBeInstanceOf(SmithUEClient);
    });
  });

  describe('ping()', () => {
    it('POSTs to /api/v1/execute with command=ping', async () => {
      const spy = mockFetch({ status: 'success', data: { result: 'pong' } });
      const client = makeClient();
      await client.ping();

      expect(spy).toHaveBeenCalledOnce();
      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://${HOST}:${PORT}/api/v1/execute`);
      expect(JSON.parse(init.body as string)).toMatchObject({ command: 'ping', params: {} });
    });

    it('sends NO X-SmithUE-Session header', async () => {
      const spy = mockFetch({ status: 'success', data: { result: 'pong' } });
      const client = makeClient();
      await client.ping();

      const [, init] = spy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['X-SmithUE-Session']).toBeUndefined();
      expect(Object.keys(headers).map(k => k.toLowerCase())).not.toContain('x-smithue-session');
    });

    it('uses 127.0.0.1 not localhost', async () => {
      const spy = mockFetch({ status: 'success', data: { result: 'pong' } });
      const client = makeClient();
      await client.ping();

      const [url] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('127.0.0.1');
      expect(url).not.toContain('localhost');
    });
  });

  describe('listTools()', () => {
    const toolsResponse = {
      status: 'success',
      data: {
        domain: 'editor',
        tools: [{ name: 'test_tool', description: 'A tool', params: {} }],
      },
    };

    it('sends NO X-SmithUE-Session header', async () => {
      const spy = mockFetch({ status: 'success', data: { domains: [] } });
      const client = makeClient();
      await client.listTools();

      const [, init] = spy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['X-SmithUE-Session']).toBeUndefined();
    });

    it('returns the tools array when domain provided', async () => {
      mockFetch(toolsResponse);
      const client = makeClient();
      const tools = await client.listTools('editor');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
    });

    it('returns all tools when no category provided', async () => {
      mockFetch({
        status: 'success',
        data: {
          protocol_version: '1.0',
          tools: [
            { name: 'ping', category: 'System', description: 'Test', params: [] },
            { name: 'get_project_info', category: 'Project', description: 'Info', params: [] },
          ],
        },
      });
      const client = makeClient();
      const tools = await client.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('ping');
    });

    it('uses 127.0.0.1 not localhost', async () => {
      const spy = mockFetch({ status: 'success', data: { domains: [] } });
      const client = makeClient();
      await client.listTools();

      const [url] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain('localhost');
      expect(url).toContain('127.0.0.1');
    });

    it('passes category param when provided', async () => {
      const spy = mockFetch(toolsResponse);
      const client = makeClient();
      await client.listTools('editor');

      const [, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toMatchObject({ params: { category: 'editor' } });
    });
  });

  describe('executeCommand()', () => {
    it('sends NO X-SmithUE-Session header', async () => {
      const spy = mockFetch({ status: 'success', data: {} });
      const client = makeClient();
      await client.executeCommand('ping', {});

      const [, init] = spy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['X-SmithUE-Session']).toBeUndefined();
    });

    it('POSTs {command, params} to /api/v1/execute', async () => {
      const spy = mockFetch({ status: 'success', data: { ok: true } });
      const client = makeClient();
      await client.executeCommand('my_cmd', { foo: 'bar' });

      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://${HOST}:${PORT}/api/v1/execute`);
      expect(JSON.parse(init.body as string)).toEqual({ command: 'my_cmd', params: { foo: 'bar' } });
    });

    it('maps error_code STALE_NID to SmithUEError exitCode 5', async () => {
      mockFetch({ status: 'error', error: 'stale', error_code: 'STALE_NID' });
      const client = makeClient();
      const promise = client.executeCommand('my_cmd', {});

      await expect(promise).rejects.toBeInstanceOf(SmithUEError);
      await expect(promise).rejects.toMatchObject({ exitCode: 5 });
    });
  });

  describe('getReady()', () => {
    it('GETs /ready and returns parsed JSON', async () => {
      const readyPayload = { ready: true, version: '1.2.3', pie_active: false };
      const spy = mockFetch(readyPayload);
      const client = makeClient();
      const result = await client.getReady();

      expect(spy).toHaveBeenCalledOnce();
      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://${HOST}:${PORT}/ready`);
      expect((init.method as string).toUpperCase()).toBe('GET');
      expect(result).toEqual(readyPayload);
    });

    it('uses 127.0.0.1 not localhost', async () => {
      const spy = mockFetch({ ready: true });
      const client = makeClient();
      await client.getReady();

      const [url] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('127.0.0.1');
      expect(url).not.toContain('localhost');
    });

    it('sends NO X-SmithUE-Session header', async () => {
      const spy = mockFetch({ ready: true });
      const client = makeClient();
      await client.getReady();

      const [, init] = spy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['X-SmithUE-Session']).toBeUndefined();
    });
  });

  describe('error taxonomy (RED — will turn GREEN in task 9)', () => {
    it('AbortError produces message containing "timed out"', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      vi.spyOn(global, 'fetch').mockRejectedValue(abortErr);
      const client = makeClient();
      const err = await client.execute('ping').catch(e => e as Error);
      expect(err.message.toLowerCase()).toContain('timed out');
    });

    it('ECONNREFUSED produces message containing "unreachable"', async () => {
      const connErr = new Error('connect ECONNREFUSED 127.0.0.1:13721');
      vi.spyOn(global, 'fetch').mockRejectedValue(connErr);
      const client = makeClient();
      const err = await client.execute('ping').catch(e => e as Error);
      expect(err.message.toLowerCase()).toContain('unreachable');
    });

    it('timeout and refused produce distinct error messages', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      vi.spyOn(global, 'fetch').mockRejectedValue(abortErr);
      const client = makeClient();
      const timeoutMsg = await client.execute('ping').catch(e => (e as Error).message);

      vi.restoreAllMocks();

      const connErr = new Error('ECONNREFUSED');
      vi.spyOn(global, 'fetch').mockRejectedValue(connErr);
      const refusedMsg = await client.execute('ping').catch(e => (e as Error).message);

      expect(timeoutMsg).not.toBe(refusedMsg);
      expect(typeof timeoutMsg).toBe('string');
      expect(typeof refusedMsg).toBe('string');
    });

    it('fetch failed with AbortError name is classified as timed-out not unreachable', async () => {
      const err = Object.assign(new Error('fetch failed'), { name: 'AbortError' });
      vi.spyOn(global, 'fetch').mockRejectedValue(err);
      const client = makeClient();
      const result = await client.execute('ping').catch(e => e as Error);
      expect(result.message.toLowerCase()).toContain('timed out');
      expect(result.message.toLowerCase()).not.toContain('unreachable');
    });
  });
});
