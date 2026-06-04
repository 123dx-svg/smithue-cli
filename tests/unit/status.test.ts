import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  SmithUEClient: vi.fn(),
}));

vi.mock('../../src/output.js', () => ({
  printResult: vi.fn(),
  printError: vi.fn(),
}));

import { statusCommand } from '../../src/commands/status.js';
import { discoverPort, SmithUEError } from '../../src/portfile.js';
import { SmithUEClient } from '../../src/client.js';
import { printResult, printError } from '../../src/output.js';

const mockDiscoverPort = vi.mocked(discoverPort);
const MockSmithUEClient = vi.mocked(SmithUEClient);
const mockPrintResult = vi.mocked(printResult);
const mockPrintError = vi.mocked(printError);

const defaultDiscovered = {
  port: 8080,
  pid: 1234,
  project: 'C:/MyProject/MyProject.uproject',
  project_name: 'MyProject',
};

describe('statusCommand', () => {
  let mockGetReady: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReady = vi.fn();
    MockSmithUEClient.mockImplementation(() => ({
      getReady: mockGetReady,
    }) as any);
    mockDiscoverPort.mockResolvedValue(defaultDiscovered);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no wait, ready:true → printResult called with full shape', async () => {
    mockGetReady.mockResolvedValue({ ready: true, version: '5.4.0', pie_active: false });

    await statusCommand({});

    expect(mockPrintResult).toHaveBeenCalledWith({
      port: 8080,
      pid: 1234,
      project_name: 'MyProject',
      ready: true,
      version: '5.4.0',
      pie_active: false,
    });
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('no wait, ready:false → printResult called with ready:false', async () => {
    mockGetReady.mockResolvedValue({ ready: false });

    await statusCommand({});

    expect(mockPrintResult).toHaveBeenCalledWith({
      port: 8080,
      pid: 1234,
      project_name: 'MyProject',
      ready: false,
      version: undefined,
      pie_active: undefined,
    });
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('--wait, eventually ready → printResult called', async () => {
    vi.useFakeTimers();

    mockGetReady
      .mockResolvedValueOnce({ ready: false })
      .mockResolvedValueOnce({ ready: false })
      .mockResolvedValueOnce({ ready: true, version: '5.4.0', pie_active: true });

    const promise = statusCommand({ wait: 10 });

    // Advance timers to drive the polling loop
    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    expect(mockPrintResult).toHaveBeenCalledWith({
      port: 8080,
      pid: 1234,
      project_name: 'MyProject',
      ready: true,
      version: '5.4.0',
      pie_active: true,
    });
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('--wait timeout → printError called with SmithUEError exitCode 6', async () => {
    vi.useFakeTimers();

    mockGetReady.mockResolvedValue({ ready: false });

    const promise = statusCommand({ wait: 3 });

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(4000);
    await promise;

    expect(mockPrintError).toHaveBeenCalledOnce();
    const err = mockPrintError.mock.calls[0]![0];
    expect(err).toBeInstanceOf(SmithUEError);
    expect((err as SmithUEError).exitCode).toBe(6);
    expect((err as Error).message).toMatch(/timed out/i);
    expect(mockPrintResult).not.toHaveBeenCalled();
  });
});
