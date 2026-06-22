# smithue-cli factory

批量 dry-run 生成合规蓝图计划。v1 为 dry-run only，不写入引擎。

## 用法

```bash
smithue-cli factory --spec <spec-id> --dry-run [--out plan.json]
```

## 参数

| 参数 | 必选 | 说明 |
|------|------|------|
| `--spec` | 是 | spec id（对应 `.smithue/specs/<id>.json`） |
| `--dry-run` | 当前必选 | 预览模式，不写入 UE 引擎 |
| `--out` | 否 | 将计划 JSON 写入文件（默认仅输出到 stdout） |

## 输出格式

返回 `FactoryPlan` JSON：

```json
{
  "spec": "prop",
  "dryRun": true,
  "operations": [
    { "type": "create_bp", "path": "/Game/MyStudio/Props/BP_Box", "reason": "not found" },
    { "type": "skip_existing", "path": "/Game/MyStudio/Props/BP_Crate", "reason": "already exists" },
    { "type": "skip_name_collision", "path": "/Game/MyStudio/Props/BP_Door", "reason": "name taken by non-owned asset" },
    { "type": "skip_not_owned", "path": "/Game/ThirdParty/BP_Rock", "reason": "outside ownership scope" }
  ]
}
```

### 操作类型说明

- `create_bp` — 该路径下 BP 不存在，将被创建
- `skip_existing` — BP 已存在，跳过创建，转由 lint 审计
- `skip_name_collision` — 命名冲突，需人工处理
- `skip_not_owned` — 路径不在 ownership 范围内，跳过

## 执行流程（v1）

dry-run 仅生成计划，不直接创建 BP。执行时：

1. 运行 `factory --dry-run` 得到 `plan.json`
2. 由 AI agent 读取计划
3. 对每个 `create_bp` 操作，调用 `smithue-cli blueprint create` 等原子工具执行

## 示例

```powershell
# 预览计划
smithue-cli factory --spec prop --dry-run --out plan.json

# 查看操作计数
node -e "const p=require('./plan.json'); console.log(p.operations.map(o=>o.type).reduce((a,t)=>(a[t]=(a[t]||0)+1,a),{}))"
```

## 配置依赖

读取宿主工程根的 `smithue.config.json`：

```json
{
  "specsDir": ".smithue/specs",
  "ownership": {
    "include": ["/Game/MyStudio/**"],
    "exclude": ["/Game/ThirdParty/**"]
  }
}
```
