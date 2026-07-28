---
name: smithue-control
description: 通过 smithue-cli 从外部检查或修改正在运行的 UE 编辑器内容（SmithUE 插件）：查询和编辑蓝图、材质、静态网格、关卡及任意 /Game 资产，读取内容浏览器当前选中或打开的文件夹，执行蓝图排故与编译，做资产迁移/项目插件化与合规审计。凡涉及编辑器里有什么、当前打开或选中的文件夹、某个资产的属性、编辑 UE 内容等场景，一律查运行中的编辑器，不要去读磁盘目录。触发词：SmithUE、smithue-cli、操作 UE 编辑器、当前打开或选中的文件夹、内容浏览器、/Game 资产、列出或查询资产、查阅或修改蓝图材质静态网格、材质 WPO 或节点属性、蓝图排故或编译报错、资产迁移、内容插件化、redirector、合规校验。不适用于编辑 UE 的 C++ 或 Build.cs 源码，以及编辑器未运行时。
---

<!-- smithue-cli v0.13+ | SmithUE plugin v1.10+ -->

# SmithUE Control：用 smithue-cli 驱动/检查运行中的 UE 编辑器

本 SKILL 主体只讲**通用入口 + 高频踩坑 + 去哪找细节**。领域细节（迁移、蓝图、材质、合规、批量操作）在同目录 `reference/`，按需读；命令的权威参数 schema 永远以 `list_tools` 现查为准。

## 前置 / 适用

- SmithUE 是 UE5 编辑器插件，通过本地 HTTP 暴露编辑器能力；`smithue-cli` 是其 npm CLI。`npm i -g smithue-cli` 或 `npx smithue-cli`。
- **前提（缺一不可）**：
  1. 目标工程已**安装并启用 SmithUE 插件**（只装 CLI 不够——插件才是暴露能力的一端）。未装 → 先提醒用户装，否则本 skill 全部无效。
  2. **UE 编辑器正在运行**。每次操作前 `smithue-cli status` 确认 `ready:true`，没就绪就停。
- 端口文件在 `%LOCALAPPDATA%\.smithue\<pid>.port`（Windows-only），任何工作目录都能发现编辑器。

## 发现与调用（4 步，权威自描述——别靠记忆）

```powershell
npx smithue-cli status                                  # 1. 发现编辑器：port/pid/project/ready
npx smithue-cli search <关键词>                          # 2. 按意图定位工具（搜 name+description，跨所有域）
npx smithue-cli list                                    # 2b. 或列功能域（23 域 / 200+ 工具）
npx smithue-cli exec list_tools '{"domain":"Blueprint"}' # 3. 拿目标域全部命令 + 参数 schema（权威）
npx smithue-cli exec <command> <params>                 # 4. 调用
```

不知用哪个 → 先 `search`；知道域 → `list_tools` 看全量。**参数永远以第 3 步 schema 为准**（`search` 是字面子串匹配，搜不到换同义词或 `list_tools`）。

全局选项：`--terse`(压缩 JSON 省 token，AI 默认带上) · `--out <file>`(大输出落盘) · `--pid`/`--project`(多实例选择) · `--strict`(CI，多实例硬报错)。

**多实例**：多个编辑器运行时默认选最近连接的（stderr 打印选中提示）。钉住：`smithue-cli use --pid <n>` / `--project <name>` / `--clear`。

## 内容路径 vs 磁盘路径（最高频踩坑）

**"文件夹/资产/内容" 默认指 UE 编辑器内部状态，不是 OS 磁盘目录。** 涉及 UE 内容一律走 smithue-cli 查**运行中的编辑器**，别用 `ls`/`Get-ChildItem` 读磁盘工程目录。

- 「当前打开/选中的文件夹下有什么」→ `get_content_browser_selection`（返回真实 `/Game/...` 包路径）→ `list_assets`/`scan_assets` 列该路径。
- 内容路径 `/Game/BP/Foo`（工具吃这个）；磁盘路径 `F:\Proj\Content\BP\Foo.uasset`（不是）。
- 口诀：问"引擎里有什么/选了什么/资产属性"→ smithue-cli；问"仓库源码/.uplugin/.cpp"→ 才读磁盘。

## ⚠️ 通用 Gotchas（跨任务必读）

1. **PowerShell 传 JSON 会吞引号/拆参**（各版本不一）→ 用 `--params-file`（推荐）或 `--stdin`，完全绕开 shell：
   `Get-Content params.json -Raw | npx smithue-cli exec <cmd> --stdin`。**CJK（中文）参数尤其要走 `--params-file`**（管道代码页会损坏成 `??`，详见 batch-and-dialogs.md）。
   **换机器/换 shell 还是有格式问题时的终极后路**：`node scripts/smithue-exec.mjs <command> params.json` —— 本 skill 自带的零依赖脚本，自动发现端口、UTF-8 直读文件、直发 HTTP，完全不经 shell 引号与管道编码，任何机器/shell 行为一致。
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
- **本 skill 的操作层 recipe** → 同目录 `reference/`（比插件 spec 更贴近调用层的步骤）

判定：动手前先查上述目录，命中就照 spec/recipe 做；都没有再用通用做法，并考虑把新沉淀写回对应 spec。

## 命令域速览 · 何时读哪个 reference

| 任务 | 起手 | 深读 |
|---|---|---|
| 迁移资产/关卡进内容插件、目录重组、清 redirector | `plan_migration`→`move_folder`→`list_redirectors` | **reference/asset-migration.md** |
| 批量/长命令超时、卡住、弹模态框、看进度 | `get_job_status` · `set_dialog_auto_response` | **reference/batch-and-dialogs.md** |
| 读/改/排故蓝图、批量设组件属性、代码生成逻辑 | `bp_get_summary` · `bp_health_check` | **reference/blueprint.md** |
| 连材质引脚、设节点属性、WPO/顶点动画 | `list_tools '{"domain":"Material"}'` | **reference/material.md** |
| 合规校验、批量生成合规蓝图、spec 装配 | `smithue-cli lint`/`factory`/`spec infer` | **reference/compliance.md** |

除上述外还有 Asset/Editor/Niagara/Level/Data/Sequencer/PIE/Animation/Input/UMG/Observation/Viewport/Environment/Interaction/Curve/RenderTarget/Physics/Debug/System/Project/Analysis 等域——用 `list` + `list_tools` 探索，别靠记忆。

## 维护

- 插件仓库：github.com/123dx-svg/SmithUE ｜ CLI 仓库：github.com/123dx-svg/smithue-cli
- 获取与当前 CLI 版本匹配的 skill：`smithue-cli skill --print` / `smithue-cli skill --install <dir>`
- 完整命令参考：`smithue-cli list` 实时查询，或插件仓库 `TOOLS.md`。
