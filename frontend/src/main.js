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
  selectImage: filePath => desktopRuntime ? Backend.SelectImage(filePath) : resolved(''),
  importImage: (filePath, sourcePath) => desktopRuntime ? Backend.ImportImage(filePath, sourcePath) : resolved(sourcePath),
  savePastedImage: (filePath, dataURL) => desktopRuntime ? Backend.SavePastedImage(filePath, dataURL) : resolved(dataURL),
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
  getFeedbackSystemInfo: () => desktopRuntime ? Backend.GetFeedbackSystemInfo() : resolved({ appVersion: '2.5.2', os: browserPlatform === 'darwin' ? 'macos' : 'windows', systemVersion: navigator.userAgent }),
  selectFeedbackImages: () => desktopRuntime ? Backend.SelectFeedbackImages() : resolved([]),
  submitFeedback: input => desktopRuntime ? Backend.SubmitFeedback(input) : resolved(),
  checkForUpdates: force => desktopRuntime
    ? Backend.CheckForUpdates(force)
    : resolved(mockUpdate
      ? {
          checked: true,
          available: true,
          currentVersion: '2.4.4',
          latestVersion: '2.5.2',
          releaseName: localStorage.getItem('language') === 'en' ? 'Quillite Markdown 2.5.2' : '轻阅 Markdown 2.5.2',
          releaseNotes: localStorage.getItem('language') === 'en'
            ? 'Added feedback and website-backed updates\nAdded Word / PDF export and Save As in the reader\nImproved high-resolution displays, outlines, and editing'
            : '新增意见反馈与官网版本更新\n新增 Word / PDF 导出与阅读页另存为\n优化高分辨率显示、目录树与编辑体验',
          releaseUrl: 'https://qm.ssssa.cn/#download'
        }
      : { checked: true, available: false, currentVersion: '2.5.2', latestVersion: '2.5.2' }),
  snoozeUpdates: days => desktopRuntime ? Backend.SnoozeUpdates(days) : resolved(),
  downloadAndApplyUpdate: () => desktopRuntime ? Backend.DownloadAndApplyUpdate() : resolved(),
  onUpdateProgress: callback => desktopRuntime ? EventsOn('update:progress', callback) : () => {},
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
