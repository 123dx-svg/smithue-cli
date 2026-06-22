export interface LintFinding {
  asset_path: string;
  bp_path?: string;
  rule: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning';
}

export interface LintResult {
  spec_id: string;
  findings: LintFinding[];
  unverifiable: string[];
  checked_assets: number;
}
