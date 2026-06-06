import { SmithUEClient } from '../client.js';
import { discoverPort } from '../portfile.js';
import { printResult, printError } from '../output.js';

export interface GlobalOpts {
  pid?: number;
  project?: string;
  port?: number;
}

export type BatchResult = {
  command: string;
  ok: boolean;
  data?: unknown;
  error?: string;
};

const ALLOWED_COMMANDS = ['status', 'list', 'search'];

export async function batchCommand(commands: string[], opts: GlobalOpts): Promise<void> {
  // Short-circuit for empty list — no connection needed
  if (commands.length === 0) {
    printResult([]);
    return;
  }

  try {
    const discovered = await discoverPort(opts);
    const client = new SmithUEClient({ host: '127.0.0.1', port: discovered.port });

    const results: BatchResult[] = [];

    for (const cmdEntry of commands) {
      const parts = cmdEntry.trim().split(/\s+/);
      const cmd = parts[0]!;

      if (!ALLOWED_COMMANDS.includes(cmd)) {
        results.push({
          command: cmdEntry,
          ok: false,
          error: `${cmd} is not allowed in batch mode. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`,
        });
        continue;
      }

      try {
        let data: unknown;

        if (cmd === 'status') {
          data = await client.getReady();
        } else if (cmd === 'list') {
          const domain = parts[1];
          data = await client.listTools(domain);
        } else if (cmd === 'search') {
          const query = parts.slice(1).join(' ').toLowerCase();
          const domains = await client.listTools();
          const matches: { domain: string; name: string; description: string }[] = [];

          for (const domainTool of domains) {
            const domainName = domainTool.name;
            const tools = await client.listTools(domainName);
            for (const tool of tools) {
              const name = tool.name ?? '';
              const description = tool.description ?? '';
              if (name.toLowerCase().includes(query) || description.toLowerCase().includes(query)) {
                matches.push({ domain: domainName, name, description });
              }
            }
          }

          data = matches;
        }

        results.push({ command: cmdEntry, ok: true, data });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ command: cmdEntry, ok: false, error: message });
      }
    }

    printResult(results);
  } catch (err) {
    printError(err);
  }
}
