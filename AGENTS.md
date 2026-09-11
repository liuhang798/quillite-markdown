# 轻阅 Markdown：AI 项目技术指南

本文是提供给代码代理、自动化编程助手和新维护者的项目上下文。开始修改前应完整阅读本文，再按任务范围查看相关源码。

## 1. 项目概览

- 项目名称：轻阅 Markdown / Quillite Markdown
- 仓库：`https://github.com/liuhang798/quillite-markdown`
- 当前版本：`2.7.3`
- 开源协议：MIT
- 产品定位：极度轻量、美观、跨平台的 Markdown 阅读与编辑工具
- 支持平台：Windows x64、macOS Universal、Linux x64
- Windows 安装包：约 12 MB
- UI 语言：简体中文、English

核心产品体验是“阅读优先、编辑顺手”：普通状态显示沉浸式阅读页面；进入编辑状态后，默认左侧实时预览、右侧 Markdown 语法高亮编辑器，可通过预览标题栏切换按钮或“更多 → 编辑布局”交换左右位置，偏好保存在 localStorage 的 `editorLayout` 中。

## 2. 技术栈

| 层级 | 技术 | 主要职责 |
|---|---|---|
| 桌面框架 | Wails 2.13 | Go 与 WebView 前端绑定、窗口、文件拖放、平台集成 |
| 后端 | Go 1.25 | 文件读写、最近记录、草稿、图片读取、系统操作、更新检查 |
| 前端 | 原生 HTML、CSS、JavaScript | 页面结构、交互、状态管理、双语界面 |
| 构建 | Vite 7 | 前端打包，输出到 `frontend/dist` |
| 编辑器 | CodeMirror 6 | Markdown 编辑、语法高亮、学科公式、流程图可视化画布与 22 类 Mermaid 图表生成器、撤回历史、快捷键 |
| Markdown | marked | Markdown 转 HTML |
| 科学公式 | KaTeX + mhchem | 本地渲染 LaTeX 行内/块级公式、化学式与公式编号 |
| 安全清理 | DOMPurify | 清理渲染后的 HTML |
| 代码高亮 | highlight.js | Markdown 代码块高亮 |
| Windows 安装 | NSIS | 分步安装、快捷方式、文件关联、覆盖升级 |
| CI/CD | GitHub Actions | Windows、macOS、Linux 构建及 GitHub Release 发布 |

项目没有 React、Vue、Electron、数据库或远程业务服务。不要为了小功能引入大型前端框架。

## 3. 运行时架构

```text
用户操作
  ↓
frontend/index.html + frontend/src/renderer.js
  ↓ window.quilliteMarkdown
frontend/src/main.js（统一桥接层）
  ↓ Wails 生成绑定
app.go / updates.go（Go 后端）
  ↓
本地文件系统、Windows/macOS/Linux 系统能力、轻阅 Markdown 官网服务
```

`main.go` 使用 `//go:embed all:frontend/dist` 将前端产物嵌入最终可执行文件。正常构建必须先生成 `frontend/dist`；常规 `wails build` 会按 `wails.json` 自动执行前端安装和构建步骤。

## 4. 目录与文件职责

| 路径 | 职责 |
|---|---|
| `main.go` | Wails 应用入口、窗口尺寸、单实例、拖放、macOS 菜单和平台窗口配置 |
| `app.go` | 文档、文件夹、偏好设置、最近阅读、临时草稿、本地图片和系统集成 |
| `export_docx.go` | 将前端安全渲染后的文档转换为标准 DOCX（OOXML），处理文字样式、列表、表格、代码、链接和图片 |
| `export_html.go` | 将安全渲染后的文档导出为独立 HTML，保留主题、公式、代码和图片，并过滤可执行内容 |
| `export_center.go` | 保存导出预设、检测本机 Pandoc、执行扩展格式转换及保存 PNG/JPEG 长图 |
| `export_pdf.go` | 使用本机 Edge／Chrome／Chromium 无头打印生成带标题书签的 PDF，并在引擎间自动容错 |
| `updates.go` | 官网版本库更新检查、版本比较、30 天暂停提醒 |
| `app_test.go` | 后端单元测试、版本一致性和关键业务规则回归测试 |
| `frontend/index.html` | 标题栏、侧栏、阅读页、分栏编辑器、菜单及弹窗结构 |
| `frontend/src/main.js` | Wails 后端桥接、浏览器预览降级、平台检测 |
| `frontend/src/renderer.js` | 前端状态、编辑器、Markdown 渲染、文件列表和全部交互 |
| `frontend/src/math-rendering.js` | Typora/Pandoc 风格公式分隔符解析、KaTeX/mhchem 安全渲染 |
| `frontend/src/styles.css` | 主题、布局、响应式、macOS/Windows 差异和打印样式 |
| `frontend/wailsjs/` | Wails 自动生成绑定；Go 公开方法变化后需要重新生成 |
| `build/` | 应用图标、Windows 资源及 NSIS 安装器配置 |
| `build/windows/installer/project.nsi` | 自定义 Windows 安装、升级清理、快捷方式和卸载逻辑 |
| `build/windows/installer/wails_tools.nsh` | Wails 生成文件，通常不要手工修改 |
| `packaging/linux/` | DEB、AppImage、桌面文件和 MIME 配置 |
| `.github/workflows/release.yml` | 三平台构建、产物命名、Release 更新与发布说明提取 |
| `README.md` | GitHub 默认显示的简体中文项目主页 |
| `README.en.md` | English 项目主页 |
| `README.zh-CN.md` | 旧中文版链接的兼容入口，指向默认中文主页 |
| `CHANGELOG.md` | 中英文版本升级日志，也是应用更新弹窗和 Release notes 的来源 |
| `RELEASING.md` | 版本发布操作指南 |
| `push-to-github.bat` | Windows 双击自动拉取、提交并推送源码（仅 GitHub） |

`frontend/dist`、`frontend/node_modules`、`build/bin` 是生成目录，已被 `.gitignore` 排除，不应提交。

## 5. 主要功能

### 阅读

- Markdown 渲染、代码高亮、表格、引用、列表和图片。
- 自动生成右侧本页目录，支持标题搜索、层级／平铺切换、折叠记忆和准确章节定位；目录字号和默认宽度按显示器物理短边适配。
- 正文独立一行的 `[TOC]` 在阅读页与编辑预览中生成动态可点击目录，并随标题变化刷新。
- 当前章节跟随、阅读进度、阅读时长和字数估算。
- 文档内搜索、打印、定位文件、回到顶部。
- 明暗主题和阅读字号缩放。

### 编辑

- 左侧实时预览、右侧 CodeMirror Markdown 编辑。
- Markdown 语法颜色高亮。
- `Ctrl/Cmd + B` 加粗、`Ctrl/Cmd + I` 斜体、`Ctrl/Cmd + K` 链接。
- 标题、引用、有序列表、无序列表、任务列表；可视化表格设计器支持编辑单元格、增删／拖动行列、列对齐和持久列宽，并可原位编辑已有 GFM 表格。
- 从网页或 Word 粘贴富文本时自动将剪贴板 HTML 转换为 Markdown，保留常见结构并过滤危险地址；编辑器选区右键支持复制为 Markdown 或纯文本。
- 离线英文拼写检查提供错词波浪线、美式／英式词典、右键候选纠错、本文忽略和持久个人词典；代码、URL、公式等非正文区域不参与检查，文档内容不离开本机。
- 行内代码、代码块、表格行列选择、图片选择。
- 图片选择、拖拽和粘贴默认复制到文档旁的 `assets`；可选直接登录 PicGo Cloud 在线上传，或通过本机 PicGo 服务兼容其他图床，失败均自动回退本地相对路径。
- “学科公式”工具（按基础数学、代数与函数、几何、微积分、线性代数、概率统计、物理、基础化学和化学反应分类 79 种模板，参数填写、行内/块级/编号输出、实时预览和弹窗内教程入口）、LaTeX 行内/块级公式、mhchem 化学公式和 `\tag{…}` 公式编号。
- 工具栏撤回和 `Ctrl/Cmd + Z`。
- 编辑时每 10 秒自动保存。
- `Ctrl/Cmd + S` 保存、`Ctrl/Cmd + Shift + S` 另存为。

### 文档管理

- 打开单个 Markdown 或文本文件。
- 新建 Markdown 文档后立即进入编辑。
- 打开文件夹并使用资源浏览器集中查看文档。
- 左下角和软件首页均提供“图表范例”“公式范例”“格式范例”三份内置参考文档；内容由当前 37 类图表与 79 种学科公式注册表自动生成，打开后不写入最近阅读。首页还展示完整快捷键指南，阅读页“关闭预览”可返回首页且不删除最近阅读记录。
- 打开文档后立即进入最近阅读，支持多条持久置顶、拖动排序和删除单条记录。
- 单实例：再次打开 `.md` 文件时交给已有窗口处理。
- 支持拖放文件和系统文件关联。

### 导出

- 阅读页顶部和“更多”菜单只显示一个“导出文档”入口，打开统一导出界面；不得重新加入分散的 Word／HTML／PDF 快捷按钮。
- 统一导出界面原生提供 DOCX、带样式 HTML、无样式 HTML、带标题书签 PDF 与 PNG/JPEG 长图。
- PDF 优先依次调用本机 Edge、Chrome 或 Chromium 无头打印并启用文档大纲；全部引擎不可用时前端回退系统打印，软件不捆绑浏览器。
- 页眉页脚支持 `{title}`、`{date}`、`{page}`；PDF 为重复页眉页脚，其他格式放在文档首尾。
- 导出预设保存在偏好中，最多 24 条；包含格式、页眉页脚、图片清晰度和 Pandoc 参数。
- EPUB、RTF、ODT、LaTeX、MediaWiki 与自定义格式依赖用户本机 Pandoc；软件只检测或选择可执行文件，不捆绑 Pandoc。
- Pandoc 参数通过 `exec.CommandContext` 直接传递且不经过 shell，禁止参数覆盖保存窗口确定的输出路径。

### 平台与发布

- Windows：自绘标题栏、NSIS 安装、桌面快捷方式、Markdown 文件关联。
- macOS：原生左侧窗口控制按钮、系统菜单和 Command 快捷键。
- Linux：DEB 与 AppImage。
- 启动时检查轻阅 Markdown 官网版本库。
- 更新弹窗显示官网维护的 Markdown 更新说明并打开官网下载页面。
- 可暂停自动更新提醒 30 天，手动检查不受限制。

## 6. Go 数据模型

### `Document`

- `path`：文档绝对路径。
- `name`：文件名。
- `directory`：所在目录。
- `content`：UTF-8 文本内容。
- `modifiedAt`：RFC3339Nano 修改时间。
- `size`：字节数。
- `replacedPath`：新建草稿另存成功后被替换的旧路径，供前端清理列表。

### `Preferences`

偏好文件位于 `os.UserConfigDir()/轻阅 Markdown/preferences.json`，主要字段：

- `recentFiles`：按“置顶区 + 普通最近区”保存的最终显示顺序；置顶项不计入普通区最多 10 条的限制。
- `pinnedRecentFiles`：置顶文档的有序路径，是 `recentFiles` 的子集；新置顶项默认位于置顶区首位。
- `favoriteFiles`：用户主动收藏的文档路径；独立于最近阅读，原文件失效时仍保留记录。
- `draftFiles`：自动创建但尚未完成“另存为”替换的草稿路径。
- `lastFile`：最近一个文档。
- `language`：`zh-CN` 或 `en`。
- `fontFamily`：软件字体预设，支持 `system`、`sans`、`serif`、`rounded`、`songti`、`kaiti`；缺失或非法值回退为 `system`。
- `lastUpdateCheck`：上次更新检查时间。
- `suppressUpdateUntil`：暂停自动更新提醒的截止时间。
- `usageAnalytics`：是否允许软件异常时自动回传已清理的错误日志；不控制每日活跃统计。
- `imageUploadMode`：`local`、`picgo-cloud` 或 `picgo`；分别表示本地 `assets`、PicGo Cloud API 直连和本机 PicGo Server，默认继续使用本地 `assets`。
- `picGoServerUrl`：PicGo 本地 HTTP 服务地址，仅允许 localhost／回环 IP；可选服务密钥独立保存在用户配置目录，不进入偏好 JSON。
- `exportSettings`：本机 Pandoc 路径与最多 24 条导出预设；旧偏好缺失时使用空设置。
- `anonymousInstallId`：本地随机匿名标识，仅用于每日活跃按设备去重；服务器只保存不可逆哈希。
- `lastActiveReport`：最近一次成功提交每日活跃的 UTC 日期，保证每台设备每天最多一次。

偏好文件可能来自旧版本。新增字段必须允许缺失，并为 `nil` 切片补默认值。

## 7. Go 后端接口

Wails 会将 `App` 的公开方法暴露给前端。主要接口按领域分组如下：

### 文档

- `OpenFile()`：显示系统选择窗口并读取文档。
- `NewFile()`：静默创建唯一文件名；macOS 固定写入用户 `Documents/Quillite Markdown`，避免 `.app` 升级覆盖用户文档；Windows/Linux 便携版优先写入应用目录，不可写时回退到用户 Documents。
- `ReadFile(path)`：读取指定文件并写入最近阅读。
- `SaveFile(path, content)`：覆盖保存。
- `SaveAs(currentPath, content)`：另存并处理临时草稿替换。
- `SetDirty(bool)`：同步未保存状态，关闭窗口时用于保护内容。

### 文件夹与记录

- `OpenFolder()`：选择目录并返回 Markdown 文件列表。
- `ListFolder(root)`：递归深度最多 5 层、最多 800 个文件。
- `GetPreferences()`：读取偏好。
- `RemoveRecent(path)`：只删除最近记录，不删除原文件。
- `SetRecentPinned(path, pinned)`：置顶或取消置顶最近文档。
- `ReorderPinnedRecent(paths)`：保存置顶区顺序，仅重排当前已置顶路径。
- `AddFavorite(path)` / `RemoveFavorite(path)`：添加或取消收藏，只修改偏好记录，不操作原文件。

### 图片

- `SelectImage(currentFile)`：选择图片，尽可能返回相对文档路径。
- `ReadImageData(imagePath, documentDirectory)`：读取本地图片并返回 data URL。
- `GetImageUploadSettings()` / `SetImageUploadSettings(input)`：读取或保存本地／PicGo 图片插入方式。
- `LoginPicGoCloud()` / `LogoutPicGoCloud()` / `TestPicGoCloud()` / `UploadImageToPicGoCloud(currentFile, imagePath)`：通过系统浏览器完成 PKCE 登录，测试 PicGo Cloud 令牌，并使用预签名／分片 API 上传已复制到 `assets` 的图片。
- `TestPicGo(input)` / `UploadImageToPicGo(currentFile, imagePath)`：测试本机 PicGo 服务并以 multipart 上传已复制到 `assets` 的图片，作为兼容其他图床的高级方式。

### 导出

- `ExportPlainHTML(sourcePath, title, renderedHTML, header, footer)`：生成不包含主题 CSS 的安全语义化 HTML。
- `ExportPDF(sourcePath, title, renderedHTML, header, footer)`：将安全渲染内容写入临时独立 HTML，再用本机 Chromium 系浏览器生成带标题书签的 PDF。
- `GetExportSettings()` / `SetExportSettings(settings)`：读取或保存 Pandoc 路径与导出预设。
- `DetectPandoc()` / `SelectPandoc()`：检测 PATH、常见安装路径或让用户选择并验证 Pandoc 可执行文件。
- `ExportWithPandoc(input)`：通过标准输入转换 EPUB、RTF、ODT、LaTeX、MediaWiki 或自定义 writer，输出位置固定由保存窗口决定。
- `SaveExportImage(sourcePath, title, dataURL, format)`：校验并保存前端生成的 PNG/JPEG 长图。

### 系统

- `ShowInFolder(path)`、`OpenExternal(url)`、`OpenDefaultApps()`、`Print()`。
- `SetTheme(dark)`、`SetLanguage(language)`、`SetFontFamily(fontFamily)`、`RequestQuit()`。
- `GetInitialFile()`、`GetStartupMode()`、`Dirname(path)`。

### 更新

- `CheckForUpdates(force)`：读取 `qm.ssssa.cn` 官网最新稳定版本；`force=true` 跳过暂停提醒限制。
- `SnoozeUpdates(days)`：保存暂停提醒时间，限制在 1–365 天。

## 8. 前端状态与桥接

前端禁止在多个文件中直接调用 `window.go.main.App`。所有后端调用统一通过 `frontend/src/main.js` 暴露的 `window.quilliteMarkdown`，这样浏览器预览和桌面运行可以共享代码。

`renderer.js` 的 `state` 是当前唯一前端状态源：

- `currentFile`：当前文档。
- `files`、`recentFiles`、`pinnedRecentFiles`、`favoriteFiles`、`explorerFiles`：侧栏数据。
- `root`、`sidebarMode`：资源浏览器状态。
- `editing`、`dirty`、`savedContent`、`saving`：编辑与保存状态。
- `dark`、`fontScale`、`fontFamily`、`language`：用户界面偏好。
- `updateInfo`：更新弹窗内容。

当前项目没有状态管理库。新增状态应优先扩展现有 `state`，避免出现第二套状态源。

## 9. 关键业务数据流

### 打开文档

1. 前端检查 `dirty`，必要时询问是否放弃更改。
2. 调用 `OpenFile` 或 `ReadFile`。
3. Go 读取文件并立即写入最近记录。
4. 前端 `displayDocument` 同步当前文件、最近列表、阅读页和编辑器基线。

macOS 会把用户通过系统文件／文件夹窗口、Finder 或文件关联明确授权的路径保存为原生 Security-Scoped Bookmark，数据独立保存在用户配置目录的 `mac-security-bookmarks.json`。读取、保存、写权限检测、最近状态检查与资源浏览器恢复都必须在匹配的文件或最具体父目录书签作用域内执行，并严格配对 `startAccessingSecurityScopedResource`／`stopAccessingSecurityScopedResource`；过期书签应在访问期间刷新。用户主动点击最近／收藏／资源记录通过 `OpenRecentFile` 打开：先静默解析书签并读取；只有旧记录、书签失效或未签名更新改变应用身份时，才调用已定位到原文件的系统打开窗口恢复授权。后台自动刷新仍使用 `ReadFile`，不得在非用户操作时弹出授权窗口。

### 编辑与自动保存

1. 进入编辑时创建 CodeMirror 状态并显示分栏。
2. 文本变化后更新 `currentFile.content` 和 `dirty`。
3. 约 90ms 防抖刷新左侧预览。
4. 每 10 秒检查一次；仅在 `editing && dirty && !saving` 时保存。
5. 保存完成后比较编辑器当前内容和发起保存时的快照，防止保存期间继续输入导致内容被旧结果覆盖。

异步文件操作必须同时校验 `state.documentSession`，不能只比较路径（同一文件关闭再打开也是新会话）；打开文档还应使用 `beginDocumentOpen`／`canApplyDocumentOpen` 保证最新请求优先。Go 的 `SaveFile`／`SaveAs` 不得自行清除 dirty，由前端确认会话和内容快照后调用 `SetDirty`。数据图表必须经 `secureChartOption` 处理，禁止恢复 HTML tooltip 或危险 URL。`writeFileAtomically` 替换失败时不得删除原目标。

ECharts 使用修复版 6.1+，预览和导出均显式使用 `echarts/theme/v5` 保持已有布局。词云插件的旧 peer 范围通过 package.json 的 overrides 统一到同一个 ECharts 实例；升级时必须运行全部图表和词云回归，不要重新安装易受攻击的 ECharts 5 副本。浏览器回归入口：`frontend/tests/fixtures/render-audit.html`（仅测试，不进入正式构建）。

图表过滤必须区分原始数据和配置：`dataset.source`、`value`、`encode`、`dimensions` 内的合法字段不得按可执行选项删除；`__proto__` 仍在所有作用域清理，真正配置内的危险 URL、HTML tooltip 与正则筛选仍须拦截。不要把不受限数组展开为函数参数（例如 `push(...values)`），必须保留 15 万项数组和真实 ECharts 渲染回归测试。

### 撤回安全边界

图表原位编辑统一通过 `diagram-editing.js` 识别 Mermaid／ECharts 围栏，必须保留原引擎与原始源码；无法完整解析的高级配置留在源码模式，不能用模板覆盖。保存前校验文档会话与原图快照，使用一次编辑器事务替换。桑基图 Unicode 兼容补丁由 `scripts/prepare-mermaid.mjs` 生成到 vendor；升级 Mermaid 后若补丁断言失败，必须审查词法规则并回归中文、引号、逗号和 emoji，不得直接绕过断言。

打开不同文档时必须创建全新的 `EditorState`，不能只通过普通文本替换写入 CodeMirror。这样旧文档撤回历史不会泄漏到新文档，且 `Ctrl/Cmd + Z` 最多回到刚从磁盘载入的原始内容。

### 新建与另存为

1. `NewFile` 使用 `O_CREATE|O_EXCL` 创建带时间戳的唯一文件。
2. 新文件路径同时记录到内存和 `Preferences.draftFiles`，因此重启后仍能识别。
3. 自动保存只更新该草稿，不取消草稿身份。
4. “另存为”成功且新旧路径不同时，只迁移草稿身份和最近记录；原草稿文件必须保留，由用户自行决定是否删除。
5. 返回 `Document.replacedPath`，前端立即删除对应列表项。
6. 普通已有文档永远不能被上述清理逻辑删除。

### 本地图片

WebView 会限制直接访问 `file://` 图片。Markdown 源码仍保存正常的绝对或相对路径，但预览时必须调用 `ReadImageData`，由 Go 读取文件并返回 base64 data URL。不要重新改回直接设置 `file:///...`。

启用 PicGo Cloud 时，选择、拖拽或粘贴的图片仍必须先写入当前文档旁的 `assets`，再由 Go 后端通过官方 HTTPS API 获取预签名地址并上传；10 MB 及以上文件使用分片流程。登录必须使用系统浏览器 PKCE，令牌独立保存在用户配置目录，不得写入偏好 JSON。启用本机 PicGo 时，仍通过 multipart 提交给仅限 localhost／回环 IP 的 PicGo HTTP 服务。两种在线模式成功后插入安全的 HTTPS URL；连接、鉴权、响应或上传失败时前端必须插入已经保存好的本地相对路径，不得丢失图片或自动重复上传。

### 更新检查

启动约 1.2 秒后调用自动检查。客户端只读取 `https://qm.ssssa.cn/api/v1/releases/latest`，使用数据库中的中英文日志、SHA-256 和平台更新地址，不再访问或回退 GitHub Releases。版本高于 `appVersion` 时显示更新弹窗，“打开下载页面”固定进入 `https://qm.ssssa.cn/#download`。软件中的官网、更新、下载、统计与反馈调用只允许使用 `qm.ssssa.cn`，不得使用根域名或 `www` 子域名。官网仅按版本、平台和来源汇总更新检查及实际下载次数，不接收文档、路径或设备身份。

## 10. 必须保持的产品规则

1. 打开的文档必须立即出现在最近阅读，而不是下次启动后才出现。
2. 删除最近记录不能删除用户原文件。
3. 置顶项必须保持在普通最近记录之前且不能被普通区的 10 条容量限制淘汰；拖动顺序必须跨重启保留。
4. 新建草稿另存后必须清除原草稿身份和重复记录，但不得删除原草稿文件；任何文档都只能由用户明确发起删除。
5. 自动保存不能覆盖保存过程中继续输入的新内容。
6. 切换文档必须隔离撤回历史，不能把原始文档撤回成空白。
7. 本地图片必须经 Go 后端读取，Markdown 路径本身保持可移植。
8. 右侧目录点击必须准确滚动到正文标题。
9. macOS 使用原生窗口按钮和菜单，不能显示 Windows 自绘窗口按钮。
10. Windows 安装始终使用 current-user scope；CI 手动调用 NSIS 时必须同时传入：
   - `-DWAILS_INSTALL_SCOPE=user`
   - `-DREQUEST_EXECUTION_LEVEL=user`
11. 升级安装不能生成重复桌面图标或重复卸载项；只有安装目录中的严格所有权标记验证通过时，才能沿用注册表记录或由 `DisplayIcon` 反推的旧目录。注册表、配置文件和命令参数都不能单独授予覆盖或删除权限。安装完成页默认勾选运行应用，但必须允许用户取消。
12. Windows 安装、升级与卸载向导必须全程使用简体中文；全新安装默认写入中文偏好，旧版本升级必须迁移并保留已有语言与其他设置。macOS/Linux 以偏好文件是否存在判断首次运行。
13. 版本号、安装包名称、关于窗口、更新检查和 CHANGELOG 必须一致。
14. Windows 安装程序必须以 `.exe` 直接发布到 GitHub Release 和官网，不再额外打包 ZIP；应用内免安装更新仍使用独立的 `.bin`。
15. Windows 自定义安装选择的目录始终作为父目录，无论是否为空都必须在其中创建产品专属子目录；默认安装和升级使用已经解析好的最终安装目录，不得额外嵌套。卸载脚本禁止对 `$INSTDIR` 使用递归或文档通配符删除，只能删除产品拥有的明确程序文件，最后以非递归方式尝试移除空目录；用户原有文件及软件在安装目录内新建的文档都必须保留。
16. Windows 自定义安装目录必须通过命令参数与 Unicode 安全的进程环境双通道传递，安装成功页出现前必须同时核对目标目录内主程序和卸载注册表的 `InstallLocation`。从旧目录迁移时只允许清理明确的程序文件，旧目录内文档必须保留。
17. 禁止使用通配符或递归方式删除安装目录、旧安装目录及其子目录；禁止根据注册表、偏好、前端、网络响应或命令行提供的路径删除文件。唯一允许的递归清理对象，是当前操作刚通过 `os.MkdirTemp` 创建并且未向外暴露的私有临时目录。
18. 更新器只能覆盖经过规范化与所有权验证的当前应用目标；回滚失败时必须保留备份和恢复材料。任何新增 `os.Remove`、`os.RemoveAll`、NSIS `Delete`、`RMDir` 或 shell 删除命令，都必须附带路径归属测试和失败时保留用户数据的回归测试。

## 11. 安全边界

- Markdown HTML 必须经过 DOMPurify，不能直接信任用户文档中的 HTML。
- 外部地址只允许 `http`/`https`，由 `OpenExternal` 校验后交给系统浏览器。
- 本地图片限制为图片 MIME，单张预览上限 25 MB。
- 文件夹遍历限制深度和数量，并跳过隐藏目录与 `node_modules`。
- 所有文件路径使用 `filepath.Clean`/`filepath.Abs`；Windows 路径比较需考虑大小写。
- 不要将个人令牌、GitHub Token、签名证书或用户文件加入仓库。
- “参与产品改进计划”只控制异常错误日志：仅在用户启用时后台静默提交清理本地路径后的错误日志、服务器解析的国家/省/市、系统类型（Windows/macOS/Linux）和软件版本。每日活跃统计独立运行，每台设备每天最多提交一次本地随机匿名标识、软件版本、系统类型和 CPU 架构；服务器只保存标识的不可逆哈希及解析后的地域，不保存来源 IP。两类请求均不得包含文档内容、文件名、文件路径、联系方式或具体操作行为，必须短超时、不重试，任何失败不得提示或影响主功能。
- “意见反馈”是用户主动触发的独立提交，不受产品改进计划开关影响。只允许发送用户填写的反馈内容、可选邮箱/手机、用户主动选择的图片、软件版本、系统类型和系统版本；服务器可记录请求 IP 并解析国家/省份/城市，仅在管理员反馈详情中展示，客户端提交前必须明确说明。不得自动附带当前文档、文件路径或其他文件。服务器删除反馈时必须同步永久删除全部关联图片。
- 未配置 Windows Authenticode 和 Apple Developer ID；文档必须如实说明未签名构建可能触发安全提示。

## 12. 修改代码的推荐流程

1. 阅读本文件和任务相关源码。
2. 检查工作区现有改动，保留用户未提交内容。
3. 只修改任务范围内文件。
4. Go API 变化后重新生成/核对 `frontend/wailsjs` 绑定。
5. 用户可见变化同步更新中英文 UI 文案、README 和 CHANGELOG。
6. 补充或修改 `app_test.go` 回归测试。
7. 运行测试和生产构建。
8. 检查 `git diff --check` 和版本一致性。
9. 需要发布时再生成安装包；不要提交生成目录。

## 13. 本地开发与验证

要求：Go 1.25、Node.js 22、Wails 2.13，以及当前平台对应的 Wails 系统依赖。

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.13.0
cd frontend
npm install
cd ..
wails dev
```

最低验证集：

```bash
go test ./...
go vet ./...
cd frontend
npm install
npm run build
```

Windows 安装包：

```powershell
$version = (Get-Content wails.json | ConvertFrom-Json).info.productVersion
$installer = "build/bin/quillite-markdown-$version-windows-amd64.exe"
wails build -clean -platform windows/amd64 -nsis -installscope user -webview2 embed -trimpath
./scripts/build-windows-launcher.ps1 -CoreInstaller $installer -Output $installer
```

Windows 安装包交付规则（强制）：

1. `wails build -nsis` 生成的文件只是 NSIS 核心安装包，不是可交付成品；不得将其作为最终安装包报告给用户。
2. 必须继续执行 `scripts/build-windows-launcher.ps1`，将新版自定义安装界面和 NSIS 核心包封装为同一个 `.exe`。
3. 封装脚本必须通过文件长度及末尾 `QUILLITE_PAYLOAD` 标记校验；任一步失败都视为打包失败，不能报告“已完成”。
4. 交付前必须再次读取成品的文件大小、修改时间和 SHA-256，并向用户提供 `build/bin/quillite-markdown-<version>-windows-amd64.exe` 的完整路径。
5. 每次代码修改完成且验证通过后自动执行上述完整流程，不等待用户再次提醒；禁止只运行第一步。
6. Windows 更新前必须静默检查 `uninstall.exe`：带安全标识的版本必须原样保留；只有注册表卸载命令精确指向当前程序目录中同一文件时，才允许把无安全标识的旧版判定为本产品拥有的风险卸载器。风险版优先只删除该精确文件，删除失败时改名禁用，再失败时只移除精确匹配的卸载登记；严禁仅凭文件名处理未知文件，也不得使用通配符、递归删除或扩大到安装目录。独立的重大缺陷弹框保持取消；只有上述方式全部无法解除风险时，才阻断热更新并回退为完整安装包。

macOS 应用包应通过统一脚本构建，脚本会把 Wails 的原始输出规范为 `轻阅 Markdown.app`，避免 Spotlight 或启动台显示项目内部名称：

```bash
bash scripts/build-macos.sh darwin/universal
```

除非已经明确生成并检查过 `frontend/dist`，否则不要使用 `-s`/`-skipbindings` 跳过前端或绑定生成。

## 14. 版本发布

版本号需要同步到：

- `app.go` 的 `appVersion`
- `wails.json` 的 `info.productVersion`
- `frontend/package.json` 与 `frontend/package-lock.json`
- `frontend/index.html`
- `frontend/src/main.js`
- `frontend/src/renderer.js`
- `build/windows/installer/project.nsi`
- `CHANGELOG.md`、`README.md`、`README.en.md`、`README.zh-CN.md`、`RELEASING.md`

标签必须与版本完全一致，例如 `v2.4.0`。`.github/workflows/release.yml` 会：

1. 验证标签与 `wails.json`。
2. 构建 Windows x64 安装程序。
3. 构建 macOS Universal DMG。
4. 构建 Linux DEB 与 AppImage。
5. 从 CHANGELOG 提取当前版本段。
6. 创建或更新同标签 GitHub Release，并替换同名产物。

发布前还需要人工验证：安装升级、桌面图标、文件关联、macOS 窗口样式、Linux 启动、更新弹窗和下载链接。

### 推送与发布规范（常驻规则）

1. 代码推送只推送到 GitHub 一个 remote：用 `push-to-github.bat`（自动拉取 + 提交 + 推送 + 重试），或等价命令 `git push origin <branch>`。Gitee 镜像已停止同步，不再推送。
2. 版本发布流程：同步版本号 → 更新 CHANGELOG/README → 提交 → 推送 `main` → 打 tag（与版本完全一致）→ 推送 tag 到 GitHub 触发 `release.yml` → 构建完成后验证 GitHub Release 有三平台产物。

## 15. 完成标准

一个修改只有在以下条件全部满足时才算完成：

- 功能满足需求且未破坏上述产品规则。
- Go 测试、`go vet`、JavaScript 语法和前端生产构建通过。
- 跨平台差异已考虑，至少没有引入明显平台专用路径或快捷键错误。
- 用户可见文字具有中英文版本。
- CHANGELOG 和相关 README 已更新。
- 不包含构建产物、依赖目录、凭据或无关改动。
