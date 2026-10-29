---
name: smithue-control
description: 用 smithue-cli 从外部驱动正在运行的 UE 编辑器（需 SmithUE 插件）：读写资产与属性、蓝图排故与编译、批量操作、资产迁移与合规审计。只要用户提到查看或修改任意 Unreal 资产类型（蓝图、材质、静态网格、关卡、UMG、Niagara…），或粘贴了 /Game、/Script、.uasset、.umap 路径，就用本技能。一律查运行中的编辑器，不要去读磁盘目录。
---

<!-- smithue-cli v0.13+ | SmithUE plugin v1.10+ -->

# SmithUE Control：用 smithue-cli 驱动/检查运行中的 UE 编辑器

本 SKILL 主体只讲**通用入口 + 高频踩坑 + 去哪找细节**。领域细节（迁移、蓝图、材质、合规、批量操作）在同目录 `references/`，按需读；命令的权威参数 schema 永远以 `list_tools` 现查为准。

## 前置 / 适用

- SmithUE 是 UE5 编辑器插件，通过本地 HTTP 暴露编辑器能力；`smithue-cli` 是其 npm CLI。`npm i -g smithue-cli` 或 `npx smithue-cli`。
- **前提（缺一不可）**：
  1. 目标工程已**安装并启用 SmithUE 插件**（只装 CLI 不够——插件才是暴露能力的一端）。未装 → 先提醒用户装，否则本 skill 全部无效。
  2. **UE 编辑器正在运行**。每次操作前 `smithue-cli status` 确认 `ready:true`，没就绪就停。
- 端口文件在 `%LOCALAPPDATA%\.smithue\<pid>.port`（Windows-only），任何工作目录都能发现编辑器。

## 发现与调用（4 步，权威自描述——别靠记忆）

```powershell
npx smithue-cli --session <unique-session-id> --project "<absolute-project.uproject>" status
npx smithue-cli --session <same-session-id> search <关键词>
npx smithue-cli --session <same-session-id> list
npx smithue-cli --session <same-session-id> exec list_tools '{"domain":"Blueprint"}'
npx smithue-cli --session <same-session-id> exec <command> <params>
```

不知用哪个 → 先 `search`；知道域 → `list_tools` 看全量。**参数永远以第 3 步 schema 为准**（`search` 是字面子串匹配，搜不到换同义词或 `list_tools`）。

全局选项：`--terse`(压缩 JSON 省 token，AI 默认带上) · `--out <file>`(大输出落盘) · `--pid`/`--project`(多实例选择) · `--strict`(CI，多实例硬报错)。

**会话绑定**：为每个 AI 会话生成独立且稳定的 session ID，每次调用都携带相同的 `--session`，或在该会话专用的进程环境中设置 `SMITHUE_SESSION`。首次调用必须带 `--project` 的绝对工程路径或 `--pid`；确认返回的工程及 `ready:true` 后再编辑。多个会话不能共用 session ID，也不要依赖全局端口环境变量或最近连接记录。多实例目标不明确时 CLI 会报错；绑定实例退出后不会自动换到另一个工程，必须明确重新绑定。

显式切换或解除当前会话绑定：`smithue-cli --session <id> use --pid <n>` / `--project <path>` / `--clear`。同一工程有多个编辑器时用 PID。备用脚本使用相同的 `SMITHUE_SESSION`，或每次明确指定 `SMITHUE_PID` / `SMITHUE_PROJECT`；禁止为解决连接问题而改用另一个实例。

**共享维护**：CLI 升级、skill 安装与插件自动升级共享用户级维护锁。锁冲突时稍后重试，不要删除活进程持有的锁。CLI 被强制终止可能留下锁文件，先核实文件记录的 PID 已退出，再清理；普通失败与正常退出自动释放。

## 内容路径 vs 磁盘路径（最高频踩坑）

**"文件夹/资产/内容" 默认指 UE 编辑器内部状态，不是 OS 磁盘目录。** 涉及 UE 内容一律走 smithue-cli 查**运行中的编辑器**，别用 `ls`/`Get-ChildItem` 读磁盘工程目录。

- 「当前打开/选中的文件夹下有什么」→ `get_content_browser_selection`（返回真实 `/Game/...` 包路径）→ `list_assets`/`scan_assets` 列该路径。
- 内容路径 `/Game/BP/Foo`（工具吃这个）；磁盘路径 `F:\Proj\Content\BP\Foo.uasset`（不是）。
- 口诀：问"引擎里有什么/选了什么/资产属性"→ smithue-cli；问"仓库源码/.uplugin/.cpp"→ 才读磁盘。

## ⚠️ 通用 Gotchas（跨任务必读）

1. **PowerShell 传 JSON 会吞引号/拆参**（各版本不一）→ **首选直接用 CLI 配 `--params-file`**（参数写进文件，绕开 shell 引号解析）：
   `npx smithue-cli exec <cmd> --params-file params.json`。**CJK（中文）参数务必走 `--params-file`**（命令行/管道代码页会把中文损坏成 `??`，详见 batch-and-dialogs.md）。
   若 `--params-file` 仍有格式/编码问题，用 skill 自带 `scripts/` 转换，按此顺序降级（两者都自动发现端口、UTF-8 直读文件、直发 HTTP，中文往返实测不坏）：
   ① `powershell -File scripts/smithue.ps1 <command> params.json`（PowerShell 自带 `Invoke-RestMethod`）
   ② `node scripts/smithue-exec.mjs <command> params.json`
2. **别假设所有命令都用 `bp_path`**：`bp_get_compile_errors` 用 `blueprint_path`、`find_asset` 用 `name_pattern`、`get_actor_property` 用 `actor_label`……先 `list_tools` 查 schema。
3. **"No portfiles found" 但编辑器在跑**：错误里已内置 `curl` 兜底命令，复制验证连通；查状态栏 SmithUE 绿点、端口目录、或 `SMITHUE_PORT=<port>` 直连。
4. **改完插件 C++ 命令后**必须重启编辑器（启动重编译加载新 DLL），否则连旧进程看不到新命令。
5. **错误输出是机器可读 envelope**：`{"ok":false,"error":{message,code,exit,hint,fallback_cmd}}`——读 `error.code`/`fallback_cmd` 分支，别正则匹配文本。

## 流程性工作：先查权威 SPEC（别凭记忆造轮子）

做规范性/流程性工作（新增命令、迁移、合规、命名、发布、蓝图装配等）前，**先 `Glob`/`Read` 权威 spec，以它为准**——本 SKILL 只给入口，不复制会过时的细节：

- **命令契约 / 开发规范** → 插件仓库 `{SmithUE}/docs/spec/`：`TOOL_SPEC.md`(命令契约)、`NAMING.md`、`PITFALLS.md`、`RELEASE.md`
- **现成流程** → `{SmithUE}/docs/usage/workflows/`：如 `asset-to-blueprint.md`、`compliance-lint.md`、`spec-infer.md`
- **范式 / 接口 / 合规规则** → `{SmithUE}/docs/usage/`：`PARADIGM.md`、`SPI.md`、`COMPLIANCE_RULES_v1.md`、`AUDIT_PRIMITIVES_CONTRACT.md`
- **项目自定义规范** → 宿主工程 `smithue.config.json` 的 `specsDir`（默认 `.smithue/specs/`）：**存在就按项目规范执行**，不要另立标准
- **本 skill 的操作层 recipe** → 同目录 `references/`（比插件 spec 更贴近调用层的步骤）

判定：动手前先查上述目录，命中就照 spec/recipe 做；都没有再用通用做法，并考虑把新沉淀写回对应 spec。

## 命令域速览 · 何时读哪个 reference

| 任务 | 起手 | 深读 |
|---|---|---|
| 迁移资产/关卡进内容插件、目录重组、清 redirector | `plan_migration`→`move_folder`→`list_redirectors` | **references/asset-migration.md** |
| 蓝图父类丢失/空壳、C++ 类改名·换模块·换插件位置后修复、CoreRedirects | `find_broken_assets` · `bp_health_check`（⚠️ 先禁止保存空壳蓝图） | **references/parent-class-redirect.md** |
| 批量/长命令超时、卡住、弹模态框、看进度 | `get_job_status` · `set_dialog_auto_response` | **references/batch-and-dialogs.md** |
| 读/改/排故蓝图、批量设组件属性、代码生成逻辑 | `bp_get_summary` · `bp_health_check` | **references/blueprint.md** |
| 连材质引脚、设节点属性、WPO/顶点动画 | `list_tools '{"domain":"Material"}'` | **references/material.md** |
| 合规校验、批量生成合规蓝图、spec 装配 | `smithue-cli lint`/`factory`/`spec infer` | **references/compliance.md** |
| 资产减负：贴图/材质/Mesh/骨骼优化、重复去重、文件整理、版本警告、骨骼缺失修复 | `get_dependency_closure` · `plan_migration` | **references/asset-slimming.md** |

除上述外还有 Asset/Editor/Niagara/Level/Data/Sequencer/PIE/Animation/Input/UMG/Observation/Viewport/Environment/Interaction/Curve/RenderTarget/Physics/Debug/System/Project/Analysis 等域——用 `list` + `list_tools` 探索，别靠记忆。

## 维护

- 插件仓库：github.com/123dx-svg/SmithUE ｜ CLI 仓库：github.com/123dx-svg/smithue-cli
- 获取与当前 CLI 版本匹配的 skill：`smithue-cli skill --print` / `smithue-cli skill --install <dir>`
- 完整命令参考：`smithue-cli list` 实时查询，或插件仓库 `TOOLS.md`。
