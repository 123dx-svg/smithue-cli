import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BpDescribeEntry } from '../lint/checker.js';
import { runSpecInfer } from '../commands/spec.js';
import { inferSpecFromBp } from './infer.js';

const contractFixture = JSON.parse(
  readFileSync('fixtures/bp_describe_components.contract.json', 'utf-8'),
) as { data: { blueprints: BpDescribeEntry[] } };
const bp: BpDescribeEntry = contractFixture.data.blueprints[0]!;

describe('inferSpecFromBp', () => {
  it('infers parentClass from bp', () => {
    const spec = inferSpecFromBp(bp, { specId: 'test', specName: 'Test' });

    expect(spec.rules.parentClass?.allowlist).toContain(bp.parent_class);
  });

  it('infers components from bp own components', () => {
    const spec = inferSpecFromBp(bp);
    const ownComps = bp.components.filter((component) => !component.inherited_unverifiable);

    expect(spec.rules.components?.length).toBe(ownComps.length);
  });

  it('marks naming as needs-confirm (required=false)', () => {
    const spec = inferSpecFromBp(bp);

    expect(spec.rules.naming?.required).toBe(false);
  });

  it('inferred spec passes schema validation', async () => {
    const { loadSpec } = await import('./loader.js');
    const spec = inferSpecFromBp(bp);
    const tmpPath = join(mkdtempSync(join(tmpdir(), 'smithue-infer-')), 'spec.json');
    writeFileSync(tmpPath, JSON.stringify(spec), 'utf-8');

    const loaded = await loadSpec(tmpPath);

    expect(loaded.schemaVersion).toBe('1.0.0');
  });

  it('golden-file: inferred spec matches recorded golden', () => {
    const spec = inferSpecFromBp(bp, { specId: 'prop-inferred', specName: 'Prop (inferred)' });
    const goldenPath = 'fixtures/infer/golden-infer.json';

    if (!existsSync(goldenPath)) {
      mkdirSync('fixtures/infer', { recursive: true });
      writeFileSync(goldenPath, JSON.stringify(spec, null, 2), 'utf-8');
      console.log('Golden written:', goldenPath);
    } else {
      const golden = JSON.parse(readFileSync(goldenPath, 'utf-8')) as typeof spec;
      expect(spec.schemaVersion).toBe(golden.schemaVersion);
      expect(spec.rules.parentClass?.allowlist).toEqual(golden.rules.parentClass?.allowlist);
      expect(spec.rules.components?.length).toBe(golden.rules.components?.length);
    }
  });

  it('runSpecInfer calls bp_describe_components and writes the inferred spec', async () => {
    const tmpPath = join(mkdtempSync(join(tmpdir(), 'smithue-infer-command-')), 'spec.json');
    const calls: Array<{ tool: string; params: object }> = [];

    const spec = await runSpecInfer({
      from: bp.bp_path,
      out: tmpPath,
      specId: 'prop-inferred',
      specName: 'Prop (inferred)',
      execCommand: async (tool, params) => {
        calls.push({ tool, params });
        return { data: { blueprints: [bp] } };
      },
    });

    expect(calls).toEqual([{ tool: 'bp_describe_components', params: { bp_path: bp.bp_path } }]);
    expect(JSON.parse(readFileSync(tmpPath, 'utf-8'))).toEqual(spec);
  });
});
