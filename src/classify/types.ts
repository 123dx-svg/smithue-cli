export interface AssetMetadata {
  name: string;
  path: string;
  package_name: string;
  package_path: string;
  class: string;
  parent_class?: string | null;
  material_slots?: number;
  lod_count?: number;
  has_collision?: boolean;
}

export interface ClassifyResult {
  asset: AssetMetadata;
  specId: string | null;
  status: 'matched' | 'no-match' | 'multi-match';
  warnings: string[];
}
