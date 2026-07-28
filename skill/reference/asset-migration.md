# 资产迁移 / 项目插件化 recipe

> 何时读：把 `/Game` 里的资产/关卡搬进内容插件（content-only plugin）、或在插件内做目录重组时。
> 权威命令 schema 永远以 `list_tools '{"domain":"Asset"}'` 为准，本文只给流程与决策。

## 核心原则

- **不要磁盘搬移 + CoreRedirects**：对已实例化关卡 Actor、软引用链、Niagara 编译缓存内的软路径覆盖不全 → Actor 丢失 / 场景全黑。**一律走编辑器内 rename**（`move_folder`/`move_paths`/`move_folders`，底层 `IAssetTools::RenameAssets` 会修引用并留 redirector）。
- **迁移是长事务**：HTTP 必然超时，命令仍在跑——参见 `batch-and-dialogs.md`（`get_job_status` 查进度、`confirm` 应答弹窗、别重发）。
- **首次就规划好目标路径**：二次移动（如先迁进插件再分类）会再产生一批难清的 redirector。能一次到位就别分两趟。

## 标准流程

1. **建空内容插件并重启编辑器**：新 mount point（如 `/MyPlugin`）要编辑器启动才挂载。迁移前确认已挂载（`list_plugins` 或 `move_folder` 的 mount 校验通过）。
2. **预演** `plan_migration {source_folder, dest_root}`：迁移前就得到——将产生多少 redirector、哪些引用者**能自动固化** vs **顽固**（World/Blueprint 标红）、`shared_outside_moveset`（被迁移集之外引用，迁走会破坏其他内容）。**先看代价再动手。**
3. **依赖闭包**（迁整张关卡时）`get_dependency_closure {root_assets[], content_prefix:"/Game"}`：递归算闭包 + 标 `shared`。城市级场景闭包可达数千包、含大量共享库——**共享资产迁走会破坏项目其他部分，务必让用户决策**（全迁 / 迁独占+复制共享 / 保留）。
4. **迁移**：
   - 目录级 `move_folder {source_folder, dest_folder}`；多映射一次 `move_folders {mappings:[{source,dest}]}`（一次 RenameAssets，跨集引用一起修，残留更少）；按清单 `move_paths {paths[], dest_root, strip_prefix}`。
   - **World / 关卡单独处理**：`open_map` 打开 → `level_save {level_path:"新路径"}` Save-As → 删旧包。这样绕开关卡的 CDO 确认框，World Partition 外部 Actor 一并迁移。
5. **redirector 清理**（见下方决策树）。
6. **体检收尾**：`find_broken_assets {folder_path}`（0 broken 才算干净）；`delete_empty_folders {root}` 清掉迁空的源目录；打开关卡 `take_viewport_screenshot` 目视确认光照/Actor 正常。

## redirector 清理三档决策树

迁移后源位置留 redirector。**先 `list_redirectors {folder_path}` 分类**，它把每个 redirector 归入三桶，照桶处理：

| 桶 | 含义 | 处理 |
|---|---|---|
| `unreferenced_deletable` | 已无引用者（RenameAssets 已固化硬引用） | `fixup_redirectors {folder_path}` 安全版**直接删** |
| `needs_fixup` | 仍被插件内资产引用（软引用/特殊引用未固化） | 先 `resave_packages` **重存引用者固化引用**，再 `fixup_redirectors` 删 |
| `poison_world_bp_cdo` | 目标是 World / Blueprint 类(`_C`) / CDO(`Default__*_C`) | 用 `redirect_references` 定点重写；**别用 `resolve_redirectors`**（对这些会崩） |

### 为什么这么分（引擎坑，记住别再撞）

- **`fixup_redirectors`**（走 `AssetTools::FixupReferencers`）在 UE5.8 对 World/Blueprint/CDO redirector 稳定 `Assertion IsSet()` 崩溃。故命令**默认只删无引用的**；`force_fixup:true` 才走引擎路径（不安全）。
- **`resolve_redirectors`**（走 `ObjectTools::ConsolidateObjects`）对 World/BP/CDO "毒丸"会弹"合并资产严重问题"并 `EXCEPTION_ACCESS_VIOLATION`。故默认 `skip_poison:true` 跳过并报告，不崩。
- **`ResavePackages -fixupredirects` commandlet 不处理插件包**（默认只扫 `/Game`，`-projectonly` 更是）。所以**插件内**资产持有的 redirector 引用，commandlet 清不掉——这正是 `resave_packages` 存在的理由（编辑器内重存，覆盖插件包）。
- **关卡 actor 对 BP 类的实例引用**：`level_save` / commandlet / ConsolidateObjects 都固化不了。用 `redirect_references {referencers:[关卡], from_asset:redirector, to_asset:真实BP}`（`FArchiveReplaceObjectRef`，含软引用 + BP 生成类/CDO 重映射）。仍搞不定的极少数，保留 redirector 也无害（软引用桥接，不影响运行；打包 cook 会自动剔除 redirector）。

### 引用固化的本质

`resave_packages` 为什么能清 `needs_fixup`：硬引用在内存里已解析到真实对象（经 redirector），**save 时按真实对象的当前路径序列化** → 旧 `/Game` 引用被固化成真实路径，redirector 随即无引用可删。FoliageType 的 Mesh、StaticMesh 的物理材质引用等"特殊引用"都靠这个固化（比逐个 `set_asset_property` 高效）。

## 命令速查

| 阶段 | 命令 |
|---|---|
| 预演 | `plan_migration` · `get_dependency_closure` |
| 迁移 | `move_folder` · `move_folders`(多映射) · `move_paths` · `open_map`+`level_save`(关卡) |
| 固化 | `resave_packages` · `redirect_references` |
| 清理 | `list_redirectors`(先分类) · `fixup_redirectors` · `resolve_redirectors`(skip_poison) |
| 收尾 | `find_broken_assets` · `delete_empty_folders` · `save_all_dirty` |
| 进度/弹窗 | `get_job_status` · `set_dialog_auto_response` · `get_active_dialog`（见 batch-and-dialogs.md）|
