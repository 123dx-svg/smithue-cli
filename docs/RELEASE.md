# smithue-cli 发版 Spec（git + npm 发包流程）

> 给维护者 / AI 代理。发 `smithue-cli` 到 npm 前**必读**。本文件把经过验证的发包流程固定下来，照着走即可，避免漏掉 registry、CJK 提交、版本独立等坑。

## 0. 前提与身份

- **包名**：`smithue-cli`（npm，`access: public`，owner `dingxiao`）。
- **分支**：`main`（remote `123dx-svg/smithue-cli`）。
- **与插件版本号完全独立**：`smithue-cli` 与 `SmithUE` 插件是两个独立产品、独立版本号，**禁止互相比较 / 对齐**。兼容性以 HTTP 协议契约为准。
- **工具链**：npm-only（**无 bun**）、TypeScript、ESM / NodeNext（本地 import 必须带 `.js`）、测试用 vitest。

## 1. 关键坑（必读，按踩坑频率）

1. **registry 默认指向 npmmirror（淘宝镜像，只读，不能 publish）。**
   - 本机 `npm config get registry` 往往是 `https://registry.npmmirror.com`。
   - **发布、`npm view`、`npm whoami` 一律显式带 `--registry https://registry.npmjs.org`。** 否则 publish 报 403 / E协议错误。
2. **CJK 文件（`skill/SKILL.md`、`docs/*.md`）用 Edit/Write 工具改，绝不用 PowerShell `Set-Content`**（PS 5.1 按 GBK 误读 UTF-8 → 乱码）。
3. **提交信息用 `git commit -F <file>`**，提交信息文件用 Node/Write 写（PowerShell 多行 `-m` 和 CJK 会被吞 / 拆行）。
4. **已发布版本不可覆盖**：npm 不允许同版本号重发。发错了只能 `npm version patch` 再发一版。
5. **`files` 白名单决定打包内容**：`package.json` 的 `files` = `["dist/","schemas/","skill/","scripts/postinstall.cjs","package.json","README.md"]`。**新增需要进包的产物（如新 schema、新 skill 文件）必须同步加进 `files`，否则不会被发布。**
6. **`*.tgz`（`npm pack` 产物）不要提交进仓库**（应在 `.gitignore`）。

## 2. 版本号（semver）

| 改动类型 | bump |
|---|---|
| SKILL 内容 / docs / bugfix / 文案 | **patch**（x.y.**Z**） |
| 新命令 / 新特性（向后兼容） | **minor**（x.**Y**.0） |
| 破坏性变更（参数 / 输出契约改） | **major**（**X**.0.0） |

bump 命令（不打 git tag，提交由本流程统一管理）：
```bash
npm version patch --no-git-tag-version   # 或 minor / major
```

## 3. 发版前门禁（全绿才发）

```bash
npm run build       # tsc -p tsconfig.build.json → 退出码 0
npm test            # vitest run → 全绿
npm run typecheck   # tsc --noEmit → 退出码 0
```

## 4. 标准发版流程（逐步）

```bash
# 1) 改动落地（src / skill/SKILL.md / docs ...），CJK 文件用 Edit/Write 改

# 2) 门禁（见 §3）：build / test / typecheck 全绿

# 3) bump 版本
npm version patch --no-git-tag-version

# 4) 提交（提交信息写到文件，再 -F；不要用多行 -m）
git add -A                      # 或精确 add 改动文件
git commit -F <msgfile>
git push origin main

# 5) 发布（必须显式 registry！见 §1.1）
npm publish --registry https://registry.npmjs.org

# 6) 验证
npm view smithue-cli version --registry https://registry.npmjs.org   # = 刚发的版本
git status                                                            # 干净
```

> **doc-only / 非进包改动**（如本 `docs/RELEASE.md`、CONTRIBUTING）：只 `git commit + push`，**不需要 bump / npm publish**（它们不在 `files` 白名单，不进 npm 包）。

## 5. SKILL 部署（`smithue-control`）

- **`skill/`（SKILL.md + `references/` + `scripts/`）是唯一发布 / 部署源**（在 `files` 白名单内）。**不要**改其它同名副本。
- `scripts/postinstall.cjs` 在**全局安装**（`npm i -g smithue-cli`）时自动把整个 `skill/` bundle 部署到：
  - `~/.agents/skills/smithue-control/`（主，始终）
  - `~/.claude/skills/`、`~/.codex/skills/`（仅当对应目录已存在）
  - 幂等覆盖；自动清理 0.15 之前旧布局残留的 `reference/` 目录；可用环境变量 `SMITHUE_SKILL_NO_AUTOINSTALL=1` 关闭。
- **本机已装、未走全局安装** → postinstall 不触发，需**手动同步**让当前环境立即生效：
  ```bash
  # 在仓库根目录（部署整个 bundle，含 legacy reference/ 清理）
  node dist/cli.js skill --install "$HOME/.agents/skills/smithue-control"
  ```

## 6. 一键模板（复制即用）

```powershell
# 在 F:\...\smithue-cli 下
npm run build; if($?){ npm test }; if($?){ npm run typecheck }
if($?){
  npm version patch --no-git-tag-version
  # 用 Write 工具把提交信息写到 commit.txt（CJK 安全），再：
  git add -A
  git commit -F commit.txt
  git push origin main
  npm publish --registry https://registry.npmjs.org
  npm view smithue-cli version --registry https://registry.npmjs.org
}
```

## 7. 与插件发版的区别（勿混淆）

- 本流程**只管 smithue-cli（npm）**。
- **SmithUE 插件**走另一套：bump `.uplugin` → UBT 重编 → 打包 `Saved/SmithUE-vX-UE5.2-Win64.zip`（剔除 `.pdb` / Live Coding 临时文件）→ `gh release create vX-UE5.2`（GitHub Releases）。详见插件仓库 `docs/spec/`。
- 两者**版本号独立递增**，发版时机互不依赖。
