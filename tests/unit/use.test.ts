import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/portfile.js', () => ({
  readPortfiles: vi.fn(),
  getPortfileDir: vi.fn(),
  SmithUEError: class SmithUEError extends Error {
    exitCode: number;
    constructor(message: string, exitCode: number) {
      super(message);
      this.name = 'SmithUEError';
      this.exitCode = exitCode;
    }
  },
}));

vi.mock('../../src/registry.js', () => ({
  setPinned: vi.fn(),
  clearPinned: vi.fn(),
  getPinned: vi.fn(),
}));

vi.mock('../../src/identity.js', () => ({
  projectId: vi.fn((path: string) => `id:${path}`),
}));

vi.mock('../../src/output.js', () => ({
  printResult: vi.fn(),
  printError: vi.fn(),
}));

import { useCommand } from '../../src/commands/use.js';
import { readPortfiles, getPortfileDir, SmithUEError } from '../../src/portfile.js';
import { setPinned, clearPinned, getPinned } from '../../src/registry.js';
import { projectId } from '../../src/identity.js';
import { printResult, printError } from '../../src/output.js';

const mockReadPortfiles = vi.mocked(readPortfiles);
const mockGetPortfileDir = vi.mocked(getPortfileDir);
const mockSetPinned = vi.mocked(setPinned);
const mockClearPinned = vi.mocked(clearPinned);
const mockGetPinned = vi.mocked(getPinned);
const mockProjectId = vi.mocked(projectId);
const mockPrintResult = vi.mocked(printResult);
const mockPrintError = vi.mocked(printError);

describe('useCommand', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => code as never) as any);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPortfileDir.mockReturnValue('C:/Users/test/.smithue');
    mockReadPortfiles.mockResolvedValue([]);
    mockGetPinned.mockResolvedValue(undefined);
    exitSpy.mockClear();
  });

  it('use --clear → calls clearPinned and prints cleared result', async () => {
    await useCommand({ clear: true });

    expect(mockGetPinned).toHaveBeenCalled();
    expect(mockClearPinned).toHaveBeenCalled();
    expect(mockPrintResult).toHaveBeenCalledWith({ ok: true, action: 'cleared', pinned: null });
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('use --pid 1234 with matching portfile → pins entry', async () => {
    mockReadPortfiles.mockResolvedValue([
      {
        file: 'C:/Users/test/.smithue/a.port',
        data: {
          pid: 1234,
          port: 8080,
          project: 'C:/Proj/MyProj.uproject',
          project_name: 'MyProj',
          started_at: '2026-06-18T00:00:00.000Z',
          plugin_version: '1.0.0',
        },
      },
    ]);

    await useCommand({ pid: 1234 });

    expect(mockGetPortfileDir).toHaveBeenCalled();
    expect(mockReadPortfiles).toHaveBeenCalledWith('C:/Users/test/.smithue');
    expect(mockProjectId).toHaveBeenCalledWith('C:/Proj/MyProj.uproject');
    expect(mockSetPinned).toHaveBeenCalledWith({
      projectId: 'id:C:/Proj/MyProj.uproject',
      pid: 1234,
      port: 8080,
      project: 'C:/Proj/MyProj.uproject',
      project_name: 'MyProj',
      lastConnectedAt: expect.any(String),
    });
    expect(mockPrintResult).toHaveBeenCalledWith({
      ok: true,
      action: 'pinned',
      pinned: expect.objectContaining({ pid: 1234, port: 8080 }),
    });
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('use --pid 9999 with no match → printError with exit 2', async () => {
    mockReadPortfiles.mockResolvedValue([
      {
        file: 'C:/Users/test/.smithue/a.port',
        data: {
          pid: 1234,
          port: 8080,
          project: 'C:/Proj/MyProj.uproject',
          project_name: 'MyProj',
          started_at: '2026-06-18T00:00:00.000Z',
          plugin_version: '1.0.0',
        },
      },
    ]);

    await useCommand({ pid: 9999 });

    expect(mockPrintError).toHaveBeenCalledTimes(1);
    const err = mockPrintError.mock.calls[0]![0];
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(2);
    expect((err as Error).message).toMatch(/PID 9999/);
    expect(mockSetPinned).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('use with no args → printError with exit 1', async () => {
    await useCommand({});

    expect(mockPrintError).toHaveBeenCalledTimes(1);
    const err = mockPrintError.mock.calls[0]![0];
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(1);
    expect((err as Error).message).toMatch(/Specify --pid/i);
    expect(mockReadPortfiles).not.toHaveBeenCalled();
    expect(mockSetPinned).not.toHaveBeenCalled();
  });
});
