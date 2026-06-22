import type { SpecModel } from '../spec/types.js';
import type { AssetMetadata } from '../classify/types.js';
import { classifyAssets } from '../classify/classifier.js';
import type { FactoryOperation, FactoryPlan } from './types.js';

export interface PlannerOptions {
  spec: SpecModel;
  assets: AssetMetadata[];
  existingBpPaths: Set<string>;
  ownedChecker: (assetPath: string) => boolean;
  outputFolder: string;
}

function deriveBpName(assetName: string, spec: SpecModel): string {
  const pattern = spec.rules.naming?.pattern;
  if (pattern && new RegExp(pattern).test(assetName)) return assetName;

  const stripped = assetName.replace(/^(SM_|SKM_|SK_)/, '');
  return `BP_${stripped}`;
}

function getAssetObjectPath(asset: AssetMetadata): string {
  return `${asset.package_path}/${asset.name}`;
}

export function planFactory(opts: PlannerOptions): FactoryPlan {
  const { spec, assets, existingBpPaths, ownedChecker, outputFolder } = opts;
  const classified = classifyAssets(assets, [spec]);

  const bpNameCount = new Map<string, number>();
  for (const result of classified) {
    if (result.status === 'matched' || result.status === 'multi-match') {
      const bpName = deriveBpName(result.asset.name, spec);
      bpNameCount.set(bpName, (bpNameCount.get(bpName) ?? 0) + 1);
    }
  }

  const operations: FactoryOperation[] = [];

  for (const result of classified) {
    const asset = result.asset;
    const assetObjectPath = getAssetObjectPath(asset);

    if (!ownedChecker(assetObjectPath)) {
      operations.push({
        type: 'skip_not_owned',
        asset_path: asset.path,
        asset_name: asset.name,
        reason: 'Asset path not in ownership include list',
      });
      continue;
    }

    if (result.status === 'no-match') {
      operations.push({
        type: 'skip_not_owned',
        asset_path: asset.path,
        asset_name: asset.name,
        reason: `No spec matched for asset '${asset.name}'`,
      });
      continue;
    }

    const bpName = deriveBpName(asset.name, spec);
    const bpPath = `${outputFolder}/${bpName}`;

    if ((bpNameCount.get(bpName) ?? 0) > 1) {
      operations.push({
        type: 'skip_name_collision',
        asset_path: asset.path,
        asset_name: asset.name,
        bp_path: bpPath,
        spec_id: spec.id,
        reason: `Name collision: multiple assets would produce BP '${bpName}'`,
      });
      continue;
    }

    if (existingBpPaths.has(bpPath)) {
      operations.push({
        type: 'skip_existing',
        asset_path: asset.path,
        asset_name: asset.name,
        bp_path: bpPath,
        spec_id: spec.id,
        reason: `Blueprint '${bpPath}' already exists`,
      });
      continue;
    }

    const parentClass = spec.rules.parentClass?.allowlist?.[0] ?? '/Script/Engine.Actor';
    const steps: FactoryOperation['steps'] = [
      { tool: 'bp_create', params: { bp_path: bpPath, parent_class: parentClass } },
    ];

    for (const compSpec of spec.rules.components ?? []) {
      steps.push({
        tool: 'bp_add_component',
        params: {
          bp_path: bpPath,
          component_class: compSpec.class,
          component_name: compSpec.name,
          static_mesh: asset.path,
        },
      });

      const edits: Array<{ property_path: string; value: string }> = [];
      if (compSpec.mobility) edits.push({ property_path: 'Mobility', value: compSpec.mobility });
      if (compSpec.collisionProfile) {
        edits.push({ property_path: 'Collision.Profile', value: compSpec.collisionProfile });
      }

      if (edits.length > 0) {
        steps.push({
          tool: 'bp_bulk_set_component_property',
          params: { bp_path: bpPath, component: compSpec.name, edits },
        });
      }
    }

    operations.push({
      type: 'create_bp',
      asset_path: asset.path,
      asset_name: asset.name,
      bp_path: bpPath,
      spec_id: spec.id,
      steps,
    });
  }

  const summary = {
    create: operations.filter((operation) => operation.type === 'create_bp').length,
    skip_existing: operations.filter((operation) => operation.type === 'skip_existing').length,
    skip_collision: operations.filter((operation) => operation.type === 'skip_name_collision').length,
    skip_not_owned: operations.filter((operation) => operation.type === 'skip_not_owned').length,
  };

  return { dry_run: true, spec_id: spec.id, operations, summary };
}
