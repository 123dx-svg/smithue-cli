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
| `prune` | Remove stale port files from crashed instances |

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

## Known Limitations
- Version 1 is Windows-only due to portfile path conventions.
- No persistent configuration files. Use environment variables like `SMITHUE_PORT` or `SMITHUE_PID` for overrides.
