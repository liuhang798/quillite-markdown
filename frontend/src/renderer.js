import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js/lib/common';
import { convertMermaidDiagramsToImages, refreshMermaidDiagrams, renderMermaidDiagrams } from './mermaid-diagrams.js';
import { convertEChartsDiagramsToImages, refreshEChartsDiagrams, releaseEChartsDiagrams, renderEChartsDiagrams, validateEChartsSource } from './echarts-diagrams.js';
import { DIAGRAM_CATEGORIES, diagramTemplateById, diagramTemplateSource, diagramTemplatesForCategory } from './diagram-templates.js';
import { ACCENT_THEMES, normalizeAccentTheme, normalizeColorMode, readAppearanceStorage, resolveMacColorMode, temporaryMacColorModeAfterToggle } from './appearance.js';
import { previewWheelZoomDirection } from './font-wheel-zoom.js';
import { clampFontScale, readFontScaleStorage, recommendedFontScale } from './font-scaling.js';
import { escapeMarkdownText, highlightExtension, nextFootnoteNumber, prepareFootnotes, renderFootnoteSection } from './markdown-formats.js';
import { buildFormulaExpression, buildFormulaMarkdown, FORMULA_DISCIPLINES, FORMULA_GROUP_LABELS, formulaPreviewExpression, formulaTemplateById, formulaTemplatesForDiscipline, formulaValues, parseFormulaMarkdown } from './formula-templates.js';
import { mathExtensions, renderLatex } from './math-rendering.js';
import { scanMarkdownBlockStartLines } from './preview-line-map.js';
import { directoryFromDocumentPath, filesFromPreferencePaths, isMissingDocumentError, normalizeSidebarMode, partitionRecentFiles, pinRecentFile, reorderPinnedRecentFiles, sameDocumentPath, unpinRecentFile, upsertRecentFile } from './library-state.js';
import { TEXT_COLOR_PALETTE, TEXT_COLOR_VALUES, textColorValue } from './text-colors.js';
import { clampTocPreferredWidth, fitReaderSidePanels, scrollDeltaForBounds, tocDisplayMetrics, tocDisplaySignature, TOC_WIDTH_LIMITS } from './toc-display.js';
import { buildTocTree, readCollapsedToc, writeCollapsedToc } from './toc-tree.js';

const $ = selector => document.querySelector(selector);
const DOC_WIDTH_LEVELS = ['narrow', 'medium', 'wide', 'full'];
const MATH_GUIDE_URL = 'https://qm.ssssa.cn/guides/formulas/';
const DIAGRAM_GUIDE_URL = 'https://qm.ssssa.cn/guides/diagrams/';
let codeEditor;
let editorExtensions = [];
let basicSetup;
let Compartment;
let EditorState;
let EditorView;
let keymap;
let scrollPastEnd;
let undo;
let undoDepth;
let closeSearchPanel;
let openSearchPanel;
let searchPanelOpen;
let HighlightStyle;
let syntaxHighlighting;
let markdown;
let tags;
let editorLanguage;
let markdownHighlightStyle;
let editorDependenciesPromise;
let editorInitializationPromise;
let editorModeSwitching = false;
let suppressEditorChanges = false;
let externalRefreshInProgress = false;
let missingCurrentFilePath = '';
const PIN_DRAG_THRESHOLD = 6;
const PIN_AUTO_SCROLL_EDGE = 44;
const PIN_AUTO_SCROLL_MAX_SPEED = 18;
let pinnedPointerDrag = null;
let suppressPinnedFileClickPath = '';
let suppressPinnedFileClickUntil = 0;
let pinMutationInProgress = false;

const initialAppearance = readAppearanceStorage(localStorage);
const currentDisplay = () => ({
  width: window.screen?.width,
  height: window.screen?.height,
  devicePixelRatio: window.devicePixelRatio
});
const initialFontScale = readFontScaleStorage(localStorage, currentDisplay());
const initialTocDisplay = tocDisplayMetrics(currentDisplay());
let lastTocDisplaySignature = tocDisplaySignature(currentDisplay());
const initialSidebarPreferredWidth = Number(localStorage.getItem('sidebarWidth') || 258);
const storedTocWidth = localStorage.getItem('tocWidth');
const initialTocPreferredWidth = clampTocPreferredWidth(storedTocWidth, initialTocDisplay.defaultWidth);

const state = {
  currentFile: null,
  root: null,
  files: [],
  explorerFiles: [],
  recentFiles: [],
  pinnedRecentFiles: [],
  favoriteFiles: [],
  sidebarMode: normalizeSidebarMode(localStorage.getItem('sidebarMode')),
  accentTheme: initialAppearance.accentTheme,
  colorMode: initialAppearance.colorMode,
  fontScale: initialFontScale.scale,
  fontScaleMode: initialFontScale.mode,
  docWidth: normalizeDocWidth(localStorage.getItem('docWidth')),
  language: localStorage.getItem('language') === 'en' ? 'en' : 'zh-CN',
  sidebarPreferredWidth: initialSidebarPreferredWidth,
  sidebarWidth: initialSidebarPreferredWidth,
  tocDisplay: initialTocDisplay,
  tocWidthCustomized: storedTocWidth !== null,
  tocPreferredWidth: initialTocPreferredWidth,
  tocWidth: initialTocPreferredWidth,
  editorPreviewWidth: Number(localStorage.getItem('editorPreviewWidth') || 47),
  searchMatches: [],
  searchIndex: 0,
  editing: false,
  dirty: false,
  savedContent: '',
  updateInfo: null,
  usageAnalytics: true,
  feedbackImages: [],
  feedbackSystemInfo: null,
  saving: false,
  saveAsRequired: false,
  saveWarningShown: false
};

function reportSilentError(error, source = 'frontend') {
  try {
    if (isExportFileInUseError(error)) return;
    if (isKnownMacUpdateMigrationError(error)) return;
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const stack = error instanceof Error ? error.stack || '' : '';
    Promise.resolve(window.quilliteMarkdown?.reportErrorLog?.(source, message, stack)).catch(() => undefined);
  } catch {
    // 产品改进计划必须与主功能完全隔离，连错误上报自身的异常也静默忽略。
  }
}

function isKnownMacUpdateMigrationError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('macos-universal.bin') && message.includes('no compatible update asset');
}

function isExportFileInUseError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('EXPORT_FILE_IN_USE');
}

function isMacAccessNotGrantedError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('macOS document access was not granted');
}

window.addEventListener('error', event => reportSilentError(event.error || event.message, 'frontend.unhandled'));
window.addEventListener('unhandledrejection', event => reportSilentError(event.reason, 'frontend.promise'));

const translations = {
  'zh-CN': {
    appName: '轻阅 Markdown', newFileTitle: '新建 Markdown 文件 (Ctrl+N)', newDocumentButton: '新建文档', openFileTitle: '打开文件 (Ctrl+O)', openDocument: '打开文档', openFolderTitle: '打开文件夹 (Ctrl+Shift+O)',
    toggleEditorTitle: '切换编辑/预览 (Ctrl+E)', edit: '编辑', preview: '预览', saveTitle: '保存 (Ctrl+S)', searchTitle: '在文档中查找 (Ctrl+F)',
    accentThemeTitle: '选择主题颜色', chooseAccentTheme: '选择主题颜色', colorModeTitle: '切换白天/黑夜模式', systemColorModeTitle: '临时切换白天/黑夜模式；系统下次切换时恢复自动跟随', temporaryColorModeChanged: '已临时切换为{mode}模式；系统下次切换时恢复自动跟随', lightModeName: '白天', darkModeName: '黑夜', moreTitle: '更多选项', searchPlaceholder: '在文档中查找…', previous: '上一个', next: '下一个', close: '关闭', toastSuccess: '操作完成', toastInfo: '提示', toastWarning: '请注意', toastError: '操作失败', dismissNotification: '关闭提示',
    library: '文档库', libraryViews: '文档库视图', recentReading: '最近阅读', favoriteDocuments: '收藏文档', resourceExplorer: '资源浏览器', recentTab: '最近', favoritesTab: '收藏', explorerTab: '资源', explorerTabTitle: '打开资源浏览器；再次点击可更改文件夹', refreshExplorer: '刷新资源浏览器', collapseSidebar: '收起侧栏', expandSidebar: '展开侧栏', referenceDocuments: '参考文档', chartExamples: '图表范例', formulaExamples: '公式范例', formatExamples: '格式范例', chartExamplesTitle: '查看全部图表格式范例', formulaExamplesTitle: '查看全部学科公式范例', formatExamplesTitle: '查看全部 Markdown 文本格式范例', chartExamplesDescription: '覆盖 Mermaid 与数据图表', formulaExamplesDescription: '覆盖全部学科公式', formatExamplesDescription: '覆盖所有文本与排版格式', referenceOpenFailed: '无法打开参考文档', referenceReadOnly: '内置参考文档为只读；如需修改，请先另存为副本', referenceReadOnlyTitle: '内置参考文档（只读）', openDocumentFolder: '打开文档文件夹',
    browseMarkdown: '集中浏览你的 Markdown', welcomeTitle: '阅读与编辑，都更简单',
    welcomeDescription: '一个专注、舒适的 Markdown 阅读与编辑空间。<br>打开文档，沉浸在文字本身。', openMarkdown: '打开 Markdown 文档',
    openFolder: '打开文件夹', quickOpenHint: '快速打开，也可以将文件拖到这里', revealFile: '定位文件', revealFileTitle: '在资源管理器中显示', closePreview: '关闭预览', closePreviewTitle: '关闭当前预览并返回首页',
    homeQuickStart: '快速上手', homeExamplesTitle: '从完整案例开始', homeExamplesDescription: '打开内置案例，直接查看所有图表、学科公式和 Markdown 排版格式。', homeShortcutEyebrow: '效率指南', homeShortcutsTitle: '功能快捷键', homeShortcutsDescription: '下列快捷键在对应页面生效。', homeShortcutsDescriptionWindows: '当前为 Windows / Linux 快捷键，使用 Ctrl 组合键。', homeShortcutsDescriptionMac: '当前为 macOS 快捷键，使用 Cmd 组合键。',
    shortcutFiles: '文档与文件', shortcutReading: '阅读与编辑', shortcutFormatting: '文字格式', shortcutNew: '新建文档', shortcutOpen: '打开文档', shortcutOpenFolder: '打开文件夹', shortcutSave: '保存文档', shortcutSaveAs: '另存为', shortcutPrint: '打印文档', shortcutEditPreview: '切换编辑/预览', shortcutSearch: '查找内容', shortcutZoomIn: '放大文字', shortcutZoomOut: '缩小文字', shortcutZoomReset: '恢复字号', shortcutUndo: '撤回', shortcutRedo: '重做', shortcutBold: '加粗', shortcutItalic: '斜体', shortcutLink: '插入链接', shortcutStrike: '删除线', shortcutHighlight: '高亮',
    print: '打印', printTitle: '打印文档', moreDocumentActions: '更多', readingEnd: '阅读结束', livePreview: '实时预览', readingEffect: '阅读效果', previewLocateHint: '右键定位到右侧编辑器 · 第 {line} 行', markdownEditorLabel: 'MARKDOWN 编辑器',
    untitledDocument: '未命名文档', saved: '已保存', unsaved: '尚未保存', autoSaved: '已自动保存', saveAs: '另存为', exitEdit: '退出编辑', markdownEditorAria: 'Markdown 编辑器',
    codeLang: '选择编程语言', codeNoLang: '无语言（纯文本）',
    editorShortcut: '<kbd>Ctrl</kbd> + <kbd>S</kbd> 保存　 <kbd>Ctrl</kbd> + <kbd>E</kbd> 预览', backToTop: '回到顶部', backToTopAria: '回到文档顶部',
    toc: '本页目录', expandTocSection: '展开“{title}”', collapseTocSection: '折叠“{title}”', releaseToOpen: '松开以打开文档', interfaceLanguage: '界面语言', defaultApp: '设为默认 MD 应用', windowsSettings: 'Windows 设置',
    exportHTML: '导出 HTML', htmlExported: 'HTML 网页已导出', htmlExportFailed: 'HTML 导出失败', exportFileInUse: '导出文件正被其他程序占用，请关闭该文件后重试，或选择其他文件名',
    zoomIn: '放大文字', zoomOut: '缩小文字', zoomReset: '恢复字号', textSizePresets: '文字大小调节', textSizeControl: '文字大小', fontScaleDefault: '默认 100%', fontScaleShortcuts: '<span class="font-scale-shortcut"><kbd>Ctrl +</kbd><em>放大</em></span><span class="font-scale-shortcut"><kbd>Ctrl −</kbd><em>缩小</em></span><span class="font-scale-shortcut"><kbd>Ctrl 0</kbd><em>默认</em></span>', fontScaleAuto: '自动适配显示器', autoFontScaleEnabled: '已自动适配显示器：{percent}%', exportDocument: '导出文档', exportWord: '导出 Word', exportPDF: '导出 PDF', systemPrint: '系统打印', wordExported: 'Word 文档已导出', wordExportFailed: 'Word 导出失败', pdfExportHint: '请在系统打印窗口中选择“Microsoft Print to PDF”或“存储为 PDF”', pdfTutorialLabel: 'PDF 导出指南', pdfTutorialTitle: '使用系统打印保存 PDF', pdfTutorialIntro: '为了尽量保持 Markdown 预览中的表格、代码块和图片样式，轻阅将打开系统打印窗口。请按下面步骤保存为 PDF。', pdfTutorialStep1Title: '打开系统打印', pdfTutorialStep1Text: '点击下方继续按钮，等待打印窗口出现。', pdfTutorialStep2Title: '选择 PDF 选项', pdfTutorialStep2Text: 'Windows 选择“Microsoft Print to PDF”；macOS 选择“存储为 PDF”。', pdfTutorialStep3Title: '选择位置并保存', pdfTutorialStep3Text: '确认打印后，输入文件名并选择保存目录。', pdfWindowsPrintTitle: '打印', pdfPrinterLabel: '打印机', pdfPagesLabel: '页面', pdfAllPages: '全部', pdfPrintButton: '打印', pdfWindowsCallout: '在“打印机”中选择 Microsoft Print to PDF', pdfMacPrintTitle: '打印', pdfSelectedPrinter: '已选择的打印机', pdfPresetsLabel: '预设', pdfDefaultPreset: '默认设置', pdfSaveAsPDF: '存储为 PDF…', pdfMacCallout: '打开左下角 PDF 菜单并选择“存储为 PDF”', pdfTutorialNote: '打印窗口由操作系统提供，实际界面可能因系统版本略有不同。', pdfContinueToPrint: '继续并打开打印窗口', exportNoDocument: '请先打开一个文档', printDocument: '打印文档', copy: '复制', copied: '已复制',
    docWidth: '文档宽度', widthNarrow: '窄', widthMedium: '中', widthWide: '宽', widthFull: '全宽', docWidthChanged: '文档宽度：{level}',
    bodyFontScale: '文字字号 {percent}%', recentOpened: '最近打开', pinnedRecentGroup: '置顶', ordinaryRecentGroup: '最近', pinnedRecent: '已置顶', pinRecent: '置顶', unpinRecent: '取消置顶', pinRecentAdded: '已置顶文档', pinRecentRemoved: '已取消置顶', pinRecentUnavailable: '文件已不可用，未能置顶；最近列表已重新同步', reorderPinnedRecent: '拖动或使用上下方向键调整“{name}”的置顶顺序', pinnedOrderPosition: '已将“{name}”移到置顶第 {position} 项，共 {total} 项', pinRecentSaveFailed: '置顶状态保存失败，已恢复并重新同步', pinnedOrderSaveFailed: '置顶顺序保存失败，已恢复并重新同步', favorited: '已收藏', favoriteDocument: '收藏文档', unfavoriteDocument: '取消收藏', favoriteAdded: '已收藏文档', favoriteRemoved: '已取消收藏，原文件未删除', recentContextHint: '右键打开文档操作菜单', recentContextMenuTitle: '文档操作', recentEdit: '编辑', recentSaveAs: '另存为', recentReveal: '打开所在文件夹', recentRemove: '移除', recentRevealFailed: '无法打开文件所在目录', recentMissing: '文件不存在', recentMissingTitle: '文件已删除、移动，或所在磁盘当前不可用', currentDocumentMissing: '原文件已移动或删除，当前预览内容已保留', recentMissingAria: '{name}，文件不存在', recentRemoved: '已从最近阅读中移除，原文件未删除', emptyRecent: '还没有最近文档', emptyFavorites: '还没有收藏文档', emptyExplorer: '请先打开一个文件夹',
    markdownDocument: 'Markdown 文档',
    discardConfirm: '当前文档有尚未保存的更改。\n\n确定要放弃更改并继续吗？', previewError: '暂时无法渲染当前内容',
    readingTime: '约 {minutes} 分钟 · {words} 字', renderFailed: 'Markdown 渲染失败', openFailed: '无法打开这个文件', macAccessNotGranted: '未获得该文档的访问权限，请重新选择原文件并确认打开',
    editorPosition: '第 {line} 行，第 {column} 列', saveAsDone: '文档已另存为', saveDone: '文档已保存', saveFailed: '保存失败，请检查文件权限', saveAsRequired: '需要另存为', editPermissionDenied: '当前文件无编辑权限，可能是微信缓存只读或正被其他程序占用。请另存为可编辑副本后再编辑', editPermissionLabel: '编辑权限', editPermissionTitle: '当前文件无法直接编辑', editPermissionDescription: '轻阅无法获得这个文件的写入权限。原文件不会被修改或删除。', currentDocument: '当前文档', possibleReasons: '可能原因', permissionReasonCache: '文件来自微信、企业微信等应用的只读缓存目录', permissionReasonReadOnly: '文件或所在目录被设置为只读，当前账号没有写入权限', permissionReasonLocked: '文件正被其他程序占用或锁定', editPermissionGuide: '建议另存为一个可编辑副本。保存成功后，轻阅会自动打开副本并进入编辑模式。', saveCopyAndEdit: '另存为副本并编辑', saveAsRequiredHint: '原文件可能来自微信缓存、处于只读状态或正被其他程序占用，请另存为后继续编辑', saveAsFallback: '原文件无法直接写入，已为你打开“另存为”',
    folderOpenFailed: '无法打开文件夹中的文档', defaultAppHint: '请在“按文件类型指定默认应用”中选择 .md', dropUnsupported: '请拖入 Markdown 或文本文件',
    languageChanged: '界面语言已切换为简体中文', about: '关于', aboutProductLabel: 'MARKDOWN 阅读与编辑器',
    aboutVersion: '版本 2.5.2', aboutDescription: '一款专注、美观、跨平台的 Markdown 阅读与编辑工具，支持实时预览、语法高亮、目录导航、最近阅读和文档收藏。',
    authorEmail: '作者邮箱', officialWebsite: '官方网站', openSourceAddress: '开源地址', aboutLicense: '基于 MIT 许可证开源', done: '完成',
    usageAnalytics: '参与产品改进计划', usageAnalyticsDescription: '此开关仅控制异常回传。勾选后，软件发生异常时会静默提交已清理的错误日志。无论是否勾选，每天最多提交一次匿名活跃记录；不会上传文档内容、文件名、文件路径或联系方式。', usageAnalyticsEnabled: '已参与产品改进计划', usageAnalyticsDisabled: '已关闭异常自动回传', usageAnalyticsSaveFailed: '无法保存产品改进计划设置',
    feedback: '意见反馈', feedbackShortHint: '建议与异常', feedbackLabel: '帮助我们改进', feedbackTitle: '意见反馈', feedbackIntro: '告诉我们你的建议或遇到的问题。邮箱和手机均为选填，仅用于需要进一步确认时联系你。', feedbackType: '反馈类型', feedbackFeature: '功能建议', feedbackFeatureHint: '希望新增或优化的功能', feedbackBug: '功能异常', feedbackBugHint: '功能无法使用或结果不正确', feedbackDescription: '反馈说明', feedbackDescriptionPlaceholder: '请描述期望效果、操作步骤或异常现象', feedbackEmail: '联系邮箱（选填）', feedbackPhone: '手机号码（选填）', feedbackPhonePlaceholder: '用于必要时联系', feedbackImages: '上传图片（选填）', feedbackImagesHint: '最多 5 张，支持 PNG、JPG、WebP；每张不超过 5 MB', selectImages: '选择图片', removeImage: '移除图片', softwareVersion: '软件版本', systemVersion: '系统版本', feedbackPrivacy: '提交后，以上反馈内容、联系方式、所选图片及版本信息将发送到轻阅官网服务器；服务器会记录请求 IP 并解析所在城市，不会上传当前文档。', submitFeedback: '提交反馈', feedbackSubmitting: '正在提交反馈…', feedbackSubmitted: '感谢反馈，我们会认真查看', feedbackSubmitFailed: '反馈提交失败', feedbackImageSelectFailed: '无法选择反馈图片', feedbackNeedDescription: '请至少填写 5 个字的反馈说明',
    checkForUpdates: '检查更新', checkingForUpdates: '正在检查更新…', updateAvailableLabel: '软件更新', updateAvailable: '发现新版本',
    currentVersion: '当前版本', latestVersion: '最新版本', releaseNotes: '更新说明', noReleaseNotes: '此版本暂无更新说明。',
    remindLater: '稍后提醒', snooze30Days: '30 天内不再提醒', updateSnoozed: '未来 30 天不再自动提醒更新', openDownloadPage: '打开下载页面', alreadyLatest: '当前已是最新版本', updateCheckFailed: '检查更新失败，请稍后重试',
    downloadAndUpdate: '下载并更新', manualMacUpdateTitle: '此版本需要一次手动升级', manualMacUpdateDescription: 'macOS 2.5.0 使用了旧更新格式，无法安全替换完整应用。请从官网下载安装一次最新版；之后即可继续使用应用内自动更新。', manualMacUpdateButton: '打开官网下载新版', downloadingUpdate: '正在下载更新… {percent}%', preparingUpdate: '正在安装更新…', updateFailed: '更新失败，请稍后重试', updateBlockedByUnsavedChanges: '请先保存当前文档再更新',
    formatToolbar: 'Markdown 格式工具栏', undoTitle: '撤回 (Ctrl+Z)', formatPainter: '格式刷', formatPainterTitle: '格式刷：复制选中文本的格式，再选中目标文本即可自动应用', formatCopied: '已复制格式，选中目标文本后自动应用', formatApplied: '格式已应用', formatNeedSelection: '请先选中要复制格式的文本', formatCleared: '已取消格式刷', heading: '标题', paragraph: '正文', heading1: '标题 1', heading2: '标题 2', heading3: '标题 3', heading4: '标题 4', heading5: '标题 5', heading6: '标题 6',
    boldTitle: '加粗 (Ctrl+B)', italicTitle: '斜体 (Ctrl+I)', strikethroughTitle: '删除线 (Ctrl+Shift+X)', highlightTitle: '高亮 (Ctrl+Shift+H)', textColorTitle: '文字颜色', textColorMenu: '选择文字颜色', textColorDefault: '默认颜色', textColorOption: '颜色', coloredText: '彩色文字', linkTitle: '插入链接 (Ctrl+K)', inlineCode: '行内代码', codeBlock: '代码块', quote: '引用', unorderedList: '无序列表', orderedList: '有序列表', taskList: '任务列表', horizontalRule: '分隔线', insertTable: '插入表格', insertImage: '插入图片', imageAlt: '图片说明',
    moreFormats: '更多格式', toolbarOverflow: '折叠的工具栏格式', extendedFormats: '扩展格式', boldItalic: '粗斜体', underline: '下划线', superscript: '上标', subscript: '下标', formulaBuilder: '学科公式 🔥', diagramBuilder: '图表生成器 🔥', diagramGuide: '查看图表教程 ↗', mermaidFlowchart: 'Mermaid 流程图', mermaidSequence: 'Mermaid 时序图', mermaidGantt: 'Mermaid 甘特图', mermaidDiagram: 'Mermaid 图表', mermaidRenderError: '图表语法有误', mermaidRenderHint: '请检查 Mermaid 源码，文档其他内容不受影响。', dataChart: '数据图表', dataChartRenderError: '数据图表配置有误', dataChartRenderHint: '请检查 ECharts JSON 配置，文档其他内容不受影响。', inlineMath: '行内公式', mathBlock: '块级公式', chemicalFormula: '化学公式', mathGuide: '查看公式教程 ↗', numberedMath: '编号公式', mathExpression: 'LaTeX 公式', hardBreak: '强制换行', footnote: '脚注', referenceLink: '引用式链接', collapsible: '折叠区块', keyboardKey: '键盘按键', autolink: '自动链接', escapeSyntax: '转义符号', htmlBlock: 'HTML 区块', comment: '注释', footnotes: '脚注', footnoteText: '脚注内容', referenceName: '引用名称', collapsibleTitle: '折叠标题',
    markdownTool: 'MARKDOWN 工具', tableDialogHint: '选择表格的行数和列数，表头占第一行。', rows: '行数', columns: '列数', cancel: '取消', insert: '插入', newFileFailed: '无法新建文档', imageSelectFailed: '无法导入图片', imageImported: '图片已复制到 assets 资源目录', imagePasteFailed: '无法粘贴图片', languageSaveFailed: '无法保存语言设置，请重试', imageDialogHint: '选择本地图片或粘贴在线链接；本地图片会自动复制到 assets 资源目录。', imageUrlLabel: '图片链接', imageUrlPlaceholder: 'https:// 或 http:// 链接', imageAltPlaceholder: '可选的图片说明', imageWidth: '显示宽度', imageWidthHint: '拖拽和粘贴图片也会使用此宽度', localImage: '本地图片…', imageUrlInvalid: '请输入有效的 http:// 或 https:// 链接',
    formulaWizardLabel: '学科公式', formulaWizardTitle: '选择并生成公式', formulaWizardHint: '按学科选择常用公式，填写参数后直接插入 Markdown。', formulaSubject: '学科分类', formulaOutput: '插入方式', selectedFormula: '已选公式', equationNumber: '公式编号', formulaPreview: '实时预览', generatedMarkdown: '生成的 Markdown', insertFormula: '插入公式', formulaModeInline: '行内公式', formulaModeBlock: '块级公式', formulaModeNumbered: '编号公式', formulaInvalid: '请填写有效的公式内容',
    diagramWizardLabel: 'MERMAID 图表', diagramWizardTitle: '选择并生成图表', diagramWizardHint: '按用途选择常用图表，编辑源码并实时预览后插入 Markdown。', diagramCategory: '图表分类', selectedDiagram: '已选图表', diagramSource: '图表源码', diagramPreview: '实时预览', insertDiagram: '插入图表', diagramInvalid: '请输入有效的 Mermaid 图表源码',
    resizeSidebar: '拖动调整文档库宽度', resizeToc: '拖动调整目录宽度', resizeEditor: '拖动调整预览宽度'
  },
  en: {
    appName: 'Quillite Markdown', newFileTitle: 'New Markdown file (Ctrl+N)', newDocumentButton: 'New Document', openFileTitle: 'Open file (Ctrl+O)', openDocument: 'Open Document', openFolderTitle: 'Open folder (Ctrl+Shift+O)',
    toggleEditorTitle: 'Toggle editor/preview (Ctrl+E)', edit: 'Edit', preview: 'Preview', saveTitle: 'Save (Ctrl+S)', searchTitle: 'Find in document (Ctrl+F)',
    accentThemeTitle: 'Choose accent color', chooseAccentTheme: 'Choose accent color', colorModeTitle: 'Toggle light/dark mode', systemColorModeTitle: 'Temporarily switch light/dark mode; automatic following resumes at the next system appearance change', temporaryColorModeChanged: 'Temporarily switched to {mode} mode; automatic following resumes at the next system appearance change', lightModeName: 'light', darkModeName: 'dark', moreTitle: 'More options', searchPlaceholder: 'Find in document…', previous: 'Previous', next: 'Next', close: 'Close', toastSuccess: 'Completed', toastInfo: 'Notice', toastWarning: 'Attention', toastError: 'Something went wrong', dismissNotification: 'Dismiss notification',
    library: 'LIBRARY', libraryViews: 'Library views', recentReading: 'Recent', favoriteDocuments: 'Favorites', resourceExplorer: 'Explorer', recentTab: 'Recent', favoritesTab: 'Favorites', explorerTab: 'Explorer', explorerTabTitle: 'Open the explorer; click again to choose another folder', refreshExplorer: 'Refresh explorer', collapseSidebar: 'Collapse sidebar', expandSidebar: 'Expand sidebar', referenceDocuments: 'EXAMPLE DOCUMENTS', chartExamples: 'Charts', formulaExamples: 'Formulas', formatExamples: 'Formatting', chartExamplesTitle: 'Open examples for every supported diagram and chart', formulaExamplesTitle: 'Open examples for every subject formula', formatExamplesTitle: 'Open examples for all supported Markdown formatting', chartExamplesDescription: 'Mermaid and data charts', formulaExamplesDescription: 'Every subject formula', formatExamplesDescription: 'All text and layout formats', referenceOpenFailed: 'Unable to open the example document', referenceReadOnly: 'Built-in examples are read-only. Save a copy before editing.', referenceReadOnlyTitle: 'Built-in example (read-only)', openDocumentFolder: 'Open Document Folder',
    browseMarkdown: 'Browse your Markdown collection', welcomeTitle: 'Reading and editing, made simpler',
    welcomeDescription: 'A calm, focused space for reading and editing Markdown.<br>Open a document and stay with the words.', openMarkdown: 'Open Markdown Document',
    openFolder: 'Open Folder', quickOpenHint: 'Quick open, or drop a file here', revealFile: 'Show File', revealFileTitle: 'Show in File Explorer', closePreview: 'Close Preview', closePreviewTitle: 'Close this preview and return home',
    homeQuickStart: 'QUICK START', homeExamplesTitle: 'Start with complete examples', homeExamplesDescription: 'Open the built-in examples to explore every chart, subject formula, and Markdown formatting style.', homeShortcutEyebrow: 'PRODUCTIVITY GUIDE', homeShortcutsTitle: 'Keyboard shortcuts', homeShortcutsDescription: 'The following shortcuts apply on their corresponding screens.', homeShortcutsDescriptionWindows: 'Windows / Linux shortcuts are shown. Use the Ctrl modifier.', homeShortcutsDescriptionMac: 'macOS shortcuts are shown. Use the Cmd modifier.',
    shortcutFiles: 'Documents & files', shortcutReading: 'Reading & editing', shortcutFormatting: 'Text formatting', shortcutNew: 'New document', shortcutOpen: 'Open document', shortcutOpenFolder: 'Open folder', shortcutSave: 'Save document', shortcutSaveAs: 'Save As', shortcutPrint: 'Print document', shortcutEditPreview: 'Toggle edit/preview', shortcutSearch: 'Find content', shortcutZoomIn: 'Increase text size', shortcutZoomOut: 'Decrease text size', shortcutZoomReset: 'Reset text size', shortcutUndo: 'Undo', shortcutRedo: 'Redo', shortcutBold: 'Bold', shortcutItalic: 'Italic', shortcutLink: 'Insert link', shortcutStrike: 'Strikethrough', shortcutHighlight: 'Highlight',
    print: 'Print', printTitle: 'Print document', moreDocumentActions: 'More', readingEnd: 'End of document', livePreview: 'LIVE PREVIEW', readingEffect: 'Rendered document', previewLocateHint: 'Right-click to locate in the editor · Line {line}', markdownEditorLabel: 'MARKDOWN EDITOR',
    untitledDocument: 'Untitled document', saved: 'Saved', unsaved: 'Unsaved', autoSaved: 'Autosaved', saveAs: 'Save As', exitEdit: 'Exit editing', markdownEditorAria: 'Markdown editor',
    codeLang: 'Select a language', codeNoLang: 'No language (plain text)',
    editorShortcut: '<kbd>Ctrl</kbd> + <kbd>S</kbd> Save　 <kbd>Ctrl</kbd> + <kbd>E</kbd> Preview', backToTop: 'Back to top', backToTopAria: 'Back to document top',
    toc: 'ON THIS PAGE', expandTocSection: 'Expand “{title}”', collapseTocSection: 'Collapse “{title}”', releaseToOpen: 'Release to open document', interfaceLanguage: 'Interface language', defaultApp: 'Set as default MD app', windowsSettings: 'Windows Settings',
    exportHTML: 'Export HTML', htmlExported: 'HTML page exported', htmlExportFailed: 'HTML export failed', exportFileInUse: 'The export file is open in another app. Close it and try again, or choose a different file name.',
    zoomIn: 'Increase text size', zoomOut: 'Decrease text size', zoomReset: 'Reset text size', textSizePresets: 'Text size control', textSizeControl: 'Text size', fontScaleDefault: 'Default 100%', fontScaleShortcuts: '<span class="font-scale-shortcut"><kbd>Ctrl +</kbd><em>Larger</em></span><span class="font-scale-shortcut"><kbd>Ctrl −</kbd><em>Smaller</em></span><span class="font-scale-shortcut"><kbd>Ctrl 0</kbd><em>Default</em></span>', fontScaleAuto: 'Fit to display automatically', autoFontScaleEnabled: 'Display-adapted text size: {percent}%', exportDocument: 'Export document', exportWord: 'Export Word', exportPDF: 'Export PDF', systemPrint: 'System print', wordExported: 'Word document exported', wordExportFailed: 'Word export failed', pdfExportHint: 'Choose “Microsoft Print to PDF” or “Save as PDF” in the system print dialog', pdfTutorialLabel: 'PDF EXPORT GUIDE', pdfTutorialTitle: 'Save a PDF with system printing', pdfTutorialIntro: 'To preserve the tables, code blocks, images, and overall Markdown preview styling, Quillite opens the system print window. Follow these steps to save a PDF.', pdfTutorialStep1Title: 'Open system printing', pdfTutorialStep1Text: 'Select Continue below and wait for the print window to appear.', pdfTutorialStep2Title: 'Choose the PDF option', pdfTutorialStep2Text: 'On Windows choose “Microsoft Print to PDF”; on macOS choose “Save as PDF”.', pdfTutorialStep3Title: 'Choose a location and save', pdfTutorialStep3Text: 'Confirm printing, enter a file name, and choose the destination folder.', pdfWindowsPrintTitle: 'Print', pdfPrinterLabel: 'Printer', pdfPagesLabel: 'Pages', pdfAllPages: 'All', pdfPrintButton: 'Print', pdfWindowsCallout: 'Choose Microsoft Print to PDF under Printer', pdfMacPrintTitle: 'Print', pdfSelectedPrinter: 'Selected printer', pdfPresetsLabel: 'Presets', pdfDefaultPreset: 'Default Settings', pdfSaveAsPDF: 'Save as PDF…', pdfMacCallout: 'Open the PDF menu at bottom left and choose “Save as PDF”', pdfTutorialNote: 'The print window is provided by your operating system, so its appearance may vary slightly by system version.', pdfContinueToPrint: 'Continue to print window', exportNoDocument: 'Open a document first', printDocument: 'Print document', copy: 'Copy', copied: 'Copied',
    docWidth: 'Document width', widthNarrow: 'Narrow', widthMedium: 'Medium', widthWide: 'Wide', widthFull: 'Full width', docWidthChanged: 'Document width: {level}',
    bodyFontScale: 'Text size {percent}%', recentOpened: 'Recently opened', pinnedRecentGroup: 'PINNED', ordinaryRecentGroup: 'RECENT', pinnedRecent: 'Pinned', pinRecent: 'Pin', unpinRecent: 'Unpin', pinRecentAdded: 'Document pinned', pinRecentRemoved: 'Document unpinned', pinRecentUnavailable: 'The file is no longer available and was not pinned. Recent documents were synced again.', reorderPinnedRecent: 'Drag or use the up and down arrow keys to reorder pinned document “{name}”', pinnedOrderPosition: 'Moved “{name}” to pinned position {position} of {total}', pinRecentSaveFailed: 'Could not save the pinned state. The list was restored and synced again.', pinnedOrderSaveFailed: 'Could not save the pinned order. The list was restored and synced again.', favorited: 'Favorited', favoriteDocument: 'Add to Favorites', unfavoriteDocument: 'Remove from Favorites', favoriteAdded: 'Document added to Favorites', favoriteRemoved: 'Removed from Favorites. The original file was not deleted.', recentContextHint: 'Right-click for document actions', recentContextMenuTitle: 'Document actions', recentEdit: 'Edit', recentSaveAs: 'Save As', recentReveal: 'Show in Folder', recentRemove: 'Remove', recentRevealFailed: 'Unable to show the file in its folder', recentMissing: 'File unavailable', recentMissingTitle: 'The file was deleted, moved, or its disk is currently unavailable', currentDocumentMissing: 'The original file was moved or deleted. The current preview has been preserved.', recentMissingAria: '{name}, file unavailable', recentRemoved: 'Removed from Recent. The original file was not deleted.', emptyRecent: 'No recent documents', emptyFavorites: 'No favorite documents', emptyExplorer: 'Open a folder to browse files',
    markdownDocument: 'Markdown document',
    discardConfirm: 'This document has unsaved changes.\n\nDiscard the changes and continue?', previewError: 'The current content cannot be rendered',
    readingTime: 'About {minutes} min · {words} words', renderFailed: 'Markdown rendering failed', openFailed: 'Unable to open this file', macAccessNotGranted: 'Access was not granted. Select the original document and confirm Open to restore access.',
    editorPosition: 'Line {line}, Column {column}', saveAsDone: 'Document saved as a new file', saveDone: 'Document saved', saveFailed: 'Save failed. Check file permissions.', saveAsRequired: 'Save As required', editPermissionDenied: 'This file cannot be edited because it may be a read-only app cache or locked by another program. Save a writable copy to continue editing.', editPermissionLabel: 'EDIT PERMISSION', editPermissionTitle: 'This file cannot be edited directly', editPermissionDescription: 'Quillite cannot obtain write access to this file. The original will not be changed or deleted.', currentDocument: 'Current document', possibleReasons: 'Possible reasons', permissionReasonCache: 'The file comes from a read-only WeChat, WeCom, or other application cache', permissionReasonReadOnly: 'The file or its folder is read-only, or your account lacks write permission', permissionReasonLocked: 'Another program currently has the file open or locked', editPermissionGuide: 'Save a writable copy instead. Quillite will open the copy and enter editing mode automatically after it is saved.', saveCopyAndEdit: 'Save Copy & Edit', saveAsRequiredHint: 'The source may be a read-only app cache or locked by another program. Save a writable copy to continue editing.', saveAsFallback: 'The source cannot be written. Save As has been opened for you.',
    folderOpenFailed: 'Unable to open a document from this folder', defaultAppHint: 'Choose this app for .md under “Choose defaults by file type”.', dropUnsupported: 'Drop a Markdown or text file',
    languageChanged: 'Interface language changed to English', about: 'About', aboutProductLabel: 'MARKDOWN READER & EDITOR',
    aboutVersion: 'Version 2.5.2', aboutDescription: 'A focused, beautiful, cross-platform Markdown reader and editor with live preview, syntax highlighting, navigation, recent reading, and document favorites.',
    authorEmail: 'Author email', officialWebsite: 'Official website', openSourceAddress: 'Open-source repository', aboutLicense: 'Open source under the MIT License', done: 'Done',
    usageAnalytics: 'Join the product improvement program', usageAnalyticsDescription: 'This switch controls error reporting only. When enabled, sanitized error logs are submitted silently after failures. One anonymous daily-active event is submitted at most once per day regardless of this setting; document content, file names, paths, and contact details are never uploaded.', usageAnalyticsEnabled: 'Product improvement program enabled', usageAnalyticsDisabled: 'Automatic error reporting disabled', usageAnalyticsSaveFailed: 'Unable to save the product improvement setting',
    feedback: 'Feedback', feedbackShortHint: 'Ideas & issues', feedbackLabel: 'HELP US IMPROVE', feedbackTitle: 'Send Feedback', feedbackIntro: 'Tell us what you would like improved or what went wrong. Email and phone are optional and used only if we need to follow up.', feedbackType: 'Feedback type', feedbackFeature: 'Feature suggestion', feedbackFeatureHint: 'A new feature or an improvement', feedbackBug: 'Functional issue', feedbackBugHint: 'Something does not work as expected', feedbackDescription: 'Description', feedbackDescriptionPlaceholder: 'Describe the expected result, steps, or issue', feedbackEmail: 'Email (optional)', feedbackPhone: 'Phone (optional)', feedbackPhonePlaceholder: 'Only for necessary follow-up', feedbackImages: 'Images (optional)', feedbackImagesHint: 'Up to 5 PNG, JPG, or WebP images; 5 MB each', selectImages: 'Choose images', removeImage: 'Remove image', softwareVersion: 'App version', systemVersion: 'System version', feedbackPrivacy: 'Submitting sends this feedback, optional contact details, selected images, and version information to the Quillite website server. The server records the request IP and resolves its city. Your current document is never uploaded.', submitFeedback: 'Submit feedback', feedbackSubmitting: 'Submitting feedback…', feedbackSubmitted: 'Thank you. We will review your feedback.', feedbackSubmitFailed: 'Unable to submit feedback', feedbackImageSelectFailed: 'Unable to choose feedback images', feedbackNeedDescription: 'Enter at least 5 characters',
    checkForUpdates: 'Check for updates', checkingForUpdates: 'Checking for updates…', updateAvailableLabel: 'SOFTWARE UPDATE', updateAvailable: 'A new version is available',
    currentVersion: 'Current version', latestVersion: 'Latest version', releaseNotes: 'What’s new', noReleaseNotes: 'No release notes are available for this version.',
    remindLater: 'Remind me later', snooze30Days: 'Don’t remind me for 30 days', updateSnoozed: 'Automatic update reminders paused for 30 days', openDownloadPage: 'Open download page', alreadyLatest: 'You’re using the latest version', updateCheckFailed: 'Unable to check for updates. Try again later.',
    downloadAndUpdate: 'Download & Update', manualMacUpdateTitle: 'One manual upgrade is required', manualMacUpdateDescription: 'macOS 2.5.0 used the retired update format and cannot safely replace the complete app. Install the latest version once from the website; future in-app updates will work normally.', manualMacUpdateButton: 'Get the latest version', downloadingUpdate: 'Downloading update… {percent}%', preparingUpdate: 'Installing update…', updateFailed: 'Update failed. Please try again.', updateBlockedByUnsavedChanges: 'Save the current document before updating',
    formatToolbar: 'Markdown formatting toolbar', undoTitle: 'Undo (Ctrl+Z)', formatPainter: 'Format painter', formatPainterTitle: 'Format painter: copy the selected text format, then select the target text to apply automatically', formatCopied: 'Format copied. Select the target text to apply automatically.', formatApplied: 'Format applied', formatNeedSelection: 'Select the text whose format you want to copy first', formatCleared: 'Format painter cancelled', heading: 'Heading', paragraph: 'Paragraph', heading1: 'Heading 1', heading2: 'Heading 2', heading3: 'Heading 3', heading4: 'Heading 4', heading5: 'Heading 5', heading6: 'Heading 6',
    boldTitle: 'Bold (Ctrl+B)', italicTitle: 'Italic (Ctrl+I)', strikethroughTitle: 'Strikethrough (Ctrl+Shift+X)', highlightTitle: 'Highlight (Ctrl+Shift+H)', textColorTitle: 'Text color', textColorMenu: 'Choose text color', textColorDefault: 'Default', textColorOption: 'Color', coloredText: 'colored text', linkTitle: 'Insert link (Ctrl+K)', inlineCode: 'Inline code', codeBlock: 'Code block', quote: 'Quote', unorderedList: 'Bulleted list', orderedList: 'Numbered list', taskList: 'Task list', horizontalRule: 'Horizontal rule', insertTable: 'Insert table', insertImage: 'Insert image', imageAlt: 'Image description',
    moreFormats: 'More formats', toolbarOverflow: 'Collapsed toolbar formats', extendedFormats: 'Extended formats', boldItalic: 'Bold italic', underline: 'Underline', superscript: 'Superscript', subscript: 'Subscript', formulaBuilder: 'Academic formulas 🔥', diagramBuilder: 'Diagram builder 🔥', diagramGuide: 'Diagram guide ↗', mermaidFlowchart: 'Mermaid flowchart', mermaidSequence: 'Mermaid sequence diagram', mermaidGantt: 'Mermaid Gantt chart', mermaidDiagram: 'Mermaid diagram', mermaidRenderError: 'Invalid diagram syntax', mermaidRenderHint: 'Check the Mermaid source. The rest of the document is unaffected.', dataChart: 'Data chart', dataChartRenderError: 'Invalid data chart configuration', dataChartRenderHint: 'Check the ECharts JSON. The rest of the document is unaffected.', inlineMath: 'Inline formula', mathBlock: 'Display formula', chemicalFormula: 'Chemical formula', mathGuide: 'Formula guide ↗', numberedMath: 'Numbered formula', mathExpression: 'LaTeX expression', hardBreak: 'Hard line break', footnote: 'Footnote', referenceLink: 'Reference link', collapsible: 'Collapsible section', keyboardKey: 'Keyboard key', autolink: 'Autolink', escapeSyntax: 'Escape syntax', htmlBlock: 'HTML block', comment: 'Comment', footnotes: 'Footnotes', footnoteText: 'Footnote text', referenceName: 'reference', collapsibleTitle: 'Section title',
    markdownTool: 'MARKDOWN TOOL', tableDialogHint: 'Choose the number of rows and columns. The first row is the header.', rows: 'Rows', columns: 'Columns', cancel: 'Cancel', insert: 'Insert', newFileFailed: 'Unable to create the document', imageSelectFailed: 'Unable to import the image', imageImported: 'Image copied to the assets folder', imagePasteFailed: 'Unable to paste the image', languageSaveFailed: 'Unable to save the language setting. Please try again.', imageDialogHint: 'Pick a local image or paste an online link. Local images are copied to the assets folder automatically.', imageUrlLabel: 'Image URL', imageUrlPlaceholder: 'https:// or http:// link', imageAltPlaceholder: 'Optional image description', imageWidth: 'Display width', imageWidthHint: 'Dropped and pasted images use this width too', localImage: 'Local image…', imageUrlInvalid: 'Enter a valid http:// or https:// link',
    formulaWizardLabel: 'ACADEMIC FORMULAS', formulaWizardTitle: 'Choose and build a formula', formulaWizardHint: 'Choose a common formula by subject, fill in its values, and insert the generated Markdown.', formulaSubject: 'Subjects', formulaOutput: 'Insert as', selectedFormula: 'Selected formula', equationNumber: 'Equation number', formulaPreview: 'Live preview', generatedMarkdown: 'Generated Markdown', insertFormula: 'Insert formula', formulaModeInline: 'Inline', formulaModeBlock: 'Display', formulaModeNumbered: 'Numbered', formulaInvalid: 'Enter valid formula content',
    diagramWizardLabel: 'MERMAID DIAGRAMS', diagramWizardTitle: 'Choose and build a diagram', diagramWizardHint: 'Choose a common diagram by use case, edit its source, preview it, and insert it into Markdown.', diagramCategory: 'Diagram categories', selectedDiagram: 'Selected diagram', diagramSource: 'Diagram source', diagramPreview: 'Live preview', insertDiagram: 'Insert diagram', diagramInvalid: 'Enter valid Mermaid diagram source',
    resizeSidebar: 'Drag to resize the library', resizeToc: 'Drag to resize the outline', resizeEditor: 'Drag to resize the preview'
  }
};

const codeMirrorTranslations = {
  'zh-CN': {
    Find: '查找内容', Replace: '替换为', next: '下一个', previous: '上一个', all: '全部选择',
    'match case': '区分大小写', regexp: '正则表达式', 'by word': '全字匹配', replace: '替换',
    'replace all': '全部替换', close: '关闭查找', 'current match': '当前匹配项', 'on line': '位于第',
    'replaced match on line $': '已替换第 $ 行的匹配项', 'replaced $ matches': '已替换 $ 个匹配项',
    'Go to line': '跳转到行', go: '跳转'
  },
  en: {}
};

function editorLanguageExtension() {
  return EditorState.phrases.of(codeMirrorTranslations[state.language] || codeMirrorTranslations.en);
}

function t(key, values = {}) {
  let template = translations[state.language]?.[key] ?? translations['zh-CN'][key] ?? key;
  if (document.documentElement.dataset.platform === 'darwin') template = template.replaceAll('Ctrl', '⌘');
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), template);
}

function applyStaticTranslations() {
  document.documentElement.lang = state.language === 'en' ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(element => { element.innerHTML = t(element.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-title]').forEach(element => { element.title = t(element.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)); });
  document.querySelectorAll('[data-i18n-label]').forEach(element => { element.label = t(element.dataset.i18nLabel); });
  applyPlatformShortcuts();
  document.querySelectorAll('[data-language]').forEach(button => button.classList.toggle('active', button.dataset.language === state.language));
  document.querySelectorAll('[data-accent-option]').forEach(button => {
    const name = ACCENT_THEMES[button.dataset.accentOption]?.[state.language === 'en' ? 'en' : 'zhCN'];
    const label = button.querySelector('.accent-option-name');
    if (label && name) label.textContent = name;
  });
  scheduleFormatToolbarLayout();
}

function applyPlatformShortcuts() {
  const isMac = document.documentElement.dataset.platform === 'darwin';
  const modifier = isMac ? 'Cmd' : 'Ctrl';
  document.querySelectorAll('[data-shortcut]').forEach(element => {
    element.textContent = `${modifier} + ${element.dataset.shortcut}`;
  });
  const description = $('#welcomeShortcutsDescription');
  if (description) description.textContent = t(isMac ? 'homeShortcutsDescriptionMac' : 'homeShortcutsDescriptionWindows');
}

function setLanguage(language, silent = false, persist = true) {
  state.language = language === 'en' ? 'en' : 'zh-CN';
  localStorage.setItem('language', state.language);
  applyStaticTranslations();
  const persistence = persist ? window.quilliteMarkdown.setLanguage(state.language) : Promise.resolve(state.language);
  els.editButtonLabel.textContent = t(state.editing ? 'preview' : 'edit');
  if (!state.currentFile) els.editorFileName.textContent = t('untitledDocument');
  updateLibraryHeading();
  if (codeEditor) {
    const reopenSearch = searchPanelOpen(codeEditor.state);
    if (reopenSearch) closeSearchPanel(codeEditor);
    codeEditor.dispatch({ effects: editorLanguage.reconfigure(editorLanguageExtension()) });
    if (reopenSearch) openSearchPanel(codeEditor);
    updateEditorPosition();
  }
  if (state.currentFile) {
    if (state.editing) renderEditorPreview(editorContent());
    else renderCurrentDocument();
  } else {
    renderFileList();
  }
  setDirty(state.dirty);
  if (!silent) showToast(t('languageChanged'), 'success');
  return persistence;
}

const els = {
  welcome: $('#welcome'), documentView: $('#documentView'), content: $('#markdownContent'),
  fileList: $('#fileList'), libraryName: $('#libraryName'), tocPanel: $('#tocPanel'), toc: $('#toc'),
  breadcrumb: $('#breadcrumb'), documentActions: $('#documentActions'), documentActionsMenu: $('#documentActionsMenu'), documentActionsMoreButton: $('#documentActionsMoreButton'), readingTime: $('#readingTime'), progressBar: $('#progressBar'),
  appShell: $('.app-shell'), sidebar: $('#sidebar'), expandSidebar: $('#expandSidebar'), sidebarResizer: $('#sidebarResizer'), tocResizer: $('#tocResizer'), searchBar: $('#searchBar'),
  editorResizer: $('#editorResizer'),
  searchInput: $('#searchInput'), searchCount: $('#searchCount'), dropOverlay: $('#dropOverlay'),
  moreMenu: $('#moreMenu'), accentMenu: $('#accentMenu'), recentContextMenu: $('#recentContextMenu'), toast: $('#toast'), editorView: $('#editorView'), fontScaleSlider: $('#fontScaleSlider'), fontScaleValue: $('#fontScaleValue'),
  editor: $('#markdownEditor'), editorPreview: $('#editorPreviewContent'), editorFileName: $('#editorFileName'), editorSaveState: $('#editorSaveState'),
  editorPosition: $('#editorPosition'), editButton: $('#editButton'), editButtonLabel: $('#editButtonLabel'), previewLocateHint: $('#previewLocateHint'),
  exitEditButton: $('#exitEditButton'), codeLangMenu: $('#codeLangMenu'), textColorMenu: $('#textColorMenu'), moreFormatButton: $('#moreFormatButton'), moreFormatMenu: $('#moreFormatMenu'),
  saveButton: $('#saveButton'), backToTop: $('#backToTop'), firstRunLanguageDialog: $('#firstRunLanguageDialog'), aboutDialog: $('#aboutDialog'), feedbackDialog: $('#feedbackDialog'), feedbackForm: $('#feedbackForm'), feedbackImageList: $('#feedbackImageList'), updateDialog: $('#updateDialog'), editPermissionDialog: $('#editPermissionDialog'), editPermissionFileName: $('#editPermissionFileName'), pdfTutorialDialog: $('#pdfTutorialDialog'), usageAnalyticsToggle: $('#usageAnalyticsToggle'),
  recentTab: $('#recentTab'), favoritesTab: $('#favoritesTab'), explorerTab: $('#explorerTab'), refreshExplorer: $('#refreshExplorer'), tableDialog: $('#tableDialog'), imageDialog: $('#imageDialog'), imageUrl: $('#imageUrl'), imageAltInput: $('#imageAltInput'), imageWidth: $('#imageWidth'), imageWidthValue: $('#imageWidthValue'), formulaDialog: $('#formulaDialog'), formulaDisciplineTabs: $('#formulaDisciplineTabs'), formulaTemplateList: $('#formulaTemplateList'), formulaBuilderPanel: $('#formulaBuilderPanel'), formulaOutputModes: $('#formulaOutputModes'), formulaFields: $('#formulaFields'), formulaPreview: $('#formulaPreview'), formulaMarkdownSource: $('#formulaMarkdownSource'), diagramDialog: $('#diagramDialog'), diagramCategoryTabs: $('#diagramCategoryTabs'), diagramTemplateList: $('#diagramTemplateList'), diagramBuilderPanel: $('#diagramBuilderPanel'), diagramSource: $('#diagramSource'), diagramPreview: $('#diagramPreview'),
  editorUndoButton: $('#editorUndoButton')
};

marked.use({
  gfm: true,
  breaks: false,
  extensions: [highlightExtension, ...mathExtensions],
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const safeTitle = title ? ` title="${title}"` : '';
      return `<a href="${href}"${safeTitle} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image({ href, title, text }) {
      const safeTitle = title ? ` title="${escapeHtml(title)}"` : '';
      const safeHref = escapeHtml(href || '');
      return `<img src="${safeHref}" data-markdown-src="${safeHref}" alt="${escapeHtml(text || '')}"${safeTitle}>`;
    },
    code({ text, lang }) {
      const normalizedLanguage = (lang || '').trim().toLowerCase();
      if (normalizedLanguage === 'mermaid') {
        return `<div class="mermaid-diagram" data-mermaid-source="${escapeHtml(encodeURIComponent(text))}" aria-label="${escapeHtml(t('mermaidDiagram'))}"><div class="mermaid-loading">${escapeHtml(t('mermaidDiagram'))}</div></div>`;
      }
      if (normalizedLanguage === 'echarts') {
        return `<div class="echarts-diagram" data-echarts-source="${escapeHtml(encodeURIComponent(text))}" aria-label="${escapeHtml(t('dataChart'))}"><div class="echarts-loading">${escapeHtml(t('dataChart'))}</div></div>`;
      }
      const valid = lang && hljs.getLanguage(lang);
      const highlighted = valid ? hljs.highlight(text, { language: lang }).value : hljs.highlightAuto(text).value;
      const label = lang || 'code';
      return `<div class="code-block"><div class="code-header"><span>${label}</span><button class="copy-code" type="button">${t('copy')}</button></div><pre><code class="hljs${valid ? ` language-${lang}` : ''}">${highlighted}</code></pre></div>`;
    }
  }
});

function createMarkdownHighlightStyle() {
  return HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--syntax-heading)', fontWeight: '800', fontSize: '1.25em' },
  { tag: tags.heading2, color: 'var(--syntax-heading-2)', fontWeight: '750', fontSize: '1.14em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: 'var(--syntax-heading-3)', fontWeight: '700' },
  { tag: tags.strong, color: 'var(--syntax-strong)', fontWeight: '750' },
  { tag: tags.emphasis, color: 'var(--syntax-emphasis)', fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--syntax-link)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--syntax-url)' },
  { tag: tags.quote, color: 'var(--syntax-quote)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--syntax-list)', fontWeight: '700' },
  { tag: tags.monospace, color: 'var(--syntax-code)', fontFamily: '"Cascadia Code", Consolas, monospace' },
  { tag: [tags.meta, tags.processingInstruction], color: 'var(--syntax-meta)' },
  { tag: tags.contentSeparator, color: 'var(--syntax-separator)' },
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: tags.keyword, color: 'var(--syntax-keyword)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: tags.bool, color: 'var(--syntax-keyword)' },
  { tag: tags.punctuation, color: 'var(--syntax-punctuation)' }
  ]);
}

function loadEditorDependencies() {
  if (editorDependenciesPromise) return editorDependenciesPromise;
  editorDependenciesPromise = Promise.all([
    import('codemirror'),
    import('@codemirror/state'),
    import('@codemirror/view'),
    import('@codemirror/commands'),
    import('@codemirror/search'),
    import('@codemirror/language'),
    import('@codemirror/lang-markdown'),
    import('@lezer/highlight')
  ]).then(([codemirrorModule, stateModule, viewModule, commandsModule, searchModule, languageModule, markdownModule, highlightModule]) => {
    basicSetup = codemirrorModule.basicSetup;
    Compartment = stateModule.Compartment;
    EditorState = stateModule.EditorState;
    EditorView = viewModule.EditorView;
    keymap = viewModule.keymap;
    scrollPastEnd = viewModule.scrollPastEnd;
    undo = commandsModule.undo;
    undoDepth = commandsModule.undoDepth;
    closeSearchPanel = searchModule.closeSearchPanel;
    openSearchPanel = searchModule.openSearchPanel;
    searchPanelOpen = searchModule.searchPanelOpen;
    HighlightStyle = languageModule.HighlightStyle;
    syntaxHighlighting = languageModule.syntaxHighlighting;
    markdown = markdownModule.markdown;
    tags = highlightModule.tags;
    editorLanguage = new Compartment();
    markdownHighlightStyle = createMarkdownHighlightStyle();
  });
  return editorDependenciesPromise;
}

function editorContent() {
  return codeEditor?.state.doc.toString() || '';
}

function isPlainTextFile(path) {
  return /\.txt$/i.test(path || '');
}

function createEditorState(content = '', moveToStart = true) {
  const language = isPlainTextFile(state.currentFile?.path)
    ? []
    : [markdown(), syntaxHighlighting(markdownHighlightStyle)];
  return EditorState.create({
    doc: content,
    selection: { anchor: moveToStart ? 0 : content.length },
    extensions: [...editorExtensions, ...language, editorLanguage.of(editorLanguageExtension())]
  });
}

function updateUndoButton(editorState = codeEditor?.state) {
  if (!els.editorUndoButton || !editorState) return;
  els.editorUndoButton.disabled = undoDepth(editorState) === 0;
}

// Opening another document creates a brand-new editor state. This is
// intentionally stronger than replacing the text: it discards the previous
// document's undo history, making the newly loaded content the undo baseline.
function replaceEditorContent(content, moveToStart = false) {
  if (!codeEditor) return;
  suppressEditorChanges = true;
  codeEditor.setState(createEditorState(content, moveToStart));
  suppressEditorChanges = false;
  updateUndoButton();
}

function focusCodeEditor() {
  if (!codeEditor) return;
  requestAnimationFrame(() => {
    codeEditor.requestMeasure();
    requestAnimationFrame(() => codeEditor.focus());
  });
}

function replaceSelection(insert, selectFrom = 0, selectLength = 0) {
  if (!codeEditor || !state.editing) return false;
  const selection = codeEditor.state.selection.main;
  codeEditor.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor: selection.from + selectFrom, head: selection.from + selectFrom + selectLength },
    scrollIntoView: true
  });
  codeEditor.focus();
  return true;
}

function wrapSelection(before, after, placeholder) {
  const selection = codeEditor?.state.selection.main;
  if (!selection || !state.editing) return false;
  const selected = codeEditor.state.doc.sliceString(selection.from, selection.to) || placeholder;
  return replaceSelection(`${before}${selected}${after}`, before.length, selected.length);
}

// 只允许工具栏内置色名，避免把任意样式写入文档。再次选择颜色时会替换
// 现有颜色标记；“默认颜色”则移除紧贴选区的颜色标记。
function applyTextColor(color) {
  if (!codeEditor || !state.editing || !TEXT_COLOR_VALUES.has(color)) return false;
  const selection = codeEditor.state.selection.main;
  const source = codeEditor.state.doc.toString();
  const selected = source.slice(selection.from, selection.to);
  const fullWrapper = selected.match(/^<span data-md-color="([^"]+)">([\s\S]*)<\/span>$/);

  if (fullWrapper && TEXT_COLOR_VALUES.has(fullWrapper[1])) {
    const inner = fullWrapper[2];
    const open = color === 'default' ? '' : `<span data-md-color="${color}">`;
    const insert = color === 'default' ? inner : `${open}${inner}</span>`;
    return replaceSelection(insert, open.length, inner.length);
  }

  const before = source.slice(Math.max(0, selection.from - 64), selection.from);
  const openMatch = before.match(/<span data-md-color="([^"]+)">$/);
  const close = '</span>';
  if (openMatch && TEXT_COLOR_VALUES.has(openMatch[1]) && source.slice(selection.to).startsWith(close)) {
    const open = color === 'default' ? '' : `<span data-md-color="${color}">`;
    const insert = color === 'default' ? selected : `${open}${selected}${close}`;
    const from = selection.from - openMatch[0].length;
    codeEditor.dispatch({
      changes: { from, to: selection.to + close.length, insert },
      selection: { anchor: from + open.length, head: from + open.length + selected.length },
      scrollIntoView: true
    });
    codeEditor.focus();
    return true;
  }

  if (color === 'default' && !selected) return false;
  const text = selected || t('coloredText');
  const open = `<span data-md-color="${color}">`;
  return replaceSelection(`${open}${text}${close}`, open.length, text.length);
}

function formatSelectedLines(kind, headingPrefix = '') {
  if (!codeEditor || !state.editing) return false;
  const selection = codeEditor.state.selection.main;
  const first = codeEditor.state.doc.lineAt(selection.from);
  const last = codeEditor.state.doc.lineAt(selection.to);
  const original = codeEditor.state.doc.sliceString(first.from, last.to);
  const lines = original.split('\n');
  const formatted = lines.map((line, index) => {
    if (kind === 'heading') return `${headingPrefix}${line.replace(/^#{1,6}\s+/, '')}`;
    if (kind === 'quote') return `> ${line}`;
    if (kind === 'unordered-list') return `- ${line.replace(/^[-*+]\s+/, '')}`;
    if (kind === 'ordered-list') return `${index + 1}. ${line.replace(/^\d+[.)]\s+/, '')}`;
    if (kind === 'task-list') return `- [ ] ${line.replace(/^[-*+]\s+(?:\[[ xX]\]\s+)?/, '')}`;
    return line;
  }).join('\n');
  codeEditor.dispatch({
    changes: { from: first.from, to: last.to, insert: formatted },
    selection: { anchor: first.from, head: first.from + formatted.length },
    scrollIntoView: true
  });
  codeEditor.focus();
  return true;
}

let copiedFormat = null; // { inline: ['bold','italic',...], block: 'heading2' | 'quote' | null }
let copiedFormatSource = null; // 复制格式时的源选区 { from, to }
let formatPainterApplyTimer = null; // 选区稳定后自动应用格式的定时器

function analyzeFormat(selectionFrom, selectionTo) {
  const doc = codeEditor.state.doc;
  const format = { inline: [], block: null };
  // 检查行内标记（包裹在选区两侧）
  const before = doc.sliceString(Math.max(0, selectionFrom - 3), selectionFrom);
  const after = doc.sliceString(selectionTo, Math.min(doc.length, selectionTo + 3));
  const inlineChecks = [
    { open: '**', close: '**', name: 'bold' },
    { open: '*', close: '*', name: 'italic' },
    { open: '~~', close: '~~', name: 'strikethrough' },
    { open: '==', close: '==', name: 'highlight' },
    { open: '`', close: '`', name: 'inline-code' }
  ];
  for (const check of inlineChecks) {
    if (before.endsWith(check.open) && after.startsWith(check.close)) format.inline.push(check.name);
  }
  // bold 匹配时移除重复的 italic（* 也会匹配 ** 尾部）
  if (format.inline.includes('bold')) format.inline = format.inline.filter(name => name !== 'italic');
  // 检查块级格式（选区首行）
  const first = doc.lineAt(selectionFrom);
  const lineText = first.text;
  const headingMatch = lineText.match(/^(#{1,6})\s+/);
  if (headingMatch) format.block = `heading${headingMatch[1].length}`;
  else if (/^>\s+/.test(lineText)) format.block = 'quote';
  else if (/^[-*+]\s+/.test(lineText)) format.block = 'unordered-list';
  else if (/^\d+[.)]\s+/.test(lineText)) format.block = 'ordered-list';
  return format;
}

function copyFormatFromSelection() {
  if (!codeEditor || !state.editing) return false;
  const selection = codeEditor.state.selection.main;
  if (selection.from === selection.to) {
    showToast(t('formatNeedSelection'), 'warning');
    return false;
  }
  const format = analyzeFormat(selection.from, selection.to);
  if (!format.inline.length && !format.block) {
    showToast(t('formatNeedSelection'), 'warning');
    return false;
  }
  copiedFormat = format;
  copiedFormatSource = { from: selection.from, to: selection.to };
  const button = $('#formatPainterButton');
  if (button) {
    button.classList.add('active');
    button.setAttribute('aria-pressed', 'true');
  }
  showToast(t('formatCopied'), 'success');
  return true;
}

function scheduleFormatPainterApply() {
  clearTimeout(formatPainterApplyTimer);
  formatPainterApplyTimer = setTimeout(() => {
    if (!copiedFormat || !codeEditor || !state.editing) return;
    const selection = codeEditor.state.selection.main;
    // 仅在新选区与源选区不同且非空时自动应用
    if (selection.from === selection.to) return;
    if (copiedFormatSource && selection.from === copiedFormatSource.from && selection.to === copiedFormatSource.to) return;
    applyCopiedFormat();
  }, 120);
}

function applyCopiedFormat() {
  if (!copiedFormat || !codeEditor || !state.editing) return false;
  const selection = codeEditor.state.selection.main;
  if (selection.from === selection.to) return false;
  let selectionChanged = false;
  // 先应用行内格式（基于当前选区），再应用块级格式（formatSelectedLines 会重新读取选区）
  if (copiedFormat.inline.length) {
    const current = codeEditor.state.selection.main;
    let insert = codeEditor.state.doc.sliceString(current.from, current.to);
    for (const name of copiedFormat.inline) {
      const open = { bold: '**', italic: '*', strikethrough: '~~', highlight: '==', 'inline-code': '`' }[name];
      if (open) insert = `${open}${insert}${open}`;
    }
    codeEditor.dispatch({
      changes: { from: current.from, to: current.to, insert },
      selection: { anchor: current.from, head: current.from + insert.length },
      scrollIntoView: true
    });
    selectionChanged = true;
  }
  // 块级格式
  if (copiedFormat.block) {
    if (copiedFormat.block.startsWith('heading')) {
      const prefix = '#'.repeat(Number(copiedFormat.block.slice(7))) + ' ';
      selectionChanged = formatSelectedLines('heading', prefix) || selectionChanged;
    } else if (['quote', 'unordered-list', 'ordered-list'].includes(copiedFormat.block)) {
      selectionChanged = formatSelectedLines(copiedFormat.block) || selectionChanged;
    }
  }
  if (selectionChanged) {
    codeEditor.focus();
    showToast(t('formatApplied'), 'success');
  }
  clearCopiedFormat();
  return selectionChanged;
}

function clearCopiedFormat() {
  copiedFormat = null;
  copiedFormatSource = null;
  clearTimeout(formatPainterApplyTimer);
  const button = $('#formatPainterButton');
  if (button) {
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
  }
}

function runFormatCommand(command) {
  if (!state.editing) toggleEditor(true);
  if (!codeEditor || !state.currentFile) return false;
  if (command === 'bold') return wrapSelection('**', '**', t('boldTitle').split(' ')[0]);
  if (command === 'italic') return wrapSelection('*', '*', t('italicTitle').split(' ')[0]);
  if (command === 'bold-italic') return wrapSelection('***', '***', t('boldItalic'));
  if (command === 'strikethrough') return wrapSelection('~~', '~~', t('strikethroughTitle').split(' ')[0]);
  if (command === 'highlight') return wrapSelection('==', '==', t('highlightTitle').split(' ')[0]);
  if (command === 'text-color') { openTextColorMenu(); return true; }
  if (command === 'underline') return wrapSelection('<u>', '</u>', t('underline'));
  if (command === 'superscript') return wrapSelection('<sup>', '</sup>', t('superscript'));
  if (command === 'subscript') return wrapSelection('<sub>', '</sub>', t('subscript'));
  if (command === 'formula-builder') { openFormulaDialog(); return true; }
  if (command === 'diagram-builder') { openDiagramDialog(); return true; }
  if (command.startsWith('mermaid-')) {
    openDiagramDialog({ 'mermaid-flowchart': 'flowchart', 'mermaid-sequence': 'sequence', 'mermaid-gantt': 'gantt' }[command] || 'flowchart');
    return true;
  }
  if (command === 'keyboard-key') return wrapSelection('<kbd>', '</kbd>', state.language === 'en' ? 'Key' : '按键');
  if (command === 'comment') return wrapSelection('<!-- ', ' -->', state.language === 'en' ? 'comment' : '注释');
  if (command === 'autolink') return wrapSelection('<', '>', 'https://example.com');
  if (command === 'escape') {
    const selection = codeEditor.state.selection.main;
    const selected = codeEditor.state.doc.sliceString(selection.from, selection.to) || '*';
    const escaped = escapeMarkdownText(selected);
    return replaceSelection(escaped, 0, escaped.length);
  }
  if (command === 'html-block') {
    const selection = codeEditor.state.selection.main;
    const selected = codeEditor.state.doc.sliceString(selection.from, selection.to) || (state.language === 'en' ? 'Content' : '内容');
    return replaceSelection(`<div>\n${selected}\n</div>`, 6, selected.length);
  }
  if (command === 'link') {
    const selection = codeEditor.state.selection.main;
    const selected = codeEditor.state.doc.sliceString(selection.from, selection.to) || (state.language === 'en' ? 'link text' : '链接文字');
    const prefix = `[${selected}](`;
    return replaceSelection(`${prefix}https://)`, prefix.length, 8);
  }
  if (command === 'inline-code') return wrapSelection('`', '`', 'code');
  if (command === 'code-block') { openCodeLangMenu(); return true; }
  if (command === 'horizontal-rule') return replaceSelection('\n\n---\n\n', 5, 0);
  if (command === 'hard-break') return replaceSelection('  \n', 3, 0);
  if (command === 'footnote') {
    const selection = codeEditor.state.selection.main;
    const selected = codeEditor.state.doc.sliceString(selection.from, selection.to) || t('footnoteText');
    const number = nextFootnoteNumber(codeEditor.state.doc.toString());
    const reference = `[^${number}]`;
    return replaceSelection(`${reference}\n\n${reference}: ${selected}`, 0, reference.length);
  }
  if (command === 'reference-link') {
    const selection = codeEditor.state.selection.main;
    const selected = codeEditor.state.doc.sliceString(selection.from, selection.to) || (state.language === 'en' ? 'link text' : '链接文字');
    const name = t('referenceName');
    return replaceSelection(`[${selected}][${name}]\n\n[${name}]: https://`, 1, selected.length);
  }
  if (command === 'collapsible') {
    const selection = codeEditor.state.selection.main;
    const selected = codeEditor.state.doc.sliceString(selection.from, selection.to) || (state.language === 'en' ? 'Content' : '折叠内容');
    const summary = t('collapsibleTitle');
    return replaceSelection(`<details>\n<summary>${summary}</summary>\n\n${selected}\n\n</details>`, 19, summary.length);
  }
  if (['quote', 'unordered-list', 'ordered-list', 'task-list'].includes(command)) return formatSelectedLines(command);
  if (command === 'table') { openTableDialog(); return true; }
  if (command === 'image') { insertImage(); return true; }
  return false;
}

let formatToolbarLayoutFrame;
let formatToolbarResizeObserver;

// 代码块常用编程语言（value 为 highlight.js 可识别的语言别名）
const CODE_LANGUAGES = [
  { value: 'js', label: 'JavaScript' },
  { value: 'ts', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'bash', label: 'Bash' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'markdown', label: 'Markdown' }
];

let codeLangMenuBuilt = false;
let textColorMenuBuilt = false;

function buildTextColorMenu() {
  if (textColorMenuBuilt) return;
  textColorMenuBuilt = true;
  const options = els.textColorMenu.querySelector('.text-color-options');
  for (const color of TEXT_COLOR_PALETTE) {
    const button = document.createElement('button');
    const label = state.language === 'en' ? color.en : color.zh;
    button.type = 'button';
    button.role = 'menuitemradio';
    button.dataset.textColor = color.id;
    button.dataset.colorZh = color.zh;
    button.dataset.colorEn = color.en;
    button.setAttribute('aria-checked', 'false');
    button.title = label;
    button.setAttribute('aria-label', `${t('textColorOption')}：${label}`);
    const swatch = document.createElement('span');
    swatch.className = 'text-color-swatch';
    swatch.style.setProperty('--swatch-color', color.value);
    button.append(swatch);
    options.append(button);
  }
}

function syncTextColorMenuLabels() {
  els.textColorMenu.querySelectorAll('[data-color-zh]').forEach(button => {
    const label = state.language === 'en' ? button.dataset.colorEn : button.dataset.colorZh;
    button.title = label;
    button.setAttribute('aria-label', `${t('textColorOption')}：${label}`);
  });
}

function closeTextColorMenu() {
  els.textColorMenu.classList.add('hidden');
  $('#textColorButton')?.setAttribute('aria-expanded', 'false');
}

function syncTextColorChoice(color) {
  els.textColorMenu.querySelectorAll('[data-text-color]').forEach(button => {
    const active = button.dataset.textColor === color;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  $('#textColorButton')?.style.setProperty('--text-color-indicator', color === 'default' ? 'var(--accent)' : textColorValue(color) || 'var(--accent)');
}

// 在“文字颜色”按钮下方展示紧凑色板；按钮被折叠时锚定“更多格式”。
function openTextColorMenu() {
  const menu = els.textColorMenu;
  buildTextColorMenu();
  syncTextColorMenuLabels();
  const wasHidden = menu.classList.contains('hidden');
  closeTextColorMenu();
  if (!wasHidden) return;
  els.moreMenu.classList.add('hidden');
  els.codeLangMenu.classList.add('hidden');
  closeMoreFormatMenu();
  closeAccentMenu();
  closeRecentContextMenu();
  const anchor = $('[data-format="text-color"]:not([hidden])') || els.moreFormatButton;
  const rect = anchor?.getBoundingClientRect();
  menu.classList.remove('hidden');
  $('#textColorButton')?.setAttribute('aria-expanded', 'true');
  menu.style.left = 'auto';
  menu.style.top = 'auto';
  menu.style.right = 'auto';
  if (rect) {
    const margin = 8;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
  requestAnimationFrame(() => (menu.querySelector('[data-text-color].active') || menu.querySelector('[data-text-color]'))?.focus());
}

function buildCodeLangMenu() {
  if (codeLangMenuBuilt) return;
  codeLangMenuBuilt = true;
  const menu = els.codeLangMenu;
  for (const lang of CODE_LANGUAGES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'menuitem';
    button.dataset.codeLang = lang.value;
    button.textContent = lang.label;
    menu.append(button);
  }
  const plain = document.createElement('button');
  plain.type = 'button';
  plain.role = 'menuitem';
  plain.dataset.codeLang = '';
  plain.dataset.i18n = 'codeNoLang';
  plain.textContent = t('codeNoLang');
  menu.append(plain);
}

// 在代码块按钮下方弹出编程语言选择菜单；再次调用则关闭。
function openCodeLangMenu() {
  buildCodeLangMenu();
  const menu = els.codeLangMenu;
  const wasHidden = menu.classList.contains('hidden');
  menu.classList.add('hidden');
  if (!wasHidden) return;
  els.moreMenu.classList.add('hidden');
  closeMoreFormatMenu();
  closeAccentMenu();
  closeRecentContextMenu();
  const anchor = $('[data-format="code-block"]:not([hidden])') || els.moreFormatButton;
  const rect = anchor?.getBoundingClientRect();
  menu.classList.remove('hidden');
  menu.style.left = 'auto';
  menu.style.top = 'auto';
  menu.style.right = 'auto';
  if (rect) {
    const margin = 8;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
}

// 插入带指定语言的代码块；lang 为空时插入无语言围栏。
function insertCodeBlock(lang = '') {
  if (!codeEditor) return false;
  const selection = codeEditor.state.selection.main;
  const selected = codeEditor.state.doc.sliceString(selection.from, selection.to) || 'code';
  const fence = lang ? `\`\`\`${lang}\n${selected}\n\`\`\`` : `\`\`\`\n${selected}\n\`\`\``;
  const caret = lang ? 4 + lang.length : 4;
  return replaceSelection(fence, caret, selected.length);
}

function syncFormatDividers() {
  const bar = $('#editorFormatBar');
  if (!bar) return;
  const directFormats = [...bar.querySelectorAll('[data-format-overflow]')];
  bar.querySelectorAll('[data-divider-before]').forEach(divider => {
    const target = divider.dataset.dividerBefore;
    const hasVisibleTarget = target === 'more'
      ? directFormats.some(element => !element.hidden)
      : directFormats.some(element => element.dataset.formatGroup === target && !element.hidden);
    divider.hidden = !hasVisibleTarget;
  });
}

function rebuildOverflowFormatOptions() {
  const group = $('#overflowFormatGroup');
  const options = $('#overflowFormatOptions');
  const bar = $('#editorFormatBar');
  if (!group || !options || !bar) return;
  options.replaceChildren();
  for (const element of bar.querySelectorAll('[data-format-overflow][hidden]')) {
    if (element.id === 'headingSelect') {
      for (const heading of element.options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.role = 'menuitem';
        button.dataset.formatCommand = `heading:${heading.value}`;
        button.textContent = t(heading.dataset.i18n);
        options.append(button);
      }
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'menuitem';
    button.dataset.formatCommand = element.dataset.formatOverflow;
    button.textContent = t(element.dataset.formatLabel).replace(/\s+\([^)]*\)$/, '');
    options.append(button);
  }
  group.hidden = options.children.length === 0;
}

function closeMoreFormatMenu(restoreFocus = false) {
  if (!els.moreFormatMenu || els.moreFormatMenu.classList.contains('hidden')) return;
  els.moreFormatMenu.classList.add('hidden');
  els.moreFormatButton.setAttribute('aria-expanded', 'false');
  if (restoreFocus) els.moreFormatButton.focus();
}

function openMoreFormatMenu() {
  const menu = els.moreFormatMenu;
  const button = els.moreFormatButton;
  if (!menu || !button) return;
  const wasHidden = menu.classList.contains('hidden');
  closeMoreFormatMenu();
  if (!wasHidden) return;
  els.moreMenu.classList.add('hidden');
  els.codeLangMenu.classList.add('hidden');
  closeTextColorMenu();
  closeAccentMenu();
  closeRecentContextMenu();
  const rect = button.getBoundingClientRect();
  const margin = 8;
  const menuWidth = 218;
  menu.style.left = `${Math.max(margin, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - margin))}px`;
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.maxHeight = `${Math.max(140, window.innerHeight - rect.bottom - margin - 6)}px`;
  menu.classList.remove('hidden');
  button.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => menu.querySelector('[role="menuitem"]')?.focus());
}

function layoutFormatToolbar() {
  const bar = $('#editorFormatBar');
  if (!bar || bar.clientWidth === 0) return;
  const candidates = [...bar.querySelectorAll('[data-format-overflow]')];
  candidates.forEach(element => { element.hidden = false; });
  syncFormatDividers();

  const byOverflowPriority = [...candidates].sort((first, second) =>
    Number(first.dataset.overflowPriority) - Number(second.dataset.overflowPriority)
  );
  for (const candidate of byOverflowPriority) {
    if (bar.scrollWidth <= bar.clientWidth + 1) break;
    candidate.hidden = true;
    syncFormatDividers();
  }
  rebuildOverflowFormatOptions();
}

function scheduleFormatToolbarLayout() {
  cancelAnimationFrame(formatToolbarLayoutFrame);
  formatToolbarLayoutFrame = requestAnimationFrame(layoutFormatToolbar);
}

function initializeFormatToolbarOverflow() {
  const bar = $('#editorFormatBar');
  if (!bar) return;
  if ('ResizeObserver' in window) {
    formatToolbarResizeObserver = new ResizeObserver(scheduleFormatToolbarLayout);
    formatToolbarResizeObserver.observe(bar);
  } else {
    window.addEventListener('resize', scheduleFormatToolbarLayout);
  }
  scheduleFormatToolbarLayout();
}

const formulaWizardState = {
  mode: 'block',
  discipline: 'all',
  templateId: 'equation',
  valuesByTemplate: new Map(),
};

function formulaLocale() {
  return state.language === 'en' ? 'en' : 'zh';
}

function selectedFormulaDetails() {
  if (!codeEditor) return { source: '', templateId: 'equation', mode: 'block' };
  const selection = codeEditor.state.selection.main;
  const raw = codeEditor.state.doc.sliceString(selection.from, selection.to).trim();
  if (!raw) return { source: '', templateId: 'equation', mode: 'block' };
  let mode = 'block';
  let source = raw;
  if (/^\$\$(?:.|\n)*\$\$$/.test(raw)) source = raw.slice(2, -2).trim();
  else if (/^\$(?:.|\n)*\$$/.test(raw)) {
    mode = 'inline';
    source = raw.slice(1, -1).trim();
  } else if (/^\\\[(?:.|\n)*\\\]$/.test(raw)) source = raw.slice(2, -2).trim();
  else if (/^\\\((?:.|\n)*\\\)$/.test(raw)) {
    mode = 'inline';
    source = raw.slice(2, -2).trim();
  }
  if (/\\tag\{[^{}]*\}\s*$/.test(source)) mode = 'numbered';
  source = source.replace(/\s+\\tag\{[^{}]*\}\s*$/, '').trim();
  const chemistry = source.match(/^\\ce\{([\s\S]*)\}$/);
  if (chemistry) return { source: chemistry[1].trim(), templateId: 'chem-custom', mode };
  return { source, templateId: 'custom', mode };
}

function formulaTemplateValues(template) {
  return formulaWizardState.valuesByTemplate.get(template.id) || formulaValues(template);
}

function formulaFieldValues() {
  return Object.fromEntries([...els.formulaFields.querySelectorAll('[data-formula-field]')].map(input => [input.dataset.formulaField, input.value]));
}

function rememberFormulaFieldValues() {
  const template = formulaTemplateById(formulaWizardState.templateId);
  if (template) formulaWizardState.valuesByTemplate.set(template.id, formulaFieldValues());
}

function renderFormulaDisciplineTabs() {
  const locale = formulaLocale();
  els.formulaDisciplineTabs.replaceChildren();
  for (const discipline of FORMULA_DISCIPLINES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.formulaDiscipline = discipline.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(discipline.id === formulaWizardState.discipline));
    button.classList.toggle('active', discipline.id === formulaWizardState.discipline);
    button.textContent = discipline.name[locale];
    els.formulaDisciplineTabs.append(button);
  }
}

function renderFormulaTemplateList() {
  const locale = formulaLocale();
  const templates = formulaTemplatesForDiscipline(formulaWizardState.discipline);
  els.formulaTemplateList.replaceChildren();
  let lastGroup = '';
  for (const template of templates) {
    if (template.group !== lastGroup) {
      lastGroup = template.group;
      const group = document.createElement('div');
      group.className = 'formula-template-group';
      group.textContent = FORMULA_GROUP_LABELS[template.group]?.[locale] || template.group;
      els.formulaTemplateList.append(group);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.formulaTemplate = template.id;
    button.classList.toggle('active', template.id === formulaWizardState.templateId);
    button.setAttribute('aria-pressed', String(template.id === formulaWizardState.templateId));
    const name = document.createElement('span');
    name.textContent = template.name[locale];
    const kind = document.createElement('code');
    kind.textContent = template.kind === 'chemistry' ? 'ce' : 'fx';
    button.append(name, kind);
    els.formulaTemplateList.append(button);
  }
}

function renderFormulaOutputModes() {
  for (const button of els.formulaOutputModes.querySelectorAll('[data-formula-mode]')) {
    const active = button.dataset.formulaMode === formulaWizardState.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function renderFormulaFields() {
  const locale = formulaLocale();
  const template = formulaTemplateById(formulaWizardState.templateId);
  if (!template) return;
  const values = formulaTemplateValues(template);
  els.formulaFields.replaceChildren();
  $('#formulaTemplateName').textContent = template.name[locale];
  $('#formulaTemplateKind').textContent = template.kind === 'chemistry' ? 'mhchem' : 'LaTeX';
  for (const item of template.fields) {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent = item.label[locale];
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 240;
    input.autocomplete = 'off';
    input.dataset.formulaField = item.key;
    input.value = values[item.key] ?? item.value;
    input.placeholder = item.placeholder || item.value;
    label.append(caption, input);
    els.formulaFields.append(label);
  }
  $('#formulaNumberField').classList.toggle('hidden', formulaWizardState.mode !== 'numbered');
  renderFormulaOutputModes();
  updateFormulaPreview();
}

function updateFormulaPreview() {
  const template = formulaTemplateById(formulaWizardState.templateId);
  if (!template) return;
  const values = formulaFieldValues();
  formulaWizardState.valuesByTemplate.set(template.id, values);
  const expression = buildFormulaExpression(template, values);
  const equationNumber = $('#formulaNumber').value;
  const markdownSource = buildFormulaMarkdown(formulaWizardState.mode, expression, equationNumber);
  els.formulaMarkdownSource.value = markdownSource;
  if (!expression) {
    els.formulaPreview.textContent = t('formulaInvalid');
    return;
  }
  const previewExpression = formulaPreviewExpression(formulaWizardState.mode, expression, equationNumber);
  const displayMode = formulaWizardState.mode === 'block' || formulaWizardState.mode === 'numbered';
  els.formulaPreview.innerHTML = DOMPurify.sanitize(renderLatex(previewExpression, displayMode));
}

function updateFormulaPreviewFromMarkdown() {
  const { expression, displayMode } = parseFormulaMarkdown(els.formulaMarkdownSource.value);
  if (!expression) {
    els.formulaPreview.textContent = t('formulaInvalid');
    return;
  }
  els.formulaPreview.innerHTML = DOMPurify.sanitize(renderLatex(expression, displayMode));
}

function chooseFormulaTemplate(templateId) {
  const template = formulaTemplateById(templateId);
  if (!template) return;
  rememberFormulaFieldValues();
  formulaWizardState.templateId = templateId;
  renderFormulaTemplateList();
  renderFormulaFields();
  els.formulaBuilderPanel.scrollTop = 0;
  requestAnimationFrame(() => els.formulaFields.querySelector('input')?.focus());
}

function chooseFormulaDiscipline(discipline) {
  if (!FORMULA_DISCIPLINES.some(item => item.id === discipline)) return;
  rememberFormulaFieldValues();
  formulaWizardState.discipline = discipline;
  const templates = formulaTemplatesForDiscipline(discipline);
  if (!templates.some(template => template.id === formulaWizardState.templateId)) {
    formulaWizardState.templateId = templates[0]?.id || 'equation';
  }
  renderFormulaDisciplineTabs();
  renderFormulaTemplateList();
  renderFormulaFields();
  els.formulaBuilderPanel.scrollTop = 0;
}

function chooseFormulaMode(mode) {
  if (!['inline', 'block', 'numbered'].includes(mode)) return;
  formulaWizardState.mode = mode;
  $('#formulaNumberField').classList.toggle('hidden', mode !== 'numbered');
  renderFormulaOutputModes();
  updateFormulaPreview();
}

function openFormulaDialog() {
  if (!state.currentFile || !codeEditor) return;
  const selected = selectedFormulaDetails();
  const preferred = selected.source ? selected.templateId : 'equation';
  const template = formulaTemplateById(preferred);
  formulaWizardState.mode = selected.mode;
  formulaWizardState.discipline = selected.source ? template.group : 'all';
  formulaWizardState.templateId = preferred;
  formulaWizardState.valuesByTemplate = new Map();
  if (selected.source) {
    formulaWizardState.valuesByTemplate.set(preferred, formulaValues(template, { formula: selected.source }));
  }
  $('#formulaNumber').value = '1';
  renderFormulaDisciplineTabs();
  renderFormulaTemplateList();
  renderFormulaFields();
  els.formulaBuilderPanel.scrollTop = 0;
  els.formulaDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => els.formulaTemplateList.querySelector('.active')?.focus());
}

function closeFormulaDialog() {
  if (els.formulaDialog.classList.contains('hidden')) return;
  els.formulaDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  focusCodeEditor();
}

function insertGeneratedFormula() {
  const markdownSource = els.formulaMarkdownSource.value.trim();
  if (!markdownSource) {
    showToast(t('formulaInvalid'), 'warning');
    els.formulaMarkdownSource.focus();
    return;
  }
  closeFormulaDialog();
  replaceSelection(markdownSource, markdownSource.length, 0);
}

const diagramWizardState = {
  category: 'all',
  templateId: 'flowchart',
  valuesByTemplate: new Map()
};
let diagramPreviewTimer = 0;

function diagramLocale() {
  return state.language === 'en' ? 'en' : 'zh';
}

function rememberDiagramSource() {
  if (!els.diagramSource) return;
  diagramWizardState.valuesByTemplate.set(diagramWizardState.templateId, els.diagramSource.value);
}

function renderDiagramCategoryTabs() {
  const locale = diagramLocale();
  els.diagramCategoryTabs.replaceChildren();
  for (const category of DIAGRAM_CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.diagramCategory = category.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(category.id === diagramWizardState.category));
    button.classList.toggle('active', category.id === diagramWizardState.category);
    button.textContent = category.name[locale];
    els.diagramCategoryTabs.append(button);
  }
}

function renderDiagramTemplateList() {
  const locale = diagramLocale();
  els.diagramTemplateList.replaceChildren();
  for (const template of diagramTemplatesForCategory(diagramWizardState.category)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.diagramTemplate = template.id;
    button.classList.toggle('active', template.id === diagramWizardState.templateId);
    button.setAttribute('aria-pressed', String(template.id === diagramWizardState.templateId));
    const label = document.createElement('span');
    label.textContent = template.name[locale];
    const kind = document.createElement('code');
    kind.textContent = template.engine === 'echarts' ? 'ECharts' : 'Mermaid';
    button.append(label, kind);
    els.diagramTemplateList.append(button);
  }
}

function scheduleDiagramPreview(immediate = false) {
  clearTimeout(diagramPreviewTimer);
  diagramPreviewTimer = window.setTimeout(updateDiagramPreview, immediate ? 0 : 260);
}

async function updateDiagramPreview() {
  const source = els.diagramSource.value.trim();
  const template = diagramTemplateById(diagramWizardState.templateId);
  els.diagramPreview.replaceChildren();
  if (!source) {
    els.diagramPreview.textContent = t('diagramInvalid');
    return;
  }
  const diagram = document.createElement('div');
  const isECharts = template.engine === 'echarts';
  diagram.className = isECharts ? 'echarts-diagram' : 'mermaid-diagram';
  diagram.dataset[isECharts ? 'echartsSource' : 'mermaidSource'] = encodeURIComponent(source);
  diagram.setAttribute('aria-label', t(isECharts ? 'dataChart' : 'mermaidDiagram'));
  const loading = document.createElement('div');
  loading.className = isECharts ? 'echarts-loading' : 'mermaid-loading';
  loading.textContent = t(isECharts ? 'dataChart' : 'mermaidDiagram');
  diagram.append(loading);
  els.diagramPreview.append(diagram);
  if (isECharts) {
    await renderEChartsDiagrams(els.diagramPreview, {
      errorTitle: t('dataChartRenderError'),
      errorHint: t('dataChartRenderHint')
    });
  } else {
    await renderMermaidDiagrams(els.diagramPreview, {
      errorTitle: t('mermaidRenderError'),
      errorHint: t('mermaidRenderHint')
    });
  }
}

function renderDiagramBuilder() {
  const locale = diagramLocale();
  const template = diagramTemplateById(diagramWizardState.templateId);
  $('#diagramTemplateName').textContent = template.name[locale];
  $('#diagramTemplateDescription').textContent = template.description[locale];
  els.diagramSource.value = diagramWizardState.valuesByTemplate.get(template.id) ?? diagramTemplateSource(template, locale);
  renderDiagramTemplateList();
  scheduleDiagramPreview(true);
}

function chooseDiagramTemplate(templateId) {
  const template = diagramTemplateById(templateId);
  if (!template) return;
  rememberDiagramSource();
  diagramWizardState.templateId = template.id;
  renderDiagramBuilder();
  els.diagramBuilderPanel.scrollTop = 0;
  requestAnimationFrame(() => els.diagramSource.focus());
}

function chooseDiagramCategory(categoryId) {
  if (!DIAGRAM_CATEGORIES.some(category => category.id === categoryId)) return;
  rememberDiagramSource();
  diagramWizardState.category = categoryId;
  const templates = diagramTemplatesForCategory(categoryId);
  if (!templates.some(template => template.id === diagramWizardState.templateId)) {
    diagramWizardState.templateId = templates[0]?.id || 'flowchart';
  }
  renderDiagramCategoryTabs();
  renderDiagramBuilder();
  els.diagramBuilderPanel.scrollTop = 0;
}

function openDiagramDialog(preferredTemplateId = 'flowchart') {
  if (!state.currentFile || !codeEditor) return;
  const template = diagramTemplateById(preferredTemplateId);
  diagramWizardState.category = 'all';
  diagramWizardState.templateId = template.id;
  diagramWizardState.valuesByTemplate = new Map();
  renderDiagramCategoryTabs();
  renderDiagramBuilder();
  els.diagramBuilderPanel.scrollTop = 0;
  els.diagramDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => els.diagramTemplateList.querySelector('.active')?.focus());
}

function closeDiagramDialog() {
  if (els.diagramDialog.classList.contains('hidden')) return;
  clearTimeout(diagramPreviewTimer);
  els.diagramDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  focusCodeEditor();
}

function insertGeneratedDiagram() {
  const source = els.diagramSource.value.trim();
  const template = diagramTemplateById(diagramWizardState.templateId);
  if (!source) {
    showToast(t('diagramInvalid'), 'warning');
    els.diagramSource.focus();
    return;
  }
  if (template.engine === 'echarts') {
    const validation = validateEChartsSource(source);
    if (!validation.valid) {
      showToast(`${t('dataChartRenderError')}：${validation.error}`, 'warning');
      els.diagramSource.focus();
      return;
    }
  }
  closeDiagramDialog();
  const markdownSource = `\n\n\`\`\`${template.engine === 'echarts' ? 'echarts' : 'mermaid'}\n${source}\n\`\`\`\n\n`;
  replaceSelection(markdownSource, 13, source.length);
}

function openTableDialog() {
  if (!state.currentFile) return;
  els.tableDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => $('#tableRows').focus());
}

function closeTableDialog() {
  if (els.tableDialog.classList.contains('hidden')) return;
  els.tableDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  focusCodeEditor();
}

function insertTable() {
  const rows = Math.max(2, Math.min(20, Number($('#tableRows').value) || 3));
  const columns = Math.max(1, Math.min(12, Number($('#tableColumns').value) || 3));
  const header = `| ${Array.from({ length: columns }, (_, index) => `${t('columns')} ${index + 1}`).join(' | ')} |`;
  const divider = `| ${Array(columns).fill('---').join(' | ')} |`;
  const body = Array.from({ length: rows - 1 }, () => `| ${Array(columns).fill(' ').join(' | ')} |`);
  replaceSelection(`${header}\n${divider}\n${body.join('\n')}\n`, 2, Math.max(1, t('columns').length + 2));
  closeTableDialog();
}

function openImageDialog() {
  if (!state.currentFile) return;
  els.imageUrl.value = '';
  els.imageWidth.value = String(preferredImageWidth());
  updateImageWidthLabel();
  const selection = codeEditor.state.selection.main;
  els.imageAltInput.value = codeEditor.state.doc.sliceString(selection.from, selection.to) || '';
  els.imageDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => els.imageUrl.focus());
}

function closeImageDialog() {
  if (els.imageDialog.classList.contains('hidden')) return;
  els.imageDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  focusCodeEditor();
}

function selectedImageAlt() {
  if (codeEditor && !codeEditor.state.selection.main.empty) {
    return codeEditor.state.doc.sliceString(codeEditor.state.selection.main.from, codeEditor.state.selection.main.to).replaceAll('[', '\\[').replaceAll(']', '\\]');
  }
  return '';
}

function insertImage() {
  openImageDialog();
}

function preferredImageWidth() {
  const stored = Number(localStorage.getItem('imageWidth') || 100);
  return Math.max(10, Math.min(100, Math.round(stored / 5) * 5));
}

function updateImageWidthLabel() {
  const width = Math.max(10, Math.min(100, Number(els.imageWidth.value) || 100));
  els.imageWidthValue.textContent = `${width}%`;
  localStorage.setItem('imageWidth', String(width));
  return width;
}

function imageMarkdown(imagePath, description, width = preferredImageWidth()) {
  const safeDescription = String(description || t('imageAlt')).trim();
  const normalizedWidth = Math.max(10, Math.min(100, Number(width) || 100));
  if (normalizedWidth < 100) {
    return `<img src="${escapeHtml(imagePath)}" alt="${escapeHtml(safeDescription)}" width="${normalizedWidth}%">`;
  }
  const markdownDescription = safeDescription.replaceAll('[', '\\[').replaceAll(']', '\\]');
  const markdownPath = /[\s()]/.test(imagePath) ? `<${imagePath.replaceAll('>', '%3E')}>` : imagePath;
  return `![${markdownDescription}](${markdownPath})`;
}

function insertImageReference(imagePath, description, width = preferredImageWidth()) {
  const markdown = imageMarkdown(imagePath, description, width);
  replaceSelection(markdown, markdown.length, 0);
}

async function insertLocalImage() {
  if (!state.currentFile) return;
  try {
    const imagePath = await window.quilliteMarkdown.selectImage(state.currentFile.path);
    if (!imagePath) return;
    const selected = els.imageAltInput.value.trim() || selectedImageAlt() || t('imageAlt');
    insertImageReference(imagePath, selected, updateImageWidthLabel());
    showToast(t('imageImported'), 'success');
  } catch (error) {
    reportSilentError(error, 'image.select');
    console.error(error);
    showToast(t('imageSelectFailed'), 'error');
  }
}

function insertImageFromUrl() {
  if (!state.currentFile) return;
  const url = els.imageUrl.value.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) {
    showToast(t('imageUrlInvalid'), 'warning');
    els.imageUrl.focus();
    return;
  }
  const selected = els.imageAltInput.value.trim() || selectedImageAlt() || t('imageAlt');
  insertImageReference(url, selected, updateImageWidthLabel());
  closeImageDialog();
}

function imageDescriptionFromName(name) {
  return String(name || '').replace(/\.[^.]+$/, '').trim() || t('imageAlt');
}

async function importAndInsertImage(sourcePath, description = '') {
  if (!state.editing || !state.currentFile?.path || !sourcePath) return false;
  try {
    const imagePath = await window.quilliteMarkdown.importImage(state.currentFile.path, sourcePath);
    if (!imagePath) return false;
    insertImageReference(imagePath, description || imageDescriptionFromName(sourcePath.split(/[\\/]/).pop()));
    showToast(t('imageImported'), 'success');
    return true;
  } catch (error) {
    reportSilentError(error, 'image.import');
    console.error(error);
    showToast(t('imageSelectFailed'), 'error');
    return false;
  }
}

function fileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read pasted image'));
    reader.readAsDataURL(file);
  });
}

async function handleEditorImagePaste(event) {
  if (!state.editing || !state.currentFile?.path) return;
  const item = [...(event.clipboardData?.items || [])].find(candidate => candidate.kind === 'file' && /^image\//i.test(candidate.type));
  const file = item?.getAsFile();
  if (!file) return;
  event.preventDefault();
  try {
    const sourcePath = window.quilliteMarkdown.pathForFile(file);
    const imagePath = sourcePath
      ? await window.quilliteMarkdown.importImage(state.currentFile.path, sourcePath)
      : await window.quilliteMarkdown.savePastedImage(state.currentFile.path, await fileAsDataURL(file));
    if (!imagePath) throw new Error('Pasted image returned no asset path');
    insertImageReference(imagePath, imageDescriptionFromName(file.name));
    showToast(t('imageImported'), 'success');
  } catch (error) {
    reportSilentError(error, 'image.paste');
    console.error(error);
    showToast(t('imagePasteFailed'), 'error');
  }
}

async function initializeCodeEditor() {
  if (codeEditor) return codeEditor;
  if (editorInitializationPromise) return editorInitializationPromise;
  editorInitializationPromise = (async () => {
    await loadEditorDependencies();
    const saveKeymap = keymap.of([
    { key: 'Mod-s', run: () => { saveDocument(false); return true; } },
    { key: 'Mod-Shift-s', run: () => { saveDocument(true); return true; } },
    { key: 'Mod-e', run: () => { toggleEditor(false); return true; }, stopPropagation: true },
    { key: 'Mod-f', run: view => openSearchPanel(view) },
    { key: 'Mod-b', run: () => runFormatCommand('bold') },
    { key: 'Mod-i', run: () => runFormatCommand('italic') },
    { key: 'Mod-k', run: () => runFormatCommand('link') },
    { key: 'Mod-Shift-x', run: () => runFormatCommand('strikethrough') },
    { key: 'Mod-Shift-h', run: () => runFormatCommand('highlight') }
  ]);
    const editorTheme = EditorView.theme({
    '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text)' },
    '.cm-scroller': { overflow: 'auto', fontFamily: '"Cascadia Code", "Microsoft YaHei UI", Consolas, monospace' },
    '.cm-content': { padding: '24px 32px 60px', caretColor: 'var(--accent-strong)', lineHeight: '1.75' },
    '.cm-line': { padding: '0 4px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-strong)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent-soft) 34%, transparent)' },
    '.cm-gutters': { backgroundColor: 'var(--paper)', color: 'var(--faint)', borderRight: '1px solid var(--line)', minWidth: '48px' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--accent-soft)', color: 'var(--accent-strong)' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--accent-soft)', border: '1px solid var(--line)', color: 'var(--accent-strong)' },
    '.cm-panels': { backgroundColor: 'transparent', color: 'var(--text)' },
    '.cm-panels-bottom': { borderTop: '0' },
    '.cm-panel.cm-search': {
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px',
      padding: '12px 48px 12px 14px',
      backgroundColor: 'color-mix(in srgb, var(--paper) 94%, var(--accent-soft))',
      borderTop: '1px solid var(--line)', boxShadow: '0 -12px 30px rgba(32, 49, 39, .09)',
      fontFamily: '"Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif'
    },
    '.cm-panel.cm-search br': { display: 'block', flexBasis: '100%', width: '0', height: '0' },
    '.cm-panel.cm-search .cm-textfield': {
      boxSizing: 'border-box', flex: '0 1 320px', width: 'min(320px, 34vw)', minWidth: '180px', height: '34px',
      padding: '0 12px', border: '1px solid var(--line)', borderRadius: '9px',
      backgroundColor: 'var(--paper)', color: 'var(--text)', fontSize: '12px', outline: 'none',
      boxShadow: 'inset 0 1px 2px rgba(32, 49, 39, .04)', transition: 'border-color .15s, box-shadow .15s'
    },
    '.cm-panel.cm-search .cm-textfield:focus': {
      borderColor: 'var(--accent)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent)'
    },
    '.cm-panel.cm-search .cm-button': {
      boxSizing: 'border-box', height: '32px', padding: '0 13px', border: '1px solid var(--line)',
      borderRadius: '8px', backgroundImage: 'none', backgroundColor: 'var(--panel)', color: 'var(--text)',
      fontSize: '11.5px', fontWeight: '650', cursor: 'pointer', transition: 'background .15s, border-color .15s, color .15s, transform .15s'
    },
    '.cm-panel.cm-search .cm-button:hover': {
      backgroundImage: 'none', backgroundColor: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent-strong)'
    },
    '.cm-panel.cm-search .cm-button:active': { transform: 'translateY(1px)' },
    '.cm-panel.cm-search button[name="next"], .cm-panel.cm-search button[name="replace"]': {
      backgroundImage: 'none', backgroundColor: 'var(--accent-strong)', borderColor: 'var(--accent-strong)', color: 'var(--accent-contrast)'
    },
    '.cm-panel.cm-search button[name="next"]:hover, .cm-panel.cm-search button[name="replace"]:hover': {
      backgroundImage: 'none', backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-contrast)'
    },
    '.cm-panel.cm-search label': {
      display: 'inline-flex', alignItems: 'center', gap: '5px', minHeight: '28px',
      color: 'var(--muted)', fontSize: '11px', fontWeight: '550', whiteSpace: 'nowrap', cursor: 'pointer'
    },
    '.cm-panel.cm-search input[type="checkbox"]': { width: '14px', height: '14px', margin: '0', accentColor: 'var(--accent-strong)' },
    '.cm-panel.cm-search button[name="close"]': {
      position: 'absolute', top: '11px', right: '12px', display: 'grid', placeItems: 'center',
      width: '28px', height: '28px', padding: '0', border: '0', borderRadius: '8px',
      backgroundColor: 'transparent', color: 'var(--muted)', fontSize: '20px', lineHeight: '1', cursor: 'pointer'
    },
    '.cm-panel.cm-search button[name="close"]:hover': { backgroundColor: 'var(--accent-soft)', color: 'var(--accent-strong)' },
    '.cm-searchMatch': { backgroundColor: '#eadc7a66', outline: '1px solid #c7ad42' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#e2a64d88' }
  });
    editorExtensions = [
    basicSetup,
    editorTheme,
    saveKeymap,
    EditorView.lineWrapping,
    scrollPastEnd(),
    EditorView.updateListener.of(update => {
      if (update.docChanged && !suppressEditorChanges && state.currentFile) {
        state.currentFile.content = update.state.doc.toString();
        setDirty(state.currentFile.content !== state.savedContent);
        clearTimeout(renderEditorPreview.timer);
        const previewDelay = /(^|\n)\s*```(?:mermaid|echarts)\s*(\n|$)/i.test(state.currentFile.content) ? 220 : 90;
        renderEditorPreview.timer = setTimeout(() => renderEditorPreview(state.currentFile.content), previewDelay);
      }
      if (update.docChanged || update.selectionSet) {
        updateEditorPosition();
        scrollPreviewToCursor();
        if (update.selectionSet) scheduleFormatPainterApply();
      }
      updateUndoButton(update.state);
    })
  ];
    codeEditor = new EditorView({
      state: createEditorState(''),
      parent: els.editor
    });
    codeEditor.contentDOM.addEventListener('paste', handleEditorImagePaste);
    els.editor.addEventListener('pointerdown', () => {
      if (state.editing && !codeEditor.hasFocus) codeEditor.focus();
    }, true);
    return codeEditor;
  })();
  return editorInitializationPromise;
}

function slugify(text, index) {
  return `${text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section'}-${index}`;
}

function hideToast() {
  clearTimeout(showToast.timer);
  els.toast.classList.add('hidden');
}

function showToast(message, kind = 'info', duration) {
  const normalizedKind = ['success', 'info', 'warning', 'error'].includes(kind) ? kind : 'info';
  const durations = { success: 3200, info: 3600, warning: 5600, error: 8000 };
  const visibleFor = Number.isFinite(duration) ? Math.max(1600, duration) : durations[normalizedKind];
  $('#toastTitle').textContent = t(`toast${normalizedKind.charAt(0).toUpperCase()}${normalizedKind.slice(1)}`);
  $('#toastMessage').textContent = String(message || '');
  els.toast.dataset.kind = normalizedKind;
  els.toast.setAttribute('role', normalizedKind === 'error' || normalizedKind === 'warning' ? 'alert' : 'status');
  els.toast.setAttribute('aria-live', normalizedKind === 'error' || normalizedKind === 'warning' ? 'assertive' : 'polite');
  els.toast.style.setProperty('--toast-duration', `${visibleFor}ms`);
  const progress = $('#toastProgressBar');
  progress.style.animation = 'none';
  void progress.offsetWidth;
  progress.style.animation = '';
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(hideToast, visibleFor);
  showToast.resumeDelay = Math.min(1800, Math.max(1200, Math.round(visibleFor * .3)));
}

function updateAccentSelection() {
  document.querySelectorAll('[data-accent-option]').forEach(button => {
    const active = button.dataset.accentOption === state.accentTheme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
}

function updateThemedLogos() {
  const logo = ACCENT_THEMES[state.accentTheme].logo;
  document.querySelectorAll('[data-themed-logo]').forEach(image => { image.src = logo; });
}

let diagramAppearanceRefreshFrame = 0;

function refreshDiagramAppearance() {
  cancelAnimationFrame(diagramAppearanceRefreshFrame);
  diagramAppearanceRefreshFrame = requestAnimationFrame(async () => {
    const containers = [els.content, els.editorPreview, els.diagramPreview].filter(container => container?.isConnected);
    const themeKey = mermaidPreviewThemeKey();
    await Promise.all(containers.flatMap(container => [
      refreshMermaidDiagrams(container, {
        diagramLabel: t('mermaidDiagram'),
        errorTitle: t('mermaidRenderError'),
        errorHint: t('mermaidRenderHint')
      }),
      refreshEChartsDiagrams(container, {
        errorTitle: t('dataChartRenderError'),
        errorHint: t('dataChartRenderHint')
      })
    ]));
    containers.forEach(container => {
      container.querySelectorAll('.mermaid-diagram').forEach(diagram => { diagram.dataset.mermaidUiTheme = themeKey; });
      container.querySelectorAll('.echarts-diagram').forEach(diagram => { diagram.dataset.echartsUiTheme = themeKey; });
    });
  });
}

function setAccentTheme(accentId) {
  state.accentTheme = normalizeAccentTheme(accentId);
  document.documentElement.dataset.accent = state.accentTheme;
  localStorage.setItem('accentTheme', state.accentTheme);
  updateAccentSelection();
  updateThemedLogos();
  refreshDiagramAppearance();
}

function setColorMode(mode, persist = true) {
  state.colorMode = normalizeColorMode(mode);
  document.documentElement.dataset.colorMode = state.colorMode;
  if (persist) localStorage.setItem('colorMode', state.colorMode);
  $('#colorModeButton').setAttribute('aria-pressed', String(state.colorMode === 'dark'));
  window.quilliteMarkdown.setTheme(state.colorMode === 'dark');
  refreshDiagramAppearance();
}

function toggleColorMode() {
  if (document.documentElement.dataset.platform === 'darwin' && macSystemColorScheme) {
    macTemporaryColorMode = temporaryMacColorModeAfterToggle(state.colorMode, macSystemColorScheme.matches);
    const nextMode = resolveMacColorMode(macSystemColorScheme.matches, macTemporaryColorMode);
    setColorMode(nextMode, false);
    if (macTemporaryColorMode) {
      showToast(t('temporaryColorModeChanged', { mode: t(`${nextMode}ModeName`) }));
    } else {
      showToast(t('systemColorModeTitle'));
    }
    return;
  }
  setColorMode(state.colorMode === 'dark' ? 'light' : 'dark');
}

let macSystemColorScheme;
let macTemporaryColorMode = null;

function syncMacSystemColorMode(clearTemporaryOverride = false) {
  if (!macSystemColorScheme) return;
  if (clearTemporaryOverride) macTemporaryColorMode = null;
  setColorMode(resolveMacColorMode(macSystemColorScheme.matches, macTemporaryColorMode), false);
}

function initializeMacSystemColorMode() {
  if (document.documentElement.dataset.platform !== 'darwin' || !window.matchMedia) return false;
  macSystemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const button = $('#colorModeButton');
  button.dataset.i18nTitle = 'systemColorModeTitle';
  button.dataset.i18nAriaLabel = 'systemColorModeTitle';
  button.title = t('systemColorModeTitle');
  button.setAttribute('aria-label', t('systemColorModeTitle'));
  button.dataset.systemManaged = 'true';
  const handleSystemColorModeChange = () => syncMacSystemColorMode(true);
  if (macSystemColorScheme.addEventListener) macSystemColorScheme.addEventListener('change', handleSystemColorModeChange);
  else macSystemColorScheme.addListener(handleSystemColorModeChange);
  syncMacSystemColorMode();
  return true;
}

let macWindowModePollTimer;
let macWindowModePollDeadline = 0;

async function syncMacWindowFullscreen() {
  if (document.documentElement.dataset.platform !== 'darwin') return;
  try {
    const fullscreen = await window.quilliteMarkdown.isWindowFullscreen();
    document.documentElement.dataset.windowFullscreen = fullscreen ? 'true' : 'false';
  } catch (error) {
    console.warn('Unable to read macOS fullscreen state', error);
  }
}

function scheduleMacWindowModeSync() {
  if (document.documentElement.dataset.platform !== 'darwin') return;
  macWindowModePollDeadline = performance.now() + 1800;
  if (macWindowModePollTimer) return;

  const poll = async () => {
    await syncMacWindowFullscreen();
    if (performance.now() < macWindowModePollDeadline) {
      macWindowModePollTimer = setTimeout(poll, 32);
    } else {
      macWindowModePollTimer = undefined;
    }
  };
  macWindowModePollTimer = setTimeout(poll, 0);
}

function closeAccentMenu() {
  els.accentMenu.classList.add('hidden');
  $('#accentButton').setAttribute('aria-expanded', 'false');
}

function closeRecentContextMenu() {
  els.recentContextMenu.classList.add('hidden');
  delete els.recentContextMenu.dataset.path;
}

function openRecentContextMenu(event, filePath, missing) {
  event.preventDefault();
  event.stopPropagation();
  els.moreMenu.classList.add('hidden');
  closeAccentMenu();

  els.recentContextMenu.dataset.path = encodeURIComponent(filePath);
  const isPinned = state.pinnedRecentFiles.some(path => sameDocumentPath(path, filePath));
  const isFavorite = state.favoriteFiles.some(file => sameDocumentPath(file.path, filePath));
  const pinButton = $('#pinContextAction');
  pinButton.classList.toggle('hidden', state.sidebarMode !== 'recent');
  pinButton.dataset.pinState = isPinned ? 'remove' : 'add';
  $('#pinContextLabel').textContent = t(isPinned ? 'unpinRecent' : 'pinRecent');
  const favoriteButton = $('#favoriteContextAction');
  favoriteButton.dataset.favoriteState = isFavorite ? 'remove' : 'add';
  $('#favoriteContextLabel').textContent = t(isFavorite ? 'unfavoriteDocument' : 'favoriteDocument');
  $('#recentRemoveDivider').classList.toggle('hidden', state.sidebarMode !== 'recent');
  $('#recentRemoveAction').classList.toggle('hidden', state.sidebarMode !== 'recent');
  els.recentContextMenu.querySelectorAll('[data-recent-action]').forEach(button => {
    const pinRemoval = button.dataset.recentAction === 'pin' && isPinned;
    const favoriteRemoval = button.dataset.recentAction === 'favorite' && isFavorite;
    const disabled = pinMutationInProgress
      || (missing && button.dataset.recentAction !== 'remove' && !pinRemoval && !favoriteRemoval);
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));
  });
  els.recentContextMenu.classList.remove('hidden');

  const menuRect = els.recentContextMenu.getBoundingClientRect();
  const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuRect.width - 8));
  const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuRect.height - 8));
  els.recentContextMenu.style.left = `${left}px`;
  els.recentContextMenu.style.top = `${top}px`;
  requestAnimationFrame(() => els.recentContextMenu.querySelector('button:not(:disabled)')?.focus());
}

function toggleAccentMenu() {
  const opening = els.accentMenu.classList.contains('hidden');
  els.moreMenu.classList.add('hidden');
  closeRecentContextMenu();
  els.accentMenu.classList.toggle('hidden', !opening);
  $('#accentButton').setAttribute('aria-expanded', String(opening));
  if (opening) requestAnimationFrame(() => els.accentMenu.querySelector('[aria-checked="true"]')?.focus());
}

function syncFontScaleOptions() {
  const automaticScale = recommendedFontScale(currentDisplay());
  const percent = Math.round(state.fontScale * 100);
  const automaticValue = $('#fontScaleAutoValue');
  if (automaticValue) automaticValue.textContent = `${Math.round(automaticScale * 100)}%`;
  if (els.fontScaleSlider) {
    els.fontScaleSlider.value = String(percent);
    els.fontScaleSlider.style.setProperty('--font-scale-progress', `${Math.max(0, Math.min(100, (percent - 82) / 118 * 100))}%`);
    els.fontScaleSlider.setAttribute('aria-valuetext', `${percent}%`);
  }
  if (els.fontScaleValue) els.fontScaleValue.textContent = `${percent}%`;
  document.querySelectorAll('#moreMenu button[data-font-scale]').forEach(button => {
    const automatic = button.dataset.fontScale === 'auto';
    const active = automatic
      ? state.fontScaleMode === 'auto'
      : state.fontScaleMode === 'manual' && Math.abs(Number(button.dataset.fontScale) - state.fontScale) < 0.001;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
}

function setFontScale(scale, silent = false, mode = 'manual') {
  state.fontScale = clampFontScale(scale);
  state.fontScaleMode = mode === 'auto' ? 'auto' : 'manual';
  document.documentElement.style.setProperty('--font-scale', state.fontScale);
  localStorage.setItem('fontScale', state.fontScale);
  localStorage.setItem('fontScaleMode', state.fontScaleMode);
  applyTocDisplayStyles();
  scheduleActiveTocRefresh();
  syncFontScaleOptions();
  if (!silent) showToast(t('bodyFontScale', { percent: Math.round(state.fontScale * 100) }));
}

function enableAutomaticFontScale(silent = false) {
  const scale = recommendedFontScale(currentDisplay());
  setFontScale(scale, true, 'auto');
  if (!silent) showToast(t('autoFontScaleEnabled', { percent: Math.round(scale * 100) }));
}

let automaticFontScaleTimer;
function scheduleAutomaticFontScaleRefresh() {
  if (state.fontScaleMode !== 'auto') return;
  clearTimeout(automaticFontScaleTimer);
  automaticFontScaleTimer = setTimeout(() => enableAutomaticFontScale(true), 180);
}

function normalizeDocWidth(value) {
  return DOC_WIDTH_LEVELS.includes(value) ? value : 'medium';
}

function setDocumentWidth(level, silent = false) {
  state.docWidth = normalizeDocWidth(level);
  document.body.dataset.docWidth = state.docWidth;
  localStorage.setItem('docWidth', state.docWidth);
  document.querySelectorAll('#moreMenu button[data-doc-width]').forEach(button => {
    const active = button.dataset.docWidth === state.docWidth;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  if (!silent) showToast(t('docWidthChanged', { level: t(`width${state.docWidth.charAt(0).toUpperCase()}${state.docWidth.slice(1)}`) }));
}

function handlePreviewWheelZoom(event) {
  const direction = previewWheelZoomDirection({
    platform: document.documentElement.dataset.platform,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    deltaY: event.deltaY,
  });
  if (!direction) return;
  event.preventDefault();
  setFontScale(state.fontScale + direction * .08);
}

function fileIcon() {
  return '<svg viewBox="0 0 24 24"><path d="M6 3.5h8l4 4v13H6v-17Z"/><path d="M14 3.5v4h4M9 12h6M9 15h6"/></svg>';
}

function recentEntry(doc) {
  return { path: doc.path, name: doc.name, directory: doc.directory || directoryFromDocumentPath(doc.path), exists: true };
}

function recentFilesFromPreferences(prefs) {
  return filesFromPreferencePaths(prefs.recentFiles, prefs.recentFileStatuses);
}

function favoriteFilesFromPreferences(prefs) {
  return filesFromPreferencePaths(prefs.favoriteFiles, prefs.favoriteFileStatuses);
}

function applyRecentPartition(partition) {
  state.recentFiles = partition.files;
  state.pinnedRecentFiles = partition.pinnedPaths;
  if (state.sidebarMode === 'recent') state.files = [...state.recentFiles];
}

function applyLibraryPreferences(prefs) {
  applyRecentPartition(partitionRecentFiles(
    recentFilesFromPreferences(prefs),
    prefs.pinnedRecentFiles || [],
  ));
  state.favoriteFiles = favoriteFilesFromPreferences(prefs);
  if (state.sidebarMode === 'favorites') state.files = [...state.favoriteFiles];
}

async function refreshLibraryFileStatuses() {
  try {
    applyLibraryPreferences(await window.quilliteMarkdown.getPreferences());
    renderFileList();
    return true;
  } catch (error) {
    console.warn('Unable to refresh library file statuses', error);
    return false;
  }
}

function addRecentDocument(doc) {
  applyRecentPartition(upsertRecentFile(
    state.recentFiles,
    state.pinnedRecentFiles,
    recentEntry(doc),
  ));
}

function recentLibrarySnapshot() {
  return {
    recentFiles: [...state.recentFiles],
    pinnedRecentFiles: [...state.pinnedRecentFiles],
  };
}

function restoreRecentLibrary(snapshot) {
  applyRecentPartition(partitionRecentFiles(snapshot.recentFiles, snapshot.pinnedRecentFiles));
}

function syncPinnedPathsFromPreferences(prefs) {
  if (!Array.isArray(prefs?.pinnedRecentFiles)) return false;
  applyRecentPartition(partitionRecentFiles(state.recentFiles, prefs.pinnedRecentFiles));
  return true;
}

function samePathOrder(left, right) {
  return left.length === right.length && left.every((path, index) => sameDocumentPath(path, right[index]));
}

function focusPinnedHandle(filePath) {
  requestAnimationFrame(() => {
    const handle = [...els.fileList.querySelectorAll('.pin-drag-handle')]
      .find(candidate => sameDocumentPath(decodeURIComponent(candidate.dataset.path), filePath));
    handle?.focus();
  });
}

async function persistPinnedMutation({ snapshot, optimistic, save, errorKey, successKey, successAnnouncement, expectedState, noOpKey, focusPath }) {
  if (pinMutationInProgress) return false;
  pinMutationInProgress = true;
  applyRecentPartition(optimistic);
  renderFileList();
  if (focusPath) focusPinnedHandle(focusPath);
  try {
    const savedPreferences = await save(optimistic.pinnedPaths);
    const backendStateApplied = syncPinnedPathsFromPreferences(savedPreferences);
    const refreshed = await refreshLibraryFileStatuses();
    if (expectedState && ((!backendStateApplied && !refreshed) || !expectedState())) {
      showToast(t(noOpKey || errorKey), 'warning');
      return false;
    }
    if (successKey) showToast(t(successKey), 'success');
    const announcement = successAnnouncement?.();
    if (announcement) showToast(announcement, 'info');
    return true;
  } catch (error) {
    reportSilentError(error, 'library.pinned-recent');
    console.warn('Unable to persist pinned recent documents', error);
    restoreRecentLibrary(snapshot);
    renderFileList();
    await refreshLibraryFileStatuses();
    showToast(t(errorKey), 'error');
    return false;
  } finally {
    pinMutationInProgress = false;
    renderFileList();
    if (focusPath) focusPinnedHandle(focusPath);
  }
}

async function setRecentPinnedRecord(filePath, shouldPin) {
  if (pinMutationInProgress) return false;
  const snapshot = recentLibrarySnapshot();
  const optimistic = shouldPin
    ? pinRecentFile(state.recentFiles, state.pinnedRecentFiles, filePath)
    : unpinRecentFile(state.recentFiles, state.pinnedRecentFiles, filePath);
  if (samePathOrder(optimistic.pinnedPaths, snapshot.pinnedRecentFiles)) return true;
  return persistPinnedMutation({
    snapshot,
    optimistic,
    save: () => window.quilliteMarkdown.setRecentPinned(filePath, shouldPin),
    errorKey: 'pinRecentSaveFailed',
    expectedState: () => state.pinnedRecentFiles.some(path => sameDocumentPath(path, filePath)) === shouldPin,
    noOpKey: shouldPin ? 'pinRecentUnavailable' : 'pinRecentSaveFailed',
    successKey: shouldPin ? 'pinRecentAdded' : 'pinRecentRemoved',
    focusPath: shouldPin ? filePath : '',
  });
}

async function removeRecentRecord(filePath) {
  await window.quilliteMarkdown.removeRecent(filePath);
  applyRecentPartition(partitionRecentFiles(
    state.recentFiles.filter(file => !sameDocumentPath(file.path, filePath)),
    state.pinnedRecentFiles.filter(path => !sameDocumentPath(path, filePath)),
  ));
  renderFileList();
  await refreshLibraryFileStatuses();
  showToast(t('recentRemoved'), 'success');
}

async function setFavoriteRecord(filePath, shouldFavorite) {
  if (shouldFavorite) await window.quilliteMarkdown.addFavorite(filePath);
  else await window.quilliteMarkdown.removeFavorite(filePath);
  applyLibraryPreferences(await window.quilliteMarkdown.getPreferences());
  renderFileList();
  showToast(t(shouldFavorite ? 'favoriteAdded' : 'favoriteRemoved'), 'success');
}

function updateLibraryHeading() {
  if (state.sidebarMode === 'explorer') {
    els.libraryName.textContent = state.root ? state.root.split(/[\\/]/).pop() : t('resourceExplorer');
  } else {
    els.libraryName.textContent = t(state.sidebarMode === 'favorites' ? 'favoriteDocuments' : 'recentReading');
  }
}

function setSidebarMode(mode) {
  state.sidebarMode = normalizeSidebarMode(mode);
  localStorage.setItem('sidebarMode', state.sidebarMode);
  const explorer = state.sidebarMode === 'explorer';
  const favorites = state.sidebarMode === 'favorites';
  state.files = explorer ? [...state.explorerFiles] : favorites ? [...state.favoriteFiles] : [...state.recentFiles];
  els.recentTab.classList.toggle('active', state.sidebarMode === 'recent');
  els.favoritesTab.classList.toggle('active', favorites);
  els.explorerTab.classList.toggle('active', explorer);
  els.recentTab.setAttribute('aria-selected', String(state.sidebarMode === 'recent'));
  els.favoritesTab.setAttribute('aria-selected', String(favorites));
  els.explorerTab.setAttribute('aria-selected', String(explorer));
  els.refreshExplorer.classList.toggle('hidden', !explorer || !state.root);
  updateLibraryHeading();
  renderFileList();
}

function pathIsInsideRoot(filePath) {
  if (!state.root || !filePath) return false;
  const root = state.root.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const target = filePath.replace(/\\/g, '/').toLowerCase();
  return target === root || target.startsWith(`${root}/`);
}

async function refreshExplorer() {
  if (!state.root) {
    await openFolder();
    return;
  }
  try {
    const previousMode = state.sidebarMode;
    const folder = await window.quilliteMarkdown.listFolder(state.root);
    state.explorerFiles = folder?.files || [];
    setSidebarMode(previousMode);
  } catch (error) {
    reportSilentError(error, 'folder.refresh');
    console.error(error);
    showToast(t('folderOpenFailed'), 'error');
  }
}

function restoreExplorerAfterFirstPaint(savedRoot) {
  if (!savedRoot) return;
  requestAnimationFrame(() => requestAnimationFrame(async () => {
    if (state.root !== savedRoot) return;
    try {
      const folder = await window.quilliteMarkdown.listFolder(savedRoot);
      if (state.root !== savedRoot) return;
      state.root = folder?.root || savedRoot;
      state.explorerFiles = folder?.files || [];
      if (state.sidebarMode === 'explorer') setSidebarMode('explorer');
    } catch (error) {
      console.warn('Unable to restore resource explorer folder', error);
      if (state.root === savedRoot) {
        state.root = null;
        state.explorerFiles = [];
        setSidebarMode('recent');
      }
    }
  }));
}

function renderFileRow(file, pinned = false) {
  const encodedPath = encodeURIComponent(file.path);
  const active = sameDocumentPath(state.currentFile?.path, file.path) ? ' active' : '';
  const missing = state.sidebarMode !== 'explorer' && file.exists === false;
  const favorited = state.favoriteFiles.some(favorite => sameDocumentPath(favorite.path, file.path));
  const sub = state.sidebarMode === 'explorer'
    ? (file.directory && file.directory !== '.' ? file.directory : t('markdownDocument'))
    : missing
      ? t('recentMissing')
      : state.sidebarMode === 'favorites'
        ? t('favorited')
        : (file.directory || directoryFromDocumentPath(file.path));
  const favoriteMarker = favorited
    ? `<span class="favorite-marker" title="${escapeHtml(t('favorited'))}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg></span>`
    : '';
  const pinMarker = pinned
    ? `<span class="pin-marker" title="${escapeHtml(t('pinnedRecent'))}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 3h8l-1 5 3 3v2H6v-2l3-3-1-5Z"/><path d="M12 13v8"/></svg></span>`
    : '';
  const itemAttributes = missing
    ? ` aria-disabled="true" data-missing="true" title="${escapeHtml(t('recentMissingTitle'))}" aria-label="${escapeHtml(t('recentMissingAria', { name: file.name }))}"`
    : ` title="${escapeHtml(t('recentContextHint'))}"`;
  const pinHandle = pinned
    ? `<button class="pin-drag-handle" type="button" data-path="${encodedPath}" aria-label="${escapeHtml(t('reorderPinnedRecent', { name: file.name }))}" title="${escapeHtml(t('reorderPinnedRecent', { name: file.name }))}" aria-keyshortcuts="ArrowUp ArrowDown Escape"${pinMutationInProgress ? ' disabled aria-disabled="true"' : ''}><svg viewBox="0 0 18 24" aria-hidden="true"><circle cx="6" cy="7" r="1.35"/><circle cx="12" cy="7" r="1.35"/><circle cx="6" cy="12" r="1.35"/><circle cx="12" cy="12" r="1.35"/><circle cx="6" cy="17" r="1.35"/><circle cx="12" cy="17" r="1.35"/></svg></button>`
    : '';
  return `<div class="file-row${pinned ? ' pinned' : ''}${missing ? ' missing' : ''}" data-path="${encodedPath}">${pinHandle}<button class="file-item${active}" data-path="${encodedPath}"${itemAttributes}><span class="file-icon">${fileIcon()}</span><span class="file-copy"><span class="file-title-line">${pinMarker}${favoriteMarker}<strong>${escapeHtml(file.name)}</strong></span><small title="${escapeHtml(sub)}">${escapeHtml(sub)}</small></span></button></div>`;
}

function renderRecentFileGroups() {
  const partition = partitionRecentFiles(state.recentFiles, state.pinnedRecentFiles);
  if (!partition.pinnedFiles.length) return partition.ordinaryFiles.map(file => renderFileRow(file)).join('');
  const pinnedLabel = escapeHtml(t('pinnedRecentGroup'));
  const ordinaryLabel = escapeHtml(t('ordinaryRecentGroup'));
  const pinnedGroup = `<div class="recent-file-group pinned-file-group" role="group" aria-label="${pinnedLabel}"><div class="recent-group-label">${pinnedLabel}</div><div class="pinned-file-list" data-pinned-list>${partition.pinnedFiles.map(file => renderFileRow(file, true)).join('')}</div></div>`;
  const ordinaryGroup = `<div class="recent-file-group ordinary-file-group" role="group" aria-label="${ordinaryLabel}"><div class="recent-group-label">${ordinaryLabel}</div>${partition.ordinaryFiles.map(file => renderFileRow(file)).join('')}</div>`;
  return pinnedGroup + ordinaryGroup;
}

function pinnedPathsFromDOM(container) {
  return [...container.querySelectorAll(':scope > .file-row.pinned')]
    .map(row => decodeURIComponent(row.dataset.path));
}

function updatePinnedInsertion(drag) {
  const insertionPoint = [...drag.container.querySelectorAll(':scope > .file-row.pinned:not(.dragging)')]
    .find(row => drag.pointerY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
  drag.container.insertBefore(drag.row, insertionPoint || null);
}

function pinnedAutoScrollVelocity(drag) {
  const listRect = els.fileList.getBoundingClientRect();
  const pinnedRect = drag.container.getBoundingClientRect();
  const visibleTop = Math.max(listRect.top, pinnedRect.top);
  const visibleBottom = Math.min(listRect.bottom, pinnedRect.bottom);
  if (visibleBottom <= visibleTop) return 0;
  if (pinnedRect.top < listRect.top && drag.pointerY < visibleTop + PIN_AUTO_SCROLL_EDGE) {
    const strength = Math.min(1, (visibleTop + PIN_AUTO_SCROLL_EDGE - drag.pointerY) / PIN_AUTO_SCROLL_EDGE);
    return -Math.max(1, Math.ceil(PIN_AUTO_SCROLL_MAX_SPEED * strength));
  }
  if (pinnedRect.bottom > listRect.bottom && drag.pointerY > visibleBottom - PIN_AUTO_SCROLL_EDGE) {
    const strength = Math.min(1, (drag.pointerY - visibleBottom + PIN_AUTO_SCROLL_EDGE) / PIN_AUTO_SCROLL_EDGE);
    return Math.max(1, Math.ceil(PIN_AUTO_SCROLL_MAX_SPEED * strength));
  }
  return 0;
}

function runPinnedAutoScroll(drag) {
  drag.autoScrollFrame = 0;
  if (pinnedPointerDrag !== drag || !drag.active) return;
  const velocity = pinnedAutoScrollVelocity(drag);
  if (!velocity) return;
  const previousScrollTop = els.fileList.scrollTop;
  els.fileList.scrollTop += velocity;
  if (els.fileList.scrollTop === previousScrollTop) return;
  updatePinnedInsertion(drag);
  drag.autoScrollFrame = requestAnimationFrame(() => runPinnedAutoScroll(drag));
}

function schedulePinnedAutoScroll(drag) {
  if (!drag.autoScrollFrame) drag.autoScrollFrame = requestAnimationFrame(() => runPinnedAutoScroll(drag));
}

function cleanupPinnedPointerDrag(drag) {
  window.removeEventListener('pointermove', handlePinnedPointerMove);
  window.removeEventListener('pointerup', handlePinnedPointerUp);
  window.removeEventListener('pointercancel', handlePinnedPointerCancel);
  drag.captureTarget.removeEventListener('lostpointercapture', handlePinnedLostPointerCapture);
  drag.row.classList.remove('dragging', 'pin-insertion-position');
  drag.handle.classList.remove('grabbing');
  drag.container.classList.remove('reordering');
  document.body.classList.remove('reordering-pins');
  cancelAnimationFrame(drag.autoScrollFrame);
  if (drag.captureTarget.hasPointerCapture?.(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId);
}

function cancelPinnedPointerReorder() {
  const drag = pinnedPointerDrag;
  if (!drag) return false;
  pinnedPointerDrag = null;
  cleanupPinnedPointerDrag(drag);
  renderFileList();
  focusPinnedHandle(drag.filePath);
  return true;
}

function handlePinnedPointerMove(event) {
  const drag = pinnedPointerDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.active) {
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance < PIN_DRAG_THRESHOLD) return;
    drag.active = true;
    drag.captureTarget.setPointerCapture?.(event.pointerId);
    drag.row.classList.add('dragging', 'pin-insertion-position');
    drag.handle.classList.add('grabbing');
    drag.container.classList.add('reordering');
    document.body.classList.add('reordering-pins');
  }
  event.preventDefault();
  drag.pointerY = event.clientY;
  updatePinnedInsertion(drag);
  schedulePinnedAutoScroll(drag);
}

function finishPinnedPointerReorder() {
  const drag = pinnedPointerDrag;
  if (!drag) return;
  const requestedPaths = drag.active ? pinnedPathsFromDOM(drag.container) : drag.snapshot.pinnedRecentFiles;
  pinnedPointerDrag = null;
  cleanupPinnedPointerDrag(drag);
  if (drag.active) {
    suppressPinnedFileClickPath = drag.filePath;
    suppressPinnedFileClickUntil = performance.now() + 350;
    setTimeout(() => {
      if (sameDocumentPath(suppressPinnedFileClickPath, drag.filePath) && performance.now() >= suppressPinnedFileClickUntil) {
        suppressPinnedFileClickPath = '';
        suppressPinnedFileClickUntil = 0;
      }
    }, 400);
  }
  if (!drag.active || samePathOrder(requestedPaths, drag.snapshot.pinnedRecentFiles)) return;
  const optimistic = reorderPinnedRecentFiles(state.recentFiles, state.pinnedRecentFiles, requestedPaths);
  void persistPinnedMutation({
    snapshot: drag.snapshot,
    optimistic,
    save: paths => window.quilliteMarkdown.reorderPinnedRecent(paths),
    errorKey: 'pinnedOrderSaveFailed',
    focusPath: drag.filePath,
  });
}

function handlePinnedPointerUp(event) {
  if (event.pointerId === pinnedPointerDrag?.pointerId) finishPinnedPointerReorder();
}

function handlePinnedPointerCancel(event) {
  if (event.pointerId === pinnedPointerDrag?.pointerId) cancelPinnedPointerReorder();
}

function handlePinnedLostPointerCapture(event) {
  if (event.pointerId === pinnedPointerDrag?.pointerId) cancelPinnedPointerReorder();
}

function beginPinnedPointerReorder(event) {
  if (event.button !== 0 || pinMutationInProgress || pinnedPointerDrag) return;
  const row = event.currentTarget;
  const handle = row.querySelector('.pin-drag-handle');
  const container = row.closest('[data-pinned-list]');
  if (!handle || !container) return;
  const captureTarget = els.fileList;
  pinnedPointerDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    pointerY: event.clientY,
    filePath: decodeURIComponent(row.dataset.path),
    handle,
    captureTarget,
    row,
    container,
    snapshot: recentLibrarySnapshot(),
    active: false,
    autoScrollFrame: 0,
  };
  window.addEventListener('pointermove', handlePinnedPointerMove);
  window.addEventListener('pointerup', handlePinnedPointerUp);
  window.addEventListener('pointercancel', handlePinnedPointerCancel);
  captureTarget.addEventListener('lostpointercapture', handlePinnedLostPointerCapture);
}

function handlePinnedKeyboardReorder(event) {
  if (event.key === 'Escape' && cancelPinnedPointerReorder()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || pinMutationInProgress) return;
  event.preventDefault();
  event.stopPropagation();
  const filePath = decodeURIComponent(event.currentTarget.dataset.path);
  const fileName = state.recentFiles.find(file => sameDocumentPath(file.path, filePath))?.name || filePath.split(/[\\/]/).pop();
  const currentIndex = state.pinnedRecentFiles.findIndex(path => sameDocumentPath(path, filePath));
  const nextIndex = currentIndex + (event.key === 'ArrowUp' ? -1 : 1);
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= state.pinnedRecentFiles.length) return;
  const requestedPaths = [...state.pinnedRecentFiles];
  [requestedPaths[currentIndex], requestedPaths[nextIndex]] = [requestedPaths[nextIndex], requestedPaths[currentIndex]];
  const snapshot = recentLibrarySnapshot();
  const optimistic = reorderPinnedRecentFiles(state.recentFiles, state.pinnedRecentFiles, requestedPaths);
  void persistPinnedMutation({
    snapshot,
    optimistic,
    save: paths => window.quilliteMarkdown.reorderPinnedRecent(paths),
    errorKey: 'pinnedOrderSaveFailed',
    successAnnouncement: () => {
      const position = state.pinnedRecentFiles.findIndex(path => sameDocumentPath(path, filePath));
      return position < 0 ? '' : t('pinnedOrderPosition', {
        name: fileName,
        position: position + 1,
        total: state.pinnedRecentFiles.length,
      });
    },
    focusPath: filePath,
  });
}

function initializePinnedFileInteractions() {
  els.fileList.querySelectorAll('.file-row.pinned').forEach(row => {
    row.addEventListener('pointerdown', beginPinnedPointerReorder);
  });
  els.fileList.querySelectorAll('.pin-drag-handle').forEach(handle => {
    handle.addEventListener('keydown', handlePinnedKeyboardReorder);
  });
}

function renderFileList() {
  closeRecentContextMenu();
  if (!state.files.length) {
    const emptyKey = state.sidebarMode === 'explorer' ? 'emptyExplorer' : state.sidebarMode === 'favorites' ? 'emptyFavorites' : 'emptyRecent';
    els.fileList.innerHTML = `<div class="empty-list">${t(emptyKey)}</div>`;
    return;
  }
  els.fileList.innerHTML = state.sidebarMode === 'recent'
    ? renderRecentFileGroups()
    : state.files.map(file => renderFileRow(file)).join('');
  els.fileList.querySelectorAll('.file-item').forEach(button => {
    button.addEventListener('click', event => {
      if (button.dataset.missing === 'true') return;
      const filePath = decodeURIComponent(button.dataset.path);
      if (suppressPinnedFileClickPath && performance.now() < suppressPinnedFileClickUntil && sameDocumentPath(suppressPinnedFileClickPath, filePath)) {
        suppressPinnedFileClickPath = '';
        suppressPinnedFileClickUntil = 0;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      loadFile(filePath);
    });
  });
  els.fileList.querySelectorAll('.file-row').forEach(row => {
    row.addEventListener('contextmenu', event => {
      openRecentContextMenu(event, decodeURIComponent(row.dataset.path), row.classList.contains('missing'));
    });
  });
  initializePinnedFileInteractions();
}

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

async function revealFileInFolder(filePath) {
  try {
    await window.quilliteMarkdown.showInFolder(filePath);
  } catch (error) {
    console.warn('Unable to show file in folder', error);
    showToast(t('recentRevealFailed'), 'error');
  }
}

async function editRecentDocument(filePath) {
  if (!maybeDiscardChanges()) return;
  try {
    displayDocument(await window.quilliteMarkdown.openRecentFile(filePath));
    await toggleEditor(true);
  } catch (error) {
    if (isMissingDocumentError(error)) {
      await refreshLibraryFileStatuses();
      showToast(t('recentMissingTitle'), 'warning');
      return;
    }
    if (isMacAccessNotGrantedError(error)) {
      showToast(t('macAccessNotGranted'), 'warning');
      return;
    }
    reportSilentError(error, 'document.open-recent');
    showToast(t('openFailed'), 'error');
    console.error(error);
  }
}

function renderToc() {
  const headings = [...els.content.querySelectorAll('h1, h2, h3, h4, h5, h6')];
  headings.forEach((heading, index) => heading.id = slugify(heading.textContent, index));
  const tree = buildTocTree(headings.map(heading => ({
    id: heading.id,
    text: heading.textContent,
    level: Number(heading.tagName.slice(1))
  })));
  const collapsed = readCollapsedToc(localStorage, state.currentFile?.path);
  const renderNodes = nodes => `<ul class="toc-tree">${nodes.map(node => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = hasChildren && collapsed.has(node.id);
    const title = escapeHtml(node.text);
    const toggle = hasChildren
      ? `<button type="button" class="toc-toggle" data-toc-toggle="${escapeHtml(node.id)}" aria-expanded="${String(!isCollapsed)}" aria-label="${escapeHtml(t(isCollapsed ? 'expandTocSection' : 'collapseTocSection', { title: node.text }))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>`
      : '<span class="toc-toggle-placeholder" aria-hidden="true"></span>';
    const children = hasChildren
      ? `<div class="toc-children${isCollapsed ? ' hidden' : ''}">${renderNodes(node.children)}</div>`
      : '';
    return `<li class="toc-node level-${node.level}${isCollapsed ? ' collapsed' : ''}" data-toc-node="${escapeHtml(node.id)}"><div class="toc-row">${toggle}<a href="#${escapeHtml(node.id)}" data-target="${escapeHtml(node.id)}">${title}</a></div>${children}</li>`;
  }).join('')}</ul>`;
  els.toc.innerHTML = renderNodes(tree);
  els.tocPanel.classList.toggle('hidden', headings.length < 2);
  updatePaneResizerVisibility();
  applyPaneWidths();
  els.toc.querySelectorAll('[data-toc-toggle]').forEach(button => button.addEventListener('click', () => {
    const node = button.closest('.toc-node');
    const children = node?.querySelector(':scope > .toc-children');
    if (!node || !children) return;
    const isCollapsed = node.classList.toggle('collapsed');
    children.classList.toggle('hidden', isCollapsed);
    button.setAttribute('aria-expanded', String(!isCollapsed));
    button.setAttribute('aria-label', t(isCollapsed ? 'expandTocSection' : 'collapseTocSection', {
      title: node.querySelector(':scope > .toc-row a')?.textContent || ''
    }));
    if (isCollapsed) collapsed.add(node.dataset.tocNode);
    else collapsed.delete(node.dataset.tocNode);
    writeCollapsedToc(localStorage, state.currentFile?.path, collapsed);
  }));
  els.toc.querySelectorAll('a').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const heading = document.getElementById(link.dataset.target);
    const reader = $('.reader-pane');
    if (!heading || !reader) return;
    const top = reader.scrollTop + heading.getBoundingClientRect().top - reader.getBoundingClientRect().top - 28;
    reader.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    els.toc.querySelectorAll('a').forEach(item => item.classList.toggle('active', item === link));
  }));
  updateActiveToc();
}

function updateActiveToc() {
  const headings = [...els.content.querySelectorAll('h1, h2, h3, h4, h5, h6')];
  const reader = $('.reader-pane');
  const max = reader.scrollHeight - reader.clientHeight;
  let active = headings[0];
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= reader.getBoundingClientRect().top + 42) active = heading;
  }
  if (max > 0 && reader.scrollTop >= max - 2) active = headings.at(-1);
  let activeLink = null;
  els.toc.querySelectorAll('.toc-node').forEach(node => node.classList.remove('contains-active'));
  els.toc.querySelectorAll('a').forEach(a => {
    const isActive = active && a.dataset.target === active.id;
    a.classList.toggle('active', isActive);
    if (isActive) activeLink = a;
  });
  let activeNode = activeLink?.closest('.toc-node');
  while (activeNode) {
    activeNode.classList.add('contains-active');
    activeNode = activeNode.parentElement?.closest('.toc-node');
  }
  if (activeLink && !activeLink.closest('.toc-children.hidden')) {
    const linkRect = activeLink.getBoundingClientRect();
    const panelRect = els.tocPanel.getBoundingClientRect();
    const viewportTop = panelRect.top + els.tocPanel.clientTop;
    const viewportBottom = viewportTop + els.tocPanel.clientHeight;
    const scrollDelta = scrollDeltaForBounds({
      itemTop: linkRect.top,
      itemBottom: linkRect.bottom,
      viewportTop,
      viewportBottom,
    });
    if (scrollDelta) els.tocPanel.scrollTop += scrollDelta;
  }
  const progress = max > 0 ? (reader.scrollTop / max) * 100 : 100;
  els.progressBar.style.width = `${progress}%`;
  els.backToTop.classList.toggle('visible', !state.editing && reader.scrollTop > Math.min(460, reader.clientHeight * .55));
}

let activeTocRefreshFrame;
function scheduleActiveTocRefresh() {
  cancelAnimationFrame(activeTocRefreshFrame);
  activeTocRefreshFrame = requestAnimationFrame(() => {
    activeTocRefreshFrame = undefined;
    updateActiveToc();
  });
}

function updateWindowTitle() {
  const name = state.currentFile?.name || t('appName');
  document.title = `${state.dirty ? '● ' : ''}${name} · ${t('appName')}`;
}

function setDirty(dirty) {
  state.dirty = Boolean(dirty);
  window.quilliteMarkdown.setDirty(state.dirty);
  els.editorSaveState.textContent = t(state.dirty ? 'unsaved' : 'saved');
  els.editorSaveState.classList.toggle('dirty', state.dirty);
  updateWindowTitle();
}

function maybeDiscardChanges() {
  if (!state.dirty) return true;
  return window.confirm(t('discardConfirm'));
}

function mermaidPreviewThemeKey() {
  const root = document.documentElement;
  return `${root.dataset.colorMode || 'light'}|${root.dataset.accent || 'green'}`;
}

function reusableMermaidDiagrams(container, themeKey) {
  const reusable = new Map();
  container.querySelectorAll('.mermaid-diagram[data-mermaid-rendered="true"]').forEach(diagram => {
    if (diagram.dataset.mermaidUiTheme !== themeKey) return;
    const source = diagram.dataset.mermaidSource || '';
    if (!source || !diagram.querySelector('svg')) return;
    const matches = reusable.get(source) || [];
    matches.push({
      html: diagram.innerHTML,
      type: diagram.dataset.mermaidType || ''
    });
    reusable.set(source, matches);
  });
  return reusable;
}

function restoreReusableMermaidDiagrams(container, reusable, themeKey) {
  container.querySelectorAll('.mermaid-diagram').forEach(diagram => {
    diagram.dataset.mermaidUiTheme = themeKey;
    const matches = reusable.get(diagram.dataset.mermaidSource || '');
    const snapshot = matches?.shift();
    if (!snapshot) return;
    diagram.innerHTML = snapshot.html;
    diagram.dataset.mermaidRendered = 'true';
    if (snapshot.type) diagram.dataset.mermaidType = snapshot.type;
  });
}

function reusableEChartsDiagrams(container, themeKey) {
  const reusable = new Map();
  container.querySelectorAll('.echarts-diagram[data-echarts-rendered="true"]').forEach(diagram => {
    if (diagram.dataset.echartsUiTheme !== themeKey) return;
    const source = diagram.dataset.echartsSource || '';
    if (!source || !diagram.querySelector('svg')) return;
    const matches = reusable.get(source) || [];
    matches.push({ html: diagram.innerHTML, height: diagram.style.height });
    reusable.set(source, matches);
  });
  return reusable;
}

function restoreReusableEChartsDiagrams(container, reusable, themeKey) {
  container.querySelectorAll('.echarts-diagram').forEach(diagram => {
    diagram.dataset.echartsUiTheme = themeKey;
    const matches = reusable.get(diagram.dataset.echartsSource || '');
    const snapshot = matches?.shift();
    if (!snapshot) return;
    diagram.innerHTML = snapshot.html;
    diagram.style.height = snapshot.height;
    diagram.dataset.echartsRendered = 'true';
  });
}

function renderMarkdownTo(container, doc, content) {
  if (isPlainTextFile(doc.path)) {
    container.innerHTML = `<div class="plain-text">${escapeHtml(content)}</div>`;
    return Promise.resolve();
  }
  // Rebuilding the preview used to discard every finished Mermaid SVG. On a
  // long diagram document this replaced all charts with short placeholders,
  // so the scroll position jumped to an earlier section while Mermaid slowly
  // rendered everything again. Reuse unchanged, already-sanitised SVGs in
  // their original order; only the diagram currently being edited is redrawn.
  const mermaidThemeKey = mermaidPreviewThemeKey();
  const reusableMermaid = reusableMermaidDiagrams(container, mermaidThemeKey);
  const reusableECharts = reusableEChartsDiagrams(container, mermaidThemeKey);
  const prepared = prepareFootnotes(content);
  let html = marked.parse(prepared.markdown);
  html += renderFootnoteSection(prepared.notes, text => marked.parseInline(text), t('footnotes'));
  html = DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel', 'data-md-color'] });
  // The reusable snapshots above are plain SVG strings. Release the live
  // ECharts instances and ResizeObservers before replacing the preview DOM,
  // otherwise repeated editing of a chart-heavy document gradually retains
  // detached observers and makes typing/scrolling feel sluggish.
  releaseEChartsDiagrams(container);
  container.innerHTML = html;
  restoreReusableMermaidDiagrams(container, reusableMermaid, mermaidThemeKey);
  restoreReusableEChartsDiagrams(container, reusableECharts, mermaidThemeKey);
  const diagramRender = Promise.all([
    renderMermaidDiagrams(container, {
      diagramLabel: t('mermaidDiagram'),
      errorTitle: t('mermaidRenderError'),
      errorHint: t('mermaidRenderHint')
    }).catch(error => reportSilentError(error, 'preview.render-mermaid')),
    renderEChartsDiagrams(container, {
      errorTitle: t('dataChartRenderError'),
      errorHint: t('dataChartRenderHint')
    }).catch(error => reportSilentError(error, 'preview.render-echarts'))
  ]);
  container.querySelectorAll('[data-md-color]').forEach(element => {
    const color = element.dataset.mdColor;
    const value = textColorValue(color);
    if (!value) {
      element.removeAttribute('data-md-color');
      return;
    }
    element.style.color = value;
  });
  container.querySelectorAll('img').forEach(img => {
    const markdownSrc = img.dataset.markdownSrc || img.getAttribute('src') || '';
    delete img.dataset.markdownSrc;
    if (/^(https?:|data:)/i.test(markdownSrc)) return;
    img.removeAttribute('src');
    img.classList.add('local-image-loading');
    window.quilliteMarkdown.readImageData(markdownSrc, doc.directory).then(dataUrl => {
      if (!img.isConnected) return;
      if (!dataUrl) throw new Error('Local image returned no data');
      img.src = dataUrl;
      img.classList.remove('local-image-loading', 'local-image-error');
    }).catch(error => {
      if (!img.isConnected) return;
      img.classList.remove('local-image-loading');
      img.classList.add('local-image-error');
      console.error(`Unable to preview local image: ${markdownSrc}`, error);
    });
  });
  bindDocumentActions(container);
  injectPreviewLineNumbers(container, prepared);
  return diagramRender;
}

// 为渲染后的每个顶层块元素注入 data-line（该块在源文档中的起始行号，1-based）。
// 编辑模式下根据 CodeMirror 光标行号找到对应块，实现预览跟随光标滚动。
function injectPreviewLineNumbers(container, prepared) {
  const starts = scanMarkdownBlockStartLines(prepared.markdown);
  const children = [...container.children].filter(el => !el.classList?.contains('footnotes'));
  if (!children.length || starts.length === 0) return;
  // 保险：顶层元素数与扫描块数偏差过大说明无法可靠对齐，放弃注入而不是错位滚动
  if (Math.abs(children.length - starts.length) > 2) return;
  const lineMap = prepared.lineMap;
  children.forEach((el, index) => {
    const processedLine = starts[index];
    if (!processedLine) return;
    const sourceLine = lineMap ? lineMap[processedLine - 1] + 1 : processedLine;
    el.dataset.line = String(sourceLine);
  });
}

function renderEditorPreview(content = state.currentFile?.content || '') {
  if (!state.currentFile) return;
  const generation = (renderEditorPreview.generation || 0) + 1;
  renderEditorPreview.generation = generation;
  try {
    const mermaidRender = renderMarkdownTo(els.editorPreview, state.currentFile, content);
    scrollPreviewToCursor(true);
    // Mermaid first appears as a short placeholder and later expands into its
    // final SVG. Positioning only before that asynchronous layout completes
    // leaves long diagram documents one or more sections above the cursor.
    // Correct after the latest render settles; two frames let the WebView
    // commit the SVG's final dimensions before measuring the target block.
    Promise.resolve(mermaidRender).then(() => {
      if (generation !== renderEditorPreview.generation || !state.editing || !codeEditor) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (generation !== renderEditorPreview.generation || !state.editing) return;
        scrollPreviewToCursor(true, 'auto');
      }));
    });
  } catch (error) {
    reportSilentError(error, 'preview.render-editor');
    els.editorPreview.innerHTML = `<p class="preview-error">${t('previewError')}</p>`;
    console.error(error);
  }
}

function renderCurrentDocument() {
  const doc = state.currentFile;
  if (!doc) return;
  try {
    renderMarkdownTo(els.content, doc, doc.content);
    els.breadcrumb.innerHTML = `<span>${escapeHtml(doc.directory)}</span><i>›</i><strong>${escapeHtml(doc.name)}</strong>`;
    const cjkCount = (doc.content.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    const latinWords = (doc.content.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
    const words = cjkCount + latinWords;
    const minutes = Math.max(1, Math.ceil(words / 300));
    els.readingTime.textContent = t('readingTime', {
      minutes,
      words: words.toLocaleString(state.language === 'en' ? 'en-US' : 'zh-CN')
    });
    renderToc();
    renderFileList();
  } catch (error) {
    reportSilentError(error, 'preview.render-document');
    showToast(t('renderFailed'), 'error');
    console.error(error);
  }
}

function displayDocument(doc, { addToLibrary = true } = {}) {
  if (!doc?.path) return;
  state.currentFile = doc;
  missingCurrentFilePath = '';
  state.savedContent = doc.content;
  state.saveAsRequired = false;
  state.saveWarningShown = false;
  if (addToLibrary) addRecentDocument(doc);
  state.editing = false;
  replaceEditorContent(doc.content, true);
  renderEditorPreview(doc.content);
  els.editorFileName.textContent = doc.name;
  els.welcome.classList.add('hidden');
  els.editorView.classList.add('hidden');
  els.documentView.classList.remove('hidden');
  const readOnly = Boolean(doc.readOnly);
  els.documentView.classList.toggle('reference-document', readOnly);
  els.editButton.disabled = readOnly;
  els.saveButton.disabled = readOnly;
  els.editButton.title = readOnly ? t('referenceReadOnlyTitle') : t('toggleEditorTitle');
  els.saveButton.title = readOnly ? t('referenceReadOnlyTitle') : t('saveTitle');
  els.editButton.classList.remove('active');
  els.editButtonLabel.textContent = t('edit');
  renderCurrentDocument();
  setDirty(false);
  $('.reader-pane').scrollTo({ top: 0 });
}

function closePreview() {
  if (!maybeDiscardChanges()) return;
  closeSearch();
  closeDocumentActionsMenu();
  releaseEChartsDiagrams(els.content);
  state.currentFile = null;
  state.editing = false;
  state.savedContent = '';
  state.saveAsRequired = false;
  state.saveWarningShown = false;
  missingCurrentFilePath = '';
  replaceEditorContent('', true);
  els.content.replaceChildren();
  els.breadcrumb.replaceChildren();
  els.toc.replaceChildren();
  els.readingTime.textContent = '';
  els.progressBar.style.width = '0%';
  els.documentView.classList.add('hidden');
  els.documentView.classList.remove('reference-document');
  els.editorView.classList.add('hidden');
  els.tocPanel.classList.add('hidden');
  els.welcome.classList.remove('hidden');
  els.editButton.disabled = true;
  els.saveButton.disabled = true;
  els.editButton.classList.remove('active');
  els.editButtonLabel.textContent = t('edit');
  els.backToTop.classList.remove('visible');
  setDirty(false);
  renderFileList();
  updatePaneResizerVisibility();
  $('.reader-pane').scrollTo({ top: 0 });
}

async function newFile() {
  if (!maybeDiscardChanges()) return;
  try {
    const doc = await window.quilliteMarkdown.newFile();
    if (!doc?.path) return;
    displayDocument(doc);
    await toggleEditor(true);
    if (pathIsInsideRoot(doc.path)) await refreshExplorer();
  } catch (error) {
    reportSilentError(error, 'document.create');
    console.error(error);
    showToast(t('newFileFailed'), 'error');
  }
}

async function loadFile(filePath) {
  if (!maybeDiscardChanges()) return;
  try {
    displayDocument(await window.quilliteMarkdown.openRecentFile(filePath));
  } catch (error) {
    if (isMissingDocumentError(error)) {
      await refreshLibraryFileStatuses();
      showToast(t('recentMissingTitle'), 'warning');
      return;
    }
    if (isMacAccessNotGrantedError(error)) {
      showToast(t('macAccessNotGranted'), 'warning');
      return;
    }
    reportSilentError(error, 'document.open');
    showToast(t('openFailed'), 'error');
    console.error(error);
  }
}

async function refreshLibraryAfterReplacement(saved) {
  if (!saved?.replacedPath) return;
  state.explorerFiles = state.explorerFiles.filter(file => !sameDocumentPath(file.path, saved.replacedPath));
  if (state.sidebarMode === 'explorer') state.files = [...state.explorerFiles];
  await refreshLibraryFileStatuses();
}

async function saveLibraryDocumentAs(filePath, { editAfterSave = false } = {}) {
  const current = state.currentFile;
  const isCurrent = current && sameDocumentPath(current.path, filePath);
  if (!isCurrent && !maybeDiscardChanges()) return;
  try {
    const source = isCurrent
      ? { ...current, content: state.editing ? editorContent() : current.content }
      : await window.quilliteMarkdown.readFile(filePath);
    if (!source?.path) return;
    const saved = await window.quilliteMarkdown.saveAs(source.path, source.content);
    if (!saved?.path) return;
    displayDocument(saved);
    await refreshLibraryAfterReplacement(saved);
    showToast(t('saveAsDone'), 'success');
    if (editAfterSave) await toggleEditor(true);
    return true;
  } catch (error) {
    reportSilentError(error, 'document.save-as');
    console.error(error);
    showToast(t('saveFailed'), 'error');
    return false;
  }
}

async function refreshCurrentFileFromDisk() {
  if (!state.currentFile?.path || state.dirty || state.saving || externalRefreshInProgress) return;
  const requestedPath = state.currentFile.path;
  externalRefreshInProgress = true;
  try {
    if (sameDocumentPath(missingCurrentFilePath, requestedPath)) {
      await refreshLibraryFileStatuses();
      const recentEntry = state.recentFiles.find(file => sameDocumentPath(file.path, requestedPath));
      if (recentEntry?.exists === false) return;
      missingCurrentFilePath = '';
    }
    const refreshed = await window.quilliteMarkdown.readFile(requestedPath);
    if (!state.currentFile || !sameDocumentPath(state.currentFile.path, requestedPath) || state.dirty || state.saving) return;
    if (!refreshed?.path || refreshed.content === state.currentFile.content) return;
    missingCurrentFilePath = '';

    const reader = $('.reader-pane');
    const scrollTop = reader.scrollTop;
    state.currentFile = refreshed;
    state.savedContent = refreshed.content;
    els.editorFileName.textContent = refreshed.name;
    renderEditorPreview(refreshed.content);
    if (state.editing) {
      replaceEditorContent(refreshed.content, true);
      updateEditorPosition();
    } else {
      renderCurrentDocument();
      reader.scrollTop = scrollTop;
      if (!els.searchBar.classList.contains('hidden')) performSearch();
    }
    setDirty(false);
  } catch (error) {
    if (isMissingDocumentError(error)) {
      const firstMissingNotice = !sameDocumentPath(missingCurrentFilePath, requestedPath);
      missingCurrentFilePath = requestedPath;
      await refreshLibraryFileStatuses();
      if (firstMissingNotice) showToast(t('currentDocumentMissing'), 'warning');
      return;
    }
    reportSilentError(error, 'document.refresh');
    console.warn('Unable to refresh the current document from disk:', error);
  } finally {
    externalRefreshInProgress = false;
  }
}

function updateEditorPosition() {
  if (!codeEditor) return;
  const cursor = codeEditor.state.selection.main.head;
  const line = codeEditor.state.doc.lineAt(cursor);
  els.editorPosition.textContent = t('editorPosition', { line: line.number, column: cursor - line.from + 1 });
}

// 根据编辑器光标行号，把左侧预览滚动到对应的块元素（编辑/预览滚动同步）。
// 只取“最后一个起始行 <= 光标行的块”，光标在同一行内移动时不重复滚动；
// force 用于预览重新渲染后强制校正一次。
function scrollPreviewToCursor(force = false, behavior = 'smooth') {
  if (!codeEditor || !state.editing) return;
  const scroller = $('.editor-preview-scroll');
  const preview = els.editorPreview;
  if (!scroller || !preview?.children.length) return;
  const cursorLine = codeEditor.state.doc.lineAt(codeEditor.state.selection.main.head).number;
  if (!force && cursorLine === scrollPreviewToCursor.lastLine) return;
  scrollPreviewToCursor.lastLine = cursorLine;
  let target = null;
  for (const el of preview.children) {
    const line = Number(el.dataset.line);
    if (Number.isFinite(line) && line <= cursorLine) target = el;
  }
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const top = Math.max(0, scroller.scrollTop + rect.top - scrollerRect.top - 12);
  if (Math.abs(top - scroller.scrollTop) < 48) return;
  scroller.scrollTo({ top, behavior });
}

function previewBlockAtPointer(event) {
  const direct = event.target instanceof Element ? event.target.closest('[data-line]') : null;
  if (direct && els.editorPreview.contains(direct)) return direct;
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const block of els.editorPreview.children) {
    if (!block.dataset.line) continue;
    const rect = block.getBoundingClientRect();
    const distance = event.clientY < rect.top
      ? rect.top - event.clientY
      : event.clientY > rect.bottom ? event.clientY - rect.bottom : 0;
    if (distance < nearestDistance) {
      nearest = block;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function hidePreviewLocateHint() {
  els.previewLocateHint.classList.add('hidden');
}

function showPreviewLocateHint(event) {
  if (!state.editing || !codeEditor) return hidePreviewLocateHint();
  const block = previewBlockAtPointer(event);
  const line = Number(block?.dataset.line);
  if (!Number.isFinite(line)) return hidePreviewLocateHint();
  els.previewLocateHint.querySelector('span').textContent = t('previewLocateHint', { line });
  els.previewLocateHint.style.left = `${Math.max(8, Math.min(event.clientX + 16, window.innerWidth - 260))}px`;
  els.previewLocateHint.style.top = `${Math.max(8, Math.min(event.clientY + 18, window.innerHeight - 50))}px`;
  els.previewLocateHint.classList.remove('hidden');
}

function locateEditorFromPreview(event) {
  if (!state.editing || !codeEditor) return;
  const block = previewBlockAtPointer(event);
  const sourceLine = Number(block?.dataset.line);
  if (!Number.isFinite(sourceLine)) return;
  event.preventDefault();
  hidePreviewLocateHint();
  const lineNumber = Math.max(1, Math.min(sourceLine, codeEditor.state.doc.lines));
  const line = codeEditor.state.doc.line(lineNumber);
  codeEditor.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 12 })
  });
  codeEditor.focus();
  block.classList.remove('preview-locate-target');
  requestAnimationFrame(() => block.classList.add('preview-locate-target'));
  clearTimeout(locateEditorFromPreview.timer);
  locateEditorFromPreview.timer = setTimeout(() => block.classList.remove('preview-locate-target'), 850);
}

function openEditPermissionDialog() {
  els.editPermissionFileName.textContent = state.currentFile?.name || '';
  els.editPermissionFileName.title = state.currentFile?.path || '';
  els.editPermissionDialog.classList.remove('hidden');
  requestAnimationFrame(() => $('#saveCopyAndEdit').focus());
}

function closeEditPermissionDialog(restoreFocus = true) {
  els.editPermissionDialog.classList.add('hidden');
  if (restoreFocus) els.editButton.focus();
}

async function savePermissionCopyAndEdit() {
  const filePath = state.currentFile?.path;
  if (!filePath) return closeEditPermissionDialog();
  closeEditPermissionDialog(false);
  await saveLibraryDocumentAs(filePath, { editAfterSave: true });
}

async function toggleEditor(forceEditing) {
  if (!state.currentFile || editorModeSwitching) return;
  const nextEditing = typeof forceEditing === 'boolean' ? forceEditing : !state.editing;
  if (nextEditing === state.editing) return;
  if (nextEditing && state.currentFile.readOnly) {
    showToast(t('referenceReadOnly'), 'warning');
    return;
  }
  const requestedPath = state.currentFile.path;
  editorModeSwitching = true;
  els.editButton.disabled = true;
  try {
    if (nextEditing) {
      let canEdit = false;
      try {
        canEdit = await window.quilliteMarkdown.canEditFile(requestedPath);
      } catch (error) {
        reportSilentError(error, 'document.check-write-permission');
        console.warn('Unable to verify document write permission:', error);
      }
      if (!canEdit) {
        state.saveAsRequired = true;
        els.editorSaveState.textContent = t('saveAsRequired');
        openEditPermissionDialog();
        return;
      }
      try {
        await initializeCodeEditor();
      } catch (error) {
        reportSilentError(error, 'editor.initialize');
        console.error('Unable to load the Markdown editor:', error);
        showToast(t('previewError'), 'error');
        return;
      }
      if (!state.currentFile || !sameDocumentPath(state.currentFile.path, requestedPath)) return;
    }
    state.editing = nextEditing;
    if (state.editing) {
      if (editorContent() !== state.currentFile.content) replaceEditorContent(state.currentFile.content, true);
      renderEditorPreview(state.currentFile.content);
      els.documentView.classList.add('hidden');
      els.editorView.classList.remove('hidden');
      els.tocPanel.classList.add('hidden');
      updatePaneResizerVisibility();
      els.backToTop.classList.remove('visible');
      els.editButton.classList.add('active');
      els.editButtonLabel.textContent = t('preview');
      focusCodeEditor();
      updateEditorPosition();
    } else {
      state.currentFile.content = editorContent();
      renderCurrentDocument();
      els.editorView.classList.add('hidden');
      els.documentView.classList.remove('hidden');
      els.editButton.classList.remove('active');
      els.editButtonLabel.textContent = t('edit');
      updatePaneResizerVisibility();
      $('.reader-pane').scrollTo({ top: 0 });
    }
  } finally {
    editorModeSwitching = false;
    els.editButton.disabled = !state.currentFile || Boolean(state.currentFile.readOnly);
  }
}

async function saveDocument(saveAs = false, options = {}) {
  if (!state.currentFile || state.saving) return;
  if (state.currentFile.readOnly && !saveAs) {
    if (!options.auto) showToast(t('referenceReadOnly'), 'warning');
    return;
  }
  if (state.saveAsRequired && options.auto) return;
  if (state.saveAsRequired && !options.auto) saveAs = true;
  const editingContent = state.editing ? editorContent() : state.currentFile.content;
  const originalPath = state.currentFile.path;
  let fallbackToSaveAs = false;
  state.saving = true;
  try {
    const saved = saveAs
      ? await window.quilliteMarkdown.saveAs(originalPath, editingContent)
      : await window.quilliteMarkdown.saveFile(originalPath, editingContent);
    if (!saved) return;
    const unchangedSinceSave = !state.editing || editorContent() === editingContent;
    state.currentFile = saved;
    state.saveAsRequired = false;
    state.saveWarningShown = false;
    state.currentFile.content = unchangedSinceSave ? editingContent : editorContent();
    state.savedContent = editingContent;
    addRecentDocument(saved);
    await refreshLibraryAfterReplacement(saved);
    renderEditorPreview(state.currentFile.content);
    els.editorFileName.textContent = saved.name;
    if (state.sidebarMode === 'recent') state.files = [...state.recentFiles];
    renderFileList();
    setDirty(!unchangedSinceSave);
    if (pathIsInsideRoot(saved.path)) await refreshExplorer();
    if (options.auto && unchangedSinceSave) {
      els.editorSaveState.textContent = t('autoSaved');
      clearTimeout(saveDocument.statusTimer);
      saveDocument.statusTimer = setTimeout(() => { if (!state.dirty) els.editorSaveState.textContent = t('saved'); }, 1800);
    } else if (!options.silent) {
      showToast(t(saveAs ? 'saveAsDone' : 'saveDone'), 'success');
    }
  } catch (error) {
    reportSilentError(error, 'document.save');
    if (!saveAs) {
      state.saveAsRequired = true;
      els.editorSaveState.textContent = t('saveAsRequired');
      if (options.auto) {
        if (!state.saveWarningShown) {
          state.saveWarningShown = true;
          showToast(t('saveAsRequiredHint'), 'warning');
        }
      } else {
        fallbackToSaveAs = true;
        showToast(t('saveAsFallback'), 'warning');
      }
    } else if (!options.auto) {
      showToast(t('saveFailed'), 'error');
    }
    console.error(error);
  } finally {
    state.saving = false;
  }
  if (fallbackToSaveAs) await saveDocument(true, options);
}

function exportPreviewContainer() {
  return state.editing ? els.editorPreview : els.content;
}

async function waitForPreviewImages(container, timeout = 3000) {
  const pending = [...container.querySelectorAll('img')].filter(image => !image.complete || image.classList.contains('local-image-loading'));
  if (!pending.length) return;
  await Promise.race([
    Promise.all(pending.map(image => new Promise(resolve => {
      const finish = () => resolve();
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    }))),
    new Promise(resolve => setTimeout(resolve, timeout))
  ]);
}

async function cleanRenderedHTMLForExport(container) {
  await renderMermaidDiagrams(container, {
    diagramLabel: t('mermaidDiagram'),
    errorTitle: t('mermaidRenderError'),
    errorHint: t('mermaidRenderHint')
  });
  await renderEChartsDiagrams(container, {
    errorTitle: t('dataChartRenderError'),
    errorHint: t('dataChartRenderHint')
  });
  const clone = container.cloneNode(true);
  await convertMermaidDiagramsToImages(clone, t('mermaidDiagram'));
  await convertEChartsDiagramsToImages(clone, t('dataChart'));
  clone.querySelectorAll('.math-inline, .math-block').forEach(formula => {
    const annotation = formula.querySelector('annotation[encoding="application/x-tex"]');
    if (!formula.hasAttribute('data-math-source') && annotation?.textContent?.trim()) {
      formula.setAttribute('data-math-source', encodeURIComponent(annotation.textContent.trim()));
    }
    // Export exactly one representation of a formula. KaTeX deliberately
    // renders both accessible MathML and a visual HTML layer; cloning the
    // whole preview can otherwise let WPS expose the hidden LaTeX/HTML layer
    // beside the native Office Math equation.
    const math = formula.querySelector('math');
    if (math) {
      const mathOnly = math.cloneNode(true);
      mathOnly.querySelectorAll('annotation, annotation-xml').forEach(element => element.remove());
      // DOMPurify does not keep every MathML accessibility wrapper. In some
      // WebViews it unwraps KaTeX's annotation into a direct text node below
      // <math>, which is invisible in the app's KaTeX layer but becomes a
      // second raw-LaTeX formula in standalone HTML and Office exports.
      [mathOnly, ...mathOnly.querySelectorAll('semantics')].forEach(element => {
        const hasStructuralMath = [...element.children].some(child => !['annotation', 'annotation-xml'].includes(child.localName));
        if (!hasStructuralMath) return;
        [...element.childNodes].forEach(child => {
          if (child.nodeType === 3 && child.textContent.trim()) child.remove();
        });
      });
      formula.replaceChildren(mathOnly);
    } else {
      formula.replaceChildren();
    }
  });
  clone.querySelectorAll('button, script, style, svg').forEach(element => element.remove());
  clone.querySelectorAll('[id], [data-line], [contenteditable]').forEach(element => {
    element.removeAttribute('id');
    element.removeAttribute('data-line');
    element.removeAttribute('contenteditable');
  });
  return clone.innerHTML;
}

async function exportWordDocument() {
  if (!state.currentFile) {
    showToast(t('exportNoDocument'), 'warning');
    return;
  }
  const container = exportPreviewContainer();
  try {
    await waitForPreviewImages(container);
    const output = await window.quilliteMarkdown.exportDOCX(
      state.currentFile.path,
      state.currentFile.name,
      await cleanRenderedHTMLForExport(container)
    );
    if (output) showToast(t('wordExported'), 'success');
  } catch (error) {
    if (isExportFileInUseError(error)) {
      showToast(t('exportFileInUse'), 'warning');
      return;
    }
    reportSilentError(error, 'document.export-word');
    console.error(error);
    showToast(t('wordExportFailed'), 'error');
  }
}

async function exportHTMLDocument() {
  if (!state.currentFile) {
    showToast(t('exportNoDocument'), 'warning');
    return;
  }
  const container = exportPreviewContainer();
  try {
    await waitForPreviewImages(container);
    const output = await window.quilliteMarkdown.exportHTML(
      state.currentFile.path,
      state.currentFile.name,
      await cleanRenderedHTMLForExport(container),
      state.colorMode,
      ACCENT_THEMES[state.accentTheme].color
    );
    if (output) showToast(t('htmlExported'), 'success');
  } catch (error) {
    if (isExportFileInUseError(error)) {
      showToast(t('exportFileInUse'), 'warning');
      return;
    }
    reportSilentError(error, 'document.export-html');
    console.error(error);
    showToast(t('htmlExportFailed'), 'error');
  }
}

function openPDFTutorial() {
  els.pdfTutorialDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => $('#confirmPDFTutorial').focus());
}

function closePDFTutorial(restoreFocus = true) {
  if (els.pdfTutorialDialog.classList.contains('hidden')) return;
  els.pdfTutorialDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  if (restoreFocus) $('#moreButton').focus();
}

async function confirmPDFExport() {
  closePDFTutorial(false);
  await printCurrentDocument();
}

async function printCurrentDocument() {
  if (state.editing) toggleEditor(false);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await renderMermaidDiagrams(els.content, {
    diagramLabel: t('mermaidDiagram'),
    errorTitle: t('mermaidRenderError'),
    errorHint: t('mermaidRenderHint')
  });
  await renderEChartsDiagrams(els.content, {
    errorTitle: t('dataChartRenderError'),
    errorHint: t('dataChartRenderHint')
  });
  window.quilliteMarkdown.print();
}

function exportPDFDocument() {
  if (!state.currentFile) {
    showToast(t('exportNoDocument'), 'warning');
    return;
  }
  openPDFTutorial();
}

function closeDocumentActionsMenu() {
  els.documentActionsMenu.classList.add('hidden');
  els.documentActionsMoreButton.setAttribute('aria-expanded', 'false');
}

function runDocumentHeaderAction(action) {
  closeDocumentActionsMenu();
  if (action === 'save-as' && state.currentFile?.path) saveLibraryDocumentAs(state.currentFile.path);
  if (action === 'export-word') exportWordDocument();
  if (action === 'export-html') exportHTMLDocument();
  if (action === 'export-pdf') exportPDFDocument();
  if (action === 'print') {
    printCurrentDocument();
  }
}

function bindDocumentActions(container = els.content) {
  container.querySelectorAll('.copy-code').forEach(button => button.addEventListener('click', async () => {
    const code = button.closest('.code-block').querySelector('code').textContent;
    await navigator.clipboard.writeText(code);
    button.textContent = t('copied');
    setTimeout(() => button.textContent = t('copy'), 1200);
  }));
  container.querySelectorAll('a').forEach(link => link.addEventListener('click', event => {
    const href = link.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      event.preventDefault();
      window.quilliteMarkdown.openExternal(href);
    }
  }));
}

async function openFile() {
  if (!maybeDiscardChanges()) return;
  const doc = await window.quilliteMarkdown.openFile();
  if (doc) {
    setSidebarMode('recent');
    displayDocument(doc);
  }
}

async function openFolder() {
  if (!maybeDiscardChanges()) return;
  const folder = await window.quilliteMarkdown.openFolder();
  if (!folder) return;
  state.root = folder.root;
  state.explorerFiles = folder.files;
  setSidebarMode('explorer');
  if (folder.files[0]) {
    try {
      displayDocument(await window.quilliteMarkdown.readFile(folder.files[0].path));
    } catch {
      showToast(t('folderOpenFailed'), 'error');
    }
  }
}

async function openReferenceDocument(kind) {
  if (!maybeDiscardChanges()) return;
  try {
    const doc = await window.quilliteMarkdown.openReferenceDocument(kind);
    if (doc) displayDocument(doc, { addToLibrary: false });
  } catch (error) {
    reportSilentError(error, 'document.open-reference');
    console.error(error);
    showToast(t('referenceOpenFailed'), 'error');
  }
}

function openSearch() {
  if (!state.currentFile) return;
  if (state.editing) {
    els.searchBar.classList.add('hidden');
    clearSearchHighlights();
    openSearchPanel(codeEditor);
    return;
  }
  els.searchBar.classList.remove('hidden');
  els.searchInput.focus();
  els.searchInput.select();
}

function closeSearch() {
  els.searchBar.classList.add('hidden');
  clearSearchHighlights();
}

function clearSearchHighlights() {
  els.content.querySelectorAll('mark.search-hit').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent)));
  els.content.normalize();
  state.searchMatches = [];
  els.searchCount.textContent = '0 / 0';
}

function performSearch() {
  clearSearchHighlights();
  const term = els.searchInput.value.trim();
  if (!term) return;
  const walker = document.createTreeWalker(els.content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement.closest('script, style, mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const needle = term.toLocaleLowerCase();
  nodes.forEach(node => {
    const text = node.textContent;
    const lower = text.toLocaleLowerCase();
    let cursor = 0;
    let index = lower.indexOf(needle);
    if (index < 0) return;
    const fragment = document.createDocumentFragment();
    while (index >= 0) {
      fragment.append(text.slice(cursor, index));
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = text.slice(index, index + term.length);
      fragment.append(mark);
      cursor = index + term.length;
      index = lower.indexOf(needle, cursor);
    }
    fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
  });
  state.searchMatches = [...els.content.querySelectorAll('mark.search-hit')];
  state.searchIndex = 0;
  goToSearch(0);
}

function goToSearch(delta) {
  if (!state.searchMatches.length) {
    els.searchCount.textContent = '0 / 0';
    return;
  }
  state.searchMatches[state.searchIndex]?.classList.remove('current');
  state.searchIndex = (state.searchIndex + delta + state.searchMatches.length) % state.searchMatches.length;
  const target = state.searchMatches[state.searchIndex];
  target.classList.add('current');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  els.searchCount.textContent = `${state.searchIndex + 1} / ${state.searchMatches.length}`;
}

function toggleSidebar(collapsed) {
  els.sidebar.classList.toggle('collapsed', collapsed);
  els.expandSidebar.classList.toggle('hidden', !collapsed);
  updatePaneResizerVisibility();
  schedulePaneWidthRefresh();
}

const panelSizeLimits = {
  sidebar: { min: 120, max: 2000, fallback: 258 },
  toc: { ...TOC_WIDTH_LIMITS, fallback: initialTocDisplay.defaultWidth }
};

function clampPanelWidth(value, limits) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return limits.fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(parsed)));
}

function applyTocDisplayStyles() {
  const baseFontSize = state.tocDisplay?.fontSize || initialTocDisplay.fontSize;
  const levelFontSizes = {
    3: Math.max(baseFontSize - .75, 12.5),
    4: Math.max(baseFontSize - 1.5, 12),
    5: Math.max(baseFontSize - 2, 11.5),
    6: Math.max(baseFontSize - 2.5, 11),
  };
  document.documentElement.style.setProperty('--toc-base-font-size', `${baseFontSize}px`);
  document.documentElement.style.setProperty('--toc-font-user-scale', state.fontScale);
  Object.entries(levelFontSizes).forEach(([level, size]) => {
    document.documentElement.style.setProperty(`--toc-level-${level}-font-size`, `${size}px`);
  });
  document.documentElement.style.setProperty('--toc-eyebrow-font-size', `${Math.max(baseFontSize - 3, 10)}px`);
  document.documentElement.style.setProperty('--toc-reading-font-size', `${Math.max(baseFontSize - 2.5, 10.5)}px`);
  document.documentElement.style.setProperty('--toc-indent', '6px');
}

function refreshTocDisplay() {
  const display = currentDisplay();
  lastTocDisplaySignature = tocDisplaySignature(display);
  const nextDisplay = tocDisplayMetrics(display);
  state.tocDisplay = nextDisplay;
  panelSizeLimits.toc.fallback = nextDisplay.defaultWidth;
  if (!state.tocWidthCustomized) state.tocPreferredWidth = nextDisplay.defaultWidth;
  applyTocDisplayStyles();
  applyPaneWidths();
  scheduleActiveTocRefresh();
}

let tocDisplayRefreshTimer;
function scheduleTocDisplayRefresh() {
  clearTimeout(tocDisplayRefreshTimer);
  tocDisplayRefreshTimer = setTimeout(refreshTocDisplay, 180);
}

function visibleElementWidth(element) {
  if (!element || getComputedStyle(element).display === 'none') return 0;
  return element.getBoundingClientRect().width;
}

function paneParticipates(element, additionallyHidden = false) {
  return Boolean(element && !additionallyHidden && getComputedStyle(element).display !== 'none');
}

function readerSidePanelLayout() {
  const sidebarVisible = paneParticipates(els.sidebar, els.sidebar.classList.contains('collapsed'));
  const tocVisible = paneParticipates(els.tocPanel, state.editing || els.tocPanel.classList.contains('hidden'));
  const dividerWidth = visibleElementWidth(els.sidebarResizer) + visibleElementWidth(els.tocResizer);
  const availableWidth = Math.max(0, els.appShell.clientWidth - dividerWidth - 240);
  return { sidebarVisible, tocVisible, availableWidth };
}

function applyPaneWidths() {
  state.sidebarPreferredWidth = clampPanelWidth(state.sidebarPreferredWidth, panelSizeLimits.sidebar);
  state.tocPreferredWidth = clampTocPreferredWidth(state.tocPreferredWidth, panelSizeLimits.toc.fallback);
  const layout = readerSidePanelLayout();
  const fitted = fitReaderSidePanels({
    availableWidth: layout.availableWidth,
    sidebarPreferredWidth: state.sidebarPreferredWidth,
    tocPreferredWidth: state.tocPreferredWidth,
    sidebarVisible: layout.sidebarVisible,
    tocVisible: layout.tocVisible,
    sidebarMinimum: panelSizeLimits.sidebar.min,
    sidebarMaximum: panelSizeLimits.sidebar.max,
    tocMinimum: panelSizeLimits.toc.min,
    tocMaximum: panelSizeLimits.toc.max,
    sidebarFallback: panelSizeLimits.sidebar.fallback,
    tocFallback: panelSizeLimits.toc.fallback,
  });
  state.sidebarWidth = fitted.sidebarWidth;
  state.tocWidth = fitted.tocWidth;
  document.documentElement.style.setProperty('--sidebar-width', `${state.sidebarWidth}px`);
  document.documentElement.style.setProperty('--toc-width', `${state.tocWidth}px`);
  const maximumSidebarWidth = layout.sidebarVisible
    ? Math.max(panelSizeLimits.sidebar.min, Math.min(
      panelSizeLimits.sidebar.max,
      Math.floor(layout.availableWidth - (layout.tocVisible ? panelSizeLimits.toc.min : 0)),
    ))
    : panelSizeLimits.sidebar.max;
  const maximumTocWidth = layout.tocVisible
    ? Math.max(panelSizeLimits.toc.min, Math.min(
      panelSizeLimits.toc.max,
      Math.floor(layout.availableWidth - (layout.sidebarVisible ? panelSizeLimits.sidebar.min : 0)),
    ))
    : panelSizeLimits.toc.max;
  els.sidebarResizer?.setAttribute('aria-valuenow', String(state.sidebarWidth));
  els.sidebarResizer?.setAttribute('aria-valuemax', String(maximumSidebarWidth));
  els.tocResizer?.setAttribute('aria-valuenow', String(state.tocWidth));
  els.tocResizer?.setAttribute('aria-valuemax', String(maximumTocWidth));
  setEditorPreviewWidth(state.editorPreviewWidth);
  scheduleActiveTocRefresh();
}

function updatePaneResizerVisibility() {
  if (!els.sidebarResizer || !els.tocResizer) return;
  els.sidebarResizer.classList.toggle('hidden', els.sidebar.classList.contains('collapsed'));
  els.tocResizer.classList.toggle('hidden', state.editing || els.tocPanel.classList.contains('hidden'));
  els.editorResizer?.classList.toggle('hidden', !state.editing);
  schedulePaneWidthRefresh();
}

function persistPaneWidth(panelName) {
  if (panelName === 'toc') {
    state.tocWidthCustomized = true;
    localStorage.setItem('tocWidth', String(state.tocPreferredWidth));
    return;
  }
  localStorage.setItem('sidebarWidth', String(state.sidebarPreferredWidth));
}

function setPaneWidth(panelName, width, persist = false) {
  const limits = panelSizeLimits[panelName];
  if (panelName === 'toc') {
    state.tocWidthCustomized = true;
    state.tocPreferredWidth = clampTocPreferredWidth(width, limits.fallback);
  } else {
    state.sidebarPreferredWidth = clampPanelWidth(width, limits);
  }
  applyPaneWidths();
  if (persist) persistPaneWidth(panelName);
}

function paneResizeSnapshot(panelName) {
  return {
    effectiveWidth: panelName === 'sidebar' ? state.sidebarWidth : state.tocWidth,
    preferredWidth: panelName === 'sidebar' ? state.sidebarPreferredWidth : state.tocPreferredWidth,
    tocWidthCustomized: state.tocWidthCustomized,
  };
}

function restorePaneResizeSnapshot(panelName, snapshot) {
  if (panelName === 'toc') {
    state.tocPreferredWidth = snapshot.preferredWidth;
    state.tocWidthCustomized = snapshot.tocWidthCustomized;
  } else {
    state.sidebarPreferredWidth = snapshot.preferredWidth;
  }
  applyPaneWidths();
}

function resizePaneFromEffectiveWidth(panelName, width, snapshot) {
  setPaneWidth(panelName, width);
  const effectiveWidth = panelName === 'sidebar' ? state.sidebarWidth : state.tocWidth;
  if (effectiveWidth !== snapshot.effectiveWidth) return true;
  restorePaneResizeSnapshot(panelName, snapshot);
  return false;
}

let paneResizeFrame;
let paneResizeObserver;
function schedulePaneWidthRefresh() {
  cancelAnimationFrame(paneResizeFrame);
  paneResizeFrame = requestAnimationFrame(applyPaneWidths);
}

let tocResolutionQuery;
function bindTocResolutionWatcher() {
  if (!window.matchMedia) return;
  if (tocResolutionQuery?.removeEventListener) tocResolutionQuery.removeEventListener('change', handleTocResolutionChange);
  else tocResolutionQuery?.removeListener?.(handleTocResolutionChange);
  tocResolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  if (tocResolutionQuery.addEventListener) tocResolutionQuery.addEventListener('change', handleTocResolutionChange);
  else tocResolutionQuery.addListener?.(handleTocResolutionChange);
}

function handleTocResolutionChange() {
  bindTocResolutionWatcher();
  scheduleTocDisplayRefresh();
}

function detectTocDisplayChange() {
  if (document.visibilityState === 'hidden') return;
  const signature = tocDisplaySignature(currentDisplay());
  if (signature === lastTocDisplaySignature) return;
  lastTocDisplaySignature = signature;
  scheduleTocDisplayRefresh();
}

function initializePaneResizers() {
  applyTocDisplayStyles();
  updatePaneResizerVisibility();
  applyPaneWidths();
  if (typeof ResizeObserver === 'function') {
    paneResizeObserver = new ResizeObserver(schedulePaneWidthRefresh);
    paneResizeObserver.observe(els.appShell);
    paneResizeObserver.observe(els.sidebar);
  } else {
    window.addEventListener('resize', schedulePaneWidthRefresh);
  }
  els.sidebar.addEventListener('transitionend', schedulePaneWidthRefresh);
  window.addEventListener('resize', scheduleTocDisplayRefresh);
  window.addEventListener('focus', scheduleTocDisplayRefresh);
  window.screen?.addEventListener?.('change', scheduleTocDisplayRefresh);
  window.screen?.orientation?.addEventListener?.('change', scheduleTocDisplayRefresh);
  bindTocResolutionWatcher();
  window.setInterval(detectTocDisplayChange, 1500);
  document.addEventListener('visibilitychange', detectTocDisplayChange);
  const configure = (handle, panelName, direction) => {
    if (!handle) return;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || handle.classList.contains('hidden')) return;
      event.preventDefault();
      const startX = event.clientX;
      const resizeSnapshot = paneResizeSnapshot(panelName);
      const startWidth = resizeSnapshot.effectiveWidth;
      let changed = false;
      handle.setPointerCapture?.(event.pointerId);
      handle.classList.add('active');
      document.body.classList.add('resizing-panes');
      const move = moveEvent => {
        const delta = direction === 1 ? moveEvent.clientX - startX : startX - moveEvent.clientX;
        changed = resizePaneFromEffectiveWidth(panelName, startWidth + delta, resizeSnapshot);
      };
      const finish = () => {
        handle.classList.remove('active');
        document.body.classList.remove('resizing-panes');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        if (changed) persistPaneWidth(panelName);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    });
    handle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const change = (event.key === 'ArrowRight' ? 10 : -10) * direction;
      const resizeSnapshot = paneResizeSnapshot(panelName);
      if (resizePaneFromEffectiveWidth(panelName, resizeSnapshot.effectiveWidth + change, resizeSnapshot)) {
        persistPaneWidth(panelName);
      }
    });
  };
  configure(els.sidebarResizer, 'sidebar', 1);
  configure(els.tocResizer, 'toc', -1);
  // 编辑模式分栏：左侧预览/右侧编辑器，可随意拖动（不设最大宽度，仅保留最小宽度）
  const editorHandle = els.editorResizer;
  if (editorHandle) {
    editorHandle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || editorHandle.classList.contains('hidden')) return;
      event.preventDefault();
      const startX = event.clientX;
      const startPercent = state.editorPreviewWidth;
      let changed = false;
      editorHandle.setPointerCapture?.(event.pointerId);
      editorHandle.classList.add('active');
      document.body.classList.add('resizing-panes');
      const move = moveEvent => {
        const total = els.editorView?.clientWidth || 1;
        const deltaPercent = ((moveEvent.clientX - startX) / total) * 100;
        const previousPercent = state.editorPreviewWidth;
        setEditorPreviewWidth(startPercent + deltaPercent);
        if (state.editorPreviewWidth !== previousPercent) changed = true;
      };
      const finish = () => {
        editorHandle.classList.remove('active');
        document.body.classList.remove('resizing-panes');
        editorHandle.removeEventListener('pointermove', move);
        editorHandle.removeEventListener('pointerup', finish);
        editorHandle.removeEventListener('pointercancel', finish);
        if (changed) localStorage.setItem('editorPreviewWidth', String(state.editorPreviewWidth));
      };
      editorHandle.addEventListener('pointermove', move);
      editorHandle.addEventListener('pointerup', finish);
      editorHandle.addEventListener('pointercancel', finish);
    });
    editorHandle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const change = event.key === 'ArrowRight' ? 2 : -2;
      setEditorPreviewWidth(state.editorPreviewWidth + change);
      localStorage.setItem('editorPreviewWidth', String(state.editorPreviewWidth));
    });
  }
}

function setEditorPreviewWidth(percent) {
  // 最小保留 12% 预览宽度；不设固定最大宽度，只给右侧编辑器保留最小可用空间
  const max = Math.max(12, 100 - 8);
  state.editorPreviewWidth = Math.max(12, Math.min(max, Math.round(percent)));
  document.documentElement.style.setProperty('--editor-preview-width', `${state.editorPreviewWidth}%`);
}

function openAbout() {
  els.usageAnalyticsToggle.checked = state.usageAnalytics;
  els.aboutDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => $('#closeAbout').focus());
}

function closeAbout() {
  if (els.aboutDialog.classList.contains('hidden')) return;
  els.aboutDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  $('#moreButton').focus();
}

function renderFeedbackImages() {
  els.feedbackImageList.replaceChildren();
  state.feedbackImages.forEach((image, index) => {
    const item = document.createElement('div');
    item.className = 'feedback-image-item';
    const details = document.createElement('span');
    const name = document.createElement('strong');
    const size = document.createElement('small');
    name.textContent = image.name;
    size.textContent = `${Math.max(1, Math.round(Number(image.size || 0) / 1024))} KB`;
    details.append(name, size);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.feedbackImageIndex = String(index);
    remove.title = t('removeImage');
    remove.setAttribute('aria-label', `${t('removeImage')} ${image.name}`);
    remove.textContent = '×';
    item.append(details, remove);
    els.feedbackImageList.append(item);
  });
}

async function openFeedback() {
  state.feedbackImages = [];
  renderFeedbackImages();
  els.feedbackForm.reset();
  els.feedbackForm.elements.feedbackCategory.value = 'feature';
  $('#feedbackMessageCount').textContent = '0 / 4000';
  $('#feedbackMessageStatus').textContent = '';
  els.feedbackDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  try {
    state.feedbackSystemInfo = await window.quilliteMarkdown.getFeedbackSystemInfo();
  } catch {
    state.feedbackSystemInfo = { appVersion: '2.5.2', os: 'windows', systemVersion: '—' };
  }
  $('#feedbackAppVersion').textContent = state.feedbackSystemInfo?.appVersion || '2.5.2';
  $('#feedbackSystemVersion').textContent = state.feedbackSystemInfo?.systemVersion || '—';
  requestAnimationFrame(() => $('#feedbackMessage').focus());
}

function closeFeedback() {
  if (els.feedbackDialog.classList.contains('hidden')) return;
  els.feedbackDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  state.feedbackImages = [];
  $('#moreButton').focus();
}

async function chooseFeedbackImages() {
  try {
    const selected = await window.quilliteMarkdown.selectFeedbackImages();
    if (!selected?.length) return;
    const byPath = new Map(state.feedbackImages.map(image => [image.path, image]));
    selected.forEach(image => byPath.set(image.path, image));
    state.feedbackImages = [...byPath.values()].slice(0, 5);
    renderFeedbackImages();
  } catch (error) {
    showToast(error?.message || t('feedbackImageSelectFailed'), 'error');
  }
}

async function submitFeedbackForm(event) {
  event.preventDefault();
  const message = $('#feedbackMessage').value.trim();
  if (message.length < 5) {
    $('#feedbackMessageStatus').textContent = t('feedbackNeedDescription');
    $('#feedbackMessage').focus();
    return;
  }
  const submit = $('#submitFeedback');
  submit.disabled = true;
  $('#feedbackMessageStatus').textContent = t('feedbackSubmitting');
  try {
    await window.quilliteMarkdown.submitFeedback({
      category: els.feedbackForm.elements.feedbackCategory.value,
      message,
      email: $('#feedbackEmail').value.trim(),
      phone: $('#feedbackPhone').value.trim(),
      imagePaths: state.feedbackImages.map(image => image.path)
    });
    closeFeedback();
    showToast(t('feedbackSubmitted'), 'success', 6200);
  } catch (error) {
    $('#feedbackMessageStatus').textContent = error?.message || t('feedbackSubmitFailed');
  } finally {
    submit.disabled = false;
  }
}

function openUpdateDialog(info) {
  state.updateInfo = info;
  $('#currentVersion').textContent = info.currentVersion || '2.5.2';
  $('#latestVersion').textContent = info.latestVersion || '';
  $('#updateReleaseName').textContent = info.releaseName || `v${info.latestVersion || ''}`;
  const notesElement = $('#releaseNotes');
  const releaseNotes = (info.releaseNotes || t('noReleaseNotes')).slice(0, 5000);
  notesElement.innerHTML = DOMPurify.sanitize(marked.parse(releaseNotes));
  notesElement.querySelectorAll('a').forEach(link => link.addEventListener('click', event => {
    const href = link.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    event.preventDefault();
    window.quilliteMarkdown.openExternal(href);
  }));
  els.updateDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  const platform = document.documentElement.dataset.platform;
  const manualInstallRequired = platform === 'darwin' && info.manualInstallRequired === true;
  $('#manualUpdateNotice').classList.toggle('hidden', !manualInstallRequired);
  $('#applyUpdate').classList.toggle('hidden', manualInstallRequired || (platform !== 'darwin' && platform !== 'windows'));
  $('#openUpdatePage').textContent = manualInstallRequired ? t('manualMacUpdateButton') : t('openDownloadPage');
  $('#openUpdatePage').classList.toggle('primary', manualInstallRequired);
  $('#openUpdatePage').classList.toggle('secondary', !manualInstallRequired);
  $('#updateProgress').classList.add('hidden');
  $('#applyUpdate').disabled = false;
  requestAnimationFrame(() => $('#openUpdatePage').focus());
}

function closeUpdate() {
  if (els.updateDialog.classList.contains('hidden')) return;
  els.updateDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  $('#moreButton').focus();
}

async function checkForUpdates(manual = false) {
  if (manual) showToast(t('checkingForUpdates'));
  try {
    const info = await window.quilliteMarkdown.checkForUpdates(manual);
    if (info?.available) openUpdateDialog(info);
    else if (manual && info?.checked) showToast(t('alreadyLatest'), 'success');
  } catch (error) {
    console.warn('Update check failed:', error);
    if (manual) showToast(t('updateCheckFailed'), 'error');
  }
}

let automaticUpdateScheduled = false;

function scheduleAutomaticUpdateCheck() {
  if (automaticUpdateScheduled) return;
  automaticUpdateScheduled = true;
  setTimeout(() => checkForUpdates(false), 1200);
}

function openFirstRunLanguageDialog() {
  els.firstRunLanguageDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => els.firstRunLanguageDialog.querySelector('[data-first-run-language="zh-CN"]')?.focus());
}

async function completeFirstRunLanguage(language) {
  const buttons = els.firstRunLanguageDialog.querySelectorAll('[data-first-run-language]');
  buttons.forEach(button => { button.disabled = true; });
  try {
    await setLanguage(language, true, true);
    els.firstRunLanguageDialog.classList.add('hidden');
    document.body.classList.remove('dialog-open');
    showToast(t('languageChanged'), 'success');
    scheduleAutomaticUpdateCheck();
  } catch (error) {
    reportSilentError(error, 'language.first-run');
    console.warn('Unable to save first-run language:', error);
    buttons.forEach(button => { button.disabled = false; });
    showToast(t('languageSaveFailed'), 'error');
  }
}

async function snoozeUpdates() {
  try {
    await window.quilliteMarkdown.snoozeUpdates(30);
    closeUpdate();
    showToast(t('updateSnoozed'), 'success');
  } catch (error) {
    console.warn('Unable to save update reminder preference:', error);
  }
}

let applyingUpdate = false;

function setUpdateProgress(done, total) {
  const percent = total > 0 ? Math.min(100, Math.round((done * 100) / total)) : 0;
  $('#updateProgressBar').style.width = `${percent}%`;
  $('#updateProgressLabel').textContent = t('downloadingUpdate', { percent });
}

async function startDownloadAndUpdate() {
  if (applyingUpdate) return;
  if (state.dirty && state.currentFile?.path) {
    await saveDocument(false, { auto: true, silent: true });
  }
  if (state.dirty) {
    showToast(t('updateBlockedByUnsavedChanges'), 'warning');
    return;
  }
  applyingUpdate = true;
  $('#applyUpdate').disabled = true;
  $('#openUpdatePage').disabled = true;
  $('#updateLater').disabled = true;
  $('#updateSnooze').disabled = true;
  $('#updateProgress').classList.remove('hidden');
  setUpdateProgress(0, 1);
  try {
    await window.quilliteMarkdown.downloadAndApplyUpdate();
    $('#updateProgressLabel').textContent = t('preparingUpdate');
    $('#updateProgressBar').style.width = '100%';
    setTimeout(() => window.quilliteMarkdown.closeWindow(), 500);
  } catch (error) {
    reportSilentError(error, 'update.apply');
    console.warn('In-app update failed:', error);
    applyingUpdate = false;
    $('#updateProgress').classList.add('hidden');
    $('#applyUpdate').disabled = false;
    $('#openUpdatePage').disabled = false;
    $('#updateLater').disabled = false;
    $('#updateSnooze').disabled = false;
    showToast(t('updateFailed'), 'error');
  }
}

async function initialize() {
  setAccentTheme(state.accentTheme);
  if (!initializeMacSystemColorMode()) setColorMode(state.colorMode);
  setFontScale(state.fontScale, true, state.fontScaleMode);
  setDocumentWidth(state.docWidth, true);
  scheduleMacWindowModeSync();
  const prefs = await window.quilliteMarkdown.getPreferences();
  state.usageAnalytics = prefs.usageAnalytics !== false;
  els.usageAnalyticsToggle.checked = state.usageAnalytics;
  const needsLanguageSelection = await window.quilliteMarkdown.needsLanguageSelection();
  setLanguage(prefs.language || state.language, true, !needsLanguageSelection);
  applyLibraryPreferences(prefs);
  const savedExplorerRoot = String(prefs.explorerRoot || '').trim();
  state.root = savedExplorerRoot || null;
  state.explorerFiles = [];
  setSidebarMode(state.sidebarMode === 'explorer' && !state.root ? 'recent' : state.sidebarMode);
  const initialFile = await window.quilliteMarkdown.getInitialFile();
  if (initialFile?.path) {
    displayDocument(initialFile);
    if (await window.quilliteMarkdown.getStartupMode() === 'edit') await toggleEditor(true);
  }
  restoreExplorerAfterFirstPaint(savedExplorerRoot);
  if (needsLanguageSelection) openFirstRunLanguageDialog();
  else scheduleAutomaticUpdateCheck();
}

$('#newFileButton').addEventListener('click', newFile);
$('#closeToast').addEventListener('click', hideToast);
els.toast.addEventListener('mouseenter', () => clearTimeout(showToast.timer));
els.toast.addEventListener('mouseleave', () => {
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(hideToast, showToast.resumeDelay || 1200);
});
['#openFileButton', '#welcomeOpenFile'].forEach(id => $(id).addEventListener('click', openFile));
['#openFolderButton', '#welcomeOpenFolder', '#folderCta'].forEach(id => $(id).addEventListener('click', openFolder));
document.querySelectorAll('[data-reference-document]').forEach(button => {
  button.addEventListener('click', () => openReferenceDocument(button.dataset.referenceDocument));
});
$('#accentButton').addEventListener('click', event => {
  event.stopPropagation();
  toggleAccentMenu();
});
$('#colorModeButton').addEventListener('click', toggleColorMode);
els.accentMenu.addEventListener('click', event => {
  event.stopPropagation();
  const button = event.target.closest('[data-accent-option]');
  if (!button) return;
  setAccentTheme(button.dataset.accentOption);
  closeAccentMenu();
  $('#accentButton').focus();
});
els.backToTop.addEventListener('click', () => $('.reader-pane').scrollTo({ top: 0, behavior: 'smooth' }));
els.editButton.addEventListener('click', () => toggleEditor());
els.saveButton.addEventListener('click', () => saveDocument(false));
$('#saveAsButton').addEventListener('click', () => saveDocument(true));
els.recentTab.addEventListener('click', () => {
  setSidebarMode('recent');
  refreshLibraryFileStatuses();
});
els.favoritesTab.addEventListener('click', () => {
  setSidebarMode('favorites');
  refreshLibraryFileStatuses();
});
els.explorerTab.addEventListener('click', () => {
  if (!state.root || state.sidebarMode === 'explorer') openFolder();
  else setSidebarMode('explorer');
});
els.refreshExplorer.addEventListener('click', refreshExplorer);
$('#collapseSidebar').addEventListener('click', () => toggleSidebar(true));
$('#expandSidebar').addEventListener('click', () => toggleSidebar(false));
$('#searchButton').addEventListener('click', openSearch);
$('#closeSearch').addEventListener('click', closeSearch);
$('#searchPrev').addEventListener('click', () => goToSearch(-1));
$('#searchNext').addEventListener('click', () => goToSearch(1));
els.searchInput.addEventListener('input', performSearch);
els.searchInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') goToSearch(event.shiftKey ? -1 : 1);
  if (event.key === 'Escape') closeSearch();
});
$('#revealButton').addEventListener('click', () => state.currentFile && revealFileInFolder(state.currentFile.path));
$('#closePreviewButton').addEventListener('click', closePreview);
els.documentActions.addEventListener('click', event => {
  const moreButton = event.target.closest('#documentActionsMoreButton');
  if (moreButton) {
    event.stopPropagation();
    const opening = els.documentActionsMenu.classList.contains('hidden');
    els.documentActionsMenu.classList.toggle('hidden', !opening);
    els.documentActionsMoreButton.setAttribute('aria-expanded', String(opening));
    if (opening) requestAnimationFrame(() => els.documentActionsMenu.querySelector('button')?.focus());
    return;
  }
  const actionButton = event.target.closest('[data-document-action]');
  if (actionButton) runDocumentHeaderAction(actionButton.dataset.documentAction);
});
$('#moreButton').addEventListener('click', event => {
  event.stopPropagation();
  closeAccentMenu();
  closeRecentContextMenu();
  els.codeLangMenu.classList.add('hidden');
  els.moreMenu.classList.toggle('hidden');
});
$('#windowMinimise').addEventListener('click', () => window.quilliteMarkdown.minimiseWindow());
$('#windowMaximise').addEventListener('click', () => window.quilliteMarkdown.toggleMaximiseWindow());
$('#windowClose').addEventListener('click', () => window.quilliteMarkdown.closeWindow());
$('#windowMaximise').addEventListener('dblclick', event => event.stopPropagation());
$('.titlebar').addEventListener('dblclick', event => {
  if (!event.target.closest('button, input')) window.quilliteMarkdown.toggleMaximiseWindow();
});
$('#closeAbout').addEventListener('click', closeAbout);
$('#aboutDone').addEventListener('click', closeAbout);
$('#closeFeedback').addEventListener('click', closeFeedback);
$('#cancelFeedback').addEventListener('click', closeFeedback);
$('#selectFeedbackImages').addEventListener('click', chooseFeedbackImages);
$('#feedbackMessage').addEventListener('input', event => { $('#feedbackMessageCount').textContent = `${event.target.value.length} / 4000`; });
els.feedbackForm.addEventListener('submit', submitFeedbackForm);
els.feedbackImageList.addEventListener('click', event => {
  const button = event.target.closest('[data-feedback-image-index]');
  if (!button) return;
  state.feedbackImages.splice(Number(button.dataset.feedbackImageIndex), 1);
  renderFeedbackImages();
});
els.feedbackDialog.addEventListener('click', event => {
  if (event.target === els.feedbackDialog) closeFeedback();
});
els.usageAnalyticsToggle.addEventListener('change', async () => {
  const enabled = els.usageAnalyticsToggle.checked;
  els.usageAnalyticsToggle.disabled = true;
  try {
    const prefs = await window.quilliteMarkdown.setUsageAnalytics(enabled);
    state.usageAnalytics = prefs?.usageAnalytics !== false;
    els.usageAnalyticsToggle.checked = state.usageAnalytics;
    showToast(t(state.usageAnalytics ? 'usageAnalyticsEnabled' : 'usageAnalyticsDisabled'), 'success');
  } catch (error) {
    els.usageAnalyticsToggle.checked = state.usageAnalytics;
  } finally {
    els.usageAnalyticsToggle.disabled = false;
  }
});
els.firstRunLanguageDialog.querySelectorAll('[data-first-run-language]').forEach(button => {
  button.addEventListener('click', () => completeFirstRunLanguage(button.dataset.firstRunLanguage));
});
els.aboutDialog.addEventListener('click', event => {
  if (event.target === els.aboutDialog) closeAbout();
});
els.aboutDialog.querySelectorAll('[data-external]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  window.quilliteMarkdown.openExternal(link.dataset.external);
}));
$('#closeUpdate').addEventListener('click', closeUpdate);
$('#updateLater').addEventListener('click', closeUpdate);
$('#updateSnooze').addEventListener('click', snoozeUpdates);
$('#applyUpdate').addEventListener('click', startDownloadAndUpdate);
window.quilliteMarkdown.onUpdateProgress(progress => {
  if (applyingUpdate) setUpdateProgress(Number(progress?.done) || 0, Number(progress?.total) || 0);
});
$('#openUpdatePage').addEventListener('click', () => {
	window.quilliteMarkdown.openExternal('https://qm.ssssa.cn/#download');
	closeUpdate();
});
els.updateDialog.addEventListener('click', event => {
  if (event.target === els.updateDialog) closeUpdate();
});
$('#cancelEditPermission').addEventListener('click', () => closeEditPermissionDialog());
$('#saveCopyAndEdit').addEventListener('click', savePermissionCopyAndEdit);
els.editPermissionDialog.addEventListener('click', event => {
  if (event.target === els.editPermissionDialog) closeEditPermissionDialog();
});
$('#closePDFTutorial').addEventListener('click', () => closePDFTutorial());
$('#cancelPDFTutorial').addEventListener('click', () => closePDFTutorial());
$('#confirmPDFTutorial').addEventListener('click', confirmPDFExport);
els.pdfTutorialDialog.addEventListener('click', event => {
  if (event.target === els.pdfTutorialDialog) closePDFTutorial();
});
$('#closeTableDialog').addEventListener('click', closeTableDialog);
$('#cancelTable').addEventListener('click', closeTableDialog);
$('#confirmTable').addEventListener('click', insertTable);
els.tableDialog.addEventListener('click', event => {
  if (event.target === els.tableDialog) closeTableDialog();
});
$('#closeImageDialog').addEventListener('click', closeImageDialog);
$('#cancelImage').addEventListener('click', closeImageDialog);
$('#confirmImage').addEventListener('click', insertImageFromUrl);
$('#pickLocalImage').addEventListener('click', () => { closeImageDialog(); insertLocalImage(); });
els.imageWidth.addEventListener('input', updateImageWidthLabel);
els.imageDialog.addEventListener('click', event => {
  if (event.target === els.imageDialog) closeImageDialog();
});
els.imageUrl.addEventListener('keydown', event => {
  if (event.key === 'Enter') insertImageFromUrl();
});
$('#closeFormulaDialog').addEventListener('click', closeFormulaDialog);
$('#cancelFormula').addEventListener('click', closeFormulaDialog);
$('#insertFormula').addEventListener('click', insertGeneratedFormula);
$('#openFormulaGuide').addEventListener('click', () => {
  Promise.resolve(window.quilliteMarkdown.openExternal(MATH_GUIDE_URL)).catch(error => reportSilentError(error, 'math-guide.open'));
});
els.formulaDialog.addEventListener('click', event => {
  if (event.target === els.formulaDialog) closeFormulaDialog();
});
els.formulaDisciplineTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-formula-discipline]');
  if (button) chooseFormulaDiscipline(button.dataset.formulaDiscipline);
});
els.formulaTemplateList.addEventListener('click', event => {
  const button = event.target.closest('[data-formula-template]');
  if (button) chooseFormulaTemplate(button.dataset.formulaTemplate);
});
els.formulaOutputModes.addEventListener('click', event => {
  const button = event.target.closest('[data-formula-mode]');
  if (button) chooseFormulaMode(button.dataset.formulaMode);
});
els.formulaFields.addEventListener('input', updateFormulaPreview);
$('#formulaNumber').addEventListener('input', updateFormulaPreview);
els.formulaMarkdownSource.addEventListener('input', updateFormulaPreviewFromMarkdown);
els.formulaMarkdownSource.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault();
    insertGeneratedFormula();
  }
});
els.formulaFields.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) insertGeneratedFormula();
});
$('#closeDiagramDialog').addEventListener('click', closeDiagramDialog);
$('#cancelDiagram').addEventListener('click', closeDiagramDialog);
$('#insertDiagram').addEventListener('click', insertGeneratedDiagram);
$('#openDiagramGuide').addEventListener('click', () => {
  Promise.resolve(window.quilliteMarkdown.openExternal(DIAGRAM_GUIDE_URL)).catch(error => reportSilentError(error, 'diagram-guide.open'));
});
els.diagramDialog.addEventListener('click', event => {
  if (event.target === els.diagramDialog) closeDiagramDialog();
});
els.diagramCategoryTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-diagram-category]');
  if (button) chooseDiagramCategory(button.dataset.diagramCategory);
});
els.diagramTemplateList.addEventListener('click', event => {
  const button = event.target.closest('[data-diagram-template]');
  if (button) chooseDiagramTemplate(button.dataset.diagramTemplate);
});
els.diagramSource.addEventListener('input', () => {
  rememberDiagramSource();
  scheduleDiagramPreview();
});
els.diagramSource.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault();
    insertGeneratedDiagram();
  }
});
$('#headingSelect').addEventListener('change', event => {
  formatSelectedLines('heading', event.target.value);
  event.target.value = '';
});
els.moreFormatButton.addEventListener('click', event => {
  event.stopPropagation();
  openMoreFormatMenu();
});
els.moreFormatMenu.addEventListener('click', event => {
  event.stopPropagation();
  const button = event.target.closest('[data-format-command]');
  if (!button) return;
  const command = button.dataset.formatCommand;
  closeMoreFormatMenu();
  if (command.startsWith('heading:')) formatSelectedLines('heading', command.slice(8));
  else runFormatCommand(command);
});
els.moreFormatMenu.addEventListener('keydown', event => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
  const items = [...els.moreFormatMenu.querySelectorAll('[role="menuitem"]')].filter(item => !item.closest('[hidden]'));
  if (!items.length) return;
  event.preventDefault();
  const current = Math.max(0, items.indexOf(document.activeElement));
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next].focus();
});
els.editorUndoButton.addEventListener('click', () => {
  if (codeEditor && state.editing) {
    undo(codeEditor);
    focusCodeEditor();
  }
});
$('#formatPainterButton').addEventListener('click', () => {
  if (!state.editing) toggleEditor(true);
  if (!codeEditor) return;
  if (copiedFormat) {
    clearCopiedFormat();
    showToast(t('formatCleared'));
  } else {
    copyFormatFromSelection();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && copiedFormat) {
    clearCopiedFormat();
    showToast(t('formatCleared'));
  }
});
els.exitEditButton.addEventListener('click', () => {
  if (state.editing) toggleEditor(false);
});
els.codeLangMenu.addEventListener('click', event => {
  event.stopPropagation();
  const button = event.target.closest('[data-code-lang]');
  if (!button) return;
  els.codeLangMenu.classList.add('hidden');
  if (insertCodeBlock(button.dataset.codeLang)) focusCodeEditor();
});
els.textColorMenu.addEventListener('click', event => {
  event.stopPropagation();
  const button = event.target.closest('[data-text-color]');
  if (!button) return;
  const color = button.dataset.textColor;
  closeTextColorMenu();
  syncTextColorChoice(color);
  if (!applyTextColor(color)) focusCodeEditor();
});
$('#editorFormatBar').addEventListener('click', event => {
  const button = event.target.closest('[data-format]');
  if (!button) return;
  if (button.dataset.format === 'code-block' || button.dataset.format === 'text-color') event.stopPropagation();
  runFormatCommand(button.dataset.format);
});
els.moreMenu.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button?.dataset.action;
  const language = button?.dataset.language;
  if (language) setLanguage(language);
  if (action === 'zoom-in') setFontScale(state.fontScale + .08);
  if (action === 'zoom-out') setFontScale(state.fontScale - .08);
  if (action === 'zoom-reset') setFontScale(1);
  if (button?.dataset.fontScale === 'auto') enableAutomaticFontScale();
  else if (button?.dataset.fontScale) setFontScale(Number(button.dataset.fontScale));
  if (button?.dataset.docWidth) setDocumentWidth(button.dataset.docWidth);
  if (action === 'default-app') {
    window.quilliteMarkdown.openDefaultApps();
    showToast(t('defaultAppHint'), 'info', 5200);
  }
  if (action === 'print') {
    printCurrentDocument();
  }
  if (action === 'export-word') exportWordDocument();
  if (action === 'export-html') exportHTMLDocument();
  if (action === 'export-pdf') exportPDFDocument();
  if (action === 'feedback') openFeedback();
  if (action === 'check-update') checkForUpdates(true);
  if (action === 'about') openAbout();
  els.moreMenu.classList.add('hidden');
});
els.fontScaleSlider.addEventListener('input', event => setFontScale(Number(event.target.value) / 100, true));
els.fontScaleSlider.addEventListener('change', event => setFontScale(Number(event.target.value) / 100));
els.recentContextMenu.addEventListener('click', async event => {
  event.stopPropagation();
  const button = event.target.closest('[data-recent-action]');
  const encodedPath = els.recentContextMenu.dataset.path;
  if (!button || button.disabled || !encodedPath) return;
  const action = button.dataset.recentAction;
  const filePath = decodeURIComponent(encodedPath);
  closeRecentContextMenu();
  if (action === 'edit') await editRecentDocument(filePath);
  else if (action === 'save-as') await saveLibraryDocumentAs(filePath);
  else if (action === 'pin') await setRecentPinnedRecord(filePath, button.dataset.pinState === 'add');
  else if (action === 'favorite') await setFavoriteRecord(filePath, button.dataset.favoriteState === 'add');
  else if (action === 'reveal') await revealFileInFolder(filePath);
  else if (action === 'remove') await removeRecentRecord(filePath);
});
document.addEventListener('click', () => {
  els.moreMenu.classList.add('hidden');
  els.codeLangMenu.classList.add('hidden');
  closeMoreFormatMenu();
  closeDocumentActionsMenu();
  closeTextColorMenu();
  closeAccentMenu();
  closeRecentContextMenu();
});
els.fileList.addEventListener('scroll', closeRecentContextMenu, { passive: true });
window.addEventListener('resize', closeRecentContextMenu);
window.addEventListener('resize', scheduleAutomaticFontScaleRefresh);
$('.reader-pane').addEventListener('scroll', updateActiveToc, { passive: true });
$('.reader-pane').addEventListener('wheel', handlePreviewWheelZoom, { passive: false });
$('.editor-preview-scroll').addEventListener('wheel', handlePreviewWheelZoom, { passive: false });
$('.editor-preview-scroll').addEventListener('pointermove', showPreviewLocateHint, { passive: true });
$('.editor-preview-scroll').addEventListener('pointerleave', hidePreviewLocateHint);
$('.editor-preview-scroll').addEventListener('scroll', hidePreviewLocateHint, { passive: true });
els.editorPreview.addEventListener('contextmenu', locateEditorFromPreview);

document.addEventListener('keydown', event => {
  if (event.defaultPrevented) return;
  const primaryModifier = event.ctrlKey || event.metaKey;
  if (event.key === 'Escape' && cancelPinnedPointerReorder()) event.preventDefault();
  else if (primaryModifier && event.key.toLowerCase() === 'n') { event.preventDefault(); newFile(); }
  else if (primaryModifier && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); openFolder(); }
  else if (primaryModifier && event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); saveDocument(true); }
  else if (primaryModifier && event.key.toLowerCase() === 's') { event.preventDefault(); saveDocument(false); }
  else if (primaryModifier && event.key.toLowerCase() === 'e') { event.preventDefault(); toggleEditor(); }
  else if (primaryModifier && event.key.toLowerCase() === 'o') { event.preventDefault(); openFile(); }
  else if (primaryModifier && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch(); }
  else if (primaryModifier && event.key.toLowerCase() === 'p') { event.preventDefault(); printCurrentDocument(); }
  else if (primaryModifier && (event.key === '+' || event.key === '=')) { event.preventDefault(); setFontScale(state.fontScale + .08); }
  else if (primaryModifier && event.key === '-') { event.preventDefault(); setFontScale(state.fontScale - .08); }
  else if (primaryModifier && event.key === '0') { event.preventDefault(); setFontScale(1); }
  else if (event.key === 'Escape' && !els.recentContextMenu.classList.contains('hidden')) closeRecentContextMenu();
  else if (event.key === 'Escape' && !els.textColorMenu.classList.contains('hidden')) { closeTextColorMenu(); focusCodeEditor(); }
  else if (event.key === 'Escape' && !els.codeLangMenu.classList.contains('hidden')) { els.codeLangMenu.classList.add('hidden'); focusCodeEditor(); }
  else if (event.key === 'Escape' && !els.moreFormatMenu.classList.contains('hidden')) closeMoreFormatMenu(true);
  else if (event.key === 'Escape' && !els.accentMenu.classList.contains('hidden')) { closeAccentMenu(); $('#accentButton').focus(); }
  else if (event.key === 'Escape' && !els.documentActionsMenu.classList.contains('hidden')) { closeDocumentActionsMenu(); els.documentActionsMoreButton.focus(); }
  else if (event.key === 'Escape' && !els.diagramDialog.classList.contains('hidden')) closeDiagramDialog();
  else if (event.key === 'Escape' && !els.formulaDialog.classList.contains('hidden')) closeFormulaDialog();
  else if (event.key === 'Escape' && !els.tableDialog.classList.contains('hidden')) closeTableDialog();
  else if (event.key === 'Escape' && !els.imageDialog.classList.contains('hidden')) closeImageDialog();
  else if (event.key === 'Escape' && !els.editPermissionDialog.classList.contains('hidden')) closeEditPermissionDialog();
  else if (event.key === 'Escape' && !els.pdfTutorialDialog.classList.contains('hidden')) closePDFTutorial();
  else if (event.key === 'Escape' && !els.updateDialog.classList.contains('hidden')) closeUpdate();
  else if (event.key === 'Escape' && !els.feedbackDialog.classList.contains('hidden')) closeFeedback();
  else if (event.key === 'Escape' && !els.aboutDialog.classList.contains('hidden')) closeAbout();
  else if (event.key === 'Escape' && !els.searchBar.classList.contains('hidden')) closeSearch();
});

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
let dragDepth = 0;
document.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; els.dropOverlay.classList.remove('hidden'); });
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('dragleave', event => { event.preventDefault(); dragDepth--; if (dragDepth <= 0) { dragDepth = 0; els.dropOverlay.classList.add('hidden'); } });
document.addEventListener('drop', async event => {
  event.preventDefault();
  dragDepth = 0;
  els.dropOverlay.classList.add('hidden');
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const filePath = window.quilliteMarkdown.pathForFile(file);
  if (!filePath) return;
  if (state.editing && IMAGE_FILE_PATTERN.test(filePath)) {
    const dropPosition = codeEditor?.posAtCoords({ x: event.clientX, y: event.clientY });
    if (Number.isInteger(dropPosition)) codeEditor.dispatch({ selection: { anchor: dropPosition } });
    await importAndInsertImage(filePath, imageDescriptionFromName(file.name));
  } else if (/\.(md|markdown|mdown|mkd|txt)$/i.test(filePath)) loadFile(filePath);
  else showToast(t('dropUnsupported'), 'warning');
});

window.quilliteMarkdown.onFileDrop(paths => {
  dragDepth = 0;
  els.dropOverlay.classList.add('hidden');
  const filePath = paths[0];
  if (!filePath) return;
  if (state.editing && IMAGE_FILE_PATTERN.test(filePath)) importAndInsertImage(filePath);
  else if (/\.(md|markdown|mdown|mkd|txt)$/i.test(filePath)) loadFile(filePath);
  else showToast(t('dropUnsupported'), 'warning');
});

initializeFormatToolbarOverflow();
initializePaneResizers();
window.addEventListener('resize', scheduleMacWindowModeSync);
window.addEventListener('focus', () => {
  scheduleMacWindowModeSync();
  refreshCurrentFileFromDisk();
});
window.quilliteMarkdown.onOpenFile(doc => {
  if (!doc?.path || !maybeDiscardChanges()) return;
  setSidebarMode('recent');
  displayDocument(doc);
});
initialize();
setInterval(() => {
  if (state.editing && state.dirty && state.currentFile?.path && !state.saving) saveDocument(false, { auto: true, silent: true });
}, 10000);
