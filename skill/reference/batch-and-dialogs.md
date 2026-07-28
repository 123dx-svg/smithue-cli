# 长命令进度 · 模态弹窗（批量/写操作通用机制）

> 何时读：跑批量/长命令（迁移、批量组件编辑、redirector 清理、重存等）时；命令超时、卡住、或弹出模态框时。

## 长命令 HTTP 会超时——这是正常的

`move_folder`/`move_paths`/`resave_packages`/`fixup_redirectors`/`resolve_redirectors` 等在 game thread **同步执行**，大批量必然超过 HTTP 超时（默认 30s）。**超时 ≠ 失败，命令仍在跑**。CLI 的超时错误已内置引导。正确做法：

- **别重发**——重发会排第二次执行。
- **轮询进度**：`exec get_job_status {}`（**worker-safe**，game thread 忙时仍响应）→ `{active, operation, processed, total, percent, current_item, elapsed_seconds}`。看着 percent 涨到 100 再继续，取代"猜日志"。
- 拿不到原始命令返回值时，用 `get_job_status` 到 100% + `find_broken_assets` / `list_assets` 数量核对结果。

## 模态弹窗——worker-safe，卡住也能查/应答

批量 `RenameAssets` 会弹 CDO 确认框（"源代码/配置可能需查找替换…继续重命名？"），`level_save` 未命名关卡弹 Save-As，都阻塞 game thread。此时普通命令超时/ECONNRESET，但 **Dialog 域是 worker-safe，仍能响应**：

- `get_active_dialog {}` → `{modal_active, title, type, buttons[], auto_response, dismissed_count}`。**弹窗能被发现**——卡住先查它。
- `set_dialog_auto_response {mode}` → 持久自动应答：`off` | `cancel`(点取消) | `accept`(焦点+Enter=默认按钮) | `confirm`(点肯定按钮 OK/Yes/Continue/确定/是/继续，跨语言)。
- `dismiss_active_dialog {response | button_text}` → 一次性应答；`button_text` 按标签精确/子串点击。

### 弹窗四个必踩点

1. **批量前先 arm `confirm`**：`set_dialog_auto_response {mode:"confirm"}`，让 RenameAssets 的 CDO 框自动点"确定/继续"。
2. **OkCancel 框默认按钮是"取消"**：`accept`(Enter) 会触发取消 → 中止操作。要"继续"必须用 **`confirm`**（匹配肯定词）或精确 `button_text`。
3. **重启编辑器后 `auto_response` 重置为 `off`**——每次重开 UE、每轮批量前**都要重新 arm**，否则弹窗无人应答、game thread 永久阻塞。
4. **长事务操作模式**：后台发命令 + 主循环轮询 `get_active_dialog`(应答) + `get_job_status`(进度)，别同步等、别重发。

## CJK 参数损坏

中文参数（button_text、含中文的资产路径）经 Windows PowerShell/cmd 管道易按系统代码页（GBK）编码 → 到插件变 `??`/乱码。

- **首选 CLI 配 `--params-file`**（显式 utf8 读文件，最稳）；或 `--stdin` 配合 UTF-8 无 BOM 文件。
- 跨语言场景优先 `confirm` 模式（引擎内匹配肯定词，无需传中文）。
- 若 `--params-file` 仍损坏，用 skill 自带脚本转换，按顺序降级：① `scripts/smithue.ps1`（PowerShell 自带）② `scripts/smithue-exec.mjs`（node）——都自动发现端口、UTF-8 直读文件、直发 HTTP。
