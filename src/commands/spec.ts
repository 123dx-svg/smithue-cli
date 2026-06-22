import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SmithUEClient } from '../client.js';
import type { BpDescribeEntry } from '../lint/checker.js';
import { printError, printResult } from '../output.js';
import { discoverPort, type DiscoverOpts } from '../portfile.js';
import { inferSpecFromBp, type InferOptions } from '../spec/infer.js';
import type { SpecModel } from '../spec/types.js';

export interface SpecInferOptions extends InferOptions {
  from: string;
  out: string;
  execCommand: (tool: string, params: object) => Promise<unknown>;
}

interface BpDescribeResponse {
  data?: {
    blueprints?: BpDescribeEntry[];
  };
}

export async function runSpecInfer(options: SpecInferOptions): Promise<SpecModel> {
  const raw = (await options.execCommand('bp_describe_components', {
    bp_path: options.from,
  })) as BpDescribeResponse;

  const bp = raw.data?.blueprints?.[0];
  if (!bp) {
    throw new Error(`bp_describe_components returned no blueprint for ${options.from}`);
  }

  const spec = inferSpecFromBp(bp, { specId: options.specId, specName: options.specName });
  await mkdir(path.dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(spec, null, 2)}\n`, 'utf-8');
  return spec;
}

export async function specInferCommand(
  options: { from: string; out: string; specId?: string; specName?: string } & DiscoverOpts,
): Promise<void> {
  try {
    const { port } = await discoverPort(options);
    const client = new SmithUEClient({ host: '127.0.0.1', port });
    const spec = await runSpecInfer({
      from: options.from,
      out: options.out,
      specId: options.specId,
      specName: options.specName,
      execCommand: (tool, params) => client.executeCommand(tool, params as Record<string, unknown>),
    });

    printResult({ out: options.out, spec });
  } catch (err) {
    printError(err);
  }
}
