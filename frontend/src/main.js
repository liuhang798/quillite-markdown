import './styles.css';
import * as Backend from '../wailsjs/go/main/App.js';
import {
  Environment,
  EventsOn,
  WindowIsFullscreen,
  WindowMinimise,
  WindowToggleMaximise
} from '../wailsjs/runtime/runtime.js';

const desktopRuntime = Boolean(window.go?.main?.App && window.runtime);
const resolved = value => Promise.resolve(value);
const mockUpdate = new URLSearchParams(window.location.search).has('mockUpdate');
const browserRecoveryKey = 'quilliteDocumentRecovery';
const maskBrowserAIKey = value => value.length > 8 ? `${value.slice(0, 4)}••••••••${value.slice(-4)}` : '••••••••';
const browserAIProviders = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
  kimi: { baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3' },
  bailian: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'deepseek-v4-flash' },
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V4-Flash' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
  custom: { baseUrl: 'http://localhost:11434/v1', model: '' }
};
const normalizeBrowserAIProvider = provider => Object.hasOwn(browserAIProviders, provider) ? provider : 'deepseek';
const browserAIKeyName = provider => `aiMaskedApiKey:${normalizeBrowserAIProvider(provider)}`;
const browserAIBaseURLName = provider => `aiBaseURL:${normalizeBrowserAIProvider(provider)}`;
const browserAIModelName = provider => `aiModel:${normalizeBrowserAIProvider(provider)}`;
const browserAISettings = provider => {
  provider = normalizeBrowserAIProvider(provider);
  const maskedApiKey = sessionStorage.getItem(browserAIKeyName(provider)) || '';
  const defaultProvider = normalizeBrowserAIProvider(sessionStorage.getItem('activeAIProvider') || 'deepseek');
  const defaultModel = sessionStorage.getItem('activeAIModel') || browserAIProviders[defaultProvider].model;
  const model = sessionStorage.getItem(browserAIModelName(provider)) || (provider === defaultProvider ? defaultModel : browserAIProviders[provider].model);
  const baseUrl = sessionStorage.getItem(browserAIBaseURLName(provider)) || browserAIProviders[provider].baseUrl;
  return { provider, ...browserAIProviders[provider], baseUrl, model, hasApiKey: Boolean(maskedApiKey), maskedApiKey, isDefault: provider === defaultProvider };
};

const browserPlatform = /Mac|iPhone|iPad/.test(navigator.platform) ? 'darwin' : 'browser';
let platform = browserPlatform;
if (desktopRuntime) {
  try {
    platform = (await Environment()).platform || browserPlatform;
  } catch {
    platform = browserPlatform;
  }
}
document.documentElement.dataset.platform = platform;

window.quilliteMarkdown = {
  newFile: () => desktopRuntime ? Backend.NewFile() : resolved({ path: 'New document.md', name: 'New document.md', directory: '.', content: '' }),
  openFile: () => desktopRuntime ? Backend.OpenFile() : resolved(null),
  openFolder: () => desktopRuntime ? Backend.OpenFolder() : resolved(null),
  readFile: filePath => desktopRuntime ? Backend.ReadFile(filePath) : resolved(null),
  openRecentFile: filePath => desktopRuntime ? Backend.OpenRecentFile(filePath) : resolved(null),
  openReferenceDocument: kind => desktopRuntime ? Backend.OpenReferenceDocument(kind) : resolved(null),
  canEditFile: filePath => desktopRuntime ? Backend.CanEditFile(filePath) : resolved(true),
  saveFile: (filePath, content) => desktopRuntime ? Backend.SaveFile(filePath, content) : resolved(null),
  saveAs: (filePath, content) => desktopRuntime ? Backend.SaveAs(filePath, content) : resolved(null),
  listDocumentVersions: filePath => desktopRuntime ? Backend.ListDocumentVersions(filePath) : resolved([]),
  getDocumentVersion: (filePath, id) => desktopRuntime ? Backend.GetDocumentVersion(filePath, id) : resolved(null),
  saveRecoverySnapshot: input => {
    if (desktopRuntime) return Backend.SaveRecoverySnapshot(input);
    sessionStorage.setItem(browserRecoveryKey, JSON.stringify({ ...input, updatedAt: new Date().toISOString() }));
    return resolved();
  },
  getRecoverySnapshot: () => {
    if (desktopRuntime) return Backend.GetRecoverySnapshot();
    try { return resolved(JSON.parse(sessionStorage.getItem(browserRecoveryKey) || 'null')); }
    catch { return resolved(null); }
  },
  clearRecoverySnapshot: () => {
    if (desktopRuntime) return Backend.ClearRecoverySnapshot();
    sessionStorage.removeItem(browserRecoveryKey);
    return resolved();
  },
  exportDOCX: (filePath, title, renderedHTML) => desktopRuntime ? Backend.ExportDOCX(filePath, title, renderedHTML) : resolved(''),
  exportHTML: (filePath, title, renderedHTML, colorMode, accentColor) => desktopRuntime ? Backend.ExportHTML(filePath, title, renderedHTML, colorMode, accentColor) : resolved(''),
  exportPDF: (filePath, title, renderedHTML, header, footer) => desktopRuntime ? Backend.ExportPDF(filePath, title, renderedHTML, header, footer) : Promise.reject(new Error('PDF_ENGINE_NOT_FOUND')),
  exportPlainHTML: (filePath, title, renderedHTML, header, footer) => desktopRuntime ? Backend.ExportPlainHTML(filePath, title, renderedHTML, header, footer) : resolved(''),
  getExportSettings: () => desktopRuntime ? Backend.GetExportSettings() : resolved({ pandocPath: '', presets: [] }),
  setExportSettings: settings => desktopRuntime ? Backend.SetExportSettings(settings) : resolved(settings),
  detectPandoc: () => desktopRuntime ? Backend.DetectPandoc() : resolved({ available: false, path: '', version: '' }),
  selectPandoc: () => desktopRuntime ? Backend.SelectPandoc() : resolved({ available: false, path: '', version: '' }),
  exportWithPandoc: input => desktopRuntime ? Backend.ExportWithPandoc(input) : resolved(''),
  saveExportImage: (filePath, title, dataURL, format) => desktopRuntime ? Backend.SaveExportImage(filePath, title, dataURL, format) : resolved(''),
  saveExportImageSlices: (filePath, title, format, dataURLs) => desktopRuntime ? Backend.SaveExportImageSlices(filePath, title, format, dataURLs) : resolved(''),
  saveExportImagePages: (filePath, title, format, dataURLs) => desktopRuntime ? Backend.SaveExportImagePages(filePath, title, format, dataURLs) : resolved(dataURLs.map((_, index) => `page-${index + 1}`)),
  selectImage: filePath => desktopRuntime ? Backend.SelectImage(filePath) : resolved(''),
  importImage: (filePath, sourcePath) => desktopRuntime ? Backend.ImportImage(filePath, sourcePath) : resolved(sourcePath),
  savePastedImage: (filePath, dataURL) => desktopRuntime ? Backend.SavePastedImage(filePath, dataURL) : resolved(dataURL),
  getImageUploadSettings: () => desktopRuntime ? Backend.GetImageUploadSettings() : resolved({ mode: 'local', serverUrl: 'http://127.0.0.1:36677', hasSecret: false, hasCloudToken: false }),
  setImageUploadSettings: input => desktopRuntime ? Backend.SetImageUploadSettings(input) : resolved({ mode: ['picgo-cloud', 'picgo'].includes(input?.mode) ? input.mode : 'local', serverUrl: input?.serverUrl || 'http://127.0.0.1:36677', hasSecret: Boolean(input?.secret), hasCloudToken: input?.mode === 'picgo-cloud' }),
  loginPicGoCloud: () => desktopRuntime ? Backend.LoginPicGoCloud() : Promise.reject(new Error('PicGo Cloud sign-in is unavailable in browser preview')),
  logoutPicGoCloud: () => desktopRuntime ? Backend.LogoutPicGoCloud() : resolved({ mode: 'local', serverUrl: 'http://127.0.0.1:36677', hasSecret: false, hasCloudToken: false }),
  testPicGoCloud: () => desktopRuntime ? Backend.TestPicGoCloud() : Promise.reject(new Error('PicGo Cloud is unavailable in browser preview')),
  uploadImageToPicGoCloud: (filePath, imagePath) => desktopRuntime ? Backend.UploadImageToPicGoCloud(filePath, imagePath) : Promise.reject(new Error('PicGo Cloud is unavailable in browser preview')),
  testPicGo: input => desktopRuntime ? Backend.TestPicGo(input) : Promise.reject(new Error('PicGo is unavailable in browser preview')),
  uploadImageToPicGo: (filePath, imagePath) => desktopRuntime ? Backend.UploadImageToPicGo(filePath, imagePath) : Promise.reject(new Error('PicGo is unavailable in browser preview')),
  readImageData: (imagePath, documentDirectory) => desktopRuntime ? Backend.ReadImageData(imagePath, documentDirectory) : resolved(''),
  setDirty: dirty => desktopRuntime ? Backend.SetDirty(dirty) : resolved(),
  listFolder: root => desktopRuntime ? Backend.ListFolder(root) : resolved({ root, files: [] }),
  getPreferences: () => desktopRuntime
    ? Backend.GetPreferences()
    : resolved({ language: localStorage.getItem('language') || 'zh-CN', fontFamily: localStorage.getItem('fontFamily') || 'system', recentFiles: [], recentFileStatuses: [], pinnedRecentFiles: [], favoriteFiles: [], favoriteFileStatuses: [], explorerRoot: localStorage.getItem('explorerRoot') || '', usageAnalytics: true }),
  needsLanguageSelection: () => desktopRuntime ? Backend.NeedsLanguageSelection() : resolved(false),
  removeRecent: filePath => desktopRuntime ? Backend.RemoveRecent(filePath) : resolved(),
  setRecentPinned: (filePath, pinned) => desktopRuntime ? Backend.SetRecentPinned(filePath, pinned) : resolved(),
  reorderPinnedRecent: filePaths => desktopRuntime ? Backend.ReorderPinnedRecent(filePaths) : resolved(),
  addFavorite: filePath => desktopRuntime ? Backend.AddFavorite(filePath) : resolved(),
  removeFavorite: filePath => desktopRuntime ? Backend.RemoveFavorite(filePath) : resolved(),
  getInitialFile: () => desktopRuntime ? Backend.GetInitialFile() : resolved(null),
  getStartupMode: () => desktopRuntime ? Backend.GetStartupMode() : resolved('preview'),
  dirname: filePath => desktopRuntime ? Backend.Dirname(filePath) : resolved(filePath),
  showInFolder: filePath => desktopRuntime ? Backend.ShowInFolder(filePath) : resolved(),
  openExternal: url => desktopRuntime ? Backend.OpenExternal(url) : window.open(url, '_blank', 'noopener,noreferrer'),
  openDefaultApps: () => desktopRuntime ? Backend.OpenDefaultApps() : resolved(),
  print: () => desktopRuntime ? Backend.Print() : window.print(),
  setTheme: dark => desktopRuntime ? Backend.SetTheme(dark) : resolved(),
  setLanguage: language => desktopRuntime ? Backend.SetLanguage(language) : resolved(),
  setFontFamily: fontFamily => desktopRuntime ? Backend.SetFontFamily(fontFamily) : resolved(fontFamily),
  setUsageAnalytics: enabled => desktopRuntime ? Backend.SetUsageAnalytics(enabled) : resolved({ usageAnalytics: enabled }),
  getAISettings: () => desktopRuntime ? Backend.GetAISettings() : resolved(browserAISettings(sessionStorage.getItem('activeAIProvider') || 'deepseek')),
  getAIProviderSettings: provider => desktopRuntime ? Backend.GetAIProviderSettings(provider) : resolved(browserAISettings(provider)),
  setAISettings: input => {
    if (desktopRuntime) return Backend.SetAISettings(input);
    const provider = normalizeBrowserAIProvider(input?.provider);
    const keyName = browserAIKeyName(provider);
    if (input?.clearApiKey) sessionStorage.removeItem(keyName);
    else if (input?.apiKey) {
      sessionStorage.setItem(keyName, maskBrowserAIKey(input.apiKey.trim()));
    }
    if (!input?.clearApiKey && (input?.apiKey || sessionStorage.getItem(keyName))) {
      sessionStorage.setItem(browserAIBaseURLName(provider), input?.baseUrl || browserAIProviders[provider].baseUrl);
      sessionStorage.setItem(browserAIModelName(provider), input?.model || browserAIProviders[provider].model);
      sessionStorage.setItem('activeAIProvider', provider);
      sessionStorage.setItem('activeAIModel', input?.model || browserAIProviders[provider].model);
    }
    return resolved(browserAISettings(provider));
  },
  setDefaultAIProvider: (provider, model) => {
    if (desktopRuntime) return Backend.SetDefaultAIProvider(provider, model);
    provider = normalizeBrowserAIProvider(provider);
    if (!sessionStorage.getItem(browserAIKeyName(provider))) return Promise.reject(new Error('Save an API key before making this provider the default.'));
    sessionStorage.setItem('activeAIProvider', provider);
    sessionStorage.setItem('activeAIModel', model || browserAIProviders[provider].model);
    sessionStorage.setItem(browserAIModelName(provider), model || browserAIProviders[provider].model);
    return resolved(browserAISettings(provider));
  },
  listAIModels: provider => desktopRuntime
    ? Backend.ListAIModels(provider)
    : resolved([browserAISettings(provider).model, browserAIProviders[normalizeBrowserAIProvider(provider)].model]),
  discoverAIModels: input => desktopRuntime
    ? Backend.DiscoverAIModels(input)
    : resolved(input?.provider === 'custom'
      ? ['vendor/chat-model', 'vendor/reasoning-model']
      : [browserAISettings(input?.provider).model, browserAIProviders[normalizeBrowserAIProvider(input?.provider)].model].filter(Boolean)),
  diagnoseAIProvider: input => desktopRuntime
    ? Backend.DiagnoseAIProvider(input)
    : resolved({ success: true, models: [input?.model].filter(Boolean), checks: [
      { code: 'endpoint', status: 'success', message: 'The API base URL is valid' },
      { code: 'credential', status: 'success', message: 'An API key is available for this check' },
      { code: 'models', status: 'success', message: 'Loaded compatible text models', durationMs: 12 },
      { code: 'chat', status: 'success', message: 'The selected model completed a chat request', durationMs: 24 }
    ] }),
  testAIProviderConnection: (provider, model) => desktopRuntime ? Backend.TestAIProviderConnection(provider, model) : resolved(),
  testAIConnection: () => desktopRuntime ? Backend.TestAIConnection() : resolved(),
  rewriteWithAI: input => desktopRuntime ? Backend.RewriteWithAI(input) : resolved({ text: input?.text || `# AI generated content\n\n${input?.instruction || ''}`.trim() }),
  reviewDocumentWithAI: input => desktopRuntime
    ? Backend.ReviewDocumentWithAI(input)
    : resolved({ suggestions: input?.text?.includes('重复重复') ? [{ id: 'suggestion-1', category: 'spelling', severity: 'medium', original: '重复重复', replacement: '重复', reason: '删除重复词', occurrence: 1 }] : [] }),
  cancelAIRewrite: () => desktopRuntime ? Backend.CancelAIRewrite() : resolved(),
  cancelAIDocumentReview: () => desktopRuntime ? Backend.CancelAIDocumentReview() : resolved(),
  onAIRewriteChunk: callback => desktopRuntime ? EventsOn('ai:rewrite-chunk', callback) : () => {},
  onAIProgress: callback => desktopRuntime ? EventsOn('ai:progress', callback) : () => {},
  reportErrorLog: (source, message, stack) => desktopRuntime ? Backend.ReportErrorLog(source, message, stack) : resolved(),
  getFeedbackSystemInfo: () => desktopRuntime ? Backend.GetFeedbackSystemInfo() : resolved({ appVersion: '2.7.3', os: browserPlatform === 'darwin' ? 'macos' : 'windows', systemVersion: navigator.userAgent }),
  selectFeedbackImages: () => desktopRuntime ? Backend.SelectFeedbackImages() : resolved([]),
  submitFeedback: input => desktopRuntime ? Backend.SubmitFeedback(input) : resolved(),
  checkForUpdates: force => desktopRuntime
    ? Backend.CheckForUpdates(force)
    : resolved(mockUpdate
      ? {
          checked: true,
          available: true,
          currentVersion: '2.4.4',
          latestVersion: '2.7.3',
          releaseName: localStorage.getItem('language') === 'en' ? 'Quillite Markdown 2.7.3' : '轻阅 Markdown 2.7.3',
          releaseNotes: localStorage.getItem('language') === 'en'
            ? 'Added visual table editing, rich paste, and spell checking\nAdded PicGo image hosting with upload progress\nAdded a 12-format Export Center and crisp A4 image pages'
            : '新增可视化表格、富文本粘贴与拼写检查\n新增 PicGo 图床和上传进度\n新增 12 种格式导出中心与 A4 高清图片分页',
          releaseUrl: 'https://qm.ssssa.cn/#download'
        }
      : { checked: true, available: false, currentVersion: '2.7.3', latestVersion: '2.7.3' }),
  snoozeUpdates: days => desktopRuntime ? Backend.SnoozeUpdates(days) : resolved(),
  downloadAndApplyUpdate: () => desktopRuntime ? Backend.DownloadAndApplyUpdate() : resolved(),
  onUpdateProgress: callback => desktopRuntime ? EventsOn('update:progress', callback) : () => {},
  onImageUploadProgress: callback => desktopRuntime ? EventsOn('image-upload:progress', callback) : () => {},
  pathForFile: file => file?.path || '',
  onOpenFile: callback => desktopRuntime ? EventsOn('file:open-from-main', callback) : () => {},
  onFileDrop: callback => {
    if (window.runtime?.OnFileDrop) {
      window.runtime.OnFileDrop((_x, _y, paths) => callback(paths || []), false);
    }
  },
  isWindowFullscreen: () => desktopRuntime ? WindowIsFullscreen() : resolved(Boolean(document.fullscreenElement)),
  minimiseWindow: () => desktopRuntime && WindowMinimise(),
  toggleMaximiseWindow: () => desktopRuntime && WindowToggleMaximise(),
  closeWindow: () => desktopRuntime && Backend.RequestQuit()
};

await import('./renderer.js');
