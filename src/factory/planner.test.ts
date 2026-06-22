import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOwnershipChecker } from '../config/ownership.js';
import type { AssetMetadata } from '../classify/types.js';
import type { SpecModel } from '../spec/types.js';
import { planFactory } from './planner.js';

const spec = JSON.parse(readFileSync('fixtures/specs/prop.valid.json', 'utf-8')) as SpecModel;
const scanFixture = JSON.parse(readFileSync('fixtures/scan_assets.contract.json', 'utf-8')) as {
  data: { assets: AssetMetadata[] };
};
const assets = scanFixture.data.assets;
const checker = createOwnershipChecker({
  specsDir: '.smithue/specs',
  ownership: { include: ['/Game/SmithUETest/**'], exclude: [] },
});

describe('planFactory', () => {
  it('dry-run produces operations without writing', () => {
    const plan = planFactory({
      spec,
      assets,
      existingBpPaths: new Set(),
      ownedChecker: checker,
      outputFolder: '/Game/SmithUETest',
    });

    expect(plan.dry_run).toBe(true);
    expect(plan.spec_id).toBe('prop');
    expect(plan.operations.length).toBeGreaterThan(0);
    expect(
      plan.summary.create +
        plan.summary.skip_existing +
        plan.summary.skip_collision +
        plan.summary.skip_not_owned,
    ).toBe(plan.operations.length);
  });

  it('skip_existing when BP already exists', () => {
    const firstPlan = planFactory({
      spec,
      assets,
      existingBpPaths: new Set(),
      ownedChecker: checker,
      outputFolder: '/Game/SmithUETest',
    });
    const createdPaths = new Set(
      firstPlan.operations.filter((operation) => operation.type === 'create_bp').map((operation) => operation.bp_path!),
    );

    const secondPlan = planFactory({
      spec,
      assets,
      existingBpPaths: createdPaths,
      ownedChecker: checker,
      outputFolder: '/Game/SmithUETest',
    });
    const skipped = secondPlan.operations.filter((operation) => operation.type === 'skip_existing');

    expect(skipped.length).toBe(createdPaths.size);
    expect(secondPlan.summary.create).toBe(0);
  });

  it('name collision: two assets with same derived BP name -> skip_name_collision', () => {
    const collisionAssets: AssetMetadata[] = [
      {
        name: 'SM_Crate',
        path: '/Game/SmithUETest/SM_Crate.SM_Crate',
        package_name: '/Game/SmithUETest/SM_Crate',
        package_path: '/Game/SmithUETest',
        class: 'StaticMesh',
      },
      {
        name: 'SK_Crate',
        path: '/Game/SmithUETest/SK_Crate.SK_Crate',
        package_name: '/Game/SmithUETest/SK_Crate',
        package_path: '/Game/SmithUETest',
        class: 'SkeletalMesh',
      },
    ];
    const { naming: _naming, ...rulesWithoutNaming } = spec.rules;
    const broadSpec: SpecModel = { ...spec, rules: rulesWithoutNaming };

    const plan = planFactory({
      spec: broadSpec,
      assets: collisionAssets,
      existingBpPaths: new Set(),
      ownedChecker: checker,
      outputFolder: '/Game/SmithUETest',
    });
    const collisions = plan.operations.filter((operation) => operation.type === 'skip_name_collision');

    expect(collisions.length).toBeGreaterThan(0);
    expect(plan.summary.skip_collision).toBe(collisions.length);
  });

  it('golden-file: plan matches recorded golden', () => {
    const plan = planFactory({
      spec,
      assets,
      existingBpPaths: new Set(),
      ownedChecker: checker,
      outputFolder: '/Game/SmithUETest',
    });
    const golden = JSON.parse(readFileSync('fixtures/factory/golden-plan.json', 'utf-8')) as typeof plan;

    expect(plan).toEqual(golden);
  });
});
