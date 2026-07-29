// Auto-deploy the `smithue-control` skill on GLOBAL install (`npm i -g smithue-cli`).
//
// Self-contained CommonJS, shipped as-is (no build step), so a fresh/unbuilt checkout
// never fails `npm install`. It must NEVER throw or exit non-zero — a failing
// postinstall would break the user's install.
//
// Behavior (global installs only):
//   copies the ENTIRE skill/ bundle (SKILL.md + reference/ + scripts/) to
//     ~/.agents/skills/smithue-control   (primary ecosystem — always)
//     ~/.claude/skills/smithue-control   (only if ~/.claude exists)
//     ~/.codex/skills/smithue-control    (only if ~/.codex exists)
//   Idempotent: overwrites so updates refresh the whole skill.
//   Opt out with SMITHUE_SKILL_NO_AUTOINSTALL=1.
'use strict';

try {
  // Only act on global installs; respect the opt-out.
  if (process.env.npm_config_global === 'true' && process.env.SMITHUE_SKILL_NO_AUTOINSTALL !== '1') {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');

    const skillDir = path.resolve(__dirname, '..', 'skill');
    // Presence of SKILL.md is the sentinel that the bundle exists.
    if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
      const home = os.homedir();

      const skillsDirs = [path.join(home, '.agents', 'skills')];
      for (const agentRoot of ['.claude', '.codex']) {
        if (fs.existsSync(path.join(home, agentRoot))) {
          skillsDirs.push(path.join(home, agentRoot, 'skills'));
        }
      }

      const installed = [];
      for (const skillsDir of skillsDirs) {
        try {
          const dest = path.join(skillsDir, 'smithue-control');
          fs.mkdirSync(dest, { recursive: true });
          // Copy the whole bundle (SKILL.md + reference/ + scripts/), not just SKILL.md.
          fs.cpSync(skillDir, dest, { recursive: true });
          installed.push(dest);
        } catch (_) {
          // ignore a single target failure (permissions / read-only)
        }
      }

      if (installed.length > 0) {
        console.log('[smithue-cli] smithue-control skill (SKILL.md + reference/ + scripts/) installed to:');
        for (const p of installed) console.log('  ' + p);
        console.log('[smithue-cli] reload your AI tool to pick it up. Opt out: SMITHUE_SKILL_NO_AUTOINSTALL=1');
      }
    }
  }
} catch (_) {
  // A postinstall must never fail the install.
}
