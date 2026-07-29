import { readFile, mkdir, cp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { printError, printResult } from '../output.js';
import { SmithUEError } from '../portfile.js';

/** Directory holding the bundled skill (SKILL.md + reference/ + scripts/). */
function getSkillDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'skill');
}

export interface SkillOpts {
  print?: boolean;
  install?: string;
}

export async function skillCommand(opts: SkillOpts): Promise<void> {
  try {
    if (!opts.print && !opts.install) {
      throw new SmithUEError(
        'Specify --print to output SKILL.md, or --install <dir> to install the skill bundle (SKILL.md + reference/ + scripts/).',
        1,
      );
    }

    const skillDir = getSkillDir();
    const skillMd = join(skillDir, 'SKILL.md');

    // SKILL.md is the sentinel that the bundle is present.
    let content: string;
    try {
      content = await readFile(skillMd, 'utf-8');
    } catch {
      throw new SmithUEError(
        `SKILL.md not found at ${skillMd}. Reinstall smithue-cli to fix.`,
        4,
      );
    }

    if (opts.print) {
      // stdout is a single stream; --print emits SKILL.md only. Use --install
      // to materialize the full bundle (reference/ + scripts/) on disk.
      process.stdout.write(content);
      return;
    }

    if (opts.install) {
      const dir = resolve(opts.install);
      await mkdir(dir, { recursive: true });
      // Copy the WHOLE bundle, not just SKILL.md: reference/ + scripts/ too.
      await cp(skillDir, dir, { recursive: true });
      printResult({ ok: true, installed: dir, bundle: ['SKILL.md', 'reference/', 'scripts/'] });
    }
  } catch (err) {
    printError(err);
  }
}
