# 资产减负：贴图 · 材质 · Mesh · 骨骼 · 文件整理 · 版本警告

> 何时读：做项目资产体量优化（包体/显存/加载时间）、重复资产去重、目录整理、资产版本警告清理、骨骼断链修复时。
> 命令 schema 以 `list_tools` 现查为准；涉及资产搬移的部分先读 asset-migration.md。

## 次序铁律（顺序错了会返工）

1. **去重先于收编/迁移**：重复资产各自带硬引用闭包，先合并再迁，否则冗余随闭包翻倍拷进目标插件。
2. **先底座后上层**：母材质/材质函数/MPC 所在的公共层先迁，再迁引用它们的上层；反序会让 Migrate 把母材质重复拷入每个上层。
3. **瘦身先于迁移**：贴图降规格等源资产改动先做，迁移搬的是小文件，版本库历史也干净。
4. **一次到位**：目标路径规划好再动手，二次移动产生第二批难清的 redirector。
5. 所有批量写操作先 `dry_run:true` 预览；长任务走 job（`get_job_status` 查进度，见 batch-and-dialogs.md）。

## 各域：检测 → 决策 → 命令

### 贴图（通常是体量最大头）

- 检测：按分辨率/格式分组统计，重点抓 ≥4K 与未压缩格式（B8G8R8A8、FloatRGBA 的 HDRI 是显存杀手——磁盘几 MB、显存几百 MB，别被磁盘大小骗了）。
- 决策：游离大图降 MaxTextureSize；密集平铺材质考虑 Virtual Texture；HDRI/天空球单独评估（降规格视觉影响大）。
- 缺口：无批量贴图命令 → 需 `texture_bulk_optimize {folder_path, max_texture_size, compression, enable_vt, dry_run}`。
- 过渡：headless Python 批处理（`set_editor_property("max_texture_size",...)` + resave）。

### 材质

- 检测：母材质→实例数报表，找实例化率低的母材质与重复母材质（同逻辑多份）。
- 决策：重复母材质合并为唯一份并重指实例父级（`redirect_references`）；材质函数/MPC 下沉公共层。
- ⚠️ 同名 ≠ 同内容：合并前必须确认内容一致（参数默认值可能已分叉），否则合并即全场景外观回归。

### Mesh

- 检测：StaticMesh 重复（尤其 Merged Mesh 产物——合并工具常在不同地图目录各生成一份）。
- 决策：去重后 `redirect_references` 重指；关卡实例引用固化见 asset-migration.md 毒丸桶处理。

### 骨骼 / SkeletalMesh

- 体量：SkeletalMesh 常是单资产体量之王（数百 MB/个）；查顶点数、MorphTarget、导入时未剔除的 LOD 源数据。
- **共享骨架唯一化**：同族车辆/角色应共享一个 Skeleton 资产；多份"相同"骨架会让动画资产各自绑死一份，去重时最优先。
- **骨骼缺失修复**（"missing bone" / 动画不播 / 重定向失败）：
  1. 判因：Skeleton 资产引用断链（asset 丢失/被移动未固化）→ 走 redirector/redirect_references 修引用；还是骨架层级不匹配（Mesh 有骨但 Skeleton 没有）→ 需要合并骨架层级。
  2. 层级不匹配用编辑器 "Assign Skeleton"（会**丢弃**目标骨架没有的骨骼上的蒙皮/动画轨道——先确认可接受）或在 DCC 侧补骨重导。
  3. 修复后抽样播放动画验证（不能只看编译不报错）。
- 缺口：`audit_skeleton_integrity {folder_path}`（扫骨架断链/层级不匹配）+ `reassign_skeleton {targets[], skeleton, dry_run}`。

### 文件整理（目录重组）

- 整理 = 迁移：编辑器内 rename/move 同样产生 redirector，**必须走 asset-migration.md 全流程**（plan_migration 预演 → move_folders → redirector 三桶清理），不要当作"只是挪文件夹"。
- 现有：`move_folders`（多映射一次 rename，残留最少）· `delete_empty_folders` · `list_assets`。
- 缺口：`audit_misplaced_assets {folder_path, rules}`——按命名/类型规则找错放资产（如贴图混在 Mesh 目录）。

### 资产版本警告

- 症状：打开/cook 时刷 "saved with an older version"、deprecated 类型警告；老项目升级引擎后成片出现。
- 分类处理：
  - 纯版本落后 → 批量 `resave_packages` 消除（顺带固化引用，一举两得）；
  - deprecated 类型（随引擎升级被替换的类）→ 需 CoreRedirects 或逐资产转换，见 parent-class-redirect.md；
  - resave 后警告仍在 → 资产内部有真问题（如引用断链），转 `find_broken_assets` 排查。
- 缺口：`audit_asset_versions {folder_path}`——按保存引擎版本/警告类型分组报表。
- 过渡：headless 全量加载一遍，日志过滤 `LogLinker.*version` 聚合。

## Gotchas（追加式维护）

- 磁盘大小 ≠ 显存大小 ≠ Pak 大小：三套口径分别估算，压缩格式差异极大，别用磁盘排序决定显存优化优先级。
- `find_asset` 封顶 100 条且全 /Game 递归——任何"找重复/批量枚举"都必须走 AssetRegistry 按文件夹枚举（100k-safe）。
- 去重合并后必须 `resave_packages` 固化引用者，否则删除冗余份时引用者在下次加载才发现断链。
- 共用资产（被迁移集之外引用）迁走会破坏其他内容——`plan_migration` 的 `shared_outside_moveset` 必须让用户决策。

## SmithUE 功能需求汇总（按 ROI 排序，建议提 issue）

1. `find_duplicate_assets` + `merge_duplicate_assets`（去重当前无自动化，且是次序铁律第一步）
2. `texture_bulk_optimize`（体量最大头；Python 可顶但无 dry_run/报表/进度）
3. `audit_skeleton_integrity` + `reassign_skeleton`（骨骼断链无替代方案）
4. `audit_asset_versions` / `audit_soft_references` / `audit_misplaced_assets`（审计三件套，外部脚本可顶）
5. `get_reference_count_report` + `asset_size_report`（收编决策与报表）

设计要求（对齐 TOOL_SPEC）：`folder_path` 作用域 + `dry_run` 预览 + AssetRegistry 枚举（100k-safe）+ 长任务 job 化。
