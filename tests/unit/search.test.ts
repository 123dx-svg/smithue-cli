import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchCommand } from '../../src/commands/search.js';

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

describe('searchCommand', () => {
  let mockListTools: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscoverPort.mockResolvedValue({ port: 13721, pid: 1001, project: '', project_name: '' });
    mockListTools = vi.fn();
    mockSmithUEClient.mockImplementation(() => ({ listTools: mockListTools }) as any);
  });

  it('includes tool when keyword matches name', async () => {
    mockListTools.mockResolvedValueOnce([
      { name: 'CreateMaterial', category: 'Material', description: 'Creates a new material', params: [] },
      { name: 'DeleteActor', category: 'Editor', description: 'Removes an actor from the scene', params: [] },
    ]);

    await searchCommand('material', {});

    expect(mockPrintResult).toHaveBeenCalledWith([
      { domain: 'Material', name: 'CreateMaterial', description: 'Creates a new material' },
    ]);
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('includes tool when keyword matches description', async () => {
    mockListTools.mockResolvedValueOnce([
      { name: 'SpawnActor', category: 'Editor', description: 'Spawns a blueprint actor into the world', params: [] },
      { name: 'DeleteMesh', category: 'Editor', description: 'Removes a static mesh', params: [] },
    ]);

    await searchCommand('blueprint', {});

    expect(mockPrintResult).toHaveBeenCalledWith([
      { domain: 'Editor', name: 'SpawnActor', description: 'Spawns a blueprint actor into the world' },
    ]);
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('returns empty array when no tools match keyword', async () => {
    mockListTools.mockResolvedValueOnce([{ name: 'Actor', description: 'Actor domain' }]);
    mockListTools.mockResolvedValueOnce([
      { name: 'SpawnActor', description: 'Spawns an actor' },
    ]);

    await searchCommand('zzznomatch', {});

    expect(mockPrintResult).toHaveBeenCalledWith([]);
    expect(mockPrintError).not.toHaveBeenCalled();
  });

  it('calls printError when discoverPort throws', async () => {
    const err = new Error('No portfiles found');
    mockDiscoverPort.mockRejectedValue(err);

    await searchCommand('anything', {});

    expect(mockPrintError).toHaveBeenCalledWith(err);
    expect(mockPrintResult).not.toHaveBeenCalled();
  });

  it('calls printError when listTools throws', async () => {
    const err = new Error('Connection refused');
    mockListTools.mockRejectedValue(err);

    await searchCommand('material', { port: 9999 });

    expect(mockDiscoverPort).toHaveBeenCalledWith({ port: 9999 });
    expect(mockPrintError).toHaveBeenCalledWith(err);
    expect(mockPrintResult).not.toHaveBeenCalled();
  });

  it('matches across multiple categories and is case-insensitive', async () => {
    mockListTools.mockResolvedValueOnce([
      { name: 'CreateMATERIAL', category: 'Material', description: 'Creates material', params: [] },
      { name: 'SpawnActor', category: 'Actor', description: 'Spawns material-based actor', params: [] },
    ]);

    await searchCommand('MATERIAL', {});

    expect(mockPrintResult).toHaveBeenCalledWith([
      { domain: 'Material', name: 'CreateMATERIAL', description: 'Creates material' },
      { domain: 'Actor', name: 'SpawnActor', description: 'Spawns material-based actor' },
    ]);
  });
});
