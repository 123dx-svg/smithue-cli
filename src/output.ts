import { SmithUEError } from './portfile.js';

export function printResult(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

export function printError(err: unknown): void {
  let message: string;
  let exitCode: number;

  if (err instanceof SmithUEError) {
    message = err.message;
    exitCode = err.exitCode;
  } else if (err instanceof Error) {
    message = err.message;
    exitCode = 4;
  } else {
    message = String(err);
    exitCode = 4;
  }

  process.stderr.write(JSON.stringify({ error: message, exit_code: exitCode }) + '\n');
  process.exit(exitCode);
}
