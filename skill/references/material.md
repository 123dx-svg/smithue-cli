# 材质工具速查（输入索引 & 节点属性键）

> 何时读：连材质引脚、设材质节点属性、做 WPO/顶点动画/Custom HLSL 时。
> 这两表 `TOOLS.md` 没列全，靠猜必踩坑；以下来自源码 `GetMaterialBaseInput()` / `HandleSetExpressionProperty()` 实测。

## `connect_material_pins` 的 `dest_input_index`（材质主输出引脚）

| index | 输出引脚 |
|---|---|
| 0 | BaseColor |
| 1 | Metallic |
| 2 | Roughness |
| 3 | Normal |
| 4 | EmissiveColor |
| 5 | Opacity |
| 6 | OpacityMask |
| **7** | **WorldPositionOffset（WPO）** ← `TOOLS.md` 只写到 6，但 **7 支持** |

8 及以上不支持（返回 nullptr）。WPO 自旋/顶点动画连 `dest_input_index:7`。

## `set_expression_property` 按节点类型的合法 `properties` 键

传错键**不报"非法键"**，仅当**一个键都没匹配**时回 `"No recognized properties were set"`（不告诉你正确键名）——所以必须按表传：

| 节点类型 | 合法键 |
|---|---|
| 所有节点 | `description` |
| **Constant** | `value`（**不是** `R`/`r`！） |
| Constant3Vector | `r` `g` `b` |
| ScalarParameter | `parameter_name` `default_value` |
| VectorParameter | `parameter_name` `r` `g` `b` `a` |
| CollectionParameter | `collection` `parameter_name` |
| MaterialFunctionCall | `material_function` |
| TextureSample | `sampler_type`(Color/Normal/Masks/Alpha/Grayscale/LinearColor/LinearGrayscale) `texture` |
| Custom(HLSL) | `code` `output_type`(float/float1/float2/float3/float4) `inputs`[{name}] |
| 带 SceneTextureId 的节点 | `scene_texture_id`(PPI_* 或 snake_case，如 `scene_color`/`custom_depth`) |

不支持（无 handler，静默忽略）：Transform 节点的 space 设置、上表未列的属性。

## 原子工具拼不出的高层效果（引导式，不写死配方）

WPO 自旋 / 顶点动画 / 自定义算法：

1. 用 **Custom 节点**承载逻辑（`set_expression_property` 设 `code`/`output_type`/`inputs`）；
2. 输出连 `connect_material_pins` 的 `dest_input_index:7`（WorldPositionOffset）；
3. 用 **`compile_material` 闭环验证**——编译报错逐步指出问题，照着改。

> ⚠️ **别在对话里硬记某个 HLSL intrinsic / UE 版本特有 API**（`Transform*`/`GetLocalPosition` 之类）——随引擎版本变，写死会误导。需要具体函数名时现查：引擎自带材质的 HLSL、官方文档，或读 `compile_material` 的报错逐步纠正。方法（原子拼装 + compile 验证）稳定，具体模板不稳定。
