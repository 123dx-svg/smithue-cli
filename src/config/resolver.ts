import { readFile, access } from 'fs/promises';
import path from 'path';
import Ajv from 'ajv';
import { createRequire } from 'module';
import type { SmithUEConfig } from './types.js';

const require = createRequire(import.meta.url);
const schema = require('../../schemas/config.schema.json');
const ajv = new Ajv({ useDefaults: true });
const validate = ajv.compile(schema);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Walk up from startDir looking for smithue.config.json (ESLint-style). */
export async function findConfigFile(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, 'smithue.config.json');
    try {
      await access(candidate);
      return candidate;
    } catch {
      // not present here, keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/** Load and validate a config file at an explicit path. */
export async function loadConfig(configPath: string): Promise<SmithUEConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch {
    throw new ConfigError(`Config file not found: ${configPath}`);
  }
  const data = JSON.parse(raw);
  if (!validate(data)) {
    throw new ConfigError(`Invalid config: ${ajv.errorsText(validate.errors)}`);
  }
  return data as SmithUEConfig;
}

/** Convenience: walk up from startDir and load the first config found. Returns null if none found. */
export async function resolveConfig(startDir: string): Promise<SmithUEConfig | null> {
  const configPath = await findConfigFile(startDir);
  if (!configPath) return null;
  return loadConfig(configPath);
}
