import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js/lib/common';
import { convertMermaidDiagramsToImages, refreshMermaidDiagrams, renderMermaidDiagrams } from './mermaid-diagrams.js';
import { convertEChartsDiagramsToImages, refreshEChartsDiagrams, releaseEChartsDiagrams, renderEChartsDiagrams, validateEChartsSource } from './echarts-diagrams.js';
import { DIAGRAM_CATEGORIES, diagramTemplateById, diagramTemplateSource, diagramTemplatesForCategory } from './diagram-templates.js';
import { FLOWCHART_SHAPES, addFlowchartEdge, addFlowchartNode, layoutFlowchart, parseFlowchartSource, removeFlowchartEdge, removeFlowchartNode, serializeFlowchart } from './flowchart-designer.js';
import { hasStructuredVisualEditor, parseStructuredDiagram, serializeStructuredDiagram, structuredDiagramDefinition } from './structured-diagram-editor.js';
import { findEditableDiagramFenceAt, diagramReplacementMarkdown } from './diagram-editing.js';
import { aiModelOptions } from './ai-model-options.js';
import { ACCENT_THEMES, normalizeAccentTheme, normalizeColorMode, readAppearanceStorage, resolveMacColorMode, temporaryMacColorModeAfterToggle } from './appearance.js';
import { previewWheelZoomDirection } from './font-wheel-zoom.js';
import { clampFontScale, readFontScaleStorage, recommendedFontScale } from './font-scaling.js';
import { escapeMarkdownText, highlightExtension, nextFootnoteNumber, prepareFootnotes, renderFootnoteSection } from './markdown-formats.js';
import { buildFormulaExpression, buildFormulaMarkdown, FORMULA_DISCIPLINES, FORMULA_GROUP_LABELS, formulaPreviewExpression, formulaTemplateById, formulaTemplatesForDiscipline, formulaValues, parseFormulaMarkdown } from './formula-templates.js';
import { findFormulaAt, scanMarkdownFormulas } from './formula-editing.js';
import { mathExtensions, renderLatex } from './math-rendering.js';
import { scanMarkdownBlockStartLines } from './preview-line-map.js';
import { directoryFromDocumentPath, filesFromPreferencePaths, isMissingDocumentError, normalizeSidebarMode, partitionRecentFiles, pinRecentFile, reorderPinnedRecentFiles, sameDocumentPath, unpinRecentFile, upsertRecentFile } from './library-state.js';
import { TEXT_COLOR_PALETTE, TEXT_COLOR_VALUES, textColorValue } from './text-colors.js';
import { createTableModel, findMarkdownTableAt, findMarkdownTables, removeTableColumn, removeTableRow, reorderTableColumn, reorderTableRow, resizeTableModel, serializeMarkdownTable, stripTableWidthMetadata, TABLE_LIMITS } from './table-designer.js';
import { hasRichClipboardHTML, htmlToMarkdown, markdownToPlainText } from './rich-clipboard.js';
import { hasOverlappingReviewSuggestions, locateAIReviewSuggestions } from './ai-review.js';
import { clampTocPreferredWidth, fitReaderSidePanels, scrollDeltaForBounds, tocDisplayMetrics, tocDisplaySignature, TOC_WIDTH_LIMITS } from './toc-display.js';
import { buildTocTree, filterTocTree, normalizeTocMode, readCollapsedToc, replaceDynamicTocMarkers, writeCollapsedToc } from './toc-tree.js';

const $ = selector => document.querySelector(selector);
const DOC_WIDTH_LEVELS = ['narrow', 'medium', 'wide', 'full'];
const DEFAULT_DOC_WIDTH = 'wide';
const MATH_GUIDE_URL = 'https://qm.ssssa.cn/guides/formulas/';
const DIAGRAM_GUIDE_URL = 'https://qm.ssssa.cn/guides/diagrams/';
const PICGO_DOWNLOAD_URL = 'https://picgo.app/';
const PANDOC_INSTALL_URL = 'https://pandoc.org/installing.html';
const PANDOC_EXPORT_FORMATS = new Set(['epub', 'rtf', 'odt', 'latex', 'mediawiki', 'custom']);
const EXPORT_FORMAT_DESCRIPTIONS = {
  docx: 'exportDescriptionDocx', html: 'exportDescriptionHtml', 'html-plain': 'exportDescriptionHtmlPlain',
  pdf: 'exportDescriptionPdf', png: 'exportDescriptionPng', jpeg: 'exportDescriptionJpeg', epub: 'exportDescriptionEpub',
  rtf: 'exportDescriptionRtf', odt: 'exportDescriptionOdt', latex: 'exportDescriptionLatex',
  mediawiki: 'exportDescriptionMediawiki', custom: 'exportDescriptionCustom'
};
const NEW_FILE_COOLDOWN_MS = 3000;
let codeEditor;
let editorExtensions = [];
let basicSetup;
let Compartment;
let StateEffect;
let StateField;
let EditorState;
let EditorView;
let Decoration;
let ViewPlugin;
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
let tableDesignerState = null;
let tableDesignerDrag = null;
let tableColumnResize = null;
let newFileRequestInProgress = false;
let newFileCooldownUntil = 0;
let newFileCooldownTimer = null;
let editorClipboardSelection = null;
let aiRewriteSelection = null;
let pendingAIRewriteSelection = null;
let pendingAIRewriteAction = '';
let aiRewriteRequest = 0;
let aiRewriteProgressTimer = 0;
let aiRewriteStartedAt = 0;
let pendingAIDocumentReview = false;
let resumeAIDocumentReviewAfterSettings = false;
let aiReviewSnapshot = '';
let aiReviewSuggestions = [];
let aiReviewSessionActive = false;
let aiReviewApplied = false;
let aiReviewRequest = 0;
let aiReviewProgressTimer = 0;
let aiReviewStartedAt = 0;
let currentAISettings = null;
let aiSettingsEditingKey = false;
let aiModelLoadRequest = 0;
let aiModelAutoLoadTimer = 0;
let aiSettingsLoadRequest = 0;
let aiModelsLoading = false;
const aiModelsByProvider = new Map();
let spellingContext = null;
let spellcheckDecorationEffect;
let spellcheckDecorationField;
let spellcheckViewPlugin;
let activeSpellchecker = null;
let activeSpellcheckLanguage = '';
let spellcheckDictionaryPromise = null;
let spellcheckLoadGeneration = 0;
const spellcheckDictionaryCache = new Map();
let spellcheckRuntimePromise = null;

function normalizeSpellcheckLanguage(value) {
  return ['auto', 'en-US', 'en-GB'].includes(value) ? value : 'auto';
}

function normalizeStoredPersonalWords(words) {
  if (!Array.isArray(words)) return [];
  const unique = new Map();
  for (const value of words) {
    const word = String(value || '').trim().replace(/’/g, "'");
    if (!/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(word)) continue;
    const key = word.toLocaleLowerCase('en');
    if (!unique.has(key)) unique.set(key, word);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
}

function loadSpellcheckRuntime() {
  if (!spellcheckRuntimePromise) {
    const promise = import('./spellcheck.js').then(module => {
      promise.resolved = module;
      return module;
    }).catch(error => {
      if (spellcheckRuntimePromise === promise) spellcheckRuntimePromise = null;
      throw error;
    });
    spellcheckRuntimePromise = promise;
  }
  return spellcheckRuntimePromise;
}

function readPersonalDictionary() {
  try {
    return normalizeStoredPersonalWords(JSON.parse(localStorage.getItem('spellcheckPersonalWords') || '[]'));
  } catch {
    return [];
  }
}

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

const FONT_FAMILY_PRESETS = new Set(['system', 'sans', 'serif', 'rounded', 'songti', 'kaiti']);

function normalizeFontFamily(value) {
  return FONT_FAMILY_PRESETS.has(value) ? value : 'system';
}

function fontFamilyCSS(value) {
  const preset = normalizeFontFamily(value);
  if (preset === 'sans') return 'Arial, "Helvetica Neue", "Microsoft YaHei UI", "PingFang SC", sans-serif';
  if (preset === 'serif') return 'Georgia, "Songti SC", SimSun, "Noto Serif CJK SC", serif';
  if (preset === 'rounded') return '"SF Pro Rounded", "Arial Rounded MT Bold", "Yuanti SC", YouYuan, "Microsoft YaHei UI", sans-serif';
  if (preset === 'songti') return '"Songti SC", STSong, SimSun, NSimSun, "Noto Serif CJK SC", serif';
  if (preset === 'kaiti') return '"Kaiti SC", STKaiti, KaiTi, "Noto Serif CJK SC", serif';
  return document.documentElement.dataset.platform === 'darwin'
    ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif'
    : '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", sans-serif';
}

const state = {
  currentFile: null,
  documentSession: 0,
  documentOpenRequest: 0,
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
  fontFamily: normalizeFontFamily(localStorage.getItem('fontFamily')),
  docWidth: normalizeDocWidth(localStorage.getItem('docWidth')),
  editorLayout: normalizeEditorLayout(localStorage.getItem('editorLayout')),
  language: localStorage.getItem('language') === 'en' ? 'en' : 'zh-CN',
  spellcheckEnabled: localStorage.getItem('spellcheckEnabled') !== 'false',
  spellcheckLanguage: normalizeSpellcheckLanguage(localStorage.getItem('spellcheckLanguage')),
  spellcheckPersonalWords: readPersonalDictionary(),
  spellcheckIgnoredWords: new Set(),
  sidebarPreferredWidth: initialSidebarPreferredWidth,
  sidebarWidth: initialSidebarPreferredWidth,
  tocDisplay: initialTocDisplay,
  tocWidthCustomized: storedTocWidth !== null,
  tocPreferredWidth: initialTocPreferredWidth,
  tocWidth: initialTocPreferredWidth,
  tocMode: normalizeTocMode(localStorage.getItem('tocMode')),
  tocQuery: '',
  tocAvailable: false,
  tocPanelCollapsed: localStorage.getItem('tocPanelCollapsed') === 'true',
  compactTocOpen: false,
  editorPreviewWidth: Number(localStorage.getItem('editorPreviewWidth') || 47),
  searchMatches: [],
  searchIndex: 0,
  editing: false,
  dirty: false,
  savedContent: '',
  updateInfo: null,
  usageAnalytics: true,
  imageUploadMode: 'local',
  picGoServerURL: 'http://127.0.0.1:36677',
  picGoHasSecret: false,
	picGoCloudHasToken: false,
	picGoCloudConnectionReady: false,
	picGoCloudUser: '',
  picGoSetupStep: 1,
  picGoConnectionReady: false,
  picGoDetectionRun: 0,
  imageUploadRun: 0,
  feedbackImages: [],
  feedbackSystemInfo: null,
  saving: false,
  saveAsRequired: false,
  saveWarningShown: false,
  exportSettings: { pandocPath: '', presets: [] },
  pandocStatus: { available: false, path: '', version: '' },
  exportDraft: { format: 'docx', header: '', footer: '', extraArguments: '', customWriter: 'plain', customExtension: '.txt', imageScale: 2, imageLayout: 'pages' },
  exportInProgress: false
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
    print: '打印', printTitle: '打印文档', moreDocumentActions: '更多', readingEnd: '阅读结束', livePreview: '实时预览', readingEffect: '阅读效果', previewLocateHint: '右键定位到编辑器 · 第 {line} 行', markdownEditorLabel: 'MARKDOWN 编辑器',
    untitledDocument: '未命名文档', saved: '已保存', unsaved: '尚未保存', autoSaved: '已自动保存', saveAs: '另存为', exitEdit: '退出编辑', markdownEditorAria: 'Markdown 编辑器',
    codeLang: '选择编程语言', codeNoLang: '无语言（纯文本）',
    editorShortcut: '<kbd>Ctrl</kbd> + <kbd>S</kbd> 保存　 <kbd>Ctrl</kbd> + <kbd>E</kbd> 预览', backToTop: '回到顶部', backToTopAria: '回到文档顶部',
    toc: '本页目录', tocViewMode: '目录显示方式', tocTreeMode: '折叠目录', tocFlatMode: '平铺目录', tocSearchPlaceholder: '搜索标题', clearTocSearch: '清除标题搜索', tocNoMatches: '没有匹配的标题', openCompactToc: '展开本页目录', closeCompactToc: '收起本页目录', dynamicTocTitle: '目录', expandTocSection: '展开“{title}”', collapseTocSection: '折叠“{title}”', releaseToOpen: '松开以打开文档', interfaceLanguage: '界面语言', softwareFont: '软件字体', fontSystem: '系统默认', fontSans: '无衬线', fontSerif: '衬线', fontRounded: '圆体', fontSongti: '宋体', fontKaiti: '楷体', fontChanged: '软件字体已切换', fontSaveFailed: '无法保存字体设置', defaultApp: '设为默认 MD 应用', windowsSettings: 'Windows 设置',
    exportHTML: '导出 HTML', htmlExported: 'HTML 网页已导出', htmlExportFailed: 'HTML 导出失败', exportFileInUse: '导出文件正被其他程序占用，请关闭该文件后重试，或选择其他文件名',
    zoomIn: '放大文字', zoomOut: '缩小文字', zoomReset: '恢复字号', textSizePresets: '文字大小调节', textSizeControl: '文字大小', fontScaleDefault: '默认 100%', fontScaleShortcuts: '<span class="font-scale-shortcut"><kbd>Ctrl +</kbd><em>放大</em></span><span class="font-scale-shortcut"><kbd>Ctrl −</kbd><em>缩小</em></span><span class="font-scale-shortcut"><kbd>Ctrl 0</kbd><em>默认</em></span>', fontScaleAuto: '自动适配显示器', autoFontScaleEnabled: '已自动适配显示器：{percent}%', exportDocument: '导出文档', exportWord: '导出 Word', exportPDF: '导出 PDF', systemPrint: '系统打印', wordExported: 'Word 文档已导出', wordExportFailed: 'Word 导出失败', pdfExportHint: '请在系统打印窗口中选择“Microsoft Print to PDF”或“存储为 PDF”', pdfTutorialLabel: 'PDF 导出指南', pdfTutorialTitle: '使用系统打印保存 PDF', pdfTutorialIntro: '为了尽量保持 Markdown 预览中的表格、代码块和图片样式，轻阅将打开系统打印窗口。请按下面步骤保存为 PDF。', pdfTutorialStep1Title: '打开系统打印', pdfTutorialStep1Text: '点击下方继续按钮，等待打印窗口出现。', pdfTutorialStep2Title: '选择 PDF 选项', pdfTutorialStep2Text: 'Windows 选择“Microsoft Print to PDF”；macOS 选择“存储为 PDF”。', pdfTutorialStep3Title: '选择位置并保存', pdfTutorialStep3Text: '确认打印后，输入文件名并选择保存目录。', pdfWindowsPrintTitle: '打印', pdfPrinterLabel: '打印机', pdfPagesLabel: '页面', pdfAllPages: '全部', pdfPrintButton: '打印', pdfWindowsCallout: '在“打印机”中选择 Microsoft Print to PDF', pdfMacPrintTitle: '打印', pdfSelectedPrinter: '已选择的打印机', pdfPresetsLabel: '预设', pdfDefaultPreset: '默认设置', pdfSaveAsPDF: '存储为 PDF…', pdfMacCallout: '打开左下角 PDF 菜单并选择“存储为 PDF”', pdfTutorialNote: '打印窗口由操作系统提供，实际界面可能因系统版本略有不同。', pdfContinueToPrint: '继续并打开打印窗口', exportNoDocument: '请先打开一个文档', printDocument: '打印文档', copy: '复制', copied: '已复制',
    clipboardOptions: '复制选项', copyAsMarkdown: '复制为 Markdown', copyAsPlainText: '复制为纯文本', copiedAsMarkdown: '已复制 Markdown 源码', copiedAsPlainText: '已复制纯文本', clipboardCopyFailed: '无法写入剪贴板', richPasteConverted: '已将网页或 Word 富文本转换为 Markdown',
    spellcheck: '拼写检查', spellcheckEnabled: '标记英文错词', spellcheckLanguage: '词典语言', spellcheckAuto: '自动', spellcheckUS: 'English (US)', spellcheckGB: 'English (UK)', clearPersonalDictionary: '清空个人词典', personalDictionaryCount: '{count} 个词', spellcheckLoadFailed: '拼写词典加载失败', spellingSuggestions: '拼写建议', noSpellingSuggestions: '暂无纠错建议', ignoreSpellingWord: '在本文中忽略', addToPersonalDictionary: '加入个人词典', spellingIgnored: '已在本文中忽略“{word}”', spellingAdded: '已将“{word}”加入个人词典', clearPersonalDictionaryConfirm: '确定清空个人词典吗？已加入的词将重新参与拼写检查。', personalDictionaryCleared: '个人词典已清空', personalDictionaryEmpty: '个人词典中还没有词',
    docWidth: '文档宽度', widthNarrow: '窄', widthMedium: '中', widthWide: '宽', widthFull: '全宽', docWidthChanged: '文档宽度：{level}',
    editorLayout: '编辑布局', previewOnLeft: '预览在左', editorOnLeft: '编辑在左', swapEditorLayout: '切换编辑与预览位置', editorLayoutChanged: '编辑布局：{layout}',
    bodyFontScale: '文字字号 {percent}%', recentOpened: '最近打开', pinnedRecentGroup: '置顶', ordinaryRecentGroup: '最近', pinnedRecent: '已置顶', pinRecent: '置顶', unpinRecent: '取消置顶', pinRecentAdded: '已置顶文档', pinRecentRemoved: '已取消置顶', pinRecentUnavailable: '文件已不可用，未能置顶；最近列表已重新同步', reorderPinnedRecent: '拖动或使用上下方向键调整“{name}”的置顶顺序', pinnedOrderPosition: '已将“{name}”移到置顶第 {position} 项，共 {total} 项', pinRecentSaveFailed: '置顶状态保存失败，已恢复并重新同步', pinnedOrderSaveFailed: '置顶顺序保存失败，已恢复并重新同步', favorited: '已收藏', favoriteDocument: '收藏文档', unfavoriteDocument: '取消收藏', favoriteAdded: '已收藏文档', favoriteRemoved: '已取消收藏，原文件未删除', recentContextHint: '右键打开文档操作菜单', recentContextMenuTitle: '文档操作', recentEdit: '编辑', recentSaveAs: '另存为', recentReveal: '打开所在文件夹', recentRemove: '移除', recentRevealFailed: '无法打开文件所在目录', recentMissing: '文件不存在', recentMissingTitle: '文件已删除、移动，或所在磁盘当前不可用', currentDocumentMissing: '原文件已移动或删除，当前预览内容已保留', recentMissingAria: '{name}，文件不存在', recentRemoved: '已从最近阅读中移除，原文件未删除', emptyRecent: '还没有最近文档', emptyFavorites: '还没有收藏文档', emptyExplorer: '请先打开一个文件夹',
    markdownDocument: 'Markdown 文档',
    discardConfirm: '当前文档有尚未保存的更改。\n\n确定要放弃更改并继续吗？', previewError: '暂时无法渲染当前内容',
    readingTime: '约 {minutes} 分钟 · {words} 字', renderFailed: 'Markdown 渲染失败', openFailed: '无法打开这个文件', macAccessNotGranted: '未获得该文档的访问权限，请重新选择原文件并确认打开',
    editorPosition: '第 {line} 行，第 {column} 列', saveAsDone: '文档已另存为', saveDone: '文档已保存', saveFailed: '保存失败，请检查文件权限', saveAsRequired: '需要另存为', editPermissionDenied: '当前文件无编辑权限，可能是微信缓存只读或正被其他程序占用。请另存为可编辑副本后再编辑', editPermissionLabel: '编辑权限', editPermissionTitle: '当前文件无法直接编辑', editPermissionDescription: '轻阅无法获得这个文件的写入权限。原文件不会被修改或删除。', currentDocument: '当前文档', possibleReasons: '可能原因', permissionReasonCache: '文件来自微信、企业微信等应用的只读缓存目录', permissionReasonReadOnly: '文件或所在目录被设置为只读，当前账号没有写入权限', permissionReasonLocked: '文件正被其他程序占用或锁定', editPermissionGuide: '建议另存为一个可编辑副本。保存成功后，轻阅会自动打开副本并进入编辑模式。', saveCopyAndEdit: '另存为副本并编辑', saveAsRequiredHint: '原文件可能来自微信缓存、处于只读状态或正被其他程序占用，请另存为后继续编辑', saveAsFallback: '原文件无法直接写入，已为你打开“另存为”',
    folderOpenFailed: '无法打开文件夹中的文档', defaultAppHint: '请在“按文件类型指定默认应用”中选择 .md', dropUnsupported: '请拖入 Markdown 或文本文件',
    exportCenter: '导出中心', exportFormatsCount: '12 种导出格式', exportEyebrow: '导出', exportCenterHint: '选择用途和格式，轻阅会自动采用合适的导出设置。', exportCategoryDocument: '文档', exportCategoryWeb: '网页', exportCategoryImage: '图片', exportAdvancedFormats: '更多专业格式', exportAdvancedHint: '需要 Pandoc', exportPreset: '导出预设', currentExportSettings: '当前设置', presetName: '预设名称', presetNamePlaceholder: '例如：公众号长图', savePreset: '保存预设', deletePreset: '删除', exportFormat: '导出格式', exportFormatWord: 'Word 文档', exportFormatStyledHTML: '带样式网页', exportFormatPlainHTML: '无样式网页', exportFormatPDF: '系统打印', exportFormatPNG: '高清图片', exportFormatJPEG: '压缩图片', exportFormatEPUB: '电子书', exportFormatRTF: '富文本', exportFormatODT: '开放文档', exportFormatLatex: '排版源码', exportFormatCustom: '自定义格式', exportHeaderFooter: '页眉与页脚', exportVariablesHint: '支持 {title}、{date}、{page}', exportHeader: '页眉', exportFooter: '页脚', exportHeaderPlaceholder: '例如：{title}', exportFooterPlaceholder: '例如：第 {page} 页', exportHeaderFooterHint: 'PDF 会重复显示在每页；其他格式显示在文档开头和结尾。', imageExportOptions: '图片选项', imageResolution: '清晰度', pandocNotDetected: '尚未检测到 Pandoc', pandocDetected: '已检测到 {version}', pandocPathPlaceholder: '自动检测或选择 pandoc', pandocSetupHint: '此格式需要 Pandoc。轻阅会先自动检测；没有安装时再选择安装或指定文件。', detectPandoc: '重新检测', selectPandoc: '选择文件', installPandoc: '安装 Pandoc ↗', pandocWriter: '输出 writer', fileExtension: '文件扩展名', pandocArguments: '自定义 Pandoc 命令参数', pandocSecurityHint: '参数直接传给 Pandoc，不经过系统 shell；输出路径始终由保存窗口决定。', exportNow: '立即导出', exporting: '正在生成，请稍候…', exportingImageSlices: '正在生成图片：{current}/{total}', exportSucceeded: '文档已导出', exportFailed: '导出失败', pandocRequired: '此格式需要先安装或选择 Pandoc', presetSaved: '导出预设已保存', presetDeleted: '导出预设已删除', presetNameRequired: '请输入预设名称', imageExportTooTall: '文档过长，无法生成图片，请缩短文档后重试', imageExportBlank: '图片渲染异常，未保存空白图片；请重试', exportDescriptionDocx: '保留标题、表格、代码、公式与图片，可继续编辑。', exportDescriptionHtml: '独立网页，保留当前主题、代码高亮与文档样式。', exportDescriptionHtmlPlain: '仅输出语义化 HTML，不附带主题或排版 CSS。', exportDescriptionPdf: '通过系统打印生成 PDF。', exportDescriptionPng: '自动以 2× 清晰度生成便于阅读的连续 PNG 图片。', exportDescriptionJpeg: '自动以 2× 清晰度生成体积更小的连续 JPEG 图片。', exportDescriptionEpub: '通过 Pandoc 生成适合电子阅读器的 EPUB 电子书。', exportDescriptionRtf: '通过 Pandoc 生成可由多数文字处理软件打开的 RTF。', exportDescriptionOdt: '通过 Pandoc 生成 LibreOffice 等支持的开放文档。', exportDescriptionLatex: '通过 Pandoc 生成可继续排版的 LaTeX 源文件。', exportDescriptionMediawiki: '通过 Pandoc 转换为 MediaWiki 标记文本。', exportDescriptionCustom: '指定 Pandoc writer 和扩展名，导出自定义格式。',
    imageOutputMode: '输出方式', imageOutputPages: 'A4 高清分页（推荐）', imageOutputLong: '单张长图（仅适合短文档）', imageOutputHint: '按 A4 高度逐页独立渲染，文字不会被整张缩小；选择单张长图时，超过 3 页的长文档也会自动改为 A4 高清分页。', exportingImagePages: '正在生成 A4 高清图片：{current}/{total}', longImageAutoPaged: '文档过长，已自动改为 {count} 张 A4 高清图片，避免整张缩小后模糊',
    languageChanged: '界面语言已切换为简体中文', about: '关于', aboutProductLabel: 'MARKDOWN 阅读与编辑器',
    aboutVersion: '版本 2.7.2', aboutDescription: '一款专注、美观、跨平台的 Markdown 阅读与编辑工具，支持实时预览、语法高亮、目录导航、最近阅读和文档收藏。',
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
    markdownTool: 'MARKDOWN 工具', tableDialogHint: '直接填写单元格，拖动行列调整顺序或列宽，并设置每列对齐方式。', visualTableEditor: '可视化表格编辑', editTable: '编辑表格', insertTableAction: '插入表格', saveTable: '保存表格', rows: '行数', columns: '列数', columnNumber: '第 {number} 列', headerRow: '表头', rowNumber: '第 {number} 行', addRow: '添加行', addColumn: '添加列', deleteRow: '删除行', deleteColumn: '删除列', alignment: '对齐', alignLeft: '左对齐', alignCenter: '居中', alignRight: '右对齐', dragTableHint: '拖动手柄调整行列顺序', resizeTableHint: '拖动列边界调整宽度', tableCellPlaceholder: '填写内容', tableMinimumSize: 'Markdown 表格至少需要 2 行、1 列', cancel: '取消', insert: '插入', newFileFailed: '无法新建文档', imageSelectFailed: '无法导入图片', imageImported: '图片已复制到 assets 资源目录', imagePasteFailed: '无法粘贴图片', languageSaveFailed: '无法保存语言设置，请重试', imageDialogHint: '选择本地图片或粘贴在线链接；本地图片会自动复制到 assets 资源目录。', imageUrlLabel: '图片链接', imageUrlPlaceholder: 'https:// 或 http:// 链接', imageAltPlaceholder: '可选的图片说明', imageWidth: '显示宽度', imageWidthHint: '拖拽和粘贴图片也会使用此宽度', localImage: '本地图片…', imageUrlInvalid: '请输入有效的 http:// 或 https:// 链接',
    chooseImage: '选择图片…', imageUploadSettings: '图床设置', imageUploadSettingsHint: '可直接登录 PicGo 在线图床，无需安装额外软件；也可继续使用本地 assets 或已安装的 PicGo。', imageInsertMode: '图片插入方式', localAssetsMode: '本地 assets', localAssetsModeHint: '保存相对路径，离线可用', localAssetsReadyTitle: '本地模式已就绪', localAssetsReadyHint: '图片会复制到文档旁的 assets，便于离线阅读和移动。', picGoCloudMode: 'PicGo 在线图床', picGoCloudModeHint: '浏览器登录，无需安装 PicGo', picGoCloudSetupTitle: '登录后直接上传', picGoCloudSetupHint: '将在浏览器打开 PicGo Cloud 登录页。登录令牌仅保存在本机；免费账户提供 200 个文件、500 MB 存储空间，额度与计费以 PicGo Cloud 为准。', picGoCloudConnectedTitle: 'PicGo Cloud 已连接', loginPicGoCloud: '登录 PicGo Cloud', logoutPicGoCloud: '退出登录', testPicGoCloud: '检查连接', picGoCloudSigningIn: '请在浏览器完成 PicGo Cloud 登录…', picGoCloudChecking: '正在检查 PicGo Cloud 连接…', picGoCloudConnected: '连接正常，可以启用在线图床', picGoCloudLoginFailed: 'PicGo Cloud 登录失败，请重试', picGoCloudConnectionFailed: 'PicGo Cloud 连接失效，请重新登录', picGoCloudLoggedOut: '已退出 PicGo Cloud', picGoMode: '本机 PicGo', picGoModeHint: '兼容已安装的 PicGo 与其他图床', picGoSetupProgress: '本机 PicGo 配置进度', picGoSetupInstallShort: '安装 PicGo', picGoSetupConfigureShort: '配置并检测', picGoSetupReadyShort: '完成', picGoSetupStep1: '第 1 步', picGoSetupInstallTitle: '安装并启动 PicGo', picGoSetupInstallHint: '此兼容模式需要安装 PicGo。安装后打开，并让它保持在后台运行。', downloadPicGo: '打开 PicGo 下载页', picGoInstalledNext: '已经安装，下一步', picGoSetupStep2: '第 2 步', picGoSetupConfigureTitle: '配置图床并开启 Server', picGoSetupConfigureHost: '在 PicGo 中配置要使用的图床。', picGoSetupEnableServer: '打开“PicGo 设置 → PicGo-Server”，确认服务已开启，端口为 36677。', picGoSetupKeepRunning: '保持 PicGo 在后台运行，然后让轻阅自动检测。', picGoSetupBack: '上一步', autoDetectPicGo: '自动检测 PicGo', picGoSetupStep3: '第 3 步', picGoSetupReadyTitle: '本机 PicGo 已连接', picGoSetupReadyHint: '保存后，粘贴、拖拽和选择的图片将自动上传；失败时仍会安全使用本地 assets。', picGoAdvancedSettings: '高级设置', picGoServerURL: 'PicGo 服务地址', picGoSecret: '服务密钥（可选）', picGoSecretPlaceholder: '留空则保留已保存密钥', clearPicGoSecret: '清除已保存密钥', picGoSecurityHint: '默认无需修改。仅允许连接本机 localhost 地址；第三方图床密钥继续由 PicGo 管理。', testPicGo: '测试连接', saveSettings: '保存设置', enablePicGo: '启用在线图床', picGoTesting: '正在自动检测 PicGo…', picGoConnected: '检测成功，可以启用本机 PicGo', picGoConnectionFailed: '没有检测到 PicGo。请确认 PicGo 正在运行并已开启 36677 端口的 PicGo-Server；如改过地址或密钥，请在高级设置中核对。', imageUploadSettingsSaved: '图床设置已保存', imageUploadSettingsSaveFailed: '图床设置保存失败', imageUploaded: '图片已上传到在线图床', picGoUploadFailedFallback: '在线图床上传失败，已自动使用本地图片', imageUploadingTitle: '正在上传图片', imageUploadPreparing: '正在准备图片…', imageUploadingCloud: '正在上传到 PicGo Cloud…', imageUploadingLocalPicGo: '正在发送到本机 PicGo…', imageUploadFinalizing: '正在生成在线链接…', imageUploadComplete: '上传完成',
    formulaWizardLabel: '学科公式', formulaWizardTitle: '选择并生成公式', formulaWizardHint: '按学科选择常用公式，填写参数后直接插入 Markdown。', formulaEditTitle: '修改当前公式', formulaEditHint: '直接修改参数、公式源码或插入方式，保存后会原位替换当前公式。', editFormulaDirectly: '编辑当前公式', formulaPreviewEditHint: '双击修改此公式', formulaSubject: '学科分类', formulaOutput: '插入方式', selectedFormula: '已选公式', equationNumber: '公式编号', formulaPreview: '实时预览', generatedMarkdown: '生成的 Markdown', insertFormula: '插入公式', saveFormulaChanges: '保存修改', formulaModeInline: '行内公式', formulaModeBlock: '块级公式', formulaModeNumbered: '编号公式', formulaInvalid: '请填写有效的公式内容',
    diagramWizardLabel: 'MERMAID 图表', diagramWizardTitle: '选择并生成图表', diagramWizardHint: '带画布图标的常用图表支持可视化编辑；其他图表可编辑源码并实时预览。', diagramCategory: '图表分类', selectedDiagram: '已选图表', diagramSource: '图表源码', diagramPreview: '实时预览', insertDiagram: '插入图表', saveDiagramChanges: '保存修改', editFlowchartVisually: '在画布中编辑流程图', visualEditorAvailable: '支持可视化编辑', structuredDiagramEditorAria: '可视化图表数据编辑器', structuredDiagramAddRow: '添加一行', structuredDiagramHint: '直接修改字段，右侧预览会实时更新。', structuredDiagramRemoveRow: '删除此行', diagramInvalid: '请输入有效的 Mermaid 图表源码', diagramFullscreen: '全屏绘图', diagramExitFullscreen: '退出全屏',
    flowchartVisualMode: '可视化编辑', flowchartSourceMode: '源码模式', flowchartVisualSafeHint: '操作会自动生成兼容 Mermaid 的源码', flowchartEditModeAria: '流程图编辑方式', flowchartEditorAria: '可视化流程图编辑器', flowchartAddAria: '添加流程图节点', flowchartCanvasAria: '可编辑流程图画布', flowchartZoomAria: '画布缩放', flowchartZoomOut: '缩小画布', flowchartZoomIn: '放大画布', flowchartZoomReset: '恢复 100%', flowchartProcess: '步骤', flowchartDecision: '判断', flowchartTerminal: '开始／结束', flowchartAddProcess: '添加处理步骤', flowchartAddDecision: '添加判断分支', flowchartAddTerminal: '添加开始或结束', flowchartConnect: '连接节点', flowchartConnectHint: '依次点击两个节点创建连线', flowchartAutoLayout: '自动排列', flowchartAutoLayoutHint: '按照流程方向自动排列', flowchartDirection: '流程方向', flowchartDirectionLR: '左 → 右', flowchartDirectionTD: '上 → 下', flowchartDirectionRL: '右 → 左', flowchartDirectionBT: '下 → 上', flowchartCanvasHint: '双击空白处添加步骤；拖动节点调整位置；连接模式下依次点击两个节点。', flowchartProperties: '所选元素', flowchartNothingSelected: '点击节点或连线后，可在这里修改。', flowchartNodeText: '节点文字', flowchartNodeShape: '节点形状', flowchartEdgeText: '连线文字', flowchartEdgeStyle: '连线样式', flowchartEdgeSolid: '箭头', flowchartEdgeDashed: '虚线箭头', flowchartEdgeThick: '粗箭头', flowchartEdgeLine: '无箭头直线', flowchartDeleteSelection: '删除所选元素', flowchartConnectActive: '请点击起点节点', flowchartConnectTarget: '再点击终点节点', flowchartVisualUnsupported: '当前源码包含子图、样式或其他高级语法，请继续使用源码模式，避免内容丢失。', flowchartNodeDefault: '新步骤', flowchartDecisionDefault: '是否满足条件？', flowchartTerminalDefault: '开始／结束',
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
    toc: 'ON THIS PAGE', tocViewMode: 'Outline view', tocTreeMode: 'Collapsible outline', tocFlatMode: 'Flat outline', tocSearchPlaceholder: 'Search headings', clearTocSearch: 'Clear heading search', tocNoMatches: 'No matching headings', openCompactToc: 'Open table of contents', closeCompactToc: 'Close table of contents', dynamicTocTitle: 'Table of contents', expandTocSection: 'Expand “{title}”', collapseTocSection: 'Collapse “{title}”', releaseToOpen: 'Release to open document', interfaceLanguage: 'Interface language', softwareFont: 'App font', fontSystem: 'System', fontSans: 'Sans serif', fontSerif: 'Serif', fontRounded: 'Rounded', fontSongti: 'Song style', fontKaiti: 'Kai style', fontChanged: 'App font changed', fontSaveFailed: 'Unable to save the font setting', defaultApp: 'Set as default MD app', windowsSettings: 'Windows Settings',
    exportHTML: 'Export HTML', htmlExported: 'HTML page exported', htmlExportFailed: 'HTML export failed', exportFileInUse: 'The export file is open in another app. Close it and try again, or choose a different file name.',
    zoomIn: 'Increase text size', zoomOut: 'Decrease text size', zoomReset: 'Reset text size', textSizePresets: 'Text size control', textSizeControl: 'Text size', fontScaleDefault: 'Default 100%', fontScaleShortcuts: '<span class="font-scale-shortcut"><kbd>Ctrl +</kbd><em>Larger</em></span><span class="font-scale-shortcut"><kbd>Ctrl −</kbd><em>Smaller</em></span><span class="font-scale-shortcut"><kbd>Ctrl 0</kbd><em>Default</em></span>', fontScaleAuto: 'Fit to display automatically', autoFontScaleEnabled: 'Display-adapted text size: {percent}%', exportDocument: 'Export document', exportWord: 'Export Word', exportPDF: 'Export PDF', systemPrint: 'System print', wordExported: 'Word document exported', wordExportFailed: 'Word export failed', pdfExportHint: 'Choose “Microsoft Print to PDF” or “Save as PDF” in the system print dialog', pdfTutorialLabel: 'PDF EXPORT GUIDE', pdfTutorialTitle: 'Save a PDF with system printing', pdfTutorialIntro: 'To preserve the tables, code blocks, images, and overall Markdown preview styling, Quillite opens the system print window. Follow these steps to save a PDF.', pdfTutorialStep1Title: 'Open system printing', pdfTutorialStep1Text: 'Select Continue below and wait for the print window to appear.', pdfTutorialStep2Title: 'Choose the PDF option', pdfTutorialStep2Text: 'On Windows choose “Microsoft Print to PDF”; on macOS choose “Save as PDF”.', pdfTutorialStep3Title: 'Choose a location and save', pdfTutorialStep3Text: 'Confirm printing, enter a file name, and choose the destination folder.', pdfWindowsPrintTitle: 'Print', pdfPrinterLabel: 'Printer', pdfPagesLabel: 'Pages', pdfAllPages: 'All', pdfPrintButton: 'Print', pdfWindowsCallout: 'Choose Microsoft Print to PDF under Printer', pdfMacPrintTitle: 'Print', pdfSelectedPrinter: 'Selected printer', pdfPresetsLabel: 'Presets', pdfDefaultPreset: 'Default Settings', pdfSaveAsPDF: 'Save as PDF…', pdfMacCallout: 'Open the PDF menu at bottom left and choose “Save as PDF”', pdfTutorialNote: 'The print window is provided by your operating system, so its appearance may vary slightly by system version.', pdfContinueToPrint: 'Continue to print window', exportNoDocument: 'Open a document first', printDocument: 'Print document', copy: 'Copy', copied: 'Copied',
    clipboardOptions: 'Copy options', copyAsMarkdown: 'Copy as Markdown', copyAsPlainText: 'Copy as plain text', copiedAsMarkdown: 'Markdown source copied', copiedAsPlainText: 'Plain text copied', clipboardCopyFailed: 'Unable to write to the clipboard', richPasteConverted: 'Web or Word rich text converted to Markdown',
    spellcheck: 'Spell check', spellcheckEnabled: 'Mark misspelled English words', spellcheckLanguage: 'Dictionary language', spellcheckAuto: 'Auto', spellcheckUS: 'English (US)', spellcheckGB: 'English (UK)', clearPersonalDictionary: 'Clear personal dictionary', personalDictionaryCount: '{count} words', spellcheckLoadFailed: 'Unable to load the spelling dictionary', spellingSuggestions: 'Spelling suggestions', noSpellingSuggestions: 'No suggestions available', ignoreSpellingWord: 'Ignore in this document', addToPersonalDictionary: 'Add to personal dictionary', spellingIgnored: '“{word}” ignored in this document', spellingAdded: '“{word}” added to your personal dictionary', clearPersonalDictionaryConfirm: 'Clear the personal dictionary? Added words will be checked again.', personalDictionaryCleared: 'Personal dictionary cleared', personalDictionaryEmpty: 'Your personal dictionary is empty',
    docWidth: 'Document width', widthNarrow: 'Narrow', widthMedium: 'Medium', widthWide: 'Wide', widthFull: 'Full width', docWidthChanged: 'Document width: {level}',
    editorLayout: 'Editor layout', previewOnLeft: 'Preview on left', editorOnLeft: 'Editor on left', swapEditorLayout: 'Swap editor and preview', editorLayoutChanged: 'Editor layout: {layout}',
    bodyFontScale: 'Text size {percent}%', recentOpened: 'Recently opened', pinnedRecentGroup: 'PINNED', ordinaryRecentGroup: 'RECENT', pinnedRecent: 'Pinned', pinRecent: 'Pin', unpinRecent: 'Unpin', pinRecentAdded: 'Document pinned', pinRecentRemoved: 'Document unpinned', pinRecentUnavailable: 'The file is no longer available and was not pinned. Recent documents were synced again.', reorderPinnedRecent: 'Drag or use the up and down arrow keys to reorder pinned document “{name}”', pinnedOrderPosition: 'Moved “{name}” to pinned position {position} of {total}', pinRecentSaveFailed: 'Could not save the pinned state. The list was restored and synced again.', pinnedOrderSaveFailed: 'Could not save the pinned order. The list was restored and synced again.', favorited: 'Favorited', favoriteDocument: 'Add to Favorites', unfavoriteDocument: 'Remove from Favorites', favoriteAdded: 'Document added to Favorites', favoriteRemoved: 'Removed from Favorites. The original file was not deleted.', recentContextHint: 'Right-click for document actions', recentContextMenuTitle: 'Document actions', recentEdit: 'Edit', recentSaveAs: 'Save As', recentReveal: 'Show in Folder', recentRemove: 'Remove', recentRevealFailed: 'Unable to show the file in its folder', recentMissing: 'File unavailable', recentMissingTitle: 'The file was deleted, moved, or its disk is currently unavailable', currentDocumentMissing: 'The original file was moved or deleted. The current preview has been preserved.', recentMissingAria: '{name}, file unavailable', recentRemoved: 'Removed from Recent. The original file was not deleted.', emptyRecent: 'No recent documents', emptyFavorites: 'No favorite documents', emptyExplorer: 'Open a folder to browse files',
    markdownDocument: 'Markdown document',
    discardConfirm: 'This document has unsaved changes.\n\nDiscard the changes and continue?', previewError: 'The current content cannot be rendered',
    readingTime: 'About {minutes} min · {words} words', renderFailed: 'Markdown rendering failed', openFailed: 'Unable to open this file', macAccessNotGranted: 'Access was not granted. Select the original document and confirm Open to restore access.',
    editorPosition: 'Line {line}, Column {column}', saveAsDone: 'Document saved as a new file', saveDone: 'Document saved', saveFailed: 'Save failed. Check file permissions.', saveAsRequired: 'Save As required', editPermissionDenied: 'This file cannot be edited because it may be a read-only app cache or locked by another program. Save a writable copy to continue editing.', editPermissionLabel: 'EDIT PERMISSION', editPermissionTitle: 'This file cannot be edited directly', editPermissionDescription: 'Quillite cannot obtain write access to this file. The original will not be changed or deleted.', currentDocument: 'Current document', possibleReasons: 'Possible reasons', permissionReasonCache: 'The file comes from a read-only WeChat, WeCom, or other application cache', permissionReasonReadOnly: 'The file or its folder is read-only, or your account lacks write permission', permissionReasonLocked: 'Another program currently has the file open or locked', editPermissionGuide: 'Save a writable copy instead. Quillite will open the copy and enter editing mode automatically after it is saved.', saveCopyAndEdit: 'Save Copy & Edit', saveAsRequiredHint: 'The source may be a read-only app cache or locked by another program. Save a writable copy to continue editing.', saveAsFallback: 'The source cannot be written. Save As has been opened for you.',
    folderOpenFailed: 'Unable to open a document from this folder', defaultAppHint: 'Choose this app for .md under “Choose defaults by file type”.', dropUnsupported: 'Drop a Markdown or text file',
    exportCenter: 'Export center', exportFormatsCount: '12 export formats', exportEyebrow: 'EXPORT', exportCenterHint: 'Choose a purpose and format. Quillite applies suitable export settings automatically.', exportCategoryDocument: 'Documents', exportCategoryWeb: 'Web', exportCategoryImage: 'Images', exportAdvancedFormats: 'More professional formats', exportAdvancedHint: 'Requires Pandoc', exportPreset: 'Export preset', currentExportSettings: 'Current settings', presetName: 'Preset name', presetNamePlaceholder: 'For example: Social image', savePreset: 'Save preset', deletePreset: 'Delete', exportFormat: 'Export format', exportFormatWord: 'Word document', exportFormatStyledHTML: 'Styled webpage', exportFormatPlainHTML: 'Unstyled webpage', exportFormatPDF: 'System print', exportFormatPNG: 'High-resolution images', exportFormatJPEG: 'Compressed images', exportFormatEPUB: 'E-book', exportFormatRTF: 'Rich text', exportFormatODT: 'Open document', exportFormatLatex: 'Typesetting source', exportFormatCustom: 'Custom format', exportHeaderFooter: 'Header and footer', exportVariablesHint: 'Supports {title}, {date}, and {page}', exportHeader: 'Header', exportFooter: 'Footer', exportHeaderPlaceholder: 'For example: {title}', exportFooterPlaceholder: 'For example: Page {page}', exportHeaderFooterHint: 'PDF repeats these on every page; other formats place them at the beginning and end.', imageExportOptions: 'Image options', imageResolution: 'Resolution', pandocNotDetected: 'Pandoc has not been detected', pandocDetected: 'Detected {version}', pandocPathPlaceholder: 'Detect or select pandoc', pandocSetupHint: 'This format requires Pandoc. Quillite detects it automatically; install it or choose the executable only when needed.', detectPandoc: 'Detect again', selectPandoc: 'Choose file', installPandoc: 'Install Pandoc ↗', pandocWriter: 'Output writer', fileExtension: 'File extension', pandocArguments: 'Custom Pandoc arguments', pandocSecurityHint: 'Arguments are passed directly to Pandoc without a system shell; the save dialog always controls the output path.', exportNow: 'Export now', exporting: 'Generating, please wait…', exportingImageSlices: 'Rendering images: {current}/{total}', exportSucceeded: 'Document exported', exportFailed: 'Export failed', pandocRequired: 'Install or select Pandoc before exporting this format', presetSaved: 'Export preset saved', presetDeleted: 'Export preset deleted', presetNameRequired: 'Enter a preset name', imageExportTooTall: 'This document is too long to export as images. Shorten it and try again.', imageExportBlank: 'Image rendering failed, so the blank file was not saved. Please try again.', exportDescriptionDocx: 'Preserves headings, tables, code, formulas, and images in an editable document.', exportDescriptionHtml: 'A standalone webpage that preserves the current theme, code highlighting, and document styling.', exportDescriptionHtmlPlain: 'Semantic HTML only, without theme or typography CSS.', exportDescriptionPdf: 'Uses system printing to create a PDF.', exportDescriptionPng: 'Automatically creates readable PNG pages at 2× resolution.', exportDescriptionJpeg: 'Automatically creates smaller JPEG pages at 2× resolution.', exportDescriptionEpub: 'Uses Pandoc to create an EPUB for e-book readers.', exportDescriptionRtf: 'Uses Pandoc to create an RTF supported by most word processors.', exportDescriptionOdt: 'Uses Pandoc to create an open document for LibreOffice and similar apps.', exportDescriptionLatex: 'Uses Pandoc to create editable LaTeX typesetting source.', exportDescriptionMediawiki: 'Uses Pandoc to convert the document to MediaWiki markup.', exportDescriptionCustom: 'Choose a Pandoc writer and extension for a custom format.',
    imageOutputMode: 'Output mode', imageOutputPages: 'A4 HD pages (recommended)', imageOutputLong: 'Single long image (short documents only)', imageOutputHint: 'Each A4-height page is rendered independently so text is never shrunk with the entire document. Long images over three pages automatically switch to A4 HD pages.', exportingImagePages: 'Rendering A4 HD image: {current}/{total}', longImageAutoPaged: 'This document is long, so it was exported as {count} A4 HD images to prevent fit-to-screen blur',
    languageChanged: 'Interface language changed to English', about: 'About', aboutProductLabel: 'MARKDOWN READER & EDITOR',
    aboutVersion: 'Version 2.7.2', aboutDescription: 'A focused, beautiful, cross-platform Markdown reader and editor with live preview, syntax highlighting, navigation, recent reading, and document favorites.',
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
    markdownTool: 'MARKDOWN TOOL', tableDialogHint: 'Edit cells directly, drag rows or columns to reorder or resize, and set alignment for each column.', visualTableEditor: 'Visual table editor', editTable: 'Edit table', insertTableAction: 'Insert table', saveTable: 'Save table', rows: 'Rows', columns: 'Columns', columnNumber: 'Column {number}', headerRow: 'Header', rowNumber: 'Row {number}', addRow: 'Add row', addColumn: 'Add column', deleteRow: 'Delete row', deleteColumn: 'Delete column', alignment: 'Alignment', alignLeft: 'Align left', alignCenter: 'Center', alignRight: 'Align right', dragTableHint: 'Drag handles to reorder rows or columns', resizeTableHint: 'Drag column borders to resize', tableCellPlaceholder: 'Enter content', tableMinimumSize: 'A Markdown table needs at least 2 rows and 1 column', cancel: 'Cancel', insert: 'Insert', newFileFailed: 'Unable to create the document', imageSelectFailed: 'Unable to import the image', imageImported: 'Image copied to the assets folder', imagePasteFailed: 'Unable to paste the image', languageSaveFailed: 'Unable to save the language setting. Please try again.', imageDialogHint: 'Pick a local image or paste an online link. Local images are copied to the assets folder automatically.', imageUrlLabel: 'Image URL', imageUrlPlaceholder: 'https:// or http:// link', imageAltPlaceholder: 'Optional image description', imageWidth: 'Display width', imageWidthHint: 'Dropped and pasted images use this width too', localImage: 'Local image…', imageUrlInvalid: 'Enter a valid http:// or https:// link',
    chooseImage: 'Choose image…', imageUploadSettings: 'Image hosting', imageUploadSettingsHint: 'Sign in to PicGo Cloud directly without installing another app, or keep local assets or an existing PicGo installation.', imageInsertMode: 'Image insertion mode', localAssetsMode: 'Local assets', localAssetsModeHint: 'Portable relative paths that work offline', localAssetsReadyTitle: 'Local mode is ready', localAssetsReadyHint: 'Images are copied to an assets folder beside the document for offline use and portability.', picGoCloudMode: 'PicGo Cloud', picGoCloudModeHint: 'Browser sign-in; no PicGo installation', picGoCloudSetupTitle: 'Sign in and upload directly', picGoCloudSetupHint: 'Quillite opens PicGo Cloud in your browser. The login token stays on this device. Free accounts include 200 files and 500 MB of storage; current limits and billing are controlled by PicGo Cloud.', picGoCloudConnectedTitle: 'PicGo Cloud connected', loginPicGoCloud: 'Sign in to PicGo Cloud', logoutPicGoCloud: 'Sign out', testPicGoCloud: 'Check connection', picGoCloudSigningIn: 'Complete PicGo Cloud sign-in in your browser…', picGoCloudChecking: 'Checking the PicGo Cloud connection…', picGoCloudConnected: 'Connected. Online hosting is ready to enable.', picGoCloudLoginFailed: 'PicGo Cloud sign-in failed. Please try again.', picGoCloudConnectionFailed: 'The PicGo Cloud connection expired. Sign in again.', picGoCloudLoggedOut: 'Signed out of PicGo Cloud', picGoMode: 'Local PicGo', picGoModeHint: 'Use an installed PicGo and its other providers', picGoSetupProgress: 'Local PicGo setup progress', picGoSetupInstallShort: 'Install PicGo', picGoSetupConfigureShort: 'Configure & detect', picGoSetupReadyShort: 'Ready', picGoSetupStep1: 'Step 1', picGoSetupInstallTitle: 'Install and start PicGo', picGoSetupInstallHint: 'This compatibility mode requires PicGo. Open it after installation and keep it running in the background.', downloadPicGo: 'Open PicGo download page', picGoInstalledNext: 'Installed — continue', picGoSetupStep2: 'Step 2', picGoSetupConfigureTitle: 'Configure hosting and enable Server', picGoSetupConfigureHost: 'Configure the provider you want to use inside PicGo.', picGoSetupEnableServer: 'Open PicGo Settings → PicGo-Server, enable it, and keep port 36677.', picGoSetupKeepRunning: 'Keep PicGo running in the background, then let Quillite detect it.', picGoSetupBack: 'Back', autoDetectPicGo: 'Detect PicGo automatically', picGoSetupStep3: 'Step 3', picGoSetupReadyTitle: 'Local PicGo connected', picGoSetupReadyHint: 'After saving, chosen, dropped, and pasted images upload automatically. Failures still fall back safely to local assets.', picGoAdvancedSettings: 'Advanced settings', picGoServerURL: 'PicGo server address', picGoSecret: 'Server secret (optional)', picGoSecretPlaceholder: 'Leave blank to keep the saved secret', clearPicGoSecret: 'Clear the saved secret', picGoSecurityHint: 'No changes are normally needed. Only localhost connections are allowed, and third-party provider credentials remain managed by PicGo.', testPicGo: 'Test connection', saveSettings: 'Save settings', enablePicGo: 'Enable online hosting', picGoTesting: 'Detecting PicGo automatically…', picGoConnected: 'Detection succeeded. Local PicGo is ready to enable.', picGoConnectionFailed: 'PicGo was not detected. Make sure it is running with PicGo-Server enabled on port 36677. If you changed the address or secret, check Advanced settings.', imageUploadSettingsSaved: 'Image hosting settings saved', imageUploadSettingsSaveFailed: 'Unable to save image hosting settings', imageUploaded: 'Image uploaded to online hosting', picGoUploadFailedFallback: 'Online upload failed; the local image was used instead', imageUploadingTitle: 'Uploading image', imageUploadPreparing: 'Preparing the image…', imageUploadingCloud: 'Uploading to PicGo Cloud…', imageUploadingLocalPicGo: 'Sending to local PicGo…', imageUploadFinalizing: 'Generating the online link…', imageUploadComplete: 'Upload complete',
    formulaWizardLabel: 'ACADEMIC FORMULAS', formulaWizardTitle: 'Choose and build a formula', formulaWizardHint: 'Choose a common formula by subject, fill in its values, and insert the generated Markdown.', formulaEditTitle: 'Edit current formula', formulaEditHint: 'Edit its values, source, or output mode; saving replaces the current formula in place.', editFormulaDirectly: 'Edit current formula', formulaPreviewEditHint: 'Double-click to edit this formula', formulaSubject: 'Subjects', formulaOutput: 'Insert as', selectedFormula: 'Selected formula', equationNumber: 'Equation number', formulaPreview: 'Live preview', generatedMarkdown: 'Generated Markdown', insertFormula: 'Insert formula', saveFormulaChanges: 'Save changes', formulaModeInline: 'Inline', formulaModeBlock: 'Display', formulaModeNumbered: 'Numbered', formulaInvalid: 'Enter valid formula content',
    diagramWizardLabel: 'MERMAID DIAGRAMS', diagramWizardTitle: 'Choose and build a diagram', diagramWizardHint: 'Popular diagrams marked with the canvas icon support visual editing; the others retain source editing and live preview.', diagramCategory: 'Diagram categories', selectedDiagram: 'Selected diagram', diagramSource: 'Diagram source', diagramPreview: 'Live preview', insertDiagram: 'Insert diagram', saveDiagramChanges: 'Save changes', editFlowchartVisually: 'Edit flowchart on canvas', visualEditorAvailable: 'Visual editing available', structuredDiagramEditorAria: 'Visual diagram data editor', structuredDiagramAddRow: 'Add row', structuredDiagramHint: 'Edit fields directly; the preview updates as you type.', structuredDiagramRemoveRow: 'Remove this row', diagramInvalid: 'Enter valid Mermaid diagram source', diagramFullscreen: 'Full-screen drawing', diagramExitFullscreen: 'Exit full screen',
    flowchartVisualMode: 'Visual editor', flowchartSourceMode: 'Source mode', flowchartVisualSafeHint: 'Actions automatically generate compatible Mermaid source', flowchartEditModeAria: 'Flowchart editing mode', flowchartEditorAria: 'Visual flowchart editor', flowchartAddAria: 'Add flowchart nodes', flowchartCanvasAria: 'Editable flowchart canvas', flowchartZoomAria: 'Canvas zoom', flowchartZoomOut: 'Zoom out', flowchartZoomIn: 'Zoom in', flowchartZoomReset: 'Reset to 100%', flowchartProcess: 'Process', flowchartDecision: 'Decision', flowchartTerminal: 'Start / end', flowchartAddProcess: 'Add a process node', flowchartAddDecision: 'Add a decision node', flowchartAddTerminal: 'Add a start or end node', flowchartConnect: 'Connect nodes', flowchartConnectHint: 'Click two nodes in order to create a connection', flowchartAutoLayout: 'Auto layout', flowchartAutoLayoutHint: 'Arrange nodes in the selected flow direction', flowchartDirection: 'Flow direction', flowchartDirectionLR: 'Left → right', flowchartDirectionTD: 'Top → bottom', flowchartDirectionRL: 'Right → left', flowchartDirectionBT: 'Bottom → top', flowchartCanvasHint: 'Double-click empty space to add a process; drag nodes to move them; in Connect mode, click two nodes.', flowchartProperties: 'Selected element', flowchartNothingSelected: 'Select a node or connection to edit it here.', flowchartNodeText: 'Node text', flowchartNodeShape: 'Node shape', flowchartEdgeText: 'Connection text', flowchartEdgeStyle: 'Connection style', flowchartEdgeSolid: 'Arrow', flowchartEdgeDashed: 'Dashed arrow', flowchartEdgeThick: 'Thick arrow', flowchartEdgeLine: 'Line without arrow', flowchartDeleteSelection: 'Delete selected element', flowchartConnectActive: 'Click the starting node', flowchartConnectTarget: 'Now click the target node', flowchartVisualUnsupported: 'This source contains subgraphs, styling, or other advanced syntax. Keep using Source mode so no content is lost.', flowchartNodeDefault: 'New step', flowchartDecisionDefault: 'Condition met?', flowchartTerminalDefault: 'Start / end',
    resizeSidebar: 'Drag to resize the library', resizeToc: 'Drag to resize the outline', resizeEditor: 'Drag to resize the preview'
  }
};

Object.assign(translations['zh-CN'], {
  flowchartSelectAll: '全选',
  flowchartSelectAllHint: '选择全部节点并整体移动',
  flowchartMultiSelected: '已选择 {count} 个节点，拖动任一节点可整体移动。',
  flowchartCanvasHint: '拖动空白处移动画布；全选后拖动任一节点可整体移动；双击空白处添加步骤。',
  canvasStateNode: '状态',
  canvasAddState: '添加状态',
  canvasStateTerminal: '初始／结束',
  canvasAddStateTerminal: '添加初始或结束状态',
  canvasMindmapChild: '子主题',
  canvasAddMindmapChild: '为所选主题添加子主题',
  canvasMindmapSibling: '同级主题',
  canvasAddMindmapSibling: '为所选主题添加同级主题',
  canvasMindmapConnect: '设为子主题',
  canvasStateHint: '拖动状态调整位置；连接模式下依次点击起始状态和目标状态；拖动空白处移动画布。',
  canvasMindmapHint: '选择主题后添加子主题或同级主题；连接模式下先点父主题再点子主题；拖动空白处移动画布。',
  editDiagramVisually: '在画布中编辑图表',
  editThisDiagram: '编辑此图表',
  diagramSourceChanged: '文档或图表内容已变化，请重新打开图表后编辑。',
  flowchartVisualSafeHint: '操作会自动生成兼容的图表源码',
  flowchartEditModeAria: '图表编辑方式',
  diagramVisualUnsupported: '当前源码包含循环、注释、元数据或其他高级配置，请继续使用源码模式，避免内容丢失。',
  pdfWithBookmarks: '标题书签',
  pdfExported: 'PDF 已导出并生成标题书签',
  pdfDirectFailed: 'PDF 直接导出失败',
  pdfEngineFallback: '未找到兼容的 Edge／Chrome，将改用系统打印',
  exportFormatPDF: '标题书签',
  exportDescriptionPdf: '直接生成 PDF，并根据 H1–H6 标题写入可点击的书签目录。'
});
Object.assign(translations.en, {
  flowchartSelectAll: 'Select all',
  flowchartSelectAllHint: 'Select every node and move them together',
  flowchartMultiSelected: '{count} nodes selected. Drag any selected node to move them together.',
  flowchartCanvasHint: 'Drag empty space to pan; select all and drag any node to move the group; double-click empty space to add a process.',
  canvasStateNode: 'State',
  canvasAddState: 'Add a state',
  canvasStateTerminal: 'Initial / final',
  canvasAddStateTerminal: 'Add an initial or final state',
  canvasMindmapChild: 'Child topic',
  canvasAddMindmapChild: 'Add a child to the selected topic',
  canvasMindmapSibling: 'Sibling topic',
  canvasAddMindmapSibling: 'Add a sibling to the selected topic',
  canvasMindmapConnect: 'Set as child',
  canvasStateHint: 'Drag states to move them; in Connect mode, click the source then target state; drag empty space to pan.',
  canvasMindmapHint: 'Select a topic to add a child or sibling; in Connect mode, click the parent then child; drag empty space to pan.',
  editDiagramVisually: 'Edit diagram on canvas',
  editThisDiagram: 'Edit this diagram',
  diagramSourceChanged: 'The document or diagram has changed. Reopen the diagram to edit it.',
  flowchartVisualSafeHint: 'Actions automatically generate compatible diagram source',
  flowchartEditModeAria: 'Diagram editing mode',
  diagramVisualUnsupported: 'This source contains loops, notes, metadata, or other advanced configuration. Keep using Source mode so no content is lost.',
  pdfWithBookmarks: 'Heading bookmarks',
  pdfExported: 'PDF exported with heading bookmarks',
  pdfDirectFailed: 'Direct PDF export failed',
  pdfEngineFallback: 'No compatible Edge or Chrome was found; falling back to system printing',
  exportFormatPDF: 'Heading bookmarks',
  exportDescriptionPdf: 'Creates a PDF directly and adds a clickable bookmark outline from H1–H6 headings.'
});

Object.assign(translations['zh-CN'], {
  aiAssistant: 'AI 助手', aiSettingsHint: '多模型', aiSelectionAction: '用 AI 编辑选中文字', aiEdit: 'AI编辑', aiEditTitle: '选中内容后点击“AI 编辑”，即可仅针对所选内容进行编辑。',
  aiSettingsLabel: 'AI 写作', aiSettingsTitle: 'AI 助手设置', aiSettingsIntro: '支持官方模型、阿里云百炼、硅基流动、OpenRouter 和自定义 OpenAI 兼容接口。选择服务并配置对应 API Key，即可使用 AI 编辑与文档检查。',
  aiProvider: '服务类型', aiProviderGroupOfficial: '官方服务', aiProviderGroupThirdParty: '第三方与兼容接口', aiProviderDeepSeek: 'DeepSeek', aiProviderZhipu: '智谱 GLM', aiProviderQwen: '通义千问', aiProviderOpenAI: 'OpenAI', aiProviderKimi: 'Kimi', aiProviderBailian: '阿里云百炼', aiProviderSiliconFlow: '硅基流动', aiProviderOpenRouter: 'OpenRouter', aiProviderCustom: '自定义 OpenAI 兼容接口', aiProviderDescription: '官方接口 · 自动配置服务地址', aiProviderAggregatorDescription: '第三方聚合平台 · 自动配置服务地址', aiProviderCustomDescription: '兼容接口 · 使用你填写的服务地址', aiBaseURL: 'API Base URL', aiBailianBaseURLHint: '默认使用百炼北京公共地址；业务空间或 Token Plan 用户请填写对应的兼容模式地址。填写地址和 Key 后会自动加载模型。', aiCustomBaseURLHint: '必须使用 HTTPS；仅 localhost 可使用 HTTP。请填写 API 根地址，不要包含 /chat/completions 或 /models；填写地址和 Key 后会自动加载模型。', aiModel: '模型', aiCustomModel: '模型名称', aiCustomModelPlaceholder: '输入或选择服务商提供的模型 ID', aiCustomModelHint: '填写 API Base URL 和 Key 后会自动加载模型；也可以手动输入模型 ID。', aiModelNotSelected: '未选择模型', aiModelRequired: '请先输入或选择模型', aiModelEmpty: '服务未返回可用的文本模型', aiRefreshModels: '刷新模型', aiModelLoading: '正在通过当前地址和 Key 加载可用模型…', aiModelLoaded: '已加载 {count} 个可用模型，请选择要使用的模型', aiModelLoadFailed: '模型列表刷新失败，已保留上次列表或内置候选；不代表账号实际可用', aiModelKeyRequired: '填写 API Key 后将自动加载账号可用模型。', aiAPIKey: 'API Key',
  aiAPIKeyPlaceholder: '例如：sk-xxxxxxxx', aiAPIKeySaved: '已保存在系统凭据库', aiAPIKeyNotSaved: '尚未配置 API Key', aiCurrentAPIKey: '当前 API Key', aiKeyReady: '已安全保存，可以使用 AI 编辑与检查',
  aiKeyGuideTitle: '填写所选服务的 API Key', aiKeyGuideHint: '前往所选 AI 服务的开放平台创建 Key，然后粘贴到下方。Key 仅保存在系统凭据库。', aiKeyRequiredGuide: '首次使用 AI 编辑，请先设置所选服务的 API Key。', aiReplacingKeyHint: '输入新的 Key，保存后将替换当前服务的 Key。', aiKeyRequired: '请输入所选服务的 API Key', aiSaveAndEnable: '保存并启用', aiSaveNewKey: '保存新 Key', aiEditKey: '修改', aiDeleteKey: '删除', aiDeleteKeyConfirm: '确定删除所选服务已保存的 API Key 吗？', aiKeyDeleted: 'API Key 已删除', aiKeyDeleteFailed: 'API Key 删除失败', aiDefaultModel: '默认模型', aiSetDefaultModel: '设为默认模型', aiDefaultModelChanged: '已将 {provider} 设为默认模型', aiDefaultModelChangeFailed: '无法设置默认模型',
  aiPrivacyNote: '只有你主动选择或确认检查的文档内容会发送给所选 AI 服务；不同服务的 API Key 独立保存在系统凭据库，不会写入偏好设置、日志或文档。', aiTestConnection: '测试连接', aiTestingConnection: '正在测试连接…', aiConnectionSuccess: '连接成功', aiConnectionFailed: '连接失败',
  aiSettingsSaved: 'AI 服务与 API Key 已保存', aiSettingsSaveFailed: 'AI 设置保存失败',
  aiRewriteTitle: 'AI编辑', aiAction: '处理方式', aiActionPolish: '润色', aiActionRewrite: '改写', aiActionConcise: '精简', aiActionExpand: '扩写', aiActionSummarize: '总结', aiActionTranslate: '翻译', aiActionCustom: '自定义要求',
  aiTargetLanguage: '目标语言', aiInstruction: '具体要求', aiInstructionPlaceholder: '例如：改成更专业、友好的产品说明', aiOriginalText: '原文', aiResultText: 'AI 结果', aiResultPlaceholder: '生成后可在这里继续微调',
  aiCloudConsent: '我确认将上述内容和要求发送给当前选择的 AI 服务处理', aiOpenSettings: '设置', aiGenerate: '生成', aiGenerating: '生成中…', aiRewriteConnecting: '正在连接 AI 服务', aiRewriteGenerating: 'AI 正在生成内容', aiRewriteRefining: '正在整理并检查生成结果', aiRewriteProgressMeta: '{provider} · {model} · 已用时 {seconds} 秒', aiReplaceSelection: '替换选中文字', aiInsertAtCursor: '插入到光标位置', aiSelectionReplaced: '已替换，可使用撤销恢复原文', aiContentInserted: '内容已插入，可使用撤销恢复',
  aiNeedSelection: '请先选择要处理的文字', aiNeedInstruction: '请填写具体要求', aiNeedCloudConsent: '请先确认同意发送选中文字', aiEmptyResult: 'AI 没有返回可用内容', aiSelectionChanged: '原文已发生变化，请重新选择后再试', aiRequestFailed: 'AI 处理失败',
  aiReview: 'AI检查', aiReviewTitle: '检查整篇文档并给出可选修改建议', aiReviewLabel: 'AI 文档检查', aiReviewDialogTitle: 'AI 文档检查', aiReviewIntro: '检查整篇文档的表达、拼写、标点、一致性和 Markdown 语法，并逐条选择要应用的修改。',
  aiReviewReadyTitle: '准备检查当前文档', aiReviewReadyHint: 'AI 只会返回可定位的修改建议，不会直接改动文档。', aiReviewConsent: '我确认将当前整篇文档发送给默认 AI 服务进行检查', aiStartReview: '开始检查', aiReviewChecking: '检查中…', aiReviewConnecting: '正在连接 AI 服务', aiReviewReading: 'AI 正在通读文档', aiReviewAnalysing: '正在分析错误与表达问题', aiReviewFormatting: '正在整理可选择的修改建议', aiReviewProgressMeta: '{provider} · {model} · 已用时 {seconds} 秒', aiReviewFailedTitle: '本次检查未完成', aiReviewFailedHint: '没有修改文档。你可以直接重新检查，或在“设置”中更换模型。', aiReviewNoIssuesTitle: '没有发现明确错误', aiReviewNoIssuesHint: '当前模型未返回需要修改的内容。你可以关闭窗口或再次检查。',
  aiReviewSummary: '共 {count} 条建议，已选择 {selected} 条', aiSelectAllSuggestions: '全选', aiClearAllSuggestions: '取消全选', aiApplySelected: '一键修改所选项', aiReviewAgain: '重新检查', aiReviewApplied: '已应用 {count} 条修改，检查结果将保留到退出编辑', aiReviewNothingSelected: '请至少选择一条建议', aiReviewDocumentChanged: '文档在检查后发生了变化，请重新检查，避免修改错位', aiReviewOverlap: '所选建议存在重叠，请只保留其中一条后再应用', aiReviewRequestFailed: 'AI 文档检查失败', aiReviewEmptyDocument: '当前文档没有可检查的内容', aiReviewTooLong: '当前文档超过 8 万字符，请分段使用 AI 编辑检查', aiReviewDeleteContent: '删除此内容',
  aiReviewOriginal: '原文', aiReviewReplacement: '建议修改', aiReviewCategoryGrammar: '语法', aiReviewCategorySpelling: '拼写', aiReviewCategoryPunctuation: '标点', aiReviewCategoryClarity: '表达', aiReviewCategoryConsistency: '一致性', aiReviewCategoryMarkdown: 'Markdown', aiReviewSeverityHigh: '重要', aiReviewSeverityMedium: '建议', aiReviewSeverityLow: '轻微'
});
Object.assign(translations.en, {
  aiAssistant: 'AI Assistant', aiSettingsHint: 'Multi-model', aiSelectionAction: 'Edit selection with AI', aiEdit: 'AI Edit', aiEditTitle: 'Select text first, then choose AI Edit to edit only the selected content',
  aiSettingsLabel: 'AI WRITING', aiSettingsTitle: 'AI Assistant settings', aiSettingsIntro: 'Supports official models, Alibaba Cloud Model Studio, SiliconFlow, OpenRouter, and custom OpenAI-compatible endpoints. Select a provider and configure its API key to use AI Edit and document checks.',
  aiProvider: 'Provider', aiProviderGroupOfficial: 'Official services', aiProviderGroupThirdParty: 'Third-party and compatible APIs', aiProviderDeepSeek: 'DeepSeek', aiProviderZhipu: 'Zhipu GLM', aiProviderQwen: 'Qwen', aiProviderOpenAI: 'OpenAI', aiProviderKimi: 'Kimi', aiProviderBailian: 'Alibaba Cloud Model Studio', aiProviderSiliconFlow: 'SiliconFlow', aiProviderOpenRouter: 'OpenRouter', aiProviderCustom: 'Custom OpenAI-compatible API', aiProviderDescription: 'Official API · endpoint configured automatically', aiProviderAggregatorDescription: 'Third-party gateway · endpoint configured automatically', aiProviderCustomDescription: 'Compatible API · uses the endpoint you enter', aiBaseURL: 'API Base URL', aiBailianBaseURLHint: 'Uses the public Beijing endpoint by default. Enter the matching compatible endpoint for a workspace or Token Plan. Models load automatically after the endpoint and key are entered.', aiCustomBaseURLHint: 'HTTPS is required; only localhost may use HTTP. Enter the API base URL without /chat/completions or /models. Models load automatically after the endpoint and key are entered.', aiModel: 'Model', aiCustomModel: 'Model name', aiCustomModelPlaceholder: 'Enter or select a model ID supplied by the service', aiCustomModelHint: 'Models load automatically after you enter the API base URL and key. You can also enter a model ID manually.', aiModelNotSelected: 'No model selected', aiModelRequired: 'Enter or select a model first', aiModelEmpty: 'The service returned no available text models', aiRefreshModels: 'Refresh models', aiModelLoading: 'Loading available models with the current endpoint and key…', aiModelLoaded: '{count} available models loaded; choose the model to use', aiModelLoadFailed: 'Could not refresh models. Previous results or built-in candidates are retained; availability is not verified', aiModelKeyRequired: 'Enter an API key to load the models available to this account automatically.', aiAPIKey: 'API Key',
  aiAPIKeyPlaceholder: 'For example: sk-xxxxxxxx', aiAPIKeySaved: 'Stored in the system credential vault', aiAPIKeyNotSaved: 'No API key configured', aiCurrentAPIKey: 'Current API key', aiKeyReady: 'Stored securely and ready for AI Edit and document checks',
  aiKeyGuideTitle: 'Enter the selected provider API key', aiKeyGuideHint: 'Create a key on the selected AI provider platform, then paste it below. It is stored only in the system credential vault.', aiKeyRequiredGuide: 'Set an API key for the selected provider before using AI Edit.', aiReplacingKeyHint: 'Enter a new key. Saving replaces this provider’s current key.', aiKeyRequired: 'Enter the selected provider API key', aiSaveAndEnable: 'Save and enable', aiSaveNewKey: 'Save new key', aiEditKey: 'Change', aiDeleteKey: 'Delete', aiDeleteKeyConfirm: 'Delete the saved API key for the selected provider?', aiKeyDeleted: 'API key deleted', aiKeyDeleteFailed: 'Unable to delete API key', aiDefaultModel: 'Default model', aiSetDefaultModel: 'Set as default', aiDefaultModelChanged: '{provider} is now the default model', aiDefaultModelChangeFailed: 'Unable to set the default model',
  aiPrivacyNote: 'Only document content you select or explicitly confirm for checking is sent to the selected AI provider. Provider keys are stored separately in the system credential vault and never written to preferences, logs, or documents.', aiTestConnection: 'Test connection', aiTestingConnection: 'Testing connection…', aiConnectionSuccess: 'Connection successful', aiConnectionFailed: 'Connection failed',
  aiSettingsSaved: 'AI provider and API key saved', aiSettingsSaveFailed: 'Unable to save AI settings',
  aiRewriteTitle: 'AI Edit', aiAction: 'Action', aiActionPolish: 'Polish', aiActionRewrite: 'Rewrite', aiActionConcise: 'Make concise', aiActionExpand: 'Expand', aiActionSummarize: 'Summarize', aiActionTranslate: 'Translate', aiActionCustom: 'Custom instruction',
  aiTargetLanguage: 'Target language', aiInstruction: 'Instruction', aiInstructionPlaceholder: 'For example: make this more professional and friendly', aiOriginalText: 'Original', aiResultText: 'AI result', aiResultPlaceholder: 'You can refine the generated result here',
  aiCloudConsent: 'I agree to send the content and instruction above to the currently selected AI provider', aiOpenSettings: 'Settings', aiGenerate: 'Generate', aiGenerating: 'Generating…', aiRewriteConnecting: 'Connecting to the AI service', aiRewriteGenerating: 'AI is generating content', aiRewriteRefining: 'Preparing and checking the result', aiRewriteProgressMeta: '{provider} · {model} · {seconds}s elapsed', aiReplaceSelection: 'Replace selection', aiInsertAtCursor: 'Insert at cursor', aiSelectionReplaced: 'Selection replaced. Undo restores the original text.', aiContentInserted: 'Content inserted. Undo removes it.',
  aiNeedSelection: 'Select some text first', aiNeedInstruction: 'Enter an instruction', aiNeedCloudConsent: 'Confirm before sending selected text', aiEmptyResult: 'The AI returned no usable content', aiSelectionChanged: 'The source text changed. Select it again and retry.', aiRequestFailed: 'AI request failed',
  aiReview: 'AI Check', aiReviewTitle: 'Review the whole document and propose selectable fixes', aiReviewLabel: 'AI DOCUMENT REVIEW', aiReviewDialogTitle: 'AI document check', aiReviewIntro: 'Check the whole document for writing, spelling, punctuation, consistency, and Markdown issues, then choose which fixes to apply.',
  aiReviewReadyTitle: 'Ready to check this document', aiReviewReadyHint: 'AI returns only locatable suggestions and never changes the document automatically.', aiReviewConsent: 'I agree to send the current full document to the default AI provider for review', aiStartReview: 'Start check', aiReviewChecking: 'Checking…', aiReviewConnecting: 'Connecting to the AI service', aiReviewReading: 'AI is reading the document', aiReviewAnalysing: 'Analysing errors and unclear writing', aiReviewFormatting: 'Preparing selectable suggestions', aiReviewProgressMeta: '{provider} · {model} · {seconds}s elapsed', aiReviewFailedTitle: 'This check did not finish', aiReviewFailedHint: 'The document was not changed. Retry now, or choose another model in Settings.', aiReviewNoIssuesTitle: 'No clear errors found', aiReviewNoIssuesHint: 'The current model returned no changes that need to be applied. You can close this window or check again.',
  aiReviewSummary: '{count} suggestions, {selected} selected', aiSelectAllSuggestions: 'Select all', aiClearAllSuggestions: 'Clear selection', aiApplySelected: 'Apply selected fixes', aiReviewAgain: 'Check again', aiReviewApplied: '{count} fixes applied. Results remain available until you exit editing.', aiReviewNothingSelected: 'Select at least one suggestion', aiReviewDocumentChanged: 'The document changed after the check. Run it again to avoid applying a fix at the wrong position.', aiReviewOverlap: 'Selected suggestions overlap. Keep only one of them before applying.', aiReviewRequestFailed: 'AI document check failed', aiReviewEmptyDocument: 'The current document has no content to check', aiReviewTooLong: 'This document exceeds 80,000 characters. Review it in smaller selections with AI Edit.', aiReviewDeleteContent: 'Delete this content',
  aiReviewOriginal: 'Original', aiReviewReplacement: 'Suggested change', aiReviewCategoryGrammar: 'Grammar', aiReviewCategorySpelling: 'Spelling', aiReviewCategoryPunctuation: 'Punctuation', aiReviewCategoryClarity: 'Clarity', aiReviewCategoryConsistency: 'Consistency', aiReviewCategoryMarkdown: 'Markdown', aiReviewSeverityHigh: 'Important', aiReviewSeverityMedium: 'Suggestion', aiReviewSeverityLow: 'Minor'
});

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
  if (tableDesignerState && !$('#tableDialog')?.classList.contains('hidden')) {
    $('#tableDialogTitle').textContent = t(tableDesignerState.range ? 'editTable' : 'visualTableEditor');
    $('#confirmTable').textContent = t(tableDesignerState.range ? 'saveTable' : 'insertTableAction');
    renderTableDesigner();
  }
  applyPlatformShortcuts();
  syncInterfaceLanguageOptions();
  syncFontFamilyOptions();
  syncDocumentWidthOptions();
  syncEditorLayoutOptions();
  document.querySelectorAll('[data-accent-option]').forEach(button => {
    const name = ACCENT_THEMES[button.dataset.accentOption]?.[state.language === 'en' ? 'en' : 'zhCN'];
    const label = button.querySelector('.accent-option-name');
    if (label && name) label.textContent = name;
  });
  scheduleFormatToolbarLayout();
  syncSpellcheckOptions();
  updateDiagramFullscreenButton();
  updateDiagramActionLabels();
  if (structuredDiagramState?.model && flowchartDesignerState?.mode === 'visual') {
    structuredDiagramState.definition = structuredDiagramDefinition(diagramWizardState.templateId, diagramLocale());
    renderStructuredDiagramEditor();
  }
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
  fileList: $('#fileList'), libraryName: $('#libraryName'), tocPanel: $('#tocPanel'), toc: $('#toc'), tocSearchInput: $('#tocSearchInput'), clearTocSearch: $('#clearTocSearch'), tocEmpty: $('#tocEmpty'), compactTocButton: $('#compactTocButton'), compactTocBackdrop: $('#compactTocBackdrop'), closeCompactToc: $('#closeCompactToc'),
  breadcrumb: $('#breadcrumb'), documentActions: $('#documentActions'), documentActionsMenu: $('#documentActionsMenu'), documentActionsMoreButton: $('#documentActionsMoreButton'), readingTime: $('#readingTime'), progressBar: $('#progressBar'),
  appShell: $('.app-shell'), sidebar: $('#sidebar'), expandSidebar: $('#expandSidebar'), sidebarResizer: $('#sidebarResizer'), tocResizer: $('#tocResizer'), searchBar: $('#searchBar'),
  editorResizer: $('#editorResizer'),
  searchInput: $('#searchInput'), searchCount: $('#searchCount'), dropOverlay: $('#dropOverlay'),
  moreMenu: $('#moreMenu'), accentMenu: $('#accentMenu'), recentContextMenu: $('#recentContextMenu'), editorClipboardMenu: $('#editorClipboardMenu'), spellcheckContextMenu: $('#spellcheckContextMenu'), spellingContextWord: $('#spellingContextWord'), spellingSuggestions: $('#spellingSuggestions'), spellingNoSuggestions: $('#spellingNoSuggestions'), personalDictionaryCount: $('#personalDictionaryCount'), toast: $('#toast'), imageUploadProgress: $('#imageUploadProgress'), imageUploadProgressTitle: $('#imageUploadProgressTitle'), imageUploadProgressDetail: $('#imageUploadProgressDetail'), imageUploadProgressPercent: $('#imageUploadProgressPercent'), imageUploadProgressBar: $('#imageUploadProgressBar'), editorView: $('#editorView'), fontScaleSlider: $('#fontScaleSlider'), fontScaleValue: $('#fontScaleValue'),
  editor: $('#markdownEditor'), editFlowchartButton: $('#editFlowchartButton'), editFormulaButton: $('#editFormulaButton'), editorPreview: $('#editorPreviewContent'), editorFileName: $('#editorFileName'), editorSaveState: $('#editorSaveState'), aiEditButton: $('#aiEditButton'), aiReviewButton: $('#aiReviewButton'),
  editorPosition: $('#editorPosition'), editButton: $('#editButton'), editButtonLabel: $('#editButtonLabel'), previewLocateHint: $('#previewLocateHint'),
  exitEditButton: $('#exitEditButton'), codeLangMenu: $('#codeLangMenu'), textColorMenu: $('#textColorMenu'), moreFormatButton: $('#moreFormatButton'), moreFormatMenu: $('#moreFormatMenu'),
  saveButton: $('#saveButton'), backToTop: $('#backToTop'), firstRunLanguageDialog: $('#firstRunLanguageDialog'), aboutDialog: $('#aboutDialog'),
  aiSettingsDialog: $('#aiSettingsDialog'), aiSettingsForm: $('#aiSettingsForm'), aiProvider: $('#aiProvider'), aiProviderName: $('#aiProviderName'), aiProviderDescription: $('#aiProviderDescription'), aiProviderModel: $('#aiProviderModel'), setDefaultAIProvider: $('#setDefaultAIProvider'), aiBaseURLField: $('#aiBaseURLField'), aiBaseURL: $('#aiBaseURL'), aiBaseURLHint: $('#aiBaseURLHint'), aiModelSelectField: $('#aiModelSelectField'), aiModel: $('#aiModel'), aiCustomModelField: $('#aiCustomModelField'), aiCustomModel: $('#aiCustomModel'), aiCustomModelOptions: $('#aiCustomModelOptions'), aiModelState: $('#aiModelState'), aiCustomModelState: $('#aiCustomModelState'), refreshAIModels: $('#refreshAIModels'), refreshAICustomModels: $('#refreshAICustomModels'), aiAPIKey: $('#aiAPIKey'), aiAPIKeyField: $('#aiAPIKeyField'), aiAPIKeyState: $('#aiAPIKeyState'), aiKeyOnboarding: $('#aiKeyOnboarding'), aiKeySavedCard: $('#aiKeySavedCard'), aiMaskedAPIKey: $('#aiMaskedAPIKey'), editAIAPIKey: $('#editAIAPIKey'), deleteAIAPIKey: $('#deleteAIAPIKey'), aiSettingsStatus: $('#aiSettingsStatus'),
  aiRewriteDialog: $('#aiRewriteDialog'), aiRewriteControls: $('#aiRewriteControls'), aiRewriteFields: $('#aiRewriteFields'), aiRewriteAction: $('#aiRewriteAction'), aiTargetLanguageField: $('#aiTargetLanguageField'), aiTargetLanguage: $('#aiTargetLanguage'), aiInstructionField: $('#aiInstructionField'), aiInstruction: $('#aiInstruction'), aiCompareGrid: $('#aiCompareGrid'), aiOriginalTextField: $('#aiOriginalTextField'), aiOriginalText: $('#aiOriginalText'), aiResultText: $('#aiResultText'), aiRewriteProgress: $('#aiRewriteProgress'), aiRewriteProgressPhase: $('#aiRewriteProgressPhase'), aiRewriteProgressMeta: $('#aiRewriteProgressMeta'), aiRewriteProgressBar: $('#aiRewriteProgressBar'), aiRewriteProgressPercent: $('#aiRewriteProgressPercent'), aiCloudConsentRow: $('#aiCloudConsentRow'), aiCloudConsent: $('#aiCloudConsent'), aiRewriteStatus: $('#aiRewriteStatus'),
  aiReviewDialog: $('#aiReviewDialog'), aiReviewToolbar: $('#aiReviewToolbar'), aiReviewSummary: $('#aiReviewSummary'), aiReviewEmpty: $('#aiReviewEmpty'), aiReviewProgress: $('#aiReviewProgress'), aiReviewProgressBar: $('#aiReviewProgressBar'), aiReviewProgressMeta: $('#aiReviewProgressMeta'), aiReviewSuggestions: $('#aiReviewSuggestions'), aiReviewConsentRow: $('#aiReviewConsentRow'), aiReviewConsent: $('#aiReviewConsent'), aiReviewStatus: $('#aiReviewStatus'), runAIReview: $('#runAIReview'), rerunAIReview: $('#rerunAIReview'), applyAIReview: $('#applyAIReview'), selectAllAIReview: $('#selectAllAIReview'), clearAllAIReview: $('#clearAllAIReview'),
  feedbackDialog: $('#feedbackDialog'), feedbackForm: $('#feedbackForm'), feedbackImageList: $('#feedbackImageList'), updateDialog: $('#updateDialog'), editPermissionDialog: $('#editPermissionDialog'), editPermissionFileName: $('#editPermissionFileName'), pdfTutorialDialog: $('#pdfTutorialDialog'), exportCenterDialog: $('#exportCenterDialog'), exportPresetSelect: $('#exportPresetSelect'), exportPresetName: $('#exportPresetName'), exportFormatGrid: $('#exportFormatGrid'), exportFormatDescription: $('#exportFormatDescription'), exportHeader: $('#exportHeader'), exportFooter: $('#exportFooter'), exportImageOptions: $('#exportImageOptions'), exportImageLayout: $('#exportImageLayout'), exportImageScale: $('#exportImageScale'), pandocExportOptions: $('#pandocExportOptions'), pandocStatusText: $('#pandocStatusText'), pandocPath: $('#pandocPath'), customPandocFields: $('#customPandocFields'), pandocCustomWriter: $('#pandocCustomWriter'), pandocCustomExtension: $('#pandocCustomExtension'), pandocExtraArguments: $('#pandocExtraArguments'), exportCenterStatus: $('#exportCenterStatus'), confirmExportCenter: $('#confirmExportCenter'), usageAnalyticsToggle: $('#usageAnalyticsToggle'),
  recentTab: $('#recentTab'), favoritesTab: $('#favoritesTab'), explorerTab: $('#explorerTab'), refreshExplorer: $('#refreshExplorer'), tableDialog: $('#tableDialog'), tableDesignerGrid: $('#tableDesignerGrid'), tableDesignerViewport: $('#tableDesignerViewport'), imageDialog: $('#imageDialog'), imageUrl: $('#imageUrl'), imageAltInput: $('#imageAltInput'), imageWidth: $('#imageWidth'), imageWidthValue: $('#imageWidthValue'), formulaDialog: $('#formulaDialog'), formulaDisciplineTabs: $('#formulaDisciplineTabs'), formulaTemplateList: $('#formulaTemplateList'), formulaBuilderPanel: $('#formulaBuilderPanel'), formulaOutputModes: $('#formulaOutputModes'), formulaFields: $('#formulaFields'), formulaPreview: $('#formulaPreview'), formulaMarkdownSource: $('#formulaMarkdownSource'), diagramDialog: $('#diagramDialog'), diagramFullscreenButton: $('#toggleDiagramFullscreen'), diagramCategoryTabs: $('#diagramCategoryTabs'), diagramTemplateList: $('#diagramTemplateList'), diagramBuilderPanel: $('#diagramBuilderPanel'), diagramSource: $('#diagramSource'), diagramPreview: $('#diagramPreview'), flowchartModeBar: $('#flowchartModeBar'), flowchartVisualEditor: $('#flowchartVisualEditor'), structuredDiagramEditor: $('#structuredDiagramEditor'), structuredDiagramSettings: $('#structuredDiagramSettings'), structuredDiagramHead: $('#structuredDiagramHead'), structuredDiagramRows: $('#structuredDiagramRows'), flowchartCanvasViewport: $('#flowchartCanvasViewport'), flowchartCanvas: $('#flowchartCanvas'), flowchartZoomOut: $('#flowchartZoomOut'), flowchartZoomReset: $('#flowchartZoomReset'), flowchartZoomIn: $('#flowchartZoomIn'), flowchartZoomValue: $('#flowchartZoomValue'), flowchartNodeLayer: $('#flowchartNodeLayer'), flowchartEdgeLayer: $('#flowchartEdgeLayer'), flowchartDirection: $('#flowchartDirection'), flowchartNodeProperties: $('#flowchartNodeProperties'), flowchartEdgeProperties: $('#flowchartEdgeProperties'), flowchartNodeLabel: $('#flowchartNodeLabel'), flowchartNodeShape: $('#flowchartNodeShape'), flowchartEdgeLabel: $('#flowchartEdgeLabel'), flowchartEdgeStyle: $('#flowchartEdgeStyle'), flowchartSelectionHint: $('#flowchartSelectionHint'),
  imageUploadSettingsDialog: $('#imageUploadSettingsDialog'), picGoCloudSetup: $('#picGoCloudSetup'), picGoCloudAccount: $('#picGoCloudAccount'), picGoCloudUser: $('#picGoCloudUser'), picGoCloudStatus: $('#picGoCloudStatus'), picGoSetupWizard: $('#picGoSetupWizard'), picGoSetupInstall: $('#picGoSetupInstall'), picGoSetupConnect: $('#picGoSetupConnect'), picGoSetupReady: $('#picGoSetupReady'), picGoAdvancedSettings: $('#picGoAdvancedSettings'), localAssetsSummary: $('#localAssetsSummary'), picGoSettingsFields: $('#picGoSettingsFields'), picGoServerURL: $('#picGoServerURL'), picGoSecret: $('#picGoSecret'), clearPicGoSecretRow: $('#clearPicGoSecretRow'), clearPicGoSecret: $('#clearPicGoSecret'), picGoTestStatus: $('#picGoTestStatus'),
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
    StateEffect = stateModule.StateEffect;
    StateField = stateModule.StateField;
    EditorState = stateModule.EditorState;
    EditorView = viewModule.EditorView;
    Decoration = viewModule.Decoration;
    ViewPlugin = viewModule.ViewPlugin;
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
    initializeSpellcheckExtension();
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

function resolvedSpellcheckLanguage() {
  if (state.spellcheckLanguage !== 'auto') return state.spellcheckLanguage;
  const locale = (navigator.languages?.[0] || navigator.language || 'en-US').toLowerCase();
  return /^en-(gb|au|nz|ie)\b/.test(locale) ? 'en-GB' : 'en-US';
}

function initializeSpellcheckExtension() {
  if (spellcheckDecorationField) return;
  spellcheckDecorationEffect = StateEffect.define();
  spellcheckDecorationField = StateField.define({
    create: () => Decoration.none,
    update(decorations, transaction) {
      let next = decorations.map(transaction.changes);
      for (const effect of transaction.effects) {
        if (effect.is(spellcheckDecorationEffect)) next = effect.value;
      }
      return next;
    }
  });
  spellcheckViewPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.schedule(0);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) this.schedule(180);
    }

    schedule(delay) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => refreshSpellcheckDecorations(this.view), delay);
    }

    destroy() {
      clearTimeout(this.timer);
    }
  });
}

function spellcheckDecorations(view) {
  if (!state.spellcheckEnabled || !activeSpellchecker || !spellcheckRuntimePromise?.resolved || view.state.doc.length > 300000) return Decoration.none;
  const errors = spellcheckRuntimePromise.resolved.findSpellingErrors(view.state.doc.toString(), activeSpellchecker, {
    ignoredWords: state.spellcheckIgnoredWords,
    maxErrors: 400
  });
  return Decoration.set(errors.map(error => Decoration.mark({
    class: 'cm-spelling-error',
    attributes: { 'aria-invalid': 'spelling' }
  }).range(error.from, error.to)), true);
}

async function loadSpellcheckDictionary(showFailure = false) {
  if (!state.spellcheckEnabled) return null;
  const language = resolvedSpellcheckLanguage();
  if (activeSpellchecker && activeSpellcheckLanguage === language) return activeSpellchecker;
  if (spellcheckDictionaryPromise?.language === language) return spellcheckDictionaryPromise.promise;
  const generation = ++spellcheckLoadGeneration;
  const promise = (async () => {
    try {
      const spellcheckRuntime = await loadSpellcheckRuntime();
      let dictionary = spellcheckDictionaryCache.get(language);
      if (!dictionary) {
        const [affResponse, dicResponse] = await Promise.all([
          fetch(`/vendor/dictionaries/${language}.aff`),
          fetch(`/vendor/dictionaries/${language}.dic`)
        ]);
        if (!affResponse.ok || !dicResponse.ok) throw new Error(`Dictionary ${language} is unavailable`);
        dictionary = { aff: await affResponse.text(), dic: await dicResponse.text() };
        spellcheckDictionaryCache.set(language, dictionary);
      }
      if (generation !== spellcheckLoadGeneration) return null;
      activeSpellchecker = spellcheckRuntime.createSpellChecker(dictionary.aff, dictionary.dic, state.spellcheckPersonalWords);
      activeSpellcheckLanguage = language;
      refreshSpellcheckDecorations(codeEditor, false);
      return activeSpellchecker;
    } catch (error) {
      if (generation === spellcheckLoadGeneration) {
        activeSpellchecker = null;
        activeSpellcheckLanguage = '';
        refreshSpellcheckDecorations(codeEditor, false);
      }
      reportSilentError(error, 'spellcheck.dictionary');
      if (showFailure) showToast(t('spellcheckLoadFailed'), 'error');
      return null;
    } finally {
      if (spellcheckDictionaryPromise?.generation === generation) spellcheckDictionaryPromise = null;
    }
  })();
  spellcheckDictionaryPromise = { language, generation, promise };
  return promise;
}

function refreshSpellcheckDecorations(view = codeEditor, loadDictionary = true) {
  if (!view || !spellcheckDecorationEffect) return;
  if (state.spellcheckEnabled && !activeSpellchecker && loadDictionary) loadSpellcheckDictionary();
  view.dispatch({ effects: spellcheckDecorationEffect.of(spellcheckDecorations(view)) });
}

function syncSpellcheckOptions() {
  document.querySelectorAll('[data-spellcheck-language]').forEach(button => {
    const active = button.dataset.spellcheckLanguage === state.spellcheckLanguage;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  const currentLanguage = $('#spellcheckLanguageCurrent');
  if (currentLanguage) currentLanguage.textContent = t({ auto: 'spellcheckAuto', 'en-US': 'spellcheckUS', 'en-GB': 'spellcheckGB' }[state.spellcheckLanguage]);
  const toggle = $('[data-spellcheck-toggle]');
  if (toggle) {
    toggle.classList.toggle('active', state.spellcheckEnabled);
    toggle.setAttribute('aria-checked', String(state.spellcheckEnabled));
  }
  if (typeof els !== 'undefined' && els.personalDictionaryCount) {
    els.personalDictionaryCount.textContent = t('personalDictionaryCount', { count: state.spellcheckPersonalWords.length });
  }
}

function setSpellcheckEnabled(enabled) {
  state.spellcheckEnabled = Boolean(enabled);
  localStorage.setItem('spellcheckEnabled', String(state.spellcheckEnabled));
  syncSpellcheckOptions();
  if (state.spellcheckEnabled) loadSpellcheckDictionary(true);
  else refreshSpellcheckDecorations(codeEditor, false);
}

function setSpellcheckLanguage(language) {
  state.spellcheckLanguage = normalizeSpellcheckLanguage(language);
  localStorage.setItem('spellcheckLanguage', state.spellcheckLanguage);
  activeSpellchecker = null;
  activeSpellcheckLanguage = '';
  spellcheckLoadGeneration += 1;
  syncSpellcheckOptions();
  loadSpellcheckDictionary(true);
}

function persistPersonalDictionary() {
  state.spellcheckPersonalWords = normalizeStoredPersonalWords(state.spellcheckPersonalWords);
  localStorage.setItem('spellcheckPersonalWords', JSON.stringify(state.spellcheckPersonalWords));
  syncSpellcheckOptions();
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
  updateExistingFlowchartButton();
}

let activeFlowchartFence = null;
let activeFormulaMatch = null;

function updateExistingFlowchartButton() {
  if (!els.editFlowchartButton || !els.editFormulaButton || !codeEditor || !state.editing) {
    els.editFlowchartButton?.classList.add('hidden');
    els.editFormulaButton?.classList.add('hidden');
    activeFlowchartFence = null;
    activeFormulaMatch = null;
    return;
  }
  const selection = codeEditor.state.selection.main;
  const source = codeEditor.state.doc.toString();
  activeFlowchartFence = findEditableDiagramFenceAt(source, selection.head)
    || findEditableDiagramFenceAt(source, selection.from);
  els.editFlowchartButton.classList.toggle('hidden', !activeFlowchartFence);
  activeFormulaMatch = activeFlowchartFence ? null : findFormulaAt(source, selection.from, selection.to);
  els.editFormulaButton.classList.toggle('hidden', !activeFormulaMatch);
  if (activeFlowchartFence) {
    const label = t('editThisDiagram');
    els.editFlowchartButton.title = label;
    els.editFlowchartButton.setAttribute('aria-label', label);
    els.editFlowchartButton.querySelector('span').textContent = label;
  }
  if (activeFormulaMatch) {
    const label = t('editFormulaDirectly');
    els.editFormulaButton.title = label;
    els.editFormulaButton.setAttribute('aria-label', label);
    els.editFormulaButton.querySelector('span').textContent = label;
  }
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
  els.moreFormatButton.hidden = false;
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
  const hasOverflow = candidates.some(element => element.hidden);
  els.moreFormatButton.hidden = !hasOverflow;
  bar.querySelector('[data-divider-before="more"]')?.toggleAttribute('hidden', !hasOverflow);
  if (!hasOverflow) closeMoreFormatMenu();
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
  mode: 'inline',
  discipline: 'all',
  templateId: 'equation',
  valuesByTemplate: new Map(),
  editRange: null,
};

function formulaLocale() {
  return state.language === 'en' ? 'en' : 'zh';
}

function selectedFormulaDetails() {
  if (!codeEditor) return { source: '', templateId: 'equation', mode: 'inline', equationNumber: '1', editRange: null };
  const selection = codeEditor.state.selection.main;
  const documentSource = codeEditor.state.doc.toString();
  const existing = findFormulaAt(documentSource, selection.from, selection.to);
  if (existing) return { ...existing, editRange: { from: existing.from, to: existing.to } };
  const raw = codeEditor.state.doc.sliceString(selection.from, selection.to).trim();
  if (!raw) return { source: '', templateId: 'equation', mode: 'inline', equationNumber: '1', editRange: null };
  let mode = 'inline';
  let source = raw;
  if (/^\$\$(?:.|\n)*\$\$$/.test(raw)) {
    mode = 'block';
    source = raw.slice(2, -2).trim();
  }
  else if (/^\$(?:.|\n)*\$$/.test(raw)) {
    mode = 'inline';
    source = raw.slice(1, -1).trim();
  } else if (/^\\\[(?:.|\n)*\\\]$/.test(raw)) {
    mode = 'block';
    source = raw.slice(2, -2).trim();
  }
  else if (/^\\\((?:.|\n)*\\\)$/.test(raw)) {
    mode = 'inline';
    source = raw.slice(2, -2).trim();
  }
  const numbered = source.match(/\s+\\tag\{([^{}]*)\}\s*$/);
  if (numbered) mode = 'numbered';
  source = source.replace(/\s+\\tag\{[^{}]*\}\s*$/, '').trim();
  const chemistry = source.match(/^\\ce\{([\s\S]*)\}$/);
  const details = { source, templateId: 'custom', mode, equationNumber: numbered?.[1] || '1', editRange: { from: selection.from, to: selection.to } };
  if (chemistry) return { ...details, source: chemistry[1].trim(), templateId: 'chem-custom' };
  return details;
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

function openFormulaDialog(existingFormula = null) {
  if (!state.currentFile || !codeEditor) return;
  const selected = existingFormula
    ? { ...existingFormula, editRange: { from: existingFormula.from, to: existingFormula.to } }
    : selectedFormulaDetails();
  const preferred = selected.source ? selected.templateId : 'equation';
  const template = formulaTemplateById(preferred);
  formulaWizardState.mode = selected.mode;
  formulaWizardState.discipline = selected.source ? template.group : 'all';
  formulaWizardState.templateId = preferred;
  formulaWizardState.valuesByTemplate = new Map();
  formulaWizardState.editRange = selected.editRange;
  if (selected.source) {
    formulaWizardState.valuesByTemplate.set(preferred, formulaValues(template, { formula: selected.source }));
  }
  $('#formulaNumber').value = selected.equationNumber || '1';
  const editing = Boolean(formulaWizardState.editRange);
  $('#formulaDialogTitle').textContent = t(editing ? 'formulaEditTitle' : 'formulaWizardTitle');
  $('#formulaDialogHint').textContent = t(editing ? 'formulaEditHint' : 'formulaWizardHint');
  $('#insertFormula').textContent = t(editing ? 'saveFormulaChanges' : 'insertFormula');
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
  const editRange = formulaWizardState.editRange;
  closeFormulaDialog();
  if (editRange && codeEditor) {
    codeEditor.dispatch({
      changes: { from: editRange.from, to: editRange.to, insert: markdownSource },
      selection: { anchor: editRange.from + markdownSource.length },
      scrollIntoView: true
    });
    codeEditor.focus();
    return;
  }
  replaceSelection(markdownSource, markdownSource.length, 0);
}

const diagramWizardState = {
  category: 'all',
  templateId: 'flowchart',
  valuesByTemplate: new Map(),
  editRange: null
};
let diagramPreviewTimer = 0;

function diagramLocale() {
  return state.language === 'en' ? 'en' : 'zh';
}

const FLOWCHART_SVG_NS = 'http://www.w3.org/2000/svg';
const flowchartDesignerState = {
  mode: 'visual',
  model: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  selection: null,
  connecting: false,
  connectFrom: '',
  drag: null,
  panDrag: null,
  ignoreClickUntil: 0,
  sourceSnapshot: ''
};
const CANVAS_DIAGRAM_IDS = new Set(['flowchart', 'state', 'mindmap']);
const structuredDiagramState = {
  model: null,
  definition: null,
  sourceSnapshot: ''
};

function isCanvasDiagram(templateId = diagramWizardState.templateId) {
  return CANVAS_DIAGRAM_IDS.has(templateId);
}

function stateDiagramCanvasModel(source) {
  const lines = String(source || '').split(/\r?\n/u);
  const header = lines.findIndex(line => /^stateDiagram-v2\s*$/iu.test(line.trim()));
  if (header < 0) return { valid: false, error: 'missing-header' };
  const nodes = [];
  const edges = [];
  const byToken = new Map();
  const aliases = new Map();
  const transitions = [];
  let sourceDirection = '';
  const unsupportedLines = [];
  for (const raw of lines.slice(header + 1)) {
    const line = raw.trim();
    if (!line) continue;
    const direction = line.match(/^direction\s+(LR|RL|TB|BT)$/iu);
    if (direction) { sourceDirection = direction[1].toUpperCase(); continue; }
    const declaration = line.match(/^state\s+"([\s\S]*?)"\s+as\s+([A-Za-z_][\w-]*)$/u);
    if (declaration) { aliases.set(declaration[2], declaration[1]); continue; }
    const transition = line.match(/^(.+?)\s*-->\s*([^:]+?)(?:\s*:\s*(.*))?$/u);
    if (transition) transitions.push({ from: transition[1].trim(), to: transition[2].trim(), label: (transition[3] || '').trim() });
    else unsupportedLines.push(raw);
  }
  if (unsupportedLines.length) return { valid: false, error: 'unsupported-syntax', unsupportedLines };
  const locale = diagramLocale();
  const getNode = (token, role = '') => {
    const key = token === '[*]' ? role : token;
    if (byToken.has(key)) return byToken.get(key);
    const id = `S${nodes.length + 1}`;
    const special = token === '[*]';
    const node = {
      id,
      label: special ? (role === 'start' ? (locale === 'en' ? 'Start' : '开始') : (locale === 'en' ? 'End' : '结束')) : (aliases.get(token) || token),
      shape: special ? 'circle' : 'round',
      stateToken: special ? '[*]' : '',
      stateRole: role,
      stateSourceId: special ? '' : token,
      diagramNodeType: 'state',
      x: 0,
      y: 0
    };
    nodes.push(node);
    byToken.set(key, node);
    return node;
  };
  transitions.forEach((row, index) => {
    const from = getNode(row.from, row.from === '[*]' ? 'start' : '');
    const to = getNode(row.to, row.to === '[*]' ? 'end' : '');
    edges.push({ id: `edge-${index + 1}`, from: from.id, to: to.id, label: row.label || '', style: 'solid' });
  });
  aliases.forEach((label, token) => getNode(token));
  if (!nodes.length) return { valid: false, error: 'missing-nodes' };
  const direction = sourceDirection === 'TB' ? 'TD' : sourceDirection || 'TD';
  return { valid: true, model: layoutFlowchart({ canvasType: 'state', direction, nodes, edges }) };
}

function mindmapCanvasModel(source) {
  const parsed = parseStructuredDiagram('mindmap', source);
  if (!parsed.valid || !parsed.model.rows.length) return { valid: false, error: 'missing-nodes' };
  const nodes = [];
  const edges = [];
  const levelStack = [];
  parsed.model.rows.forEach((row, index) => {
    const level = index === 0 ? 0 : Math.max(1, Math.min(5, Number(row.level) || 1));
    const node = { id: `M${index + 1}`, label: row.label, shape: index === 0 ? 'circle' : 'round', mindmapRoot: index === 0, x: 0, y: 0 };
    nodes.push(node);
    if (index > 0) {
      let parentLevel = level - 1;
      while (parentLevel > 0 && !levelStack[parentLevel]) parentLevel -= 1;
      const parent = levelStack[parentLevel] || nodes[0];
      edges.push({ id: `edge-${edges.length + 1}`, from: parent.id, to: node.id, label: '', style: 'line' });
    }
    levelStack[level] = node;
    levelStack.length = level + 1;
  });
  return { valid: true, model: layoutFlowchart({ canvasType: 'mindmap', direction: 'LR', nodes, edges }) };
}

function parseCanvasDiagramSource(templateId, source) {
  if (templateId === 'state') return stateDiagramCanvasModel(source);
  if (templateId === 'mindmap') return mindmapCanvasModel(source);
  return parseFlowchartSource(source);
}

function serializeStateCanvas(model) {
  const safe = value => String(value || '').replace(/[\r\n]+/gu, ' ').replaceAll('"', '＂').trim();
  const lines = ['stateDiagram-v2', `    direction ${model.direction === 'TD' ? 'TB' : model.direction}`];
  model.nodes.filter(node => node.stateToken !== '[*]').forEach(node => lines.push(`    state "${safe(node.label) || node.id}" as ${node.id}`));
  const token = node => node.stateToken === '[*]' ? '[*]' : node.id;
  model.edges.forEach(edge => {
    const from = model.nodes.find(node => node.id === edge.from);
    const to = model.nodes.find(node => node.id === edge.to);
    if (!from || !to) return;
    lines.push(`    ${token(from)} --> ${token(to)}${edge.label ? ` : ${safe(edge.label)}` : ''}`);
  });
  return lines.join('\n');
}

function serializeMindmapCanvas(model) {
  if (!model.nodes.length) return 'mindmap';
  const nodeMap = new Map(model.nodes.map(node => [node.id, node]));
  const incoming = new Map(model.nodes.map(node => [node.id, 0]));
  const outgoing = new Map(model.nodes.map(node => [node.id, []]));
  model.edges.forEach(edge => {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) return;
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from).push(edge.to);
  });
  const root = model.nodes.find(node => node.mindmapRoot) || model.nodes.find(node => !incoming.get(node.id)) || model.nodes[0];
  const rows = [];
  const visited = new Set();
  const visit = (nodeId, level) => {
    if (visited.has(nodeId)) return;
    const node = nodeMap.get(nodeId);
    if (!node) return;
    visited.add(nodeId);
    rows.push({ level, label: node.label });
    (outgoing.get(nodeId) || []).forEach(childId => visit(childId, Math.min(5, level + 1)));
  };
  visit(root.id, 0);
  model.nodes.filter(node => !visited.has(node.id)).forEach(node => visit(node.id, 1));
  return serializeStructuredDiagram('mindmap', { settings: {}, rows });
}

function serializeCanvasDiagram(model) {
  if (model?.canvasType === 'state') return serializeStateCanvas(model);
  if (model?.canvasType === 'mindmap') return serializeMindmapCanvas(model);
  return serializeFlowchart(model);
}

function flowchartSVGElement(name, attributes = {}) {
  const element = document.createElementNS(FLOWCHART_SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function flowchartNodeSize(node) {
  if (node.diagramNodeType === 'state') return node.stateToken === '[*]' ? { width: 52, height: 52 } : { width: 132, height: 48 };
  if (node.mindmapRoot) return { width: 184, height: 76 };
  if (node.shape === 'decision') return { width: 176, height: 94 };
  if (node.shape === 'circle') return { width: 86, height: 86 };
  if (node.shape === 'terminal') return { width: 164, height: 64 };
  return { width: 164, height: 68 };
}

function flowchartBoundaryPoint(node, towardNode) {
  const size = flowchartNodeSize(node);
  const deltaX = towardNode.x - node.x;
  const deltaY = towardNode.y - node.y;
  if (!deltaX && !deltaY) return { x: node.x, y: node.y };
  if (node.shape === 'decision') {
    const scale = 1 / ((Math.abs(deltaX) / (size.width / 2)) + (Math.abs(deltaY) / (size.height / 2)));
    return { x: node.x + deltaX * scale, y: node.y + deltaY * scale };
  }
  const scale = 1 / Math.max(Math.abs(deltaX) / (size.width / 2), Math.abs(deltaY) / (size.height / 2));
  return { x: node.x + deltaX * scale, y: node.y + deltaY * scale };
}

function flowchartTextLines(label, limit = 14) {
  const text = String(label || '').trim();
  if (!text) return [''];
  const characters = [...text];
  const lines = [];
  while (characters.length && lines.length < 3) lines.push(characters.splice(0, limit).join(''));
  if (characters.length) lines[2] = `${lines[2].slice(0, Math.max(1, limit - 1))}…`;
  return lines;
}

function renderFlowchartNodeShape(group, node) {
  const size = flowchartNodeSize(node);
  const left = node.x - size.width / 2;
  const top = node.y - size.height / 2;
  let shape;
  if (node.shape === 'decision') {
    shape = flowchartSVGElement('polygon', { points: `${node.x},${top} ${left + size.width},${node.y} ${node.x},${top + size.height} ${left},${node.y}` });
  } else if (node.shape === 'circle') {
    shape = flowchartSVGElement('ellipse', { cx: node.x, cy: node.y, rx: size.width / 2, ry: size.height / 2 });
  } else if (node.shape === 'database') {
    shape = flowchartSVGElement('path', { d: `M${left},${top + 10} C${left},${top - 2} ${left + size.width},${top - 2} ${left + size.width},${top + 10} V${top + size.height - 10} C${left + size.width},${top + size.height + 2} ${left},${top + size.height + 2} ${left},${top + size.height - 10} Z` });
    group.append(flowchartSVGElement('path', { class: 'flowchart-database-line', d: `M${left},${top + 10} C${left},${top + 22} ${left + size.width},${top + 22} ${left + size.width},${top + 10}` }));
  } else {
    const radius = node.shape === 'terminal' ? size.height / 2 : node.shape === 'round' ? 17 : 7;
    shape = flowchartSVGElement('rect', { x: left, y: top, width: size.width, height: size.height, rx: radius, ry: radius });
    if (node.shape === 'subroutine') {
      group.append(flowchartSVGElement('path', { class: 'flowchart-subroutine-line', d: `M${left + 13},${top} V${top + size.height} M${left + size.width - 13},${top} V${top + size.height}` }));
    }
  }
  shape.classList.add('flowchart-node-shape');
  group.prepend(shape);
  const lines = flowchartTextLines(node.label, node.shape === 'decision' ? 11 : 14);
  const text = flowchartSVGElement('text', { x: node.x, y: node.y - ((lines.length - 1) * 8) });
  lines.forEach((line, index) => {
    const span = flowchartSVGElement('tspan', { x: node.x, dy: index ? 17 : 0 });
    span.textContent = line;
    text.append(span);
  });
  group.append(text);
}

function configureCanvasToolbar() {
  const type = flowchartDesignerState.model?.canvasType || 'flowchart';
  const processButton = els.flowchartVisualEditor.querySelector('[data-flowchart-add="process"]');
  const decisionButton = els.flowchartVisualEditor.querySelector('[data-flowchart-add="decision"]');
  const terminalButton = els.flowchartVisualEditor.querySelector('[data-flowchart-add="terminal"]');
  const connectButton = $('#flowchartConnect');
  const setButton = (button, hidden, labelKey, titleKey) => {
    button.classList.toggle('hidden', hidden);
    if (labelKey) button.querySelector('span').textContent = t(labelKey);
    if (titleKey) {
      button.title = t(titleKey);
      button.setAttribute('aria-label', t(titleKey));
    }
  };
  if (type === 'state') {
    setButton(processButton, false, 'canvasStateNode', 'canvasAddState');
    setButton(decisionButton, true);
    setButton(terminalButton, false, 'canvasStateTerminal', 'canvasAddStateTerminal');
    terminalButton.disabled = ['start', 'end'].every(role => flowchartDesignerState.model.nodes.some(node => node.stateRole === role));
  } else if (type === 'mindmap') {
    setButton(processButton, false, 'canvasMindmapChild', 'canvasAddMindmapChild');
    setButton(decisionButton, false, 'canvasMindmapSibling', 'canvasAddMindmapSibling');
    setButton(terminalButton, true);
    terminalButton.disabled = false;
  } else {
    setButton(processButton, false, 'flowchartProcess', 'flowchartAddProcess');
    setButton(decisionButton, false, 'flowchartDecision', 'flowchartAddDecision');
    setButton(terminalButton, false, 'flowchartTerminal', 'flowchartAddTerminal');
    terminalButton.disabled = false;
  }
  if (!flowchartDesignerState.connecting) connectButton.querySelector('span').textContent = t(type === 'mindmap' ? 'canvasMindmapConnect' : 'flowchartConnect');
  connectButton.title = t(type === 'mindmap' ? 'canvasMindmapConnect' : 'flowchartConnectHint');
  els.flowchartDirection.closest('label').classList.toggle('hidden', type === 'mindmap');
  els.flowchartNodeShape.closest('label').classList.toggle('hidden', type !== 'flowchart');
  els.flowchartCanvasViewport.querySelector('.flowchart-canvas-hint').textContent = t(type === 'state' ? 'canvasStateHint' : type === 'mindmap' ? 'canvasMindmapHint' : 'flowchartCanvasHint');
}

function renderFlowchartProperties() {
  const selection = flowchartDesignerState.selection;
  const model = flowchartDesignerState.model;
  const node = selection?.type === 'node' ? model?.nodes.find(item => item.id === selection.id) : null;
  const edge = selection?.type === 'edge' ? model?.edges.find(item => item.id === selection.id) : null;
  const selectedNodes = selection?.type === 'nodes' ? selection.ids.length : 0;
  els.flowchartNodeProperties.classList.toggle('hidden', !node);
  const mindmap = model?.canvasType === 'mindmap';
  els.flowchartEdgeProperties.classList.toggle('hidden', !edge || mindmap);
  els.flowchartSelectionHint.classList.toggle('hidden', Boolean(node || edge));
  els.flowchartSelectionHint.textContent = selectedNodes
    ? t('flowchartMultiSelected', { count: selectedNodes })
    : t('flowchartNothingSelected');
  $('#flowchartDeleteSelection').disabled = !node && !edge && !selectedNodes;
  $('#flowchartSelectAll').classList.toggle('active', Boolean(model?.nodes.length) && selectedNodes === model.nodes.length);
  if (node) {
    els.flowchartNodeLabel.value = node.label;
    els.flowchartNodeLabel.disabled = node.stateToken === '[*]';
    els.flowchartNodeShape.replaceChildren(...FLOWCHART_SHAPES.map(option => {
      const element = document.createElement('option');
      element.value = option.id;
      element.textContent = option[diagramLocale()];
      element.selected = option.id === node.shape;
      return element;
    }));
  }
  if (!node) els.flowchartNodeLabel.disabled = false;
  if (edge) {
    els.flowchartEdgeLabel.value = edge.label || '';
    els.flowchartEdgeStyle.value = edge.style || 'solid';
  }
  $('#flowchartConnect').classList.toggle('active', flowchartDesignerState.connecting);
  const connectText = flowchartDesignerState.connecting
    ? t(flowchartDesignerState.connectFrom ? 'flowchartConnectTarget' : 'flowchartConnectActive')
    : t(mindmap ? 'canvasMindmapConnect' : 'flowchartConnect');
  $('#flowchartConnect').querySelector('span').textContent = connectText;
}

function renderFlowchartCanvas() {
  const model = flowchartDesignerState.model;
  if (!model) return;
  configureCanvasToolbar();
  els.flowchartDirection.value = model.direction;
  els.flowchartEdgeLayer.replaceChildren();
  els.flowchartNodeLayer.replaceChildren();
  const nodeMap = new Map(model.nodes.map(node => [node.id, node]));
  for (const edge of model.edges) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;
    const start = flowchartBoundaryPoint(from, to);
    const end = flowchartBoundaryPoint(to, from);
    const stateEdge = model.canvasType === 'state';
    const group = flowchartSVGElement('g', { class: `flowchart-edge${stateEdge ? ' state-edge' : ''}${flowchartDesignerState.selection?.type === 'edge' && flowchartDesignerState.selection.id === edge.id ? ' selected' : ''}`, 'data-flowchart-edge': edge.id });
    const path = flowchartSVGElement('path', { class: `flowchart-edge-path${edge.style === 'dashed' ? ' is-dashed' : ''}${edge.style === 'thick' ? ' is-thick' : ''}`, d: `M${start.x},${start.y} L${end.x},${end.y}` });
    if (edge.style !== 'line') path.setAttribute('marker-end', stateEdge ? 'url(#flowchartArrowSmall)' : 'url(#flowchartArrow)');
    const hit = flowchartSVGElement('path', { class: 'flowchart-edge-hit', d: `M${start.x},${start.y} L${end.x},${end.y}` });
    group.append(path, hit);
    if (edge.label) {
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const length = Math.max(1, Math.hypot(deltaX, deltaY));
      const stateOffset = model.canvasType === 'state' ? 13 : 0;
      const label = flowchartSVGElement('text', {
        class: 'flowchart-edge-label',
        x: (start.x + end.x) / 2 - deltaY / length * stateOffset,
        y: (start.y + end.y) / 2 + deltaX / length * stateOffset - (stateOffset ? 0 : 8)
      });
      label.textContent = edge.label;
      group.append(label);
    }
    els.flowchartEdgeLayer.append(group);
  }
  for (const node of model.nodes) {
    const selected = flowchartDesignerState.selection?.type === 'node'
      ? flowchartDesignerState.selection.id === node.id
      : flowchartDesignerState.selection?.type === 'nodes' && flowchartDesignerState.selection.ids.includes(node.id);
    const origin = flowchartDesignerState.connectFrom === node.id;
    const group = flowchartSVGElement('g', { class: `flowchart-node${node.diagramNodeType === 'state' ? ' state-node' : ''}${node.stateToken === '[*]' ? ' state-terminal-node' : ''}${selected ? ' selected' : ''}${origin ? ' connect-origin' : ''}`, 'data-flowchart-node': node.id, tabindex: '0', 'aria-label': node.label });
    renderFlowchartNodeShape(group, node);
    els.flowchartNodeLayer.append(group);
  }
  renderFlowchartProperties();
  applyFlowchartZoom();
}

const FLOWCHART_ZOOM_MIN = .5;
const FLOWCHART_ZOOM_MAX = 2;
const FLOWCHART_ZOOM_STEP = .1;

function flowchartViewBox() {
  const viewport = els.flowchartCanvasViewport;
  const aspect = Math.max(1, viewport?.clientWidth || 920) / Math.max(1, viewport?.clientHeight || 560);
  const baseAspect = 920 / 560;
  let width;
  let height;
  if (aspect >= baseAspect) {
    height = 560 / flowchartDesignerState.zoom;
    width = height * aspect;
  } else {
    width = 920 / flowchartDesignerState.zoom;
    height = width / aspect;
  }
  const centerX = 460 - flowchartDesignerState.panX;
  const centerY = 280 - flowchartDesignerState.panY;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

function applyFlowchartZoom() {
  if (!els.flowchartCanvas || !els.flowchartCanvasViewport) return;
  const zoom = flowchartDesignerState.zoom;
  const viewBox = flowchartViewBox();
  els.flowchartCanvas.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  els.flowchartCanvas.style.width = '100%';
  els.flowchartCanvas.style.height = '100%';
  els.flowchartZoomValue.textContent = `${Math.round(zoom * 100)}%`;
  els.flowchartZoomOut.disabled = zoom <= FLOWCHART_ZOOM_MIN;
  els.flowchartZoomIn.disabled = zoom >= FLOWCHART_ZOOM_MAX;
}

function setFlowchartZoom(value, { resetPan = false } = {}) {
  flowchartDesignerState.zoom = Math.max(FLOWCHART_ZOOM_MIN, Math.min(FLOWCHART_ZOOM_MAX, Math.round(value * 10) / 10));
  if (resetPan) {
    flowchartDesignerState.panX = 0;
    flowchartDesignerState.panY = 0;
  }
  applyFlowchartZoom();
}

function syncFlowchartSource() {
  if (!flowchartDesignerState.model) return;
  const source = serializeCanvasDiagram(flowchartDesignerState.model);
  els.diagramSource.value = source;
  flowchartDesignerState.sourceSnapshot = source;
  rememberDiagramSource();
}

function setFlowchartSelection(type = '', id = '') {
  flowchartDesignerState.selection = type && id ? { type, id } : null;
  renderFlowchartCanvas();
}

function selectAllFlowchartNodes() {
  const ids = flowchartDesignerState.model?.nodes.map(node => node.id) || [];
  flowchartDesignerState.selection = ids.length ? { type: 'nodes', ids } : null;
  flowchartDesignerState.connecting = false;
  flowchartDesignerState.connectFrom = '';
  renderFlowchartCanvas();
  els.flowchartCanvas.focus();
}

function initialiseFlowchartVisual(source, { notify = false } = {}) {
  if (flowchartDesignerState.model && source === flowchartDesignerState.sourceSnapshot) return true;
  const parsed = parseCanvasDiagramSource(diagramWizardState.templateId, source);
  if (!parsed.valid) {
    if (notify) showToast(t(diagramWizardState.templateId === 'flowchart' ? 'flowchartVisualUnsupported' : 'diagramVisualUnsupported'), 'warning');
    return false;
  }
  flowchartDesignerState.model = parsed.model;
  flowchartDesignerState.selection = null;
  flowchartDesignerState.panX = 0;
  flowchartDesignerState.panY = 0;
  flowchartDesignerState.connecting = false;
  flowchartDesignerState.connectFrom = '';
  flowchartDesignerState.sourceSnapshot = source;
  return true;
}

function structuredInput(field, value, onChange) {
  let input;
  if (field.type === 'select') {
    input = document.createElement('select');
    (field.options || []).forEach(([optionValue, label]) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = label;
      option.selected = String(value ?? '') === String(optionValue);
      input.append(option);
    });
  } else {
    input = document.createElement('input');
    input.type = field.type === 'checkbox' ? 'checkbox' : field.type === 'number' ? 'number' : 'text';
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value ?? '';
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
  }
  input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => onChange(input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value));
  return input;
}

function syncStructuredDiagramSource() {
  if (!structuredDiagramState.model) return;
  const source = serializeStructuredDiagram(diagramWizardState.templateId, structuredDiagramState.model);
  els.diagramSource.value = source;
  structuredDiagramState.sourceSnapshot = source;
  rememberDiagramSource();
  scheduleDiagramPreview();
}

function renderStructuredDiagramEditor() {
  const model = structuredDiagramState.model;
  const definition = structuredDiagramState.definition;
  if (!model || !definition) return;
  els.structuredDiagramSettings.replaceChildren();
  definition.settings.forEach(field => {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent = field.label;
    label.append(caption, structuredInput(field, model.settings[field.key], value => {
      model.settings[field.key] = value;
      syncStructuredDiagramSource();
    }));
    els.structuredDiagramSettings.append(label);
  });
  els.structuredDiagramHead.replaceChildren();
  definition.columns.forEach(field => {
    const heading = document.createElement('th');
    heading.scope = 'col';
    heading.textContent = field.label;
    els.structuredDiagramHead.append(heading);
  });
  const actionHeading = document.createElement('th');
  actionHeading.scope = 'col';
  actionHeading.setAttribute('aria-label', t('structuredDiagramRemoveRow'));
  els.structuredDiagramHead.append(actionHeading);
  els.structuredDiagramRows.replaceChildren();
  model.rows.forEach((row, rowIndex) => {
    const tableRow = document.createElement('tr');
    definition.columns.forEach(field => {
      const cell = document.createElement('td');
      cell.append(structuredInput(field, row[field.key], value => {
        row[field.key] = value;
        syncStructuredDiagramSource();
      }));
      tableRow.append(cell);
    });
    const actionCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'structured-row-remove';
    remove.dataset.structuredRemove = String(rowIndex);
    remove.title = t('structuredDiagramRemoveRow');
    remove.setAttribute('aria-label', t('structuredDiagramRemoveRow'));
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13M10 11v5M14 11v5"/></svg>';
    actionCell.append(remove);
    tableRow.append(actionCell);
    els.structuredDiagramRows.append(tableRow);
  });
  $('#addStructuredDiagramRow span').textContent = definition.add;
}

function initialiseStructuredDiagramVisual(source, { notify = false } = {}) {
  if (structuredDiagramState.model && source === structuredDiagramState.sourceSnapshot) return true;
  const parsed = parseStructuredDiagram(diagramWizardState.templateId, source);
  if (!parsed.valid) {
    if (notify) showToast(t('diagramVisualUnsupported'), 'warning');
    return false;
  }
  structuredDiagramState.model = parsed.model;
  structuredDiagramState.definition = structuredDiagramDefinition(diagramWizardState.templateId, diagramLocale());
  structuredDiagramState.sourceSnapshot = source;
  return true;
}

function showFlowchartEditorMode(mode, { notify = false } = {}) {
  const template = diagramTemplateById(diagramWizardState.templateId);
  const visualRequested = mode === 'visual';
  const isFlowchart = isCanvasDiagram(template.id) && template.visualEditor === 'canvas';
  const isStructured = template.visualEditor === 'structured' && hasStructuredVisualEditor(template.id);
  if (visualRequested && isFlowchart && !initialiseFlowchartVisual(els.diagramSource.value.trim(), { notify })) return false;
  if (visualRequested && isStructured && !initialiseStructuredDiagramVisual(els.diagramSource.value.trim(), { notify })) return false;
  flowchartDesignerState.mode = visualRequested ? 'visual' : 'source';
  $('#flowchartVisualMode').classList.toggle('active', visualRequested);
  $('#flowchartSourceMode').classList.toggle('active', !visualRequested);
  els.flowchartVisualEditor.classList.toggle('hidden', !visualRequested || !isFlowchart);
  els.structuredDiagramEditor.classList.toggle('hidden', !visualRequested || !isStructured);
  els.diagramBuilderPanel.querySelector('.diagram-source-card').classList.toggle('hidden', visualRequested);
  els.diagramBuilderPanel.querySelector('.diagram-preview-card').classList.toggle('hidden', visualRequested && isFlowchart);
  if (!visualRequested) setDiagramFullscreen(false);
  updateDiagramFullscreenButton();
  if (visualRequested && isFlowchart) renderFlowchartCanvas();
  else if (visualRequested && isStructured) { renderStructuredDiagramEditor(); scheduleDiagramPreview(true); }
  else scheduleDiagramPreview(true);
  return true;
}

function configureFlowchartEditor(template) {
  const hasVisualEditor = Boolean(template.visualEditor);
  els.flowchartModeBar.classList.toggle('hidden', !hasVisualEditor);
  if (!hasVisualEditor) {
    setDiagramFullscreen(false);
    els.flowchartVisualEditor.classList.add('hidden');
    els.structuredDiagramEditor.classList.add('hidden');
    els.diagramBuilderPanel.querySelector('.diagram-source-card').classList.remove('hidden');
    els.diagramBuilderPanel.querySelector('.diagram-preview-card').classList.remove('hidden');
    return;
  }
  if (!showFlowchartEditorMode(flowchartDesignerState.mode)) showFlowchartEditorMode('source');
}

function updateSelectedFlowchartNode(changes) {
  const selection = flowchartDesignerState.selection;
  if (selection?.type !== 'node') return;
  flowchartDesignerState.model = {
    ...flowchartDesignerState.model,
    nodes: flowchartDesignerState.model.nodes.map(node => node.id === selection.id ? { ...node, ...changes } : node)
  };
  syncFlowchartSource();
  renderFlowchartCanvas();
}

function updateSelectedFlowchartEdge(changes) {
  const selection = flowchartDesignerState.selection;
  if (selection?.type !== 'edge') return;
  flowchartDesignerState.model = {
    ...flowchartDesignerState.model,
    edges: flowchartDesignerState.model.edges.map(edge => edge.id === selection.id ? { ...edge, ...changes } : edge)
  };
  syncFlowchartSource();
  renderFlowchartCanvas();
}

function deleteSelectedFlowchartElement() {
  const selection = flowchartDesignerState.selection;
  if (!selection || !flowchartDesignerState.model) return;
  if (selection.type === 'nodes') {
    const selectedIds = new Set(selection.ids);
    flowchartDesignerState.model = {
      ...flowchartDesignerState.model,
      nodes: flowchartDesignerState.model.nodes.filter(node => !selectedIds.has(node.id)),
      edges: flowchartDesignerState.model.edges.filter(edge => !selectedIds.has(edge.from) && !selectedIds.has(edge.to))
    };
  } else {
    flowchartDesignerState.model = selection.type === 'node'
      ? removeFlowchartNode(flowchartDesignerState.model, selection.id)
      : removeFlowchartEdge(flowchartDesignerState.model, selection.id);
  }
  if (flowchartDesignerState.model.canvasType === 'state') {
    const connected = new Set(flowchartDesignerState.model.edges.flatMap(edge => [edge.from, edge.to]));
    flowchartDesignerState.model = {
      ...flowchartDesignerState.model,
      nodes: flowchartDesignerState.model.nodes.filter(node => node.stateToken !== '[*]' || connected.has(node.id))
    };
  }
  flowchartDesignerState.selection = null;
  flowchartDesignerState.connectFrom = '';
  syncFlowchartSource();
  renderFlowchartCanvas();
}

function addFlowchartNodeAt(shape, position = null) {
  if (!flowchartDesignerState.model) return;
  const type = flowchartDesignerState.model.canvasType || 'flowchart';
  if (type === 'mindmap') {
    const selectedId = flowchartDesignerState.selection?.type === 'node' ? flowchartDesignerState.selection.id : '';
    const root = flowchartDesignerState.model.nodes.find(node => node.mindmapRoot) || flowchartDesignerState.model.nodes[0];
    const selected = flowchartDesignerState.model.nodes.find(node => node.id === selectedId) || root;
    const parentEdge = selected && flowchartDesignerState.model.edges.find(edge => edge.to === selected.id);
    const parentId = shape === 'decision' && parentEdge ? parentEdge.from : selected?.id || root?.id;
    const result = addFlowchartNode(flowchartDesignerState.model, 'round', t('flowchartNodeDefault'));
    result.node.label = t('canvasMindmapChild');
    if (position) Object.assign(result.node, position);
    result.model = parentId ? addFlowchartEdge(result.model, parentId, result.node.id) : result.model;
    result.model = { ...result.model, edges: result.model.edges.map(edge => edge.to === result.node.id ? { ...edge, style: 'line' } : edge) };
    if (!root) result.node.mindmapRoot = true;
    flowchartDesignerState.model = result.model;
    flowchartDesignerState.selection = { type: 'node', id: result.node.id };
    syncFlowchartSource();
    renderFlowchartCanvas();
    requestAnimationFrame(() => { els.flowchartNodeLabel.focus(); els.flowchartNodeLabel.select(); });
    return;
  }
  if (type === 'state' && shape === 'terminal') {
    const hasStart = flowchartDesignerState.model.nodes.some(node => node.stateRole === 'start');
    const hasEnd = flowchartDesignerState.model.nodes.some(node => node.stateRole === 'end');
    if (hasStart && hasEnd) return;
    const role = hasStart ? 'end' : 'start';
    const selected = flowchartDesignerState.model.nodes.find(node => node.id === flowchartDesignerState.selection?.id && node.stateToken !== '[*]')
      || flowchartDesignerState.model.nodes.find(node => node.stateToken !== '[*]');
    if (!selected) return;
    const result = addFlowchartNode(flowchartDesignerState.model, 'circle', role === 'start' ? (diagramLocale() === 'en' ? 'Start' : '开始') : (diagramLocale() === 'en' ? 'End' : '结束'));
    result.node.stateToken = '[*]';
    result.node.stateRole = role;
    result.node.diagramNodeType = 'state';
    if (position) Object.assign(result.node, position);
    flowchartDesignerState.model = role === 'start'
      ? addFlowchartEdge(result.model, result.node.id, selected.id)
      : addFlowchartEdge(result.model, selected.id, result.node.id);
    flowchartDesignerState.selection = { type: 'node', id: result.node.id };
    syncFlowchartSource();
    renderFlowchartCanvas();
    return;
  }
  const effectiveShape = type === 'state' ? 'round' : shape;
  const labelKey = shape === 'decision' ? 'flowchartDecisionDefault' : shape === 'terminal' ? 'flowchartTerminalDefault' : 'flowchartNodeDefault';
  let label = type === 'state' ? t('canvasStateNode') : t(labelKey);
  if (type === 'state') {
    const used = new Set(flowchartDesignerState.model.nodes.map(node => node.label));
    let index = 1;
    while (used.has(label)) label = `${t('canvasStateNode')}${index++}`;
  }
  const result = addFlowchartNode(flowchartDesignerState.model, effectiveShape, label);
  if (type === 'state') result.node.diagramNodeType = 'state';
  if (position) Object.assign(result.node, position);
  flowchartDesignerState.model = result.model;
  flowchartDesignerState.selection = { type: 'node', id: result.node.id };
  syncFlowchartSource();
  renderFlowchartCanvas();
  requestAnimationFrame(() => {
    els.flowchartNodeLabel.focus();
    els.flowchartNodeLabel.select();
  });
}

function flowchartCanvasPoint(event) {
  const point = els.flowchartCanvas.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = els.flowchartCanvas.getScreenCTM();
  return matrix ? point.matrixTransform(matrix.inverse()) : { x: event.offsetX, y: event.offsetY };
}

function handleFlowchartNodeClick(nodeId) {
  if (!flowchartDesignerState.connecting) {
    if (flowchartDesignerState.selection?.type === 'nodes' && flowchartDesignerState.selection.ids.includes(nodeId)) return;
    setFlowchartSelection('node', nodeId);
    return;
  }
  if (!flowchartDesignerState.connectFrom) {
    flowchartDesignerState.connectFrom = nodeId;
    flowchartDesignerState.selection = { type: 'node', id: nodeId };
    renderFlowchartCanvas();
    return;
  }
  const previousEdges = flowchartDesignerState.model.edges;
  if (flowchartDesignerState.model.canvasType === 'mindmap') {
    const root = flowchartDesignerState.model.nodes.find(node => node.mindmapRoot);
    const descendants = new Set();
    const visit = id => {
      if (descendants.has(id)) return;
      descendants.add(id);
      flowchartDesignerState.model.edges.filter(edge => edge.from === id).forEach(edge => visit(edge.to));
    };
    visit(nodeId);
    if (nodeId !== root?.id && !descendants.has(flowchartDesignerState.connectFrom)) {
      const withoutOldParent = { ...flowchartDesignerState.model, edges: flowchartDesignerState.model.edges.filter(edge => edge.to !== nodeId) };
      flowchartDesignerState.model = addFlowchartEdge(withoutOldParent, flowchartDesignerState.connectFrom, nodeId);
      flowchartDesignerState.model = { ...flowchartDesignerState.model, edges: flowchartDesignerState.model.edges.map(edge => edge.to === nodeId ? { ...edge, style: 'line' } : edge) };
    }
  } else {
    flowchartDesignerState.model = addFlowchartEdge(flowchartDesignerState.model, flowchartDesignerState.connectFrom, nodeId);
  }
  const addedEdge = flowchartDesignerState.model.edges.find(edge => !previousEdges.includes(edge));
  flowchartDesignerState.connecting = false;
  flowchartDesignerState.connectFrom = '';
  flowchartDesignerState.selection = addedEdge ? { type: 'edge', id: addedEdge.id } : { type: 'node', id: nodeId };
  syncFlowchartSource();
  renderFlowchartCanvas();
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
    button.append(label);
    if (template.visualEditor) {
      const visualBadge = document.createElement('span');
      visualBadge.className = 'diagram-visual-badge';
      visualBadge.title = t('visualEditorAvailable');
      visualBadge.setAttribute('aria-label', t('visualEditorAvailable'));
      visualBadge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h3a4 4 0 0 1 4 4v3M14 11l3 3 3-3"/></svg>';
      button.append(visualBadge);
    }
    button.append(kind);
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
  els.diagramBuilderPanel.querySelector('.formula-builder-heading > code').textContent = template.engine === 'echarts' ? 'ECharts' : 'Mermaid';
  els.diagramSource.value = diagramWizardState.valuesByTemplate.get(template.id) ?? diagramTemplateSource(template, locale);
  renderDiagramTemplateList();
  configureFlowchartEditor(template);
  if (!isCanvasDiagram(template.id) || flowchartDesignerState.mode !== 'visual') scheduleDiagramPreview(true);
}

function chooseDiagramTemplate(templateId) {
  const template = diagramTemplateById(templateId);
  if (!template) return;
  if (diagramWizardState.editRange && template.id !== diagramWizardState.editRange.templateId) return;
  rememberDiagramSource();
  diagramWizardState.templateId = template.id;
  structuredDiagramState.model = null;
  structuredDiagramState.sourceSnapshot = '';
  flowchartDesignerState.model = null;
  flowchartDesignerState.sourceSnapshot = '';
  renderDiagramBuilder();
  els.diagramBuilderPanel.scrollTop = 0;
  requestAnimationFrame(() => isCanvasDiagram(template.id) && flowchartDesignerState.mode === 'visual'
    ? els.flowchartCanvas.focus()
    : template.visualEditor && flowchartDesignerState.mode === 'visual'
      ? els.structuredDiagramEditor.querySelector('input, select, button')?.focus()
      : els.diagramSource.focus());
}

function chooseDiagramCategory(categoryId) {
  if (diagramWizardState.editRange) return;
  if (!DIAGRAM_CATEGORIES.some(category => category.id === categoryId)) return;
  rememberDiagramSource();
  diagramWizardState.category = categoryId;
  const templates = diagramTemplatesForCategory(categoryId);
  if (!templates.some(template => template.id === diagramWizardState.templateId)) {
    diagramWizardState.templateId = templates[0]?.id || 'flowchart';
    structuredDiagramState.model = null;
    structuredDiagramState.sourceSnapshot = '';
    flowchartDesignerState.model = null;
    flowchartDesignerState.sourceSnapshot = '';
  }
  renderDiagramCategoryTabs();
  renderDiagramBuilder();
  els.diagramBuilderPanel.scrollTop = 0;
}

function updateDiagramActionLabels() {
  const key = diagramWizardState.editRange ? 'saveDiagramChanges' : 'insertDiagram';
  const normalButton = $('#insertDiagram');
  const fullscreenLabel = $('#insertDiagramFullscreen span');
  if (normalButton) normalButton.textContent = t(key);
  if (fullscreenLabel) fullscreenLabel.textContent = t(key);
}

function openDiagramDialog(preferredTemplateId = 'flowchart', existingFlowchart = null) {
  if (!state.currentFile || !codeEditor) return;
  const template = diagramTemplateById(existingFlowchart?.templateId || preferredTemplateId);
  diagramWizardState.category = 'all';
  diagramWizardState.templateId = template.id;
  diagramWizardState.valuesByTemplate = new Map();
  diagramWizardState.editRange = existingFlowchart ? {
    from: existingFlowchart.from,
    to: existingFlowchart.to,
    indent: existingFlowchart.indent,
    marker: existingFlowchart.marker,
    lineEnding: existingFlowchart.lineEnding,
    templateId: template.id,
    language: existingFlowchart.language,
    engine: existingFlowchart.engine,
    original: existingFlowchart.original,
    documentSession: state.documentSession
  } : null;
  if (existingFlowchart) diagramWizardState.valuesByTemplate.set(template.id, existingFlowchart.source);
  flowchartDesignerState.mode = 'visual';
  flowchartDesignerState.model = null;
  flowchartDesignerState.zoom = 1;
  flowchartDesignerState.panX = 0;
  flowchartDesignerState.panY = 0;
  flowchartDesignerState.selection = null;
  flowchartDesignerState.connecting = false;
  flowchartDesignerState.connectFrom = '';
  flowchartDesignerState.drag = null;
  flowchartDesignerState.panDrag = null;
  flowchartDesignerState.sourceSnapshot = '';
  structuredDiagramState.model = null;
  structuredDiagramState.definition = null;
  structuredDiagramState.sourceSnapshot = '';
  setDiagramFullscreen(false);
  els.diagramDialog.classList.toggle('editing-existing-flowchart', Boolean(existingFlowchart));
  renderDiagramCategoryTabs();
  renderDiagramBuilder();
  updateDiagramActionLabels();
  els.diagramBuilderPanel.scrollTop = 0;
  els.diagramDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => {
    applyFlowchartZoom();
    els.diagramTemplateList.querySelector('.active')?.focus();
  });
}

function updateDiagramFullscreenButton() {
  const button = els?.diagramFullscreenButton;
  if (!button) return;
  const fullscreen = els.diagramDialog.classList.contains('diagram-fullscreen');
  const available = isCanvasDiagram() && flowchartDesignerState.mode === 'visual';
  button.classList.toggle('hidden', !available);
  const label = t(fullscreen ? 'diagramExitFullscreen' : 'diagramFullscreen');
  button.classList.toggle('active', fullscreen);
  button.setAttribute('aria-pressed', String(fullscreen));
  button.setAttribute('aria-label', label);
  button.title = label;
  const text = button.querySelector('span');
  if (text) text.textContent = label;
}

function setDiagramFullscreen(fullscreen) {
  if (!els?.diagramDialog) return;
  const available = isCanvasDiagram() && flowchartDesignerState.mode === 'visual';
  const enabled = Boolean(fullscreen) && available;
  els.diagramDialog.classList.toggle('diagram-fullscreen', enabled);
  updateDiagramFullscreenButton();
  requestAnimationFrame(() => {
    applyFlowchartZoom();
    if (enabled) $('#exitDiagramFullscreen').focus();
  });
}

function toggleDiagramFullscreen() {
  setDiagramFullscreen(!els.diagramDialog.classList.contains('diagram-fullscreen'));
}

function closeDiagramDialog() {
  if (els.diagramDialog.classList.contains('hidden')) return;
  clearTimeout(diagramPreviewTimer);
  setDiagramFullscreen(false);
  els.diagramDialog.classList.add('hidden');
  els.diagramDialog.classList.remove('editing-existing-flowchart');
  document.body.classList.remove('dialog-open');
  diagramWizardState.editRange = null;
  updateDiagramActionLabels();
  focusCodeEditor();
}

function replaceExistingFlowchart(range, source) {
  if (!codeEditor || !range) return;
  if (!state.editing || range.documentSession !== state.documentSession || codeEditor.state.doc.sliceString(range.from, range.to) !== range.original) {
    showToast(t('diagramSourceChanged'), 'warning');
    return;
  }
  const markdown = diagramReplacementMarkdown(range, source);
  codeEditor.dispatch({
    changes: { from: range.from, to: range.to, insert: markdown },
    selection: { anchor: range.from + markdown.length },
    scrollIntoView: true
  });
  codeEditor.focus();
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
  const editRange = diagramWizardState.editRange;
  closeDiagramDialog();
  if (editRange) {
    replaceExistingFlowchart(editRange, source);
    return;
  }
  const markdownSource = `\n\n\`\`\`${template.engine === 'echarts' ? 'echarts' : 'mermaid'}\n${source}\n\`\`\`\n\n`;
  replaceSelection(markdownSource, 13, source.length);
}

function openTableDialog() {
  if (!state.currentFile || !codeEditor) return;
  const source = codeEditor.state.doc.toString();
  const selection = codeEditor.state.selection.main;
  const existing = findMarkdownTableAt(source, selection.head) || findMarkdownTableAt(source, selection.from);
  tableDesignerState = {
    model: existing?.model || createTableModel(3, 3, index => t('columnNumber', { number: index + 1 })),
    range: existing ? { from: existing.from, to: existing.to } : null
  };
  $('#tableDialogTitle').textContent = t(existing ? 'editTable' : 'visualTableEditor');
  $('#confirmTable').textContent = t(existing ? 'saveTable' : 'insertTableAction');
  els.tableDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  renderTableDesigner({ row: 0, column: 0 });
}

function closeTableDialog() {
  if (els.tableDialog.classList.contains('hidden')) return;
  els.tableDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  tableDesignerState = null;
  clearTableDesignerDropTargets();
  focusCodeEditor();
}

function tableAlignmentLabel(alignment) {
  return t(alignment === 'center' ? 'alignCenter' : alignment === 'right' ? 'alignRight' : 'alignLeft');
}

function renderTableDesigner(focusCell = null) {
  if (!tableDesignerState) return;
  const { model } = tableDesignerState;
  $('#tableRows').value = String(model.cells.length);
  $('#tableColumns').value = String(model.alignments.length);
  $('#addTableRow').disabled = model.cells.length >= TABLE_LIMITS.maxRows;
  $('#addTableColumn').disabled = model.alignments.length >= TABLE_LIMITS.maxColumns;
  const table = document.createElement('table');
  table.className = 'table-designer-table';
  table.style.width = `${64 + model.widths.reduce((total, width) => total + width, 0)}px`;
  const colgroup = document.createElement('colgroup');
  const rowHandleColumn = document.createElement('col');
  rowHandleColumn.style.width = '64px';
  colgroup.append(rowHandleColumn);
  model.widths.forEach(width => {
    const column = document.createElement('col');
    column.style.width = `${width}px`;
    colgroup.append(column);
  });
  table.append(colgroup);

  const toolbarHead = document.createElement('thead');
  const toolbarRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'table-designer-corner';
  corner.textContent = `${model.cells.length} × ${model.alignments.length}`;
  toolbarRow.append(corner);
  model.alignments.forEach((alignment, columnIndex) => {
    const heading = document.createElement('th');
    heading.className = 'table-designer-column-heading';
    heading.dataset.tableDropColumn = String(columnIndex);
    const tools = document.createElement('div');
    tools.className = 'table-column-tools';
    tools.draggable = true;
    tools.dataset.tableDrag = 'column';
    tools.dataset.columnIndex = String(columnIndex);
    const drag = document.createElement('span');
    drag.className = 'table-drag-handle';
    drag.textContent = '⋮⋮';
    drag.title = t('dragTableHint');
    const label = document.createElement('span');
    label.className = 'table-column-label';
    label.textContent = t('columnNumber', { number: columnIndex + 1 });
    const select = document.createElement('select');
    select.dataset.tableAlignment = String(columnIndex);
    select.title = t('alignment');
    select.setAttribute('aria-label', `${t('columnNumber', { number: columnIndex + 1 })} ${t('alignment')}`);
    for (const value of ['left', 'center', 'right']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = tableAlignmentLabel(value);
      option.selected = value === alignment;
      select.append(option);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'table-remove-control';
    remove.dataset.removeTableColumn = String(columnIndex);
    remove.disabled = model.alignments.length <= TABLE_LIMITS.minColumns;
    remove.title = t('deleteColumn');
    remove.setAttribute('aria-label', `${t('deleteColumn')} ${columnIndex + 1}`);
    remove.textContent = '×';
    const resizer = document.createElement('span');
    resizer.className = 'table-column-resizer';
    resizer.dataset.resizeTableColumn = String(columnIndex);
    resizer.title = t('resizeTableHint');
    tools.append(drag, label, select, remove, resizer);
    heading.append(tools);
    toolbarRow.append(heading);
  });
  toolbarHead.append(toolbarRow);
  table.append(toolbarHead);

  const body = document.createElement('tbody');
  model.cells.forEach((row, rowIndex) => {
    const tableRow = document.createElement('tr');
    if (rowIndex > 0) tableRow.dataset.tableDropRow = String(rowIndex);
    const rowHeading = document.createElement('th');
    rowHeading.className = 'table-designer-row-heading';
    const rowTools = document.createElement('div');
    rowTools.className = 'table-row-tools';
    if (rowIndex > 0) {
      rowTools.draggable = true;
      rowTools.dataset.tableDrag = 'row';
      rowTools.dataset.rowIndex = String(rowIndex);
    }
    const rowGrip = document.createElement('span');
    rowGrip.className = 'table-drag-handle';
    rowGrip.textContent = rowIndex === 0 ? 'H' : '⋮⋮';
    rowGrip.title = rowIndex === 0 ? t('headerRow') : t('dragTableHint');
    const rowLabel = document.createElement('span');
    rowLabel.textContent = rowIndex === 0 ? t('headerRow') : String(rowIndex);
    rowTools.append(rowGrip, rowLabel);
    if (rowIndex > 0) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'table-remove-control';
      remove.dataset.removeTableRow = String(rowIndex);
      remove.disabled = model.cells.length <= TABLE_LIMITS.minRows;
      remove.title = t('deleteRow');
      remove.setAttribute('aria-label', `${t('deleteRow')} ${rowIndex}`);
      remove.textContent = '×';
      rowTools.append(remove);
    }
    rowHeading.append(rowTools);
    tableRow.append(rowHeading);
    row.forEach((value, columnIndex) => {
      const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
      cell.style.textAlign = model.alignments[columnIndex];
      const input = document.createElement('textarea');
      input.rows = 1;
      input.value = value;
      input.placeholder = t('tableCellPlaceholder');
      input.dataset.tableCellRow = String(rowIndex);
      input.dataset.tableCellColumn = String(columnIndex);
      input.setAttribute('aria-label', `${rowIndex === 0 ? t('headerRow') : t('rowNumber', { number: rowIndex })}，${t('columnNumber', { number: columnIndex + 1 })}`);
      cell.append(input);
      tableRow.append(cell);
    });
    body.append(tableRow);
  });
  table.append(body);
  els.tableDesignerGrid.replaceChildren(table);
  if (focusCell) {
    requestAnimationFrame(() => els.tableDesignerGrid.querySelector(`[data-table-cell-row="${focusCell.row}"][data-table-cell-column="${focusCell.column}"]`)?.focus());
  }
}

function resizeTableFromFields() {
  if (!tableDesignerState) return;
  const rows = Math.max(TABLE_LIMITS.minRows, Math.min(TABLE_LIMITS.maxRows, Number($('#tableRows').value) || 3));
  const columns = Math.max(TABLE_LIMITS.minColumns, Math.min(TABLE_LIMITS.maxColumns, Number($('#tableColumns').value) || 3));
  tableDesignerState.model = resizeTableModel(tableDesignerState.model, rows, columns, index => t('columnNumber', { number: index + 1 }));
  renderTableDesigner();
}

function clearTableDesignerDropTargets() {
  els.tableDesignerGrid?.querySelectorAll('.is-drop-target, .is-dragging').forEach(element => element.classList.remove('is-drop-target', 'is-dragging'));
  tableDesignerDrag = null;
}

function saveVisualTable() {
  if (!tableDesignerState || !codeEditor) return;
  const markdown = serializeMarkdownTable(tableDesignerState.model);
  if (tableDesignerState.range) {
    const { from, to } = tableDesignerState.range;
    codeEditor.dispatch({
      changes: { from, to, insert: `${markdown}\n` },
      selection: { anchor: from, head: from + markdown.length },
      scrollIntoView: true
    });
  } else {
    const selection = codeEditor.state.selection.main;
    const source = codeEditor.state.doc.toString();
    const prefix = selection.from > 0 && source[selection.from - 1] !== '\n' ? '\n\n' : '';
    const suffix = selection.to < source.length && source[selection.to] !== '\n' ? '\n\n' : '\n';
    const insert = `${prefix}${markdown}${suffix}`;
    codeEditor.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selection.from + prefix.length, head: selection.from + prefix.length + markdown.length },
      scrollIntoView: true
    });
  }
  closeTableDialog();
}

function applyImageUploadSettings(settings) {
  state.imageUploadMode = ['picgo-cloud', 'picgo'].includes(settings?.mode) ? settings.mode : 'local';
  state.picGoServerURL = String(settings?.serverUrl || 'http://127.0.0.1:36677');
  state.picGoHasSecret = Boolean(settings?.hasSecret);
	state.picGoCloudHasToken = Boolean(settings?.hasCloudToken);
}

function selectedImageUploadMode() {
	const mode = document.querySelector('input[name="imageUploadMode"]:checked')?.value;
	return ['picgo-cloud', 'picgo'].includes(mode) ? mode : 'local';
}

function currentImageUploadSettingsInput() {
  return {
    mode: selectedImageUploadMode(),
    serverUrl: els.picGoServerURL.value.trim(),
    secret: els.picGoSecret.value,
    clearSecret: els.clearPicGoSecret.checked,
  };
}

function setPicGoWizardStep(step) {
  const normalizedStep = Math.max(1, Math.min(3, Number(step) || 1));
  state.picGoSetupStep = normalizedStep;
  els.picGoSetupInstall.classList.toggle('hidden', normalizedStep !== 1);
  els.picGoSetupConnect.classList.toggle('hidden', normalizedStep !== 2);
  els.picGoSetupReady.classList.toggle('hidden', normalizedStep !== 3);
  els.picGoSetupWizard.querySelectorAll('[data-picgo-step]').forEach(item => {
    const itemStep = Number(item.dataset.picgoStep);
    item.classList.toggle('active', itemStep === normalizedStep);
    item.classList.toggle('complete', itemStep < normalizedStep);
  });
  const saveButton = $('#saveImageUploadSettings');
  const readyToEnable = selectedImageUploadMode() === 'picgo' && state.picGoConnectionReady;
  saveButton.dataset.i18n = readyToEnable ? 'enablePicGo' : 'saveSettings';
  saveButton.textContent = t(readyToEnable ? 'enablePicGo' : 'saveSettings');
}

function updatePicGoSettingsAvailability() {
	const mode = selectedImageUploadMode();
	const cloudEnabled = mode === 'picgo-cloud';
	const localPicGoEnabled = mode === 'picgo';
	els.picGoCloudSetup.classList.toggle('hidden', !cloudEnabled);
	els.picGoSetupWizard.classList.toggle('hidden', !localPicGoEnabled);
	els.localAssetsSummary.classList.toggle('hidden', mode !== 'local');
	$('#saveImageUploadSettings').disabled = (cloudEnabled && !state.picGoCloudConnectionReady) || (localPicGoEnabled && !state.picGoConnectionReady);
	$('#testPicGo').disabled = !localPicGoEnabled;
  setPicGoWizardStep(state.picGoSetupStep);
}

function setPicGoCloudStatus(message = '', kind = '') {
	els.picGoCloudStatus.textContent = message;
	els.picGoCloudStatus.classList.toggle('success', kind === 'success');
	els.picGoCloudStatus.classList.toggle('error', kind === 'error');
}

function applyPicGoCloudStatus(status) {
	state.picGoCloudConnectionReady = Boolean(status?.connected);
	state.picGoCloudHasToken = state.picGoCloudConnectionReady || state.picGoCloudHasToken;
	state.picGoCloudUser = String(status?.user || '');
	els.picGoCloudAccount.classList.toggle('hidden', !state.picGoCloudConnectionReady);
	els.picGoCloudUser.textContent = state.picGoCloudUser;
	$('#loginPicGoCloud').classList.toggle('hidden', state.picGoCloudConnectionReady);
	$('#testPicGoCloud').classList.toggle('hidden', !state.picGoCloudHasToken);
	$('#logoutPicGoCloud').classList.toggle('hidden', !state.picGoCloudHasToken);
	updatePicGoSettingsAvailability();
}

function setPicGoTestStatus(message = '', kind = '') {
  els.picGoTestStatus.textContent = message;
  els.picGoTestStatus.classList.toggle('success', kind === 'success');
  els.picGoTestStatus.classList.toggle('error', kind === 'error');
}

async function testPicGoCloudConnection({ quiet = false } = {}) {
	const button = $('#testPicGoCloud');
	button.disabled = true;
	if (!quiet) setPicGoCloudStatus(t('picGoCloudChecking'));
	try {
		const status = await window.quilliteMarkdown.testPicGoCloud();
		applyPicGoCloudStatus(status);
		setPicGoCloudStatus(t('picGoCloudConnected'), 'success');
		return true;
	} catch (error) {
		console.warn('PicGo Cloud connection test failed', error);
		state.picGoCloudConnectionReady = false;
		state.picGoCloudHasToken = false;
		applyPicGoCloudStatus({ connected: false });
		setPicGoCloudStatus(t('picGoCloudConnectionFailed'), 'error');
		return false;
	} finally {
		button.disabled = false;
	}
}

async function loginPicGoCloud() {
	const button = $('#loginPicGoCloud');
	button.disabled = true;
	setPicGoCloudStatus(t('picGoCloudSigningIn'));
	try {
		const status = await window.quilliteMarkdown.loginPicGoCloud();
		state.picGoCloudHasToken = true;
		applyPicGoCloudStatus(status);
		setPicGoCloudStatus(t('picGoCloudConnected'), 'success');
	} catch (error) {
		console.warn('PicGo Cloud sign-in failed', error);
		setPicGoCloudStatus(t('picGoCloudLoginFailed'), 'error');
	} finally {
		button.disabled = false;
	}
}

async function logoutPicGoCloud() {
	try {
		const settings = await window.quilliteMarkdown.logoutPicGoCloud();
		applyImageUploadSettings(settings);
		state.picGoCloudConnectionReady = false;
		applyPicGoCloudStatus({ connected: false });
		document.querySelector(`input[name="imageUploadMode"][value="${state.imageUploadMode}"]`).checked = true;
		updatePicGoSettingsAvailability();
		setPicGoCloudStatus(t('picGoCloudLoggedOut'), 'success');
	} catch (error) {
		console.warn('Unable to sign out of PicGo Cloud', error);
		setPicGoCloudStatus(t('imageUploadSettingsSaveFailed'), 'error');
	}
}

function openImageUploadSettings() {
  if (!els.imageDialog.classList.contains('hidden')) closeImageDialog();
  document.querySelector(`input[name="imageUploadMode"][value="${state.imageUploadMode}"]`).checked = true;
  els.picGoServerURL.value = state.picGoServerURL;
  els.picGoSecret.value = '';
  els.clearPicGoSecret.checked = false;
  els.clearPicGoSecretRow.classList.toggle('hidden', !state.picGoHasSecret);
  els.picGoAdvancedSettings.open = false;
  state.picGoConnectionReady = false;
	state.picGoCloudConnectionReady = false;
	applyPicGoCloudStatus({ connected: false });
	setPicGoCloudStatus();
  setPicGoWizardStep(state.imageUploadMode === 'picgo' ? 2 : 1);
  setPicGoTestStatus();
  updatePicGoSettingsAvailability();
  els.imageUploadSettingsDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => {
    document.querySelector('input[name="imageUploadMode"]:checked')?.focus();
    if (state.imageUploadMode === 'picgo') testPicGoConnection({ automatic: true });
		if (state.imageUploadMode === 'picgo-cloud' && state.picGoCloudHasToken) testPicGoCloudConnection({ quiet: true });
  });
}

function closeImageUploadSettings() {
  if (els.imageUploadSettingsDialog.classList.contains('hidden')) return;
  state.picGoDetectionRun += 1;
  els.imageUploadSettingsDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  $('#moreButton').focus();
}

async function testPicGoConnection() {
  const button = $('#testPicGo');
  const run = ++state.picGoDetectionRun;
  state.picGoConnectionReady = false;
  setPicGoWizardStep(2);
  updatePicGoSettingsAvailability();
  button.disabled = true;
  setPicGoTestStatus(t('picGoTesting'));
  try {
    await window.quilliteMarkdown.testPicGo(currentImageUploadSettingsInput());
    if (run !== state.picGoDetectionRun) return false;
    state.picGoConnectionReady = true;
    setPicGoWizardStep(3);
    updatePicGoSettingsAvailability();
    setPicGoTestStatus(t('picGoConnected'), 'success');
    return true;
  } catch (error) {
    if (run !== state.picGoDetectionRun) return false;
    console.warn('PicGo connection test failed', error);
    state.picGoConnectionReady = false;
    setPicGoWizardStep(2);
    updatePicGoSettingsAvailability();
    setPicGoTestStatus(t('picGoConnectionFailed'), 'error');
    return false;
  } finally {
    if (run === state.picGoDetectionRun) button.disabled = selectedImageUploadMode() !== 'picgo';
  }
}

async function saveImageUploadSettings() {
  const button = $('#saveImageUploadSettings');
	if (selectedImageUploadMode() === 'picgo-cloud' && !state.picGoCloudConnectionReady) {
		if (!state.picGoCloudHasToken) await loginPicGoCloud();
		else await testPicGoCloudConnection();
		return;
	}
  if (selectedImageUploadMode() === 'picgo' && !state.picGoConnectionReady) {
    await testPicGoConnection();
    return;
  }
  button.disabled = true;
  try {
    const settings = await window.quilliteMarkdown.setImageUploadSettings(currentImageUploadSettingsInput());
    applyImageUploadSettings(settings);
    closeImageUploadSettings();
    showToast(t('imageUploadSettingsSaved'), 'success');
  } catch (error) {
    console.warn('Unable to save image upload settings', error);
    setPicGoTestStatus(t('imageUploadSettingsSaveFailed'), 'error');
  } finally {
    button.disabled = false;
  }
}

async function uploadedOrLocalImagePath(localPath) {
	if (!['picgo-cloud', 'picgo'].includes(state.imageUploadMode)) return { path: localPath, uploaded: false, fallback: false };
  const uploadRun = beginImageUploadProgress();
  let succeeded = false;
  try {
		const uploadedPath = state.imageUploadMode === 'picgo-cloud'
			? await window.quilliteMarkdown.uploadImageToPicGoCloud(state.currentFile.path, localPath)
			: await window.quilliteMarkdown.uploadImageToPicGo(state.currentFile.path, localPath);
    succeeded = true;
    return { path: uploadedPath, uploaded: true, fallback: false };
  } catch (error) {
    console.warn('PicGo upload failed; using the local asset instead', error);
    return { path: localPath, uploaded: false, fallback: true };
  } finally {
    finishImageUploadProgress(uploadRun, succeeded);
  }
}

function beginImageUploadProgress() {
  const run = ++state.imageUploadRun;
  clearTimeout(beginImageUploadProgress.hideTimer);
  els.imageUploadProgressTitle.textContent = t('imageUploadingTitle');
  els.imageUploadProgressDetail.textContent = t('imageUploadPreparing');
  els.imageUploadProgressPercent.textContent = '0%';
  els.imageUploadProgressBar.style.width = '0%';
  els.imageUploadProgress.classList.add('is-indeterminate');
  els.imageUploadProgress.classList.remove('hidden');
  return run;
}

function updateImageUploadProgress(progress) {
  if (els.imageUploadProgress.classList.contains('hidden')) return;
  const phase = String(progress?.phase || 'uploading');
  const done = Math.max(0, Number(progress?.done) || 0);
  const total = Math.max(0, Number(progress?.total) || 0);
  if (phase === 'preparing') {
    els.imageUploadProgress.classList.add('is-indeterminate');
    els.imageUploadProgressDetail.textContent = t('imageUploadPreparing');
    return;
  }
  if (phase === 'failed') return;
  const percent = phase === 'complete' ? 100 : (total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0);
  els.imageUploadProgress.classList.toggle('is-indeterminate', total <= 0 && phase !== 'complete');
  els.imageUploadProgressPercent.textContent = `${percent}%`;
  els.imageUploadProgressBar.style.width = `${percent}%`;
  const finalizing = phase === 'complete' || (total > 0 && done >= total);
  els.imageUploadProgressDetail.textContent = phase === 'complete'
    ? t('imageUploadComplete')
    : (finalizing
        ? t('imageUploadFinalizing')
        : t(state.imageUploadMode === 'picgo-cloud' ? 'imageUploadingCloud' : 'imageUploadingLocalPicGo'));
}

function finishImageUploadProgress(run, succeeded) {
  if (run !== state.imageUploadRun) return;
  if (succeeded) {
    els.imageUploadProgress.classList.remove('is-indeterminate');
    els.imageUploadProgressPercent.textContent = '100%';
    els.imageUploadProgressBar.style.width = '100%';
    els.imageUploadProgressDetail.textContent = t('imageUploadComplete');
  }
  beginImageUploadProgress.hideTimer = setTimeout(() => {
    if (run === state.imageUploadRun) els.imageUploadProgress.classList.add('hidden');
  }, succeeded ? 360 : 120);
}

function showImportedImageResult(result) {
  if (result.uploaded) showToast(t('imageUploaded'), 'success');
  else if (result.fallback) showToast(t('picGoUploadFailedFallback'), 'warning');
  else showToast(t('imageImported'), 'success');
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
    const result = await uploadedOrLocalImagePath(imagePath);
    const selected = els.imageAltInput.value.trim() || selectedImageAlt() || t('imageAlt');
    insertImageReference(result.path, selected, updateImageWidthLabel());
    showImportedImageResult(result);
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
    const result = await uploadedOrLocalImagePath(imagePath);
    insertImageReference(result.path, description || imageDescriptionFromName(sourcePath.split(/[\\/]/).pop()));
    showImportedImageResult(result);
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

async function handleEditorPaste(event) {
  if (!state.editing || !state.currentFile?.path) return;
  const item = [...(event.clipboardData?.items || [])].find(candidate => candidate.kind === 'file' && /^image\//i.test(candidate.type));
  const file = item?.getAsFile();
  const html = event.clipboardData?.getData('text/html') || '';
  const plainText = event.clipboardData?.getData('text/plain') || '';
  if (html && hasRichClipboardHTML(html) && (!file || plainText.trim())) {
    const markdownSource = htmlToMarkdown(html);
    if (markdownSource) {
      event.preventDefault();
      replaceSelection(markdownSource, markdownSource.length, 0);
      showToast(t('richPasteConverted'), 'success', 2400);
      return;
    }
  }
  if (!file) return;
  event.preventDefault();
  try {
    const sourcePath = window.quilliteMarkdown.pathForFile(file);
    const imagePath = sourcePath
      ? await window.quilliteMarkdown.importImage(state.currentFile.path, sourcePath)
      : await window.quilliteMarkdown.savePastedImage(state.currentFile.path, await fileAsDataURL(file));
    if (!imagePath) throw new Error('Pasted image returned no asset path');
    const result = await uploadedOrLocalImagePath(imagePath);
    insertImageReference(result.path, imageDescriptionFromName(file.name));
    showImportedImageResult(result);
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
    spellcheckDecorationField,
    spellcheckViewPlugin,
    EditorView.decorations.from(spellcheckDecorationField),
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
        updateExistingFlowchartButton();
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
    codeEditor.contentDOM.addEventListener('paste', handleEditorPaste);
    codeEditor.contentDOM.addEventListener('contextmenu', openEditorClipboardMenu);
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

function closeEditorClipboardMenu() {
  els.editorClipboardMenu.classList.add('hidden');
  editorClipboardSelection = null;
}

function closeSpellcheckContextMenu() {
  els.spellcheckContextMenu.classList.add('hidden');
  spellingContext = null;
}

function spellingRangeAtCoordinates(event) {
  const position = codeEditor?.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position === null || position === undefined) return null;
  const line = codeEditor.state.doc.lineAt(position);
  const words = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g;
  let match;
  while ((match = words.exec(line.text))) {
    const from = line.from + match.index;
    const to = from + match[0].length;
    if (position >= from && position <= to) return { from, to, word: match[0] };
  }
  return null;
}

function caseMatchedSuggestion(suggestion, original) {
  if (/^[A-Z][a-z]/.test(original)) return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  if (/^[A-Z]+$/.test(original)) return suggestion.toUpperCase();
  return suggestion;
}

function openSpellcheckContextMenu(event) {
  if (!activeSpellchecker) return false;
  const range = spellingRangeAtCoordinates(event);
  if (!range) return false;
  const normalized = range.word.replace(/’/g, "'");
  if (activeSpellchecker.correct(normalized) || state.spellcheckIgnoredWords.has(normalized.toLocaleLowerCase('en'))) return false;
  event.preventDefault();
  event.stopPropagation();
  els.moreMenu.classList.add('hidden');
  closeAccentMenu();
  closeRecentContextMenu();
  closeEditorClipboardMenu();
  spellingContext = range;
  els.spellingContextWord.textContent = range.word;
  const suggestions = activeSpellchecker.suggest(normalized).slice(0, 6).map(word => caseMatchedSuggestion(word, range.word));
  els.spellingSuggestions.replaceChildren(...suggestions.map((suggestion, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'menuitem';
    button.dataset.spellingSuggestion = String(index);
    button.textContent = suggestion;
    return button;
  }));
  spellingContext.suggestions = suggestions;
  els.spellingNoSuggestions.classList.toggle('hidden', suggestions.length > 0);
  els.spellcheckContextMenu.classList.remove('hidden');
  const menuRect = els.spellcheckContextMenu.getBoundingClientRect();
  els.spellcheckContextMenu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - menuRect.width - 8))}px`;
  els.spellcheckContextMenu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - menuRect.height - 8))}px`;
  requestAnimationFrame(() => els.spellcheckContextMenu.querySelector('button')?.focus());
  return true;
}

function openEditorClipboardMenu(event) {
  if (!codeEditor || !state.editing) return;
  if (event.target.closest?.('.cm-spelling-error') && openSpellcheckContextMenu(event)) return;
  const selection = codeEditor.state.selection.main;
  if (selection.empty) return;
  event.preventDefault();
  event.stopPropagation();
  els.moreMenu.classList.add('hidden');
  closeAccentMenu();
  closeRecentContextMenu();
  closeSpellcheckContextMenu();
  editorClipboardSelection = {
    from: selection.from,
    to: selection.to,
    markdown: codeEditor.state.doc.sliceString(selection.from, selection.to)
  };
  els.editorClipboardMenu.classList.remove('hidden');
  const menuRect = els.editorClipboardMenu.getBoundingClientRect();
  const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuRect.width - 8));
  const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuRect.height - 8));
  els.editorClipboardMenu.style.left = `${left}px`;
  els.editorClipboardMenu.style.top = `${top}px`;
  requestAnimationFrame(() => els.editorClipboardMenu.querySelector('button')?.focus());
}

async function copyEditorSelection(mode) {
  const markdownSource = editorClipboardSelection?.markdown || '';
  const output = mode === 'plain' ? markdownToPlainText(markdownSource) : markdownSource;
  closeEditorClipboardMenu();
  if (!output) return;
  try {
    await navigator.clipboard.writeText(output);
    showToast(t(mode === 'plain' ? 'copiedAsPlainText' : 'copiedAsMarkdown'), 'success', 2200);
  } catch (error) {
    reportSilentError(error, 'clipboard.copy');
    showToast(t('clipboardCopyFailed'), 'error');
  } finally {
    focusCodeEditor();
  }
}

function replaceSpellingWithSuggestion(index) {
  const context = spellingContext;
  const suggestion = context?.suggestions?.[index];
  if (!context || !suggestion || !codeEditor) return;
  const current = codeEditor.state.doc.sliceString(context.from, context.to);
  closeSpellcheckContextMenu();
  if (current !== context.word) return;
  codeEditor.dispatch({
    changes: { from: context.from, to: context.to, insert: suggestion },
    selection: { anchor: context.from + suggestion.length },
    scrollIntoView: true
  });
  focusCodeEditor();
}

function ignoreSpellingWord() {
  const word = spellingContext?.word;
  if (!word) return;
  state.spellcheckIgnoredWords.add(word.replace(/’/g, "'").toLocaleLowerCase('en'));
  closeSpellcheckContextMenu();
  refreshSpellcheckDecorations(codeEditor, false);
  showToast(t('spellingIgnored', { word }), 'success', 2400);
  focusCodeEditor();
}

function addSpellingWordToPersonalDictionary() {
  const word = spellingContext?.word?.replace(/’/g, "'");
  if (!word) return;
  state.spellcheckPersonalWords.push(word);
  persistPersonalDictionary();
  activeSpellchecker?.add(word);
  closeSpellcheckContextMenu();
  refreshSpellcheckDecorations(codeEditor, false);
  showToast(t('spellingAdded', { word }), 'success', 2600);
  focusCodeEditor();
}

function clearPersonalDictionary() {
  if (state.spellcheckPersonalWords.length === 0) {
    showToast(t('personalDictionaryEmpty'));
    return;
  }
  if (!window.confirm(t('clearPersonalDictionaryConfirm'))) return;
  state.spellcheckPersonalWords = [];
  persistPersonalDictionary();
  activeSpellchecker = null;
  activeSpellcheckLanguage = '';
  spellcheckLoadGeneration += 1;
  loadSpellcheckDictionary(true);
  showToast(t('personalDictionaryCleared'), 'success');
}

function openRecentContextMenu(event, filePath, missing) {
  event.preventDefault();
  event.stopPropagation();
  els.moreMenu.classList.add('hidden');
  closeAccentMenu();
  closeEditorClipboardMenu();
  closeSpellcheckContextMenu();

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

function positionMoreMenu() {
  const anchor = $('#moreButton');
  if (!anchor || els.moreMenu.classList.contains('hidden')) return;
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = els.moreMenu.getBoundingClientRect();
  const viewportPadding = 8;
  const left = Math.max(
    viewportPadding,
    Math.min(anchorRect.right - menuRect.width, window.innerWidth - menuRect.width - viewportPadding)
  );
  const top = Math.max(viewportPadding, Math.min(anchorRect.bottom + 6, window.innerHeight - menuRect.height - viewportPadding));
  els.moreMenu.style.right = 'auto';
  els.moreMenu.style.left = `${left}px`;
  els.moreMenu.style.top = `${top}px`;
}

function closeSettingsSubmenus() {
  document.querySelectorAll('[data-settings-submenu-panel]').forEach(panel => panel.classList.add('hidden'));
  document.querySelectorAll('[data-settings-submenu]').forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
}

function closeMoreMenu() {
  els.moreMenu.classList.add('hidden');
  closeSettingsSubmenus();
}

function positionSettingsSubmenu(trigger, panel) {
  const triggerRect = trigger.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 6;
  const rightSpace = window.innerWidth - triggerRect.right - viewportPadding;
  const left = rightSpace >= panelRect.width + gap
    ? triggerRect.right + gap
    : Math.max(viewportPadding, triggerRect.left - panelRect.width - gap);
  const top = Math.max(
    viewportPadding,
    Math.min(triggerRect.top - 5, window.innerHeight - panelRect.height - viewportPadding)
  );
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function openSettingsSubmenu(name, focusSelected = false) {
  const trigger = els.moreMenu.querySelector(`[data-settings-submenu="${name}"]`);
  const panel = els.moreMenu.querySelector(`[data-settings-submenu-panel="${name}"]`);
  if (!trigger || !panel) return;
  closeSettingsSubmenus();
  panel.classList.remove('hidden');
  trigger.setAttribute('aria-expanded', 'true');
  positionSettingsSubmenu(trigger, panel);
  if (focusSelected) requestAnimationFrame(() => panel.querySelector('[aria-checked="true"]')?.focus());
}

function toggleAccentMenu() {
  const opening = els.accentMenu.classList.contains('hidden');
  els.moreMenu.classList.add('hidden');
  closeRecentContextMenu();
  closeEditorClipboardMenu();
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

function syncInterfaceLanguageOptions() {
  document.querySelectorAll('#moreMenu button[data-language]').forEach(button => {
    const active = button.dataset.language === state.language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  const current = $('#interfaceLanguageCurrent');
  if (current) current.textContent = state.language === 'en' ? 'English' : '简体中文';
}

function syncFontFamilyOptions() {
  document.querySelectorAll('#moreMenu button[data-font-family]').forEach(button => {
    const active = button.dataset.fontFamily === state.fontFamily;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  const current = $('#fontFamilyCurrent');
  if (current) current.textContent = t({ system: 'fontSystem', sans: 'fontSans', serif: 'fontSerif', rounded: 'fontRounded', songti: 'fontSongti', kaiti: 'fontKaiti' }[state.fontFamily]);
}

async function setFontFamily(fontFamily, silent = false, persist = true) {
  state.fontFamily = normalizeFontFamily(fontFamily);
  document.documentElement.style.setProperty('--app-font-family', fontFamilyCSS(state.fontFamily));
  localStorage.setItem('fontFamily', state.fontFamily);
  syncFontFamilyOptions();
  if (!persist) return state.fontFamily;
  try {
    const saved = await window.quilliteMarkdown.setFontFamily(state.fontFamily);
    state.fontFamily = normalizeFontFamily(saved);
    localStorage.setItem('fontFamily', state.fontFamily);
    document.documentElement.style.setProperty('--app-font-family', fontFamilyCSS(state.fontFamily));
    syncFontFamilyOptions();
    if (!silent) showToast(t('fontChanged'), 'success');
    return state.fontFamily;
  } catch (error) {
    reportSilentError(error, 'preferences.font-family');
    showToast(t('fontSaveFailed'), 'error');
    return state.fontFamily;
  }
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
  return DOC_WIDTH_LEVELS.includes(value) ? value : DEFAULT_DOC_WIDTH;
}

function normalizeEditorLayout(value) {
  return value === 'editor-left' ? 'editor-left' : 'preview-left';
}

function editorResizeDirection() {
  return state.editorLayout === 'editor-left' ? -1 : 1;
}

function syncEditorLayoutOptions() {
  document.querySelectorAll('#moreMenu button[data-editor-layout]').forEach(button => {
    const active = button.dataset.editorLayout === state.editorLayout;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  const current = $('#editorLayoutCurrent');
  if (current) current.textContent = t(state.editorLayout === 'editor-left' ? 'editorOnLeft' : 'previewOnLeft');
}

function setEditorLayout(layout, silent = false) {
  state.editorLayout = normalizeEditorLayout(layout);
  document.body.dataset.editorLayout = state.editorLayout;
  localStorage.setItem('editorLayout', state.editorLayout);
  syncEditorLayoutOptions();
  // Reorder visually only: retain the editor, selection, undo and review state.
  codeEditor?.requestMeasure();
  scheduleFormatToolbarLayout();
  if (!silent) showToast(t('editorLayoutChanged', { layout: t(state.editorLayout === 'editor-left' ? 'editorOnLeft' : 'previewOnLeft') }));
}

function syncDocumentWidthOptions() {
  document.querySelectorAll('#moreMenu button[data-doc-width]').forEach(button => {
    const active = button.dataset.docWidth === state.docWidth;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  const current = $('#docWidthCurrent');
  if (current) current.textContent = t(`width${state.docWidth.charAt(0).toUpperCase()}${state.docWidth.slice(1)}`);
}

function setDocumentWidth(level, silent = false) {
  state.docWidth = normalizeDocWidth(level);
  document.body.dataset.docWidth = state.docWidth;
  localStorage.setItem('docWidth', state.docWidth);
  syncDocumentWidthOptions();
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
  const request = beginDocumentOpen();
  try {
    const doc = await window.quilliteMarkdown.openRecentFile(filePath);
    if (!canApplyDocumentOpen(request) || !doc?.path) return;
    displayDocument(doc);
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

function collectDocumentHeadings(container) {
  const headings = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .filter(heading => !heading.closest('[data-dynamic-toc]'));
  headings.forEach((heading, index) => { heading.id = slugify(heading.textContent, index); });
  return headings;
}

function scrollReaderToHeading(target, behavior = 'smooth') {
  const heading = typeof target === 'string'
    ? [...els.content.querySelectorAll('h1, h2, h3, h4, h5, h6')].find(item => item.id === target)
    : target;
  const reader = $('.reader-pane');
  if (!heading || !reader || !els.content.contains(heading)) return false;
  const top = reader.scrollTop + heading.getBoundingClientRect().top - reader.getBoundingClientRect().top - 28;
  reader.scrollTo({ top: Math.max(0, top), behavior });
  return true;
}

function scrollPreviewContainerToHeading(container, target, behavior = 'smooth') {
  if (container === els.content) return scrollReaderToHeading(target, behavior);
  const heading = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].find(item => item.id === target);
  const scroller = container.closest('.editor-preview-scroll');
  if (!heading || !scroller) return false;
  const top = scroller.scrollTop + heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 22;
  scroller.scrollTo({ top: Math.max(0, top), behavior });
  return true;
}

function tocTreeItems(headings) {
  return buildTocTree(headings.map(heading => ({
    id: heading.id,
    text: heading.textContent,
    level: Number(heading.tagName.slice(1))
  })));
}

function renderDynamicTocs(container, headings = collectDocumentHeadings(container)) {
  const tree = tocTreeItems(headings);
  const renderList = nodes => {
    const list = document.createElement('ol');
    for (const node of nodes) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${node.id}`;
      link.dataset.target = node.id;
      link.textContent = node.text;
      item.append(link);
      if (node.children.length) item.append(renderList(node.children));
      list.append(item);
    }
    return list;
  };
  container.querySelectorAll('[data-dynamic-toc]').forEach(placeholder => {
    placeholder.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = t('dynamicTocTitle');
    placeholder.append(title);
    if (tree.length) placeholder.append(renderList(tree));
  });
}

function highlightedTocTitle(text, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return escapeHtml(text);
  const lower = String(text).toLocaleLowerCase();
  const index = lower.indexOf(needle);
  if (index < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(text.slice(index, index + needle.length))}</mark>${escapeHtml(text.slice(index + needle.length))}`;
}

const compactTocMediaQuery = window.matchMedia?.('(max-width: 1120px)');

function isCompactTocLayout() {
  return compactTocMediaQuery?.matches ?? window.innerWidth <= 1120;
}

function syncCompactTocControls(tocAvailable = state.tocAvailable) {
  state.tocAvailable = Boolean(tocAvailable && state.currentFile && !state.editing);
  const compact = isCompactTocLayout();
  if (!compact || !state.tocAvailable) state.compactTocOpen = false;
  const open = compact && state.tocAvailable && state.compactTocOpen;
  const wideCollapsed = !compact && state.tocAvailable && state.tocPanelCollapsed;
  const expanded = state.tocAvailable && (compact ? open : !wideCollapsed);
  els.tocPanel.classList.toggle('compact-open', open);
  els.tocPanel.classList.toggle('collapsed', wideCollapsed);
  els.compactTocButton.classList.toggle('hidden', !state.tocAvailable || (!compact && !wideCollapsed));
  els.compactTocButton.classList.toggle('compact-open', open);
  els.compactTocButton.setAttribute('aria-expanded', String(expanded));
  els.compactTocButton.setAttribute('aria-label', t(expanded ? 'closeCompactToc' : 'openCompactToc'));
  els.compactTocButton.title = t(expanded ? 'closeCompactToc' : 'openCompactToc');
  els.compactTocBackdrop.classList.toggle('hidden', !compact || !state.tocAvailable);
  els.compactTocBackdrop.classList.toggle('compact-open', open);
  els.tocPanel.setAttribute('aria-hidden', String(!expanded));
  els.tocPanel.inert = !expanded;
}

function setCompactTocOpen(open, restoreFocus = false) {
  state.compactTocOpen = Boolean(open && isCompactTocLayout() && state.tocAvailable);
  syncCompactTocControls();
  if (!state.compactTocOpen && restoreFocus && !els.compactTocButton.classList.contains('hidden')) {
    requestAnimationFrame(() => els.compactTocButton.focus({ preventScroll: true }));
  }
}

function setWideTocCollapsed(collapsed) {
  if (isCompactTocLayout() || !state.tocAvailable) return;
  state.tocPanelCollapsed = Boolean(collapsed);
  localStorage.setItem('tocPanelCollapsed', String(state.tocPanelCollapsed));
  syncCompactTocControls();
  updatePaneResizerVisibility();
  schedulePaneWidthRefresh();
  requestAnimationFrame(() => {
    const target = state.tocPanelCollapsed ? els.compactTocButton : els.closeCompactToc;
    target?.focus({ preventScroll: true });
  });
}

function handleCompactTocLayoutChange() {
  state.compactTocOpen = false;
  syncCompactTocControls();
  updatePaneResizerVisibility();
  applyPaneWidths();
}

function renderToc() {
  const headings = collectDocumentHeadings(els.content);
  const allItems = headings.map(heading => ({
    id: heading.id,
    text: heading.textContent,
    level: Number(heading.tagName.slice(1)),
    children: []
  }));
  const query = state.tocQuery.trim();
  const tree = state.tocMode === 'flat'
    ? allItems.filter(item => !query || item.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    : filterTocTree(tocTreeItems(headings), query);
  const collapsed = readCollapsedToc(localStorage, state.currentFile?.path);
  const renderNodes = nodes => `<ul class="toc-tree">${nodes.map(node => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = hasChildren && !query && collapsed.has(node.id);
    const title = highlightedTocTitle(node.text, query);
    const toggle = state.tocMode === 'tree' && hasChildren
      ? `<button type="button" class="toc-toggle" data-toc-toggle="${escapeHtml(node.id)}" aria-expanded="${String(!isCollapsed)}" aria-label="${escapeHtml(t(isCollapsed ? 'expandTocSection' : 'collapseTocSection', { title: node.text }))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>`
      : '<span class="toc-toggle-placeholder" aria-hidden="true"></span>';
    const children = state.tocMode === 'tree' && hasChildren
      ? `<div class="toc-children${isCollapsed ? ' hidden' : ''}">${renderNodes(node.children)}</div>`
      : '';
    return `<li class="toc-node level-${node.level}${isCollapsed ? ' collapsed' : ''}" data-toc-node="${escapeHtml(node.id)}"><div class="toc-row">${toggle}<a href="#${escapeHtml(node.id)}" data-target="${escapeHtml(node.id)}"><span class="toc-link-text">${title}</span></a></div>${children}</li>`;
  }).join('')}</ul>`;
  els.toc.innerHTML = renderNodes(tree);
  els.toc.classList.toggle('is-flat', state.tocMode === 'flat');
  els.tocEmpty.classList.toggle('hidden', !query || tree.length > 0);
  els.clearTocSearch.classList.toggle('hidden', !query);
  document.querySelectorAll('[data-toc-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tocMode === state.tocMode)));
  const tocAvailable = headings.length >= 2;
  els.tocPanel.classList.toggle('hidden', !tocAvailable);
  syncCompactTocControls(tocAvailable);
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
    if (!scrollReaderToHeading(link.dataset.target)) return;
    els.toc.querySelectorAll('a').forEach(item => item.classList.toggle('active', item === link));
    if (isCompactTocLayout()) setCompactTocOpen(false);
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

function applyMarkdownTableLayouts(container, layouts) {
  const tables = [...container.querySelectorAll('table')];
  const usedTables = new Set();
  layouts.forEach((layout, index) => {
    if (!layout.hasWidthMetadata) return;
    const table = tables.find(candidate => !usedTables.has(candidate) && Number(candidate.dataset.line) === layout.line)
      || tables.find((candidate, candidateIndex) => candidateIndex >= index && !usedTables.has(candidate));
    if (!table || table.closest('.mermaid-diagram, .echarts-diagram')) return;
    usedTables.add(table);
    const widths = layout.model.widths;
    const colgroup = document.createElement('colgroup');
    widths.forEach(width => {
      const column = document.createElement('col');
      column.style.width = `${width}px`;
      colgroup.append(column);
    });
    table.querySelector(':scope > colgroup')?.remove();
    table.prepend(colgroup);
    table.style.width = `${widths.reduce((total, width) => total + width, 0)}px`;
    table.style.maxWidth = 'none';
    table.style.tableLayout = 'fixed';
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-table-scroll';
    if (table.dataset.line) {
      wrapper.dataset.line = table.dataset.line;
      delete table.dataset.line;
    }
    table.before(wrapper);
    wrapper.append(table);
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
  const tableLayouts = findMarkdownTables(content);
  const prepared = prepareFootnotes(replaceDynamicTocMarkers(stripTableWidthMetadata(content)));
  let html = marked.parse(prepared.markdown);
  html += renderFootnoteSection(prepared.notes, text => marked.parseInline(text), t('footnotes'));
  html = DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel', 'data-md-color'] });
  // The reusable snapshots above are plain SVG strings. Release the live
  // ECharts instances and ResizeObservers before replacing the preview DOM,
  // otherwise repeated editing of a chart-heavy document gradually retains
  // detached observers and makes typing/scrolling feel sluggish.
  releaseEChartsDiagrams(container);
  container.innerHTML = html;
  if (container === els.editorPreview && state.editing) {
    container.querySelectorAll('.math-inline, .math-block').forEach(formula => {
      formula.classList.add('editable-preview-formula');
      formula.title = t('formulaPreviewEditHint');
    });
  }
  const documentHeadings = collectDocumentHeadings(container);
  renderDynamicTocs(container, documentHeadings);
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
  applyMarkdownTableLayouts(container, tableLayouts);
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

function beginDocumentOpen() {
  return { id: ++state.documentOpenRequest, session: state.documentSession, content: state.currentFile?.content };
}

function canApplyDocumentOpen(request) {
  return request.id === state.documentOpenRequest && request.session === state.documentSession
    && (request.content === state.currentFile?.content || maybeDiscardChanges());
}

function syncDocumentAccessControls() {
  const readOnly = Boolean(state.currentFile?.readOnly);
  els.documentView.classList.toggle('reference-document', readOnly);
  els.editButton.disabled = !state.currentFile || readOnly;
  els.saveButton.disabled = !state.currentFile || readOnly;
  els.editButton.title = readOnly ? t('referenceReadOnlyTitle') : t('toggleEditorTitle');
  els.saveButton.title = readOnly ? t('referenceReadOnlyTitle') : t('saveTitle');
}

function displayDocument(doc, { addToLibrary = true } = {}) {
  if (!doc?.path) return;
  state.documentSession += 1;
  closeAIRewrite();
  pendingAIRewriteSelection = null;
  resetAIDocumentReviewSession();
  if (!sameDocumentPath(state.currentFile?.path, doc.path)) state.spellcheckIgnoredWords = new Set();
  state.currentFile = doc;
  missingCurrentFilePath = '';
  state.savedContent = doc.content;
  state.saveAsRequired = false;
  state.saveWarningShown = false;
  state.tocQuery = '';
  state.compactTocOpen = false;
  els.tocSearchInput.value = '';
  if (addToLibrary) addRecentDocument(doc);
  state.editing = false;
  replaceEditorContent(doc.content, true);
  renderEditorPreview(doc.content);
  els.editorFileName.textContent = doc.name;
  els.welcome.classList.add('hidden');
  els.editorView.classList.add('hidden');
  els.documentView.classList.remove('hidden');
  syncDocumentAccessControls();
  els.editButton.classList.remove('active');
  els.editButtonLabel.textContent = t('edit');
  renderCurrentDocument();
  setDirty(false);
  $('.reader-pane').scrollTo({ top: 0 });
}

function closePreview() {
  if (!maybeDiscardChanges()) return;
  state.documentSession += 1;
  closeAIRewrite();
  pendingAIRewriteSelection = null;
  resetAIDocumentReviewSession();
  closeSearch();
  closeDocumentActionsMenu();
  releaseEChartsDiagrams(els.content);
  state.currentFile = null;
  state.spellcheckIgnoredWords = new Set();
  state.editing = false;
  state.savedContent = '';
  state.saveAsRequired = false;
  state.saveWarningShown = false;
  state.tocQuery = '';
  els.tocSearchInput.value = '';
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
  syncCompactTocControls(false);
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

function updateNewFileButtonState() {
  const button = $('#newFileButton');
  if (!button) return;
  button.disabled = newFileRequestInProgress || Date.now() < newFileCooldownUntil;
  button.setAttribute('aria-busy', newFileRequestInProgress ? 'true' : 'false');
}

function releaseNewFileCooldown() {
  const remaining = newFileCooldownUntil - Date.now();
  if (remaining > 0) {
    newFileCooldownTimer = window.setTimeout(releaseNewFileCooldown, remaining);
    return;
  }
  newFileCooldownUntil = 0;
  newFileCooldownTimer = null;
  updateNewFileButtonState();
}

function startNewFileCooldown() {
  newFileCooldownUntil = Date.now() + NEW_FILE_COOLDOWN_MS;
  if (newFileCooldownTimer !== null) window.clearTimeout(newFileCooldownTimer);
  newFileCooldownTimer = window.setTimeout(releaseNewFileCooldown, NEW_FILE_COOLDOWN_MS);
  updateNewFileButtonState();
}

async function newFile() {
  if (newFileRequestInProgress || Date.now() < newFileCooldownUntil) return;
  if (!maybeDiscardChanges()) return;
  const request = beginDocumentOpen();
  newFileRequestInProgress = true;
  updateNewFileButtonState();
  try {
    const doc = await window.quilliteMarkdown.newFile();
    if (!doc?.path) return;
    startNewFileCooldown();
    if (!canApplyDocumentOpen(request)) return;
    displayDocument(doc);
    await toggleEditor(true);
    if (pathIsInsideRoot(doc.path)) await refreshExplorer();
  } catch (error) {
    reportSilentError(error, 'document.create');
    console.error(error);
    showToast(t('newFileFailed'), 'error');
  } finally {
    newFileRequestInProgress = false;
    updateNewFileButtonState();
  }
}

async function loadFile(filePath) {
  if (!maybeDiscardChanges()) return;
  const request = beginDocumentOpen();
  try {
    const doc = await window.quilliteMarkdown.openRecentFile(filePath);
    if (canApplyDocumentOpen(request)) displayDocument(doc);
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
  const requestedSession = state.documentSession;
  if (isCurrent) {
    const saved = await saveDocument(true);
    if (!saved || requestedSession !== state.documentSession) return false;
    if (editAfterSave) await toggleEditor(true);
    return true;
  }
  if (!isCurrent && !maybeDiscardChanges()) return;
  const previousContent = state.currentFile?.content;
  try {
    const source = await window.quilliteMarkdown.readFile(filePath);
    if (requestedSession !== state.documentSession) return false;
    if (!source?.path) return;
    const saved = await window.quilliteMarkdown.saveAs(source.path, source.content);
    if (!saved?.path) return;
    if (requestedSession !== state.documentSession || previousContent !== state.currentFile?.content) return false;
    displayDocument(saved);
    const savedSession = state.documentSession;
    await refreshLibraryAfterReplacement(saved);
    if (savedSession !== state.documentSession) return false;
    showToast(t('saveAsDone'), 'success');
    if (editAfterSave) await toggleEditor(true);
    return true;
  } catch (error) {
    reportSilentError(error, 'document.save-as');
    console.error(error);
    if (requestedSession !== state.documentSession) return false;
    showToast(t('saveFailed'), 'error');
    return false;
  }
}

async function refreshCurrentFileFromDisk() {
  if (!state.currentFile?.path || state.dirty || state.saving || externalRefreshInProgress) return;
  const requestedPath = state.currentFile.path;
  const requestedSession = state.documentSession;
  externalRefreshInProgress = true;
  try {
    if (sameDocumentPath(missingCurrentFilePath, requestedPath)) {
      await refreshLibraryFileStatuses();
      if (requestedSession !== state.documentSession) return;
      const recentEntry = state.recentFiles.find(file => sameDocumentPath(file.path, requestedPath));
      if (recentEntry?.exists === false) return;
      missingCurrentFilePath = '';
    }
    const refreshed = await window.quilliteMarkdown.readFile(requestedPath);
    if (requestedSession !== state.documentSession || !state.currentFile || !sameDocumentPath(state.currentFile.path, requestedPath) || state.dirty || state.saving) return;
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
    if (requestedSession !== state.documentSession) return;
    if (isMissingDocumentError(error)) {
      const firstMissingNotice = !sameDocumentPath(missingCurrentFilePath, requestedPath);
      missingCurrentFilePath = requestedPath;
      await refreshLibraryFileStatuses();
      if (requestedSession === state.documentSession && firstMissingNotice) showToast(t('currentDocumentMissing'), 'warning');
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
  const requestedSession = state.documentSession;
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
      if (requestedSession !== state.documentSession) return;
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
      if (requestedSession !== state.documentSession || !state.currentFile || !sameDocumentPath(state.currentFile.path, requestedPath)) return;
    }
    state.editing = nextEditing;
    if (state.editing) {
      resetAIDocumentReviewSession();
      if (editorContent() !== state.currentFile.content) replaceEditorContent(state.currentFile.content, true);
      renderEditorPreview(state.currentFile.content);
      els.documentView.classList.add('hidden');
      els.editorView.classList.remove('hidden');
      els.tocPanel.classList.add('hidden');
      syncCompactTocControls(false);
      updatePaneResizerVisibility();
      els.backToTop.classList.remove('visible');
      els.editButton.classList.add('active');
      els.editButtonLabel.textContent = t('preview');
      focusCodeEditor();
      updateEditorPosition();
      updateExistingFlowchartButton();
    } else {
      resetAIDocumentReviewSession();
      state.currentFile.content = editorContent();
      renderCurrentDocument();
      els.editorView.classList.add('hidden');
      els.documentView.classList.remove('hidden');
      els.editButton.classList.remove('active');
      els.editButtonLabel.textContent = t('edit');
      updateExistingFlowchartButton();
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
  const requestedSession = state.documentSession;
  const isCurrentSession = () => requestedSession === state.documentSession && Boolean(state.currentFile);
  let fallbackToSaveAs = false;
  state.saving = true;
  try {
    const saved = saveAs
      ? await window.quilliteMarkdown.saveAs(originalPath, editingContent)
      : await window.quilliteMarkdown.saveFile(originalPath, editingContent);
    if (!saved) return;
    if (!isCurrentSession()) return;
    const currentContent = state.editing ? editorContent() : state.currentFile.content;
    const unchangedSinceSave = currentContent === editingContent;
    state.currentFile = saved;
    state.saveAsRequired = false;
    state.saveWarningShown = false;
    state.currentFile.content = currentContent;
    state.savedContent = editingContent;
    syncDocumentAccessControls();
    addRecentDocument(saved);
    renderEditorPreview(state.currentFile.content);
    if (!state.editing) renderCurrentDocument();
    els.editorFileName.textContent = saved.name;
    if (state.sidebarMode === 'recent') state.files = [...state.recentFiles];
    renderFileList();
    setDirty(!unchangedSinceSave);
    await refreshLibraryAfterReplacement(saved);
    if (!isCurrentSession()) return;
    if (pathIsInsideRoot(saved.path)) await refreshExplorer();
    if (!isCurrentSession()) return;
    if (options.auto && !state.dirty) {
      els.editorSaveState.textContent = t('autoSaved');
      clearTimeout(saveDocument.statusTimer);
      saveDocument.statusTimer = setTimeout(() => { if (isCurrentSession() && !state.dirty) els.editorSaveState.textContent = t('saved'); }, 1800);
    } else if (!options.silent) {
      showToast(t(saveAs ? 'saveAsDone' : 'saveDone'), 'success');
    }
    return saved;
  } catch (error) {
    reportSilentError(error, 'document.save');
    if (!isCurrentSession()) return;
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
  if (fallbackToSaveAs && isCurrentSession()) return await saveDocument(true, options);
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
    if (!element.matches('h1, h2, h3, h4, h5, h6')) element.removeAttribute('id');
    element.removeAttribute('data-line');
    element.removeAttribute('contenteditable');
  });
  return clone.innerHTML;
}

function expandExportTemplate(template) {
  const title = state.currentFile?.name?.replace(/\.[^.]+$/, '') || t('untitledDocument');
  const date = new Intl.DateTimeFormat(state.language === 'en' ? 'en' : 'zh-CN').format(new Date());
  return String(template || '').replaceAll('{title}', title).replaceAll('{date}', date).replaceAll('{page}', '1');
}

function addExportEdges(renderedHTML, header, footer) {
  if (!header && !footer) return renderedHTML;
  const wrapper = document.createElement('div');
  if (header) {
    const element = document.createElement('header');
    element.className = 'export-document-header';
    element.textContent = expandExportTemplate(header);
    wrapper.append(element);
  }
  const content = document.createElement('div');
  content.innerHTML = renderedHTML;
  wrapper.append(...content.childNodes);
  if (footer) {
    const element = document.createElement('footer');
    element.className = 'export-document-footer';
    element.textContent = expandExportTemplate(footer);
    wrapper.append(element);
  }
  return wrapper.innerHTML;
}

async function renderedHTMLForExport(header = '', footer = '') {
  const container = exportPreviewContainer();
  await waitForPreviewImages(container);
  return addExportEdges(await cleanRenderedHTMLForExport(container), header, footer);
}

async function exportWordDocument(options = {}) {
  if (!state.currentFile) {
    showToast(t('exportNoDocument'), 'warning');
    return;
  }
  try {
    const output = await window.quilliteMarkdown.exportDOCX(
      state.currentFile.path,
      state.currentFile.name,
      await renderedHTMLForExport(options.header, options.footer)
    );
    if (output) showToast(t('wordExported'), 'success');
    return output;
  } catch (error) {
    if (isExportFileInUseError(error)) {
      showToast(t('exportFileInUse'), 'warning');
      return false;
    }
    reportSilentError(error, 'document.export-word');
    console.error(error);
    showToast(t('wordExportFailed'), 'error');
    return false;
  }
}

async function exportHTMLDocument(options = {}) {
  if (!state.currentFile) {
    showToast(t('exportNoDocument'), 'warning');
    return;
  }
  try {
    const output = await window.quilliteMarkdown.exportHTML(
      state.currentFile.path,
      state.currentFile.name,
      await renderedHTMLForExport(options.header, options.footer),
      state.colorMode,
      ACCENT_THEMES[state.accentTheme].color
    );
    if (output) showToast(t('htmlExported'), 'success');
    return output;
  } catch (error) {
    if (isExportFileInUseError(error)) {
      showToast(t('exportFileInUse'), 'warning');
      return false;
    }
    reportSilentError(error, 'document.export-html');
    console.error(error);
    showToast(t('htmlExportFailed'), 'error');
    return false;
  }
}

async function exportPlainHTMLDocument(options = {}) {
  const output = await window.quilliteMarkdown.exportPlainHTML(
    state.currentFile.path,
    state.currentFile.name,
    await renderedHTMLForExport(),
    options.header || '',
    options.footer || ''
  );
  if (output) showToast(t('htmlExported'), 'success');
  return output;
}

async function exportPDFWithBookmarks(options = {}, { allowSystemFallback = true, showTutorialOnFallback = false } = {}) {
  if (!state.currentFile) {
    showToast(t('exportNoDocument'), 'warning');
    return false;
  }
  try {
    const output = await window.quilliteMarkdown.exportPDF(
      state.currentFile.path,
      state.currentFile.name,
      await renderedHTMLForExport(),
      options.header || '',
      options.footer || ''
    );
    if (output) showToast(t('pdfExported'), 'success');
    return output;
  } catch (error) {
    if (String(error?.message || error).includes('PDF_ENGINE_NOT_FOUND') && allowSystemFallback) {
      showToast(t('pdfEngineFallback'), 'warning');
      if (showTutorialOnFallback) {
        openPDFTutorial();
        return 'tutorial';
      }
      await printCurrentDocument(options);
      return 'print';
    }
    if (isExportFileInUseError(error)) {
      showToast(t('exportFileInUse'), 'warning');
      return false;
    }
    reportSilentError(error, 'document.export-pdf');
    showToast(error?.message || t('pdfDirectFailed'), 'error');
    return false;
  }
}

function normalizeExportPreset(value = {}) {
  const format = EXPORT_FORMAT_DESCRIPTIONS[value.format] ? value.format : 'docx';
  const imageLayout = value.imageLayout === 'long' ? 'long' : 'pages';
  return {
    id: String(value.id || ''), name: String(value.name || ''), format,
    header: String(value.header || ''), footer: String(value.footer || ''),
    extraArguments: String(value.extraArguments || ''), customWriter: String(value.customWriter || 'plain'),
    customExtension: String(value.customExtension || '.txt'), imageScale: Math.min(3, Math.max(1, Number(value.imageScale) || 2)), imageLayout
  };
}

function readExportDraft() {
  const format = els.exportFormatGrid.querySelector('[data-export-format].active')?.dataset.exportFormat || state.exportDraft.format;
  const custom = format === 'custom';
  return normalizeExportPreset({
    ...state.exportDraft,
    format,
    header: '',
    footer: '',
    extraArguments: custom ? els.pandocExtraArguments.value : '',
    customWriter: els.pandocCustomWriter.value,
    customExtension: els.pandocCustomExtension.value,
    imageScale: 2,
    imageLayout: els.exportImageLayout.value
  });
}

function writeExportDraft(value) {
  state.exportDraft = normalizeExportPreset(value);
  els.exportHeader.value = state.exportDraft.header;
  els.exportFooter.value = state.exportDraft.footer;
  els.pandocExtraArguments.value = state.exportDraft.extraArguments;
  els.pandocCustomWriter.value = state.exportDraft.customWriter;
  els.pandocCustomExtension.value = state.exportDraft.customExtension;
  els.exportImageScale.value = String(state.exportDraft.imageScale);
  els.exportImageLayout.value = state.exportDraft.imageLayout;
  syncExportCenterUI();
}

function renderExportPresets(selectedID = '') {
  els.exportPresetSelect.replaceChildren();
  const current = document.createElement('option');
  current.value = '';
  current.textContent = t('currentExportSettings');
  els.exportPresetSelect.append(current);
  for (const preset of state.exportSettings.presets || []) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    els.exportPresetSelect.append(option);
  }
  els.exportPresetSelect.value = selectedID;
  $('#deleteExportPreset').disabled = !selectedID;
}

function syncExportCenterUI() {
  const format = state.exportDraft.format;
  const pandocFormat = PANDOC_EXPORT_FORMATS.has(format);
  const customPandoc = format === 'custom';
  const needsPandocSetup = pandocFormat && !state.pandocStatus.available;
  els.exportFormatGrid.querySelectorAll('[data-export-format]').forEach(button => {
    const active = button.dataset.exportFormat === format;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  els.exportFormatDescription.textContent = t(EXPORT_FORMAT_DESCRIPTIONS[format]);
  els.exportImageOptions.classList.toggle('hidden', !['png', 'jpeg'].includes(format));
  els.pandocExportOptions.classList.toggle('hidden', !needsPandocSetup && !customPandoc);
  $('#pandocSetupFields').classList.toggle('hidden', !needsPandocSetup);
  els.customPandocFields.classList.toggle('hidden', !customPandoc);
  $('#pandocArgumentsField').classList.toggle('hidden', !customPandoc);
  $('#pandocSecurityHint').classList.toggle('hidden', !customPandoc);
  if (pandocFormat) $('#exportAdvancedFormats').open = true;
  els.pandocPath.value = state.pandocStatus.path || state.exportSettings.pandocPath || '';
  els.pandocStatusText.textContent = state.pandocStatus.available
    ? t('pandocDetected', { version: state.pandocStatus.version || 'Pandoc' })
    : t('pandocNotDetected');
}

async function refreshPandocStatus() {
  try {
    state.pandocStatus = await window.quilliteMarkdown.detectPandoc() || { available: false, path: '', version: '' };
  } catch {
    state.pandocStatus = { available: false, path: state.exportSettings.pandocPath || '', version: '' };
  }
  syncExportCenterUI();
  return state.pandocStatus;
}

async function openExportCenter() {
  if (!state.currentFile) {
    showToast(t('exportNoDocument'), 'warning');
    return;
  }
  try {
    state.exportSettings = await window.quilliteMarkdown.getExportSettings() || { pandocPath: '', presets: [] };
  } catch (error) {
    reportSilentError(error, 'export.settings-read');
  }
  state.exportSettings.presets = (state.exportSettings.presets || []).map(normalizeExportPreset);
  renderExportPresets();
  els.exportPresetName.value = '';
  writeExportDraft(state.exportDraft);
  els.exportCenterStatus.textContent = '';
  els.exportCenterDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => els.exportFormatGrid.querySelector('.active')?.focus());
  refreshPandocStatus();
}

function closeExportCenter(restoreFocus = true) {
  if (state.exportInProgress || els.exportCenterDialog.classList.contains('hidden')) return;
  els.exportCenterDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
  if (restoreFocus) $('#moreButton').focus();
}

async function persistExportSettings(selectedID = '') {
  state.exportSettings = await window.quilliteMarkdown.setExportSettings(state.exportSettings) || state.exportSettings;
  state.exportSettings.presets = (state.exportSettings.presets || []).map(normalizeExportPreset);
  renderExportPresets(selectedID);
}

async function saveExportPreset() {
  const name = els.exportPresetName.value.trim();
  if (!name) {
    showToast(t('presetNameRequired'), 'warning');
    els.exportPresetName.focus();
    return;
  }
  const selectedID = els.exportPresetSelect.value;
  const id = selectedID || globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}`;
  const preset = { ...readExportDraft(), id, name };
  const existing = state.exportSettings.presets.findIndex(item => item.id === id);
  if (existing >= 0) state.exportSettings.presets.splice(existing, 1, preset);
  else state.exportSettings.presets.push(preset);
  await persistExportSettings(id);
  showToast(t('presetSaved'), 'success');
}

async function deleteExportPreset() {
  const id = els.exportPresetSelect.value;
  if (!id) return;
  state.exportSettings.presets = state.exportSettings.presets.filter(item => item.id !== id);
  await persistExportSettings();
  els.exportPresetName.value = '';
  showToast(t('presetDeleted'), 'success');
}

async function selectPandocExecutable() {
  try {
    const status = await window.quilliteMarkdown.selectPandoc();
    if (status) state.pandocStatus = status;
    state.exportSettings.pandocPath = state.pandocStatus.path || state.exportSettings.pandocPath;
    syncExportCenterUI();
  } catch (error) {
    showToast(error?.message || t('pandocRequired'), 'error');
  }
}

function exportPageBoxContent(template) {
  if (!template) return '';
  const expanded = String(template)
    .replaceAll('{title}', state.currentFile?.name?.replace(/\.[^.]+$/, '') || t('untitledDocument'))
    .replaceAll('{date}', new Intl.DateTimeFormat(state.language === 'en' ? 'en' : 'zh-CN').format(new Date()));
  return expanded.split('{page}')
    .map((part, index) => `${index ? ' counter(page) ' : ''}${JSON.stringify(part)}`)
    .join('');
}

function createPrintPageStyle(options = {}) {
  const header = exportPageBoxContent(options.header);
  const footer = exportPageBoxContent(options.footer);
  if (!header && !footer) return null;
  const style = document.createElement('style');
  style.dataset.exportPageStyle = 'true';
  const typography = 'width:100%;color:#555;font:9pt/1.35 system-ui,sans-serif;';
  style.textContent = `@page { margin: 22mm 16mm;
    ${header ? `@top-center { content: ${header}; ${typography} padding-bottom:2.5mm;border-bottom:.2mm solid #d8d8d8;vertical-align:bottom; }` : ''}
    ${footer ? `@bottom-center { content: ${footer}; ${typography} padding-top:2.5mm;border-top:.2mm solid #d8d8d8;vertical-align:top; }` : ''}
  }`;
  document.head.append(style);
  return style;
}

async function exportDocumentImage(format, options) {
  const { toCanvas } = await import('html-to-image');
  const requestedLongImage = options.imageLayout === 'long';
  const host = document.createElement('div');
  host.className = 'export-image-host';
  host.setAttribute('aria-hidden', 'true');
  const viewport = document.createElement('div');
  viewport.className = 'export-image-viewport';
  const stage = document.createElement('article');
  stage.className = 'markdown-body export-image-stage';
  stage.innerHTML = await renderedHTMLForExport(options.header, options.footer);
  stage.style.width = requestedLongImage ? '1280px' : '840px';
  stage.style.padding = requestedLongImage ? '72px 104px' : '64px 72px';
  stage.style.fontSize = '16px';
  const backgroundColor = state.colorMode === 'dark' ? '#171b18' : '#ffffff';
  stage.style.background = backgroundColor;
  stage.style.color = state.colorMode === 'dark' ? '#e8eee9' : '#1d2420';
  viewport.style.background = backgroundColor;
  const pageTopMask = document.createElement('span');
  pageTopMask.className = 'export-image-page-mask top hidden';
  const pageBottomMask = document.createElement('span');
  pageBottomMask.className = 'export-image-page-mask bottom hidden';
  viewport.append(stage);
  viewport.append(pageTopMask, pageBottomMask);
  host.append(viewport);
  document.body.append(host);
  try {
    await waitForPreviewImages(stage);
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const scale = options.imageScale;
    const width = Math.ceil(stage.scrollWidth);
    const height = Math.ceil(stage.scrollHeight);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const pageMargin = 56;
    const sliceHeight = Math.max(1, Math.floor(8192 / scale));
    const a4PageRanges = createExportImagePageRanges(stage, Math.max(320, Math.floor(width * Math.SQRT2) - pageMargin * 2));
    const autoPaginatedLongImage = requestedLongImage && a4PageRanges.length > 3;
    const splitIntoPages = !requestedLongImage || autoPaginatedLongImage;
    const ranges = splitIntoPages
      ? a4PageRanges
      : Array.from({ length: Math.ceil(height / sliceHeight) }, (_, index) => ({
        start: index * sliceHeight,
        end: Math.min(height, (index + 1) * sliceHeight)
      }));
    const largestPageHeight = Math.max(...ranges.map(range => range.end - range.start + (splitIntoPages ? pageMargin * 2 : 0)));
    const totalRenderedPixels = ranges.reduce((total, range) => total + scaledWidth * (range.end - range.start + (splitIntoPages ? pageMargin * 2 : 0)) * scale, 0);
    if (scaledWidth > 8192 || ranges.length > 64 || largestPageHeight * scale > 8192
      || (!splitIntoPages && (scaledHeight > 30000 || scaledWidth * scaledHeight > 64000000))
      || (splitIntoPages && totalRenderedPixels > 120000000)) throw new Error('EXPORT_IMAGE_TOO_TALL');
    const slices = [];
    const hasExpectedContent = stage.textContent.trim() || stage.querySelector('img, svg, canvas');
    let hasVisibleContent = false;
    viewport.style.width = `${width}px`;
    pageTopMask.classList.toggle('hidden', !splitIntoPages);
    pageBottomMask.classList.toggle('hidden', !splitIntoPages);
    pageTopMask.style.height = `${pageMargin}px`;
    pageBottomMask.style.height = `${pageMargin}px`;
    for (let index = 0; index < ranges.length; index += 1) {
      const range = ranges[index];
      const currentHeight = range.end - range.start + (splitIntoPages ? pageMargin * 2 : 0);
      els.exportCenterStatus.textContent = t(splitIntoPages ? 'exportingImagePages' : 'exportingImageSlices', { current: index + 1, total: ranges.length });
      viewport.style.height = `${currentHeight}px`;
      stage.style.top = `${(splitIntoPages ? pageMargin : 0) - range.start}px`;
      await new Promise(resolve => requestAnimationFrame(resolve));
      const canvas = await toCanvas(viewport, {
        width,
        height: currentHeight,
        pixelRatio: scale,
        backgroundColor,
        cacheBust: true,
        skipAutoScale: true
      });
      hasVisibleContent ||= imageCanvasHasVisibleContent(canvas, backgroundColor);
      slices.push(canvas.toDataURL('image/png'));
    }
    if (hasExpectedContent && !hasVisibleContent) throw new Error('EXPORT_IMAGE_BLANK');
    if (splitIntoPages) {
      const paths = await window.quilliteMarkdown.saveExportImagePages(state.currentFile.path, state.currentFile.name, format, slices);
      return paths?.length ? { paths, autoPaginatedLongImage } : null;
    }
    return window.quilliteMarkdown.saveExportImageSlices(state.currentFile.path, state.currentFile.name, format, slices);
  } finally {
    host.remove();
  }
}

function createExportImagePageRanges(stage, maximumContentHeight) {
  const height = Math.ceil(stage.scrollHeight);
  const breakpoints = [...stage.children]
    .map(element => Math.floor(element.offsetTop))
    .filter((offset, index, values) => offset > 0 && offset < height && offset !== values[index - 1]);
  const ranges = [];
  let start = 0;
  while (start < height) {
    const limit = Math.min(height, start + maximumContentHeight);
    let end = limit;
    if (limit < height) {
      const minimumUsefulBreak = start + Math.floor(maximumContentHeight * .55);
      const blockBreak = breakpoints.filter(offset => offset >= minimumUsefulBreak && offset <= limit).at(-1);
      if (Number.isFinite(blockBreak)) end = blockBreak;
    }
    if (end <= start) end = Math.min(height, start + maximumContentHeight);
    ranges.push({ start, end });
    start = end;
    if (ranges.length > 64) throw new Error('EXPORT_IMAGE_TOO_TALL');
  }
  return ranges;
}

function imageCanvasHasVisibleContent(canvas, backgroundColor) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(backgroundColor);
  if (!match || !canvas.width || !canvas.height) return false;
  const background = match.slice(1).map(component => Number.parseInt(component, 16));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  const sampleHeight = Math.min(canvas.height, 2048);
  const pixels = context.getImageData(0, 0, canvas.width, sampleHeight).data;
  const step = Math.max(1, Math.floor(canvas.width / 1200));
  let differentPixels = 0;
  for (let y = 0; y < sampleHeight; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const offset = (y * canvas.width + x) * 4;
      const difference = Math.abs(pixels[offset] - background[0])
        + Math.abs(pixels[offset + 1] - background[1])
        + Math.abs(pixels[offset + 2] - background[2]);
      if (pixels[offset + 3] > 8 && difference > 24 && ++differentPixels >= 4) return true;
    }
  }
  return false;
}

function setExportInProgress(inProgress) {
  state.exportInProgress = Boolean(inProgress);
  els.confirmExportCenter.disabled = state.exportInProgress;
  els.confirmExportCenter.setAttribute('aria-busy', String(state.exportInProgress));
}

async function performExportCenter() {
  if (state.exportInProgress) return;
  setExportInProgress(true);
  let options;
  let completed = false;
  els.exportCenterStatus.textContent = t('exporting');
  try {
    options = readExportDraft();
    state.exportDraft = options;
    if (PANDOC_EXPORT_FORMATS.has(options.format) && !state.pandocStatus.available) {
      await refreshPandocStatus();
      if (!state.pandocStatus.available) {
        showToast(t('pandocRequired'), 'warning');
        return;
      }
    }
    let output;
    if (options.format === 'docx') output = await exportWordDocument(options);
    else if (options.format === 'html') output = await exportHTMLDocument(options);
    else if (options.format === 'html-plain') output = await exportPlainHTMLDocument(options);
    else if (options.format === 'pdf') output = await exportPDFWithBookmarks(options);
    else if (['png', 'jpeg'].includes(options.format)) output = await exportDocumentImage(options.format, options);
    else output = await window.quilliteMarkdown.exportWithPandoc({
      sourcePath: state.currentFile.path,
      title: state.currentFile.name,
      content: state.currentFile.content,
      format: options.format,
      pandocPath: state.pandocStatus.path,
      header: options.header,
      footer: options.footer,
      extraArguments: options.extraArguments,
      customWriter: options.customWriter,
      customExtension: options.customExtension
    });
    if (output === false) return;
    if (output?.autoPaginatedLongImage) showToast(t('longImageAutoPaged', { count: output.paths.length }), 'info', 7200);
    else if (output && !['docx', 'html', 'html-plain', 'pdf'].includes(options.format)) showToast(t('exportSucceeded'), 'success');
    completed = true;
  } catch (error) {
    if (String(error?.message || error).includes('EXPORT_IMAGE_TOO_TALL')) showToast(t('imageExportTooTall'), 'warning');
    else if (String(error?.message || error).includes('EXPORT_IMAGE_BLANK')) showToast(t('imageExportBlank'), 'warning');
    else if (isExportFileInUseError(error)) showToast(t('exportFileInUse'), 'warning');
    else {
      reportSilentError(error, `document.export-${options?.format || 'unknown'}`);
      showToast(error?.message || t('exportFailed'), 'error');
    }
  } finally {
    setExportInProgress(false);
    els.exportCenterStatus.textContent = '';
    if (completed) closeExportCenter(false);
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

async function printCurrentDocument(options = {}) {
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
  const pageStyle = createPrintPageStyle(options);
  try {
    await window.quilliteMarkdown.print();
  } finally {
    pageStyle?.remove();
  }
}

function closeDocumentActionsMenu() {
  els.documentActionsMenu.classList.add('hidden');
  els.documentActionsMoreButton.setAttribute('aria-expanded', 'false');
}

function runDocumentHeaderAction(action) {
  closeDocumentActionsMenu();
  if (action === 'save-as' && state.currentFile?.path) saveLibraryDocumentAs(state.currentFile.path);
  if (action === 'export-center') openExportCenter();
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
    if (href.startsWith('#') && link.dataset.target) {
      event.preventDefault();
      scrollPreviewContainerToHeading(container, link.dataset.target);
      return;
    }
    if (/^https?:\/\//i.test(href)) {
      event.preventDefault();
      window.quilliteMarkdown.openExternal(href);
    }
  }));
}

async function openFile() {
  if (!maybeDiscardChanges()) return;
  const request = beginDocumentOpen();
  try {
    const doc = await window.quilliteMarkdown.openFile();
    if (doc && canApplyDocumentOpen(request)) {
      setSidebarMode('recent');
      displayDocument(doc);
    }
  } catch (error) {
    reportSilentError(error, 'document.open');
    showToast(t('openFailed'), 'error');
  }
}

async function openFolder() {
  if (!maybeDiscardChanges()) return;
  const request = beginDocumentOpen();
  const folder = await window.quilliteMarkdown.openFolder();
  if (!folder || !canApplyDocumentOpen(request)) return;
  state.root = folder.root;
  state.explorerFiles = folder.files;
  setSidebarMode('explorer');
  if (folder.files[0]) {
    try {
      const doc = await window.quilliteMarkdown.readFile(folder.files[0].path);
      if (canApplyDocumentOpen(request)) displayDocument(doc);
    } catch {
      showToast(t('folderOpenFailed'), 'error');
    }
  }
}

async function openReferenceDocument(kind) {
  if (!maybeDiscardChanges()) return;
  const request = beginDocumentOpen();
  try {
    const doc = await window.quilliteMarkdown.openReferenceDocument(kind);
    if (doc && canApplyDocumentOpen(request)) displayDocument(doc, { addToLibrary: false });
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
  const tocVisible = !isCompactTocLayout() && paneParticipates(els.tocPanel, state.editing || els.tocPanel.classList.contains('hidden') || els.tocPanel.classList.contains('collapsed'));
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
  els.tocResizer.classList.toggle('hidden', state.editing || els.tocPanel.classList.contains('hidden') || els.tocPanel.classList.contains('collapsed'));
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
  if (compactTocMediaQuery?.addEventListener) compactTocMediaQuery.addEventListener('change', handleCompactTocLayoutChange);
  else compactTocMediaQuery?.addListener?.(handleCompactTocLayoutChange);
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
  // Preview width belongs to the preview pane, regardless of which side it is on.
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
        const deltaPercent = ((moveEvent.clientX - startX) / total) * 100 * editorResizeDirection();
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
      const change = (event.key === 'ArrowRight' ? 2 : -2) * editorResizeDirection();
      setEditorPreviewWidth(state.editorPreviewWidth + change);
      localStorage.setItem('editorPreviewWidth', String(state.editorPreviewWidth));
    });
  }
}

function setEditorPreviewWidth(percent) {
  // 最小保留 12% 预览宽度，同时给编辑器保留最小可用空间。
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

function aiErrorMessage(error) {
  return String(error?.message || error || '').replace(/^Error:\s*/i, '').trim();
}

const aiProviderConfigs = Object.freeze({
  deepseek: { nameKey: 'aiProviderDeepSeek', descriptionKey: 'aiProviderDescription', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  zhipu: { nameKey: 'aiProviderZhipu', descriptionKey: 'aiProviderDescription', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash' },
  qwen: { nameKey: 'aiProviderQwen', descriptionKey: 'aiProviderDescription', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  openai: { nameKey: 'aiProviderOpenAI', descriptionKey: 'aiProviderDescription', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
  kimi: { nameKey: 'aiProviderKimi', descriptionKey: 'aiProviderDescription', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3' },
  bailian: { nameKey: 'aiProviderBailian', descriptionKey: 'aiProviderAggregatorDescription', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'deepseek-v4-flash', configurableBaseURL: true, baseURLHintKey: 'aiBailianBaseURLHint' },
  siliconflow: { nameKey: 'aiProviderSiliconFlow', descriptionKey: 'aiProviderAggregatorDescription', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V4-Flash' },
  openrouter: { nameKey: 'aiProviderOpenRouter', descriptionKey: 'aiProviderAggregatorDescription', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
  custom: { nameKey: 'aiProviderCustom', descriptionKey: 'aiProviderCustomDescription', baseUrl: 'http://localhost:11434/v1', model: '', configurableBaseURL: true, baseURLHintKey: 'aiCustomBaseURLHint', manualModel: true }
});

function normalizeAIProvider(provider) {
  return Object.hasOwn(aiProviderConfigs, provider) ? provider : 'deepseek';
}

function selectedAIModel() {
  const provider = normalizeAIProvider(els.aiProvider.value);
  return (aiProviderConfigs[provider].manualModel ? els.aiCustomModel.value : els.aiModel.value) || aiProviderConfigs[provider].model;
}

function displayAIModel(model) {
  return String(model || '').trim() || t('aiModelNotSelected');
}

function activeAIModelControl() {
  return aiProviderConfigs[normalizeAIProvider(els.aiProvider.value)].manualModel ? els.aiCustomModel : els.aiModel;
}

function activeAIModelState() {
  return aiProviderConfigs[normalizeAIProvider(els.aiProvider.value)].manualModel ? els.aiCustomModelState : els.aiModelState;
}

function clearAIModelAutoLoad() {
  if (!aiModelAutoLoadTimer) return;
  clearTimeout(aiModelAutoLoadTimer);
  aiModelAutoLoadTimer = 0;
}

function hasSavedAIKey(provider = normalizeAIProvider(els.aiProvider.value)) {
  return currentAISettings?.provider === provider && Boolean(currentAISettings?.hasApiKey);
}

function aiModelDiscoveryInput() {
  return {
    provider: normalizeAIProvider(els.aiProvider.value),
    baseUrl: els.aiBaseURL.value.trim(),
    apiKey: els.aiAPIKey.value.trim()
  };
}

function canDiscoverAIModels(provider = normalizeAIProvider(els.aiProvider.value)) {
  const config = aiProviderConfigs[provider];
  const hasKey = Boolean(els.aiAPIKey.value.trim()) || hasSavedAIKey(provider);
  return hasKey && (!config.configurableBaseURL || Boolean(els.aiBaseURL.value.trim()));
}

function scheduleAIModelDiscovery() {
  clearAIModelAutoLoad();
  ++aiModelLoadRequest;
  aiModelsLoading = false;
  activeAIModelControl().disabled = false;
  renderAISettingsKeyUI();
  if (!canDiscoverAIModels()) {
    activeAIModelState().textContent = t('aiModelKeyRequired');
    return;
  }
  activeAIModelState().textContent = t('aiModelLoading');
  aiModelAutoLoadTimer = setTimeout(() => {
    aiModelAutoLoadTimer = 0;
    void loadAIModels();
  }, 700);
}

function setAIModelOptions(provider, models = [], selectedModel = '') {
  provider = normalizeAIProvider(provider);
  const recommendedModel = aiProviderConfigs[provider].model;
  selectedModel = String(selectedModel || recommendedModel).trim() || recommendedModel;
  const availableModels = aiModelOptions(provider, models, selectedModel, recommendedModel);
  if (aiProviderConfigs[provider].manualModel) {
    els.aiCustomModelOptions.replaceChildren(...availableModels.map(model => {
      const option = document.createElement('option');
      option.value = model;
      return option;
    }));
    els.aiCustomModel.value = selectedModel;
    els.aiProviderModel.textContent = displayAIModel(selectedModel);
    return;
  }
  els.aiModel.replaceChildren(...availableModels.map(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    return option;
  }));
  els.aiModel.value = availableModels.includes(selectedModel) ? selectedModel : availableModels[0];
  els.aiProviderModel.textContent = displayAIModel(els.aiModel.value);
}

function renderAIProvider(provider, model = '') {
  provider = normalizeAIProvider(provider);
  const config = aiProviderConfigs[provider];
  els.aiProvider.value = provider;
  els.aiProviderName.dataset.i18n = config.nameKey;
  els.aiProviderName.textContent = t(config.nameKey);
  els.aiProviderDescription.dataset.i18n = config.descriptionKey;
  els.aiProviderDescription.textContent = t(config.descriptionKey);
  els.aiBaseURLField.classList.toggle('hidden', !config.configurableBaseURL);
  els.aiModelSelectField.classList.toggle('hidden', Boolean(config.manualModel));
  els.aiCustomModelField.classList.toggle('hidden', !config.manualModel);
  els.aiBaseURL.value = currentAISettings?.provider === provider ? (currentAISettings.baseUrl || config.baseUrl) : config.baseUrl;
  els.aiBaseURLHint.dataset.i18n = config.baseURLHintKey || 'aiCustomBaseURLHint';
  els.aiBaseURLHint.textContent = t(els.aiBaseURLHint.dataset.i18n);
  const providerModels = aiModelsByProvider.get(provider) || [];
  let selectedModel = model || config.model;
  // Older development builds inserted an OpenAI model into every custom
  // endpoint. It is not valid for an Alibaba Cloud workspace and must not be
  // presented as if the service supplied it.
  if (provider === 'custom' && selectedModel === 'gpt-4o-mini' && /\.aliyuncs\.com(?::\d+)?(?:\/|$)/i.test(els.aiBaseURL.value) && !providerModels?.includes(selectedModel)) selectedModel = '';
  setAIModelOptions(provider, providerModels, selectedModel);
}

function renderAISettingsKeyUI() {
  const hasKey = hasSavedAIKey();
  const isDefault = Boolean(currentAISettings?.isDefault) && selectedAIModel() === currentAISettings?.model;
  const showInput = !hasKey || aiSettingsEditingKey;
  els.aiKeyOnboarding.classList.toggle('hidden', hasKey);
  els.aiKeySavedCard.classList.toggle('hidden', !hasKey || aiSettingsEditingKey);
  els.aiAPIKeyField.classList.toggle('hidden', !showInput);
  els.aiMaskedAPIKey.textContent = currentAISettings?.maskedApiKey || '••••••••';
  els.aiAPIKeyState.textContent = aiSettingsEditingKey ? t('aiReplacingKeyHint') : (hasKey ? t('aiAPIKeySaved') : t('aiAPIKeyNotSaved'));
  const saveButton = $('#saveAISettings');
  const configurableProvider = Boolean(aiProviderConfigs[normalizeAIProvider(els.aiProvider.value)].configurableBaseURL);
  saveButton.classList.toggle('hidden', hasKey && !aiSettingsEditingKey && !configurableProvider);
  const saveLabel = hasKey && aiSettingsEditingKey ? 'aiSaveNewKey' : 'aiSaveAndEnable';
  saveButton.dataset.i18n = saveLabel;
  saveButton.textContent = t(saveLabel);
  els.setDefaultAIProvider.disabled = !hasKey || !selectedAIModel() || isDefault;
  els.setDefaultAIProvider.classList.toggle('active', isDefault);
  const defaultLabel = isDefault ? 'aiDefaultModel' : 'aiSetDefaultModel';
  els.setDefaultAIProvider.dataset.i18n = defaultLabel;
  els.setDefaultAIProvider.textContent = t(defaultLabel);
  const canDiscover = canDiscoverAIModels();
  els.refreshAIModels.disabled = !canDiscover || aiModelsLoading;
  els.refreshAICustomModels.disabled = !canDiscover || aiModelsLoading;
}

function syncAISelectedModel() {
  els.aiProviderModel.textContent = displayAIModel(selectedAIModel());
  renderAISettingsKeyUI();
}

async function loadAIModels() {
  clearAIModelAutoLoad();
  const provider = normalizeAIProvider(els.aiProvider.value);
  const selectedModel = selectedAIModel();
  const discoveryInput = aiModelDiscoveryInput();
  const requestID = ++aiModelLoadRequest;
  aiModelsLoading = false;
  activeAIModelControl().disabled = false;
  if (!canDiscoverAIModels(provider)) {
    aiModelsByProvider.delete(provider);
    setAIModelOptions(provider, [], selectedModel);
    activeAIModelState().textContent = t('aiModelKeyRequired');
    renderAISettingsKeyUI();
    return;
  }
  aiModelsLoading = true;
  activeAIModelControl().disabled = true;
  els.refreshAIModels.disabled = true;
  els.refreshAICustomModels.disabled = true;
  activeAIModelState().textContent = t('aiModelLoading');
  try {
    const models = await window.quilliteMarkdown.discoverAIModels(discoveryInput);
    if (requestID !== aiModelLoadRequest || provider !== normalizeAIProvider(els.aiProvider.value)) return;
    const available = [...new Set((Array.isArray(models) ? models : []).filter(model => typeof model === 'string' && model.trim()).map(model => model.trim()))];
    if (!available.length) throw new Error(t('aiModelEmpty'));
    aiModelsByProvider.set(provider, available);
    setAIModelOptions(provider, available, selectedModel);
    activeAIModelState().textContent = t('aiModelLoaded', { count: available.length });
  } catch (error) {
    if (requestID !== aiModelLoadRequest || provider !== normalizeAIProvider(els.aiProvider.value)) return;
    setAIModelOptions(provider, aiModelsByProvider.get(provider) || [], selectedModel);
    activeAIModelState().textContent = `${t('aiModelLoadFailed')}: ${aiErrorMessage(error)}`;
  } finally {
    if (requestID === aiModelLoadRequest) {
      aiModelsLoading = false;
      activeAIModelControl().disabled = false;
      renderAISettingsKeyUI();
    }
  }
}

async function openAISettings(options = {}) {
  clearAIModelAutoLoad();
  const settingsRequest = ++aiSettingsLoadRequest;
  ++aiModelLoadRequest;
  aiModelsLoading = false;
  els.aiSettingsStatus.textContent = '';
  els.aiAPIKey.value = '';
  aiSettingsEditingKey = false;
  try {
    const settings = await window.quilliteMarkdown.getAISettings();
    if (settingsRequest !== aiSettingsLoadRequest) return;
    currentAISettings = settings;
  } catch (error) {
    if (settingsRequest !== aiSettingsLoadRequest) return;
    currentAISettings = { provider: 'deepseek', ...aiProviderConfigs.deepseek, hasApiKey: false, maskedApiKey: '' };
    els.aiSettingsStatus.textContent = `${t('aiSettingsSaveFailed')}: ${aiErrorMessage(error)}`;
  }
  renderAIProvider(currentAISettings?.provider, currentAISettings?.model);
  renderAISettingsKeyUI();
  if (options.required && !currentAISettings?.hasApiKey) els.aiSettingsStatus.textContent = t('aiKeyRequiredGuide');
  els.aiSettingsDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  await loadAIModels();
  if (settingsRequest !== aiSettingsLoadRequest) return;
  requestAnimationFrame(() => (currentAISettings?.hasApiKey ? els.editAIAPIKey : els.aiAPIKey).focus());
}

function closeAISettings() {
  clearAIModelAutoLoad();
  ++aiSettingsLoadRequest;
  ++aiModelLoadRequest;
  aiModelsLoading = false;
  if (els.aiSettingsDialog.classList.contains('hidden')) return;
  els.aiSettingsDialog.classList.add('hidden');
  pendingAIRewriteSelection = null;
  pendingAIRewriteAction = '';
  pendingAIDocumentReview = false;
  if (resumeAIDocumentReviewAfterSettings) {
    resumeAIDocumentReviewAfterSettings = false;
    els.aiReviewDialog.classList.remove('hidden');
    document.body.classList.add('dialog-open');
    return;
  }
  if (els.aiRewriteDialog.classList.contains('hidden')) document.body.classList.remove('dialog-open');
  $('#moreButton').focus();
}

function aiSettingsInput(clearApiKey = false) {
  return {
    provider: normalizeAIProvider(els.aiProvider.value),
    baseUrl: els.aiBaseURL.value,
    model: selectedAIModel(),
    apiKey: els.aiAPIKey.value.trim(),
    clearApiKey
  };
}

async function changeAIProvider() {
  clearAIModelAutoLoad();
  const settingsRequest = ++aiSettingsLoadRequest;
  ++aiModelLoadRequest;
  aiModelsLoading = false;
  activeAIModelControl().disabled = false;
  currentAISettings = null;
  const provider = normalizeAIProvider(els.aiProvider.value);
  renderAIProvider(provider);
  renderAISettingsKeyUI();
  activeAIModelState().textContent = t('aiModelKeyRequired');
  els.aiSettingsStatus.textContent = '';
  els.aiAPIKey.value = '';
  aiSettingsEditingKey = false;
  try {
    const settings = await window.quilliteMarkdown.getAIProviderSettings(provider);
    if (settingsRequest !== aiSettingsLoadRequest) return;
    currentAISettings = settings;
  } catch (error) {
    if (settingsRequest !== aiSettingsLoadRequest) return;
    currentAISettings = { provider, ...aiProviderConfigs[provider], hasApiKey: false, maskedApiKey: '' };
    els.aiSettingsStatus.textContent = `${t('aiSettingsSaveFailed')}: ${aiErrorMessage(error)}`;
  }
  renderAIProvider(provider, currentAISettings?.model);
  renderAISettingsKeyUI();
  await loadAIModels();
  if (settingsRequest !== aiSettingsLoadRequest) return;
  requestAnimationFrame(() => (currentAISettings?.hasApiKey ? els.editAIAPIKey : els.aiAPIKey).focus());
}

async function setDefaultAIProvider() {
  const model = selectedAIModel();
  if (!currentAISettings?.hasApiKey || !requireAIModelInput() || (currentAISettings?.isDefault && currentAISettings?.model === model)) return;
  els.setDefaultAIProvider.disabled = true;
  els.aiSettingsStatus.textContent = '';
  try {
    if (aiProviderConfigs[currentAISettings.provider].configurableBaseURL) {
      currentAISettings = await window.quilliteMarkdown.setAISettings(aiSettingsInput());
    }
    currentAISettings = await window.quilliteMarkdown.setDefaultAIProvider(currentAISettings.provider, model);
    els.aiProviderModel.textContent = displayAIModel(currentAISettings.model);
    renderAISettingsKeyUI();
    const providerName = t(aiProviderConfigs[currentAISettings.provider].nameKey);
    const message = t('aiDefaultModelChanged', { provider: providerName });
    els.aiSettingsStatus.textContent = message;
    showToast(message, 'success');
  } catch (error) {
    els.aiSettingsStatus.textContent = `${t('aiDefaultModelChangeFailed')}: ${aiErrorMessage(error)}`;
    renderAISettingsKeyUI();
  }
}

function requireAIKeyInput() {
  if (els.aiAPIKey.value.trim()) return true;
  els.aiSettingsStatus.textContent = t('aiKeyRequired');
  els.aiAPIKey.focus();
  return false;
}

function requireAIModelInput() {
  if (selectedAIModel()) return true;
  els.aiSettingsStatus.textContent = t('aiModelRequired');
  activeAIModelControl().focus();
  return false;
}

async function saveAISettings(event) {
  event?.preventDefault();
  els.aiSettingsStatus.textContent = '';
  if ((!currentAISettings?.hasApiKey || aiSettingsEditingKey) && !requireAIKeyInput()) return;
  if (!requireAIModelInput()) return;
  const button = $('#saveAISettings');
  button.disabled = true;
  try {
    currentAISettings = await window.quilliteMarkdown.setAISettings(aiSettingsInput());
    els.aiAPIKey.value = '';
    aiSettingsEditingKey = false;
    renderAIProvider(currentAISettings.provider, currentAISettings.model);
    renderAISettingsKeyUI();
    await loadAIModels();
    els.aiSettingsStatus.textContent = t('aiSettingsSaved');
    showToast(t('aiSettingsSaved'), 'success');
    if (resumeAIDocumentReviewAfterSettings) {
      resumeAIDocumentReviewAfterSettings = false;
      els.aiSettingsDialog.classList.add('hidden');
      els.aiReviewDialog.classList.remove('hidden');
      return;
    }
    if (pendingAIDocumentReview && currentAISettings?.hasApiKey) {
      pendingAIDocumentReview = false;
      els.aiSettingsDialog.classList.add('hidden');
      await openAIDocumentReview();
      return;
    }
    if (pendingAIRewriteSelection && currentAISettings?.hasApiKey) {
      const selection = { ...pendingAIRewriteSelection };
      const action = pendingAIRewriteAction || (selection.markdown ? 'polish' : 'custom');
      pendingAIRewriteSelection = null;
      pendingAIRewriteAction = '';
      els.aiSettingsDialog.classList.add('hidden');
      await openAIRewrite(selection, action);
    }
  } catch (error) {
    els.aiSettingsStatus.textContent = `${t('aiSettingsSaveFailed')}: ${aiErrorMessage(error)}`;
  } finally {
    button.disabled = false;
  }
}

async function testAIConnection() {
  if ((!currentAISettings?.hasApiKey || aiSettingsEditingKey) && !requireAIKeyInput()) return;
  if (!requireAIModelInput()) return;
  els.aiSettingsStatus.textContent = t('aiTestingConnection');
  const button = $('#testAIConnection');
  button.disabled = true;
  try {
    const provider = normalizeAIProvider(els.aiProvider.value);
    const model = selectedAIModel();
    if (!currentAISettings?.hasApiKey || aiSettingsEditingKey || aiProviderConfigs[provider].configurableBaseURL) {
      currentAISettings = await window.quilliteMarkdown.setAISettings(aiSettingsInput());
      els.aiAPIKey.value = '';
      aiSettingsEditingKey = false;
      renderAIProvider(currentAISettings.provider, currentAISettings.model);
      renderAISettingsKeyUI();
      await loadAIModels();
    }
    await window.quilliteMarkdown.testAIProviderConnection(provider, model);
    renderAISettingsKeyUI();
    els.aiSettingsStatus.textContent = t('aiConnectionSuccess');
  } catch (error) {
    els.aiSettingsStatus.textContent = `${t('aiConnectionFailed')}: ${aiErrorMessage(error)}`;
  } finally {
    button.disabled = false;
  }
}

function editAIAPIKey() {
  aiSettingsEditingKey = true;
  els.aiSettingsStatus.textContent = '';
  renderAISettingsKeyUI();
  requestAnimationFrame(() => els.aiAPIKey.focus());
}

async function deleteAIAPIKey() {
  if (!window.confirm(t('aiDeleteKeyConfirm'))) return;
  els.editAIAPIKey.disabled = true;
  els.deleteAIAPIKey.disabled = true;
  try {
    currentAISettings = await window.quilliteMarkdown.setAISettings(aiSettingsInput(true));
    aiSettingsEditingKey = false;
    els.aiAPIKey.value = '';
    renderAISettingsKeyUI();
    await loadAIModels();
    els.aiSettingsStatus.textContent = t('aiKeyDeleted');
    showToast(t('aiKeyDeleted'), 'success');
    requestAnimationFrame(() => els.aiAPIKey.focus());
  } catch (error) {
    els.aiSettingsStatus.textContent = `${t('aiKeyDeleteFailed')}: ${aiErrorMessage(error)}`;
  } finally {
    els.editAIAPIKey.disabled = false;
    els.deleteAIAPIKey.disabled = false;
  }
}

function updateAIRewriteControls() {
  const insertMode = aiRewriteSelection?.mode === 'insert';
  if (insertMode) els.aiRewriteAction.value = 'custom';
  const action = els.aiRewriteAction.value;
  els.aiRewriteFields.classList.toggle('hidden', insertMode);
  els.aiRewriteControls.classList.toggle('is-insert-mode', insertMode);
  els.aiTargetLanguageField.classList.toggle('hidden', action !== 'translate');
  els.aiInstructionField.classList.toggle('hidden', action !== 'custom');
}

function currentAIEditContext() {
  if (!codeEditor || !state.editing) return { from: null, to: null, markdown: '', mode: 'insert' };
  const selection = codeEditor.state.selection.main;
  if (selection.empty) {
    const cursor = Number.isInteger(selection.head) ? selection.head : null;
    return { from: cursor, to: cursor, markdown: '', mode: 'insert' };
  }
  return {
    from: selection.from,
    to: selection.to,
    markdown: codeEditor.state.doc.sliceString(selection.from, selection.to),
    mode: 'replace'
  };
}

function stopAIRewriteProgress() {
  if (aiRewriteProgressTimer) window.clearInterval(aiRewriteProgressTimer);
  aiRewriteProgressTimer = 0;
  aiRewriteStartedAt = 0;
  els.aiRewriteProgress.classList.add('hidden');
  els.aiRewriteProgress.setAttribute('aria-hidden', 'true');
}

function updateAIRewriteProgress() {
  if (!aiRewriteStartedAt) return;
  const elapsed = Math.max(0, (Date.now() - aiRewriteStartedAt) / 1000);
  let phaseKey = 'aiRewriteConnecting';
  if (elapsed >= 3) phaseKey = 'aiRewriteGenerating';
  if (elapsed >= 18) phaseKey = 'aiRewriteRefining';
  const percent = Math.min(92, Math.round(8 + 84 * (1 - Math.exp(-elapsed / 24))));
  const provider = normalizeAIProvider(currentAISettings?.provider);
  const providerName = t(aiProviderConfigs[provider].nameKey);
  const model = currentAISettings?.model || aiProviderConfigs[provider].model;
  els.aiRewriteProgressPhase.textContent = t(phaseKey);
  els.aiRewriteProgressMeta.textContent = t('aiRewriteProgressMeta', { provider: providerName, model, seconds: Math.floor(elapsed) });
  els.aiRewriteProgressBar.style.width = `${percent}%`;
  els.aiRewriteProgressPercent.textContent = `${percent}%`;
}

function startAIRewriteProgress() {
  stopAIRewriteProgress();
  aiRewriteStartedAt = Date.now();
  els.aiRewriteProgress.classList.remove('hidden');
  els.aiRewriteProgress.setAttribute('aria-hidden', 'false');
  updateAIRewriteProgress();
  aiRewriteProgressTimer = window.setInterval(updateAIRewriteProgress, 500);
}

async function openAIEditor() {
  const context = currentAIEditContext();
  await openAIRewrite(context, context.markdown ? 'polish' : 'custom');
}

async function openAIRewrite(selection = editorClipboardSelection, preferredAction = '') {
  if (!selection) {
    showToast(t('aiNeedSelection'), 'warning');
    return;
  }
  const editContext = {
    documentSession: selection.documentSession ?? state.documentSession,
    from: Number.isInteger(selection.from) ? selection.from : null,
    to: Number.isInteger(selection.to) ? selection.to : null,
    markdown: selection.markdown || '',
    mode: selection.markdown ? 'replace' : 'insert'
  };
  closeEditorClipboardMenu();
  try {
    currentAISettings = await window.quilliteMarkdown.getAISettings();
  } catch {
    currentAISettings = { provider: 'deepseek', hasApiKey: false };
  }
  if (editContext.documentSession !== state.documentSession || !state.editing) return;
  if (!currentAISettings?.hasApiKey) {
    pendingAIRewriteSelection = { ...editContext };
    pendingAIRewriteAction = preferredAction || (editContext.markdown ? 'polish' : 'custom');
    await openAISettings({ required: true });
    return;
  }
  aiRewriteSelection = editContext;
  aiRewriteRequest += 1;
  stopAIRewriteProgress();
  const insertMode = editContext.mode === 'insert';
  els.aiRewriteAction.value = insertMode ? 'custom' : (preferredAction || 'polish');
  els.aiInstruction.value = '';
  els.aiOriginalText.value = aiRewriteSelection.markdown;
  els.aiOriginalTextField.classList.toggle('hidden', insertMode);
  els.aiCompareGrid.classList.toggle('is-insert-mode', insertMode);
  els.aiResultText.value = '';
  els.aiRewriteStatus.textContent = '';
  els.aiCloudConsent.checked = true;
  $('#replaceWithAIResult').disabled = true;
  $('#generateAIRewrite').disabled = false;
  $('#generateAIRewrite').dataset.i18n = 'aiGenerate';
  $('#generateAIRewrite').textContent = t('aiGenerate');
  const applyButton = $('#replaceWithAIResult');
  const applyLabel = insertMode ? 'aiInsertAtCursor' : 'aiReplaceSelection';
  applyButton.dataset.i18n = applyLabel;
  applyButton.textContent = t(applyLabel);
  updateAIRewriteControls();
  els.aiCloudConsentRow.classList.remove('hidden');
  els.aiRewriteDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => (insertMode ? els.aiInstruction : els.aiRewriteAction).focus());
}

function closeAIRewrite() {
  if (els.aiRewriteDialog.classList.contains('hidden')) return;
  aiRewriteRequest += 1;
  stopAIRewriteProgress();
  $('#generateAIRewrite').disabled = false;
  $('#generateAIRewrite').dataset.i18n = 'aiGenerate';
  $('#generateAIRewrite').textContent = t('aiGenerate');
  els.aiRewriteDialog.classList.add('hidden');
  aiRewriteSelection = null;
  if (els.aiSettingsDialog.classList.contains('hidden')) document.body.classList.remove('dialog-open');
  focusCodeEditor();
}

async function generateAIRewrite() {
  if (!aiRewriteSelection) return;
  const action = els.aiRewriteAction.value;
  const instruction = els.aiInstruction.value.trim();
  if (action === 'custom' && !instruction) {
    els.aiRewriteStatus.textContent = t('aiNeedInstruction');
    els.aiInstruction.focus();
    return;
  }
  if (!els.aiCloudConsent.checked) {
    els.aiRewriteStatus.textContent = t('aiNeedCloudConsent');
    els.aiCloudConsent.focus();
    return;
  }
  const button = $('#generateAIRewrite');
  const requestID = ++aiRewriteRequest;
  button.disabled = true;
  button.dataset.i18n = 'aiGenerating';
  button.textContent = t('aiGenerating');
  $('#replaceWithAIResult').disabled = true;
  els.aiRewriteStatus.textContent = '';
  startAIRewriteProgress();
  try {
    const result = await window.quilliteMarkdown.rewriteWithAI({
      action,
      text: aiRewriteSelection.markdown,
      instruction,
      targetLanguage: els.aiTargetLanguage.value
    });
    if (requestID !== aiRewriteRequest) return;
    stopAIRewriteProgress();
    els.aiResultText.value = result?.text || '';
    if (!els.aiResultText.value.trim()) throw new Error(t('aiEmptyResult'));
    els.aiRewriteStatus.textContent = '';
    $('#replaceWithAIResult').disabled = false;
  } catch (error) {
    if (requestID !== aiRewriteRequest) return;
    stopAIRewriteProgress();
    els.aiRewriteStatus.textContent = `${t('aiRequestFailed')}: ${aiErrorMessage(error)}`;
    void window.quilliteMarkdown.reportErrorLog?.('ai.edit', aiErrorMessage(error), '');
  } finally {
    if (requestID === aiRewriteRequest) {
      button.disabled = false;
      button.dataset.i18n = 'aiGenerate';
      button.textContent = t('aiGenerate');
    }
  }
}

function replaceWithAIResult() {
  if (!codeEditor || !aiRewriteSelection) return;
  if (aiRewriteSelection.documentSession !== state.documentSession || !state.editing) {
    els.aiRewriteStatus.textContent = t('aiSelectionChanged');
    return;
  }
  const replacement = els.aiResultText.value;
  if (!replacement.trim()) {
    els.aiRewriteStatus.textContent = t('aiEmptyResult');
    return;
  }
  const { from, to, markdown, mode } = aiRewriteSelection;
  const insertMode = mode === 'insert';
  if (!insertMode && codeEditor.state.doc.sliceString(from, to) !== markdown) {
    els.aiRewriteStatus.textContent = t('aiSelectionChanged');
    return;
  }
  const documentLength = codeEditor.state.doc.length;
  const insertAt = insertMode && Number.isInteger(from) && from >= 0 && from <= documentLength ? from : documentLength;
  const changeFrom = insertMode ? insertAt : from;
  const changeTo = insertMode ? insertAt : to;
  codeEditor.dispatch({
    changes: { from: changeFrom, to: changeTo, insert: replacement },
    selection: { anchor: changeFrom + replacement.length },
    scrollIntoView: true,
    userEvent: 'input.ai'
  });
  closeAIRewrite();
  showToast(t(insertMode ? 'aiContentInserted' : 'aiSelectionReplaced'), 'success', 3600);
}

function aiReviewCategoryLabel(category) {
  const key = `aiReviewCategory${category.charAt(0).toUpperCase()}${category.slice(1)}`;
  return t(key);
}

function aiReviewSeverityLabel(severity) {
  const key = `aiReviewSeverity${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
  return t(key);
}

function updateAIReviewSelectionUI() {
  const selected = aiReviewSuggestions.filter(suggestion => suggestion.selected).length;
  els.aiReviewSummary.textContent = t('aiReviewSummary', { count: aiReviewSuggestions.length, selected });
  els.applyAIReview.disabled = aiReviewApplied || selected === 0;
  els.selectAllAIReview.disabled = aiReviewApplied;
  els.clearAllAIReview.disabled = aiReviewApplied;
  els.aiReviewSuggestions.querySelectorAll('[data-ai-review-index]').forEach(checkbox => {
    const index = Number(checkbox.dataset.aiReviewIndex);
    checkbox.checked = Boolean(aiReviewSuggestions[index]?.selected);
    checkbox.disabled = aiReviewApplied;
    checkbox.closest('.ai-review-suggestion')?.classList.toggle('selected', checkbox.checked);
    checkbox.closest('.ai-review-suggestion')?.classList.toggle('applied', aiReviewApplied && checkbox.checked);
  });
}

function renderAIReviewSuggestions() {
  els.aiReviewSuggestions.replaceChildren();
  aiReviewSuggestions.forEach((suggestion, index) => {
    const card = document.createElement('article');
    card.className = 'ai-review-suggestion selected';

    const heading = document.createElement('div');
    heading.className = 'ai-review-suggestion-heading';
    const choice = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = suggestion.selected;
    checkbox.dataset.aiReviewIndex = String(index);
    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${suggestion.reason}`;
    choice.append(checkbox, title);
    const badges = document.createElement('span');
    badges.className = 'ai-review-badges';
    const category = document.createElement('em');
    category.textContent = aiReviewCategoryLabel(suggestion.category);
    const severity = document.createElement('em');
    severity.className = `severity-${suggestion.severity}`;
    severity.textContent = aiReviewSeverityLabel(suggestion.severity);
    badges.append(category, severity);
    heading.append(choice, badges);

    const comparison = document.createElement('div');
    comparison.className = 'ai-review-comparison';
    const original = document.createElement('section');
    const originalLabel = document.createElement('small');
    const originalText = document.createElement('pre');
    originalLabel.textContent = t('aiReviewOriginal');
    originalText.textContent = suggestion.original;
    original.append(originalLabel, originalText);
    const replacement = document.createElement('section');
    const replacementLabel = document.createElement('small');
    const replacementText = document.createElement('pre');
    replacementLabel.textContent = t('aiReviewReplacement');
    replacementText.textContent = suggestion.replacement || t('aiReviewDeleteContent');
    replacement.append(replacementLabel, replacementText);
    comparison.append(original, replacement);

    card.append(heading, comparison);
    els.aiReviewSuggestions.append(card);
  });
  updateAIReviewSelectionUI();
}

function setAIReviewEmptyState(titleKey, hintKey) {
  stopAIReviewProgress();
  els.aiReviewEmpty.querySelector('strong').textContent = t(titleKey);
  els.aiReviewEmpty.querySelector('p').textContent = t(hintKey);
}

function stopAIReviewProgress() {
  if (aiReviewProgressTimer) window.clearInterval(aiReviewProgressTimer);
  aiReviewProgressTimer = 0;
  aiReviewStartedAt = 0;
  els.aiReviewEmpty.classList.remove('is-checking');
  els.aiReviewEmpty.removeAttribute('aria-busy');
  els.aiReviewProgress.classList.add('hidden');
  els.aiReviewProgress.setAttribute('aria-hidden', 'true');
}

function resetAIDocumentReviewSession() {
  aiReviewRequest += 1;
  stopAIReviewProgress();
  els.aiReviewDialog.classList.add('hidden');
  if (els.aiSettingsDialog.classList.contains('hidden') && els.aiRewriteDialog.classList.contains('hidden')) document.body.classList.remove('dialog-open');
  aiReviewSessionActive = false;
  aiReviewApplied = false;
  aiReviewSnapshot = '';
  aiReviewSuggestions = [];
  els.aiReviewSuggestions.replaceChildren();
  els.aiReviewSuggestions.classList.add('hidden');
  els.aiReviewToolbar.classList.add('hidden');
  els.aiReviewEmpty.classList.remove('hidden');
  els.aiReviewConsentRow.classList.remove('hidden');
  els.aiReviewConsent.checked = true;
  els.aiReviewStatus.textContent = '';
  els.runAIReview.disabled = false;
  els.runAIReview.dataset.i18n = 'aiStartReview';
  els.runAIReview.textContent = t('aiStartReview');
  els.runAIReview.classList.remove('hidden');
  els.rerunAIReview.classList.add('hidden');
  els.applyAIReview.classList.add('hidden');
  els.applyAIReview.disabled = true;
  els.selectAllAIReview.disabled = false;
  els.clearAllAIReview.disabled = false;
  setAIReviewEmptyState('aiReviewReadyTitle', 'aiReviewReadyHint');
}

function updateAIReviewProgress() {
  if (!aiReviewStartedAt) return;
  const elapsed = Math.max(0, (Date.now() - aiReviewStartedAt) / 1000);
  let phaseKey = 'aiReviewConnecting';
  if (elapsed >= 3) phaseKey = 'aiReviewReading';
  if (elapsed >= 11) phaseKey = 'aiReviewAnalysing';
  if (elapsed >= 28) phaseKey = 'aiReviewFormatting';
  const percent = Math.min(92, Math.round(8 + 84 * (1 - Math.exp(-elapsed / 23))));
  const provider = normalizeAIProvider(currentAISettings?.provider);
  const providerName = t(aiProviderConfigs[provider].nameKey);
  const model = currentAISettings?.model || aiProviderConfigs[provider].model;
  els.aiReviewEmpty.querySelector('strong').textContent = t(phaseKey);
  els.aiReviewEmpty.querySelector('p').textContent = t('aiReviewProgressMeta', { provider: providerName, model, seconds: Math.floor(elapsed) });
  els.aiReviewProgressBar.style.width = `${percent}%`;
  els.aiReviewProgressMeta.textContent = `${percent}%`;
}

function startAIReviewProgress() {
  stopAIReviewProgress();
  aiReviewStartedAt = Date.now();
  els.aiReviewEmpty.classList.add('is-checking');
  els.aiReviewEmpty.setAttribute('aria-busy', 'true');
  els.aiReviewProgress.classList.remove('hidden');
  els.aiReviewProgress.setAttribute('aria-hidden', 'false');
  updateAIReviewProgress();
  aiReviewProgressTimer = window.setInterval(updateAIReviewProgress, 500);
}

function aiReviewErrorMessage(error) {
  const message = aiErrorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes('deadline exceeded') || lower.includes('timeout') || lower.includes('timed out')) {
    return state.language === 'en' ? 'The model took too long to respond. Retry or choose a faster model.' : '模型响应超时，请重试或选择响应更快的模型。';
  }
  if (lower.includes('unreadable response') || lower.includes('unsupported message format') || lower.includes('usable document review') || lower.includes('invalid response')) {
    return state.language === 'en' ? 'The model returned an incompatible result even after automatic repair. Retry or choose another model.' : '模型返回格式异常，自动修复后仍无法读取。请重试或更换模型。';
  }
  if (lower.includes('http 429') || lower.includes('rate limit')) {
    return state.language === 'en' ? 'The AI service is busy or rate-limited. Wait briefly and retry.' : 'AI 服务繁忙或已触发频率限制，请稍后重试。';
  }
  if (lower.includes('api key')) {
    return state.language === 'en' ? 'The API Key is missing or invalid. Check it in Settings.' : 'API Key 缺失或无效，请在“设置”中检查。';
  }
  return message;
}

async function openAIDocumentReview() {
  if (!codeEditor || !state.editing) return;
  try {
    currentAISettings = await window.quilliteMarkdown.getAISettings();
  } catch {
    currentAISettings = { provider: 'deepseek', hasApiKey: false };
  }
  if (!currentAISettings?.hasApiKey) {
    pendingAIDocumentReview = true;
    await openAISettings({ required: true });
    return;
  }
  if (!aiReviewSessionActive) {
    resetAIDocumentReviewSession();
    aiReviewSessionActive = true;
  }
  els.aiReviewDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => {
    const action = !els.rerunAIReview.classList.contains('hidden') ? els.rerunAIReview : els.runAIReview;
    action.focus();
  });
}

function closeAIDocumentReview() {
  if (els.aiReviewDialog.classList.contains('hidden')) return;
  els.aiReviewDialog.classList.add('hidden');
  if (els.aiSettingsDialog.classList.contains('hidden') && els.aiRewriteDialog.classList.contains('hidden')) document.body.classList.remove('dialog-open');
  focusCodeEditor();
}

async function runAIDocumentReview() {
  if (!codeEditor) return;
  if (!els.aiReviewConsent.checked) {
    els.aiReviewStatus.textContent = t('aiNeedCloudConsent');
    els.aiReviewConsent.focus();
    return;
  }
  const source = editorContent();
  if (!source.trim()) {
    els.aiReviewStatus.textContent = t('aiReviewEmptyDocument');
    return;
  }
  if ([...source].length > 80000) {
    els.aiReviewStatus.textContent = t('aiReviewTooLong');
    return;
  }
  const requestID = ++aiReviewRequest;
  aiReviewSessionActive = true;
  aiReviewApplied = false;
  aiReviewSnapshot = source;
  aiReviewSuggestions = [];
  els.runAIReview.disabled = true;
  els.applyAIReview.disabled = true;
  els.aiReviewSuggestions.classList.add('hidden');
  els.aiReviewToolbar.classList.add('hidden');
  els.aiReviewEmpty.classList.remove('hidden');
  els.aiReviewStatus.textContent = '';
  els.runAIReview.dataset.i18n = 'aiReviewChecking';
  els.runAIReview.textContent = t('aiReviewChecking');
  els.runAIReview.classList.remove('hidden');
  els.rerunAIReview.classList.add('hidden');
  els.applyAIReview.classList.add('hidden');
  els.aiReviewConsentRow.classList.remove('hidden');
  startAIReviewProgress();
  try {
    const result = await window.quilliteMarkdown.reviewDocumentWithAI({ text: source });
    if (requestID !== aiReviewRequest) return;
    stopAIReviewProgress();
    aiReviewSuggestions = locateAIReviewSuggestions(result?.suggestions, source);
    els.aiReviewStatus.textContent = '';
    els.runAIReview.classList.add('hidden');
    els.rerunAIReview.classList.remove('hidden');
    if (aiReviewSuggestions.length === 0) {
      els.aiReviewConsentRow.classList.add('hidden');
      setAIReviewEmptyState('aiReviewNoIssuesTitle', 'aiReviewNoIssuesHint');
      return;
    }
    renderAIReviewSuggestions();
    els.aiReviewEmpty.classList.add('hidden');
    els.aiReviewSuggestions.classList.remove('hidden');
    els.aiReviewToolbar.classList.remove('hidden');
    els.aiReviewConsentRow.classList.add('hidden');
    els.applyAIReview.classList.remove('hidden');
  } catch (error) {
    if (requestID !== aiReviewRequest) return;
    stopAIReviewProgress();
    els.aiReviewStatus.textContent = `${t('aiReviewRequestFailed')}: ${aiReviewErrorMessage(error)}`;
    setAIReviewEmptyState('aiReviewFailedTitle', 'aiReviewFailedHint');
    els.runAIReview.classList.add('hidden');
    els.rerunAIReview.classList.remove('hidden');
    void window.quilliteMarkdown.reportErrorLog?.('ai.review', aiErrorMessage(error), '');
  } finally {
    if (requestID === aiReviewRequest) els.runAIReview.disabled = false;
  }
}

function setAllAIReviewSuggestions(selected) {
  aiReviewSuggestions.forEach(suggestion => { suggestion.selected = selected; });
  updateAIReviewSelectionUI();
}

function applySelectedAIReviewSuggestions() {
  if (!codeEditor) return;
  if (editorContent() !== aiReviewSnapshot) {
    els.aiReviewStatus.textContent = t('aiReviewDocumentChanged');
    return;
  }
  const selected = aiReviewSuggestions.filter(suggestion => suggestion.selected).sort((left, right) => left.start - right.start);
  if (selected.length === 0) {
    els.aiReviewStatus.textContent = t('aiReviewNothingSelected');
    return;
  }
  if (hasOverlappingReviewSuggestions(selected)) {
    els.aiReviewStatus.textContent = t('aiReviewOverlap');
    return;
  }
  codeEditor.dispatch({
    changes: selected.map(suggestion => ({ from: suggestion.start, to: suggestion.end, insert: suggestion.replacement })),
    scrollIntoView: true,
    userEvent: 'input.ai-review'
  });
  const count = selected.length;
  aiReviewApplied = true;
  aiReviewSuggestions.forEach(suggestion => { suggestion.applied = suggestion.selected; });
  updateAIReviewSelectionUI();
  els.applyAIReview.classList.add('hidden');
  els.aiReviewStatus.textContent = t('aiReviewApplied', { count });
  closeAIDocumentReview();
  showToast(t('aiReviewApplied', { count }), 'success', 4200);
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
    state.feedbackSystemInfo = { appVersion: '2.7.2', os: 'windows', systemVersion: '—' };
  }
  $('#feedbackAppVersion').textContent = state.feedbackSystemInfo?.appVersion || '2.7.2';
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
  $('#currentVersion').textContent = info.currentVersion || '2.7.2';
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
  await setFontFamily(state.fontFamily, true, false);
  setDocumentWidth(state.docWidth, true);
  setEditorLayout(state.editorLayout, true);
  scheduleMacWindowModeSync();
  const prefs = await window.quilliteMarkdown.getPreferences();
  await setFontFamily(prefs.fontFamily || 'system', true, false);
  state.usageAnalytics = prefs.usageAnalytics !== false;
  els.usageAnalyticsToggle.checked = state.usageAnalytics;
  try {
    applyImageUploadSettings(await window.quilliteMarkdown.getImageUploadSettings());
  } catch (error) {
    console.warn('Unable to load image upload settings', error);
  }
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
els.compactTocButton.addEventListener('click', () => {
  if (isCompactTocLayout()) setCompactTocOpen(!state.compactTocOpen);
  else setWideTocCollapsed(false);
});
els.compactTocBackdrop.addEventListener('click', () => setCompactTocOpen(false, true));
els.closeCompactToc.addEventListener('click', () => {
  if (isCompactTocLayout()) setCompactTocOpen(false, true);
  else setWideTocCollapsed(true);
});
$('#searchButton').addEventListener('click', openSearch);
$('#closeSearch').addEventListener('click', closeSearch);
$('#searchPrev').addEventListener('click', () => goToSearch(-1));
$('#searchNext').addEventListener('click', () => goToSearch(1));
els.searchInput.addEventListener('input', performSearch);
els.searchInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') goToSearch(event.shiftKey ? -1 : 1);
  if (event.key === 'Escape') closeSearch();
});
els.tocSearchInput.addEventListener('input', event => {
  state.tocQuery = event.target.value;
  renderToc();
});
els.clearTocSearch.addEventListener('click', () => {
  state.tocQuery = '';
  els.tocSearchInput.value = '';
  renderToc();
  els.tocSearchInput.focus();
});
document.querySelectorAll('[data-toc-mode]').forEach(button => button.addEventListener('click', () => {
  state.tocMode = normalizeTocMode(button.dataset.tocMode);
  localStorage.setItem('tocMode', state.tocMode);
  renderToc();
}));
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
  closeSpellcheckContextMenu();
  els.codeLangMenu.classList.add('hidden');
  syncSpellcheckOptions();
  const opening = els.moreMenu.classList.contains('hidden');
  closeSettingsSubmenus();
  els.moreMenu.classList.toggle('hidden', !opening);
  if (opening) positionMoreMenu();
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
window.quilliteMarkdown.onImageUploadProgress(updateImageUploadProgress);
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
$('#closeExportCenter').addEventListener('click', () => closeExportCenter());
$('#cancelExportCenter').addEventListener('click', () => closeExportCenter());
els.confirmExportCenter.addEventListener('click', performExportCenter);
els.exportCenterDialog.addEventListener('click', event => {
  if (event.target === els.exportCenterDialog) closeExportCenter();
});
els.exportFormatGrid.addEventListener('click', event => {
  const button = event.target.closest('[data-export-format]');
  if (!button) return;
  const current = readExportDraft();
  state.exportDraft = normalizeExportPreset({
    format: button.dataset.exportFormat,
    customWriter: current.customWriter,
    customExtension: current.customExtension,
    extraArguments: current.extraArguments,
    imageScale: 2,
    imageLayout: current.imageLayout
  });
  syncExportCenterUI();
});
els.exportPresetSelect.addEventListener('change', () => {
  const preset = state.exportSettings.presets.find(item => item.id === els.exportPresetSelect.value);
  $('#deleteExportPreset').disabled = !preset;
  if (!preset) return;
  els.exportPresetName.value = preset.name;
  writeExportDraft(preset);
});
$('#saveExportPreset').addEventListener('click', () => saveExportPreset().catch(error => showToast(error?.message || t('exportFailed'), 'error')));
$('#deleteExportPreset').addEventListener('click', () => deleteExportPreset().catch(error => showToast(error?.message || t('exportFailed'), 'error')));
$('#detectPandoc').addEventListener('click', refreshPandocStatus);
$('#selectPandoc').addEventListener('click', selectPandocExecutable);
$('#openPandocInstall').addEventListener('click', () => window.quilliteMarkdown.openExternal(PANDOC_INSTALL_URL));
$('#closePDFTutorial').addEventListener('click', () => closePDFTutorial());
$('#cancelPDFTutorial').addEventListener('click', () => closePDFTutorial());
$('#confirmPDFTutorial').addEventListener('click', confirmPDFExport);
els.pdfTutorialDialog.addEventListener('click', event => {
  if (event.target === els.pdfTutorialDialog) closePDFTutorial();
});
$('#closeTableDialog').addEventListener('click', closeTableDialog);
$('#cancelTable').addEventListener('click', closeTableDialog);
$('#confirmTable').addEventListener('click', saveVisualTable);
$('#tableRows').addEventListener('change', resizeTableFromFields);
$('#tableColumns').addEventListener('change', resizeTableFromFields);
$('#addTableRow').addEventListener('click', () => {
  if (!tableDesignerState || tableDesignerState.model.cells.length >= TABLE_LIMITS.maxRows) return;
  const nextRow = tableDesignerState.model.cells.length;
  tableDesignerState.model = resizeTableModel(tableDesignerState.model, nextRow + 1, tableDesignerState.model.alignments.length, index => t('columnNumber', { number: index + 1 }));
  renderTableDesigner({ row: nextRow, column: 0 });
});
$('#addTableColumn').addEventListener('click', () => {
  if (!tableDesignerState || tableDesignerState.model.alignments.length >= TABLE_LIMITS.maxColumns) return;
  const nextColumn = tableDesignerState.model.alignments.length;
  tableDesignerState.model = resizeTableModel(tableDesignerState.model, tableDesignerState.model.cells.length, nextColumn + 1, index => t('columnNumber', { number: index + 1 }));
  renderTableDesigner({ row: 0, column: nextColumn });
});
els.tableDesignerGrid.addEventListener('input', event => {
  const input = event.target.closest('[data-table-cell-row][data-table-cell-column]');
  if (!input || !tableDesignerState) return;
  const row = Number(input.dataset.tableCellRow);
  const column = Number(input.dataset.tableCellColumn);
  tableDesignerState.model.cells[row][column] = input.value;
});
els.tableDesignerGrid.addEventListener('change', event => {
  const select = event.target.closest('[data-table-alignment]');
  if (!select || !tableDesignerState) return;
  const column = Number(select.dataset.tableAlignment);
  tableDesignerState.model.alignments[column] = ['center', 'right'].includes(select.value) ? select.value : 'left';
  els.tableDesignerGrid.querySelectorAll(`tr > :nth-child(${column + 2})`).forEach(cell => { cell.style.textAlign = tableDesignerState.model.alignments[column]; });
});
els.tableDesignerGrid.addEventListener('click', event => {
  if (!tableDesignerState) return;
  const rowButton = event.target.closest('[data-remove-table-row]');
  if (rowButton) {
    tableDesignerState.model = removeTableRow(tableDesignerState.model, Number(rowButton.dataset.removeTableRow));
    renderTableDesigner();
    return;
  }
  const columnButton = event.target.closest('[data-remove-table-column]');
  if (columnButton) {
    tableDesignerState.model = removeTableColumn(tableDesignerState.model, Number(columnButton.dataset.removeTableColumn));
    renderTableDesigner();
  }
});
els.tableDesignerGrid.addEventListener('dragstart', event => {
  const handle = event.target.closest('[data-table-drag]');
  if (!handle || event.target.closest('select, button, .table-column-resizer')) {
    event.preventDefault();
    return;
  }
  const kind = handle.dataset.tableDrag;
  const index = Number(kind === 'column' ? handle.dataset.columnIndex : handle.dataset.rowIndex);
  tableDesignerDrag = { kind, index };
  handle.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `${kind}:${index}`);
});
els.tableDesignerGrid.addEventListener('dragover', event => {
  if (!tableDesignerDrag) return;
  const target = tableDesignerDrag.kind === 'column'
    ? event.target.closest('[data-table-drop-column]')
    : event.target.closest('[data-table-drop-row]');
  if (!target) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  els.tableDesignerGrid.querySelectorAll('.is-drop-target').forEach(element => element.classList.remove('is-drop-target'));
  target.classList.add('is-drop-target');
});
els.tableDesignerGrid.addEventListener('drop', event => {
  if (!tableDesignerDrag || !tableDesignerState) return;
  const target = tableDesignerDrag.kind === 'column'
    ? event.target.closest('[data-table-drop-column]')
    : event.target.closest('[data-table-drop-row]');
  if (!target) return;
  event.preventDefault();
  const targetIndex = Number(tableDesignerDrag.kind === 'column' ? target.dataset.tableDropColumn : target.dataset.tableDropRow);
  tableDesignerState.model = tableDesignerDrag.kind === 'column'
    ? reorderTableColumn(tableDesignerState.model, tableDesignerDrag.index, targetIndex)
    : reorderTableRow(tableDesignerState.model, tableDesignerDrag.index, targetIndex);
  clearTableDesignerDropTargets();
  renderTableDesigner();
});
els.tableDesignerGrid.addEventListener('dragend', clearTableDesignerDropTargets);
els.tableDesignerGrid.addEventListener('pointerdown', event => {
  const resizer = event.target.closest('[data-resize-table-column]');
  if (!resizer || !tableDesignerState) return;
  event.preventDefault();
  const column = Number(resizer.dataset.resizeTableColumn);
  tableColumnResize = { column, startX: event.clientX, startWidth: tableDesignerState.model.widths[column] };
  document.body.classList.add('resizing-table-column');
});
document.addEventListener('pointermove', event => {
  if (!tableColumnResize || !tableDesignerState) return;
  const width = Math.max(TABLE_LIMITS.minWidth, Math.min(TABLE_LIMITS.maxWidth, tableColumnResize.startWidth + event.clientX - tableColumnResize.startX));
  tableDesignerState.model.widths[tableColumnResize.column] = Math.round(width);
  const column = els.tableDesignerGrid.querySelector(`colgroup col:nth-child(${tableColumnResize.column + 2})`);
  if (column) column.style.width = `${Math.round(width)}px`;
  const table = els.tableDesignerGrid.querySelector('.table-designer-table');
  if (table) table.style.width = `${64 + tableDesignerState.model.widths.reduce((total, columnWidth) => total + columnWidth, 0)}px`;
});
document.addEventListener('pointerup', () => {
  if (!tableColumnResize) return;
  tableColumnResize = null;
  document.body.classList.remove('resizing-table-column');
});
els.tableDialog.addEventListener('click', event => {
  if (event.target === els.tableDialog) closeTableDialog();
});
$('#closeImageDialog').addEventListener('click', closeImageDialog);
$('#cancelImage').addEventListener('click', closeImageDialog);
$('#confirmImage').addEventListener('click', insertImageFromUrl);
$('#pickLocalImage').addEventListener('click', () => { closeImageDialog(); insertLocalImage(); });
$('#openImageUploadSettings').addEventListener('click', openImageUploadSettings);
$('#closeImageUploadSettings').addEventListener('click', closeImageUploadSettings);
$('#cancelImageUploadSettings').addEventListener('click', closeImageUploadSettings);
$('#saveImageUploadSettings').addEventListener('click', saveImageUploadSettings);
$('#testPicGo').addEventListener('click', testPicGoConnection);
$('#loginPicGoCloud').addEventListener('click', loginPicGoCloud);
$('#testPicGoCloud').addEventListener('click', testPicGoCloudConnection);
$('#logoutPicGoCloud').addEventListener('click', logoutPicGoCloud);
$('#downloadPicGo').addEventListener('click', () => {
  Promise.resolve(window.quilliteMarkdown.openExternal(PICGO_DOWNLOAD_URL)).catch(error => reportSilentError(error, 'picgo.download'));
});
$('#picGoInstalledNext').addEventListener('click', () => {
  state.picGoConnectionReady = false;
  setPicGoWizardStep(2);
  updatePicGoSettingsAvailability();
  testPicGoConnection({ automatic: true });
});
$('#picGoSetupBack').addEventListener('click', () => {
  state.picGoDetectionRun += 1;
  state.picGoConnectionReady = false;
  setPicGoTestStatus();
  setPicGoWizardStep(1);
  updatePicGoSettingsAvailability();
});
document.querySelectorAll('input[name="imageUploadMode"]').forEach(input => input.addEventListener('change', () => {
  state.picGoDetectionRun += 1;
  state.picGoConnectionReady = false;
  setPicGoWizardStep(1);
  updatePicGoSettingsAvailability();
  setPicGoTestStatus();
	setPicGoCloudStatus();
	if (selectedImageUploadMode() === 'picgo-cloud' && state.picGoCloudHasToken) testPicGoCloudConnection({ quiet: true });
}));
[els.picGoServerURL, els.picGoSecret, els.clearPicGoSecret].forEach(input => input.addEventListener('input', () => {
  if (selectedImageUploadMode() !== 'picgo') return;
  state.picGoDetectionRun += 1;
  state.picGoConnectionReady = false;
  setPicGoWizardStep(2);
  setPicGoTestStatus();
  updatePicGoSettingsAvailability();
}));
els.imageWidth.addEventListener('input', updateImageWidthLabel);
els.imageDialog.addEventListener('click', event => {
  if (event.target === els.imageDialog) closeImageDialog();
});
els.imageUploadSettingsDialog.addEventListener('click', event => {
  if (event.target === els.imageUploadSettingsDialog) closeImageUploadSettings();
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
els.editFormulaButton.addEventListener('pointerdown', event => event.stopPropagation());
els.editFormulaButton.addEventListener('click', () => {
  updateExistingFlowchartButton();
  if (activeFormulaMatch) openFormulaDialog(activeFormulaMatch);
});
$('#closeDiagramDialog').addEventListener('click', closeDiagramDialog);
$('#cancelDiagram').addEventListener('click', closeDiagramDialog);
els.diagramFullscreenButton.addEventListener('click', toggleDiagramFullscreen);
$('#exitDiagramFullscreen').addEventListener('click', () => setDiagramFullscreen(false));
$('#insertDiagramFullscreen').addEventListener('click', insertGeneratedDiagram);
$('#insertDiagram').addEventListener('click', insertGeneratedDiagram);
els.editFlowchartButton.addEventListener('pointerdown', event => event.stopPropagation());
els.editFlowchartButton.addEventListener('click', () => {
  updateExistingFlowchartButton();
  if (activeFlowchartFence) openDiagramDialog(activeFlowchartFence.templateId, activeFlowchartFence);
});
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
$('#flowchartVisualMode').addEventListener('click', () => showFlowchartEditorMode('visual', { notify: true }));
$('#flowchartSourceMode').addEventListener('click', () => showFlowchartEditorMode('source'));
$('#addStructuredDiagramRow').addEventListener('click', () => {
  if (!structuredDiagramState.model || !structuredDiagramState.definition) return;
  structuredDiagramState.model.rows.push({ ...structuredDiagramState.definition.empty });
  renderStructuredDiagramEditor();
  syncStructuredDiagramSource();
  requestAnimationFrame(() => els.structuredDiagramRows.lastElementChild?.querySelector('input, select')?.focus());
});
els.structuredDiagramRows.addEventListener('click', event => {
  const remove = event.target.closest('[data-structured-remove]');
  if (!remove || !structuredDiagramState.model) return;
  const index = Number(remove.dataset.structuredRemove);
  if (!Number.isInteger(index)) return;
  structuredDiagramState.model.rows.splice(index, 1);
  renderStructuredDiagramEditor();
  syncStructuredDiagramSource();
});
els.flowchartVisualEditor.addEventListener('click', event => {
  const addButton = event.target.closest('[data-flowchart-add]');
  if (addButton) addFlowchartNodeAt(addButton.dataset.flowchartAdd);
});
els.flowchartVisualEditor.addEventListener('keydown', event => {
  if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') return;
  if (event.target.closest('input, textarea, select')) return;
  event.preventDefault();
  selectAllFlowchartNodes();
});
$('#flowchartConnect').addEventListener('click', () => {
  flowchartDesignerState.connecting = !flowchartDesignerState.connecting;
  flowchartDesignerState.connectFrom = '';
  renderFlowchartCanvas();
});
$('#flowchartAutoLayout').addEventListener('click', () => {
  if (!flowchartDesignerState.model) return;
  flowchartDesignerState.model = layoutFlowchart(flowchartDesignerState.model);
  syncFlowchartSource();
  renderFlowchartCanvas();
});
$('#flowchartSelectAll').addEventListener('click', selectAllFlowchartNodes);
els.flowchartZoomOut.addEventListener('click', () => setFlowchartZoom(flowchartDesignerState.zoom - FLOWCHART_ZOOM_STEP));
els.flowchartZoomReset.addEventListener('click', () => setFlowchartZoom(1, { resetPan: true }));
els.flowchartZoomIn.addEventListener('click', () => setFlowchartZoom(flowchartDesignerState.zoom + FLOWCHART_ZOOM_STEP));
els.flowchartCanvasViewport.addEventListener('wheel', event => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  setFlowchartZoom(flowchartDesignerState.zoom + (event.deltaY < 0 ? FLOWCHART_ZOOM_STEP : -FLOWCHART_ZOOM_STEP));
}, { passive: false });
els.flowchartDirection.addEventListener('change', event => {
  if (!flowchartDesignerState.model) return;
  flowchartDesignerState.model = layoutFlowchart({ ...flowchartDesignerState.model, direction: event.target.value });
  syncFlowchartSource();
  renderFlowchartCanvas();
});
els.flowchartNodeLabel.addEventListener('input', event => updateSelectedFlowchartNode({ label: event.target.value }));
els.flowchartNodeShape.addEventListener('change', event => updateSelectedFlowchartNode({ shape: event.target.value }));
els.flowchartEdgeLabel.addEventListener('input', event => updateSelectedFlowchartEdge({ label: event.target.value }));
els.flowchartEdgeStyle.addEventListener('change', event => updateSelectedFlowchartEdge({ style: event.target.value }));
$('#flowchartDeleteSelection').addEventListener('click', deleteSelectedFlowchartElement);
els.flowchartCanvas.addEventListener('pointerdown', event => {
  const nodeElement = event.target.closest('[data-flowchart-node]');
  const edgeElement = event.target.closest('[data-flowchart-edge]');
  if (nodeElement && !flowchartDesignerState.connecting && event.button === 0) {
    const node = flowchartDesignerState.model?.nodes.find(item => item.id === nodeElement.dataset.flowchartNode);
    if (!node) return;
    const point = flowchartCanvasPoint(event);
    const existingSelection = flowchartDesignerState.selection;
    const nodeIds = existingSelection?.type === 'nodes' && existingSelection.ids.includes(node.id)
      ? existingSelection.ids
      : [node.id];
    if (nodeIds.length === 1) flowchartDesignerState.selection = { type: 'node', id: node.id };
    const selectedIds = new Set(nodeIds);
    const origins = Object.fromEntries(flowchartDesignerState.model.nodes
      .filter(item => selectedIds.has(item.id))
      .map(item => [item.id, { x: item.x, y: item.y }]));
    flowchartDesignerState.drag = { nodeIds, origins, startX: point.x, startY: point.y, moved: false };
    els.flowchartCanvas.setPointerCapture?.(event.pointerId);
    renderFlowchartCanvas();
    event.preventDefault();
    return;
  }
  const canPan = event.button === 1 || (event.button === 0 && !nodeElement && !edgeElement && !flowchartDesignerState.connecting);
  if (!canPan) return;
  flowchartDesignerState.panDrag = { clientX: event.clientX, clientY: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
  els.flowchartCanvasViewport.classList.add('is-panning');
  els.flowchartCanvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
els.flowchartCanvas.addEventListener('pointermove', event => {
  const panDrag = flowchartDesignerState.panDrag;
  if (panDrag) {
    const rect = els.flowchartCanvasViewport.getBoundingClientRect();
    const viewBox = flowchartViewBox();
    const deltaX = (event.clientX - panDrag.clientX) * viewBox.width / Math.max(1, rect.width);
    const deltaY = (event.clientY - panDrag.clientY) * viewBox.height / Math.max(1, rect.height);
    flowchartDesignerState.panX += deltaX;
    flowchartDesignerState.panY += deltaY;
    panDrag.clientX = event.clientX;
    panDrag.clientY = event.clientY;
    if (Math.hypot(event.clientX - panDrag.startX, event.clientY - panDrag.startY) > 3) panDrag.moved = true;
    applyFlowchartZoom();
    return;
  }
  const drag = flowchartDesignerState.drag;
  if (!drag || !flowchartDesignerState.model) return;
  const viewportRect = els.flowchartCanvasViewport.getBoundingClientRect();
  const edgeZone = 52;
  const viewBox = flowchartViewBox();
  const horizontalStep = viewBox.width / Math.max(1, viewportRect.width) * 14;
  const verticalStep = viewBox.height / Math.max(1, viewportRect.height) * 14;
  if (event.clientX < viewportRect.left + edgeZone) flowchartDesignerState.panX += horizontalStep;
  else if (event.clientX > viewportRect.right - edgeZone) flowchartDesignerState.panX -= horizontalStep;
  if (event.clientY < viewportRect.top + edgeZone) flowchartDesignerState.panY += verticalStep;
  else if (event.clientY > viewportRect.bottom - edgeZone) flowchartDesignerState.panY -= verticalStep;
  applyFlowchartZoom();
  const point = flowchartCanvasPoint(event);
  if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 3) drag.moved = true;
  const deltaX = point.x - drag.startX;
  const deltaY = point.y - drag.startY;
  flowchartDesignerState.model = {
    ...flowchartDesignerState.model,
    nodes: flowchartDesignerState.model.nodes.map(node => drag.origins[node.id]
      ? { ...node, x: drag.origins[node.id].x + deltaX, y: drag.origins[node.id].y + deltaY }
      : node)
  };
  renderFlowchartCanvas();
});
els.flowchartCanvas.addEventListener('pointerup', event => {
  const panDrag = flowchartDesignerState.panDrag;
  if (panDrag) {
    if (panDrag.moved) flowchartDesignerState.ignoreClickUntil = Date.now() + 180;
    flowchartDesignerState.panDrag = null;
    els.flowchartCanvasViewport.classList.remove('is-panning');
  }
  const drag = flowchartDesignerState.drag;
  if (drag?.moved) {
    flowchartDesignerState.ignoreClickUntil = Date.now() + 180;
    syncFlowchartSource();
  }
  flowchartDesignerState.drag = null;
  if (els.flowchartCanvas.hasPointerCapture?.(event.pointerId)) els.flowchartCanvas.releasePointerCapture(event.pointerId);
});
els.flowchartCanvas.addEventListener('pointercancel', () => {
  flowchartDesignerState.drag = null;
  flowchartDesignerState.panDrag = null;
  els.flowchartCanvasViewport.classList.remove('is-panning');
});
els.flowchartCanvas.addEventListener('click', event => {
  if (Date.now() < flowchartDesignerState.ignoreClickUntil) return;
  const nodeElement = event.target.closest('[data-flowchart-node]');
  if (nodeElement) {
    handleFlowchartNodeClick(nodeElement.dataset.flowchartNode);
    return;
  }
  const edgeElement = event.target.closest('[data-flowchart-edge]');
  if (edgeElement) {
    flowchartDesignerState.connecting = false;
    flowchartDesignerState.connectFrom = '';
    setFlowchartSelection('edge', edgeElement.dataset.flowchartEdge);
    return;
  }
  if (!flowchartDesignerState.drag) setFlowchartSelection();
});
els.flowchartCanvas.addEventListener('dblclick', event => {
  if (event.target.closest('[data-flowchart-node], [data-flowchart-edge]')) return;
  const point = flowchartCanvasPoint(event);
  addFlowchartNodeAt('process', { x: point.x, y: point.y });
});
els.flowchartCanvas.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    selectAllFlowchartNodes();
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && flowchartDesignerState.selection) {
    event.preventDefault();
    deleteSelectedFlowchartElement();
  } else if (event.key === 'Escape' && flowchartDesignerState.connecting) {
    event.preventDefault();
    flowchartDesignerState.connecting = false;
    flowchartDesignerState.connectFrom = '';
    renderFlowchartCanvas();
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
$('#swapEditorLayoutButton').addEventListener('click', () => {
  setEditorLayout(state.editorLayout === 'editor-left' ? 'preview-left' : 'editor-left');
});
els.moreMenu.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const submenu = button.dataset.settingsSubmenu;
  if (submenu) {
    event.stopPropagation();
    openSettingsSubmenu(submenu, true);
    return;
  }
  const action = button?.dataset.action;
  const language = button?.dataset.language;
  if (language) setLanguage(language);
  if (button?.dataset.fontFamily) void setFontFamily(button.dataset.fontFamily);
  if (action === 'zoom-in') setFontScale(state.fontScale + .08);
  if (action === 'zoom-out') setFontScale(state.fontScale - .08);
  if (action === 'zoom-reset') setFontScale(1);
  if (button?.dataset.fontScale === 'auto') enableAutomaticFontScale();
  else if (button?.dataset.fontScale) setFontScale(Number(button.dataset.fontScale));
  if (button?.dataset.docWidth) setDocumentWidth(button.dataset.docWidth);
  if (button?.dataset.editorLayout) setEditorLayout(button.dataset.editorLayout);
  if (button.hasAttribute('data-spellcheck-toggle')) setSpellcheckEnabled(!state.spellcheckEnabled);
  if (button.dataset.spellcheckLanguage) setSpellcheckLanguage(button.dataset.spellcheckLanguage);
  if (button.hasAttribute('data-spellcheck-clear')) clearPersonalDictionary();
  if (action === 'default-app') {
    window.quilliteMarkdown.openDefaultApps();
    showToast(t('defaultAppHint'), 'info', 5200);
  }
  if (action === 'print') {
    printCurrentDocument();
  }
  if (action === 'export-center') openExportCenter();
  if (action === 'image-upload-settings') openImageUploadSettings();
  if (action === 'ai-settings') openAISettings();
  if (action === 'feedback') openFeedback();
  if (action === 'check-update') checkForUpdates(true);
  if (action === 'about') openAbout();
  closeMoreMenu();
});
let settingsSubmenuCloseTimer;
els.moreMenu.querySelectorAll('.settings-submenu-group').forEach(group => {
  const trigger = group.querySelector('[data-settings-submenu]');
  const panel = group.querySelector('[data-settings-submenu-panel]');
  if (!trigger || !panel) return;
  group.addEventListener('mouseenter', () => {
    clearTimeout(settingsSubmenuCloseTimer);
    openSettingsSubmenu(trigger.dataset.settingsSubmenu);
  });
  group.addEventListener('mouseleave', () => {
    clearTimeout(settingsSubmenuCloseTimer);
    settingsSubmenuCloseTimer = setTimeout(closeSettingsSubmenus, 120);
  });
  trigger.addEventListener('keydown', event => {
    if (!['ArrowRight', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    openSettingsSubmenu(trigger.dataset.settingsSubmenu, true);
  });
  panel.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeSettingsSubmenus();
    trigger.focus();
  });
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
els.editorClipboardMenu.addEventListener('click', event => {
  event.stopPropagation();
  const aiButton = event.target.closest('[data-editor-ai]');
  if (aiButton) {
    const selection = editorClipboardSelection ? { ...editorClipboardSelection } : null;
    void openAIRewrite(selection);
    return;
  }
  const button = event.target.closest('[data-editor-copy]');
  if (!button) return;
  copyEditorSelection(button.dataset.editorCopy);
});

$('#closeAISettings').addEventListener('click', closeAISettings);
$('#cancelAISettings').addEventListener('click', closeAISettings);
els.aiSettingsForm.addEventListener('submit', saveAISettings);
els.aiProvider.addEventListener('change', changeAIProvider);
els.aiModel.addEventListener('change', syncAISelectedModel);
els.aiCustomModel.addEventListener('input', syncAISelectedModel);
els.aiBaseURL.addEventListener('input', scheduleAIModelDiscovery);
els.aiAPIKey.addEventListener('input', scheduleAIModelDiscovery);
els.refreshAIModels.addEventListener('click', loadAIModels);
els.refreshAICustomModels.addEventListener('click', loadAIModels);
els.setDefaultAIProvider.addEventListener('click', setDefaultAIProvider);
els.editAIAPIKey.addEventListener('click', editAIAPIKey);
els.deleteAIAPIKey.addEventListener('click', deleteAIAPIKey);
$('#testAIConnection').addEventListener('click', testAIConnection);
els.aiEditButton.addEventListener('click', openAIEditor);
els.aiReviewButton.addEventListener('click', openAIDocumentReview);

$('#closeAIRewrite').addEventListener('click', closeAIRewrite);
$('#cancelAIRewrite').addEventListener('click', closeAIRewrite);
els.aiRewriteAction.addEventListener('change', updateAIRewriteControls);
els.aiResultText.addEventListener('input', () => {
  $('#replaceWithAIResult').disabled = !els.aiResultText.value.trim();
});
$('#generateAIRewrite').addEventListener('click', generateAIRewrite);
$('#replaceWithAIResult').addEventListener('click', replaceWithAIResult);
$('#openAISettingsFromRewrite').addEventListener('click', () => {
  els.aiRewriteDialog.classList.add('hidden');
  void openAISettings();
});
$('#closeAIReview').addEventListener('click', closeAIDocumentReview);
$('#cancelAIReview').addEventListener('click', closeAIDocumentReview);
els.runAIReview.addEventListener('click', runAIDocumentReview);
els.rerunAIReview.addEventListener('click', runAIDocumentReview);
els.applyAIReview.addEventListener('click', applySelectedAIReviewSuggestions);
els.selectAllAIReview.addEventListener('click', () => setAllAIReviewSuggestions(true));
els.clearAllAIReview.addEventListener('click', () => setAllAIReviewSuggestions(false));
els.aiReviewSuggestions.addEventListener('change', event => {
  const checkbox = event.target.closest('[data-ai-review-index]');
  if (!checkbox) return;
  const index = Number(checkbox.dataset.aiReviewIndex);
  if (!aiReviewSuggestions[index]) return;
  aiReviewSuggestions[index].selected = checkbox.checked;
  updateAIReviewSelectionUI();
});
$('#openAISettingsFromReview').addEventListener('click', () => {
  resumeAIDocumentReviewAfterSettings = true;
  els.aiReviewDialog.classList.add('hidden');
  void openAISettings();
});
els.spellcheckContextMenu.addEventListener('click', event => {
  event.stopPropagation();
  const suggestion = event.target.closest('[data-spelling-suggestion]');
  if (suggestion) {
    replaceSpellingWithSuggestion(Number(suggestion.dataset.spellingSuggestion));
    return;
  }
  const action = event.target.closest('[data-spelling-action]')?.dataset.spellingAction;
  if (action === 'ignore') ignoreSpellingWord();
  if (action === 'add') addSpellingWordToPersonalDictionary();
});
document.addEventListener('click', () => {
  closeMoreMenu();
  els.codeLangMenu.classList.add('hidden');
  closeMoreFormatMenu();
  closeDocumentActionsMenu();
  closeTextColorMenu();
  closeAccentMenu();
  closeRecentContextMenu();
  closeEditorClipboardMenu();
  closeSpellcheckContextMenu();
});
els.fileList.addEventListener('scroll', closeRecentContextMenu, { passive: true });
window.addEventListener('resize', closeRecentContextMenu);
window.addEventListener('resize', closeEditorClipboardMenu);
window.addEventListener('resize', closeSpellcheckContextMenu);
window.addEventListener('resize', scheduleAutomaticFontScaleRefresh);
window.addEventListener('resize', positionMoreMenu);
window.addEventListener('resize', closeSettingsSubmenus);
window.addEventListener('resize', () => {
  if (!els.diagramDialog.classList.contains('hidden') && isCanvasDiagram() && flowchartDesignerState.mode === 'visual') applyFlowchartZoom();
});
$('.reader-pane').addEventListener('scroll', updateActiveToc, { passive: true });
$('.reader-pane').addEventListener('wheel', handlePreviewWheelZoom, { passive: false });
$('.editor-preview-scroll').addEventListener('wheel', handlePreviewWheelZoom, { passive: false });
$('.editor-preview-scroll').addEventListener('pointermove', showPreviewLocateHint, { passive: true });
$('.editor-preview-scroll').addEventListener('pointerleave', hidePreviewLocateHint);
$('.editor-preview-scroll').addEventListener('scroll', hidePreviewLocateHint, { passive: true });
els.editorPreview.addEventListener('contextmenu', locateEditorFromPreview);
els.editorPreview.addEventListener('dblclick', event => {
  const formula = event.target.closest('.editable-preview-formula');
  if (!formula || !state.editing || !codeEditor) return;
  const previewFormulas = [...els.editorPreview.querySelectorAll('.editable-preview-formula')];
  const sourceFormulas = scanMarkdownFormulas(codeEditor.state.doc.toString());
  const match = sourceFormulas[previewFormulas.indexOf(formula)];
  if (!match) return;
  event.preventDefault();
  openFormulaDialog(match);
});

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
  else if (event.key === 'Escape' && state.compactTocOpen) { event.preventDefault(); setCompactTocOpen(false, true); }
  else if (event.key === 'Escape' && !els.spellcheckContextMenu.classList.contains('hidden')) { closeSpellcheckContextMenu(); focusCodeEditor(); }
  else if (event.key === 'Escape' && !els.editorClipboardMenu.classList.contains('hidden')) { closeEditorClipboardMenu(); focusCodeEditor(); }
  else if (event.key === 'Escape' && !els.recentContextMenu.classList.contains('hidden')) closeRecentContextMenu();
  else if (event.key === 'Escape' && !els.textColorMenu.classList.contains('hidden')) { closeTextColorMenu(); focusCodeEditor(); }
  else if (event.key === 'Escape' && !els.codeLangMenu.classList.contains('hidden')) { els.codeLangMenu.classList.add('hidden'); focusCodeEditor(); }
  else if (event.key === 'Escape' && !els.moreFormatMenu.classList.contains('hidden')) closeMoreFormatMenu(true);
  else if (event.key === 'Escape' && !els.accentMenu.classList.contains('hidden')) { closeAccentMenu(); $('#accentButton').focus(); }
  else if (event.key === 'Escape' && !els.documentActionsMenu.classList.contains('hidden')) { closeDocumentActionsMenu(); els.documentActionsMoreButton.focus(); }
  else if (event.key === 'Escape' && !els.diagramDialog.classList.contains('hidden')) {
    if (els.diagramDialog.classList.contains('diagram-fullscreen')) setDiagramFullscreen(false);
    else closeDiagramDialog();
  }
  else if (event.key === 'Escape' && !els.formulaDialog.classList.contains('hidden')) closeFormulaDialog();
  else if (event.key === 'Escape' && !els.tableDialog.classList.contains('hidden')) closeTableDialog();
  else if (event.key === 'Escape' && !els.imageUploadSettingsDialog.classList.contains('hidden')) closeImageUploadSettings();
  else if (event.key === 'Escape' && !els.imageDialog.classList.contains('hidden')) closeImageDialog();
  else if (event.key === 'Escape' && !els.editPermissionDialog.classList.contains('hidden')) closeEditPermissionDialog();
  else if (event.key === 'Escape' && !els.exportCenterDialog.classList.contains('hidden')) closeExportCenter();
  else if (event.key === 'Escape' && !els.pdfTutorialDialog.classList.contains('hidden')) closePDFTutorial();
  else if (event.key === 'Escape' && !els.updateDialog.classList.contains('hidden')) closeUpdate();
  else if (event.key === 'Escape' && !els.aiReviewDialog.classList.contains('hidden')) closeAIDocumentReview();
  else if (event.key === 'Escape' && !els.aiRewriteDialog.classList.contains('hidden')) closeAIRewrite();
  else if (event.key === 'Escape' && !els.aiSettingsDialog.classList.contains('hidden')) closeAISettings();
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
