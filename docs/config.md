# smithue.config.json 配置说明

## 1. 概述

`smithue.config.json` 是存放于**宿主工程根目录**的本地配置文件，描述 SmithUE CLI 的运行行为：spec 目录位置、开发安全根路径、以及资产所有权白名单。

**重要**：此文件属于宿主工程（随 git 提交），**不进 npm 包**。不同项目有各自的配置，smithue-cli 发布物中不包含任何 studio 专属设置。

---

## 2. 发现顺序

CLI 从**当前工作目录**向上逐级查找 `smithue.config.json`，直到文件系统根目录为止（类似 ESLint / tsconfig.json 的向上查找机制）。

查找顺序示例（当前目录 `D:\Projects\MyGame\Content\Characters`）：

```
D:\Projects\MyGame\Content\Characters\smithue.config.json   ← 优先
D:\Projects\MyGame\Content\smithue.config.json
D:\Projects\MyGame\smithue.config.json                      ← 通常放这里
D:\Projects\smithue.config.json
D:\smithue.config.json
```

找到第一个即停止，不合并多层配置（v1 行为；级联合并为 Phase 2）。

---

## 3. 字段说明

### `specsDir` *(必须)*

```json
"specsDir": ".smithue/specs"
```

spec 文件所在目录，相对于宿主工程根目录，或绝对路径。

- **v1 限制**：单一集中目录，CLI 不递归子目录合并；文件夹级局部覆盖（级联模型）为 Phase 2。
- CLI 不会在此目录之外读取 spec 文件。

---

### `devContentRoot` *(可选，默认 `/Game/SmithUETest`)*

```json
"devContentRoot": "/Game/SmithUETest"
```

开发期 factory / lint 操作的安全根路径。所有创建/修改资产的操作默认限定在此路径下，防止误操作生产内容。

- 只影响开发期操作，不影响只读工具（如 `list`、`status`）。
- 可设为 `""` 以禁用安全限制（不推荐）。

---

### `ownership.include` *(可选)*

```json
"ownership": {
  "include": ["/Game/MyStudio/**"]
}
```

studio 拥有的 `/Game` 路径 glob 列表。factory / lint 只对命中 `include` 且未被 `exclude` 排除的路径执行写操作。

**保守默认**：若路径未在 `include` 列表内，视为**非本 studio 所有**，CLI 拒绝对其执行写操作。即 *"未明确声明拥有 = 不拥有"*。

---

### `ownership.exclude` *(可选)*

```json
"ownership": {
  "exclude": ["/Game/UltraDynamicSky/**", "/Game/ThirdParty/**"]
}
```

第三方 / 供应商路径 glob 列表。即使某路径命中了 `include`，只要也命中 `exclude`，就**硬排除**，CLI 拒绝任何写操作。

---

## 4. 所有权白名单机制

factory / lint 在执行写操作前，对每个目标路径进行所有权判定：

```
允许写操作 = 命中 include 中至少一条 glob
           AND 未命中 exclude 中任何一条 glob
```

| include 命中 | exclude 命中 | 结果 |
|:---:|:---:|:---:|
| ✅ | ❌ | **允许** |
| ✅ | ✅ | **拒绝**（硬排除优先） |
| ❌ | 任意 | **拒绝**（保守默认） |

**保守默认**的意义：宁可误报"你没有权限"，也不误操作不属于本 studio 的资产。

---

## 5. v1 限制

| 功能 | v1 状态 | 计划 |
|---|---|---|
| specsDir 集中单目录 | ✅ 已支持 | — |
| 文件夹级局部 config 覆盖（级联模型） | ❌ 不支持 | Phase 2 |
| 多 specsDir 合并 | ❌ 不支持 | Phase 2 |
| ownership glob 通配符完整支持 | ✅ 已支持（minimatch） | — |

---

## 6. 第三方插件保护

Studio 通常在 `/Game` 下同时有自研内容和购买的第三方插件（如 UltraDynamicSky、Fab Marketplace 资产）。这些资产**不应被 factory/lint 修改**，原因：

- 第三方资产不受 studio git 管控，修改后难以回滚
- 插件更新会覆盖修改
- 误改可能破坏购买资产的授权状态

推荐将所有已知第三方资产路径加入 `exclude`：

```json
"ownership": {
  "exclude": [
    "/Game/UltraDynamicSky/**",
    "/Game/KitBash3D/**",
    "/Game/Fab/**",
    "/Game/ThirdParty/**",
    "/Game/Plugins/**"
  ]
}
```

---

## 7. 完整示例

```json
{
  "specsDir": ".smithue/specs",
  "devContentRoot": "/Game/SmithUETest",
  "ownership": {
    "include": ["/Game/MyStudio/**"],
    "exclude": [
      "/Game/UltraDynamicSky/**",
      "/Game/ThirdParty/**",
      "/Game/Plugins/**"
    ]
  }
}
```

> **注意**：`include` / `exclude` 中的路径均为**示例占位**，请替换为实际 studio 的内容路径。

---

## 8. JSON Schema

配置文件遵循 `schemas/config.schema.json`（JSON Schema draft-07），可用 ajv 或支持 `$schema` 字段的编辑器进行校验：

```json
{
  "$schema": "./node_modules/smithue-cli/schemas/config.schema.json",
  "specsDir": ".smithue/specs"
}
```
