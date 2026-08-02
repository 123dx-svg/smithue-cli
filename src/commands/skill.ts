import { readFile, mkdir, cp, rm, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { printError, printResult } from '../output.js';
import { SmithUEError } from '../portfile.js';

/** Directory holding the bundled skill (SKILL.md + references/ + scripts/). */
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
        'Specify --print to output SKILL.md, or --install <dir> to install the skill bundle (SKILL.md + references/ + scripts/).',
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
      // to materialize the full bundle (references/ + scripts/) on disk.
      process.stdout.write(content);
      return;
    }

    if (opts.install) {
      const dir = resolve(opts.install);
      await mkdir(dir, { recursive: true });
      // Copy the WHOLE bundle, not just SKILL.md: references/ + scripts/ too.
      await cp(skillDir, dir, { recursive: true });

      // Legacy cleanup: cp() merges into the target, so a pre-existing
      // `reference/` dir (bundle layout before the rename to `references/`)
      // would survive the upgrade and leave a stale duplicate that agents
      // may still read. Remove it once the new layout is in place.
      const migrated: string[] = [];
      const legacyDir = join(dir, 'reference');
      try {
        await access(legacyDir);
        await rm(legacyDir, { recursive: true, force: true });
        migrated.push('reference/ -> references/');
      } catch {
        // No legacy dir: fresh install or already migrated.
      }

      printResult({
        ok: true,
        installed: dir,
        bundle: ['SKILL.md', 'references/', 'scripts/'],
        ...(migrated.length > 0 ? { migrated } : {}),
      });
    }
  } catch (err) {
    printError(err);
  }
}
