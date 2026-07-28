---
name: smithue-control
description: 通过 smithue-cli 从外部检查或修改正在运行的 UE 编辑器内容（SmithUE 插件）：查询和编辑蓝图、材质、静态网格、关卡及任意 /Game 资产，读取内容浏览器当前选中或打开的文件夹，执行蓝图排故与编译。凡涉及编辑器里有什么、当前打开或选中的文件夹、某个资产的属性、编辑 UE 内容等场景，一律查运行中的编辑器，不要去读磁盘目录。触发词：SmithUE、smithue-cli、操作 UE 编辑器、当前打开或选中的文件夹、内容浏览器、/Game 资产、列出或查询资产、查阅或修改蓝图材质静态网格、材质 WPO 或节点属性、蓝图排故或编译报错。不适用于编辑 UE 的 C++ 或 Build.cs 源码，以及编辑器未运行时。
---

<!-- smithue-cli v0.10.0+ | SmithUE plugin v1.8.0+ -->

# SmithUE Control：用 smithue-cli 驱动/检查运行中的 UE 编辑器

## 前置 / 适用

- SmithUE 是一个 UE5.2 编辑器插件，通过本地 HTTP 暴露编辑器能力；`smithue-cli` 是其 npm CLI（v0.10.0+）。全局安装 `npm i -g smithue-cli`，或免安装 `npx smithue-cli`。
- 全局、项目无关：端口文件在 `%LOCALAPPDATA%\.smithue\<pid>.port`（Windows-only），任何工作目录都能发现编辑器，换项目无需任何配置。
- **前提（缺一不可）**：
  1. 目标 UE5.2 工程已**安装并启用 SmithUE 插件**（只装 `smithue-cli` 不够——插件才是真正暴露编辑器能力的一端）。**未装插件 → 先提醒用户安装，本 skill 所有命令都无法工作。**
  2. **UE 编辑器正在运行**（状态栏 SmithUE 绿点）。每次操作前先 `smithue-cli status` 确认 `ready:true`，没就绪就停。

## 发现与调用（4 步，权威自描述）

```powershell
npx smithue-cli status                                        # 1. 发现运行中的编辑器：port/pid/project/ready
npx smithue-cli search <关键词>                                # 2. 按意图定位工具：搜 name+description（跨所有域），如 collision/material/spawn
npx smithue-cli list                                          # 2b. 或先列功能域（23 domains / 211 tools）
npx smithue-cli exec list_tools '{\"domain\":\"Blueprint\"}'  # 3. 拿目标域全部命令 + 参数 schema（权威，不靠记忆）
npx smithue-cli exec <command> '<json-params>'                # 4. 调用任意命令
```

不知道用哪个工具 → 先 `search <关键词>` 按意图召回；知道域 → `list_tools` 看全量。参数永远以第 3 步 schema 为准、不靠记忆（`search` 是字面子串匹配，搜不到就换同义词或改用 `list_tools`）。

全局选项：
- `--terse`：压缩 JSON 省 token（AI 调用推荐默认带上）
- `--out <file>`：大输出写文件，避免刷爆上下文
- `--pid <n>` / `--project <name|path>`：多个编辑器同时运行时选实例（v0.10.0+ 支持名字模糊匹配）
- `--strict`：CI/脚本模式，多实例时强制报错而非自动选最近实例

## 多实例管理（v0.10.0+ 新增）

**默认行为**：多个编辑器运行时，CLI 自动选择**最近连接**的实例，并在 stderr 打印选中提示：
```
[smithue] selected PID 1234 MyProject (most recent)
```

**钉住默认实例**（`smithue-cli use`）：
```powershell
smithue-cli use --pid 1234         # 钉住 PID 1234 作为默认
smithue-cli use --project MyProj   # 按名字/basename 钉住
smithue-cli use --clear            # 解除钉住
```

**严格模式**（CI / 脚本）：
```powershell
smithue-cli --strict exec ping {}  # 多实例时硬报错，不自动选
# 或：
$env:SMITHUE_STRICT=1; smithue-cli status
```

## 内容路径 vs 磁盘路径（语义区分，最高频踩坑）

**"文件夹 / 资产 / 内容" 默认指 UE 编辑器内部状态，不是 OS 磁盘目录。** 涉及 UE 内容时一律走 smithue-cli 查**运行中的编辑器**，**不要用 `view`/`ls`/`Get-ChildItem` 去读磁盘工程目录**（`F:\...\Content`）。

- 「**当前打开 / 选中的文件夹**下有什么」→ `get_content_browser_selection`（返回 `selected_folders` 的真实 `/Game/...` 包路径，以及 `selected_folders_virtual`）→ 再用 `scan_assets` / `list_assets` 列该路径下的资产。
- 内容路径形如 `/Game/BP/Foo`（包路径）；磁盘路径形如 `F:\Proj\Content\BP\Foo.uasset` —— **工具吃的是前者**。
- 判定口诀：问"引擎里有什么 / 选了什么 / 某资产的属性"→ smithue-cli（编辑器状态）；问"仓库源码 / `.uplugin` / `.cpp` 文件"→ 才读磁盘。

## ⚠️ Gotchas（必读，按踩坑频率排序）

1. ❌ PowerShell 里直接传 `'{"k":"v"}'` JSON（各版本行为不同，会吞引号/拆参数）
   ✅ 改用 `--stdin` 或 `--params-file`，完全绕开 shell 引号解析：
   ```powershell
   # --stdin（推荐，适用于 PS 5.1 / 7+ / cmd / bash）
   Get-Content params.json -Raw | npx smithue-cli exec <command> --stdin
   # 简写：用 "-" 作为 params 参数
   Get-Content params.json -Raw | npx smithue-cli exec <command> -
   # --params-file：直接读文件
   npx smithue-cli exec <command> --params-file params.json
   ```
   ✅ 或者转义双引号（旧做法）：`'{\"k\":\"v\"}'`
   💡 `--stdin` / `--params-file` 是 shell 版本无关的推荐方式；三种来源互斥，多填一个报错（exit 1）。

2. ❌ 假设所有命令都用 `bp_path` 参数
   ✅ 部分命令参数名不同：`bp_get_compile_errors` 用 `blueprint_path`；`find_asset` 用 `name_pattern`；`get_actor_property` 用 `actor_label`。先 `list_tools` 查 schema。
   💡 历史原因命名不统一，靠记忆必踩坑。

3. ❌ CLI 报 "No portfiles found"，但编辑器明明在运行
   ✅ v0.10.0+ 错误消息已内置兜底命令：直接复制错误中的 `curl` 命令验证连通性。也可手动：
   ```powershell
   curl -s http://127.0.0.1:<port>/api/v1/execute -d '{"command":"ping","params":{}}'
   ```
   检查编辑器状态栏 SmithUE 绿点；端口目录 `%LOCALAPPDATA%\.smithue\`；或 `SMITHUE_PORT=<port>` 直连。
   💡 v0.9.x 健康检查有 bug 会误删端口文件（v0.9.0+ 已修）。

4. ❌ 用淘宝镜像 registry 发布 CLI
   ✅ 发布必须指定官方源：`npm publish --registry https://registry.npmjs.org`
   💡 镜像源只读，publish 会失败。

5. ❌ 蓝图加载成空壳（parent_class=None、无变量无组件、IsDataOnly）就以为这一个蓝图坏了
   ✅ 先查它的 C++ 父类所在模块在当前构建里是否可解析：`bp_get_class_members '{\"bp_path\":\"<NativeClassName>\"}'`；再对比完好兄弟蓝图 `get_asset_info` 返回 tags 里的 ParentClass。
   💡 P4 管理的蓝图继承 Git 分支里的 C++ 父类；切分支后父模块缺失，蓝图父引用断裂，整批退化成空壳。

6. ❌ 改完插件 C++ 命令后，连到旧编辑器进程还期望看到新命令
   ✅ 必须重启编辑器（启动时自动重编译并加载新 DLL）。

7. ❌ 解析错误输出时用正则匹配文本
   ✅ v0.10.0+ 错误统一为机器可读 envelope（stderr JSON）：
   ```json
   {"ok":false,"error":{"message":"...","code":2,"exit":2,"hint":"...","fallback_cmd":"curl ..."}}
   ```
   直接读 `error.code` / `error.fallback_cmd` 分支，不用正则。

## 批量资产操作 / 迁移（长命令 · 弹窗 · redirector）

**长命令**（`move_folder`/`move_paths`/`resave_packages`/`fixup_redirectors`/`resolve_redirectors` 等）在 game thread 同步执行，HTTP 会超时——这是正常的，命令仍在跑：
- 用 `get_job_status {}`（**worker-safe**，game thread 忙时仍响应）轮询实时进度，别靠猜日志，**别重发**（会排第二次执行）。
- 批量前 `set_dialog_auto_response {mode:"confirm"}` 自动点肯定按钮（跨语言，处理 RenameAssets 的 CDO 确认框）；**重启编辑器后 auto_response 会重置，需重新 arm**。弹窗同为 worker-safe：`get_active_dialog` / `dismiss_active_dialog` 在 game thread 卡住时仍可查/应答。
- CJK 参数经 Windows 管道易损坏 → 优先 `--params-file`（显式 utf8）最稳。

**内容插件化迁移**：不要磁盘搬移 + CoreRedirects（覆盖不全，易致 Actor 丢失/场景全黑），一律走编辑器内 rename。典型流程：
1. `plan_migration` 预演：redirector 预估 + 顽固引用者（World/Blueprint）预警。
2. `move_folder` / `move_paths` / `move_folders`（多映射）迁移；World 关卡用 `open_map` + `level_save {level_path}` Save-As，绕开关卡 CDO 框。
3. redirector 清理三档：`list_redirectors` 先分类 → 无引用的 `fixup_redirectors` 直接删；有引用的 `resave_packages` 固化引用者后再删；World/BP/CDO 顽固项用 `redirect_references`（`resolve_redirectors` 对这些会崩，默认 `skip_poison` 已跳过）。
4. `find_broken_assets` 体检 + `delete_empty_folders` 收尾。

## 蓝图排故命令目录（核心价值）

| 命令 | 返回内容 | 关键参数 |
|---|---|---|
| `bp_get_summary` | 元数据/组件层级/变量/函数/接口（仅本类） | `{bp_path}` |
| `bp_get_class_members` | 成员按归属类分组 + 完整 C++ 继承链 (v1.5.0+) | `{bp_path, scope:self\|chain\|owner:X, kinds, detail, limit}` |
| `bp_get_component_details` | 组件 Mobility/Transform/Absolute/Physics/Mesh/材质/碰撞 (v1.6.0+) | `{bp_path, component?, props?, include_inherited}` |
| `bp_health_check` | 聚合体检：编译错误+断脚+断引用+孤立节点 (v1.7.0+) | `{bp_path, checks?, limit}` |
| `bp_diff` | 两蓝图结构差异 (v1.7.0+) | `{bp_path_a, bp_path_b, aspects?}` |
| `bp_trace_value` | 数据流回溯 (v1.7.0+) | `{bp_path, graph_name, node, pin?, direction?, max_depth?}` |
| `bp_describe_graph` | 图节点列表 | `{bp_path, graph_name, mode:full\|compact\|summary}` |
| `bp_search` | 按名称/类型搜节点 | `{bp_path, name?, type?, limit}` |
| `bp_get_compile_errors` | 编译错误/警告 | `{blueprint_path}` ← 注意参数名 |
| `bp_reparent` | 改父类 | `{bp_path, new_parent_class}` |

除 Blueprint 外还有 Material/Asset/Editor/Niagara/Level/Data/Sequencer/PIE/Animation/Input/UMG/Observation/Viewport/Environment/Interaction/Curve/RenderTarget/Physics/Debug/System/Project/Analysis 等域（共 23 域 / 211 工具），用 `list` + `list_tools` 探索，不要靠记忆。

## 批量编辑 / 写操作 + 文件夹作用域（重要）

批量改蓝图组件属性时，**先用内容浏览器当前文件夹作用域，别全工程扫**：

1. `get_content_browser_selection` → 拿当前选中的文件夹/资产（返回 `/All/Game/...` 虚拟路径）。
2. 把文件夹路径作为 `folder_path` 传给批量命令（命令内部会自动去掉 `/All` 前缀）。
3. ❌ 不要用 `find_asset` 做「全工程枚举」——它递归扫 `/Game` 且**封顶 100 条**，10W 蓝图必丢数据。批量命令内部用 AssetRegistry 只读元数据按文件夹枚举（100k-safe）。
4. 写操作先 `dry_run:true` 预览，确认无误再 `dry_run:false` 落地，最后 `save_asset` 持久化。

| 命令 | 作用 | 关键参数 |
|---|---|---|
| `get_content_browser_selection` | 读内容浏览器当前选中文件夹/资产 | 无 |
| `sync_content_browser` | 把内容浏览器导航/聚焦到某资产或文件夹 | `{asset_path? \| folder_path?}` |
| `bp_set_component_collision` | 批量设 StaticMeshComponent 碰撞（对象类型+逐通道响应），单 BP 或文件夹一层 | `{bp_path? \| folder_path?, object_type=Vehicle, responses:{Pawn:Ignore}, component?, skip_if_no_mesh_collision=true, dry_run}` |
| `bp_bulk_set_component_property` | 通用批量设组件模板属性：点路径+索引（`BodyInstance.bSimulatePhysics`、`OverrideMaterials[0]`）+ 碰撞/网格/材质语义 setter，单 BP 或文件夹一层；`include_inherited=true` 改父类继承组件（走子蓝图 ICH override 模板，不动父类） | `{bp_path? \| folder_path?, component_class?, component?, edits:[{property_path,value}], include_inherited, dry_run, defer_compile}` |
| `save_asset` / `save_all_dirty` | 保存改动到磁盘 | `{asset_path}` / 无 |

注：碰撞按编辑器显示名解析（`Vehicle`/`Pawn`，兼容工程改名）；会先把 profile 切 `Custom` 再设对象类型+响应；「原模型无碰撞」（无简单碰撞体且非 Use-Complex-As-Simple）的网格自动跳过。

## Token 控制

- 默认用 `scope=self`、`detail=compact`、带 `limit`；先看 counts 概览再下钻具体成员。
- 始终加 `--terse`；大结果用 `--out <file>` 落盘后按需读取。

## 获取最新 Skill

v0.10.0+ 起，skill 随 CLI 仓库版本化发布。获取与当前 CLI 版本匹配的 skill：
```powershell
smithue-cli skill --print     # 打印 SKILL.md 内容
smithue-cli skill --install C:\Users\you\.agents\skills\smithue-control  # 安装到指定目录
```

## 维护

- 插件仓库：github.com/123dx-svg/SmithUE
- CLI 仓库：github.com/123dx-svg/smithue-cli（npm 包名 `smithue-cli`）
- 完整命令参考：`smithue-cli list` 实时查询，或看插件仓库 TOOLS.md。

## 企业级资产装配与合规引擎工作流

SmithUE v1.10.0 起，smithue-cli 提供以下高层工作流命令，构建在已有原子工具之上。

### 前提：宿主工程配置

在宿主工程根创建 `smithue.config.json`（不进 npm 包）：
```json
{
  "specsDir": ".smithue/specs",
  "devContentRoot": "/Game/SmithUETest",
  "ownership": {
    "include": ["/Game/MyStudio/**"],
    "exclude": ["/Game/ThirdParty/**", "/Game/UltraDynamicSky/**"]
  }
}
```

### 规范生成（零学习成本，普通用户不手写 JSON）

**方式 A：spec infer（从黄金 BP 反推草稿）**
```powershell
# TA 手工做一个合规 BP，工具自动反推规范草稿
smithue-cli spec infer --from /Game/MyStudio/Props/BP_Crate_Golden --out .smithue/specs/prop.json
# 然后人工确认 naming.pattern（标 needs-confirm 的字段）
```

**方式 B：AI 生成**
> 向 AI agent 说人话描述规范（“道具蓝图，继承 BP_PropBase，BlockAll 碰撞”），
> AI 读 `smithue-cli/schemas/spec.schema.json` 生成草稿 → 校验器自检 → 用户审阅。
> **普通用户不手写 JSON。**

### factory：批量生成合规蓝图（dry-run）

```powershell
# dry-run：预览将创建的 BP（不写入）
smithue-cli factory --spec prop --dry-run --out plan.json

# 查看计划
cat plan.json  # operations: [{type:"create_bp",...}, {type:"skip_existing",...}]
```

> v1 注意：`--apply` 尚未实现；使用 dry-run 规划后由 AI agent 调用原子工具执行。

### lint：合规审计（report-only）

```powershell
# 审计并输出报告
smithue-cli lint --spec prop --out report.json

# CI 模式（有违规时退出码非 0）
smithue-cli lint --spec prop || echo "COMPLIANCE VIOLATIONS FOUND"
```

报告格式包含：`findings`（违规列表）、`unverifiable`（继承盲区）、`checked_assets`（已检查数）。

### spec 文件格式参考

spec 文件存宿主工程（git 追踪，不进 npm 包）：
```json
{
  "schemaVersion": "1.0.0",
  "id": "prop",
  "name": "道具蓝图规范",
  "ownership": { "folderGlobs": ["/Game/MyStudio/Props/**"] },
  "rules": {
    "naming": { "pattern": "^BP_.+", "required": true },
    "parentClass": { "allowlist": ["/Script/Engine.Actor"], "required": true },
    "components": [{
      "name": "StaticMeshComponent", "class": "StaticMeshComponent",
      "required": true, "mobility": "Static", "collisionProfile": "BlockAll",
      "materialSlotsFilled": true
    }]
  }
}
```

完整 schema → `smithue-cli/schemas/spec.schema.json`

## 蓝图工具选型 — 防误判指南 (Blueprint Tool Selection Anti-Misjudgment)

### 决策规则（先读这条）

| 需求 | 工具 |
|------|------|
| **事件逻辑**（Tick/BeginPlay/Overlap/碰撞/输入等） | ❌ 禁用 `bp_compile_code` → 用原子节点 API（见下方标准流程） |
| **纯函数图**（无事件、数学/调用/赋值，无嵌套 if） | ✅ 可用 `bp_compile_code` |

### `bp_compile_code` 硬边界（当前插件版本）

- **只能编译函数图** `ReturnType FuncName(Type param, ...) { ... }`，**不支持**事件节点。
- **不支持** Event Tick / 任何事件节点；**不支持**嵌套 if；math 必须是函数调用形式。
- 语法形式：`ParseSignatureText` 读 `(` 前最后两个 token 为 returntype + funcname；`->` 和 `function` 关键字均**不是**语法。
- 传入事件式代码（`event Tick() {...}`）时会返回带重定向的错误，指向原子节点工作流。
- 返回字段：`data.success`（即使 HTTP 请求本身成功，编译失败时为 false）——**必须检查 `data.success`**，不能只看外层 status。

> ⚠️ 别为弄清它的语法去读 `SmithUEBpCompiler.cpp`——`TOOLS.md` 已写明 "FUNCTION graphs only"。先看文档适用范围，再决定，不要先扎进 .cpp。

### 事件类蓝图逻辑标准流程（已验证，UE 5.2）

```bash
# 1. 在 EventGraph 生成事件节点（如 Event Tick）
npx smithue-cli exec bp_override_function '{"bp_path":"/Game/BP/MyActor","function_name":"ReceiveTick"}'

# 2. 逐个建节点（node_id 是 GUID，nid_stale:true → 后续连线一律用此 GUID）
#    function_name 格式：ClassName::FunctionName
npx smithue-cli exec bp_create_node '{"bp_path":"/Game/BP/MyActor","graph_name":"EventGraph","function_name":"KismetMathLibrary::Sin"}'

# 3. 查准确引脚名（不要猜，bp_search 按本地化标题可能搜不到）
npx smithue-cli exec bp_describe_graph '{"bp_path":"/Game/BP/MyActor","graph_name":"EventGraph"}'

# 4. 批量连线 + 设默认值
npx smithue-cli exec bp_batch_op '{"bp_path":"/Game/BP/MyActor","graph_name":"EventGraph","operations":[{"op":"connect","params":{...}},{"op":"set_default","params":{...}}]}'

# 5. 编译验证
npx smithue-cli exec bp_compile '{"bp_path":"/Game/BP/MyActor"}'

# 6. 若报"名为 'ReceiveTick' 的图表已存在"→ 删残留独立函数图再编译
npx smithue-cli exec bp_remove_graph '{"bp_path":"/Game/BP/MyActor","graph_name":"ReceiveTick"}'

# 7. 保存
npx smithue-cli exec save_asset '{"asset_path":"/Game/BP/MyActor"}'

# 8. 放入场景（用 _C 生成类后缀）
npx smithue-cli exec spawn_actor '{"class":"/Game/BP/MyActor.MyActor_C","location":{"x":0,"y":0,"z":100}}'
```

**常用节点 function_name 格式（经验证）：**
- `GameplayStatics::GetTimeSeconds`
- `KismetMathLibrary::Multiply_DoubleDouble` / `Sin` / `MakeVector`
- `SceneComponent::K2_SetRelativeLocation`
- 组件取值：`K2Node_VariableGet` + `variable_name`
- World Context：`K2Node_Self`

**常用引脚名（UE 5.2 实测，engine 升级时需复核）：**
- exec 输入引脚：`execute`
- `K2_SetRelativeLocation` 目标：`self`，位置：`NewLocation`

### 通用调用约定（易踩）

```powershell
# ✅ 正确：单引号包裹扁平 JSON（不要包成 {"params":{...}}）
npx smithue-cli exec bp_compile_code '{"bp_path":"/Game/BP/X","code":"void Add(){}"}'

# ❌ 错误：多行 here-string 的 JSON 会被换行拆断——压成单行
# ❌ 错误：包成 {"params":{...}} 结构
```

- **端口动态**：读 `%LOCALAPPDATA%\.smithue\<pid>.port`（过滤 `project_name`），非固定 13721。
- 偶发 "instance unreachable" / "engine is saving or GC" → 等几秒重试。
- 详见插件 `docs/spec/TOOL_SPEC.md §3.1`（描述自描述边界规范）与 `PITFALLS.md #14`。

## 材质工具 — 防踩坑速查（输入索引 & 节点属性键）

> 这两表 TOOLS.md 没列全，靠猜必踩坑。以下来自源码 `GetMaterialBaseInput()` / `HandleSetExpressionProperty()` 实测，可直接用。

### `connect_material_pins` 的 `dest_input_index`（材质主输出引脚）

| index | 输出引脚 |
|---|---|
| 0 | BaseColor |
| 1 | Metallic |
| 2 | Roughness |
| 3 | Normal |
| 4 | EmissiveColor |
| 5 | Opacity |
| 6 | OpacityMask |
| **7** | **WorldPositionOffset（WPO）** ← TOOLS.md 只写到 6，但 **7 支持！** |

> 8 及以上不支持（返回 nullptr → 连线失败）。WPO 自旋/顶点动画就连 `dest_input_index: 7`。

### `set_expression_property` 按节点类型的合法 `properties` 键

传错键**不报"非法键"**，只在**一个键都没匹配上**时回 `"No recognized properties were set"`（不会告诉你正确键名）——所以必须按下表传：

| 节点类型 | 合法键 |
|---|---|
| 所有节点 | `description` |
| **Constant** | `value`（**不是** `R` / `r`！） |
| Constant3Vector | `r` `g` `b` |
| ScalarParameter | `parameter_name` `default_value` |
| VectorParameter | `parameter_name` `r` `g` `b` `a` |
| CollectionParameter | `collection` `parameter_name` |
| MaterialFunctionCall | `material_function` |
| TextureSample | `sampler_type`（Color/Normal/Masks/Alpha/Grayscale/LinearColor/LinearGrayscale） `texture` |
| Custom（HLSL） | `code` `output_type`（float/float1/float2/float3/float4） `inputs`[{name}] |
| 带 SceneTextureId 的节点 | `scene_texture_id`（PPI_* 或 snake_case，如 `scene_color`/`custom_depth`） |

> **不支持的**（无 handler，静默忽略）：Transform 节点的"空间(space)"设置、上表未列的节点属性。

### 原子工具覆盖不到的高层效果（引导式，不写死配方）

WPO 自旋 / 顶点动画 / 自定义算法这类原子工具拼不出的效果，标准做法是：

1. 用 **Custom 节点**承载逻辑（`set_expression_property` 设 `code` / `output_type` / `inputs`）；
2. 输出连 `connect_material_pins` 的 `dest_input_index: 7`（WorldPositionOffset）；
3. 用 **`compile_material` 闭环验证**——编译报错会逐步指出问题，照着改。

> ⚠️ **不要在 SKILL / 对话里硬记某个 HLSL intrinsic 或 UE 版本特有 API**（如某个 `Transform*` / `GetLocalPosition` 之类函数名）——它们随引擎版本变化，写死只会误导。需要具体函数名时**让 Agent 现查**：看引擎自带材质的 HLSL、官方文档，或直接读 `compile_material` 的报错逐步纠正。SKILL 只负责给出"原子拼装 + compile 验证"的**方法**，不负责给"某版本能跑的固定模板"。
