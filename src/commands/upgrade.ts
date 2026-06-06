import { execSync } from 'node:child_process';
import { SmithUEError } from '../portfile.js';
import { printResult, printError } from '../output.js';

export async function upgradeCommand(): Promise<void> {
  try {
    const output = execSync('npm update -g smithue-cli', { stdio: 'pipe', encoding: 'utf-8' });
    printResult({ status: 'updated', output: String(output).trim() });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ENOENT') {
      printError(new SmithUEError('npm not found in PATH', 1));
      return;
    }

    if (err instanceof Error) {
      printError(new SmithUEError(err.message, 1));
      return;
    }

    printError(new SmithUEError(String(err), 1));
  }
}
