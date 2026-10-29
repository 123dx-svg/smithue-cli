# smithue-cli

Stateless command line interface for the SmithUE Unreal Engine plugin.

## For AI Agents

### Quick Deploy
- **Windows**: `npm install -g smithue-cli`
- **macOS**: `npm install -g smithue-cli`
- **Linux**: `npm install -g smithue-cli`

*Note: The v1 plugin server is Windows-only. The CLI npm package installs on any OS, but requires a Windows machine running the UE editor.*

### Prerequisites check
Ensure Node.js 18+ is installed. Run `node -v` to check.

### Verification
Run this command to check if the CLI can find your running Unreal Engine project:
```powershell
smithue-cli status
```

### Fault tree (if things go wrong)
1. **Editor not running**: Start Unreal Engine and verify the SmithUE plugin is active.
2. **Multiple instances**: If you have two editors open, the CLI needs help. Use `smithue-cli status` to see PIDs, then pass `--pid <number>` to your command.
3. **Stale portfile**: If the editor crashed, a `.port` file might remain in `%LOCALAPPDATA%\.smithue\`. Run `smithue-cli prune` to clean up dead files.
4. **Connection refused**: Check if your firewall blocks local port traffic. SmithUE only listens on 127.0.0.1.

## Installation
Standard installation via npm:
```bash
npm install -g smithue-cli
```
Or run directly without installing:
```bash
npx smithue-cli <command>
```

## Subcommands

| Command | Description |
|---|---|
| `exec` | Run a remote command in UE |
| `list` | List available domains or objects |
| `search` | Find assets or objects by string |
| `status` | Show running UE instances and their ports |
| `instances` | Probe every discovered editor and report verified online/ready counts without changing bindings |
| `batch` | Run multiple read-only commands sequentially |
| `upgrade` | Update the CLI to the latest version via npm |
| `prune` | Remove stale port files from crashed instances |
| `purge` | Remove the entire `.smithue` directory (full uninstall cleanup) |
| `use` | Pin (or unpin) a default SmithUE instance for multi-editor setups |
| `skill` | Print or install the bundled SKILL.md for AI agent integration |

## Output Modes

By default, `smithue-cli` outputs pretty-printed JSON (2-space indent).

- `--terse` — Minified JSON (no whitespace). Recommended for AI agents to save tokens.
- `--out <file>` — Write result to file; stdout is silent. Useful for large responses.
- Combined: `smithue-cli status --terse --out result.json`

## Batch Mode

Run multiple read-only commands in a single call:

```bash
smithue-cli batch "status" "list"
```

Returns a JSON array: `[{command, ok, data?, error?}, ...]`

Supported commands: `status`, `list`, `search`. Sequential execution only.

## Upgrading

### Multiple Editors and AI Sessions

Start tasks, pre-write checks, and recovery from disconnects with:

```powershell
smithue-cli instances --terse
smithue-cli instances --timeout 2000
```

The result contains `observed_at`, `discovered_count`, `online_count`,
`ready_count`, and per-instance identity/state. Only verified `ready` instances
are editable. States also include `starting`, `stale`, `unreachable`,
`unverified`, and `identity_mismatch`. Counts are point-in-time snapshots of
discoverable SmithUE instances, not all OS editor processes. Enumeration never
deletes records or changes bindings; ambiguous intent requires user confirmation.

Each guarded request rechecks readiness, PID, and the server's `instance_id`.
The plugin validates expected identity headers before dispatch, so port reuse
between the check and the command cannot redirect an edit to another instance.
Server restarts generate new instance IDs; explicitly rebind after confirming
the replacement target. Older plugins without this identity support are visible
as unverified but cannot receive guarded commands. Timed-out writes are not
automatically submitted again: confirm the result on the same instance first.

Use a unique, stable session ID for each AI conversation. Bind its first call to
an absolute project path or an editor PID, then keep the same session ID on every call:

```powershell
smithue-cli --session assistant-a --project "C:/Projects/GameA/GameA.uproject" status
smithue-cli --session assistant-b --project "C:/Projects/GameB/GameB.uproject" status
smithue-cli --session assistant-a exec ping
smithue-cli --session assistant-b exec ping
```

`SMITHUE_SESSION` is equivalent to `--session` when set in a session-specific
process environment. Bindings live in separate hashed files under
`%LOCALAPPDATA%/.smithue/sessions`. Multiple editors without an explicit target or
session binding are an error; global recent history is never a routing fallback.
An exited bound editor causes an error even if another editor is available.
Rebind explicitly after restarting it. `use` requires a session ID; `--port`
cannot be combined with a session binding. If multiple editors open the same
project, select a unique PID.

Updated plugins allocate independent ports by default and fall back to an
OS-assigned port if a configured fixed port is occupied. Update the plugin in
every participating project; older plugin builds do not implement this policy.

Managed CLI upgrades, skill installs, and updated plugin installs share
`%LOCALAPPDATA%/.smithue/maintenance.lock`. Lock acquisition is nonblocking;
retry after another owner completes. npm postinstall inherits its installer's
ownership. Editor locks are removed by Windows when the process exits; CLI
locks are removed on normal completion/exit. A forcibly terminated CLI can
leave an abandoned lock: verify its recorded PID is dead before manual removal.
Direct `npm install/update` bypasses the outer upgrade lock; use the managed
upgrade command when editors are active. Its postinstall protects skill copying,
not npm's own earlier package writes.

For a read-only two-editor verification (requires a built CLI and the matching engine):

```powershell
node scripts/verify-multi-instance.mjs "<EngineRoot>/Engine/Binaries/Win64/UnrealEditor.exe" "<ProjectRoot>/<Project>.uproject" "<ProjectRoot>/Plugins/SmithUE"
```

The temporary project inherits the primary project's engine association.
For mixed engine versions, append a peer editor executable and its existing
project file as the fourth and fifth arguments. Each project must have its
own compatible SmithUE plugin build. The verifier preserves UE5.8's
`modal_active` readiness field and waits within fixed deadlines for startup
probes; it never retries edits or ignores identity mismatches.

The verifier creates a temporary second project, requests the same fixed port
for both instances, checks online counts and receiver-side identity rejection,
terminates and restarts one editor to verify explicit rebinding, and stops
only the editors it launched. It never writes assets.

```bash
smithue-cli upgrade
```

Updates `smithue-cli` via npm under the shared maintenance lock. CLI and plugin versions are independent.

## AI Agent Integration

Recommended flags for AI agent usage:

```bash
# Minified output saves tokens
smithue-cli status --terse

# Write large responses to file, keep context clean
smithue-cli list --out tools.json

# Multiple queries in one call
smithue-cli batch "status" "list" --terse
```

## Examples
List all Material assets:
```bash
smithue-cli list Material
```

Search for blueprints:
```bash
smithue-cli search blueprint
```

Execute a custom action:
```bash
smithue-cli exec my_action '{"key": "value"}'
```

### Shell-safe parameter passing (recommended for complex JSON)

Positional JSON strings can be mangled by some shells — notably **Windows PowerShell 5.1**, which strips quotes or splits on spaces. Use `--stdin` or `--params-file` for shell- and PowerShell-version-agnostic parameter passing:

```powershell
# --stdin: pipe JSON from a file (safe on all shells and PowerShell versions)
Get-Content params.json -Raw | smithue-cli exec my_action --stdin

# Shorthand: pass "-" as the params argument (equivalent to --stdin)
Get-Content params.json -Raw | smithue-cli exec my_action -

# --params-file: read params from a file directly
smithue-cli exec my_action --params-file params.json
```

All three input modes are **mutually exclusive** — supplying more than one at a time is an error (exit 1). An explicit source with empty content is also an error. Omitting params entirely defaults to `{}`.

## Security Notes
- Binds to 127.0.0.1 only. No external network exposure.
- Port files in `%LOCALAPPDATA%\.smithue` are ACL-restricted to the current Windows user.

## Uninstall

Use `purge` to fully clean up after removing SmithUE. Unlike `prune` (which removes stale port files during normal use), `purge` deletes the entire `%LOCALAPPDATA%\.smithue\` directory as the final step of uninstalling the CLI.

```bash
smithue-cli purge          # interactive: lists files and asks for confirmation
smithue-cli purge --dry-run  # preview what would be deleted
smithue-cli purge -y       # non-interactive full purge (CI/scripts)
```

### Options

| Flag | Description |
|---|---|
| `--force` | Skip liveness check; delete all files including non-portfiles |
| `--dry-run` | Show what would be deleted without making changes |
| `-y, --yes` | Skip the confirmation prompt (required when stdin is not a TTY) |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (including cancelled and dry-run) |
| 1 | Non-interactive context without `-y` |
| 2 | `LOCALAPPDATA` not set (Windows-only command) |
| 3 | `.smithue` is a symlink or junction — refused for safety |

For routine cleanup of stale portfiles without removing the directory, use `smithue-cli prune` instead.

## Exit Codes

| Code | Meaning | Common cause |
|---|---|---|
| `0` | Success | Command completed normally |
| `1` | Bad input or disambiguation required | Invalid arguments; multiple instances running without `--pid`/`--project`; `PAYLOAD_TOO_LARGE` |
| `2` | Not found or unreachable | No portfiles found; instance unreachable; PID/project not matched |
| `3` | Command error | `PIE_LOCKED`, `ASSET_NOT_FOUND`, `INVALID_REQUEST`, or unknown plugin error |
| `4` | Internal / editor not ready | `INTERNAL_ERROR`, `EDITOR_NOT_READY`, unexpected exception |
| `5` | Stale session NID | `STALE_NID` — node ID is outdated, re-run the command |
| `6` | Wait timeout | `--wait` exceeded without editor becoming ready |

Scripts can branch on exit codes:
```powershell
smithue-cli status
if ($LASTEXITCODE -eq 2) { Write-Host "Editor not running" }
if ($LASTEXITCODE -eq 5) { Write-Host "Reconnecting (stale NID)..." }
```

## Known Limitations
- Version 1 is Windows-only due to portfile path conventions.
- No persistent configuration files. Use environment variables like `SMITHUE_PORT` or `SMITHUE_PID` for overrides.

## Maintainers

Publishing this package (git + npm) follows a fixed runbook — see **[`docs/RELEASE.md`](docs/RELEASE.md)** (registry gotcha, version bump, CJK-safe commit, `files` whitelist, skill deploy). The SmithUE plugin (separate repo, independent version) has its own release spec in the plugin's `docs/spec/RELEASE.md`.
