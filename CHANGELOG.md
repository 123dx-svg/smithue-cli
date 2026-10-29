# Changelog

## v0.16.0 — 2026-10-29

- Fix Ubuntu release-gate failures: fallback-script tests now isolate both `LOCALAPPDATA` and `XDG_RUNTIME_DIR`, with an explicit XDG discovery regression check. Smoke CI runs the full tests and typecheck on Windows and Ubuntu instead of only checking the packed CLI version.
- Keep package and lockfile versions in sync. Serialize npm publishes and fail closed on registry lookup errors; query and publish explicitly against the official npm registry.

**Compatibility:** `use` requires an isolated session ID. Guarded commands require an updated target plugin exposing PID / `instance_id`; update each UE project's plugin before using this CLI for editing. A lost or restarted target must be explicitly confirmed and rebound.

- Add `instances` to probe all discovered editors and report verified online/ready counts and per-instance lifecycle states without changing session bindings.
- Bind sessions to startup instance IDs as well as PID/port/project, revalidate every request, and send expected identity headers for plugin-side rejection of stale requests. Reject legacy endpoints without verifiable instance IDs; do not resubmit timed-out guarded writes.
- Update skill instructions and fallback scripts for task-start/pre-write/recovery enumeration and explicit user-confirmed rebinding after crashes, exits, or restarts. Extend the real two-editor verifier with online counts, receiver-side rejection, and crash/restart recovery.

- Add `--session` / `SMITHUE_SESSION` with separate editor bindings. Ambiguous targets and unavailable bound editors fail closed; global recent history no longer selects a write target. `use` now requires a session.
- Respect explicit project selection over environment port defaults, validate compound PID/project constraints, and check PID identity from updated plugins' readiness responses.
- Share an atomic user-level maintenance lock with updated plugins across `upgrade`, `skill --install`, and npm postinstall. Delegate lock ownership to npm children and protect locks from `purge --force`.
- Apply the same unambiguous routing policy to the skill's Node and PowerShell fallback scripts; update agent instructions to keep a stable per-conversation session ID.
- Add process-level lock tests, isolated session tests, fallback-script regressions, and a real two-editor verification script. Forced CLI termination may require verified manual stale-lock cleanup.

## v0.15.1 — 精简 SKILL 描述

### Changed
- **`skill/SKILL.md` 的 `description` 从 363 字精简到 193 字**（-47%）。
  砍掉的是末尾那段「触发词：…」列表 —— 14 个词里 11 个在第一句已出现，纯属重复。
  重写后为三段：**作用**（读写资产与属性 / 蓝图排故与编译 / 批量操作 / 资产迁移与合规审计）
  → **触发条件**（提到任意 Unreal 资产类型，或粘贴 `/Game`、`/Script`、`.uasset`、`.umap` 路径）
  → **消歧**（一律查运行中的编辑器，不要读磁盘目录）。
  最后那句不是描述而是纠偏：没有它，模型看到 `/Game/...` 很容易直接去翻
  `Content/` 下的 `.uasset`，这正是本 skill 最常见的误用。
- 正文、`references/`、`scripts/` 未动。

> 触发率**未做实测**。两条路都被环境堵死：
> skill-creator 的 `scripts/run_eval.py` 对管道用 `select.select()`，Windows 下仅支持 socket
> → 每条 query 挂在 `WinError 10038`，而调用方会把失败静默计为「未触发」；
> 绕过后又发现本机 `claude -p` 连不上 API（持续 `api_retry`）。
> 本次改动依据的是描述写作原则（作用 + 触发条件 + 消歧），不是量化结果。

## v0.15.0 — Skill bundle: rename reference/ → references/ + new domain docs

### Changed
- **Skill 目录规范化**：`skill/reference/` → `skill/references/`（对齐 Agent Skills 生态惯例）；SKILL.md 及全部文档内路径同步更新。
- `skill --install` 与 `postinstall.cjs` 在安装后自动**清理旧 `reference/` 残留**（cp 为 merge 拷贝，升级用户目标目录中的旧目录不会被覆盖删除）；`--install` 输出新增 `migrated` 字段。

### Added
- `references/parent-class-redirect.md` — 蓝图父类丢失/空壳修复：位置移动 vs 改名判定决策树、CoreRedirects 语法、固化退役流程、致命时序陷阱（经 UE 5.8.1 实验验证）。
- `references/asset-slimming.md` — 资产减负：贴图/材质/Mesh/骨骼（含骨骼缺失修复）/文件整理/资产版本警告六域的检测→决策→命令映射、次序铁律、SmithUE 能力缺口需求清单。
- SKILL.md 路由表新增上述两个入口行。

## v0.13.2 — Auto-install the smithue-control skill on global install

### Added
- **`postinstall` hook** (`scripts/postinstall.cjs`) auto-deploys the `smithue-control` skill on a **global** install (`npm i -g smithue-cli`) — no extra `smithue-cli skill --install` step needed.
  - Targets `~/.agents/skills/smithue-control/` (always) plus `~/.claude/skills/` and `~/.codex/skills/` when those agent homes already exist; idempotent (overwrites to refresh on update).
  - Self-contained CommonJS, shipped as-is; runs ONLY on global installs (`npm_config_global=true`) so local dev `npm install` never touches your home dir.
  - Fully defensive — never throws / never fails the install. Opt out with `SMITHUE_SKILL_NO_AUTOINSTALL=1`.
- `smithue-cli skill --install <dir>` remains for manual / custom-location installs.

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
