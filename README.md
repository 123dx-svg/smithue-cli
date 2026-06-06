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
| `batch` | Run multiple read-only commands sequentially |
| `upgrade` | Update the CLI to the latest version via npm |
| `prune` | Remove stale port files from crashed instances |
| `purge` | Remove the entire `.smithue` directory (full uninstall cleanup) |

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

```bash
smithue-cli upgrade
```

Updates `smithue-cli` to the latest version via npm. A warning is printed to stderr if the CLI version does not match the plugin version.

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

## Known Limitations
- Version 1 is Windows-only due to portfile path conventions.
- No persistent configuration files. Use environment variables like `SMITHUE_PORT` or `SMITHUE_PID` for overrides.
