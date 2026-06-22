import type { BpDescribeEntry } from '../lint/checker.js';
import type { SpecComponent, SpecModel } from './types.js';

export interface InferOptions {
  specId?: string;
  specName?: string;
}

export function inferSpecFromBp(bp: BpDescribeEntry, opts: InferOptions = {}): SpecModel {
  const parentClass = bp.parent_class ?? '/Script/Engine.Actor';
  const bpName = bp.bp_path.split('/').pop() ?? '';
  const folderPath = bp.bp_path.split('/').slice(0, -1).join('/');

  const components: SpecComponent[] = bp.components
    .filter((component) => !component.inherited_unverifiable)
    .map((component) => {
      const specComponent: SpecComponent = {
        name: component.name,
        class: component.class,
        required: true,
      };

      if (isSpecMobility(component.mobility)) {
        specComponent.mobility = component.mobility;
      }

      if (component.collision?.profile) {
        specComponent.collisionProfile = component.collision.profile;
      }

      if (component.materials && component.materials.length > 0) {
        specComponent.materialSlotsFilled = true;
      }

      return specComponent;
    });

  return {
    schemaVersion: '1.0.0',
    id: opts.specId ?? 'inferred',
    name: opts.specName ?? `从 ${bpName} 推导的草稿规范（needs-confirm）`,
    description: `由 smithue-cli spec infer 从 ${bp.bp_path} 自动生成。命名规则需人工确认。`,
    ownership: {
      folderGlobs: [`${folderPath}/**`],
    },
    rules: {
      naming: {
        pattern: '^BP_.+',
        required: false,
      },
      parentClass: {
        allowlist: [parentClass],
        required: true,
      },
      components,
      lod: {
        minLod0: false,
      },
    },
  };
}

function isSpecMobility(value: string | undefined): value is SpecComponent['mobility'] {
  return value === 'Static' || value === 'Movable' || value === 'Stationary';
}
