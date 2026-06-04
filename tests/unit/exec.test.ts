import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/portfile.js', () => ({
  discoverPort: vi.fn(),
  SmithUEError: class SmithUEError extends Error {
    exitCode: number;
    constructor(message: string, exitCode: number) {
      super(message);
      this.name = 'SmithUEError';
      this.exitCode = exitCode;
    }
  },
}));

vi.mock('../../src/client.js', () => ({
  SmithUEClient: vi.fn().mockImplementation(() => ({
    executeCommand: vi.fn(),
  })),
}));

vi.mock('../../src/output.js', () => ({
  printResult: vi.fn(),
  printError: vi.fn(),
}));

import { execCommand } from '../../src/commands/exec.js';
import { discoverPort, SmithUEError } from '../../src/portfile.js';
import { SmithUEClient } from '../../src/client.js';
import { printResult, printError } from '../../src/output.js';

const mockDiscoverPort = vi.mocked(discoverPort);
const MockSmithUEClient = vi.mocked(SmithUEClient);
const mockPrintResult = vi.mocked(printResult);
const mockPrintError = vi.mocked(printError);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('execCommand', () => {
  it('happy path: discoverPort resolves, executeCommand returns data, printResult called', async () => {
    const fakeResult = { status: 'success' as const, data: { foo: 'bar' } };
    const mockExecuteCommand = vi.fn().mockResolvedValue(fakeResult);
    MockSmithUEClient.mockImplementation(() => ({ executeCommand: mockExecuteCommand } as any));
    mockDiscoverPort.mockResolvedValue({ port: 8080, pid: 123, project: '/proj', project_name: 'Proj' });

    await execCommand('MyCommand', { a: 1 }, {});

    expect(mockDiscoverPort).toHaveBeenCalledWith({});
    expect(MockSmithUEClient).toHaveBeenCalledWith({ host: '127.0.0.1', port: 8080 });
    expect(mockExecuteCommand).toHaveBeenCalledWith('MyCommand', { a: 1 });
    expect(mockPrintResult).toHaveBeenCalledWith(fakeResult);
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('discoverPort throws SmithUEError → printError called with that error', async () => {
    const err = new SmithUEError('No portfiles found', 2);
    mockDiscoverPort.mockRejectedValue(err);

    await execCommand('MyCommand', {}, {});

    expect(mockPrintError).toHaveBeenCalledWith(err);
    expect(mockPrintResult).not.toHaveBeenCalled();
  });

  it('executeCommand throws → printError called', async () => {
    const mockExecuteCommand = vi.fn().mockRejectedValue(new Error('connection refused'));
    MockSmithUEClient.mockImplementation(() => ({ executeCommand: mockExecuteCommand } as any));
    mockDiscoverPort.mockResolvedValue({ port: 9000, pid: 0, project: '', project_name: '' });

    await execCommand('BadCommand', {}, { port: 9000 });

    expect(mockPrintError).toHaveBeenCalledWith(expect.any(Error));
    expect(mockPrintResult).not.toHaveBeenCalled();
  });
});
