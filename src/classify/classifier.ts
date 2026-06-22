import type { SpecModel } from '../spec/index.js';
import type { AssetMetadata, ClassifyResult } from './types.js';

function matchGlob(assetPath: string, glob: string): boolean {
  if (glob.endsWith('/**')) {
    const prefix = glob.slice(0, -3);
    return assetPath.startsWith(`${prefix}/`) || assetPath === prefix;
  }

  return assetPath === glob || assetPath.startsWith(`${glob}/`);
}

function matchesSpec(asset: AssetMetadata, spec: SpecModel): boolean {
  const globs = spec.ownership?.folderGlobs ?? [];
  if (globs.length > 0) {
    const inFolder = globs.some((glob) => matchGlob(asset.package_path, glob));
    if (!inFolder) {
      return false;
    }
  }

  const pattern = spec.rules.naming?.pattern;
  if (pattern && !new RegExp(pattern).test(asset.name)) {
    return false;
  }

  return true;
}

export function classifyAssets(assets: AssetMetadata[], specs: SpecModel[]): ClassifyResult[] {
  return assets.map((asset) => {
    const matched = specs.filter((spec) => matchesSpec(asset, spec));

    if (matched.length === 0) {
      return { asset, specId: null, status: 'no-match', warnings: [] };
    }

    if (matched.length === 1) {
      return { asset, specId: matched[0].id, status: 'matched', warnings: [] };
    }

    const specIds = matched.map((spec) => spec.id);
    const firstSpecId = specIds[0];

    return {
      asset,
      specId: firstSpecId,
      status: 'multi-match',
      warnings: [
        `Asset '${asset.name}' matched multiple specs: ${specIds.join(', ')}. Using first match: '${firstSpecId}'.`,
      ],
    };
  });
}
