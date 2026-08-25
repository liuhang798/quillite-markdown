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
    : resolved({ language: localStorage.getItem('language') || 'zh-CN', recentFiles: [], recentFileStatuses: [], pinnedRecentFiles: [], favoriteFiles: [], favoriteFileStatuses: [], explorerRoot: localStorage.getItem('explorerRoot') || '', usageAnalytics: true }),
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
  setUsageAnalytics: enabled => desktopRuntime ? Backend.SetUsageAnalytics(enabled) : resolved({ usageAnalytics: enabled }),
  reportErrorLog: (source, message, stack) => desktopRuntime ? Backend.ReportErrorLog(source, message, stack) : resolved(),
  getFeedbackSystemInfo: () => desktopRuntime ? Backend.GetFeedbackSystemInfo() : resolved({ appVersion: '2.6.1', os: browserPlatform === 'darwin' ? 'macos' : 'windows', systemVersion: navigator.userAgent }),
  selectFeedbackImages: () => desktopRuntime ? Backend.SelectFeedbackImages() : resolved([]),
  submitFeedback: input => desktopRuntime ? Backend.SubmitFeedback(input) : resolved(),
  checkForUpdates: force => desktopRuntime
    ? Backend.CheckForUpdates(force)
    : resolved(mockUpdate
      ? {
          checked: true,
          available: true,
          currentVersion: '2.4.4',
          latestVersion: '2.6.1',
          releaseName: localStorage.getItem('language') === 'en' ? 'Quillite Markdown 2.6.1' : '轻阅 Markdown 2.6.1',
          releaseNotes: localStorage.getItem('language') === 'en'
            ? 'Added visual table editing, rich paste, and spell checking\nAdded PicGo image hosting with upload progress\nAdded a 12-format Export Center and crisp A4 image pages'
            : '新增可视化表格、富文本粘贴与拼写检查\n新增 PicGo 图床和上传进度\n新增 12 种格式导出中心与 A4 高清图片分页',
          releaseUrl: 'https://qm.ssssa.cn/#download'
        }
      : { checked: true, available: false, currentVersion: '2.6.1', latestVersion: '2.6.1' }),
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
