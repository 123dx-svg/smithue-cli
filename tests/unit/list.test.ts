import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listCommand } from '../../src/commands/list.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/portfile.js', () => ({
  discoverPort: vi.fn(),
}));

vi.mock('../../src/client.js', () => {
  const listTools = vi.fn();
  const SmithUEClient = vi.fn(() => ({ listTools }));
  return { SmithUEClient };
});

vi.mock('../../src/output.js', () => ({
  printResult: vi.fn(),
  printError: vi.fn(),
}));

import { discoverPort } from '../../src/portfile.js';
import { SmithUEClient } from '../../src/client.js';
import { printResult, printError } from '../../src/output.js';

const mockDiscoverPort = vi.mocked(discoverPort);
const mockSmithUEClient = vi.mocked(SmithUEClient);
const mockPrintResult = vi.mocked(printResult);
const mockPrintError = vi.mocked(printError);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listCommand', () => {
  let mockListTools: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscoverPort.mockResolvedValue({ port: 13721, pid: 1001, project: '', project_name: '' });
    mockListTools = vi.fn();
    mockSmithUEClient.mockImplementation(() => ({ listTools: mockListTools }) as any);
  });

  it('calls listTools() with no arg and printResult with array when domain is undefined', async () => {
    const tools = [{ name: 'ToolA' }, { name: 'ToolB' }];
    mockListTools.mockResolvedValue(tools);

    await listCommand(undefined, {});

    expect(mockDiscoverPort).toHaveBeenCalledWith({});
    expect(mockSmithUEClient).toHaveBeenCalledWith({ host: '127.0.0.1', port: 13721 });
    expect(mockListTools).toHaveBeenCalledWith(undefined);
    expect(mockPrintResult).toHaveBeenCalledWith(tools);
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('calls listTools(domain) and printResult with schema when domain is provided', async () => {
    const schema = { name: 'Material', description: 'Material tools' };
    mockListTools.mockResolvedValue(schema);

    await listCommand('Material', {});

    expect(mockListTools).toHaveBeenCalledWith('Material');
    expect(mockPrintResult).toHaveBeenCalledWith(schema);
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('calls printError when discoverPort throws', async () => {
    const err = new Error('No portfiles found');
    mockDiscoverPort.mockRejectedValue(err);

    await listCommand(undefined, {});

    expect(mockPrintError).toHaveBeenCalledWith(err);
    expect(mockPrintResult).not.toHaveBeenCalled();
  });

  it('calls printError when listTools throws', async () => {
    const err = new Error('Connection refused');
    mockListTools.mockRejectedValue(err);

    await listCommand('Mesh', { port: 9999 });

    expect(mockDiscoverPort).toHaveBeenCalledWith({ port: 9999 });
    expect(mockPrintError).toHaveBeenCalledWith(err);
    expect(mockPrintResult).not.toHaveBeenCalled();
  });
});
