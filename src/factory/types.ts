export type FactoryOperationType =
  | 'create_bp'
  | 'skip_existing'
  | 'skip_name_collision'
  | 'skip_not_owned';

export interface FactoryOperation {
  type: FactoryOperationType;
  asset_path: string;
  asset_name: string;
  bp_path?: string;
  spec_id?: string;
  reason?: string;
  steps?: Array<{
    tool: string;
    params: Record<string, unknown>;
  }>;
}

export interface FactoryPlan {
  dry_run: boolean;
  spec_id: string;
  operations: FactoryOperation[];
  summary: {
    create: number;
    skip_existing: number;
    skip_collision: number;
    skip_not_owned: number;
  };
}
