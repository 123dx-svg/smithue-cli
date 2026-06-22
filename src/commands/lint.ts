import { writeFile } from 'node:fs/promises';
import { loadSpec } from '../spec/index.js';
import { checkBlueprint, type BpDescribeEntry } from '../lint/checker.js';
import type { LintFinding, LintResult } from '../lint/types.js';
import type { SmithUEConfig } from '../config/types.js';
import type { OutputOptions } from '../output.js';

interface BpDescribeResponse {
  data?: {
    blueprints?: BpDescribeEntry[];
  };
}

export async function runLint(options: {
  specId: string;
  specDir: string;
  config: SmithUEConfig;
  execCommand: (tool: string, params: object) => Promise<unknown>;
  output: OutputOptions;
}): Promise<{ result: LintResult; exitCode: number }> {
  const { specId, specDir, config, execCommand, output } = options;

  const specPath = `${specDir}/${specId}.json`;
  const spec = await loadSpec(specPath);
  const devRoot = config.devContentRoot ?? '/Game/SmithUETest';
  const raw = (await execCommand('bp_describe_components', {
    folder_path: devRoot,
    recursive: false,
  })) as BpDescribeResponse;

  const blueprints = raw.data?.blueprints ?? [];
  const allFindings: LintFinding[] = [];
  const allUnverifiable: string[] = [];

  for (const bp of blueprints) {
    const packagePath = bp.bp_path.split('/').slice(0, -1).join('/');
    const { findings, unverifiable } = checkBlueprint(bp, spec, packagePath);
    allFindings.push(...findings);
    allUnverifiable.push(...unverifiable);
  }

  const result: LintResult = {
    spec_id: specId,
    findings: allFindings,
    unverifiable: allUnverifiable,
    checked_assets: blueprints.length,
  };

  if (output.outPath) {
    await writeFile(output.outPath, JSON.stringify(result, null, 2), 'utf8');
  }

  return { result, exitCode: allFindings.length > 0 ? 1 : 0 };
}
