# SmithUE Spec 文件格式 v1

本文定义 smithue-cli 侧可读取的 SmithUE 规则 spec 文件格式 v1。该格式用于描述可由现有 SmithUE 读回原语稳定观测的蓝图与资产合规规则，供后续 spec 加载器与 linter 使用。本文只描述格式与示例，不固化任何真实团队或项目规范。

## 文件位置与版本

- JSON Schema: schemas/spec.schema.json
- 当前格式版本: schemaVersion = 1.0.0
- Schema draft: JSON Schema draft-07

每个 spec 文件必须是 UTF-8 JSON，并包含 schemaVersion、id、name、rules 四个顶层字段。

## 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| schemaVersion | string | 是 | 固定为 1.0.0。加载器应拒绝缺失或不匹配的版本。 |
| id | string | 是 | 规则集短 ID，建议使用小写字母、数字与连字符，例如 prop。 |
| name | string | 是 | 面向人的规则集名称，可使用中文。 |
| description | string | 否 | 规则集说明。示例 fixture 只使用占位规则，不代表真实 studio 规范。 |
| ownership.folderGlobs | string[] | 否 | 此 spec 适用的内容路径 glob，例如 /Game/SmithUETest/**。 |
| rules | object | 是 | v1 可观测规则集合。 |

## rules 字段

### rules.naming

用于表达 BP 或资产命名规则。

| 字段 | 类型 | 说明 |
|---|---|---|
| pattern | string | 正则表达式字符串，例如 ^BP_.+。加载器只校验类型，正则语义由后续 linter 解释。 |
| required | boolean | 是否必须满足该命名规则。 |

对应 T1 规则 1：BP 命名模式。

### rules.outputFolder

用于表达输出目录或资产所在目录规则。

| 字段 | 类型 | 说明 |
|---|---|---|
| path | string | 期望内容路径，例如 /Game/SmithUETest。 |
| required | boolean | 是否必须位于该路径下。 |

对应 T1 规则 2：输出文件夹。

### rules.parentClass

用于表达蓝图父类或基类白名单。

| 字段 | 类型 | 说明 |
|---|---|---|
| allowlist | string[] | 允许的父类路径，例如 /Script/Engine.Actor。 |
| required | boolean | 是否必须命中白名单。 |

对应 T1 规则 3：父/基类。

### rules.components[]

用于表达自身 SCS 组件的存在性与可读属性。v1 不覆盖子 BP 继承父 BP 组件后的最终属性；该盲区需要未来新增读回原语。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| name | string | 是 | 组件名。 |
| class | string | 是 | 组件类名。 |
| required | boolean | 否 | 是否必须存在该组件。 |
| mobility | Static / Movable / Stationary | 否 | 期望 Mobility。 |
| collisionProfile | string | 否 | 期望碰撞 preset，例如 BlockAll。 |
| materialSlotsFilled | boolean | 否 | 是否要求材质槽非空填充。 |

对应 T1 规则 4、5、6、7：必需组件名/类、碰撞 preset、Mobility、材质槽填充。

### rules.lod

用于表达静态网格 LOD 可观测要求。

| 字段 | 类型 | 说明 |
|---|---|---|
| minLod0 | boolean | 为 true 时表示要求至少存在 LOD0；v1 linter 可用 StaticMesh tags 中 LODs >= 1 作为判据。 |

对应 T1 规则 8：LOD0 存在。

## v1 覆盖范围

本格式能表达 T1 中 8 条可观测规则：

1. BP 命名模式 -> rules.naming.pattern
2. 输出文件夹 -> rules.outputFolder.path
3. 父/基类 -> rules.parentClass.allowlist
4. 必需组件名/组件类 -> rules.components[].name/class/required
5. 碰撞 preset -> rules.components[].collisionProfile
6. Mobility -> rules.components[].mobility
7. 材质槽填充 -> rules.components[].materialSlotsFilled
8. LOD0 存在 -> rules.lod.minLod0

## 示例

有效 fixture：

- fixtures/specs/prop.valid.json：道具类蓝图示例。
- fixtures/specs/character.valid.json：角色类蓝图示例。

无效 fixture：

- fixtures/specs/missing-schema-version.invalid.json：缺少 schemaVersion，应触发 required 错误。
- fixtures/specs/bad-name-pattern.invalid.json：rules.naming.pattern 使用 integer，违反 type: string。

## 设计约束

- spec 文件只表达规则，不执行规则。加载、匹配、正则编译与合规判定由后续任务实现。
- 示例路径使用 /Game/SmithUETest 占位，避免绑定真实项目或公司规范。
- v1 不声明继承组件最终属性检查，避免读回盲区导致误判。
