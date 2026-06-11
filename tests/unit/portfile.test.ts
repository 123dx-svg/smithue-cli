import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverPort, SmithUEError } from '../../src/portfile.js';

// ---------------------------------------------------------------------------
// Mock fs/promises and fetch
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('../../src/proc.js', () => ({
  isProcessAlive: vi.fn(),
}));

import * as fsp from 'fs/promises';
import * as proc from '../../src/proc.js';
const mockReaddir = vi.mocked(fsp.readdir);
const mockReadFile = vi.mocked(fsp.readFile);
const mockUnlink = vi.mocked(fsp.unlink);
const mockIsProcessAlive = vi.mocked(proc.isProcessAlive);

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Portfile fixtures
// ---------------------------------------------------------------------------

const pf1 = {
  port: 13721,
  pid: 1001,
  project: 'C:/Projects/GameA/GameA.uproject',
  project_name: 'GameA',
  started_at: '2024-01-01T00:00:00Z',
  plugin_version: '0.7.0',
};

const pf2 = {
  port: 13722,
  pid: 1002,
  project: 'C:/Projects/GameB/GameB.uproject',
  project_name: 'GameB',
  started_at: '2024-01-01T00:00:00Z',
  plugin_version: '0.7.0',
};

const pfWithoutPluginVersion = {
  port: 13723,
  pid: 1003,
  project: 'C:/Projects/GameC/GameC.uproject',
  project_name: 'GameC',
  started_at: '2024-01-01T00:00:00Z',
};

function okResponse() {
  return { status: 200, ok: true };
}

function setupSinglePortfile(data = pf1) {
  mockReaddir.mockResolvedValue([`${data.pid}.port`] as unknown as ReturnType<typeof fsp.readdir> extends Promise<infer T> ? T : never);
  mockReadFile.mockResolvedValue(JSON.stringify(data) as unknown as ReturnType<typeof fsp.readFile> extends Promise<infer T> ? T : never);
  mockFetch.mockResolvedValue(okResponse());
}

function setupTwoPortfiles() {
  mockReaddir.mockResolvedValue(['1001.port', '1002.port'] as unknown as ReturnType<typeof fsp.readdir> extends Promise<infer T> ? T : never);
  mockReadFile
    .mockResolvedValueOnce(JSON.stringify(pf1) as unknown as ReturnType<typeof fsp.readFile> extends Promise<infer T> ? T : never)
    .mockResolvedValueOnce(JSON.stringify(pf2) as unknown as ReturnType<typeof fsp.readFile> extends Promise<infer T> ? T : never);
  mockFetch.mockResolvedValue(okResponse());
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env['LOCALAPPDATA'] = 'C:/Users/test/AppData/Local';
  delete process.env['SMITHUE_PORT'];
  delete process.env['SMITHUE_PID'];
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('discoverPort', () => {
  // ── SMITHUE_PORT override ─────────────────────────────────────────────────
  describe('SMITHUE_PORT env override', () => {
    it('returns port from env without reading portfiles', async () => {
      process.env['SMITHUE_PORT'] = '19999';
      const result = await discoverPort({});
      expect(result).toEqual({ port: 19999, pid: 0, project: '', project_name: '' });
      expect(mockReaddir).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws when SMITHUE_PORT is not a valid number', async () => {
      process.env['SMITHUE_PORT'] = 'abc';
      await expect(discoverPort({})).rejects.toMatchObject({
        exitCode: 1,
      });
    });
  });

  // ── Single portfile happy path ────────────────────────────────────────────
  describe('single portfile happy path', () => {
    it('returns port info and calls /ready on 127.0.0.1', async () => {
      setupSinglePortfile();
      const result = await discoverPort({});
      expect(result).toEqual({
        port: pf1.port,
        pid: pf1.pid,
        project: pf1.project,
        project_name: pf1.project_name,
        plugin_version: pf1.plugin_version,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        `http://127.0.0.1:${pf1.port}/ready`,
        expect.objectContaining({ signal: expect.anything() }),
      );
    });

    // NOTE: this test also covers legacy plugin compatibility — old plugins that
    // never write plugin_version to their portfile are handled gracefully here.
    it('returns undefined plugin_version when missing from portfile data', async () => {
      setupSinglePortfile(pfWithoutPluginVersion as typeof pf1);
      const result = await discoverPort({});
      expect(result).toEqual({
        port: pfWithoutPluginVersion.port,
        pid: pfWithoutPluginVersion.pid,
        project: pfWithoutPluginVersion.project,
        project_name: pfWithoutPluginVersion.project_name,
        plugin_version: undefined,
      });
    });

    it('never uses localhost in liveness URL', async () => {
      setupSinglePortfile();
      await discoverPort({});
      const url: string = mockFetch.mock.calls[0]![0];
      expect(url).not.toContain('localhost');
      expect(url).toContain('127.0.0.1');
    });
  });

  // ── Stale portfile cleanup ────────────────────────────────────────────────
  describe('stale portfile', () => {
    it('unlinks portfile and throws SmithUEError exitCode 2 when fetch throws', async () => {
      setupSinglePortfile();
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(discoverPort({})).rejects.toMatchObject({
        name: 'SmithUEError',
        exitCode: 2,
      });
      expect(mockUnlink).toHaveBeenCalledOnce();
    });

    it('treats non-200 HTTP response (e.g. 503 startup) as alive — resolves without unlinking', async () => {
      setupSinglePortfile();
      mockFetch.mockResolvedValue({ status: 503, ok: false });

      await expect(discoverPort({})).resolves.toMatchObject({ port: 13721 });
      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  // ── Multi-instance error ──────────────────────────────────────────────────
  describe('multi-instance (2 portfiles, no filter)', () => {
    it('throws SmithUEError exitCode 1 with PID and project_name in message', async () => {
      setupTwoPortfiles();

      const err = await discoverPort({}).catch((e) => e);
      expect(err).toBeInstanceOf(SmithUEError);
      expect(err.exitCode).toBe(1);
      expect(err.message).toContain('1001');
      expect(err.message).toContain('GameA');
      expect(err.message).toContain('1002');
      expect(err.message).toContain('GameB');
    });
  });

  // ── --pid filter ─────────────────────────────────────────────────────────
  describe('--pid filter', () => {
    it('selects the instance with matching PID', async () => {
      setupTwoPortfiles();
      mockFetch.mockResolvedValue(okResponse());

      const result = await discoverPort({ pid: 1002 });
      expect(result.pid).toBe(1002);
      expect(result.port).toBe(pf2.port);
    });

    it('throws exitCode 2 when no portfile matches PID', async () => {
      setupTwoPortfiles();
      await expect(discoverPort({ pid: 9999 })).rejects.toMatchObject({
        exitCode: 2,
      });
    });
  });

  // ── SMITHUE_PID env filter ────────────────────────────────────────────────
  describe('SMITHUE_PID env filter', () => {
    it('filters by PID from env', async () => {
      setupTwoPortfiles();
      mockFetch.mockResolvedValue(okResponse());
      process.env['SMITHUE_PID'] = '1001';

      const result = await discoverPort({});
      expect(result.pid).toBe(1001);
    });

    it('--pid flag takes precedence over SMITHUE_PID env', async () => {
      setupTwoPortfiles();
      mockFetch.mockResolvedValue(okResponse());
      process.env['SMITHUE_PID'] = '1001';

      const result = await discoverPort({ pid: 1002 });
      expect(result.pid).toBe(1002);
    });
  });

  // ── --project exact match ─────────────────────────────────────────────────
  describe('--project exact match', () => {
    it('selects instance by exact project path', async () => {
      setupTwoPortfiles();
      mockFetch.mockResolvedValue(okResponse());

      const result = await discoverPort({ project: pf2.project });
      expect(result.project).toBe(pf2.project);
      expect(result.pid).toBe(pf2.pid);
    });

    it('does NOT match on substring', async () => {
      setupTwoPortfiles();
      await expect(discoverPort({ project: 'GameB' })).rejects.toMatchObject({
        exitCode: 2,
      });
    });

    it('throws exitCode 2 when no portfile matches project', async () => {
      setupSinglePortfile();
      await expect(
        discoverPort({ project: 'C:/Projects/GameX/GameX.uproject' }),
      ).rejects.toMatchObject({ exitCode: 2 });
    });
  });

  // ── LOCALAPPDATA missing ──────────────────────────────────────────────────
  describe('LOCALAPPDATA missing', () => {
    it('throws SmithUEError exitCode 2 when LOCALAPPDATA not set', async () => {
      delete process.env['LOCALAPPDATA'];
      await expect(discoverPort({})).rejects.toMatchObject({
        name: 'SmithUEError',
        exitCode: 2,
      });
    });
  });

  // ── No portfiles found ────────────────────────────────────────────────────
  describe('no portfiles found', () => {
    it('throws SmithUEError exitCode 2 with helpful message', async () => {
      mockReaddir.mockResolvedValue([] as unknown as ReturnType<typeof fsp.readdir> extends Promise<infer T> ? T : never);
      const err = await discoverPort({}).catch((e) => e);
      expect(err).toBeInstanceOf(SmithUEError);
      expect(err.exitCode).toBe(2);
      expect(err.message.toLowerCase()).toContain('no smithue');
    });
  });

  // ── Legacy plugin compatibility ──────────────────────────────────────────
  describe('legacy plugin compatibility', () => {
    it('portfile without plugin_version resolves successfully (legacy plugin)', async () => {
      // Setup portfile without plugin_version field
      const legacyPortfile = {
        port: 13724,
        pid: 2001,
        project: 'C:/Projects/Legacy/Legacy.uproject',
        project_name: 'LegacyGame',
        started_at: '2024-01-01T00:00:00Z',
        // no plugin_version!
      };
      mockReaddir.mockResolvedValue(['2001.port'] as any);
      mockReadFile.mockResolvedValue(JSON.stringify(legacyPortfile) as any);
      mockFetch.mockResolvedValue({ status: 200, ok: true });

      const result = await discoverPort({});
      expect(result.port).toBe(13724);
      expect(result.pid).toBe(2001);
      expect(result.plugin_version).toBeUndefined(); // graceful — no crash
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('old plugin that responds to /ready works normally', async () => {
      // Old plugin without heartbeat still responds to /ready
      setupSinglePortfile(); // uses pf1 with plugin_version
      mockFetch.mockResolvedValue({ status: 200, ok: true }); // old /ready behavior

      const result = await discoverPort({});
      expect(result.port).toBe(pf1.port);
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('SMITHUE_PORT env override bypasses portfile discovery entirely', async () => {
      process.env['SMITHUE_PORT'] = '9999';
      const result = await discoverPort({});
      expect(result.port).toBe(9999);
      expect(result.pid).toBe(0); // no pid from portfile
      expect(mockReaddir).not.toHaveBeenCalled(); // no portfile read
    });
  });

  // ── New stale policy (RED — will turn GREEN in task 8) ───────────────────
  describe('new stale policy (RED — will turn GREEN in task 8)', () => {
    it('AbortError (timeout) + pid alive → does NOT unlink portfile', async () => {
      setupSinglePortfile();
      mockIsProcessAlive.mockReturnValue(true);
      const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      mockFetch.mockRejectedValue(abortErr);

      // discoverPort should NOT call unlink even if /ready times out
      await discoverPort({}).catch(() => {});
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('ECONNREFUSED + pid dead → unlinks portfile and throws SmithUEError exitCode 2', async () => {
      setupSinglePortfile();
      mockIsProcessAlive.mockReturnValue(false);
      mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:13721'));

      await expect(discoverPort({})).rejects.toMatchObject({ name: 'SmithUEError', exitCode: 2 });
      expect(mockUnlink).toHaveBeenCalledOnce();
    });

    it('ECONNREFUSED + pid alive → does NOT unlink portfile', async () => {
      setupSinglePortfile();
      mockIsProcessAlive.mockReturnValue(true);
      mockFetch.mockRejectedValue(new Error('fetch failed - ECONNREFUSED'));

      await discoverPort({}).catch(() => {});
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('malformed portfile JSON → does not crash, throws SmithUEError not TypeError', async () => {
      mockReaddir.mockResolvedValue(['1001.port'] as unknown as any);
      mockReadFile.mockResolvedValue('not-valid-json{' as unknown as any);

      const err = await discoverPort({}).catch(e => e);
      // Should throw SmithUEError (no portfiles found) NOT an uncaught TypeError
      expect(err).toBeInstanceOf(SmithUEError);
      expect(err).not.toBeInstanceOf(TypeError);
    });
  });
});
