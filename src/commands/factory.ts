import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SmithUEClient } from '../client.js';
import { createOwnershipChecker } from '../config/ownership.js';
import { findConfigFile, loadConfig } from '../config/resolver.js';
import type { SmithUEConfig } from '../config/types.js';
import { planFactory } from '../factory/planner.js';
import type { FactoryPlan } from '../factory/types.js';
import { printError, printResult, type OutputOptions } from '../output.js';
import { discoverPort, type DiscoverOpts } from '../portfile.js';
import { loadSpec } from '../spec/index.js';

const DEFAULT_CONFIG: SmithUEConfig = {
  specsDir: '.smithue/specs',
  devContentRoot: '/Game/SmithUETest',
};

export interface RunFactoryOptions {
  specId: string;
  dryRun: boolean;
  execCommand: (tool: string, params: object) => Promise<unknown>;
  startDir: string;
  output: OutputOptions;
}

interface AssetListResponse {
  data?: {
    assets?: unknown[];
  };
}

export async function runFactory(options: RunFactoryOptions): Promise<{ plan: FactoryPlan; exitCode: number }> {
  const { specId, execCommand, startDir, output } = options;
  const configPath = await findConfigFile(startDir);
  const config = configPath ? await loadConfig(configPath) : DEFAULT_CONFIG;
  const specPath = path.resolve(startDir, config.specsDir, `${specId}.json`);
  const spec = await loadSpec(specPath);
  const checker = createOwnershipChecker(config);
  const devRoot = spec.rules.outputFolder?.path ?? config.devContentRoot ?? '/Game/SmithUETest';

  const raw = (await execCommand('scan_assets', { folder_path: devRoot })) as AssetListResponse;
  const assets = (raw.data?.assets ?? []) as Parameters<typeof planFactory>[0]['assets'];

  const bpRaw = (await execCommand('list_assets', {
    folder_path: devRoot,
    type_filter: 'Blueprint',
  })) as AssetListResponse;
  const existingBpPaths = new Set(
    (bpRaw.data?.assets ?? [])
      .map((asset) => (asset as { path?: unknown }).path)
      .filter((assetPath): assetPath is string => typeof assetPath === 'string')
      .map((assetPath) => assetPath.split('.')[0]!),
  );

  const plan = planFactory({ spec, assets, existingBpPaths, ownedChecker: checker, outputFolder: devRoot });

  if (output.outPath) {
    await writeFile(output.outPath, JSON.stringify(plan, null, 2), 'utf-8');
  }

  return { plan, exitCode: 0 };
}

export async function factoryCommand(
  options: { specId: string; dryRun?: boolean } & DiscoverOpts,
  output: OutputOptions,
): Promise<void> {
  try {
    if (options.dryRun === false) {
      throw new Error('factory apply is not implemented in this release; use --dry-run');
    }

    const { port } = await discoverPort(options);
    const client = new SmithUEClient({ host: '127.0.0.1', port });
    const { plan } = await runFactory({
      specId: options.specId,
      dryRun: true,
      execCommand: (tool, params) => client.executeCommand(tool, params as Record<string, unknown>),
      startDir: process.cwd(),
      output,
    });

    if (!output.outPath) {
      printResult(plan);
    }
  } catch (err) {
    printError(err);
  }
}
