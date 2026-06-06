import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted before imports)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { batchCommand } from '../../src/commands/batch.js';
import { discoverPort } from '../../src/portfile.js';
import { SmithUEClient } from '../../src/client.js';
import { printResult, printError } from '../../src/output.js';

const mockDiscoverPort = vi.mocked(discoverPort);
const MockSmithUEClient = vi.mocked(SmithUEClient);
const mockPrintResult = vi.mocked(printResult);
const mockPrintError = vi.mocked(printError);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultDiscovered = {
  port: 13721,
  pid: 1001,
  project: 'C:/MyProject/MyProject.uproject',
  project_name: 'MyProject',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('batchCommand', () => {
  let mockGetReady: ReturnType<typeof vi.fn>;
  let mockListTools: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReady = vi.fn();
    mockListTools = vi.fn();
    MockSmithUEClient.mockImplementation(() => ({
      getReady: mockGetReady,
      listTools: mockListTools,
    }) as any);
    mockDiscoverPort.mockResolvedValue(defaultDiscovered);
  });

  // Test 1: ["status", "list"] → calls each, returns array of results
  it('1. ["status","list"] → calls each, returns [{command:"status",ok:true,data:{...}},{command:"list",ok:true,data:{...}}]', async () => {
    const statusData = { ready: true, version: '5.4.0', pie_active: false };
    const listData = [{ name: 'ToolA', category: 'Cat', description: 'desc', params: [] }];
    mockGetReady.mockResolvedValue(statusData);
    mockListTools.mockResolvedValue(listData);

    await batchCommand(['status', 'list'], {});

    expect(mockDiscoverPort).toHaveBeenCalledWith({});
    expect(MockSmithUEClient).toHaveBeenCalledWith({ host: '127.0.0.1', port: 13721 });
    expect(mockPrintResult).toHaveBeenCalledWith([
      { command: 'status', ok: true, data: statusData },
      { command: 'list', ok: true, data: listData },
    ]);
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  // Test 2: ["exec"] → collected as {ok:false, error:...}, NOT fatal
  it('2. ["exec"] → {command:"exec",ok:false,error:...} collected in result array, not fatal', async () => {
    await batchCommand(['exec'], {});

    expect(mockPrintResult).toHaveBeenCalledWith([
      expect.objectContaining({
        command: 'exec',
        ok: false,
        error: expect.stringContaining('exec'),
      }),
    ]);
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  // Test 3: [] → printResult([]) called immediately, discoverPort NOT called
  it('3. [] → printResult([]) called, discoverPort NOT called, exits 0', async () => {
    await batchCommand([], {});

    expect(mockPrintResult).toHaveBeenCalledWith([]);
    expect(mockDiscoverPort).not.toHaveBeenCalled();
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  // Test 4: discoverPort throws → fatal (printError called, printResult NOT called)
  it('4. discoverPort throws → printError called (fatal), printResult not called', async () => {
    const err = new Error('No SmithUE portfiles found');
    mockDiscoverPort.mockRejectedValue(err);

    await batchCommand(['status'], {});

    expect(mockPrintError).toHaveBeenCalledWith(err);
    expect(mockPrintResult).not.toHaveBeenCalled();
  });

  // Test 5: one command fails server-side → collected as {ok:false}, others still run
  it('5. status server error → {ok:false,error:...} collected, list still runs, not fatal', async () => {
    const listData = [{ name: 'ToolB', category: 'Cat', description: 'desc', params: [] }];
    mockGetReady.mockRejectedValue(new Error('Editor not ready'));
    mockListTools.mockResolvedValue(listData);

    await batchCommand(['status', 'list'], {});

    expect(mockPrintResult).toHaveBeenCalledWith([
      { command: 'status', ok: false, error: 'Editor not ready' },
      { command: 'list', ok: true, data: listData },
    ]);
    expect(mockPrintError).not.toHaveBeenCalled();
  });
});
