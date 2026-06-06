import { discoverPort } from '../portfile.js';
import { SmithUEClient } from '../client.js';
import { printResult, printError } from '../output.js';
import { checkVersionCompat } from '../version-check.js';

export interface ListOpts {
  pid?: number;
  project?: string;
  port?: number;
  cliVersion?: string;
}

export async function listCommand(domain: string | undefined, opts: ListOpts): Promise<void> {
  try {
    const discovered = await discoverPort(opts);
    if (opts.cliVersion) checkVersionCompat(opts.cliVersion, discovered.plugin_version);
    const { port } = discovered;
    const client = new SmithUEClient({ host: '127.0.0.1', port });
    const result = await client.listTools(domain);
    printResult(result);
  } catch (err) {
    printError(err);
  }
}
