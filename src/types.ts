// SmithUE plugin HTTP API types
// Mirrors FUEAgentToolParam and FUEAgentToolSchema from plugin C++ code

export interface SmithUEToolParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: string;
  itemsType?: string;
  allowedValues?: string[];
}

export interface SmithUEToolSchema {
  name: string;
  category: string;
  description: string;
  params: SmithUEToolParam[];
}

export interface SmithUEListToolsResponse {
  status: 'success' | 'error';
  data: {
    protocol_version: string;
    tools: SmithUEToolSchema[];
  };
}

export interface SmithUEExecuteResponse {
  status: 'success' | 'error';
  data?: Record<string, unknown>;
  error?: string;
  error_code?: string;
}

export interface SmithUEClientConfig {
  host: string;
  port: number;
  timeout: number;
}

export interface PurgeOptions {
  force: boolean;
  dryRun: boolean;
  yes: boolean;
}

export interface PurgeResult {
  status: 'purged' | 'nothing_to_purge' | 'partial' | 'cancelled' | 'dry_run';
  path: string;
  scanned: number;
  deleted: number;
  skipped_live: number;
  failed: number;
  directory_removed: boolean;
  errors: string[];
  warnings: string[];
}
