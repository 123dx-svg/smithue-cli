# 父类丢失 / 坏蓝图修复：C++ 类改名·换模块·换插件位置

> 何时读：蓝图/结构体继承 Source 或 Marketplace 插件的 C++ 类，迁移/升级后父类丢失、蓝图变空壳、
> `VerifyImport: Failed to find script package` 报错时。
> 本文结论经 UE 5.8.1 完整实验验证（插件位置移动 / 插件+类改名 / CoreRedirects 修复 / 固化退役全链路均通过）。

## 判定决策树（先分清是哪种"父类丢失"）

```
蓝图父类丢失
├─ 只是插件磁盘位置变了（引擎 Marketplace ↔ 项目 Plugins，模块名/类名没变）
│    → ✅ 什么都不用修。父类引用是 /Script/<模块名>.<类名>，与磁盘位置无关（已实验验证）。
│      蓝图仍坏 → 说明插件没编译/没启用，查 .uproject Plugins 数组 + Binaries 是否存在。
├─ 模块名或类名变了（插件改名、类改名、类挪到别的模块）
│    → 用 CoreRedirects（下节），加载时重定向，数据零丢失。
└─ 蓝图已经变成空壳且被保存过（parent=None 状态下有人 Ctrl+S）
     → 数据已永久丢失，reparent/redirect 都救不回。只能从版本库(P4/Git)回滚 uasset 再走上一条。
```

**判断"坏没坏"的日志特征**（headless 或编辑器 log）：
```
LogLinker: Warning: [AssetLog] ...uasset: VerifyImport: Failed to find script package for import object 'Package /Script/旧模块名'
LogLinker: Warning: ...: CreateExport: Failed to load Class /Script/旧模块.旧类 as Parent for BlueprintGeneratedClass ... - both will fail to load
```

## CoreRedirects 修复（改名/换模块的标准解）

写进**项目** `Config/DefaultEngine.ini`（改名提交时就应随代码一起提交，做到"事前预防"）：

```ini
[CoreRedirects]
; 类改名/换模块（最常用；蓝图父类、K2Node 引用都覆盖）
+ClassRedirects=(OldName="/Script/OldModule.OldClassName",NewName="/Script/NewModule.NewClassName")
; C++ 结构体/枚举被 UserDefinedStruct·蓝图引脚引用时
+StructRedirects=(OldName="/Script/OldModule.OldStruct",NewName="/Script/NewModule.NewStruct")
+EnumRedirects=(OldName="/Script/OldModule.EOld",NewName="/Script/NewModule.ENew")
; 整个模块改名且内部大量类型同步搬移时可用包级
+PackageRedirects=(OldName="/Script/OldModule",NewName="/Script/NewModule")
; 函数改名（蓝图 CallFunction 节点）
+FunctionRedirects=(OldName="OldClass.OldFunc",NewName="NewClass.NewFunc")
```

要点：
- `ClassRedirects` 的 OldName/NewName 用 `/Script/模块.类名`，**类名不带 A/U/F 前缀**。
- 生效时机是**资产加载那一刻**——所以必须在任何人以断裂状态打开并保存蓝图**之前**配好。
- 属性改名用 `+PropertyRedirects=(OldName="Class.OldProp",NewName="NewProp")`，否则子蓝图覆盖的默认值会丢。

## 固化与退役（防止 ini 无限膨胀）

1. redirect 生效后，**批量重存**受影响蓝图，把新父类路径写进 uasset：
   - SmithUE 在线：`resave_packages {folder_path}`（插件包也能覆盖，commandlet 不行）
   - 离线批量：`UnrealEditor-Cmd <proj> -run=ResavePackages -PackageFolder=/Game/xxx`（注意：不处理插件内容包）
2. 验证固化：直接 grep uasset 二进制——应只含新路径：
   ```powershell
   [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes("...\BP_X.uasset")).Contains("/Script/OldModule")  # 应为 False
   ```
3. 删除 CoreRedirects 条目 → 再验证一次加载正常 → redirect 退役完成。

## ⚠️ 致命时序陷阱（必须先讲给协作者）

**空壳蓝图一旦在父类不可解析状态下被保存，变量/组件/默认值覆盖永久丢失。**
发现父类丢失 → 全员停止保存该目录任何资产 → 配 CoreRedirects → 重启编辑器验证完整 → 才允许继续工作。
Git(C++ 多分支)/P4(蓝图单版本) 双库团队尤其危险：切分支导致父模块缺失时，P4 侧美术打开蓝图就可能触发。

## 无编辑器窗口的快速体检（headless，适合批量/CI）

```powershell
& "<Engine>\Binaries\Win64\UnrealEditor-Cmd.exe" <proj>.uproject -run=pythonscript -script=check.py -unattended -nosplash
```
check.py 核心：`unreal.load_class(None, bp_path + ".BP_X_C")` 返回 None 即父链断裂；
能拿到 CDO 且 `get_editor_property` 读回子类覆盖值 = 完好。结果写文件（commandlet 的 print 不进 stdout）。

## SmithUE 在线命令对照（编辑器运行时）

| 阶段 | 命令 |
|---|---|
| 批量找坏 | `find_broken_assets {folder_path}` · `bp_health_check {bp_path}` |
| 诊断根因 | `bp_get_class_members`（查 C++ 父类是否可解析）· `get_asset_info`(tags.ParentClass) |
| 正式换父类 | `bp_reparent {bp_path, new_parent_class}`（redirect 修复后想永久指新类时） |
| 固化 | `resave_packages {folder_path}` |
| 收尾 | `find_broken_assets` 归零 · `save_all_dirty` |

## 相关说明

- 装机版引擎给引擎目录加插件：必须 `RunUAT BuildPlugin -Rocket` 预编译（项目构建不编引擎目录插件源码）
- 空壳诊断另见 blueprint.md「蓝图加载成空壳的诊断」；资产搬移（非类改名）见 asset-migration.md
