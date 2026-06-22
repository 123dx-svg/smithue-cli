export interface SpecComponent {
  name: string;
  class: string;
  required?: boolean;
  mobility?: 'Static' | 'Movable' | 'Stationary';
  collisionProfile?: string;
  materialSlotsFilled?: boolean;
}

export interface SpecRules {
  naming?: { pattern?: string; required?: boolean };
  outputFolder?: { path?: string; required?: boolean };
  parentClass?: { allowlist?: string[]; required?: boolean };
  components?: SpecComponent[];
  lod?: { minLod0?: boolean };
}

export interface SpecModel {
  schemaVersion: string;
  id: string;
  name: string;
  description?: string;
  ownership?: { folderGlobs?: string[] };
  rules: SpecRules;
}
