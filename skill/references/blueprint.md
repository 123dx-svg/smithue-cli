# 蓝图：排故命令目录 · 工具选型 · 批量组件编辑

> 何时读：读/改/排故蓝图，批量设组件属性，或用代码生成蓝图逻辑时。
> 命令 schema 以 `list_tools '{"domain":"Blueprint"}'` 为准。

## 排故命令目录（核心价值）

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

Token 控制：默认 `scope=self`、`detail=compact`、带 `limit`；先看 counts 概览再下钻。

## 蓝图加载成空壳的诊断

蓝图加载后 `parent_class=None`、无变量无组件、IsDataOnly，别以为这一个蓝图坏了：

- 先查它的 C++ 父类模块在当前构建里是否可解析：`bp_get_class_members '{"bp_path":"<NativeClassName>"}'`；对比完好兄弟蓝图 `get_asset_info` 的 tags.ParentClass。
- 典型根因：P4 管理的蓝图继承 Git 分支里的 C++ 父类，切分支后父模块缺失 → 父引用断裂 → 整批退化成空壳。
- **父类改名/换模块/换插件位置的完整修复流程（含 CoreRedirects 语法、固化退役、致命时序陷阱）→ 见 parent-class-redirect.md**（经 UE5.8.1 实验验证）。

## 批量组件编辑 + 文件夹作用域

批量改蓝图组件属性时，**先用内容浏览器当前文件夹作用域，别全工程扫**：

1. `get_content_browser_selection` → 拿当前选中文件夹/资产（返回 `/All/Game/...` 虚拟路径）。
2. 文件夹路径作为 `folder_path` 传给批量命令（内部自动去 `/All` 前缀）。
3. ❌ 不要用 `find_asset` 做全工程枚举——它递归扫 `/Game` 且**封顶 100 条**，10W 蓝图必丢数据。批量命令内部用 AssetRegistry 按文件夹枚举（100k-safe）。
4. 写操作先 `dry_run:true` 预览 → `dry_run:false` 落地 → `save_asset`/`save_all_dirty` 持久化。

| 命令 | 作用 | 关键参数 |
|---|---|---|
| `get_content_browser_selection` | 读内容浏览器当前选中 | 无 |
| `sync_content_browser` | 导航/聚焦到某资产或文件夹 | `{asset_path? \| folder_path?}` |
| `bp_set_component_collision` | 批量设 StaticMeshComponent 碰撞（对象类型+逐通道响应） | `{bp_path? \| folder_path?, object_type, responses, component?, skip_if_no_mesh_collision, dry_run}` |
| `bp_bulk_set_component_property` | 通用批量设组件模板属性（点路径+索引，如 `BodyInstance.bSimulatePhysics`、`OverrideMaterials[0]`）；`include_inherited=true` 改父类继承组件（走子蓝图 ICH override，不动父类） | `{bp_path? \| folder_path?, component_class?, component?, edits:[{property_path,value}], include_inherited, dry_run, defer_compile}` |

注：碰撞按编辑器显示名解析（`Vehicle`/`Pawn`，兼容改名）；先切 profile 为 `Custom` 再设对象类型+响应；无碰撞体的网格自动跳过。

## 工具选型 — bp_compile_code 防误判

| 需求 | 工具 |
|------|------|
| **事件逻辑**（Tick/BeginPlay/Overlap/碰撞/输入） | ❌ 禁用 `bp_compile_code` → 用原子节点 API（见下） |
| **纯函数图**（无事件、数学/调用/赋值，无嵌套 if） | ✅ 可用 `bp_compile_code` |

`bp_compile_code` 硬边界：只编译函数图 `ReturnType Func(Type p,...){...}`，**不支持**事件节点 / 嵌套 if / 非函数调用形式的 math。返回字段 `data.success`——**必须查它**，HTTP 成功不代表编译成功。传事件式代码会返回重定向错误，指向原子节点流程。

> ⚠️ 别为弄清语法去读 `SmithUEBpCompiler.cpp`——`TOOLS.md`/`docs/spec/TOOL_SPEC.md` 已写明边界。先看文档适用范围再决定。

### 事件类蓝图逻辑标准流程（已验证，UE 5.2）

```bash
# 1. 生成事件节点
exec bp_override_function '{"bp_path":"/Game/BP/MyActor","function_name":"ReceiveTick"}'
# 2. 逐个建节点（node_id 是 GUID，后续连线用此 GUID）；function_name 格式 ClassName::FunctionName
exec bp_create_node '{"bp_path":"/Game/BP/MyActor","graph_name":"EventGraph","function_name":"KismetMathLibrary::Sin"}'
# 3. 查准确引脚名（别猜，bp_search 按本地化标题可能搜不到）
exec bp_describe_graph '{"bp_path":"/Game/BP/MyActor","graph_name":"EventGraph"}'
# 4. 批量连线 + 设默认值
exec bp_batch_op '{"bp_path":"...","graph_name":"EventGraph","operations":[{"op":"connect",...},{"op":"set_default",...}]}'
# 5. 编译验证 → 6. 若报"图表已存在"删残留独立函数图 bp_remove_graph → 7. save_asset
exec bp_compile '{"bp_path":"/Game/BP/MyActor"}'
# 8. 放入场景（用 _C 生成类后缀）
exec spawn_actor '{"class":"/Game/BP/MyActor.MyActor_C","location":{"x":0,"y":0,"z":100}}'
```

常用 function_name：`GameplayStatics::GetTimeSeconds`、`KismetMathLibrary::Multiply_DoubleDouble`/`Sin`/`MakeVector`、`SceneComponent::K2_SetRelativeLocation`；取组件值 `K2Node_VariableGet`+`variable_name`；World Context `K2Node_Self`。
常用引脚（UE5.2 实测，升级需复核）：exec 输入 `execute`；`K2_SetRelativeLocation` 目标 `self`、位置 `NewLocation`。

> 引脚名/函数名随引擎版本变，**别硬记**——现查 `bp_describe_graph` 或引擎自带蓝图。
