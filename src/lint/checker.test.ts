import { describe, expect, it } from 'vitest';
import { checkBlueprint } from './checker.js';
import type { SpecModel } from '../spec/types.js';
import type { BpDescribeEntry } from './checker.js';

const spec: SpecModel = {
  schemaVersion: '1.0.0',
  id: 'prop',
  name: 'Prop',
  rules: {
    naming: { pattern: '^BP_.+', required: true },
    parentClass: { allowlist: ['/Script/Engine.Actor'], required: true },
    components: [
      {
        name: 'StaticMeshComponent',
        class: 'StaticMeshComponent',
        required: true,
        mobility: 'Static',
        collisionProfile: 'BlockAll',
        materialSlotsFilled: true,
      },
    ],
  },
};

const cleanBp: BpDescribeEntry = {
  bp_path: '/Game/SmithUETest/BP_Crate',
  parent_class: '/Script/Engine.Actor',
  components: [
    {
      name: 'StaticMeshComponent',
      class: 'StaticMeshComponent',
      source: 'own',
      mobility: 'Static',
      collision: { profile: 'BlockAll', enabled: 'QueryAndPhysics' },
      materials: ['/Engine/BasicShapes/BasicShapeMaterial'],
      inherited_unverifiable: false,
    },
  ],
};

const violatingBp: BpDescribeEntry = {
  bp_path: '/Game/SmithUETest/BP_Violation',
  parent_class: '/Script/Engine.Pawn',
  components: [
    {
      name: 'StaticMeshComponent',
      class: 'StaticMeshComponent',
      source: 'own',
      mobility: 'Movable',
      collision: { profile: 'OverlapAll', enabled: 'QueryOnly' },
      materials: [],
      inherited_unverifiable: false,
    },
  ],
};

const inheritedBp: BpDescribeEntry = {
  bp_path: '/Game/SmithUETest/BP_Inherited',
  parent_class: '/Script/Engine.Actor',
  components: [
    {
      name: 'InheritedMesh',
      class: 'StaticMeshComponent',
      source: 'inherited',
      inherited_unverifiable: true,
    },
  ],
};

describe('checkBlueprint', () => {
  it('clean BP -> 0 findings', () => {
    const { findings } = checkBlueprint(cleanBp, spec, '/Game/SmithUETest');
    expect(findings).toHaveLength(0);
  });

  it('violating BP -> multiple findings', () => {
    const { findings } = checkBlueprint(violatingBp, spec, '/Game/SmithUETest');
    expect(findings.length).toBeGreaterThan(0);
    const rules = findings.map((finding) => finding.rule);
    expect(rules).toContain('parentClass');
    expect(rules).toContain('mobility');
    expect(rules).toContain('collision.profile');
    expect(rules).toContain('materialSlotsFilled');
  });

  it('inherited_unverifiable -> unverifiable list, not findings', () => {
    const { findings, unverifiable } = checkBlueprint(inheritedBp, spec, '/Game/SmithUETest');
    const compFindings = findings.filter((finding) => finding.rule === 'components.required');
    expect(compFindings).toHaveLength(0);
    expect(unverifiable.length).toBeGreaterThan(0);
  });
});
