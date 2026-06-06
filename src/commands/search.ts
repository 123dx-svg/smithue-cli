import { discoverPort } from '../portfile.js';
import { SmithUEClient } from '../client.js';
import { printResult, printError } from '../output.js';
import { checkVersionCompat } from '../version-check.js';

export interface SearchOpts {
  pid?: number;
  project?: string;
  port?: number;
  cliVersion?: string;
}

export async function searchCommand(keyword: string, opts: SearchOpts): Promise<void> {
  try {
    const discovered = await discoverPort(opts);
    if (opts.cliVersion) checkVersionCompat(opts.cliVersion, discovered.plugin_version);
    const { port } = discovered;
    const client = new SmithUEClient({ host: '127.0.0.1', port });

    const domains = await client.listTools();
    const kw = keyword.toLowerCase();
    const matches: { domain: string; name: string; description: string }[] = [];

    for (const domainTool of domains) {
      const domainName = domainTool.name;
      const tools = await client.listTools(domainName);
      for (const tool of tools) {
        const name = tool.name ?? '';
        const description = tool.description ?? '';
        if (name.toLowerCase().includes(kw) || description.toLowerCase().includes(kw)) {
          matches.push({ domain: domainName, name, description });
        }
      }
    }

    printResult(matches);
  } catch (err) {
    printError(err);
  }
}
