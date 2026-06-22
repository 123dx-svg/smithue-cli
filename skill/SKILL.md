---
name: smithue-control
description: Inspect or modify Unreal Engine uasset resources (Blueprints, materials, static meshes, etc.) — and otherwise operate a running UE Editor — from outside via smithue-cli (SmithUE plugin). Triggers: SmithUE, smithue-cli, 操作UE编辑器, 查阅/修改蓝图·材质·静态网格, 蓝图排故. Not for editing UE C++/Build.cs, or when the UE Editor is not running.
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

## ⚠️ Gotchas（必读，按踩坑频率排序）

1. ❌ PowerShell 里直接传 `'{"k":"v"}'` JSON
   ✅ 转义双引号：`'{\"k\":\"v\"}'`
   💡 npm.cmd 会重解析命令行并吞掉未转义的双引号，UE 端收到残缺 JSON。

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
