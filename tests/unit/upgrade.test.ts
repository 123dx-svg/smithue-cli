import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../src/output.js', () => ({
  printResult: vi.fn(),
  printError: vi.fn(),
}));

import { execSync } from 'node:child_process';
import * as output from '../../src/output.js';
import { upgradeCommand } from '../../src/commands/upgrade.js';

const mockExecSync = vi.mocked(execSync);
const mockPrintResult = vi.mocked(output.printResult);
const mockPrintError = vi.mocked(output.printError);

describe('upgradeCommand', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as never);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrintError.mockImplementation((err: unknown) => {
      process.exit(1);
      throw err;
    });
  });

  afterEach(() => {
    exitSpy.mockClear();
  });

  it('successfully updates smithue-cli and prints result', async () => {
    mockExecSync.mockReturnValueOnce('updated\n' as unknown as ReturnType<typeof execSync>);

    await upgradeCommand();

    expect(mockExecSync).toHaveBeenCalledWith('npm update -g smithue-cli', { stdio: 'pipe', encoding: 'utf-8' });
    expect(mockPrintError).not.toHaveBeenCalled();
    expect(mockPrintResult).toHaveBeenCalledWith(expect.objectContaining({
      status: 'updated',
      output: 'updated',
    }));
  });

  it('prints error and exits non-zero when npm update fails', async () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('npm update failed');
    });

    await expect(upgradeCommand()).rejects.toThrow('process.exit:1');

    expect(mockPrintResult).not.toHaveBeenCalled();
    expect(mockPrintError).toHaveBeenCalledWith(expect.objectContaining({ message: 'npm update failed' }));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('shows a clear message when npm is not found', async () => {
    const enoent = Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' });
    mockExecSync.mockImplementationOnce(() => {
      throw enoent;
    });

    await expect(upgradeCommand()).rejects.toThrow('process.exit:1');

    expect(mockPrintError).toHaveBeenCalledWith(expect.objectContaining({ message: 'npm not found in PATH' }));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
