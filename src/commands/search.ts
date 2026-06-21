import { discoverPort } from '../portfile.js';
import { SmithUEClient } from '../client.js';
import { printResult, printError } from '../output.js';

export interface SearchOpts {
  pid?: number;
  project?: string;
  port?: number;
}

export async function searchCommand(keyword: string, opts: SearchOpts): Promise<void> {
  try {
    const { port } = await discoverPort(opts);
    const client = new SmithUEClient({ host: '127.0.0.1', port });

    const tools = await client.listTools();
    const kw = keyword.toLowerCase();
    const matches: { domain: string; name: string; description: string }[] = [];

    for (const tool of tools) {
      const name = tool.name ?? '';
      const description = tool.description ?? '';
      if (name.toLowerCase().includes(kw) || description.toLowerCase().includes(kw)) {
        matches.push({ domain: tool.category ?? '', name, description });
      }
    }

    printResult(matches);
  } catch (err) {
    printError(err);
  }
}
