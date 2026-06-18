import { readPortfiles, getPortfileDir, SmithUEError } from '../portfile.js';
import { setPinned, clearPinned, getPinned } from '../registry.js';
import { projectId } from '../identity.js';
import { printResult, printError } from '../output.js';

export interface UseOpts {
  pid?: number;
  project?: string;
  clear?: boolean;
}

export async function useCommand(opts: UseOpts): Promise<void> {
  try {
    if (opts.clear) {
      await getPinned();
      await clearPinned();
      printResult({ ok: true, action: 'cleared', pinned: null });
      return;
    }

    if (opts.pid === undefined && opts.project === undefined) {
      throw new SmithUEError(
        'Specify --pid <n> or --project <path> to pin an instance, or --clear to unpin.',
        1,
      );
    }

    const dir = getPortfileDir();
    const all = await readPortfiles(dir);

    const candidate = all.find((c) => {
      if (opts.pid !== undefined) return c.data.pid === opts.pid;
      if (opts.project !== undefined) {
        return c.data.project === opts.project || c.data.project_name === opts.project;
      }
      return false;
    });

    if (!candidate) {
      throw new SmithUEError(
        opts.pid !== undefined
          ? `No running SmithUE instance found with PID ${opts.pid}.`
          : `No running SmithUE instance found for project "${opts.project}".`,
        2,
      );
    }

    const entry = {
      projectId: projectId(candidate.data.project || ''),
      pid: candidate.data.pid,
      port: candidate.data.port,
      project: candidate.data.project,
      project_name: candidate.data.project_name,
      lastConnectedAt: new Date().toISOString(),
    };

    await setPinned(entry);
    printResult({ ok: true, action: 'pinned', pinned: entry });
  } catch (err) {
    printError(err);
  }
}
