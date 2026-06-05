import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock fs/promises
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  lstat: vi.fn(),
  unlink: vi.fn(),
  rmdir: vi.fn(),
}));

import * as fsp from 'fs/promises';
const mockReaddir = vi.mocked(fsp.readdir);
const mockReadFile = vi.mocked(fsp.readFile);
const mockLstat = vi.mocked(fsp.lstat);
const mockUnlink = vi.mocked(fsp.unlink);
const mockRmdir = vi.mocked(fsp.rmdir);

// ---------------------------------------------------------------------------
// Mock output
// ---------------------------------------------------------------------------

vi.mock('../../src/output.js', () => ({
  printResult: vi.fn(),
  printError: vi.fn().mockImplementation(() => { throw new Error('printError called'); }),
}));

import * as output from '../../src/output.js';
const mockPrintResult = vi.mocked(output.printResult);
const mockPrintError = vi.mocked(output.printError);

// ---------------------------------------------------------------------------
// Mock readline
// ---------------------------------------------------------------------------

const mockQuestion = vi.fn();
const mockClose = vi.fn();
const mockRlInterface = { question: mockQuestion, close: mockClose };

vi.mock('readline', () => ({
  default: { createInterface: vi.fn(() => mockRlInterface) },
  createInterface: vi.fn(() => mockRlInterface),
}));

import * as rl from 'readline';
const mockCreateInterface = vi.mocked(rl.createInterface);

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import purge (does not exist yet — RED phase)
// ---------------------------------------------------------------------------

import { purge } from '../../src/commands/purge.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_APPDATA = 'C:/Users/test/AppData/Local';
const FAKE_DIR = `${FAKE_APPDATA}/.smithue`;

const portfile1 = { port: 13721, pid: 1001, project: 'C:/A/A.uproject', project_name: 'A', started_at: '2024-01-01T00:00:00Z', plugin_version: '0.7.0' };
const portfile2 = { port: 13722, pid: 1002, project: 'C:/B/B.uproject', project_name: 'B', started_at: '2024-01-01T00:00:00Z', plugin_version: '0.7.0' };
const portfile3 = { port: 13723, pid: 1003, project: 'C:/C/C.uproject', project_name: 'C', started_at: '2024-01-01T00:00:00Z', plugin_version: '0.7.0' };

type FakeStat = { isSymbolicLink: () => boolean };
function fakeStat(isSymlink = false): FakeStat {
  return { isSymbolicLink: () => isSymlink };
}

function setupPortfiles(portfiles: typeof portfile1[], filenames?: string[]) {
  const names = filenames ?? portfiles.map((p) => `${p.pid}.port`);
  mockReaddir.mockResolvedValue(names as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
  let call = mockReadFile as ReturnType<typeof vi.fn>;
  for (const pf of portfiles) {
    call = call.mockResolvedValueOnce(JSON.stringify(pf) as unknown as Awaited<ReturnType<typeof fsp.readFile>>);
  }
}

function setupYesPrompt() {
  mockQuestion.mockImplementation((_msg: string, cb: (ans: string) => void) => cb('y'));
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

const originalEnv = process.env;
let originalIsTTY: boolean | undefined;

beforeEach(() => {
  process.env = { ...originalEnv, LOCALAPPDATA: FAKE_APPDATA };
  originalIsTTY = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true, configurable: true });
  vi.clearAllMocks();
  // Re-apply persistent mocks cleared by clearAllMocks
  mockPrintError.mockImplementation(() => { throw new Error('printError called'); });
  mockLstat.mockResolvedValue(fakeStat(false) as unknown as Awaited<ReturnType<typeof fsp.lstat>>);
  mockRmdir.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
  mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
  mockCreateInterface.mockReturnValue(mockRlInterface as unknown as ReturnType<typeof rl.createInterface>);
});

afterEach(() => {
  process.env = originalEnv;
  Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, writable: true, configurable: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('purge', () => {
  // Test 1: Happy path — 2 dead + 1 live → partial
  it('1. marks 2 dead portfiles deleted and 1 live portfile skipped (partial)', async () => {
    setupPortfiles([portfile1, portfile2, portfile3]);
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ status: 200, ok: true });
    // Empty dir after partial delete (some live remain)
    mockReaddir.mockResolvedValueOnce(['1001.port', '1002.port', '1003.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>)
               .mockResolvedValueOnce(['1003.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>); // re-check after delete

    await purge({ force: false, dryRun: false, yes: true });

    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({
      status: 'partial',
      deleted: 2,
      skipped_live: 1,
      directory_removed: false,
    }));
  });

  // Test 2: All dead → full purge, directory removed
  it('2. purges all dead portfiles and removes directory', async () => {
    setupPortfiles([portfile1, portfile2, portfile3]);
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    mockReaddir
      .mockResolvedValueOnce(['1001.port', '1002.port', '1003.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>)
      .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof fsp.readdir>>); // empty after delete

    await purge({ force: false, dryRun: false, yes: true });

    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({
      status: 'purged',
      deleted: 3,
      directory_removed: true,
    }));
    expect(mockRmdir).toHaveBeenCalled();
  });

  // Test 3: --force skips fetch entirely
  it('3. --force skips liveness check (fetch never called)', async () => {
    setupPortfiles([portfile1, portfile2, portfile3]);
    mockReaddir
      .mockResolvedValueOnce(['1001.port', '1002.port', '1003.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>)
      .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);

    await purge({ force: true, dryRun: false, yes: true });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenCalledTimes(3);
  });

  // Test 4: --dry-run does not delete
  it('4. --dry-run reports what would be deleted without modifying anything', async () => {
    setupPortfiles([portfile1, portfile2]);
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    mockReaddir.mockResolvedValueOnce(['1001.port', '1002.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);

    await purge({ force: false, dryRun: true, yes: true });

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockRmdir).not.toHaveBeenCalled();
    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'dry_run' }));
  });

  // Test 5: -y skips prompt even in non-TTY
  it('5. yes:true skips readline prompt in non-TTY context', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });
    setupPortfiles([portfile1]);
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    mockReaddir
      .mockResolvedValueOnce(['1001.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>)
      .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);

    await purge({ force: false, dryRun: false, yes: true });

    expect(mockCreateInterface).not.toHaveBeenCalled();
    expect(mockPrintResult).toHaveBeenCalled();
  });

  // Test 6: Non-TTY without -y → exit 1
  it('6. non-TTY without -y calls printError with exitCode 1', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });
    setupPortfiles([portfile1]);
    mockReaddir.mockResolvedValueOnce(['1001.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);

    await expect(purge({ force: false, dryRun: false, yes: false })).rejects.toThrow('printError called');

    expect(mockPrintError).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 1 }));
  });

  // Test 7: User answers N → cancelled
  it('7. user answers N at prompt → status:cancelled, nothing deleted', async () => {
    setupPortfiles([portfile1]);
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    mockReaddir.mockResolvedValueOnce(['1001.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    mockQuestion.mockImplementation((_msg: string, cb: (ans: string) => void) => cb('n'));
    mockCreateInterface.mockReturnValue(mockRlInterface as unknown as ReturnType<typeof rl.createInterface>);

    await purge({ force: false, dryRun: false, yes: false });

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled', deleted: 0 }));
  });

  // Test 8: Directory missing → nothing_to_purge
  it('8. lstat ENOENT → status:nothing_to_purge, no further operations', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockLstat.mockRejectedValue(enoent);

    await purge({ force: false, dryRun: false, yes: true });

    expect(mockReaddir).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'nothing_to_purge' }));
  });

  // Test 9: Symlink/junction → exit 3
  it('9. lstat returns symlink → printError exitCode 3 mentioning symlink', async () => {
    mockLstat.mockResolvedValue(fakeStat(true) as unknown as Awaited<ReturnType<typeof fsp.lstat>>);

    await expect(purge({ force: false, dryRun: false, yes: true })).rejects.toThrow('printError called');

    expect(mockPrintError).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 3 }));
    const err = mockPrintError.mock.calls[0]![0] as { message: string };
    expect(err.message.toLowerCase()).toContain('symlink');
  });

  // Test 10: Foreign files without --force → port deleted, log preserved
  it('10. without --force, non-.port files are skipped and directory kept', async () => {
    mockReaddir
      .mockResolvedValueOnce(['1001.port', 'debug.log'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>)
      .mockResolvedValueOnce(['debug.log'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    mockReadFile.mockResolvedValueOnce(JSON.stringify(portfile1) as unknown as Awaited<ReturnType<typeof fsp.readFile>>);
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await purge({ force: false, dryRun: false, yes: true });

    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockRmdir).not.toHaveBeenCalled();
    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({ directory_removed: false }));
  });

  // Test 11: Foreign files with --force → both deleted, directory removed
  it('11. with --force, all files including unknown are deleted and directory removed', async () => {
    mockReaddir
      .mockResolvedValueOnce(['1001.port', 'debug.log'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>)
      .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    mockReadFile.mockResolvedValueOnce(JSON.stringify(portfile1) as unknown as Awaited<ReturnType<typeof fsp.readFile>>);

    await purge({ force: true, dryRun: false, yes: true });

    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(mockRmdir).toHaveBeenCalled();
    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({ directory_removed: true }));
  });

  // Test 12: EACCES on one file → best-effort, exit 0
  it('12. unlink EACCES on one file → failed:1 in result, exit 0 (best-effort)', async () => {
    setupPortfiles([portfile1, portfile2, portfile3]);
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    mockReaddir
      .mockResolvedValueOnce(['1001.port', '1002.port', '1003.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>)
      .mockResolvedValueOnce(['1002.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    mockUnlink
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }))
      .mockResolvedValueOnce(undefined);

    await purge({ force: false, dryRun: false, yes: true });

    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({
      failed: 1,
      errors: expect.arrayContaining([expect.stringContaining('EACCES')]),
    }));
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  // Test 13: Missing LOCALAPPDATA → exit 2
  it('13. missing LOCALAPPDATA env → printError exitCode 2', async () => {
    delete process.env['LOCALAPPDATA'];

    await expect(purge({ force: false, dryRun: false, yes: true })).rejects.toThrow('printError called');

    expect(mockPrintError).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 2 }));
  });

  // Test 14: Confirmation prompt shows file info (TTY)
  it('14. TTY prompt question text contains enumeration of files to delete', async () => {
    setupPortfiles([portfile1, portfile2]);
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ status: 200, ok: true });
    mockReaddir
      .mockResolvedValueOnce(['1001.port', '1002.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>)
      .mockResolvedValueOnce(['1002.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    setupYesPrompt();

    await purge({ force: false, dryRun: false, yes: false });

    expect(mockQuestion).toHaveBeenCalled();
    const questionText: string = mockQuestion.mock.calls[0]![0];
    // Should mention how many files / the directory
    expect(questionText).toMatch(/\d|file|path/i);
  });

  // Test 15: stdout never contaminated — readline output goes to stderr
  it('15. readline createInterface called with output:process.stderr', async () => {
    setupPortfiles([portfile1]);
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    mockReaddir
      .mockResolvedValueOnce(['1001.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>)
      .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    setupYesPrompt();

    await purge({ force: false, dryRun: false, yes: false });

    expect(mockCreateInterface).toHaveBeenCalledWith(expect.objectContaining({
      output: process.stderr,
    }));
  });

  // Test 16: 503 startup status counts as alive (matches portfile.test.ts:142-147)
  it('16. fetch resolves with 503 → counts as alive, portfile NOT deleted', async () => {
    setupPortfiles([portfile1]);
    mockFetch.mockResolvedValueOnce({ status: 503, ok: false });
    mockReaddir.mockResolvedValueOnce(['1001.port'] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);

    await purge({ force: false, dryRun: false, yes: true });

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({
      skipped_live: 1,
      deleted: 0,
    }));
  });
});
