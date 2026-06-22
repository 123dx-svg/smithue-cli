# smithue-cli lint

合规审计（report-only，零写入）。检查属为 ownership 的蓝图是否符合 spec 规范。

## 用法

```bash
smithue-cli lint --spec <spec-id> [--out report.json]
```

## 参数

| 参数 | 必选 | 说明 |
|------|------|------|
| `--spec` | 是 | spec id（对应 `.smithue/specs/<id>.json`） |
| `--out` | 否 | 将报告 JSON 写入文件（默认仅输出到 stdout） |

## 输出格式

返回 `LintReport` JSON：

```json
{
  "spec": "prop",
  "checked_assets": 12,
  "findings": [
    {
      "asset": "/Game/MyStudio/Props/SM_Box",
      "rule": "naming",
      "expected": "^BP_.+",
      "actual": "SM_Box",
      "severity": "error"
    }
  ],
  "unverifiable": [
    {
      "asset": "/Game/MyStudio/Props/BP_Door",
      "reason": "parentClass not resolvable via API (inheritance blind spot)",
      "rule": "parentClass"
    }
  ]
}
```

### 报告字段说明

- `findings` — 确认的违规列表，包含 rule/expected/actual/severity
- `unverifiable` — 继承盲区或 API 无法查询的字段，不算违规，需人工确认
- `checked_assets` — 已检查的 BP 数量

### severity 等级

| 等级 | 含义 |
|------|------|
| `error` | 确定违规，需修复 |
| `warning` | 建议修复，不阻断 CI |

## 退出码

| 情况 | 退出码 |
|------|------|
| 无违规 | `0` |
| 有 error 级违规 | `1` |
| 运行时错误 | `2` |

## CI 集成

```bash
# 有违规时退出码非 0
smithue-cli lint --spec prop || exit 1

# 保存报告并检查违规
smithue-cli lint --spec prop --out report.json
if [ $? -ne 0 ]; then
  cat report.json | jq '.findings'
  exit 1
fi
```

## 示例

```powershell
# 审计 prop 规范
smithue-cli lint --spec prop --out report.json

# 查看违规数量
node -e "const r=require('./report.json'); console.log('findings:', r.findings.length, '/ checked:', r.checked_assets)"
```

## 配置依赖

读取宿主工程根的 `smithue.config.json`，spec 文件存放于 `specsDir`：

```json
{
  "specsDir": ".smithue/specs",
  "ownership": {
    "include": ["/Game/MyStudio/**"],
    "exclude": ["/Game/ThirdParty/**"]
  }
}
```

## 相关命令

- [`smithue-cli factory`](./factory.md) — 生成合规 BP 计划
- [`smithue-cli spec infer`](./spec-format.md) — 从已有 BP 反推 spec 草稿
