# 企业级资产装配与合规引擎工作流

> 何时读：项目要对蓝图/资产做规范化（命名、父类、组件、碰撞、材质槽等）合规校验或批量生成合规资产时。
> smithue-cli v1.10.0+ 提供这组高层工作流命令，构建在原子工具之上。
> **动手前先查宿主工程有没有既定 spec**（见 SKILL.md「流程性工作先查权威 SPEC」）。

## 前提：宿主工程配置

宿主工程根建 `smithue.config.json`（不进 npm 包）：
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

## 规范生成（普通用户不手写 JSON）

**A. spec infer（从黄金 BP 反推草稿）**
```powershell
smithue-cli spec infer --from /Game/MyStudio/Props/BP_Crate_Golden --out .smithue/specs/prop.json
# 然后人工确认标 needs-confirm 的字段（如 naming.pattern）
```

**B. AI 生成**：向 agent 说人话描述规范（"道具蓝图，继承 BP_PropBase，BlockAll 碰撞"）→ agent 读 `smithue-cli/schemas/spec.schema.json` 生成草稿 → 校验器自检 → 用户审阅。普通用户不手写 JSON。

## factory：批量生成合规蓝图（dry-run）

```powershell
smithue-cli factory --spec prop --dry-run --out plan.json
# plan.json: operations:[{type:"create_bp",...},{type:"skip_existing",...}]
```
> v1：`--apply` 未实现；dry-run 规划后由 agent 调原子工具执行。

## lint：合规审计（report-only）

```powershell
smithue-cli lint --spec prop --out report.json
smithue-cli lint --spec prop || echo "COMPLIANCE VIOLATIONS FOUND"   # CI：有违规退出码非 0
```
报告含 `findings`(违规)、`unverifiable`(继承盲区)、`checked_assets`(已检查数)。

## spec 文件格式

存宿主工程（git 追踪，不进 npm 包）：
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
完整 schema → `smithue-cli/schemas/spec.schema.json`；深入契约见插件 `docs/usage/`（PARADIGM/SPI/COMPLIANCE_RULES）+ `docs/usage/workflows/`。
