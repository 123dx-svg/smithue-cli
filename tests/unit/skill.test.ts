import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  cp: vi.fn(),
}));

vi.mock('../../src/output.js', () => ({
  printResult: vi.fn(),
  printError: vi.fn(),
}));

import { readFile, mkdir, cp } from 'node:fs/promises';
import * as output from '../../src/output.js';
import { skillCommand } from '../../src/commands/skill.js';

const mockReadFile = vi.mocked(readFile);
const mockMkdir = vi.mocked(mkdir);
const mockCp = vi.mocked(cp);
const mockPrintResult = vi.mocked(output.printResult);
const mockPrintError = vi.mocked(output.printError);

describe('skillCommand', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as never);
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrintError.mockImplementation((err: unknown) => {
      if (err instanceof Error && 'exitCode' in err) {
        process.exit((err as { exitCode: number }).exitCode);
      }
      process.exit(4);
    });
  });

  afterEach(() => {
    exitSpy.mockClear();
    stdoutSpy.mockClear();
  });

  it('errors with exit 1 when no args are provided', async () => {
    await expect(skillCommand({})).rejects.toThrow('process.exit:1');

    expect(mockPrintError).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 1 }));
  });

  it('prints bundled SKILL.md to stdout with --print', async () => {
    mockReadFile.mockResolvedValueOnce('sample skill content');

    await skillCommand({ print: true });

    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(mockCp).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith('sample skill content');
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('installs the WHOLE skill bundle (SKILL.md + reference/ + scripts/) with --install', async () => {
    mockReadFile.mockResolvedValueOnce('sample skill content'); // SKILL.md sentinel
    mockMkdir.mockResolvedValueOnce(undefined);
    mockCp.mockResolvedValueOnce(undefined);

    await skillCommand({ install: 'C:/tmp/agent' });

    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('agent'), { recursive: true });
    // Recursively copies the whole bundle dir, not just SKILL.md.
    expect(mockCp).toHaveBeenCalledWith(
      expect.stringMatching(/skill$/),
      expect.stringContaining('agent'),
      { recursive: true },
    );
    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('errors with exit 4 when SKILL.md is missing', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    await expect(skillCommand({ print: true })).rejects.toThrow('process.exit:4');

    expect(mockPrintError).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 4 }));
  });
});
