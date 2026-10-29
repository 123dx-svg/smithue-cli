import { getPortfileDir, readPortfiles, SmithUEError, type PortfileData } from '../portfile.js';
import { isProcessAlive } from '../proc.js';
import { printError, printResult } from '../output.js';

export type InstanceState = 'ready' | 'starting' | 'stale' | 'unreachable' | 'unverified' | 'identity_mismatch';

export interface InstanceSnapshot extends PortfileData {
  state: InstanceState;
  process_alive: boolean;
  verified: boolean;
  ready: boolean;
  error?: string;
}

export async function listInstances(timeoutMs = 2000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new SmithUEError('--timeout must be an integer between 1 and 30000 milliseconds.', 1);
  }
  const entries = await readPortfiles(getPortfileDir());
  const instances = await Promise.all(entries.map(async ({ data }): Promise<InstanceSnapshot> => {
    const processAlive = isProcessAlive(data.pid);
    const snapshot: InstanceSnapshot = {
      ...data, state: processAlive ? 'unreachable' : 'stale',
      process_alive: processAlive, verified: false, ready: false,
    };
    if (!processAlive) return snapshot;
    try {
      const response = await fetch(`http://127.0.0.1:${data.port}/ready`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok && response.status !== 503) {
        return { ...snapshot, error: `HTTP ${response.status}` };
      }
      const identity = await response.json() as { pid?: number; instance_id?: string; ready?: boolean };
      if (!identity || !Number.isInteger(identity.pid) || typeof identity.ready !== 'boolean') {
        return { ...snapshot, state: 'unverified', error: 'Endpoint does not provide verifiable PID/readiness identity. Update its plugin.' };
      }
      if (identity.pid !== data.pid) {
        return { ...snapshot, state: 'identity_mismatch', error: `Expected PID ${data.pid}, received ${identity.pid}.` };
      }
      if (typeof identity.instance_id !== 'string' || !identity.instance_id) {
        return { ...snapshot, state: 'unverified', error: 'Endpoint lacks a stable instance identifier. Update its plugin.' };
      }
      if (data.instance_id !== undefined && identity.instance_id !== data.instance_id) {
        return { ...snapshot, state: 'identity_mismatch', error: 'Instance identifier changed; the editor or server may have restarted.' };
      }
      if (!isProcessAlive(data.pid)) return { ...snapshot, state: 'stale', process_alive: false };
      return { ...snapshot, instance_id: identity.instance_id, state: identity.ready ? 'ready' : 'starting', verified: true, ready: identity.ready };
    } catch (error) {
      if (!isProcessAlive(data.pid)) return { ...snapshot, state: 'stale', process_alive: false };
      return { ...snapshot, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  instances.sort((left, right) => left.pid - right.pid);
  return {
    observed_at: new Date().toISOString(),
    discovered_count: instances.length,
    online_count: instances.filter((instance) => instance.verified).length,
    ready_count: instances.filter((instance) => instance.verified && instance.ready).length,
    instances,
  };
}

export async function instancesCommand(opts: { timeout?: number } = {}): Promise<void> {
  try {
    printResult(await listInstances(opts.timeout));
  } catch (error) {
    printError(error);
  }
}