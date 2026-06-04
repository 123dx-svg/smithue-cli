# Migrating from SmithUE MCP to smithue-cli

SmithUE has moved from an MCP-based architecture to a stateless CLI. This change improves reliability and simplifies the toolchain.

## 1. Remove MCP Configuration
You no longer need to configure the SmithUE MCP server in your AI agent settings. Remove any references to the `smithue-mcp` package or its executable from your configuration files.

## 2. Install the CLI
Install the new CLI globally using npm:
```bash
npm install -g smithue-cli
```

## 3. Command Mapping
The transition from MCP tools to CLI commands is direct. Most commands follow a one-to-one mapping.

| MCP Tool | CLI Command |
|---|---|
| `smithue_list_domain()` | `smithue-cli list` |
| `smithue_list_domain("Material")` | `smithue-cli list Material` |
| `smithue_search("blueprint")` | `smithue-cli search blueprint` |
| `smithue_execute("ping", {})` | `smithue-cli exec ping '{}'` |

## 4. State Management
The MCP version used sessions for some operations. The CLI is entirely stateless. You don't need to manage sessions or connections. Each command automatically discovers the running Unreal Engine instance and executes the request.

If you have multiple projects open, use the `--project` or `--pid` flags to target a specific instance.
