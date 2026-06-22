import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import Ajv, { type ErrorObject } from 'ajv';
import type { SpecModel } from './types.js';

const require = createRequire(import.meta.url);
const schema = require('../../schemas/spec.schema.json') as object;

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

export class SpecValidationError extends Error {
  constructor(
    public fields: string[],
    message: string,
  ) {
    super(message);
    this.name = 'SpecValidationError';
  }
}

export async function loadSpec(filePath: string): Promise<SpecModel> {
  const raw = await readFile(filePath, 'utf8');
  const data = JSON.parse(raw) as unknown;

  if (!validate(data)) {
    const fields = (validate.errors ?? []).map(errorToField);
    throw new SpecValidationError(fields, `Invalid spec: ${ajv.errorsText(validate.errors)}`);
  }

  return data as SpecModel;
}

function errorToField(error: ErrorObject): string {
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    return joinField(error.instancePath, error.params.missingProperty);
  }

  return error.instancePath.replace(/^\//, '') || 'unknown';
}

function joinField(instancePath: string, property: string): string {
  const base = instancePath.replace(/^\//, '');
  return base ? `${base}/${property}` : property;
}
