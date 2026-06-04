import { discoverPort, type DiscoverOpts } from '../portfile.js';
import { SmithUEClient } from '../client.js';
import { printResult, printError } from '../output.js';

export async function execCommand(
  command: string,
  params: Record<string, unknown>,
  opts: DiscoverOpts = {},
): Promise<void> {
  try {
    const { port } = await discoverPort(opts);
    const client = new SmithUEClient({ host: '127.0.0.1', port });
    const result = await client.executeCommand(command, params);
    printResult(result);
  } catch (err) {
    printError(err);
  }
}
