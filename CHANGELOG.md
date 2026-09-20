# Changelog

All notable changes to Quillite Markdown are documented here.

## [Unreleased]

## [2.7.5] - 2026-09-18

### 简体中文

- 修复部分 OpenAI 兼容服务流式返回空内容时 AI 总结失败的问题：仅在尚未产生任何文本时自动回退一次非流式请求，并兼容更多文本字段。
- 修复大文档与图片导出的边界问题：Pandoc 源文档上限与 64 MiB 文档限制一致，Word、HTML 和 PDF 渲染内容使用独立的 96 MiB 上限；PNG/JPEG 导出会先验证并内嵌图片，同时保持原显示尺寸，无法读取图片时停止导出而不生成缺图文件。
- Windows 应用内更新在 AppData 执行助手被系统策略拒绝时，可在已安装程序旁创建独占命名的临时助手；重启后只通过同一文件句柄删除与已确认旧版本完全一致的助手，未知文件不按路径删除，也不安排重启后延迟删除。
- 错误诊断不再上报权限拒绝、无效 API Key、文件已不存在等可预期操作结果；新增常见凭据脱敏，并只读取错误对象的白名单字段，避免任意对象携带文档数据进入诊断。
- 修复 Windows“应用和功能”普通卸载入口：登记命令使用 NSIS 原位运行参数，保持严格的卸载程序路径、安装标识和注册表三重校验，同时让正常卸载不再因临时副本路径被拒绝。发布 CI 会核对真实登记命令并在 GitHub 托管临时机完成安装、原位升级、卸载和用户文档保留验证。
- 仅编辑模式在“另存为”与“退出编辑”之间显示“恢复预览”，一键恢复上次分栏方向及最新正文，恢复后自动隐藏按钮。
- 新增持久化的“仅编辑”布局：实时预览标题栏可关闭预览，编辑器占满可用宽度；“更多 → 编辑布局”可恢复两种分栏方向。`Ctrl/⌘ + E` 在完整预览与编辑间切换，保留光标与撤销记录。隐藏期间取消预览调度、停止后续图表渲染并释放图表实例，导出时按需渲染最新正文。
- 修复本轮审计的五项问题：最终文档写入改为保护原文件后仅向空目标位置提交，Windows 使用排他句柄校验并移动原文件；提交位置被外部程序占用时拒绝覆盖，保留恢复材料。macOS/Linux 无法强制约束其他编辑器的已有写句柄，成功保存后也保留原 inode 对应的 `.quillite-save-recovery-*` 本地恢复副本，不自动清理。修复工具定位时权限提示被遮挡、模板新建后预览空白、嵌套/HTML 标题锚点误报，以及安装回归脚本从错误位置运行卸载器的问题。
- 新增“更多 → 文档工具”：基础 Markdown 问题检查与定位、文件夹全文搜索、批量替换前后预览、文档安全中心、自定义模板与隐私诊断导出。批量替换默认不勾选文件，跳过当前文档与链接，必须经一次性预览令牌确认；写入前保存历史版本并重新核对修订号，冲突逐文件跳过，不自动重试。备份及历史只能另存新副本，不覆盖原文件。
- 发布流水线新增安全回归门禁与仅限 GitHub 托管 Windows 临时环境运行的安装/升级/卸载文档保留验证；本地不会自动执行真实安装卸载测试。
- 保存、另存与冲突副本的返回内容和修订号固定对应本次实际写入的字节，避免写入后被外部修改的版本成为下一次覆盖依据；前端拒绝内容不一致的保存回执。阅读模式下手动合并也主动更新恢复备份，不再依赖编辑器初始化。
- 修复冲突恢复保护：恢复快照持久化原始修订号与冲突状态，旧快照或版本不匹配时继续暂停自动保存；冲突未解决时不因内容等于旧基线清除备份。过期合并草稿需明确确认丢弃后重新合并。统一已确认风险卸载器仅禁用登记后的再次更新检查，不扩大文件处理权限。
- 文档保存冲突新增“磁盘版本／当前编辑”并排对比，可保留当前编辑、使用磁盘版本、另存新副本或手动合并。冲突期间暂停自动保存；合并先应用到编辑器，再次保存需明确确认，并重新校验磁盘修订。副本只允许新文件名，不覆盖已有文件。
- Windows 旧卸载器自动处理要求完整文件 SHA-256 命中已审核风险名单，并精确匹配本产品卸载登记；未知文件即使命中旧登记也不删除、不改名、不移除登记。安全标记版本继续保留。
- 文件核验和删除/禁用使用同一锁定句柄，防止检查后替换；改名禁止覆盖现存文件。无安全标记且身份不明时暂停热更新，引导用户备份后选择新目录完整安装。
- 当前未取得可验证的旧卸载器样本，生产风险名单为空；不会用安装包哈希、版本号或现场采集哈希冒充已确认身份。

### English

- Fixed AI summaries for OpenAI-compatible gateways that return an empty streamed response. A single non-streaming fallback is used only before any text has been emitted, with support for additional compatible text fields.
- Fixed large-document and image-export boundaries. Pandoc now shares the 64 MiB source-document limit; Word, HTML, and PDF rendered exports have a separate 96 MiB limit; and PNG/JPEG export validates and embeds images without changing their displayed size. Unreadable images stop the export instead of producing incomplete output.
- Windows in-app updates can stage an exclusively named helper beside the installed application when policy blocks execution from AppData. After restart, cleanup deletes only the file object held and verified as byte-identical to the confirmed previous version; unknown paths are untouched and no reboot-time path deletion is scheduled.
- Diagnostics no longer submit expected permission, invalid-key, or missing-file outcomes. Common credential formats are redacted, and only allowlisted error fields are read so arbitrary objects cannot carry document data into diagnostics.
- Fixed the normal Windows Apps & Features uninstall entry. The registered command now uses NSIS in-place execution, preserving strict executable-path, ownership-marker, and registry checks without rejecting a legitimate uninstall from a temporary self-copy. Release CI validates the registered command and performs install, in-place upgrade, uninstall, and user-document preservation checks on a disposable GitHub-hosted runner.
- Editor-only mode shows Restore preview between Save As and Exit editing. It restores the previous split orientation and latest content, then hides itself.
- Added persistent Editor only layout: close the live-preview pane for full-width editing and restore either split orientation from More → Editor layout. `Ctrl/⌘ + E` toggles the full reading preview while preserving the caret and undo history. Hidden previews cancel scheduled rendering and pending chart work, dispose chart instances, and render fresh content only when explicitly exporting or restoring the preview.
- Fixed five audit findings: final document publication is create-only after preserving the original; Windows verifies and moves the original through an exclusive handle. Concurrently recreated destinations are never overwritten, and recovery material is retained on failure. Since POSIX cannot exclude other editors' open writers, macOS/Linux retain original-inode `.quillite-save-recovery-*` backups after successful saves too, without automatic deletion. Fixed obscured permission prompts during tool navigation, blank template previews, nested/HTML heading anchor checks, and lifecycle tests running an uninstaller from the wrong location.
- Added More → Document tools: basic Markdown checks with source navigation, folder text search, before/after batch replacement previews, a document safety center, custom templates and private diagnostic export. Batch replacement starts with no files selected, excludes the open document and links, and requires a single-use preview token. Each write captures history and rechecks revisions; conflicts are skipped without automatic retries. Recovery/history exports only create new copies.
- Added a release safety regression gate and a real install/upgrade/uninstall document-preservation test restricted to disposable GitHub-hosted Windows runners. Local runs never automatically install or uninstall the application.
- Save, Save As and conflict-copy receipts now describe the bytes written by that operation, never a subsequently reread external version. The frontend rejects mismatched receipt content. Reader-only manual merges explicitly update recovery backups without requiring an initialized editor.
- Recovery snapshots persist the original revision and conflict state; legacy or mismatched snapshots remain paused for comparison. Unresolved conflicts keep backups even when content matches the old baseline. Stale merge drafts require explicit discard before restarting. Repeated update checks now agree after registry-only remediation of a verified risky uninstaller, without expanding file mutation authority.
- Document conflicts now show disk and editor versions side by side, with keep edits, use disk, save a new copy, and manual merge actions. Autosave stays paused during conflicts. Merges are applied to the editor first and require explicit save confirmation with revision revalidation. Conflict copies never overwrite existing files.
- Legacy Windows uninstaller remediation requires an audited full-file SHA-256 allowlist match plus exact product uninstall registration. Unknown files and registrations remain untouched, even with stale matching registry entries. Safe-marked files remain preserved.
- Verification and deletion/disable use the same locked handle; rename never overwrites an existing destination. Unverified unmarked files block in-app updates and guide users to back up and install into a new dedicated directory.
- No verified historical uninstaller specimen is currently available, so the production risk allowlist is empty. Installer hashes, version strings and hashes learned on users' machines are never treated as proof.

## [2.7.4] - 2026-09-14

### 简体中文

- 本次重新构建保留每次启动、检查更新和执行更新时的旧卸载器处理逻辑，带安全标记的版本原样保留。已知限制：旧卸载登记仍在但同名文件已被替换时，现有路径归属判断可能误认；本次未加入风险文件哈希名单。
- 安全复审：保存前校验文档内容指纹，外部修改冲突时保留编辑并提示另存；Windows 替换保留 ACL/数据流并带失败恢复备份，macOS 使用原生元数据复制，特殊文件无法安全处理时拒绝覆盖。
- Pandoc 改为临时输出，成功验证后再替换；导出图片请求阻止回环、内网及重定向绕过。更新请求重定向限制在官网 HTTPS 地址。
- 文档读取、保存、历史快照和异常恢复统一 64 MiB 上限，恢复失败明确提醒；发布流水线增加 Windows/macOS 测试与静态检查，严格检出发布标签，删除未经校验的 NSIS 下载兜底。
- 文档保存和另存为改为同目录临时文件同步后替换，失败时保留原文件；历史版本清理只处理经路径归属和内容格式验证的快照。
- Windows 安装核心在覆盖程序文件前再次校验目录归属，卸载需同时匹配程序文件、标记与卸载登记；无法验证目标的快捷方式不再被覆盖或删除。macOS 更新保留旧版应用包作为恢复备份。
- Windows 安装器新增最终路径确认页：默认或自定义选择后先显示实际安装目录，可返回或更改位置；只有明确点击“确认并安装”才开始安装，避免选完文件夹立即安装。
- 缩小常见路径的确认框，长路径仍可换行显示；二次安装会在验证程序与目录归属标记后优先定位上次安装位置，兼容用户级、系统级及旧版安装登记。
- 二次安装点击“自定义安装”时，文件夹选择器直接定位到已验证的上次安装目录；确认同一目录可原位安装，不会创建第二层“轻阅 Markdown”。
- 将 Windows 安装路径确认页的“返回”紧邻“更改位置”排列，中英文分别匹配文字宽度，并同步调整鼠标命中区域。

### English

- This rebuild retains legacy-uninstaller remediation at startup and during update checks/application; safe-marked versions remain untouched. Known limitation: a stale uninstall registration can misidentify a replaced same-name file. A risky-file hash allowlist is not included in this rebuild.
- Safety review: saves validate content fingerprints and retain editor changes on external conflicts. Windows replacement preserves ACLs/streams with a recovery backup; macOS copies native metadata, and unsupported special files fail closed.
- Pandoc writes temporary output before committing; remote export images cannot access loopback/private networks, including through redirects. Update redirects stay on the official HTTPS origin.
- Reading, saving, history and recovery share a 64 MiB limit, with visible recovery-failure warnings. Release CI adds Windows/macOS tests and vet, checks out the exact release tag, and removes the unverified NSIS download fallback.
- Document saves and Save As now sync a same-directory temporary file before replacing the target, preserving the original on failure. History pruning considers only snapshots with verified ownership and format.
- The Windows installer core revalidates destination ownership before overwriting program files, and the uninstaller requires matching executable, marker, and registration. Unverified shortcuts are neither overwritten nor deleted. macOS updates retain the previous app bundle for recovery.
- Added a final destination confirmation screen to the Windows installer. Default and custom selections show the actual target folder, allow going back or changing it, and do not start installation until the user explicitly confirms.
- Made the destination card compact for ordinary paths while retaining wrapping for longer paths. Repeat installations now prefer a verified previous location from per-user, machine-wide, or legacy registration records.
- Custom installation now opens the folder picker at the verified previous installation directory. Confirming that folder reuses it in place rather than creating a second `Quillite Markdown` level.
- Placed Back immediately after Change location on the Windows destination-confirmation screen, with language-specific spacing and matching click targets.

## [2.7.3] - 2026-09-11

### 简体中文

- 取消 Windows 旧卸载器的独立重大缺陷弹框。更新检查会静默识别注册表卸载命令精确指向当前安装目录、且不含安全标识的风险 `uninstall.exe`：优先只删除该文件，失败则改名禁用，再失败则移除精确匹配的卸载登记；带安全标识的版本及无法确认归属的同名文件一律保留。风险解除后继续应用内更新，全部措施失败时仍安全回退到完整安装包。
- 修复 2.7.3 Windows 安装启动器错误地预先创建取消标记、导致安装核心启动后立即中断的问题；取消标记现在只在用户主动取消时生成，并增加安装握手回归测试。
- 完成文件删除安全复审：Windows 安装、升级和卸载全面禁止通配符及递归目录删除，不再自动清理注册表记录的旧安装目录；注册表安装位置必须通过程序文件和专属目录标识双重验证，卸载前也必须读取并匹配该标识，标识缺失或异常时只移除卸载登记并保留全部文件。草稿另存为只迁移应用内记录，不再物理删除原草稿；Windows 更新辅助程序仅允许从应用更新目录原子替换带安全卸载器的 `QuilliteMarkdown.exe`，并在启动失败时恢复已保留的旧版本，macOS 更新也改用随机私有暂存目录并在替换前验证当前应用签名和 Bundle Identifier。
- macOS 源码更新脚本不再使用 `git reset --hard` 或 `git clean`；检测到未提交、已修改或未跟踪文件时立即停止，仅允许 `git merge --ff-only`，避免辅助脚本清除本地工作。
- 修复 Windows 自定义安装路径可能被旧的 C 盘安装记录覆盖，以及程序文件与用户文件混放、卸载存在递归删除整个目录风险的问题。自定义路径现通过参数与 Unicode 安全的进程环境双通道传入，完成前核验目标盘程序及注册表位置；所选文件夹始终作为父目录，并在其中新建“轻阅 Markdown”专属子目录。跨盘迁移保留旧位置的全部文件供用户自行确认，卸载也仅在目录归属验证通过后删除本软件拥有的精确程序文件名。
- 未保存文档退出确认改为应用内三操作弹框，新增“保存”主按钮，并保留“不保存”和“取消”。保存会等待自动保存结束并确认最新内容落盘后再退出；保存失败或取消另存为时继续保留窗口和编辑内容。
- AI 生成、编辑、校对、续写、翻译、精简、扩写和自定义入口均提供与任务匹配的提示词输入；续写与扩写可选择填写目标字数，精简可选择填写保留比例或目标篇幅，留空时不限制。翻译要求改为紧凑的单行输入框，与目标语言和生成按钮同高对齐。修复目标语言列表展示 30 种、后端却只接受 4 种的问题，现已逐项支持全部可见语言。
- 编辑器 AI 下拉菜单首位新增突出显示的“AI生成”，可输入自定义提示词生成 Markdown 文档内容，预览结果后确认插入当前光标位置，不会覆盖已有文字。
- 修复“AI生成”弹窗误显示为“AI编辑”以及生成后“插入到光标位置”按钮无法点击的问题，并将“生成”按钮移至具体要求文本框下方。
- AI 弹窗移除重复的“处理方式”选择，由工具栏中的 AI 功能直接确定生成、编辑、校对、续写、翻译、精简、扩写或自定义流程；各流程使用独立标题、输入范围和必要字段。
- 阅读页首位新增醒目的“AI总结生成”入口，并采用文档内联速览：发送前复用敏感内容识别、可选脱敏和整篇文档发送确认，操作栏下方原位显示实时进度，完成后展示约 5–10 秒可读完的一句话概览与 3–5 个关键点，并可随时关闭；长文档先分段提炼再二次汇总，避免把多段摘要简单拼接。
- AI 翻译的目标语言由 4 种扩展到 30 种世界常用语言，增加繁体中文、西班牙语、印地语、阿拉伯语、法语、孟加拉语、葡萄牙语、印尼语、乌尔都语等常用选项；每项均以“本地语言名（中文名称）”显示，便于识别不同文字。
- 将编辑器标题栏的“历史版本”按钮调整到操作区最右侧，使保存状态、另存为和退出编辑保持连续排列。
- 编辑器 AI 入口统一移到“正文／标题”选择框后的 AI 下拉菜单，集中提供 AI 编辑、校对、续写、翻译、精简、扩写和自定义功能；移除编辑器标题栏中重复的 AI 编辑与 AI 检查按钮。AI 续写会读取光标前的上下文并把新内容插入光标位置。
- 修复 AI 编辑返回大量逐项修改时卡片被压缩成横线的问题；每条修改保持完整内容高度，超过 300 像素后在列表内部滚动。
- 新增文档异常恢复：未保存的编辑内容会防抖写入独立的原子恢复快照，正常保存或明确放弃后自动清理；异常退出后启动时可选择恢复并继续编辑。大文档按规模延迟实时预览，暂停高成本全文拼写扫描，并避免每次按键复制整篇编辑缓冲区；预览跟随光标改用二分定位，降低长文档输入与导航卡顿。
- 统一 AI 设置中服务与模型下拉框的高度、字体和箭头，修复 macOS/WebKit 原生样式不一致。DeepSeek 未配置 Key 时显示两个内置候选并明确提示尚未查询账号；保存或测试连接保存 Key 后加载实际模型，刷新失败保留上次列表，快速切换服务或关闭弹窗时忽略过期查询结果。
- 新增第一批第三方 AI 接入：阿里云百炼、硅基流动、OpenRouter 与自定义 OpenAI 兼容接口。百炼支持官方公共地址、业务空间及 Token Plan 兼容地址，自定义接口支持模型手动填写和 `/models` 自动发现；每个平台 Key 独立保存在系统凭据库。固定平台地址不可篡改，自定义地址强制 HTTPS，仅 localhost 允许 HTTP，并拒绝地址中的凭据、查询参数和具体请求端点。
- 调整 AI 设置顺序为先填写 API Key、再选择模型；自定义 OpenAI 兼容接口不再预填假定的默认模型，必须使用服务商实际提供的模型 ID。
- AI 模型选择支持在地址和 API Key 输入完整后自动加载，无需先保存 Key；草稿 Key 只用于当次查询，不会落盘。阿里云百炼业务空间兼容地址会自动转换为其 `/api/v1/models` 接口并解析专用响应格式，查询完成后由用户选择模型，不自动指定默认项。
- “测试连接”升级为分步骤连接诊断，分别展示服务地址、API Key、模型列表和所选模型实际调用结果，并针对鉴权失败与地址错误提供可理解的提示。诊断可直接使用尚未保存的 Key，且不会额外持久化凭据。
- 模型列表成功查询后会按服务与地址缓存七天，接口临时不可用时显示带时间标记的缓存候选；关闭正在生成的 AI 编辑或 AI 检查会立即取消底层网络请求，不再只关闭界面后继续占用连接。
- AI 编辑改为兼容 OpenAI SSE 的实时流式输出，生成内容会逐段显示，服务完成或用户取消时立即结束连接；AI 结果新增逐项差异审阅，可分别接受修改或保留原文，再一次性安全写回当前选区。
- 新增纯本地文档版本历史：保存前自动压缩保留旧版本，可在编辑器中比较并恢复；单文档最多 30 版、全局最多 100 MB，历史记录不会发送到网络。
- AI 编辑与文档检查支持最长 200 万字符的 Markdown 分段处理，按标题和段落切分、跳过围栏代码块并显示真实分段进度，单段异常会自动重试一次。
- AI 修改审阅升级为段落级修改卡片，支持全部／已接受／保留原文筛选、分批加载和一键定位原文，长结果不再一次渲染全部节点。
- 新增 AI 发送前隐私检查，可识别 API Key、邮箱、手机号、身份证号和银行卡号；用户可逐项决定是否用可还原占位符脱敏，AI 返回后仅在本机恢复原值。

### English

- Removed the standalone critical-defect dialog for legacy Windows uninstallers. Update checks now silently identify only an unmarked `uninstall.exe` whose registered uninstall command points exactly to the current install directory, delete that exact file when possible, rename it as a fallback, or remove only the exact matching uninstall registration as a final disable step. Safety-marked and unowned same-name files are always preserved; in-app updating resumes after remediation and still falls back to the full installer if every measure fails.
- Fixed a 2.7.3 Windows launcher regression that created the cancellation marker before starting the installer core, causing every installation to stop immediately. The marker is now created only after an explicit user cancellation, with a regression test covering the installer handshake.
- Completed a destructive-filesystem safety review. Windows installation, upgrade, and uninstall paths now forbid wildcard and recursive directory deletion and never automatically clean a registry-recorded previous install directory. A recorded install location must pass both executable and dedicated ownership-token checks; uninstall applies the same token check, and a missing or invalid token removes only the uninstall registration while preserving every file. Save As migrates draft records without physically deleting the original draft. The Windows update helper atomically replaces only `QuilliteMarkdown.exe` from the application update directory when a safety-marked uninstaller is present and restores its preserved previous version if launch fails, while macOS updates use random private staging directories and verify the current bundle identifier and signature before replacement.
- The macOS source-update helper no longer uses `git reset --hard` or `git clean`. It stops when modified, uncommitted, or untracked files exist and permits only a `git merge --ff-only`, preventing the helper from discarding local work.
- Fixed a previous C-drive install record overriding a Windows custom destination, as well as application files mixing with user data and recursive destination deletion during uninstall. The destination now reaches NSIS through both an argument and a Unicode-safe process environment variable, and completion verifies the executable and registry location. Every custom-selected folder becomes a parent with a dedicated Quillite Markdown child directory. Cross-drive moves preserve every file in the previous location for manual review, and uninstall deletes only exact product filenames after directory ownership has been verified.
- Replaced the limited native unsaved-changes warning with an in-app Save / Don't Save / Cancel dialog. Save waits for any autosave, verifies the latest content is written, and quits only after success; failed or cancelled saves keep the document open.
- Added task-specific prompts to AI Generate, Edit, Proofread, Continue, Translate, Condense, Expand, and Custom. Continue and Expand optionally accept a target length, while Condense optionally accepts a retention ratio or target size; leaving it blank applies no limit. Translation instructions now use a compact single-line field aligned in height with the target-language selector and Generate button. Fixed the backend to support all 30 visible translation targets instead of accepting only four.
- Added a prominent AI Generate action at the top of the editor AI menu. It writes Markdown from a custom prompt and inserts the reviewed result at the current cursor without replacing existing text.
- Fixed the AI Generate dialog title and its disabled insert-at-cursor action, and moved Generate below the instruction field.
- Removed the redundant action selector from the AI dialog. Each toolbar command now opens its dedicated generate, edit, proofread, continue, translate, condense, expand, or custom workflow with the correct title, scope, and required fields.
- Added a prominent AI Summary action at the start of the reader toolbar and made it an inline brief. Before sending, it reuses sensitive-content detection, optional redaction, and explicit whole-document consent. Progress appears below the document actions, then the same panel shows a closable 5–10 second overview with one lead sentence and 3–5 key points. Long documents are summarized by section and consolidated instead of concatenating partial summaries.
- Expanded AI translation targets from four to 30 widely used languages, including Traditional Chinese, Spanish, Hindi, Arabic, French, Bengali, Portuguese, Indonesian, Urdu, and more. Every option now pairs its native label with a Chinese-language annotation for easier identification.
- Moved the Version History button to the far right of the editor header actions, keeping save status, Save As, and Exit Editing together.
- Consolidated editor AI actions into an AI dropdown beside the paragraph/heading picker, covering edit, proofread, continue, translate, condense, expand, and custom actions; removed the duplicate AI Edit and AI Check header buttons. AI Continue reads context before the cursor and inserts only new content at the cursor.
- Fixed AI edit review cards collapsing into horizontal lines when many changes are returned; each change now keeps its full content height and long lists scroll internally after 300 pixels.
- Added crash recovery for documents: unsaved edits are debounced into a separate atomic snapshot, cleared after a successful save or an explicit discard, and offered for restoration after an abnormal exit. Large documents defer live-preview work by size, pause expensive full-document spell scans, avoid copying the entire editor buffer on every keystroke, and use binary lookup for cursor-following preview navigation.
- Standardized AI provider/model picker heights, fonts, and arrows for macOS/WebKit. DeepSeek shows two explicitly unverified built-in candidates before a key is configured. Saving a key (including through Test connection) loads account models; failed refreshes retain the previous list, and stale discovery results cannot overwrite a different provider or a closed dialog.
- Added the first third-party AI integrations: Alibaba Cloud Model Studio, SiliconFlow, OpenRouter, and custom OpenAI-compatible endpoints. Model Studio supports its public, workspace, and Token Plan compatible URLs; custom endpoints allow manual model IDs plus `/models` discovery. Keys remain isolated in the native credential vault. Fixed provider URLs cannot be overridden, custom URLs require HTTPS except on localhost, and embedded credentials, queries, or request-specific paths are rejected.
- Reordered AI setup so the API key comes before model selection. Custom OpenAI-compatible endpoints no longer assume a default model and require an actual model ID supplied by the service.
- Model discovery now starts automatically once the endpoint and API key are entered, without saving the key first. Draft keys are used only for the current request and are never persisted. Alibaba Cloud workspace-compatible URLs are translated to the dedicated `/api/v1/models` endpoint and its response format is parsed; users still choose a model after discovery rather than receiving an assumed default.
- Test Connection is now a staged connection diagnostic covering the service endpoint, API key, model list, and a real request to the selected model, with clearer authentication and endpoint guidance. Diagnostics can use an unsaved draft key without persisting it.
- Successful model lists are cached for seven days per provider and endpoint, with a visible cache timestamp when live discovery is unavailable. Closing an active AI Edit or AI Check now cancels the underlying network request instead of merely hiding the dialog.
- AI Edit now streams OpenAI-compatible SSE output into the result pane as it arrives and ends promptly on provider completion or cancellation. A per-change diff review lets users accept individual revisions or retain the original fragments before applying once to the current selection.
- Added fully local document version history. Each save can retain a compressed pre-save revision for comparison and restoration, capped at 30 versions per document and 100 MB globally; history never leaves the device.
- AI Edit and AI Check now process Markdown documents up to two million characters in heading/paragraph chunks, preserve fenced code locally, report real chunk progress, and automatically retry a failed chunk once.
- AI change review now groups nearby edits by paragraph, filters accepted or retained changes, renders results in batches, and locates the original text in one click.
- Added a pre-send AI privacy check for API keys, email addresses, phone numbers, ID numbers, and bank cards. Users choose each value to redact with a reversible placeholder, and originals are restored locally after the response.

## [2.7.2] - 2026-09-08

### 简体中文

- 全部 Mermaid／ECharts 代码块统一提供“编辑此图表”入口，自动选择画布、结构化表单或原始源码与实时预览。桑基图新增来源／目标／数值表格并修复中文节点渲染；图表保存保留原引擎、缩进、换行及 ECharts 已有配置，文档会话或原图变化时阻止过期覆盖。
- 修复图表安全过滤误改原始数据和维度映射的问题，保留数据中的 link、constructor 等合法字段；改为逐项遍历大数组，避免大量数据点或筛选条件触发参数数量上限。原型污染防护与真正图表配置的安全限制保持生效。
- 修复词云强制统一字号的问题，恢复按词频权重和 sizeRange 显示大小，同时保留用户显式设置的字号。
- 打开文件按最新请求生效，等待期间新增的编辑再次确认后才丢弃。升级 DOMPurify、Mermaid、ECharts 及相关依赖，ECharts 保留 v5 主题布局；数据图表强制安全的 richText 提示框、过滤危险链接及原型键、转义数据视图标签，并拒绝文档提供的正则筛选以防界面卡死。
- 修复异步保存、另存为、写权限检查和磁盘刷新跨文档返回时误更新当前文档的问题；保存期间继续输入或退出编辑仍保留未保存状态。内置范例另存后立即恢复可编辑控件和真实路径。
- AI 编辑结果与文档会话绑定，切换文件或关闭预览时清除旧选区，避免相同文字或插入操作落入另一份文档。
- 导出文件替换失败不再删除原目标；偏好设置改为临时文件写入后替换。抽取共用写文件函数并补充数据保护回归测试。
- 公式字体只打包 WOFF2，保留全部字形，移除重复的 TTF／WOFF 编码；案例生成测试改用临时目录，避免污染正式文档。

- 编辑模式支持左右切换：通过实时预览标题栏的切换按钮，或“更多 → 编辑布局”选择“预览在左／编辑在左”，并自动记住选择。切换保留正文、选区、撤销记录及 AI 检查结果，分栏拖动与方向键同步适配新的方向。

- Windows 首次显示窗口前，按所在显示器的可用工作区与 DPI 缩放调整尺寸并居中，避免低分辨率主屏、双屏不同缩放或任务栏导致顶部菜单超出屏幕；不限制后续放大窗口，macOS 与 Linux 启动方式保持不变。

### English

- Added a unified Edit this diagram entry for every Mermaid/ECharts fence, routing to a canvas, structured form, or original source with live preview. Sankey diagrams gain Source/Target/Value rows and Unicode label support. In-place saving preserves the engine, indentation, line endings, and existing ECharts options, and rejects stale document sessions or changed source blocks.
- Fixed chart sanitization altering raw data and dimension mappings, preserving legitimate fields such as link and constructor. Large arrays and filter lists are traversed incrementally to avoid argument-count limits, while prototype-pollution protection and executable-option restrictions remain active.
- Fixed word clouds forcing one font size on every word; sizes now follow weights and sizeRange while respecting explicitly configured sizes.
- File opening now honours the latest request and rechecks edits made while waiting. Updated DOMPurify, Mermaid, ECharts and related dependencies, retaining the ECharts v5 theme layout. Data charts enforce richText tooltips, filter unsafe links and prototype keys, escape data-view labels and reject untrusted regex filters.
- Guarded asynchronous saves, Save As, permission checks and disk refreshes by document session. Edits made during a save remain unsaved even after leaving edit mode. Saved reference copies immediately regain editable controls and their real path.
- Bound AI edit selections to their document session to prevent stale replacements or insertions in another document.
- Export replacement failures now preserve the original destination. Preferences use staged writes; shared file-writing code and data-protection regression tests were added.
- Kept every formula font face in WOFF2 while removing duplicate TTF/WOFF assets. Reference-generation tests now write to temporary directories instead of changing tracked examples.

- Added a persistent editor/preview side preference, available from the live-preview swap button or More → Editor layout. Swapping preserves document content, selection, undo history and AI review results; divider dragging and arrow keys follow the selected orientation.

- Windows now fits and centres its startup window within the target monitor's work area before showing it, accounting for DPI scaling, taskbars and negative multi-monitor coordinates. This prevents clipped title bars on smaller displays without limiting later resizing or changing macOS/Linux startup.

## [2.7.1] - 2026-09-04

### 简体中文

- 宽屏本页目录补齐与最近阅读侧栏一致的折叠能力：目录标题栏可收起，收起后在右侧保留边缘箭头按钮，并记住用户选择；窄屏展开时不再把焦点移入尚在动画中的抽屉，消除整页短暂位移后复位的问题。
- 窄屏本页目录入口改为与左侧最近阅读一致的边缘箭头按钮；展开后按钮随目录边缘移动并反向，可直接再次点击自主收起或展开。
- 修复窄屏展开本页目录时，正文滚动条瞬间消失导致页面横向闪动的问题；目录现在不再改变正文滚动与尺寸，遮罩改为平滑淡入。
- 窄屏与竖屏下不再直接关闭本页目录功能：目录默认收起并显示独立入口，展开后作为覆盖正文的右侧抽屉呈现，不再挤压文档；点击章节、关闭按钮、外部遮罩或按 Esc 均可收起，宽屏目录和拖动宽度保持原有行为。
- 修复竖屏显示器或较窄窗口中选择“全宽”后，正文仍被响应式规则限制为 790 像素的问题；全宽模式现在始终使用阅读窗格的全部可用宽度，窄、中、宽模式继续保留适合阅读的响应式上限。
- 修复 macOS 导出 PDF 时，Chrome／Edge 已写完完整 PDF 但无头进程仍保持运行，最终被误报为 `PDF_EXPORT_TIMEOUT` 的问题；导出现在同时监听文件完成与浏览器退出，PDF 一旦校验完整便立即保存并安全结束临时进程，同时保留 Windows 启动器提前退出后的异步写入兼容。
- 强化 Windows 正式打包流程：NSIS 核心包必须继续封装新版自定义安装启动器，并校验文件长度及末尾 `QUILLITE_PAYLOAD` 标记；覆盖已有成品时改用可靠的同目录原子替换，防止误交付旧安装界面。

### English

- Wide layouts now give the on-page outline the same collapsible behavior as the Recent Reading sidebar: a header control collapses it, a right-edge arrow restores it, and the choice persists. Opening the narrow drawer no longer focuses an element while it is still moving in from off-screen, preventing the entire page from briefly shifting and snapping back.
- The narrow-screen outline trigger now matches the edge-arrow treatment used by the Recent Reading sidebar. It follows the drawer edge and reverses direction while open, so the same button can independently expand or collapse the outline.
- Fixed the horizontal page flash when opening the narrow-screen outline, which was caused by temporarily removing the document scrollbar. The outline no longer changes document scrolling or dimensions, and its backdrop now fades in smoothly.
- Narrow and portrait layouts no longer remove the on-page outline. It starts collapsed behind a dedicated trigger and opens as a right-side drawer over the document without changing document width. Selecting a heading, using Close, clicking the backdrop, or pressing Escape dismisses it, while wide-screen resizing remains unchanged.
- Fixed Full width still being capped at 790 pixels on portrait displays or narrower windows. Full width now always uses all available space in the reading pane, while Narrow, Medium, and Wide retain their readable responsive limits.
- Fixed macOS PDF exports being misreported as `PDF_EXPORT_TIMEOUT` when Chrome or Edge had already written a complete PDF but kept its headless process alive. Export now watches file completion and process exit concurrently, saves as soon as the PDF validates, and safely stops the temporary process while retaining support for Windows launchers that exit before detached writing finishes.
- Hardened the official Windows packaging flow: the NSIS core must be wrapped with the current custom installer launcher and pass final-length plus trailing `QUILLITE_PAYLOAD` validation. Replacing an existing output now uses a reliable same-directory atomic move so the legacy installer UI cannot be delivered by mistake.

## [2.7.0] - 2026-09-02

### 简体中文

- 新安装或尚未选择文档宽度时，阅读与编辑区域现在默认使用“宽”；已手动保存的窄、中、宽或全宽设置继续保持不变。
- 修复 Windows 新版 Edge／Chrome 的启动器先退出、实际无头浏览器稍后才写入 PDF 时，直接导出被误判为“找不到 document.pdf”的问题；现在会等待并校验 PDF 完整写入后再保存，不再产生连续失败日志。
- “更多”设置中的界面语言改为与文档宽度一致的“当前值 + 二级菜单”折叠样式，中文与 English 选项默认收起，减少设置面板占用空间。
- Windows 安装程序改为更简洁的双状态原生界面：准备页与完成页共用同一张白色至翡翠绿背景，居中显示应用图标、标题、副标题和两个操作按钮，不再显示百分比、进度条或阶段动画。安装期间保留精简的“正在安装”反馈与安全退出；完成后提供“立即打开”，会按注册表记录或默认目录启动已安装的轻阅 Markdown。窗口继续按原设计等比缩放为 640×427，并使用真实圆角裁切。旧玻璃／能量／高光素材、进度轮询和浏览器动画预览均已删除，正式界面只保留两份 WebP（约 41 KB）；NSIS 改用 Solid LZMA 压缩，全部图文源码仍受 800 KB 构建硬限制。
- 精修 Windows 安装界面的原生分层窗口渲染：四角改用逐像素透明覆盖，图标、文字与按钮在最终 640×427 分辨率直接合成；图标透明边缘会去除暗色底边，按钮使用 8×8 子像素圆角并移除白色外框。标题、说明与按钮文字恢复 Windows 标准 Microsoft YaHei UI 常规字重及 ClearType Natural 渲染，不再使用会让笔画变粗变硬的自定义覆盖率锐化。
- Windows 安装准备页新增“安装位置”与“更改”操作：默认显示当前用户目录，升级时优先沿用注册表记录的原安装目录；用户可通过系统文件夹窗口选择自定义路径，包含中文或空格的路径会作为单个参数安全传给静默 NSIS 核心，并在旧目录解析完成后明确覆盖默认位置。
- Windows 安装准备、安装中与完成三个状态统一为右上角关闭图标和单个居中绿色主按钮；准备页保留“开始安装”，安装中按钮循环显示“正在安装.／..／...”，完成页按钮改为“完成安装”并关闭安装器，同时在完成后3秒自动关闭。所有可点击操作悬停时显示手型光标。安装路径不再常驻占用页面空间，点击左下角“自定义安装”选择目录后会直接开始安装，无需再次确认。
- Windows 安装流程新增中英文双语言切换：默认显示简体中文，右下角可随时切换 English／中文；准备安装、安装中、完成、失败、主按钮、动态安装文字、错误提示、文件夹选择提示和窗口标题都会立即使用所选语言，切换过程中不重置安装状态。
- 全新安装会将安装器当前语言作为软件首次启动语言：使用 English 流程安装后默认进入英文界面，使用中文流程则默认进入简体中文；升级安装继续保留原有语言偏好，不会被安装器覆盖。
- 新增可选的 AI 助手：选中 Markdown 后可进行润色、改写、精简、扩写、总结、翻译或按自定义要求处理，结果会先并排预览，确认后才替换原文，并可通过撤销恢复。
- AI 助手现内置 DeepSeek、智谱 GLM、通义千问、OpenAI 与 Kimi，选择服务并填写对应 API Key 即可使用，官方接口与推荐模型自动配置。各服务的 Key 在 Windows 凭据管理器、macOS 钥匙串或 Linux Secret Service 中分开安全保存，切换或删除某一服务不会影响其他服务，且所有 Key 均不会写入偏好、日志或反馈数据。使用云端接口前会逐次确认发送选中文字。
- AI 助手设置现在会使用所选服务已安全保存的 Key 调用模型列表接口，提供真实可用模型下拉选择，并允许将“服务 + 模型”组合设为默认项；接口暂不可用时会回退到已选或推荐模型。DeepSeek、智谱 GLM、通义千问、OpenAI 和 Kimi 的 Key 可同时保存，加载模型、设置新默认项、测试连接或删除其他服务的 Key 都不会清除任何其他 Key。
- 新增“AI检查”：用户确认后可检查当前整篇 Markdown，按语法、拼写、标点、表达、一致性和 Markdown 语法分类展示可定位的原文与建议修改；支持逐条勾选、全选/取消全选和一键应用所选项。应用前会校验文档快照并阻止错位或重叠建议，全部修改合并为一次可撤销编辑。
- 优化“AI检查”的运行反馈与模型兼容性：检查期间显示动态扫描状态、当前服务与模型、已用时间、阶段说明和渐进进度；失败后保留清晰原因并可直接重试。现在兼容文本块、思考标签、代码围栏、顶层数组和单条 SSE 等常见返回形式，格式不规范时会自动请求模型修复一次，避免长时间静止后只显示“invalid response”。
- “AI检查”不再设置固定超时时间：只要接口连接保持正常，就会持续等待模型完成检查及必要的结果格式修复，直到成功返回或网络/API 明确报错；模型列表和连接测试继续使用较短的超时，避免影响设置页面响应。
- 普通“AI编辑”同样取消固定超时时间，并新增当前服务与模型、已用时间、连接/生成/整理阶段、动态转轮和渐进进度；关闭窗口后旧请求结果不会覆盖后来打开的编辑任务，网络或 API 明确报错时会停止进度并显示原因。
- “AI检查”结果现在会在当前文档的整个编辑会话中保留：关闭弹窗或应用所选修改后再次打开，仍可查看上一次建议；新增独立“重新检查”按钮，只有主动重新检查、退出编辑或切换文档时才清理旧结果，已应用的建议会锁定以避免重复替换。
- 优化“AI检查”长建议的显示：每条原文与建议修改区域随内容自动增高，最高 300 像素后独立滚动；建议数量较多时由整个检查弹框统一滚动，不再压缩卡片或截断末尾文字。

### English
- New installs, or profiles without a saved document-width choice, now default to Wide. Existing Narrow, Medium, Wide, or Full width preferences remain unchanged.
- Fixed direct PDF export being misreported as a missing `document.pdf` when current Windows Edge or Chrome launchers exit before the detached headless browser finishes writing the file. Quillite now waits for and validates a complete PDF before saving it, avoiding repeated false failure logs.
- Interface language in More settings now uses the same compact current-value row and cascading submenu as Document width. Simplified Chinese and English stay collapsed until needed, reducing the menu height.
- The Windows installer now uses a simpler native interface. Ready, installing, and completed states share one white-to-emerald background and center the app icon, title, subtitle, and two actions. Installation adds a smooth numeric percentage without restoring the old progress bar or layered animation; it remains below 100% until the installer core actually succeeds, then completes at 100%. Safe exit and Open now remain available, resolving the installed app from the recorded registry location or the default directory before launch. The genuinely rounded window remains proportionally sized at 640×427. Legacy glass, energy, flare, progress-file polling, and browser-preview code/assets stay removed; production keeps only two WebP files (about 41 KB), while Solid LZMA compresses the NSIS payload and the hard 800 KB source budget remains enforced.
- Ready, installing, and completed Windows installer states now share one top-right close icon and one centered green action. The ready state says Start installation, the installing state cycles `Installing.`, `Installing..`, and `Installing...`, and the completed state uses Finish installation to close the installer while also closing automatically after three seconds. Every interactive action shows a hand cursor on hover. The path row stays hidden, while choosing a folder through Custom installation starts immediately without another confirmation.
- The Windows installation flow is now bilingual. It starts in Simplified Chinese and offers an always-available English／中文 switch in the bottom-right corner. Ready, installing, completed, and failed states—including actions, animated installation text, error messages, folder-picker prompts, and the window title—change immediately without resetting installation progress.
- A fresh install now carries the launcher's selected language into the app: installing through the English flow starts Quillite in English, while the Chinese flow starts it in Simplified Chinese. Upgrades preserve the existing language preference instead of overwriting it.
- Refined the Windows installer surface with per-pixel alpha corners instead of a binary Win32 region, removing visible stair-stepping on all four rounded corners. The primary action now uses a same-color outline rather than a white rim, preserving a clean solid-green silhouette at native scale.
- The installer icon, labels, and buttons are now rendered directly at the final 640×427 display resolution instead of being downsampled together with the 960×640 backdrop. The icon uses cached Catmull–Rom resizing plus transparent-edge color bleeding to remove dark matte halos; buttons use 8×8 subpixel coverage, and layered-window text uses grayscale antialiasing instead of colored ClearType fringes.
- Installer typography now uses standard Microsoft YaHei UI weights and native ClearType Natural rendering at the final resolution. The custom high-contrast coverage mask has been removed so titles, subtitles, percentages, and button labels keep the smooth, balanced appearance of normal Windows text instead of looking heavy or pixel-sharpened.
- The Windows ready screen now shows the installation directory with a Change action. Fresh installs default to the current-user Programs folder, upgrades retain the registered prior location, and an explicitly selected folder safely overrides that location after upgrade detection. Chinese and space-containing paths are passed to the silent NSIS core as one argument.
- Added an optional AI Assistant for selected Markdown: polish, rewrite, shorten, expand, summarize, translate, or follow a custom instruction. Results are reviewed side by side before replacement and remain undoable.
- The AI Assistant now includes DeepSeek, Zhipu GLM, Qwen, OpenAI, and Kimi. Choose a provider and enter its API key; the official endpoint and recommended model are configured automatically. Provider keys are isolated in Windows Credential Manager, macOS Keychain, or Linux Secret Service, so switching or deleting one provider never affects another, and no key is written to preferences, logs, or feedback data. Every cloud operation requires explicit consent before selected text is sent.
- AI settings now use the selected provider's securely stored key to load its available models and present a model picker. A provider-and-model pair can be made the default, while the selected or recommended model remains available as a fallback if model discovery is temporarily unavailable. Keys for DeepSeek, Zhipu GLM, Qwen, OpenAI, and Kimi coexist independently; loading models, changing the default, testing a connection, or deleting one key never removes another.
- Added AI Check for whole-document review after explicit confirmation. It presents precisely locatable grammar, spelling, punctuation, clarity, consistency, and Markdown suggestions with original/replacement comparisons, individual selection, select/clear all, and one-step apply. A source snapshot and overlap checks prevent misplaced edits, while all accepted fixes remain one undoable editor transaction.
- Improved AI Check progress feedback and model compatibility. While checking, the dialog now shows animated scanning, the active provider and model, elapsed time, phase details, and gradual progress; failures retain a clear explanation and an immediate retry path. Common text-block, thinking-tag, fenced, top-level-array, and single-event SSE responses are accepted, and malformed review output gets one automatic format-repair attempt instead of ending with a generic `invalid response`.
- AI Check no longer has a fixed deadline. As long as the connection remains healthy, it keeps waiting for the model and any required output-format repair until completion or an explicit network/API failure. Model discovery and connection tests retain shorter limits so the settings page remains responsive.
- Ordinary AI Edit now also has no fixed deadline and displays the active provider/model, elapsed time, connection/generation/refinement phases, a spinner, and gradual progress. Closing the dialog prevents a stale response from overwriting a later editing task, while explicit network or API errors stop progress and remain visible.
- AI Check results now persist for the entire editing session. Closing the dialog or applying selected fixes no longer discards the previous suggestions, and reopening the dialog shows them again. A dedicated Check again action refreshes them on demand; applied suggestions are locked against duplicate replacement, while exiting editing or switching documents clears the session.
- Improved long AI Check suggestions: original and replacement panes now grow with their content up to 300 pixels before scrolling internally. When many suggestions exceed the available viewport, the complete dialog scrolls as one surface instead of compressing cards or clipping their final lines.

## [2.6.2] - 2026-08-29

### 简体中文

- 修复 macOS 更新或重新启动后，AppKit 在窗口激活、恢复和显示器切换的最终布局阶段再次覆盖三个原生窗口按钮位置的问题；现在会在系统布局完成后的下一帧及短延迟阶段重新确认对齐，避免按钮偶发下移。
- 修复 macOS 左上角三个原生窗口按钮偏高、窗口重新激活后又恢复旧位置的问题；改用 AppKit 原生内嵌标题栏承载按钮，并在网页标题栏加载完成及窗口尺寸变化后重新对齐，与书本图标和应用名称保持同一水平中心线。
- “更多”设置新增软件字体选择，支持系统默认、无衬线、衬线、圆体、宋体和楷体六种跨平台字体预设；界面与 Markdown 正文即时切换，代码内容继续使用等宽字体，选择会写入偏好并在重启后恢复。
- “更多”设置中的软件字体、文档宽度和词典语言改为“当前值 + 二级菜单”的紧凑样式，悬停、点击或键盘均可展开；子菜单会按窗口剩余空间自动选择左右方向，避免设置内容过长或超出屏幕。
- 修复鼠标移入已展开二级菜单触发器后紧接着点击会反而关闭菜单的问题；点击现在始终保持对应二级菜单打开并聚焦当前选项。
- 修复 macOS“更多”设置弹框沿用 Windows 固定右边距、导致弹框偏离三个点按钮的问题；现在按按钮实际位置对齐，并在窗口缩放时保持贴边可见。
- 修复 macOS 重复本地打包时可能误用并重新签名上一次已改名应用包、导致新代码未进入安装包的问题；统一构建脚本现在会先清理精确的旧生成包，再规范化本次 Wails 输出。
- 文档列表改用无底色的主题色线性图标，收窄图标占位以显示更多文件名；保留选中描边、收藏和置顶标记，失效文件使用灰色图标区分。
- 首页采用无阴影的平面样式：移除纸张插画与卡片投影、背景光晕和快捷键双层底边，统一细边框与圆角，改善快捷键字号、行距和文字对比度；明暗主题与系统快捷键保持适配。

### English

- Fixed native macOS window controls occasionally moving down again after an update or relaunch when AppKit performed a final title-bar layout during activation, restoration, or display changes. Alignment is now reconfirmed on the next main-loop turn and after native layout settles.
- Fixed the three native macOS window controls sitting too high and returning to that position after window activation. An AppKit inset title-bar region now owns the controls, with alignment refreshed after the web title bar loads and window layout changes, keeping the same vertical center as the book icon and app name.
- More settings now offers six cross-platform app-font presets: System, Sans serif, Serif, Rounded, Song style, and Kai style. The interface and Markdown prose update immediately while code remains monospaced, and the choice is restored from preferences after restart.
- App font, document width, and dictionary language now use compact current-value rows with cascading submenus. They open by hover, click, or keyboard and automatically choose the side with available viewport space, shortening the More menu without losing any options.
- Fixed a click immediately following hover closing an already revealed settings flyout. Clicking a parent row now always keeps its flyout open and focuses the current choice.
- Fixed the More settings popover inheriting a Windows-oriented fixed right offset on macOS. It now aligns to the actual three-dot button and stays within the viewport while resizing.
- Fixed repeated local macOS builds potentially selecting and re-signing the previous renamed app bundle, leaving new code out of the installer. The shared build script now removes only that stale generated bundle before normalizing the current Wails output.
- Document lists now use theme-colored outline icons without background tiles, leaving more room for filenames. Selection outlines, favorites, and pin markers are retained; missing files use muted icons.
- Refined Home with flat, shadow-free surfaces: removed illustration and card shadows, the background glow, and raised keycap edges. Consistent thin borders and corners, clearer shortcut typography, spacing, and contrast retain light/dark theme and platform shortcut support.

## [2.6.1] - 2026-08-25

### 简体中文

- 流程图新增可视化画布编辑：无需手改 Mermaid 源码，即可直接添加处理、判断和开始／结束节点，拖动节点调整画布位置，依次点击节点创建连线，并修改节点文字、形状、连线文字与样式；支持四种流程方向和自动排列，最终仍生成兼容其他 Markdown 软件的标准 Mermaid 源码。包含子图、样式等高级语法时会安全保留源码模式，不会覆盖或丢失内容。
- 图表生成器新增全屏绘图模式，仅将流程图绘图区铺满整个应用窗口，不再放大左侧分类和弹框标题；“全屏绘图”移动到绘图工具栏首位，全屏工具栏固定提供“退出全屏”和“插入图表”。按钮或 `Ctrl/Cmd + 滚轮` 可在 50%–200% 间缩放图形，任意倍率下画布始终铺满整个绘图区。可拖动空白区域向任意方向平移，节点拖到边缘时自动扩展观察范围；新增“全选”和 `Ctrl/Cmd + A`，全选后拖动任一节点即可整体移动，且不再受原画布边界限制。按 `Esc` 可恢复弹框。同步修正流程图工具栏占用高度后画布区域被遮挡的问题。
- 已插入文档的 Mermaid 流程图支持再次进入可视化画布：光标进入 `flowchart`／`graph` 代码块后会显示“在画布中编辑流程图”按钮，保存修改会原位替换当前代码块，并保留原有围栏符号、缩进和换行格式，不会重复插入图表。
- 图表选择列表新增统一的“可视化编辑”画布图标，并将首批可视化能力扩展到 11 类高频图表。状态图与思维导图现已升级为和流程图一致的节点画布，共享全屏、缩放、自由平移、拖动、全选整体移动、边缘自动平移、连线和自动排列；状态图按“状态＋转移”保存且保留未连线状态，思维导图按“父主题＋子主题”保存并阻止多父节点与循环。三类图均可从文档代码块重新进入画布并原位保存。时序图、甘特图、时间线、看板、饼图、柱状图、折线图和环形图继续使用结构化字段／数据行编辑。遇到高级语法时会拒绝转换并安全保留源码模式。
- 优化状态图的画布排版：状态框和起止节点采用更紧凑的专用尺寸，文字与箭头同步缩小，转移条件移到连线侧边，避免纵向状态机中的节点、标签和箭头互相遮挡。
- 公式工具默认改为行内公式，并支持直接修改已有公式：光标进入行内、块级、编号或化学公式时会显示“编辑当前公式”，双击编辑预览中的渲染公式也可打开同一弹框；原公式内容、编号与插入方式会自动载入，保存后原位替换，不再要求手工选中完整源码。

### English

- Added a visual flowchart canvas. Without editing Mermaid source, users can add process, decision, and start/end nodes, drag nodes on the canvas, connect two nodes by clicking them, and edit node text, shapes, connection labels, and line styles. Four flow directions and automatic layout remain portable because the result is standard Mermaid source. Advanced subgraph or styling syntax stays safely in Source mode and is never overwritten.
- Added a focused full-screen drawing mode that expands only the flowchart workspace rather than the category list and dialog header. Its toolbar always provides Exit full screen and Insert diagram actions, plus 50%–200% zoom through buttons or `Ctrl/Cmd + wheel`; the viewport now stays full-size at every zoom level. Dragging empty space pans freely, dragging nodes near an edge automatically reveals more canvas, and Select all or `Ctrl/Cmd + A` lets users drag every node together without the old canvas boundary. `Esc` restores the dialog. The workspace also reserves the toolbar height correctly so the canvas is no longer obscured.
- Existing Mermaid flowcharts can now be reopened on the visual canvas. Moving the cursor into a `flowchart` or `graph` fence reveals an Edit flowchart on canvas action; Save changes replaces that block in place while preserving its fence marker, indentation, and line endings instead of inserting a duplicate.
- Diagram templates now carry a consistent visual-editing canvas badge across 11 frequently used types. State diagrams and mind maps now share the full node canvas used by flowcharts, including full screen, zoom, free panning, dragging, select-all group movement, edge auto-pan, connections, and automatic layout. State diagrams preserve standalone states and save state transitions; mind maps save parent-child hierarchy while preventing multiple parents and cycles. All three canvas types can reopen from an existing document fence and save in place. Sequence, Gantt, timeline, Kanban, pie, bar, line, and doughnut charts retain structured field/data-row editors. Advanced syntax refuses conversion and remains safely in Source mode.
- Refined state-diagram layout with compact state and terminal nodes, smaller labels and arrows, and transition labels offset beside their connections so vertically arranged state machines no longer overlap.
- Academic Formulas now defaults to inline output and directly edits existing inline, display, numbered, or chemistry formulas. Putting the cursor inside one reveals Edit current formula, while double-clicking its rendered live-preview form opens the same dialog; source, equation number, and output mode are restored and saved in place without selecting the full Markdown range.

## [2.6.0] - 2026-08-25

### 简体中文

- 新增可选的 PicGo 图床上传。选择、拖拽或粘贴图片时仍会先安全保存到文档旁的 `assets`，启用 PicGo 后再通过仅限本机回环地址的 HTTP 接口上传并插入在线 URL；连接或上传失败会自动回退本地相对路径，避免图片丢失。图床设置支持连接测试和可选服务密钥，密钥独立保存在用户配置目录而不进入普通偏好 JSON。
- PicGo 图床设置新增类似 Typora 的首次配置向导：分步提示安装并启动 PicGo、配置图床与开启 Server，再自动检测本机连接；普通用户无需填写地址和密钥，高级设置默认折叠，已有配置会在打开时自动检测。
- 新增 PicGo Cloud 在线 API 直连：用户可在系统浏览器通过 PKCE 安全登录，无需安装百兆 PicGo 客户端或复制密钥；登录令牌独立保存在本机配置目录。小图片使用预签名直传，大图片自动使用分片上传，任何失败仍回退文档旁的本地 `assets`。原有本机 PicGo Server 接入保留为兼容模式。
- 图片上传时新增常驻加载提示与真实字节进度条，清楚区分准备图片、上传中和生成在线链接三个阶段；慢网络下会持续显示百分比，成功或失败回退后自动收起，并完整支持中英文界面。
- 表格工具升级为可视化设计器：可直接填写单元格、动态改变行列数量、增删行列、拖动调整行列顺序、设置每列左／中／右对齐，并拖动列边界调整宽度。光标位于已有 Markdown 表格时会自动进入编辑模式并原位回写；列宽使用可忽略的轻阅 HTML 注释保存，不破坏标准 GFM 表格在其他编辑器中的兼容性。
- 新建文档增加防连点保护：创建请求进行中会立即禁用入口，创建成功后继续锁定 3 秒；按钮点击与 `Ctrl/Cmd + N` 快捷键均无法重复创建，失败或取消时仍可立即重试。
- 新增网页／Word 富文本粘贴转换：剪贴板 HTML 会自动转为 Markdown，保留标题、强调、列表、引用、代码、链接、在线图片和 GFM 表格，清理 Office 专有样式并过滤不安全链接；编辑器选区右键菜单新增“复制为 Markdown”和“复制为纯文本”。
- 新增离线英文拼写检查：编辑器使用红色波浪线标记错词，右键可直接采用候选纠错、在当前文档中忽略，或加入持久化个人词典；“更多”菜单可启停检查、选择自动／美式／英式词典及清空个人词典。代码块、行内代码、URL、HTML、公式、缩写和驼峰标识会自动排除，词典随软件提供且不上传文档内容。
- 新增统一导出中心与可复用导出预设：原生支持 DOCX、带样式 HTML、无样式语义化 HTML、带标题书签 PDF、PNG/JPEG 高清长图，并可配置 `{title}`、`{date}`、`{page}` 页眉页脚。PDF 优先调用本机 Edge／Chrome／Chromium 无头打印并生成可导航书签，不捆绑浏览器；没有可用引擎时回退系统打印。检测或选择本机 Pandoc 后，还可导出 EPUB、RTF、ODT、LaTeX、MediaWiki，或通过 writer、扩展名与附加参数生成自定义格式；参数不经过系统 shell，保存位置不能被自定义参数覆盖。Pandoc 为可选外部工具，不随轻量安装包捆绑。
- 本页目录新增标题搜索和“层级／平铺”视图切换；层级搜索会保留命中标题的上级路径，折叠状态与视图选择均可持续保存。Markdown 正文中的独立 `[TOC]` 标记会实时生成可点击的动态目录，阅读、编辑预览和 HTML／PDF 导出保持一致。
- 阅读页顶部和“更多”菜单不再分别显示导出中心、Word、HTML 与 PDF 四个入口，统一合并为“导出文档”；点击后直接进入完整的 12 种格式导出界面，减少重复按钮并保持“另存为”和“打印”独立可用。
- 修复 PDF 导出中超长代码行、连接字符串和宽表格仍以横向滚动容器打印、导致右侧内容被截断的问题；代码会在 A4 页面内安全换行，表格单元格自动收缩换行，图片与图表限制在可打印宽度内，直接 PDF 与系统打印回退保持一致。
- 修复 PNG/JPEG 长图导出为纯白图或被压缩成狭长小字图的问题：导出节点改为可正常布局和渲染的隔离容器，等待图片、字体与布局就绪后分段生成画布，再由本地 Go 后端按原始宽度无损拼接，不再触发浏览器 16384px 上限的整图等比缩小。保存前会检查正文像素，并修复十六进制背景色被规范化为 RGB 后导致正常画布被误判为空白图的问题。
- 修复“导出文档”弹窗中的异常提示被遮罩层覆盖的问题，成功、警告与错误通知现在始终显示在所有业务弹窗之上。
- “立即导出”按钮现在会在点击瞬间锁定并显示为灰色忙碌状态，导出结束或失败后再恢复，防止慢速长图生成期间重复点击和重复保存。
- PNG/JPEG 图片导出新增“自动分图（清晰，推荐）”与“单张长图”两种方式。默认自动按竖版阅读比例在内容块之间分页，生成 `文件名-01、-02…` 连续编号图片并避开已有同名批次，解决超长单图被看图软件或社交平台适配到屏幕后仍显模糊的问题；导出预设会保存所选方式。
- “单张长图”升级为 2.5K 宽版高清画布：排版宽度由 840px 提升至 1280px，2 倍清晰度下输出约 2560px 宽；正文继续保持原有 2 倍文字栅格，并优化左右留白和长宽比例，让整张适配屏幕时保留更多有效宽度。
- 彻底调整长文档图片导出策略：每页现在按标准 A4 长宽比独立进行 2 倍高清渲染，再保存为连续编号图片，不经过整图缩放或二次采样；即使选择“单张长图”，超过 3 张 A4 的长文档也会自动改为 A4 高清分页并明确提示，避免看图软件把数万像素高的图片缩成只有几百像素宽的模糊预览。短文档仍可无损拼接为单张长图。

### English

- Added optional PicGo image hosting. Chosen, dropped, and pasted images are still saved safely to the document's local `assets` directory first; when PicGo is enabled, Quillite uploads through a loopback-only HTTP endpoint and inserts the returned online URL. Connection or upload failures automatically fall back to the portable local path so an image is never lost. Settings include connection testing and an optional server secret stored separately from the normal preferences JSON.
- Added a Typora-style first-time PicGo setup guide: it walks through installing and starting PicGo, configuring an image host and enabling PicGo-Server, then detects the local connection automatically. The address and optional secret are folded under Advanced settings, while existing setups are checked automatically when reopened.
- Added direct PicGo Cloud API integration. Users sign in securely in their system browser with PKCE, without installing the large PicGo desktop app or copying credentials; the login token is stored separately in the local configuration directory. Small images use presigned direct uploads, larger images switch to multipart uploads, and every failure still falls back to the document's local `assets`. The existing local PicGo Server integration remains available as a compatibility mode.
- Added a persistent upload indicator with real byte progress. It distinguishes preparation, transfer, and online-link generation, keeps percentage feedback visible on slow networks, then dismisses itself after success or safe local fallback. All status text is available in Chinese and English.
- Upgraded the table tool to a visual designer. Cells can be edited directly; rows and columns can be resized, added, removed, and reordered by dragging; each column supports left, center, or right alignment; and column borders can be dragged to change width. When the cursor is inside an existing Markdown table, the designer edits it in place. Widths are stored in an ignorable Quillite HTML comment so the underlying GFM table stays portable to other editors.
- Added double-click protection for New Document. The entry is disabled while creation is in flight and remains locked for three seconds after success; neither the button nor `Ctrl/Cmd + N` can create duplicates during that window, while cancelled or failed attempts can be retried immediately.
- Added rich-text paste conversion for web pages and Word. Clipboard HTML is converted automatically to Markdown while preserving headings, emphasis, lists, quotes, code, links, online images, and GFM tables; Office-only styling and unsafe links are removed. The editor selection context menu now offers Copy as Markdown and Copy as plain text.
- Added offline English spell checking. Misspellings receive a red wavy underline, and their context menu offers suggested replacements, per-document ignore, and a persistent personal dictionary. More now controls spell checking, Auto/US/UK dictionaries, and personal-dictionary clearing. Code, URLs, HTML, formulas, acronyms, and camel-case identifiers are excluded automatically; dictionaries ship with the app and document text is never uploaded.
- Added a unified Export Center with reusable presets. Native exports now cover DOCX, styled HTML, semantic unstyled HTML, PDF with heading bookmarks, and high-resolution PNG/JPEG long images, with `{title}`, `{date}`, and `{page}` header/footer variables. PDF export first uses an installed Edge, Chrome, or Chromium headless print engine to create navigable bookmarks without bundling a browser, and falls back to system printing when none is available. After detecting or selecting a local Pandoc installation, EPUB, RTF, ODT, LaTeX, MediaWiki, and custom writer/extension/argument exports are also available. Arguments bypass the system shell and cannot override the save destination. Pandoc remains an optional external tool and is not bundled into the lightweight installer.
- Added title search plus hierarchical/flat view switching to the document outline. Hierarchical search retains the ancestor path for matching headings, while fold state and the chosen view persist locally. A standalone `[TOC]` marker in Markdown now becomes a live linked table of contents in reading, editor preview, and HTML/PDF exports.
- Consolidated the separate Export Center, Word, HTML, and PDF entries in the reader header and More menu into one “Export document” action. It opens the complete 12-format export interface directly, while Save As and Print remain separate actions.
- Fixed clipped PDF exports caused by long code lines, connection strings, and wide tables retaining horizontal scrolling during printing. Code now wraps safely within the A4 page, table cells shrink and wrap, and images or diagrams stay inside the printable width in both direct PDF export and the system-print fallback.
- Fixed PNG/JPEG long-image exports producing blank files or narrow images with tiny text. The export node now participates in normal layout, waits for images, fonts, and layout, and renders the document in strips that the local Go backend joins losslessly at the requested width. This avoids the browser's 16384px canvas limit silently scaling the whole image down. The pre-save pixel check also uses the original background value so hexadecimal-to-RGB style normalization cannot falsely reject a valid canvas as blank.
- Fixed export errors being obscured by the Export document modal. Success, warning, and error notifications now stay above all application dialogs.
- Export now locks immediately into a visibly grey busy state and only becomes available again after completion or failure, preventing duplicate clicks and duplicate saves during slow long-image rendering.
- PNG/JPEG export now offers “Split into readable pages (recommended)” and “Single long image.” The default mode breaks at content-block boundaries into portrait pages named `file-01`, `file-02`, and so on, automatically avoiding an existing batch. This keeps text readable when viewers or social apps would otherwise fit an ultra-tall image into a blurry thumbnail; export presets retain the selected mode.
- Single-long-image export now uses a 2.5K-wide high-definition canvas: layout width increases from 840px to 1280px and produces an approximately 2560px-wide file at 2× resolution, while preserving the existing 2× text rasterization and improving margins and aspect ratio for fit-to-screen previews.
- Long-document image export now uses a definitive readability-first strategy. Every page is rendered independently at 2× resolution with the standard A4 aspect ratio and saved as a numbered sequence without whole-document scaling or resampling. Even when Single long image is selected, documents longer than three A4 pages automatically switch to A4 HD pages with an explicit notice, preventing image viewers from shrinking a tens-of-thousands-pixel bitmap to a few hundred pixels wide. Short documents can still be joined losslessly into one image.

## [2.5.2] - 2026-08-23

### 简体中文

- 修复 macOS 点击编辑器“更多格式”需要等待 1–2 秒才弹出的问题。原生 WebKit 选择器已替换为应用内轻量菜单，点击后立即显示，并保留工具栏折叠项、键盘导航和中英文界面。
- 修复新版 macOS SDK 下安全书签解码/释放崩溃和应用链接失败的问题，并在授权路径解析后继续保留用户原始文档路径，恢复本机测试与打包。

### English

- Fixed the 1–2 second delay before More Formats opened on macOS. The native WebKit selector is replaced by a lightweight in-app menu that appears immediately while preserving collapsed toolbar commands, keyboard navigation, and both UI languages.
- Fixed security-bookmark decoding/release crashes and an application link failure with newer macOS SDKs, while preserving the user's original document path after permission resolution, restoring local testing and packaging.

## [2.5.1] - 2026-08-21

### 简体中文

- macOS 2.5.0 属于旧版裸可执行文件更新器，无法安全识别 2.5.1 起使用的完整 `.app` ZIP。更新界面现在会明确提示这类用户从官网手动安装一次 DMG，之后恢复应用内自动更新；该已知迁移情况不再作为异常日志重复上报。
- 发布流程继续强制生成并同步 `macos-universal.zip`，且只允许原子替换签名校验通过的完整应用包，避免为兼容旧格式重新引入 `Code Signature Invalid` 闪退。
- 修复置顶文档拖动排序时，拖柄占用独立列导致选中边框被拆开，以及部分 WebView 因移动指针捕获节点而中断拖拽的问题；置顶项现在与普通最近文档左侧对齐，鼠标悬停时在卡片右侧显示拖动提示，按住整张卡片任意位置即可排序，普通单击仍会打开文档。
- 左侧文档库底部新增“图表范例”“公式范例”“格式范例”三个内置参考入口。参考文档由当前 37 种图表模板和 79 种学科公式模板自动生成，并完整展示编辑器支持的常规 Markdown 文本格式；示例不会占用最近阅读记录。
- 阅读页新增“关闭预览”，可在不移除最近阅读记录的情况下返回软件首页；首页同步新增三份完整案例入口和覆盖文件、阅读、编辑及文字格式的快捷键指南。
- 新增统一的本地图片资产工作流：通过文件选择、拖放或剪贴板粘贴导入图片时，会自动复制到当前文档旁的 `assets` 目录并使用可移植相对路径；插入时可选择 10%–100% 显示宽度，同名文件会安全生成唯一名称。
- 完善 Mermaid 与 ECharts 的暗色模式：主题切换后图表会原位重绘，树图、思维导图、桑基图、C4、甘特图、热力图和仪表盘等在明暗主题下均保持可读；图表生成器新增官网教程入口。
- 修复宽幅 ECharts 在 Word／HTML 导出时被压成方形或裁掉右半部分的问题；导出现在使用稳定的白底画布与真实宽高，Word 图片尺寸计算同步保留原始比例。
- macOS 应用内更新改为下载、校验并原子替换完整的已签名 `.app` ZIP，失败时保留回滚副本；发布流程不再使用会破坏代码签名的裸可执行文件更新包。

### English

- macOS 2.5.0 used the retired raw-executable updater and cannot safely consume the complete `.app` ZIP introduced in 2.5.1. The update dialog now explains the one-time DMG installation required before normal in-app updates resume, and this known migration case is no longer submitted repeatedly as an error log.
- The release pipeline continues to require and publish `macos-universal.zip`, and the updater only atomically installs a signature-verified complete application bundle, avoiding the former `Code Signature Invalid` crash.
- Fixed pinned-document drag reordering so the handle no longer occupies a separate column that splits the selected outline, and moving a row no longer interrupts the drag in WebViews that release pointer capture when its target node is moved. Pinned items now align with ordinary recent documents, reveal a drag hint on the right when hovered, and can be reordered by dragging anywhere on the card while an ordinary click still opens the document.
- Added Charts, Formulas, and Formatting example documents above the folder shortcut in the library sidebar. The bundled references are generated from all 37 diagram templates and 79 subject-formula templates, cover the editor's supported Markdown formatting, and do not pollute Recent.
- Added Close Preview to return home without removing the current document from Recent. The redesigned home screen now includes all three example documents and a comprehensive shortcut guide for files, reading, editing, and text formatting.
- Added a unified local-image asset workflow. Images selected, dropped, or pasted from the clipboard are copied into an `assets` directory beside the current document and inserted with portable relative paths; users can choose a 10%–100% display width, and duplicate names are resolved safely.
- Improved Mermaid and ECharts dark mode. Diagrams redraw in place after appearance changes, keeping treemaps, mind maps, Sankey, C4, Gantt, heatmap, gauge, and other charts readable in both modes; Diagram Builder now links directly to the official guide.
- Fixed wide ECharts exports being forced into a square canvas or losing their right side in Word and HTML. Exports now use stable paper-coloured canvases with explicit dimensions, and Word image sizing preserves the source aspect ratio.
- Reworked macOS in-app updates to download, validate, and atomically replace a complete signed `.app` ZIP with rollback protection. The release pipeline no longer publishes raw executable updates that invalidate the application code signature.

## [2.5.0] - 2026-08-20

### 简体中文

- 图表生成器新增 15 类离线数据图表：柱状图、折线图、堆叠柱状图、面积图、散点图、正反向对比图、柱线组合图、漏斗图、热力图、箱线图、气泡图、仪表盘、环形图、瀑布图和词云图。数据图表使用可编辑的 `echarts` JSON 围栏源码，实时预览采用 SVG，Word／HTML 导出自动转换为清晰图片，PDF 打印保持预览效果。
- 图表目录现共提供 37 类模板（22 类 Mermaid + 15 类 ECharts）。新增真实浏览器巡检覆盖全部模板的中英文版本，共验证 74 次 SVG 渲染与 74 次 PNG 导出；15 类新增图表还逐项核对了有效画布、可见文字和实际绘制元素。
- 编辑器新增“图表生成器”：参照“学科公式”的统一弹窗交互，将 22 类常用 Mermaid 图表按流程与项目、软件与系统、数据分析、知识与规划分类展示。选择模板后可查看用途说明、直接编辑完整源码并实时预览，确认后插入 Markdown；原流程图、时序图和甘特图三个分散入口已合并为一个入口。
- 放大图表生成器弹窗并重新规划工作区：宽屏下源码编辑与实时图表左右并排、各自独立滚动，能够同时查看更完整的源码和图表；较窄窗口自动切回上下布局，避免内容被压缩或操作按钮超出屏幕。
- 新增覆盖全部 22 种 Mermaid 图表中英文模板的真实渲染巡检；修正 XY 图表纵轴标题与刻度重叠，并自动扩展过紧的 SVG 画布，避免时序图、XY 图表和雷达图的边缘文字被裁切。
- 修复 C4 图节点顶部的 `<<person>>`、`<<system>>` 被强制压缩后字母重叠的问题；类型标识现在使用与 Mermaid 测量一致的 `«person»`、`«system»` 并在节点中精确居中。
- 修复 Mermaid 需求图关系标签显示成黑色块的问题；`satisfies` 等关系说明现在使用清晰的中性色文字与底色，预览及 Word／HTML 导出保持一致。
- 新增 Typora 风格 Mermaid 图表：使用 ` ```mermaid ` 围栏代码块即可实时渲染流程图、时序图、甘特图及 Mermaid 支持的其他图表；编辑器“更多格式”提供三类常用模板。图表跟随明暗模式和主题色，语法错误会在原位说明且不影响文档其他内容，Word／HTML 导出会转换为清晰的内嵌图片，PDF 打印保持预览效果。
- 修复主题变量使用 CSS `color-mix()` 时 Mermaid 将其误判为不支持颜色、导致所有图表显示“图表语法有误”的问题。渲染前现在由浏览器把全部主题色转换成 Mermaid 可识别的标准 sRGB 十六进制颜色，明暗模式和八套主题均可正常使用。
- 修复流程图、类图、状态图、实体关系图和思维导图节点文字缺失的问题：Mermaid 现在统一生成安全的纯 SVG 文字，不再依赖会被安全过滤器移除的 HTML 标签。甘特图等宽图保持可读尺寸并支持横向滚动；图表引擎改为按需加载、复用主题配置并丢弃过期渲染任务，降低打开普通文档和连续编辑时的卡顿。
- 修复编辑长篇 Mermaid 文档时左侧实时预览突然跳到前面图表的问题。预览更新现在会原位复用主题一致且源码未变化的安全 SVG，只重新绘制正在修改的图表，既保持当前章节的滚动位置，也进一步减少多图文档的重复渲染。
- 统一 Mermaid 图表的中文字体和常规字重，移除通用 SVG 图标描边意外施加到图表文字后产生的粗黑轮廓，并将过小或过大的标签收敛到可读字号范围。C4 系统上下文图保留足够画布宽度，窄窗口下通过横向滚动避免整图缩小到无法阅读。
- 修复包含大量 Mermaid 图表的文档在编辑时左侧预览定位偏移：图表异步渲染完成后会基于最终高度再次校正到当前源码位置，过期渲染任务不会干扰新的光标位置。
- Mermaid 饼图改用独立于软件主题色的高区分度分类色板，各扇区不再只是同一颜色的浅色变化；图例、分区文字及明暗模式均保持清晰可辨。
- ER 实体关系图的关系标签改用独立中性色，不再强制继承软件主题色；修复 `creates`、`contains` 等关系文字与背景同色而显示为空白色块的问题。关系文字、标签底色和连线颜色会直接写入 SVG，软件预览及 Word／HTML 导出保持一致。
- 修复 C4 系统上下文图的角色类型、系统类型和关系说明在布局完成后被二次放大，导致文字压线、越过节点边界或互相重叠的问题。C4 图现在保留参与原生布局计算的字号，只统一字体、常规字重与清晰度。
- 修复较长的中文 C4 关系说明仍会伸入相邻节点的问题。C4 专用布局现在为连线标题和技术标签预留 240px 间隔，每行最多排列三个节点，并使用可横向滚动的宽画布，避免“打开、阅读和编辑”“检查更新 [HTTPS]”等文字覆盖系统说明。
- 修复包含“四反引号外层代码块 + 三反引号 Mermaid 示例”的教程文档中，左侧预览右键定位逐节偏移的问题。源码块扫描现在遵循 CommonMark 围栏长度规则，较短的内层围栏不会错误关闭外层代码块，桑基图及其后续章节可准确定位到对应源码。
- macOS 现在会为用户通过系统文件／文件夹窗口、Finder 或文件关联授权的文档保存原生 Security-Scoped Bookmark。最近阅读与资源浏览器在应用重启后会优先静默恢复授权，书签过期时自动刷新；只有旧记录或因未签名更新导致书签身份失效时，才会再次显示已定位到原文件的系统授权窗口。
- 修复 Mermaid 用户旅程图阶段标题与阶段背景使用同一颜色、导致“打开文档”“编辑文档”等文字不可见的问题；阶段标题现在使用独立正文色，并纳入全部图表真实渲染巡检与导出校验。
- 统一 Mermaid 连线备注样式：类图、状态图、实体关系图和需求图中的关系说明不再显示容易被误认为节点的矩形描边，仅保留遮挡连线所需的无边框底色与正常文字；预览及 Word／HTML／图片导出保持一致。

### English

- Added 15 offline data-chart templates to Diagram Builder: bar, line, stacked bar, area, scatter, diverging comparison, bar-and-line combo, funnel, heatmap, box plot, bubble, gauge, doughnut, waterfall, and word cloud. Their editable `echarts` JSON fences render as SVG in live preview, convert to clear embedded images for Word/HTML exports, and retain preview styling when printed to PDF.
- Diagram Builder now contains 37 templates in total (22 Mermaid + 15 ECharts). A real-browser audit verifies both localized variants of every template—74 SVG renders and 74 PNG exports—and separately checks that every newly added chart has a valid canvas, visible labels, and real drawing elements.
- Added a unified Diagram Builder to the editor. Its formula-builder-style dialog organizes 22 common Mermaid templates into Process & Projects, Software & Systems, Data Analysis, and Knowledge & Planning; each template includes a use-case description, fully editable source, live preview, and one-click Markdown insertion. The three separate flowchart, sequence, and Gantt entries are now consolidated into one command.
- Enlarged and reorganized the Diagram Builder. On wide displays the editable source and live diagram sit side by side with independent scrolling so both remain visible; narrower windows automatically return to a stacked layout without clipping controls.
- Added a real-render audit covering the Chinese and English variants of all 22 Mermaid templates. Fixed the XY-chart Y-axis title overlapping tick labels and now expands overly tight SVG canvases so edge labels in sequence, XY, and radar diagrams are not clipped.
- Fixed overlapping C4 stereotype letters caused by Mermaid compressing `<<person>>` and `<<system>>`; stereotypes now use the correctly measured guillemet form and remain centred in their nodes.
- Fixed Mermaid Requirement Diagram relationship captions appearing as solid black bars. Labels such as `satisfies` now use readable neutral text and backgrounds consistently in preview and Word/HTML exports.
- Added Typora-style Mermaid diagrams. Fenced ` ```mermaid ` blocks now render flowcharts, sequence diagrams, Gantt charts, and other Mermaid syntax in live preview, with ready-to-insert templates under More Formats. Diagrams follow the current color mode and accent, show an inline non-blocking syntax error when invalid, export as embedded high-resolution images to Word/HTML, and retain preview styling in PDF printing.
- Fixed every Mermaid diagram being reported as invalid when the active theme used CSS `color-mix()`. All theme colors are now resolved by the browser to Mermaid-compatible sRGB hex values before rendering, covering both color modes and all eight accent palettes.
- Fixed missing node labels in flowcharts, class, state, ER, and mind-map diagrams. Mermaid now emits safe pure-SVG text instead of HTML labels removed by sanitization. Wide diagrams such as Gantt retain a readable canvas with horizontal scrolling, while lazy engine loading, cached theme setup, and stale-render cancellation reduce startup and continuous-editing lag.
- Fixed the live preview jumping to an earlier chart while editing long Mermaid documents. Preview refreshes now reuse safe, unchanged SVGs for the active theme in document order and redraw only the diagram being changed, preserving the current section and avoiding redundant multi-diagram rendering.
- Normalized Mermaid labels to the application UI font at regular weight, removed the global SVG icon stroke that accidentally outlined and emboldened diagram text, and constrained extreme label sizes to a readable range. C4 context diagrams retain a sufficiently wide canvas and scroll horizontally in narrow panes instead of becoming illegibly small.
- Fixed inaccurate live-preview positioning in documents with many Mermaid diagrams by correcting the scroll position after the latest asynchronous chart layout reaches its final height, while ignoring stale render tasks.
- Mermaid pie charts now use a high-contrast categorical palette independent of the application accent, keeping slices, labels, and legends distinct in both light and dark modes.
- ER relationship labels now use an accent-independent neutral palette. This fixes captions such as `creates` and `contains` becoming invisible when their text and background inherited the same theme colour. Final caption, background, and connector colours are written into the SVG so the app preview and Word/HTML exports remain consistent.
- Fixed C4 context stereotype, system-type, and relationship labels being resized after layout, which caused text to cross node boundaries, collide with connectors, or overlap. C4 diagrams now preserve the exact font sizes used by Mermaid's layout while retaining the normalized font family, regular weight, and clear rendering.
- Fixed long Chinese C4 relationship captions still extending into neighbouring nodes. The dedicated C4 layout now reserves a 240px lane for relation and technology labels, limits each row to three nodes, and uses a horizontally scrollable wide canvas so captions such as “Open, read and edit” or “Check for updates [HTTPS]” cannot cover system descriptions.
- Fixed progressively shifted right-click source positioning in tutorials that wrap a triple-backtick Mermaid example inside a four-backtick code fence. Source block scanning now follows CommonMark fence-length rules, so a shorter inner fence cannot close the outer block and Sankey or later sections locate their actual source lines.
- macOS now persists native security-scoped bookmarks for documents and folders authorized through system panels, Finder, or file associations. Recent and Explorer restore access silently after relaunch and refresh stale bookmarks automatically; the preselected system authorization panel is retained only for legacy records or bookmarks invalidated by an unsigned app update.
- Fixed Mermaid User Journey section headings inheriting the same fill as their section backgrounds, which hid labels such as “Open document” and “Edit document.” Section headings now use an explicit readable foreground and are covered by the full real-render and export audit.
- Unified Mermaid connector annotations across class, state, ER, and requirement diagrams. Relationship captions no longer show a framed rectangle that resembles a node; they retain only a borderless background mask and normal text, consistently in preview and Word/HTML/image exports.

## [2.4.9] - 2026-08-19

### 简体中文

- 修复独立 HTML 与 Word 导出中，KaTeX 的无障碍 LaTeX 文本被 WebView 清理后展开到 `<math>` 节点、导致公式右侧重复显示源码的问题。导出现在会在前端和 Go 后端双重移除已存在结构化 MathML 时的扁平化文本副本，只保留与软件预览一致的一份公式；Word 继续生成可编辑的原生公式。
- 导出同名 Word／HTML 文件被 Word、WPS 或其他程序占用时，现在会明确提示关闭文件或更换名称；该情况属于正常文件占用，不再上传为软件错误日志。
- 修复 WPS／Word 导出学科公式时，原生公式后仍可能重复显示 LaTeX 源码的问题。导出现在只保留单一 MathML 表示，并能识别、去除被拆分到多个样式节点中的同源降级文本；已使用 WPS 实际打开回归 DOCX 验证，公式保持可编辑且后续正文不受影响。
- 新增 HTML 导出：阅读页顶部和“更多”菜单均可将当前文档保存为独立 `.html` 网页，保留明暗模式、主题色、公式、代码、表格和已加载图片，并过滤脚本、事件属性及危险链接。
- 修复 macOS 挂载安装 DMG 后，系统“应用”界面或启动台可能同时显示已安装版本和镜像内版本、形成两个“轻阅 Markdown”图标的问题；新版安装镜像会阻止 Spotlight 索引其中的应用副本，已安装的应用启动时还会安全识别并自动推出仍挂载的官方安装镜像。
- 修复 macOS 重启后从“最近阅读”打开部分 Documents、Desktop、Downloads 等受保护目录文档时出现 `operation not permitted` 的问题。macOS 应用包补齐文件夹隐私用途声明，并在历史授权失效时通过已定位到原文件的系统打开窗口恢复访问；取消授权不再作为软件异常回传。
- 修复 Word 导出遗漏或破坏学科公式的问题：行内与块级 LaTeX、分数、根式、上下标、求和、积分、极限和 mhchem 化学式现在导出为可缩放、可编辑的 Word 原生公式；编号公式保持居中并将编号对齐到右侧。MathML 不可用时仍会保留一份可读的 LaTeX 源式，避免公式再次空白。
- 编辑器“学科公式”扩充到 79 种模板，覆盖基础数学、代数与函数、几何、微积分、线性代数、概率统计、物理、基础化学和化学反应；全部模板均校验默认参数、普通渲染和编号渲染。切换学科或公式时，右侧参数区会自动回到顶部，不再出现标题被滚动位置截断的问题。
- 新增 Typora 风格科学公式：支持 `$…$` / `\(…\)` 行内 LaTeX、`$$…$$` / `\[…\]` 块级 LaTeX、mhchem `\ce{…}` 化学公式与 `\tag{…}` 手动公式编号；预览、定位和 PDF 打印保持一致，Word 导出保留单份可读 LaTeX 源式。
- 编辑器公式菜单新增官网教程入口，可直接打开中英文公式文档，查看可复制的 LaTeX、化学公式和编号示例。
- 修复 macOS／Windows 最近文档被移动、删除或聊天软件清理缓存后，打开与自动刷新会重复产生错误日志的问题。文件缺失现在会立即刷新为不可用状态、保留当前预览并仅提示一次，不再作为软件异常回传；权限、保存和渲染等真实错误仍会正常上报。
- 意见反馈新增服务端 IP 与城市记录：提交前会明确告知采集范围，服务器通过离线地域库解析国家／省份／城市，并仅在登录后的后台反馈详情中展示；当前文档与文件路径仍不会上传。

### English

- Fixed standalone HTML and Word exports showing raw LaTeX beside a rendered equation when WebView sanitization flattened KaTeX accessibility annotations into the `<math>` element. Both the frontend and Go exporters now discard that duplicate text whenever structural MathML is present, leaving one equation consistent with the app preview while Word keeps editable native equations.
- Exporting over a Word or HTML file that is open in another application now shows a clear close-or-rename message. This expected file-lock condition is no longer uploaded as a software error.
- Fixed Academic Formulas still potentially showing raw LaTeX beside the native equation in WPS or Word. Export now keeps exactly one MathML representation and removes matching fallback source even when it is split across differently styled runs. The regression DOCX was opened in WPS to verify that equations remain editable and following prose is preserved.
- Added HTML export to both the reader header and More menu. The standalone `.html` page preserves the current color mode, accent, formulas, code, tables, and loaded images while filtering scripts, event handlers, and unsafe links.
- Fixed macOS potentially showing two Quillite Markdown icons in Apps or Launchpad while the installer DMG is mounted. New images opt the bundled copy out of Spotlight indexing, and the installed app safely detects and ejects a still-mounted official installer image on launch.
- Fixed `operation not permitted` when reopening some Recent documents from protected macOS locations such as Documents, Desktop, and Downloads after an app restart. The macOS bundle now declares its folder-access purposes and recovers stale historical consent through a system open panel preselected to the original file; cancelling authorization is no longer reported as a software fault.
- Fixed missing or malformed Academic Formulas in Word exports. Inline and display LaTeX, fractions, radicals, scripts, sums, integrals, limits, and mhchem chemistry now export as scalable, editable native Word equations. Numbered equations stay centered with right-aligned labels, while a readable LaTeX fallback prevents blank output when MathML is unavailable.
- Expanded the bilingual Academic Formulas tool to 79 templates across mathematics, algebra and functions, geometry, calculus, linear algebra, probability and statistics, physics, chemistry, and chemical reactions. Every template is validated in normal and numbered rendering, and switching subjects or formulas now resets the parameter panel to the top instead of inheriting a clipped scroll position.
- Added Typora-style scientific notation: `$…$` / `\(…\)` inline LaTeX, `$$…$$` / `\[…\]` display LaTeX, mhchem `\ce{…}` chemistry, and manual equation numbers with `\tag{…}`. Academic Formulas is available under More Formats; preview, source positioning, and PDF printing stay aligned, while Word export preserves one readable LaTeX source expression.
- Added an official bilingual formula guide entry to the editor menu, with copy-ready LaTeX, chemistry, and equation-numbering examples.
- Fixed repeated error reports when a recent document was moved, deleted, or removed by chat-app cache cleanup on macOS or Windows. Missing files now refresh to an unavailable state immediately, preserve the current preview with a single notice, and are excluded from software-error telemetry while genuine permission, save, and rendering failures remain reportable.
- Feedback now records the request IP and server-resolved country, province, and city. The submission disclosure states this collection clearly, the information is shown only in authenticated admin feedback details, and the current document and file paths remain excluded.

## [2.4.8] - 2026-08-19

### 简体中文

- 右侧“本页目录”现在按显示器物理短边连续适配字号和默认宽度：1080p、2K、4K 的一级／二级目录在全局 100% 字号下分别约为 13px、15px、17px；超宽屏、竖屏和跨显示器切换不会再误用固定档位，用户手动调整的目录宽度仍优先保留。
- 最近阅读新增多文档持久置顶：置顶文档独立于 10 条普通最近记录，可从右键菜单置顶或取消置顶，并通过悬停拖柄或键盘方向键调整顺序；缺失文件仍可取消置顶或移除，收藏与置顶互不影响。
- 修复最近阅读已满时草稿另存可能先淘汰普通记录、再删除草稿而最终只剩 9 条的问题；草稿路径、置顶、收藏和最近记录现在会在一次偏好更新中迁移并去重。
- 修复微信、聊天软件缓存或外部目录中的文档被移动/删除后，软件仍反复尝试刷新并把“文件不存在”误报为程序异常的问题；最近阅读会及时标记文件不可用，当前预览保留最后一次内容且只提示一次。
- 意见反馈现在明确说明服务器会记录反馈请求 IP 并通过离线地域库解析国家、省份和城市；这些信息仅显示在登录后的管理员反馈详情中，旧反馈保持兼容且不会上传当前文档。

### English

- The right-side document outline now adapts its typography and default width continuously from the display's physical short edge. At 100% global text size, primary outline entries are approximately 13px on 1080p, 15px on 2K, and 17px on 4K displays, while ultrawide, portrait, and cross-display layouts avoid fixed-resolution misclassification and preserve user-resized widths.
- Recent now supports multiple persistent pins. Pinned documents stay above up to ten ordinary recent entries, can be pinned or unpinned from the context menu, and can be reordered with a hover handle or keyboard arrows. Missing pinned files can still be unpinned or removed, and pinning stays independent from Favorites.
- Fixed draft Save As at full Recent capacity potentially evicting an ordinary entry before deleting the draft and leaving only nine entries. Draft paths, pins, favorites, and recent records now migrate and deduplicate in one preferences update.
- Fixed moved, deleted, or expired chat-cache documents being refreshed repeatedly and misreported as software failures. Recent now marks unavailable files promptly, while an already open preview preserves its last content and shows only one warning.
- Feedback now clearly discloses that the server records the request IP and resolves country, province, and city with its offline region database. This information is available only in authenticated administrator feedback details; existing feedback remains compatible and the current document is never uploaded.

## [2.4.7] - 2026-08-18

### 简体中文

- 设置菜单中的“检查更新”移除右侧 `GitHub` 字样，使界面更简洁，并准确体现软件更新与安装包下载均由轻阅官网 `qm.ssssa.cn` 提供。
- 保持官网版本库、应用内免安装更新、三平台安装包与下载统计流程不变。

### English

- Removed the `GitHub` suffix from Check for Updates for a cleaner menu that accurately reflects the official `qm.ssssa.cn` update and download channel.
- Kept the official release catalog, installer-free in-app updates, cross-platform packages, and download metrics unchanged.

## [2.4.6] - 2026-08-18

### 简体中文

- Windows 安装程序恢复为 EXE 直链下载，GitHub Release 与官网版本库不再额外生成或分发 ZIP 包；应用内免安装更新继续使用独立 BIN。
- 软件内所有官网入口与接口统一使用 `https://qm.ssssa.cn`：客户端只读取 `https://qm.ssssa.cn/api/v1/releases/latest`，不再访问根域名、`www` 子域名或回退 GitHub Releases；更新弹窗的下载按钮固定跳转二级域名的“下载”模块，免安装更新文件也只接受该域名。
- 官网按版本、平台与来源汇总更新检查和实际安装包下载次数，用于版本发布效果统计；不上传文档内容、文件名、文件路径或设备身份。

### English

- Restored direct downloads of the Windows EXE installer. GitHub Releases and the official website no longer generate or distribute an extra ZIP, while installer-free in-app updates continue to use the separate BIN asset.
- Standardized every in-app website link and API on `https://qm.ssssa.cn`. The app reads only `https://qm.ssssa.cn/api/v1/releases/latest`, never uses the apex or `www` domains, never falls back to GitHub Releases, opens the subdomain's Download section, and accepts in-app update files only from that host.
- Added aggregate update-check and actual package-download counts by release, platform, and source without uploading document content, file names, file paths, or device identity.

## [2.4.5] - 2026-08-18

### 简体中文

- 更新检查改为优先读取轻阅官网版本库中的版本号、中英文更新日志、SHA-256 和免安装更新地址；官网接口维护或缺少当前平台更新文件时自动回退 GitHub Releases。发布工作流完成 GitHub Release 后，会自动把版本日志和 Windows、macOS、Linux 全部安装包同步到官网，完整上传后才公开。
- 编辑模式左侧实时预览的正文基准字号由 15px 适度提升至 16px，改善 2K／4K 屏幕及分栏状态下的阅读清晰度；普通阅读页、右侧源码编辑器和现有字号缩放逻辑保持不变。
- 恢复独立的每日匿名活跃统计：每台设备每天最多上报一次，且不受“参与产品改进计划”开关影响；该开关现在只控制异常错误日志回传。活跃记录仅包含服务器哈希后的随机安装标识、软件版本、系统类型、CPU 架构和服务器解析地域，不上传文档、路径、联系方式或具体操作行为。
- 更多菜单新增“意见反馈”：可选择“功能建议”或“功能异常”，填写反馈说明，并按需附上邮箱、手机和最多 5 张问题截图；软件版本与系统版本自动带入，提交前明确说明发送范围，不会上传当前 Markdown 文档。
- 意见反馈通过轻阅官网接口提交，后台支持筛选、查看受保护的反馈图片、标记已解决、重新打开和删除；删除反馈时服务器会同步永久删除该反馈的全部图片数据。
- 阅读页顶部新增“另存为”快捷操作，可直接将当前文档保存为新文件并自动打开；文档区域变窄时该操作会与导出、打印一起收进“更多”菜单，原文件保持不变。
- 无写入权限的文档点击“编辑”时改为显示明确的权限说明弹窗，列出聊天软件只读缓存、目录只读／账号权限不足、文件被其他程序占用等常见原因；弹窗新增“另存为副本并编辑”按钮，保存成功后自动打开副本并进入编辑模式，原文件保持不变。
- 阅读页顶部新增“导出 Word”和“导出 PDF”快捷操作；空间充足时与“定位文件”“打印”并列显示，文档区域变窄时导出与打印自动收进“更多”菜单，避免挤压文件路径。
- 新增 Word 与 PDF 导出：Word 由 Go 在本地生成标准 `.docx`，保留标题、段落、列表、引用、表格、代码、链接、文字样式和已加载图片；PDF 使用 Windows WebView2／macOS 系统打印引擎，在系统面板中选择“Microsoft Print to PDF”或“存储为 PDF”，尽量保持阅读预览的排版效果。
- 优化 Word 导出版式：统一中英文字体和段落节奏，标题不再被正文行距覆盖；列表改用 Word 原生多级编号并自动重新起始；表格采用固定列宽、单元格留白和重复表头，引用与代码块样式更加稳定。
- PDF 导出增加确认教程：调用系统打印前先展示三步操作说明，并根据 Windows／macOS 显示对应的打印界面示意图，确认后才打开系统打印窗口。
- 编辑模式的实时预览支持右键定位：鼠标悬停时显示对应源码行提示，右键后将目标源码行置于编辑器顶部，并以主题色短暂标记目标段落；定位成功后不再弹出提示。
- 全面升级应用提示：成功、信息、警告和错误采用独立图标与颜色；正常提示延长至约 3 秒、警告约 5 秒、错误约 8 秒，均可手动关闭，鼠标悬停时暂停消失。
- “关于轻阅 Markdown”的“参与产品改进计划”选项仅控制异常错误日志回传；断网和接口异常不会提示或影响功能。
- “回到顶部”按钮现在跟随右侧目录的左边界定位；拖动调整目录宽度时会自动留在正文右下角，不再落入目录面板内部。
- “回到顶部”按钮与正文滚动条保持固定安全间距；全宽阅读、目录宽度调整和窗口缩放时均不会再与滚动条重叠。
- “文档宽度”改为与字号预设一致的两列按钮组，选中项使用主题色边框与浅色背景，菜单更紧凑统一。
- 提升英文设置菜单的可读性：菜单适当加宽，操作文字、辅助信息和分组标题字号同步增大，减少长英文换行。
- 字号设置改为连续拖动滑杆，实时显示当前比例并标出默认 100% 位置；设置区同时说明放大、缩小和恢复默认的 Ctrl/Cmd 快捷键，自动适配显示器仍可一键启用。
- 优化字号快捷键说明排版：放大、缩小和恢复默认分别使用三个等宽小卡片，按键组合采用主题色标签，说明文字独立置于下方；按键与说明字号同步增大，中英文均保持清晰对齐。
- 本页目录升级为可折叠层级树：有子标题的节点显示展开箭头，可单独折叠或展开；点击标题仍会定位正文，折叠状态按文档保存，下次打开继续保持。
- 最近阅读列表将文档名下方的通用“最近打开”改为文件所在目录，长路径保持单行省略，鼠标悬停可查看完整目录，便于区分微信缓存、下载目录和同名文档。
- 改进微信、企业微信等聊天软件缓存附件的编辑体验：进入编辑页前先检测原文件是否可写；文件只读、被占用或权限不足时保持在阅读页并明确提示无编辑权限。最近阅读、收藏和资源浏览器的文档右键菜单新增“另存为”，可直接建立可编辑副本；保存阶段仍保留自动兜底，不删除原附件，也不要求管理员权限。
- 新增高分辨率显示器字号自动适配：在未保存手动字号时，2K/4K 且系统缩放接近 100% 的屏幕分别采用约 115%/130% 初始字号；系统已经启用高 DPI 缩放时不会重复放大。更多菜单新增“自动适配显示器”和 100%–200% 快速预设，手动选择后优先记忆用户设置，自动模式下更换显示器会重新适配。
- 编辑工具栏在“高亮”后新增文字颜色选择器，扩展为 48 色完整方格色板，覆盖默认色、7 档灰阶和 40 个综合色阶；色板采用无文字名称的 8×6 紧凑布局，并以主题色描边标记当前选择。支持选中文本后着色、再次换色、恢复默认颜色、实时预览和完整撤回，同时兼容旧版本已保存的颜色标记。
- 修复 Windows“打开所在文件夹”可能在应用窗口后方打开的问题；现在会识别目标目录窗口，通过短暂提升并立即恢复正常层级的方式，将文件资源管理器可靠地切到应用前面，同时选中目标文档且不会让窗口永久置顶。

### English

- Update checks now prefer the Quillite website release catalog for version numbers, localized notes, SHA-256 digests, and in-app update URLs, while falling back to GitHub Releases during maintenance or when a platform update asset is missing. After publishing a GitHub Release, the workflow synchronizes all Windows, macOS, and Linux packages to the official website and publishes the catalog entry only after every upload succeeds.
- Increased the split editor's live-preview base text size from 15px to 16px for clearer reading on 2K/4K displays and in narrower panes, without changing the reader, source editor, or existing text-scale controls.
- Restored independent anonymous daily-active measurement. Each device reports at most once per day regardless of the product-improvement setting, which now controls error logs only. Active events contain a server-hashed random install identifier, app version, coarse OS type, CPU architecture, and server-resolved region, without documents, paths, contact details, or individual actions.
- Added Feedback to the More menu. Users can choose Feature suggestion or Functional issue, enter a description, and optionally attach email, phone, and up to five screenshots. The app and system versions are filled automatically, and the dialog clearly explains what is sent while never uploading the current Markdown document.
- Feedback is submitted to the Quillite website API. The protected admin console can filter entries, view authenticated images, mark items resolved, reopen them, or delete them. Deleting an entry permanently removes all of its server-side images as well.
- Added a Save As shortcut to the reader header so the current document can be copied and opened as a new file directly. It moves into the More menu with export and print actions in narrower layouts, leaving the original unchanged.
- Replaced the brief warning for non-writable documents with a clear permission dialog covering read-only chat-app caches, restricted folders, and files locked by another application. A new Save Copy & Edit action opens Save As and automatically enters editing on the writable copy while leaving the original untouched.
- Added quick Export Word and Export PDF actions to the reader header. They appear beside Show File and Print when space permits, while export and print actions move into a More menu in narrower document areas so the file path remains readable.
- Added Word and PDF export. Word files are generated locally in Go as standard `.docx` packages with headings, paragraphs, lists, quotes, tables, code, links, text styling, and loaded images. PDF export uses the Windows WebView2 or macOS system print engine so the output closely follows the reading preview.
- Refined the Word export layout with explicit bilingual typography and paragraph rhythm, native restartable multilevel lists, fixed table geometry with cell padding and repeatable headers, and more stable quote and code-block styling.
- Added a confirmation tutorial before PDF export, including a three-step guide and platform-specific Windows/macOS print-window illustrations; system printing now starts only after confirmation.
- Added right-click source navigation to the live preview. Hovering shows the mapped source line, while right-clicking scrolls and focuses the corresponding line in the editor with brief accent-colored feedback.
- Redesigned all in-app notifications with distinct success, information, warning, and error treatments. Normal notices remain for about 3 seconds, warnings for about 5 seconds, and errors for about 8 seconds; every notice is dismissible and pauses while hovered.
- The “Join the product improvement program” option in About Quillite Markdown now controls sanitized error-log reporting only; offline or server failures remain silent and never affect app features.
- The back-to-top button now follows the document side of the outline divider, staying at the lower-right corner of the reading area as the outline width is resized.
- The back-to-top button now keeps a fixed safe gap from the document scrollbar, including in full-width reading, after outline resizing, and while the window is resized.
- Document width presets now use the same compact button-group treatment as text-size presets, with an accent border and soft background for the selected width.
- Improved English settings readability with a wider menu and larger action, helper, and section-label text, reducing unnecessary wrapping of longer labels.
- Replaced text-size rows and preset buttons with a continuous slider that shows the current percentage and marks the default 100% position. The panel now documents the Ctrl/Cmd shortcuts for larger, smaller, and default text while retaining automatic display fitting.
- Refined the text-size shortcut legend into three equal compact cards, with larger accent-colored keycaps above larger, separately aligned action labels in both languages.
- Upgraded the document outline to a collapsible hierarchy. Nodes with child headings expose expand controls, heading links still navigate the document, and folding state is remembered separately for each file.
- Recent now shows each document's source directory instead of the generic “Recently opened” subtitle. Long paths remain on one ellipsized line, with the full directory available on hover, making cache files, downloads, and duplicate names easier to distinguish.
- Improved editing for attachments opened from WeChat, WeCom, and other application caches. The app now checks write access before entering the editor; read-only, locked, or restricted files stay in the reader with a clear permission message. A new Save As action in the document context menu creates a writable copy directly from Recent, Favorites, or Explorer. Save-time fallback remains as a second safeguard, without deleting or elevating the original attachment.
- Added automatic text sizing for high-resolution displays. With no saved manual preference, low-DPI 2K and 4K screens start at about 115% and 130%, while displays already using OS DPI scaling are not enlarged twice. The More menu now includes Fit to Display and 100%–200% presets; manual choices take priority and persist, while automatic mode adapts again after moving to another display.
- Added a text-color picker immediately after Highlight in the editor toolbar, expanded to a complete 48-color palette covering the default color, seven grayscale steps and 40 spectrum shades. The compact label-free 8×6 grid outlines the current choice with the active theme color. Selected text can be recolored or reset with live preview and full undo support, while color markers saved by earlier versions remain compatible.
- Fixed “Show in Folder” opening behind the application on Windows; the target Explorer window is identified, briefly raised and immediately restored to normal layering so it reliably appears above the app without remaining always-on-top.

## [2.4.4] - 2026-08-17

### 简体中文

- 标题栏书本图标进一步下移微调，与“轻阅 Markdown”文字的视觉基线更加自然。
- 最近阅读列表移除右侧悬浮垃圾桶图标，释放更多横向空间显示长文档名称。
- 移除最近阅读记录仍保留在文档右键菜单中，只删除列表记录，不删除用户原文件。

### English

- Fine-tuned the title-bar book mark downward for a more natural visual baseline with the “Quillite Markdown” label.
- Removed the trailing hover trash icon from Recent, giving long document names more horizontal space.
- Recent records remain removable from the document context menu without deleting the original file.

## [2.4.3] - 2026-08-14

### 简体中文

- 产品正式更名为“轻阅 Markdown”（英文名 `Quillite Markdown`），仓库同步迁移为 `liuhang798/quillite-markdown`；应用标识、安装包、macOS 应用包、Linux 包、更新地址、文档和构建流程全部统一新品牌。
- Windows 覆盖升级会识别“MD阅读助手”旧安装目录，自动关闭旧进程、迁移用户偏好并清理旧快捷方式、旧卸载项和旧程序文件，避免改名后出现双图标或设置丢失。
- 默认品牌绿统一为精确的 `#159A63`；主按钮不再自动加深为 `#10744A`，应用按钮、选中态、强调文字以及应用/文件图标保持同一绿色。
- 左上角品牌标识改为透明背景的打开书本图形，书本线条跟随当前主题色，移除方形底板、边框与阴影。
- 标题栏书本图标与“轻阅 Markdown”文字采用一致高度并上下居中对齐，Windows 与 macOS 紧凑标题栏分别适配。
- 取消新建文档、回到顶部、首页叶子图标等主题色按钮的投影阴影，界面更干净利落；选中状态仍保留主题色描边标识。
- Windows 安装、升级与卸载向导统一为简体中文，不再显示语言选择窗口；系统版本/架构提示、WebView2 安装进度、运行中软件提示和文件打开方式同步中文化。全新安装默认使用简体中文界面，更新安装保留已有语言偏好。
- 修复 macOS 本地构建可能以内部项目名 `quillite-markdown` 出现在 Spotlight 或启动台的问题；应用包现在显式声明 `轻阅 Markdown` 显示名，本地与 CI 构建统一生成 `轻阅 Markdown.app`。
- 文字放大缩小现在作用于全局：阅读正文、左侧最近阅读/资源浏览器、右侧本页目录同步缩放。
- 左侧文档库与右侧目录的拖动分隔条不再限制最大宽度，可自由调整（仅保留正文最小空间），宽度自动记忆。

### English

- Renamed the product to **Quillite Markdown** (Chinese: **轻阅 Markdown**) and moved the repository to `liuhang798/quillite-markdown`. Application identifiers, packages, update URLs, documentation, and release automation now use the new brand consistently.
- Windows upgrades detect the legacy MD Reader Assistant installation, preserve its directory and preferences, and clean up the old executable, shortcuts, and uninstall entry to prevent duplicates or lost settings.
- Unified the default brand green at the exact `#159A63`; primary controls are no longer automatically darkened to `#10744A`, keeping buttons, selections, accent text, and app/file icons on the same green.
- Replaced the top-left brand tile with a transparent open-book mark whose strokes follow the selected accent, removing the square plate, border, and shadow.
- Aligned the title-bar book mark and product label to the same visual height, with dedicated sizing for the compact macOS title bar.
- Removed drop shadows from accent-colored buttons (New Document, back-to-top, home leaf icon) for a cleaner look; selected states keep their theme-colored outline.
- The Windows install, upgrade, and uninstall wizard is now Simplified Chinese only, with no language-selection dialog. Compatibility messages, WebView2 progress, running-app prompts, and file-open actions are localized; fresh installs start in Chinese while upgrades keep the existing language preference.
- Fixed macOS local builds appearing under the internal `quillite-markdown` project name in Spotlight or Launchpad. The bundle now declares the `轻阅 Markdown` display name explicitly, and local and CI builds consistently produce `轻阅 Markdown.app`.
- Text zoom now applies globally: the reading content, the recent/explorer sidebar, and the table of contents all scale together.
- The sidebar and table-of-contents dividers no longer have a maximum width; they can be dragged freely (a minimal content width is kept) and the width is remembered.

## [2.4.2] - 2026-08-14

### 简体中文

- 编辑分栏（左侧预览 / 右侧编辑器）新增拖动分隔条，可自由调整两侧宽度，无最大宽度限制，宽度自动记忆，下次打开保持。
- 编辑模式新增“格式刷”：选中一段带格式的文本（加粗、斜体、删除线、高亮、行内代码、标题、引用或列表），点击工具栏格式刷复制格式，再选中目标文本即自动应用，按 Esc 取消。

### English

- The editor split panes (live preview / editor) now have a draggable divider with no maximum width limit; the width is remembered and restored on the next launch.
- Added a “format painter” to the editor: select text with formatting (bold, italic, strikethrough, highlight, inline code, heading, quote, or list), click the painter button to copy the format, then select the target text to apply it automatically. Press Esc to cancel.

## [2.4.1] - 2026-08-12

### 简体中文

- 编辑模式新增“光标定位预览”：移动光标或输入内容时，左侧实时预览会跟随滚动到当前所在章节/段落，方便边写边看排版效果。
- 编辑器头部新增“退出编辑”按钮，点击即可离开编辑状态回到沉浸式阅读页。
- 插入代码块时可以选择常用编程语言（JavaScript、Python、Go、Java、C/C++、Rust、HTML、SQL 等 19 种），并自动写入带语言标识的围栏代码块。

### English

- Editing now keeps the live preview in sync with the cursor: as the caret moves or you type, the left preview scrolls to the block being edited.
- The editor header now has an “Exit editing” button that returns to the immersive reading view.
- Inserting a code block now lets you pick a common programming language (JavaScript, Python, Go, Java, C/C++, Rust, HTML, SQL, and more), and the language-tagged fence is written automatically.

## [2.4.0] - 2026-08-12

### 简体中文

- 正式发布稳定的 Windows 应用内无安装更新：新版本下载并校验后，由独立 Go 辅助进程等待旧程序退出、替换主程序并自动重启，不再调用安装向导。
- 解决中文用户名或中文安装路径导致更新脚本无法运行，以及更新 helper 自身占用主程序、导致 Windows 拒绝覆盖的问题。
- 更新失败时会把等待超时、文件替换或重启错误写入 `apply-update.log`，并由真实 Windows 端到端测试覆盖完整自更新链路。

### English

- Officially released stable installer-free Windows in-app updates. After downloading and verifying a release, a separate Go helper waits for the old process, replaces the application, and restarts it without launching an installer wizard.
- Fixed both non-ASCII user/install paths that broke command scripts and the updater helper locking the installed executable that Windows needed to replace.
- Update timeout, replacement, and restart failures are recorded in `apply-update.log`, with the complete self-update flow protected by a real Windows end-to-end test.

## [2.3.13] - 2026-08-12

### 简体中文

- 修复 Windows 应用内更新仍可能无法覆盖旧程序的问题：更新辅助进程现在会先复制到独立临时 exe 后再启动，避免辅助进程自身占用安装目录中的主程序文件；下载校验完成后可可靠等待旧进程退出、替换程序并自动重启，无需再次运行安装向导。
- 更新辅助进程会将等待超时、文件替换失败或新版本启动失败的具体原因写入 `apply-update.log`，便于排查权限或安全软件拦截。
- 新增真实 Windows 端到端回归测试，覆盖“安装目录旧程序发起更新、被新二进制替换并自动重启”的完整链路。

### English

- Fixed a remaining Windows in-app update failure: the updater helper is now staged as a separate temporary executable before launch, so it no longer locks the installed application that it must replace. After download verification it can reliably wait for the old process, replace it, and restart without running the installer again.
- The updater now writes explicit timeout, replacement, and restart errors to `apply-update.log` for diagnosing permission or security-software interference.
- Added a real Windows end-to-end regression test covering an installed executable initiating the update, being replaced by the new binary, and restarting automatically.

## [2.3.12] - 2026-08-12

### 简体中文

- 修复 Windows 应用内更新仍可能无法覆盖旧程序的问题：更新辅助进程现在会先复制到独立临时 exe 后再启动，避免辅助进程自身占用安装目录中的主程序文件；下载校验完成后可可靠等待旧进程退出、替换程序并自动重启，无需再次运行安装向导。
- 更新辅助进程会将等待超时、文件替换失败或新版本启动失败的具体原因写入 `apply-update.log`，便于排查权限或安全软件拦截。

### English

- Fixed a remaining Windows in-app update failure: the updater helper is now staged as a separate temporary executable before launch, so it no longer locks the installed application that it must replace. After download verification it can reliably wait for the old process, replace it, and restart without running the installer again.
- The updater now writes explicit timeout, replacement, and restart errors to `apply-update.log` for diagnosing permission or security-software interference.

## [2.3.11] - 2026-08-12

### 简体中文

- 本版本用于验证 Windows 应用内更新的 Go 辅助进程自替换逻辑，无功能变化。

### English

- This release validates the Windows in-app updater's Go helper-process self-replace logic; no functional changes.

## [2.3.10] - 2026-08-12

### 简体中文

- 重构 Windows 应用内更新：替换与重启逻辑改为应用自带的 Go 辅助进程（不再使用 cmd/bat 脚本）。修复 cmd 无法处理中文路径（如用户名含中文时）导致更新脚本从未执行、更新静默失败的问题；等待旧进程退出、替换二进制、启动新版本均由 Go 通过系统 UTF-16 接口完成，并写入日志便于排查。

### English

- Reworked the Windows in-app updater: replacement and restart now run in a Go helper process instead of cmd/bat scripts. This fixes silent failures caused by cmd.exe being unable to resolve non-ASCII paths (for example Chinese user names), which previously meant the update script never ran. Waiting for the old process, replacing the binary and starting the new version all use Go's UTF-16 Win32 calls and are logged for troubleshooting.

## [2.3.9] - 2026-08-12

### 简体中文

- 修复 Windows 应用内更新的替换脚本：脚本改为纯 ASCII 并通过环境变量传递路径（避免中文路径在 cmd 中被错误解析），等待延迟改用 `ping`（修复 GUI 环境下 `timeout` 失效导致更新脚本过早超时的问题）。

### English

- Fixed the Windows in-app updater script: it is now pure ASCII and receives paths through environment variables (so non-ASCII paths survive cmd.exe parsing), and the wait delay uses `ping` instead of `timeout`, which fails when stdin is unavailable in a GUI process.

## [2.3.8] - 2026-08-12

### 简体中文

- 本版本用于验证 Windows 应用内更新的自替换逻辑（便携版与安装版均适用），无功能变化。

### English

- This release validates the Windows in-app updater's self-replace logic (works for both portable and installed deployments); no functional changes.

## [2.3.7] - 2026-08-12

### 简体中文

- 修复 Windows 应用内更新：改为直接替换正在运行的可执行文件（不再依赖静默安装器），绿色便携版与安装版均可自动升级并重启；升级过程写入日志便于排查。

### English

- Fixed Windows in-app updates: the running executable is now replaced directly instead of relying on a silent installer, so both portable and installed deployments upgrade and restart automatically. The update process writes a log for troubleshooting.

## [2.3.6] - 2026-08-12

### 简体中文

- 本版本用于验证应用内自动更新链路，无功能变化。从上一版本开始，macOS 与 Windows 用户可在更新弹窗中直接“下载并更新”，应用内完成下载、完整性校验、替换与自动重启。

### English

- This release validates the in-app automatic update pipeline; no functional changes. Starting from the previous version, macOS and Windows users can pick “Download & Update” in the update dialog to download, verify, replace and restart in-app.

## [2.3.5] - 2026-08-12

### 简体中文

- 兼容纯文本 TXT 文件：阅读页与编辑实时预览按纯文本渲染（保留原始换行与空格，不解析 Markdown 语法），编辑模式使用纯文本语法；可通过“打开文档”对话框、拖放或文件夹浏览直接打开，安装时注册 `.txt` 文件关联，双击即可用本应用打开。
- 插入图片支持填写在线链接：点击工具栏“插入图片”可在弹窗中粘贴 `http://` 或 `https://` 图片地址并附可选图片说明，也可以继续选择本地图片。
- 新增应用内自动更新：检测到新版本后可直接“下载并更新”，应用内下载（带进度条）、校验完整性后自动替换并重启，无需手动下载安装或再到系统设置授权；macOS 与 Windows 均支持，Linux 保持手动下载。

### English

- Plain-text `.txt` files are now fully supported: the reader and the live editor preview render them as-is, preserving line breaks and spaces without Markdown parsing, and the editor uses plain text mode. Files can be opened from the dialog, drag-in, or folder explorer, and the installer registers the `.txt` association so double-clicking opens them directly.
- Inserting an image now supports online links: the image dialog accepts an `http://` or `https://` image URL with an optional description, alongside the existing local file picker.
- Added in-app automatic updates: the update dialog can download and apply the new version directly with a progress bar and integrity check, then restart automatically — no manual download, installer wizard, or macOS Gatekeeper approval needed. Supported on macOS and Windows; Linux keeps the manual download flow.

## [2.3.4] - 2026-08-11

### 简体中文

- 新增当前文档外部修改自动刷新：应用重新获得焦点时会从磁盘重新读取并更新阅读页或无未保存内容的编辑页；若本软件存在未保存编辑则安全跳过，避免覆盖用户输入。
- 新增文档宽度调整：在“更多”菜单中可选择窄 / 中 / 宽 / 全宽四档内容宽度，阅读页与编辑实时预览同时生效并自动记忆。
- 修复阅读页查找主动跳过 Markdown 行内代码和代码块的问题；代码文字现在会进入匹配计数，并支持高亮及上一个/下一个定位。

### English

- Added automatic refresh for externally modified active documents. When the app regains focus, it reloads the reader or a clean editor from disk; local unsaved edits safely block replacement.
- Added document width presets in the More menu: narrow / medium / wide / full width. Both the reader and the live editor preview respect the chosen width, which is remembered.
- Fixed reader search intentionally skipping Markdown inline code and fenced code blocks. Code text now participates in match counts, highlighting, and previous/next navigation.

## [2.3.3] - 2026-08-10

### 简体中文

- 新增文档预览鼠标滚轮缩放：Windows/Linux 使用 `Ctrl + 滚轮`，macOS 使用 `Command + 滚轮`；支持阅读页和编辑模式实时预览，并自动记忆字号。
- 修复 Windows 同版本覆盖安装时，旧快捷方式或 Markdown 文件关联图标被资源管理器占用而导致安装中断的问题；两类关联现在都直接使用程序内置图标，并安全延迟清理旧图标文件。升级时若检测到旧版仍在运行，安装器会提供确认关闭并继续安装的选项。
- 新增持久化文档收藏：可在“最近阅读”和“资源浏览器”中右键收藏或取消收藏，并通过侧栏“收藏”视图集中打开、编辑和定位文档。
- 最近阅读、收藏和资源浏览器中的已收藏文档会显示主题色实心五角星，浏览列表时可快速区分。
- 收藏记录与最近阅读互不影响；取消收藏只移除记录，绝不会删除用户原文件。
- 已移动、删除或磁盘暂时不可用的收藏仍会保留并显示为不可用，方便用户随时取消收藏。
- 新建草稿另存为正式文档后，已有收藏会自动迁移到新路径，避免留下失效或重复记录。

### English

- Added mouse-wheel text zoom for document previews: `Ctrl + wheel` on Windows/Linux and `Command + wheel` on macOS. It works in both the reader and live preview and preserves the selected text size.
- Fixed Windows same-version reinstalls failing when Explorer kept old shortcut or Markdown file-association icons locked. Both associations now use the icon embedded in the executable, while legacy icons are safely removed or deferred until reboot. If the old application is still running, the installer offers to close it and continue.
- Added persistent document favorites. Right-click documents in Recent or Explorer to add or remove them, then manage them from the new Favorites sidebar view.
- Favorited documents display a filled accent-colored star in Recent, Favorites, and Explorer for quick recognition.
- Favorites remain independent from Recent, and removing a favorite never deletes the original file.
- Moved, deleted, or temporarily unavailable favorites remain visible as unavailable records so they can still be removed.
- When a favorited draft is saved as a permanent document, its favorite automatically follows the new path without leaving stale or duplicate entries.

## [2.3.2] - 2026-08-09

### 简体中文

- 修复 macOS 全屏关闭后应用进入后台，再次点击 Dock 图标无法恢复窗口的问题；全屏关闭现在只隐藏应用而不主动隐藏窗口，与普通关闭行为一致，Dock 恢复时再取消应用隐藏并检查全屏残留状态。

### English

- Fixed a macOS issue where, after closing the window from fullscreen and hiding the app, clicking the Dock icon could not bring the window back. Fullscreen close now hides the application only, matching the normal close behaviour, and the Dock reopen path unhides the application first and clears any leftover fullscreen state.

## [2.3.1] - 2026-08-09

### 简体中文

- macOS 自动跟随系统白天/黑夜模式时，现在允许用户临时手动切换；临时选择会保持到系统下一次外观变化，随后自动恢复跟随。
- 修复 macOS 应用在后台运行时点击 Dock 图标偶发不显示窗口或窗口未置于最前方的问题；隐藏或最小化的主窗口现在会恢复并获得焦点。
- 左侧“最近阅读”现在使用右键菜单提供“编辑”“打开所在文件夹”和“移除”；“编辑”会直接打开对应 Markdown 文档并进入编辑模式，不存在的记录仍可移除。
- 修复 macOS 全屏状态下点击左上角关闭按钮偶发只退出全屏、窗口仍然显示的问题；现在会等待原生全屏退出通知后可靠隐藏窗口，并保留超时兜底。

### English

- While following the macOS light/dark appearance automatically, the app now allows a temporary manual switch that remains active until the next system appearance change, when automatic following resumes.
- Fixed an intermittent macOS issue where clicking the Dock icon while the app was running in the background did not show the window or bring it to the front. Hidden and minimized main windows are now restored and focused.
- Recent now provides a right-click menu with Edit, Show in Folder and Remove. Edit opens the selected Markdown document directly in editing mode, while unavailable records can still be removed.
- Fixed an intermittent macOS issue where clicking the top-left close button in fullscreen only exited fullscreen and left the window visible. The app now waits for the native fullscreen-exit notification before reliably hiding the window, with a timeout fallback.

## [2.3.0] - 2026-08-08

### 简体中文

- macOS 现在自动跟随电脑的白天/黑夜外观：启动时立即采用系统模式，系统外观变化时界面和原生标题栏同步切换，不再被旧的本地明暗设置覆盖。
- 修复 macOS 半屏平铺或调整窗口尺寸时原生红、黄、绿按钮短暂上下跳动，以及退出全屏时 Logo 和软件名称复位延迟造成的画面重叠。
- macOS 进入全屏后，Logo 与软件名称会自动向左对齐到内容边距；退出全屏后恢复窗口按钮安全间距，切换过程平滑且不依赖屏幕尺寸猜测。
- macOS 原生红、黄、绿窗口按钮现在会在 42px 轻薄标题栏内垂直居中，并在窗口缩放、重新获得焦点及进出全屏后保持对齐。
- 修复 macOS 新建文档被错误保存在可替换的 `.app` 应用包内、导致重新安装后显示丢失的问题；新文档现在固定保存到用户“文稿/Quillite Markdown”，不会随应用升级被覆盖，已恢复的旧草稿也会自动更新最近阅读路径。
- 最近阅读会检测原文件是否仍然存在；已删除、移动或暂时无法访问的文档会显示为灰色删除线并禁用打开，同时保留清理记录按钮，避免外接磁盘未挂载时误删历史。
- Markdown 格式工具栏取消横向滚动条，窗口宽度不足时会按优先级自动把格式收进“更多格式”；同时补充粗斜体、自动链接、Markdown 转义和 HTML 区块。
- macOS 新增标准 `Command + W` 关闭窗口快捷键，行为与红色关闭按钮一致；保留 `Command + Q` 真正退出应用及未保存内容确认。
- 补全 Markdown 编辑格式：新增 H4–H6、删除线、高亮、下划线、上下标、分隔线、强制换行、脚注、引用式链接、折叠区块、键盘按键和注释；高亮与脚注已同步支持安全实时预览。
- 修复 macOS 全屏状态下点击红色关闭按钮偶发无法隐藏窗口的问题；应用会先完成退出全屏动画，再可靠隐藏并继续在后台运行。
- macOS 顶部工具条改为更轻薄的原生隐藏标题栏布局，移除额外 Toolbar 空间，并分别适配白天与黑夜模式。
- 移除阅读页与实时预览中行内代码的色块背景，保留清晰的代码文字颜色。
- 左侧当前选中的文档卡片新增随主题变化的轻量描边，让当前文档更易识别。

### English

- macOS now follows the computer's light/dark appearance automatically at launch and whenever the system setting changes, keeping the interface and native title bar in sync without letting an old local mode override the system.
- Fixed native macOS traffic lights briefly jumping vertically during tiling or window resizing, and removed the delayed Logo/title reset that could overlap the controls while leaving fullscreen.
- On macOS, the Logo and application name now move left to the content margin in fullscreen and restore the traffic-light safe area when returning to a window, using the native fullscreen state rather than screen-size guesses.
- Centered the native macOS red, yellow and green window controls vertically within the compact 42 px title bar, retaining alignment after resize, focus and fullscreen transitions.
- Fixed new macOS documents being stored inside the replaceable `.app` bundle and appearing lost after reinstalling. New documents now live in the user's `Documents/Quillite Markdown` folder and survive application upgrades, while references to recovered legacy drafts are migrated automatically.
- Recent now detects whether each source file is still available. Deleted, moved or temporarily unavailable documents appear muted with a strikethrough and cannot be opened, while their remove-record action remains available so disconnected drives do not erase history automatically.
- Removed horizontal scrolling from the Markdown toolbar. Controls now collapse into More Formats by priority when space is limited, with new bold-italic, autolink, Markdown escaping and HTML-block actions.
- Added the standard macOS `Command + W` close-window shortcut with the same behavior as the red close button, while retaining `Command + Q` for quitting with unsaved-change confirmation.
- Completed the Markdown editing set with H4–H6, strikethrough, highlight, underline, superscript, subscript, horizontal rules, hard breaks, footnotes, reference links, collapsible sections, keyboard keys and comments, including safe live rendering for highlights and footnotes.
- Fixed an intermittent macOS issue where the red close button could fail to hide a fullscreen window. The app now completes the fullscreen exit before hiding in the background.
- Reworked the macOS top bar into a slimmer native hidden-titlebar layout without the extra Toolbar space, with dedicated light and dark appearances.
- Removed the filled background from inline code in reading and live-preview views while preserving a clear code text color.
- Added a lightweight theme-colored frame to the selected sidebar document card for clearer current-document identification.

## [2.2.6] - 2026-08-07

### 简体中文

- 将主题颜色与白天/黑夜模式拆分为两个独立功能；新增清新绿、晴空蓝、活力橙、灵动紫、珊瑚红、湖水蓝、雾蓝灰和陶土棕 8 种强调色，可与两种明暗模式自由组合，图 1 绿色为默认颜色。
- 更新应用品牌图标为亮绿色书页与羽毛标识，移除外部黑色画布并保留透明圆角；应用内 Logo 会随主题颜色切换，Windows、macOS、Linux、安装器和项目主页继续使用默认绿色图标。
- 自动迁移旧版完整主题设置，分别恢复为最接近的强调色与明暗模式组合。
- 降低 Logo、主操作按钮、首页叶子图标和“回到顶部”按钮的强调色阴影，让界面层次更加轻盈克制。

### English

- Split accent color and light/dark mode into independent controls. Fresh Green, Clear Blue, Vivid Orange, Vivid Violet, Coral Red, Lake Cyan, Mist Slate and Clay Brown can be combined with either mode, with the supplied green as the default.
- Updated the application brand icon to the bright-green book-and-feather mark with transparent outer corners. In-app Logos follow the selected accent while Windows, macOS, Linux, installer and project-page icons stay green.
- Migrated legacy complete-theme settings to the closest independent accent and color-mode combination.
- Reduced accent-colored shadows on Logos, primary actions, the welcome illustration and the back-to-top control for a lighter, more restrained visual hierarchy.

## [2.2.5] - 2026-08-06

### 简体中文

- 新增 8 套完整配色主题：经典浅色、经典深色、青翠新语、云海湛蓝、紫藤雾色、琥珀书页、深海夜航和墨夜紫晶；阅读页、实时预览、Markdown 编辑器、语法高亮、菜单和弹窗会同步切换。
- 主题选择会自动保存并在下次启动时恢复；旧版 `light` / `dark` 设置会自动迁移，异常值安全回退到经典浅色。
- 放大、缩小和恢复字号现在会同时作用于阅读页、实时预览、Markdown 源码和编辑器行号，最高支持 200%，更适合 4K 高分辨率显示器。
- 字号比例会自动保存，关闭并重新打开软件后继续使用上次设置。
- macOS 点击左上角关闭按钮后改为隐藏窗口并继续在后台运行；从 Finder 打开 Markdown 文件时会在应用启动后直接显示文档。
- 点击“最近阅读”中的已有文档不再改变列表顺序。
- Windows 安装向导选择的语言会直接作为软件界面语言，首次进入软件不再重复要求选择。
- 优化 macOS 冷启动：Markdown 编辑器改为进入编辑模式时按需加载，资源浏览器目录在首屏显示后恢复，减少首次打开等待。

### English

- Added eight complete color themes: Classic Light, Classic Dark, Verdant Voice, Azure Cloud, Wisteria Mist, Amber Paper, Deep Ocean and Amethyst Night. The reader, live preview, Markdown editor, syntax highlighting, menus and dialogs switch together.
- Theme selection is saved and restored automatically; legacy `light` / `dark` values migrate safely and unknown values fall back to Classic Light.
- Increase, decrease and reset text size now apply to the reader, live preview, Markdown source and editor line numbers, with scaling up to 200% for high-DPI and 4K displays.
- The selected text scale is saved automatically and restored on the next launch.
- On macOS, the close button now hides the window while the app keeps running; Markdown files opened from Finder are displayed after startup.
- Opening an existing item from Recent no longer changes the list order.
- The Windows installer language now becomes the initial app language, avoiding a second language prompt on first launch.
- Improved macOS cold startup by loading the Markdown editor only when editing begins and restoring resource-explorer folders after the first paint.

## [2.2.4] - 2026-07-22

### 简体中文

- 修复编辑模式下 `Ctrl/Cmd + F` 会切换到预览页的问题；现在会保持在源码编辑器中查找、高亮并滚动定位匹配内容。
- 查找与替换面板新增简体中文/English 联动文案，并重新设计为与应用一致的绿色卡片式工具栏。
- 左侧文档库和右侧本页目录新增可拖动分隔条，调整后的宽度会在下次启动时自动恢复。
- 资源浏览器会记住已选择的文件夹和当前视图，下次启动自动恢复；在资源浏览器视图中再次点击标签即可更换文件夹。

### English

- Fixed `Ctrl/Cmd + F` leaving the source editor for preview mode; editor search now stays in place, highlights matches and scrolls to the selected result.
- Localized the find-and-replace panel for Simplified Chinese and English, with a polished green toolbar that matches the app.
- Added draggable dividers for the library and document outline, with panel widths restored on the next launch.
- The resource explorer now restores its selected folder and active view on launch; click the active Explorer tab again to choose another folder.

## [2.2.3] - 2026-07-21

### 简体中文

- 新增 Markdown 格式工具栏：标题、引用、加粗、斜体、链接、有序/无序列表、任务列表、表格、图片、行内代码和代码块。
- 新增 `Ctrl/Cmd + B`、`Ctrl/Cmd + I`、`Ctrl/Cmd + K` 编辑快捷键。
- 新增 Markdown 文件创建功能，无需选择目录即可在安装目录自动创建并进入编辑；安装目录不可写时会自动回退到用户“文档”目录。
- 编辑状态下每 10 秒自动保存，并避免保存期间继续输入造成内容覆盖。
- 左侧文档库新增“最近阅读 / 资源浏览器”双视图及资源列表刷新功能。
- 更新弹窗新增“30 天内不再提醒”，手动检查更新不受该设置影响。
- 调整顶部主操作样式：“新建文档”改为绿色主按钮，“打开文档”改为无背景按钮。
- 编辑工具栏新增撤回按钮；每次打开文档都会建立独立撤回历史，`Ctrl/Cmd + Z` 最多只能回到文档刚打开时的原始内容。
- 修复本地图片预览失败：改由 Go 后端安全读取绝对路径和相对路径图片，不再依赖被 WebView 限制的 `file://` 地址。
- 修复新建文档“另存为”后出现两条最近阅读记录；另存成功后会删除自动创建的临时草稿及其记录，草稿标记在软件重启后仍然有效。
- 修复升级安装后 Windows 可能出现两个“轻阅 Markdown”应用或快捷方式的问题；安装范围统一为当前用户，安装器会清理旧 Electron/早期版本遗留的重复卸载项和快捷方式。
- Windows 更新安装时自动沿用上次选择的安装目录；从未记录目录的 2.2.2 升级时，也会根据现有卸载信息识别原安装位置。
- Windows 安装完成页默认勾选“运行 轻阅 Markdown”，点击“完成”后直接启动应用，并允许用户取消勾选。
- Windows 安装向导新增简体中文与 English 语言选择，欢迎页、目录页、安装进度和完成页会使用所选语言。
- 全新安装后第一次启动会要求选择软件界面语言；选择结果会持久保存，后续启动不再弹出，从不含此功能的旧版本升级也不会弹出。

### English

- Added a Markdown formatting toolbar for headings, quotes, bold, italic, links, ordered/unordered/task lists, tables, images, inline code and code blocks.
- Added `Ctrl/Cmd + B`, `Ctrl/Cmd + I` and `Ctrl/Cmd + K` editor shortcuts.
- Added Markdown file creation without a location prompt: files are created beside the application, with a silent fallback to the user's Documents directory when needed.
- Added 10-second autosave while editing, without overwriting changes made during an in-flight save.
- Added Recent and Resource Explorer views to the sidebar, including explorer refresh.
- Added a 30-day update reminder pause; manual update checks always remain available.
- Promoted New Document to the primary toolbar action and changed Open Document to a background-free secondary action.
- Added an Undo toolbar button and per-document history isolation, so `Ctrl/Cmd + Z` stops at the content originally loaded for that document.
- Fixed local image previews by loading image files through the Go backend instead of blocked `file://` URLs.
- Fixed duplicate Recent entries after saving a newly created document under another name; the auto-created draft and its record are removed after a successful Save As, even after restarting the app.
- Fixed duplicate Windows app entries or shortcuts after upgrading by consistently using per-user installation and cleaning stale uninstall records and shortcuts left by Electron or early installers.
- Windows upgrades now reuse the previously selected installation directory, with a compatibility fallback that detects the install location used by 2.2.2.
- The Windows setup completion page now launches Quillite Markdown by default after Finish, with an option to opt out.
- Added Simplified Chinese and English selection for the complete Windows setup flow.
- A new installation asks for the app interface language on its first launch and remembers the choice; upgrades from versions that predate this feature are explicitly excluded from the prompt.

## [2.2.2] - 2026-07-21

### 简体中文

- macOS 改用左侧原生窗口控制按钮、应用菜单、系统字体和 Command 快捷键，并增大窗口按钮与软件名称之间的距离。
- 启动软件时自动检查 GitHub 最新稳定版本，不再因 24 小时时间限制错过刚发布的更新。
- 更新弹窗现在支持排版显示 Markdown 更新说明。
- GitHub Release 标题和各平台安装包统一采用 `quillite-markdown 2.2.2` 英文命名。
- 发布流程自动从本文件提取当前版本内容作为更新说明。

### English

- Adopted native left-side macOS window controls, application menus, system fonts, and Command shortcuts, with more space before the app brand.
- Checks the latest stable GitHub Release once on every startup so newly published versions are not missed by a 24-hour throttle.
- Renders Markdown release notes properly in the update dialog.
- Standardized GitHub Release titles and downloadable asset names as `quillite-markdown 2.2.2` and ASCII-safe platform filenames.
- Automatically extracts the current version section from this changelog for GitHub Release notes.
- Aligned GitHub Actions with Go 1.25 used by the project.

### Fixed

- Removed the Windows-style title-bar controls from macOS builds.
- Existing Releases now replace legacy `MD.-...` assets with consistently named packages.

## [2.2.1] - 2026-07-21

### Added

- Daily background checks for the latest stable GitHub Release.
- Manual update checks from Settings, with release notes and a direct download-page action.
- Bilingual About and update dialogs.

### Changed

- Replaced the Electron desktop shell with Go and Wails while preserving the existing interface and editor workflow.
- Reduced the Windows installer from roughly 90 MB to about 8.3 MB.
- Added a transparent multi-size application icon without a white square canvas.

### Fixed

- Table-of-contents links now navigate to their document sections.
- Opened documents appear in Recent immediately, and individual recent records can be removed.
- The split editor reliably accepts pointer focus and displays live preview on the left.
- Desktop shortcuts are recreated with a versioned icon path to avoid stale Windows icon caching.

[2.2.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.1
[2.2.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.2
[2.2.3]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.3
[2.2.4]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.4
[2.2.5]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.5
[2.2.6]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.2.6
[2.3.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.0
[2.3.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.1
[2.3.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.2
[2.3.3]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.3
[2.3.4]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.4
[2.3.5]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.5
[2.3.6]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.6
[2.3.7]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.7
[2.3.8]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.8
[2.3.9]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.9
[2.3.10]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.10
[2.3.11]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.11
[2.3.12]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.12
[2.3.13]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.3.13
[2.4.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.0
[2.4.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.1
[2.4.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.2
[2.4.3]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.3
[2.4.4]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.4
[2.4.5]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.5
[2.4.6]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.6
[2.4.7]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.7
[2.4.8]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.8
[2.4.9]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.4.9
[2.5.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.5.0
[2.5.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.5.1
[2.5.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.5.2
[2.6.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.6.0
[2.6.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.6.1
[2.6.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.6.2
[2.7.0]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.7.0
[2.7.1]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.7.1
[2.7.2]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.7.2
[2.7.3]: https://github.com/liuhang798/quillite-markdown/releases/tag/v2.7.3
