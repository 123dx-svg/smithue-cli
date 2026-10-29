import { discoverPort } from '../portfile.js';
import { SmithUEClient } from '../client.js';
import { printResult, printError } from '../output.js';

export interface ListOpts {
  pid?: number;
  project?: string;
  port?: number;
}

export async function listCommand(domain: string | undefined, opts: ListOpts): Promise<void> {
  try {
    const { port, pid, instance_id } = await discoverPort(opts);
    const client = new SmithUEClient({ host: '127.0.0.1', port, expectedPid: pid, expectedInstanceId: instance_id });
    const result = await client.listTools(domain);
    printResult(result);
  } catch (err) {
    printError(err);
  }
}
