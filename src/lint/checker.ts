import type { SpecModel } from '../spec/types.js';
import type { LintFinding } from './types.js';

export interface BpComponent {
  name: string;
  class: string;
  source: string;
  mobility?: string;
  collision?: { profile?: string; enabled?: string };
  materials?: string[];
  mesh?: string | null;
  inherited_unverifiable?: boolean;
}

export interface BpDescribeEntry {
  bp_path: string;
  parent_class?: string;
  components: BpComponent[];
}

export function checkBlueprint(
  bp: BpDescribeEntry,
  spec: SpecModel,
  packagePath: string,
): { findings: LintFinding[]; unverifiable: string[] } {
  const findings: LintFinding[] = [];
  const unverifiable: string[] = [];

  if (spec.rules.naming?.required && spec.rules.naming.pattern) {
    const name = bp.bp_path.split('/').pop() ?? '';
    if (!new RegExp(spec.rules.naming.pattern).test(name)) {
      findings.push({
        asset_path: bp.bp_path,
        bp_path: bp.bp_path,
        rule: 'naming',
        expected: spec.rules.naming.pattern,
        actual: name,
        severity: 'error',
      });
    }
  }

  if (spec.rules.outputFolder?.required && spec.rules.outputFolder.path) {
    if (!packagePath.startsWith(spec.rules.outputFolder.path)) {
      findings.push({
        asset_path: bp.bp_path,
        bp_path: bp.bp_path,
        rule: 'outputFolder',
        expected: spec.rules.outputFolder.path,
        actual: packagePath,
        severity: 'error',
      });
    }
  }

  if (spec.rules.parentClass?.required && spec.rules.parentClass.allowlist?.length) {
    const actual = bp.parent_class ?? '';
    const allowed = spec.rules.parentClass.allowlist;
    if (!allowed.some((allowlisted) => actual === allowlisted || actual.endsWith(`/${allowlisted}`) || actual.endsWith(`.${allowlisted}`))) {
      findings.push({
        asset_path: bp.bp_path,
        bp_path: bp.bp_path,
        rule: 'parentClass',
        expected: allowed.join(' | '),
        actual,
        severity: 'error',
      });
    }
  }

  for (const specComp of spec.rules.components ?? []) {
    const actualComp = bp.components.find(
      (component) => component.class === specComp.class || component.name === specComp.name,
    );

    if (actualComp?.inherited_unverifiable) {
      unverifiable.push(`${bp.bp_path}#${actualComp.name}`);
      continue;
    }

    if (!actualComp) {
      if (specComp.required) {
        findings.push({
          asset_path: bp.bp_path,
          bp_path: bp.bp_path,
          rule: 'components.required',
          expected: specComp.name ?? specComp.class,
          actual: '(missing)',
          severity: 'error',
        });
      }
      continue;
    }

    if (specComp.mobility && actualComp.mobility !== specComp.mobility) {
      findings.push({
        asset_path: bp.bp_path,
        bp_path: bp.bp_path,
        rule: 'mobility',
        expected: specComp.mobility,
        actual: actualComp.mobility ?? '(none)',
        severity: 'error',
      });
    }

    if (specComp.collisionProfile && actualComp.collision?.profile !== specComp.collisionProfile) {
      findings.push({
        asset_path: bp.bp_path,
        bp_path: bp.bp_path,
        rule: 'collision.profile',
        expected: specComp.collisionProfile,
        actual: actualComp.collision?.profile ?? '(none)',
        severity: 'error',
      });
    }

    if (specComp.materialSlotsFilled) {
      const materials = actualComp.materials ?? [];
      const empty = materials.length === 0 || materials.some((material) => !material);
      if (empty) {
        findings.push({
          asset_path: bp.bp_path,
          bp_path: bp.bp_path,
          rule: 'materialSlotsFilled',
          expected: 'all slots filled',
          actual: 'some slots empty',
          severity: 'error',
        });
      }
    }
  }

  return { findings, unverifiable };
}
