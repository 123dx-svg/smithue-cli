import { describe, expect, it } from 'vitest';
import { classifyAssets } from './classifier.js';
import type { AssetMetadata } from './types.js';
import type { SpecModel } from '../spec/types.js';

const propSpec: SpecModel = {
  schemaVersion: '1.0.0',
  id: 'prop',
  name: 'Prop',
  ownership: { folderGlobs: ['/Game/SmithUETest/**'] },
  rules: { naming: { pattern: '^BP_.+', required: true } },
};

const charSpec: SpecModel = {
  schemaVersion: '1.0.0',
  id: 'character',
  name: 'Character',
  ownership: { folderGlobs: ['/Game/SmithUETest/**'] },
  rules: { naming: { pattern: '^BP_Char_.+', required: true } },
};

const makeAsset = (name: string, package_path = '/Game/SmithUETest'): AssetMetadata => ({
  name,
  path: `${package_path}/${name}.${name}`,
  package_name: `${package_path}/${name}`,
  package_path,
  class: 'Blueprint',
});

describe('classifyAssets', () => {
  const cases: Array<{
    name: string;
    assets: AssetMetadata[];
    specs: SpecModel[];
    expected: Array<{ status: 'matched' | 'no-match' | 'multi-match'; specId: string | null }>;
  }> = [
    {
      name: 'matches prop spec by folder + naming',
      assets: [makeAsset('BP_Crate')],
      specs: [propSpec],
      expected: [{ status: 'matched', specId: 'prop' }],
    },
    {
      name: 'no-match: asset outside folder',
      assets: [makeAsset('BP_Crate', '/Game/OtherFolder')],
      specs: [propSpec],
      expected: [{ status: 'no-match', specId: null }],
    },
    {
      name: 'no-match: naming pattern mismatch',
      assets: [makeAsset('SM_Crate')],
      specs: [propSpec],
      expected: [{ status: 'no-match', specId: null }],
    },
    {
      name: 'multi-match: first spec wins + warning logged',
      assets: [makeAsset('BP_Char_Hero')],
      specs: [propSpec, charSpec],
      expected: [{ status: 'multi-match', specId: 'prop' }],
    },
    {
      name: 'no-match when no specs provided',
      assets: [makeAsset('BP_Crate')],
      specs: [],
      expected: [{ status: 'no-match', specId: null }],
    },
    {
      name: 'multiple assets classified independently',
      assets: [makeAsset('BP_Crate'), makeAsset('SM_Rock'), makeAsset('BP_Char_Hero')],
      specs: [propSpec, charSpec],
      expected: [
        { status: 'matched', specId: 'prop' },
        { status: 'no-match', specId: null },
        { status: 'multi-match', specId: 'prop' },
      ],
    },
  ];

  it.each(cases)('$name', ({ assets, specs, expected }) => {
    const results = classifyAssets(assets, specs);

    expect(results).toHaveLength(expected.length);
    for (const [index, expectedResult] of expected.entries()) {
      expect(results[index].status).toBe(expectedResult.status);
      expect(results[index].specId).toBe(expectedResult.specId);
    }

    for (const result of results) {
      if (result.status === 'multi-match') {
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('multiple specs');
      } else {
        expect(result.warnings).toHaveLength(0);
      }
    }
  });
});
