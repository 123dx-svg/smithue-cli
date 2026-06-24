import { SmithUEError } from '../portfile.js';

export interface ExecParamInput {
  positional?: string;
  stdin?: boolean;
  paramsFile?: string;
}

export interface ExecParamDeps {
  readStdin: () => Promise<string>;
  readFile: (path: string) => Promise<string>;
}

function parseParamsObject(raw: string, source: string): Record<string, unknown> {
  let s = raw;
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1); // strip BOM
  s = s.trim();
  if (s === '') throw new SmithUEError(`exec params source (${source}) was empty`, 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    throw new SmithUEError(
      `exec params must be valid JSON (from ${source}): ${s.slice(0, 120)}`,
      1,
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SmithUEError(`exec params must be a JSON object (from ${source})`, 1);
  }
  return parsed as Record<string, unknown>;
}

export async function resolveExecParams(
  input: ExecParamInput,
  deps: ExecParamDeps,
): Promise<Record<string, unknown>> {
  const usesStdin = input.stdin === true || input.positional === '-';
  const usesPositional = input.positional !== undefined && input.positional !== '-';
  const usesFile = input.paramsFile !== undefined;
  const count = Number(usesStdin) + Number(usesPositional) + Number(usesFile);

  if (count > 1) {
    throw new SmithUEError(
      'exec params provided via multiple sources; use exactly one of: positional JSON, --stdin (or "-"), --params-file <path>',
      1,
    );
  }
  if (count === 0) return {};

  let raw: string;
  let source: string;

  if (usesStdin) {
    raw = await deps.readStdin();
    source = 'stdin';
  } else if (usesFile) {
    try {
      raw = await deps.readFile(input.paramsFile!);
    } catch (e) {
      throw new SmithUEError(
        `exec --params-file could not be read: ${input.paramsFile} (${e instanceof Error ? e.message : String(e)})`,
        1,
      );
    }
    source = '--params-file';
  } else {
    raw = input.positional!;
    source = 'positional';
  }

  return parseParamsObject(raw, source);
}
