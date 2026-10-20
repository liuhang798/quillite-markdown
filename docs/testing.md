# 测试说明 / Testing notes

本文整理当前回归入口；脚本覆盖特定场景，不代表所有 Markdown 语法、操作系统或输入法组合均已完整验收。

These are focused regression entry points, not a claim of exhaustive coverage of every syntax, operating system or IME combination.

## 基础检查 / Core checks

Go 1.25、Node.js 22、Wails 2.13。从仓库根目录运行 / Run from the repository root:

```bash
cd frontend
npm ci
npm test
npm run build
cd ..
go test ./...
go vet ./...
node scripts/test-release-safety.mjs
```

先构建前端，确保 Go 嵌入的 `frontend/dist` 存在。安全回归中的 Go 可执行文件可由 `GO_EXECUTABLE` 指定。

Build the frontend before Go tests so embedded assets exist. `GO_EXECUTABLE` can select the Go binary used by the release safety gate.

## 浏览器回归 / Browser regressions

测试使用隔离浏览器上下文与合成文档，不应连接真实用户文件或已登录的日常浏览器。需要 Playwright 模块与 Chromium；默认从模块路径查找 Playwright，可用 `PLAYWRIGHT_MODULE` 指定绝对路径，并用 `BROWSER_EXECUTABLE` 指定浏览器。

Use isolated contexts and synthetic documents, not real user files or a daily signed-in browser. Install Playwright and Chromium, or select them through `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE`.

从 `frontend` 运行下表脚本，例如 / From `frontend`, for example:

```bash
node tests/browser-mode-preview-link.mjs
```

截图输出可通过 `AUDIT_OUTPUT` 指定一个已创建的独立目录；部分脚本要求该变量。不要把测试输出提交到 Git。Windows 本地临时验证目录统一放在 `D:\工作\CodexTemp` 的项目／用途／日期子目录下。

Set `AUDIT_OUTPUT` to an existing isolated output directory for screenshots; some suites require it. Do not commit generated output. Local Windows temporary runs use project/purpose/date subdirectories under `D:\工作\CodexTemp`.

| 脚本 / Script | 覆盖 / Coverage |
|---|---|
| [browser-mode-preview-link.mjs](../frontend/tests/browser-mode-preview-link.mjs) | 模式自动开关、独立预览控制、明暗主题、左右布局、选区、撤回与重新进入编辑 / Mode defaults, manual overrides, themes, orientations, selection, undo and reentry |
| [browser-presentation-switch.mjs](../frontend/tests/browser-presentation-switch.mjs) | 模式切换器、键盘操作及布局 / Segmented switch, keyboard and layout |
| [browser-editor-only.mjs](../frontend/tests/browser-editor-only.mjs) | 全宽编辑、隐藏预览暂停刷新、恢复最新内容 / Full-width editing, suspended preview and fresh restoration |
| [browser-preview-line-sync.mjs](../frontend/tests/browser-preview-line-sync.mjs) | 普通换行、预览定位和不同宽度 / Line breaks, preview positioning and widths |
| [browser-image-heading.mjs](../frontend/tests/browser-image-heading.mjs) | 图片后的标题格式及撤回 / Headings after images and undo |
| [browser-image-table-boundary.mjs](../frontend/tests/browser-image-table-boundary.mjs) | 表格前后插图、单元格图片与历史 / Image/table boundaries, cell images and history |
| [browser-formula-roundtrip.mjs](../frontend/tests/browser-formula-roundtrip.mjs) | 公式模板插入、源码往返、取消及历史隔离 / Template insertion, source round trips, cancellation and history isolation |
| [browser-formula-structures.mjs](../frontend/tests/browser-formula-structures.mjs) | 13 个结构工具与 4 个矩阵操作；`AUDIT_FORMULA_MODE=inline/block/numbered` / Structure tools, matrix actions and output modes |
| [browser-chart-series-paste.mjs](../frontend/tests/browser-chart-series-paste.mjs) | CSV／TSV、数据行与系列编辑；`AUDIT_THEME=dark`、`AUDIT_CONTRAST=strict` / Data paste, rows, series and contrast |
| [browser-chart-source-roundtrip.mjs](../frontend/tests/browser-chart-source-roundtrip.mjs) | ECharts 模板及复杂配置往返、非法 JSON、取消和撤回 / ECharts source retention, invalid JSON, cancellation and undo |
| [browser-mermaid-roundtrip.mjs](../frontend/tests/browser-mermaid-roundtrip.mjs) | 22 种模板、源码往返及可视化模板编辑；`AUDIT_THEME=dark` / Mermaid templates and visual edits |
| [browser-diagram-feedback.mjs](../frontend/tests/browser-diagram-feedback.mjs) | 过期校验提示清理与主题；`AUDIT_STRICT=1`、`AUDIT_THEME=dark` / Validation feedback cleanup and theme checks |

测试需要可见分栏时，应显式恢复预览：点击“即时渲染”现在会自动关闭分栏，不能继续假设切换模式不改变预览可见性。

Tests requiring a visible split must explicitly restore it after clicking Live editing. Mode actions now change preview visibility; manual overrides remain independent.

## 发布与安装安全 / Release and installation safety

- Windows 成品必须完成 NSIS 构建和自定义启动器封装，并校验文件大小、SHA-256 与 `QUILLITE_PAYLOAD`。完整命令见 [发布指南](../RELEASING.md)。
- `scripts/test-windows-install-lifecycle.ps1` 仅允许 GitHub 托管的一次性 Windows runner，禁止在用户电脑或自托管 runner 上解除保护运行。
- 源码测试通过不等于安装生命周期已验证；实际安装、升级、卸载失败时不得跳过后发布。
- Windows deliverables require both NSIS and launcher wrapping, with size, SHA-256 and payload-marker checks. See the [release guide](../RELEASING.md).
- Installer lifecycle tests require disposable GitHub-hosted Windows runners. Never disable the guard on a personal or self-hosted machine.
- Source tests do not replace real installation/upgrade/uninstallation checks; lifecycle failures must block publication.

## 文档变更 / Documentation changes

仅修改说明时，核对中英文对应关系、模式行为、版本与模板数量、Markdown 渲染及相对链接。保留既有更新日志与发布标签，不因文档编辑而重打安装包。

For documentation-only changes, check language parity, behavior, versions/template counts, Markdown rendering and relative links. Preserve release notes and tags; do not rebuild installers solely for documentation edits.
