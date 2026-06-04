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
