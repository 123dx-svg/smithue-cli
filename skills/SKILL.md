---
name: smithue-cli
description: CLI tool for controlling Unreal Engine editor via SmithUE plugin
version: "0.1.0"
platforms: ["windows"]
installation:
  method: npm
  command: "npm install -g smithue-cli"
---

# Quick Start
- Node 18+ on Windows only.
- Use the plugin portfile at `%LOCALAPPDATA%\.smithue\<pid>.port`.
- Auto-discovers one running editor; use `--pid` for multi-instance.

# Prerequisites
- Unreal Editor running with SmithUE plugin loaded.
- CLI installed via npm or run with `npx`.
- Connection failures usually mean the editor is not running or the portfile is stale.

# Subcommands
| Command | Purpose |
| --- | --- |
| `status` | Show detected editor process and connection state |
| `exec <cmd> [args]` | Send one command to the editor |
| `list [filter]` | List available commands, optionally filtered |
| `search <query>` | Search commands by name or keyword |
| `prune` | Remove stale portfiles and dead instances |

# Examples
## status
```bash
npx smithue-cli status
npx smithue-cli status --pid 1234
```

## exec
```bash
npx smithue-cli exec ping '{}'
```

**Shell-safe param passing** (recommended for JSON with nested quotes — avoids PowerShell quoting issues):
```powershell
# --stdin: pipe JSON (safe on PowerShell 5.1, 7+, cmd, bash)
Get-Content params.json -Raw | npx smithue-cli exec my_action --stdin
# shorthand: "-" as params arg
Get-Content params.json -Raw | npx smithue-cli exec my_action -
# --params-file: read from file
npx smithue-cli exec my_action --params-file params.json
```
Three sources (`--stdin`, `--params-file`, positional JSON) are mutually exclusive — supplying more than one exits 1.

## list
```bash
npx smithue-cli list
npx smithue-cli list Material
```

## search
```bash
npx smithue-cli search blueprint
```

## prune
```bash
npx smithue-cli prune
```

# Troubleshooting
- Exit codes: `0` success, `1` user error, `2` unreachable, `3` biz error, `4` server error, `5` stale nid, `6` wait timeout.
- If `status` cannot connect, verify the editor PID and delete stale `%LOCALAPPDATA%\.smithue\*.port` files with `prune`.
- If commands hang, retry with the correct `--pid`.
