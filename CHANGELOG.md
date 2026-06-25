# Changelog

## v0.13.1 — Fix: bundle skill/SKILL.md in the published package

### Fixed
- **`smithue-control` skill was not shipped in the npm package.** `package.json` `files` whitelist omitted `skill/`, so `skill/SKILL.md` was excluded from the published tarball. `smithue-cli skill --install <dir>` therefore failed with `SKILL.md not found at … Reinstall smithue-cli to fix` on any clean install. Added `skill/` to `files`; verified `skill/SKILL.md` (12.8 kB) is now present in the packed artifact.

## v0.13.0 — Exec param input modes

### Added
- `exec --stdin`: read params as JSON from stdin (pipe-safe; works identically on PowerShell 5.1, 7+, cmd, bash).
- `exec --params-file <path>`: read params from a file.
- `exec <cmd> -`: shorthand for `--stdin` (Unix convention).
- UTF-8 BOM stripping for stdin and file inputs (common in Windows redirections).

### Changed (breaking for edge cases)
- Params are now validated to be a JSON **object** across all three input modes; arrays, scalars, and `null` are rejected with exit code 1. Previously, non-object positional params flowed through unchecked.
- Invalid-JSON input from the positional path now exits with code **1** (Bad input) instead of code 4.

### Notes
- The three input modes are mutually exclusive; supplying more than one at a time exits 1.
- An explicit source with empty content exits 1.
- Zero sources still defaults to `{}` as before.

## v0.9.1 — Packaging polish

### Fixed
- `bin` path normalized to `dist/cli.js` (removed `./` prefix) to eliminate npm publish warning.
- CLI program name set to `smithue-cli` so `--help` shows the correct usage line.

## v0.9.0 — Portfile Robustness

### Fixed
- **Portfile not deleted on timeout**: `checkLiveness` now returns without unlinking when the probe times out (AbortError). Only deletes when process is confirmed dead AND endpoint unreachable simultaneously.
- **Error message taxonomy**: `AbortError` (including when message contains "fetch failed") is now correctly classified as "timed out" — checked before connection-error patterns.

### Added
- `SMITHUE_PROBE_TIMEOUT` env var controls liveness probe timeout (default: 10000ms, was hardcoded 3000ms)
- `src/proc.ts`: `isProcessAlive(pid)` utility using `process.kill(pid, 0)` for pid liveness check
- Backward compatible with old plugins (no plugin_version, no heartbeat endpoint)

---

## v0.8.0

Initial public release with core CLI commands: `exec`, `list`, `search`, `status`, `batch`, `upgrade`, `prune`, `purge`.
