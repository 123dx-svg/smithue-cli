import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { printError, printResult } from '../output.js';
import { SmithUEError } from '../portfile.js';

function getSkillPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'skill', 'SKILL.md');
}

export interface SkillOpts {
  print?: boolean;
  install?: string;
}

export async function skillCommand(opts: SkillOpts): Promise<void> {
  try {
    if (!opts.print && !opts.install) {
      throw new SmithUEError(
        'Specify --print to output SKILL.md, or --install <dir> to install it.',
        1,
      );
    }

    const skillPath = getSkillPath();
    let content: string;
    try {
      content = await readFile(skillPath, 'utf-8');
    } catch {
      throw new SmithUEError(
        `SKILL.md not found at ${skillPath}. Reinstall smithue-cli to fix.`,
        4,
      );
    }

    if (opts.print) {
      process.stdout.write(content);
      return;
    }

    if (opts.install) {
      const dir = resolve(opts.install);
      await mkdir(dir, { recursive: true });
      const destPath = join(dir, 'SKILL.md');
      await writeFile(destPath, content, 'utf-8');
      printResult({ ok: true, installed: destPath });
    }
  } catch (err) {
    printError(err);
  }
}
