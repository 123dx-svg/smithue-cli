import { discoverPort, type DiscoverOpts } from '../portfile.js';
import { SmithUEClient } from '../client.js';
import { printResult, printError } from '../output.js';
import { checkVersionCompat } from '../version-check.js';

export interface ExecOpts extends DiscoverOpts {
  cliVersion?: string;
}

export async function execCommand(
  command: string,
  params: Record<string, unknown>,
  opts: ExecOpts = {},
): Promise<void> {
  try {
    const discovered = await discoverPort(opts);
    if (opts.cliVersion) checkVersionCompat(opts.cliVersion, discovered.plugin_version);
    const { port } = discovered;
    const client = new SmithUEClient({ host: '127.0.0.1', port });
    const result = await client.executeCommand(command, params);
    printResult(result);
  } catch (err) {
    printError(err);
  }
}
