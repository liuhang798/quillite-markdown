import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const renderer = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('opening an existing recent document updates it in place', () => {
  assert.match(renderer, /applyRecentPartition\(upsertRecentFile\([\s\S]*state\.recentFiles,[\s\S]*state\.pinnedRecentFiles,[\s\S]*recentEntry\(doc\)/);
  assert.doesNotMatch(renderer, /\[recentEntry\(doc\), \.\.\.state\.recentFiles\.filter/);
});

test('recent documents show their source directory instead of a generic recently opened label', () => {
  assert.match(renderer, /directory: doc\.directory \|\| directoryFromDocumentPath\(doc\.path\)/);
  assert.match(renderer, /: \(file\.directory \|\| directoryFromDocumentPath\(file\.path\)\)/);
  assert.match(renderer, /<small title="\$\{escapeHtml\(sub\)\}">\$\{escapeHtml\(sub\)\}<\/small>/);
});

test('missing recent and favorite documents stay visible but cannot be opened', () => {
  assert.match(renderer, /const missing = state\.sidebarMode !== 'explorer' && file\.exists === false/);
  assert.match(renderer, /file-row\$\{pinned \? ' pinned' : ''\}\$\{missing \? ' missing' : ''\}/);
  assert.match(renderer, /aria-disabled="true" data-missing="true" title=.*recentMissingTitle/);
  assert.match(renderer, /if \(button\.dataset\.missing === 'true'\) return/);
  assert.match(renderer, /recentMissingAria/);
  assert.match(renderer, /refreshLibraryFileStatuses\(\)/);
  assert.match(styles, /\.file-row\.missing \.file-copy strong \{[^}]*text-decoration: line-through/);
});

test('documents removed outside the app become unavailable without software-error reporting loops', () => {
  assert.match(renderer, /import \{[^}]*isMissingDocumentError[^}]*\} from '\.\/library-state\.js'/);
  assert.match(renderer, /async function loadFile\(filePath\)[\s\S]*if \(isMissingDocumentError\(error\)\) \{[\s\S]*await refreshLibraryFileStatuses\(\);[\s\S]*return;[\s\S]*reportSilentError\(error, 'document\.open'\)/);
  assert.match(renderer, /async function editRecentDocument\(filePath\)[\s\S]*if \(isMissingDocumentError\(error\)\) \{[\s\S]*await refreshLibraryFileStatuses\(\);[\s\S]*return;[\s\S]*reportSilentError\(error, 'document\.open-recent'\)/);
  assert.match(renderer, /missingCurrentFilePath = requestedPath;[\s\S]*await refreshLibraryFileStatuses\(\);[\s\S]*if \(firstMissingNotice\) showToast\(t\('currentDocumentMissing'\), 'warning'\);[\s\S]*return;[\s\S]*reportSilentError\(error, 'document\.refresh'\)/);
});

test('macOS recent documents recover protected-folder access through a user-authorized open panel', () => {
  assert.match(mainSource, /openRecentFile: filePath => desktopRuntime \? Backend\.OpenRecentFile\(filePath\)/);
  assert.match(renderer, /async function loadFile\(filePath\)[\s\S]*window\.quilliteMarkdown\.openRecentFile\(filePath\)/);
  assert.match(renderer, /async function editRecentDocument\(filePath\)[\s\S]*window\.quilliteMarkdown\.openRecentFile\(filePath\)/);
  assert.match(renderer, /if \(isMacAccessNotGrantedError\(error\)\) \{[\s\S]*showToast\(t\('macAccessNotGranted'\), 'warning'\);[\s\S]*return;/);
});

test('file-association opens are subscribed before startup and protect unsaved changes', () => {
  const listenerIndex = renderer.indexOf('window.quilliteMarkdown.onOpenFile(doc =>');
  const initializeIndex = renderer.indexOf('initialize();', listenerIndex);
  assert.ok(listenerIndex >= 0 && initializeIndex > listenerIndex);
  assert.match(renderer, /window\.quilliteMarkdown\.onOpenFile\(doc => \{\s*if \(!doc\?\.path \|\| !maybeDiscardChanges\(\)\) return;/);
});

test('an occupied export target is explained without uploading a software error', () => {
  assert.match(renderer, /function isExportFileInUseError\(error\)[\s\S]*message\.includes\('EXPORT_FILE_IN_USE'\)/);
  assert.match(renderer, /function reportSilentError\(error, source = 'frontend'\) \{[\s\S]*if \(isExportFileInUseError\(error\)\) return;/);
  assert.match(renderer, /async function exportWordDocument\(\)[\s\S]*catch \(error\) \{\s*if \(isExportFileInUseError\(error\)\) \{\s*showToast\(t\('exportFileInUse'\), 'warning'\);\s*return;/);
  assert.match(renderer, /async function exportHTMLDocument\(\)[\s\S]*catch \(error\) \{\s*if \(isExportFileInUseError\(error\)\) \{\s*showToast\(t\('exportFileInUse'\), 'warning'\);\s*return;/);
  assert.match(renderer, /exportFileInUse: '导出文件正被其他程序占用/);
  assert.match(renderer, /exportFileInUse: 'The export file is open in another app/);
});

test('library rows use their full width and remove recent records from the context menu only', () => {
  assert.doesNotMatch(renderer, /class="recent-remove"/);
  assert.doesNotMatch(renderer, /querySelectorAll\('\.recent-remove'\)/);
  assert.doesNotMatch(styles, /\.recent-remove/);
  assert.match(styles, /\.file-item \{[^}]*padding: 9px 10px;/);
  assert.match(html, /data-recent-action="remove"/);
});

test('right-clicking any library document opens an action menu', () => {
  assert.match(html, /id="recentContextMenu"/);
  assert.match(html, /data-recent-action="edit"/);
  assert.match(html, /data-recent-action="save-as"/);
  assert.match(html, /data-recent-action="favorite"/);
  assert.match(html, /data-recent-action="reveal"/);
  assert.match(html, /data-recent-action="remove"/);
  assert.match(renderer, /els\.fileList\.querySelectorAll\('\.file-row'\)/);
  assert.match(renderer, /addEventListener\('contextmenu', event =>/);
  assert.match(renderer, /openRecentContextMenu\(event, decodeURIComponent\(row\.dataset\.path\), row\.classList\.contains\('missing'\)\)/);
  assert.match(renderer, /const favoriteRemoval = button\.dataset\.recentAction === 'favorite' && isFavorite/);
  assert.doesNotMatch(renderer, /contextmenu[\s\S]{0,250}revealFileInFolder\(decodeURIComponent/);
});

test('document context menu edits, favorites, reveals, or removes the selected document', () => {
  assert.match(renderer, /if \(action === 'edit'\) await editRecentDocument\(filePath\)/);
  assert.match(renderer, /else if \(action === 'save-as'\) await saveLibraryDocumentAs\(filePath\)/);
  assert.match(renderer, /else if \(action === 'favorite'\) await setFavoriteRecord\(filePath/);
  assert.match(renderer, /else if \(action === 'reveal'\) await revealFileInFolder\(filePath\)/);
  assert.match(renderer, /else if \(action === 'remove'\) await removeRecentRecord\(filePath\)/);
  assert.match(renderer, /async function editRecentDocument\(filePath\)[\s\S]*window\.quilliteMarkdown\.openRecentFile\(filePath\)[\s\S]*await toggleEditor\(true\)/);
  assert.match(renderer, /async function saveLibraryDocumentAs\(filePath, \{ editAfterSave = false \} = \{\}\)[\s\S]*window\.quilliteMarkdown\.saveAs\(source\.path, source\.content\)[\s\S]*displayDocument\(saved\)/);
  assert.match(renderer, /await window\.quilliteMarkdown\.showInFolder\(filePath\)/);
  assert.match(styles, /\.recent-context-menu \{[^}]*right: auto;[^}]*width: 190px;/);
});

test('favorite documents show a persistent theme-colored marker in every library view', () => {
  assert.match(renderer, /const favorited = state\.favoriteFiles\.some\(favorite => sameDocumentPath\(favorite\.path, file\.path\)\)/);
  assert.match(renderer, /class="file-title-line"/);
  assert.match(renderer, /class="favorite-marker"/);
  assert.match(renderer, /class="file-title-line">\$\{pinMarker\}\$\{favoriteMarker\}<strong>/);
  assert.match(renderer, /title="\$\{escapeHtml\(t\('favorited'\)\)\}"/);
  assert.match(styles, /\.favorite-marker \{[^}]*color: var\(--accent-strong\);/);
  assert.match(styles, /\.favorite-marker svg \{[^}]*fill: currentColor;/);
});

test('recent pins render in persistent groups and stay independent from favorite markers', () => {
  assert.match(mainSource, /setRecentPinned: \(filePath, pinned\) => desktopRuntime \? Backend\.SetRecentPinned\(filePath, pinned\)/);
  assert.match(mainSource, /reorderPinnedRecent: filePaths => desktopRuntime \? Backend\.ReorderPinnedRecent\(filePaths\)/);
  assert.match(renderer, /pinnedRecentFiles: \[\]/);
  assert.match(renderer, /partitionRecentFiles\([\s\S]*prefs\.pinnedRecentFiles \|\| \[\]/);
  assert.match(renderer, /class="recent-file-group pinned-file-group"[\s\S]*data-pinned-list/);
  assert.match(renderer, /const ordinaryGroup = `<div class="recent-file-group ordinary-file-group"/);
  assert.match(renderer, /\$\{pinHandle\}<button class="file-item/);
  assert.match(renderer, /\$\{pinMarker\}\$\{favoriteMarker\}<strong>/);
  assert.match(styles, /\.pin-marker svg \{[^}]*stroke: currentColor;/);
  assert.match(styles, /\.pin-drag-handle svg \{[^}]*fill: currentColor;[^}]*stroke: none;/);
});

test('pinned recents support menu toggles, pointer and keyboard reordering, and failure recovery', () => {
  assert.match(html, /data-recent-action="pin"/);
  assert.match(renderer, /pinButton\.dataset\.pinState = isPinned \? 'remove' : 'add'/);
  assert.match(renderer, /const pinRemoval = button\.dataset\.recentAction === 'pin' && isPinned/);
  assert.match(renderer, /action === 'pin'\) await setRecentPinnedRecord\(filePath, button\.dataset\.pinState === 'add'\)/);
  assert.match(renderer, /const PIN_DRAG_THRESHOLD = 6/);
  assert.match(renderer, /const PIN_AUTO_SCROLL_EDGE = 44/);
  assert.match(renderer, /const PIN_AUTO_SCROLL_MAX_SPEED = 18/);
  assert.match(renderer, /const captureTarget = els\.fileList/);
  assert.match(renderer, /drag\.captureTarget\.setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(renderer, /window\.removeEventListener\('pointermove', handlePinnedPointerMove\)/);
  assert.match(renderer, /drag\.captureTarget\.hasPointerCapture\?\.\(drag\.pointerId\)/);
  assert.match(renderer, /const container = row\.closest\('\[data-pinned-list\]'\)/);
  assert.match(renderer, /row\.addEventListener\('pointerdown', beginPinnedPointerReorder\)/);
  assert.match(renderer, /suppressPinnedFileClickPath = drag\.filePath/);
  assert.match(renderer, /sameDocumentPath\(suppressPinnedFileClickPath, filePath\)/);
  assert.match(renderer, /drag\.container\.insertBefore\(drag\.row, insertionPoint \|\| null\)/);
  assert.match(renderer, /const visibleTop = Math\.max\(listRect\.top, pinnedRect\.top\)/);
  assert.match(renderer, /const visibleBottom = Math\.min\(listRect\.bottom, pinnedRect\.bottom\)/);
  assert.match(renderer, /els\.fileList\.scrollTop \+= velocity/);
  assert.match(renderer, /requestAnimationFrame\(\(\) => runPinnedAutoScroll\(drag\)\)/);
  assert.match(renderer, /cancelAnimationFrame\(drag\.autoScrollFrame\)/);
  assert.match(renderer, /classList\.add\('dragging', 'pin-insertion-position'\)/);
  assert.match(renderer, /classList\.add\('grabbing'\)/);
  assert.match(renderer, /event\.key !== 'ArrowUp' && event\.key !== 'ArrowDown'/);
  assert.match(renderer, /event\.key === 'Escape' && cancelPinnedPointerReorder\(\)/);
  assert.match(renderer, /pinnedOrderPosition: '已将“\{name\}”移到置顶第 \{position\} 项，共 \{total\} 项'/);
  assert.match(renderer, /pinnedOrderPosition: 'Moved “\{name\}” to pinned position \{position\} of \{total\}'/);
  assert.match(renderer, /successAnnouncement: \(\) => \{[\s\S]*position: position \+ 1,[\s\S]*total: state\.pinnedRecentFiles\.length/);
  assert.match(renderer, /if \(announcement\) showToast\(announcement, 'info'\)/);
  assert.match(renderer, /restoreRecentLibrary\(snapshot\)[\s\S]*await refreshLibraryFileStatuses\(\)[\s\S]*showToast\(t\(errorKey\), 'error'\)/);
  assert.match(renderer, /const savedPreferences = await save\(optimistic\.pinnedPaths\)/);
  assert.match(renderer, /const backendStateApplied = syncPinnedPathsFromPreferences\(savedPreferences\)/);
  assert.match(renderer, /expectedState && \(\(!backendStateApplied && !refreshed\) \|\| !expectedState\(\)\)/);
  assert.match(renderer, /expectedState: \(\) => state\.pinnedRecentFiles\.some\(path => sameDocumentPath\(path, filePath\)\) === shouldPin/);
  assert.match(renderer, /noOpKey: shouldPin \? 'pinRecentUnavailable' : 'pinRecentSaveFailed'/);
  assert.match(renderer, /pinRecentUnavailable: '文件已不可用，未能置顶/);
  assert.match(renderer, /pinRecentUnavailable: 'The file is no longer available and was not pinned/);
  assert.match(renderer, /pinRecentSaveFailed: '置顶状态保存失败/);
  assert.match(renderer, /pinRecentSaveFailed: 'Could not save the pinned state/);
  assert.match(styles, /\.pin-drag-handle \{[^}]*opacity: 0;/);
  assert.match(styles, /\.file-row\.pinned \{ display: block; \}/);
  assert.match(styles, /\.file-row\.pinned \.file-item \{[^}]*padding-right: 32px;[^}]*cursor: grab;/);
  assert.match(styles, /\.pin-drag-handle \{[^}]*position: absolute;[^}]*right: 4px;[^}]*top: 50%;[^}]*pointer-events: none;/);
  assert.match(styles, /@media \(hover: none\) \{ \.pin-drag-handle \{ opacity: \.7; \} \}/);
  assert.match(styles, /\.pin-insertion-position::before/);
});

test('reader search includes Markdown inline code and fenced code text', () => {
  assert.match(renderer, /closest\('script, style, mark'\)/);
  assert.doesNotMatch(renderer, /closest\('code, script, style, mark'\)/);
});

test('returning to the app reloads an externally changed document without overwriting local edits', () => {
  assert.match(renderer, /async function refreshCurrentFileFromDisk\(\)/);
  assert.match(renderer, /if \(!state\.currentFile\?\.path \|\| state\.dirty \|\| state\.saving \|\| externalRefreshInProgress\) return/);
  assert.match(renderer, /const refreshed = await window\.quilliteMarkdown\.readFile\(requestedPath\)/);
  assert.match(renderer, /if \(!state\.currentFile \|\| !sameDocumentPath\(state\.currentFile\.path, requestedPath\) \|\| state\.dirty \|\| state\.saving\) return/);
  assert.match(renderer, /window\.addEventListener\('focus', \(\) => \{[\s\S]*scheduleMacWindowModeSync\(\);[\s\S]*refreshCurrentFileFromDisk\(\);[\s\S]*\}\)/);
});

test('document width presets are selectable in the more menu and persist', () => {
  assert.match(html, /class="doc-width-preset-grid" role="group"/);
  assert.match(html, /data-doc-width="narrow"/);
  assert.match(html, /data-doc-width="medium"/);
  assert.match(html, /data-doc-width="wide"/);
  assert.match(html, /data-doc-width="full"/);
  assert.match(html, /role="menuitemradio" data-doc-width="medium"/);
  assert.match(renderer, /docWidth: normalizeDocWidth\(localStorage\.getItem\('docWidth'\)\)/);
  assert.match(renderer, /function normalizeDocWidth\(value\)/);
  assert.match(renderer, /function setDocumentWidth\(level, silent = false\)/);
  assert.match(renderer, /document\.body\.dataset\.docWidth = state\.docWidth/);
  assert.match(renderer, /localStorage\.setItem\('docWidth', state\.docWidth\)/);
  assert.match(renderer, /if \(button\?\.dataset\.docWidth\) setDocumentWidth\(button\.dataset\.docWidth\)/);
  assert.match(renderer, /setDocumentWidth\(state\.docWidth, true\)/);
  assert.match(styles, /\.document-view \{ max-width: var\(--doc-width\)/);
  assert.match(styles, /\.editor-preview-content \{ max-width: var\(--editor-doc-width\)/);
  assert.match(styles, /\.editor-preview-content \{[^}]*font-size: calc\(16px \* var\(--font-scale\)\);/);
  assert.match(styles, /body\[data-doc-width="narrow"\] \{ --doc-width: 640px; --editor-doc-width: 560px; \}/);
  assert.match(styles, /body\[data-doc-width="wide"\] \{ --doc-width: 1100px; --editor-doc-width: 900px; \}/);
  assert.match(styles, /body\[data-doc-width="full"\] \{ --doc-width: 100%; --editor-doc-width: 100%; \}/);
  assert.match(styles, /\.doc-width-preset-grid \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.popover \.doc-width-preset-grid button\.active \{[^}]*border-color:[^}]*background: var\(--accent-soft\);[^}]*color: var\(--accent-strong\);/);
});

test('English settings menu uses larger readable type and extra width', () => {
  assert.match(styles, /html\[lang="en"\] #moreMenu \{ width: 238px; \}/);
  assert.match(styles, /html\[lang="en"\] #moreMenu button \{[^}]*font-size: 13px;[^}]*line-height: 1\.35;/);
  assert.match(styles, /html\[lang="en"\] #moreMenu \.menu-label \{ font-size: 13px; \}/);
  assert.match(styles, /html\[lang="en"\] #moreMenu \.popover-label \{ font-size: 10\.5px; \}/);
});

test('More Formats uses an immediate in-app menu instead of the delayed native macOS selector', () => {
  assert.match(html, /id="moreFormatButton"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(html, /id="moreFormatMenu"[^>]*role="menu"[^>]*aria-labelledby="moreFormatButton"/);
  assert.match(html, /id="overflowFormatOptions"/);
  assert.match(html, /data-format-command="formula-builder"/);
  assert.match(html, /data-format-command="diagram-builder"/);
  assert.doesNotMatch(html, /<select id="moreFormatSelect"/);
  assert.match(renderer, /function openMoreFormatMenu\(\)/);
  assert.match(renderer, /menu\.classList\.remove\('hidden'\);\s*button\.setAttribute\('aria-expanded', 'true'\)/);
  assert.match(renderer, /button\.dataset\.formatCommand = element\.dataset\.formatOverflow/);
  assert.match(renderer, /els\.moreFormatButton\.addEventListener\('click'/);
  assert.match(renderer, /els\.moreFormatMenu\.addEventListener\('keydown'/);
  assert.match(styles, /\.more-format-menu \{[^}]*max-height:[^}]*overflow-y: auto;/);
});

test('plain text files render without Markdown parsing and edit without Markdown syntax highlighting', () => {
  assert.match(renderer, /function isPlainTextFile\(path\)/);
  assert.match(renderer, /return \/\\\.txt\$\/i\.test\(path \|\| ''\)/);
  assert.match(renderer, /if \(isPlainTextFile\(doc\.path\)\) \{\s*container\.innerHTML = `<div class="plain-text">\$\{escapeHtml\(content\)\}<\/div>`;/);
  assert.match(renderer, /const language = isPlainTextFile\(state\.currentFile\?\.path\)\s*\? \[\]\s*: \[markdown\(\), syntaxHighlighting\(markdownHighlightStyle\)\]/);
  assert.doesNotMatch(renderer, /editorExtensions = \[\s*basicSetup,\s*markdown\(\)/);
  assert.match(styles, /\.plain-text \{ white-space: pre-wrap; overflow-wrap: break-word; font-family: "Cascadia Code", Consolas, "Microsoft YaHei UI", monospace;/);
  assert.match(styles, /\.plain-text \{[^}]*font-size: calc\(15px \* var\(--font-scale\)\);/);
});

test('images support links, asset imports, drag and paste, and display scaling', () => {
  assert.match(html, /id="imageDialog"/);
  assert.match(html, /id="imageUrl"/);
  assert.match(html, /id="imageAltInput"/);
  assert.match(html, /id="imageWidth" type="range" min="10" max="100" step="5"/);
  assert.match(html, /id="pickLocalImage"/);
  assert.match(html, /id="confirmImage"/);
  assert.match(html, /img-src 'self' data: file: https: http:/);
  assert.match(renderer, /function openImageDialog\(\)/);
  assert.match(renderer, /function closeImageDialog\(\)/);
  assert.match(renderer, /function insertImageFromUrl\(\)/);
  assert.match(renderer, /if \(!\/\^https\?:\\\/\\\/\\S\+\$\/i\.test\(url\)\)/);
  assert.match(renderer, /function imageMarkdown\(imagePath, description, width = preferredImageWidth\(\)\)/);
  assert.match(renderer, /width="\$\{normalizedWidth\}%">`/);
  assert.match(renderer, /function insertLocalImage\(\)/);
  assert.match(renderer, /window\.quilliteMarkdown\.selectImage\(state\.currentFile\.path\)/);
  assert.match(renderer, /async function importAndInsertImage\(sourcePath, description = ''\)/);
  assert.match(renderer, /window\.quilliteMarkdown\.importImage\(state\.currentFile\.path, sourcePath\)/);
  assert.match(renderer, /window\.quilliteMarkdown\.savePastedImage\(state\.currentFile\.path, await fileAsDataURL\(file\)\)/);
  assert.match(renderer, /codeEditor\.contentDOM\.addEventListener\('paste', handleEditorImagePaste\)/);
  assert.match(renderer, /if \(state\.editing && IMAGE_FILE_PATTERN\.test\(filePath\)\)/);
  assert.match(renderer, /\$\('#pickLocalImage'\)\.addEventListener\('click', \(\) => \{ closeImageDialog\(\); insertLocalImage\(\); \}\)/);
  assert.match(renderer, /els\.imageUrl\.addEventListener\('keydown', event => \{\s*if \(event\.key === 'Enter'\) insertImageFromUrl\(\);/);
  assert.match(mainSource, /importImage: \(filePath, sourcePath\) => desktopRuntime \? Backend\.ImportImage\(filePath, sourcePath\)/);
  assert.match(mainSource, /savePastedImage: \(filePath, dataURL\) => desktopRuntime \? Backend\.SavePastedImage\(filePath, dataURL\)/);
  assert.match(styles, /\.image-dialog-fields input:focus \{ border-color: var\(--accent\);/);
  assert.match(styles, /\.image-width-field input\[type="range"\] \{ height: 24px; padding: 0; border: 0; accent-color: var\(--accent-strong\);/);
});

test('the update dialog offers in-app download and apply with progress', () => {
  assert.match(html, /id="applyUpdate"/);
  assert.match(html, /id="updateProgress"/);
  assert.match(html, /id="updateProgressBar"/);
  assert.match(html, /id="updateProgressLabel"/);
  assert.match(renderer, /async function startDownloadAndUpdate\(\)/);
  assert.match(renderer, /await window\.quilliteMarkdown\.downloadAndApplyUpdate\(\)/);
  assert.match(renderer, /window\.quilliteMarkdown\.onUpdateProgress\(progress =>/);
  assert.match(renderer, /\$\('#applyUpdate'\)\.addEventListener\('click', startDownloadAndUpdate\)/);
  assert.match(renderer, /platform !== 'darwin' && platform !== 'windows'/);
  assert.match(renderer, /state\.dirty && state\.currentFile\?\.path\) \{\s*await saveDocument\(false, \{ auto: true, silent: true \}\)/);
  assert.match(renderer, /setTimeout\(\(\) => window\.quilliteMarkdown\.closeWindow\(\), 500\)/);
  assert.match(styles, /\.update-progress-bar \{ height: 100%; width: 0; border-radius: 4px; background: var\(--accent-strong\);/);
  assert.match(renderer, /openExternal\('https:\/\/qm\.ssssa\.cn\/#download'\)/);
  assert.match(mainSource, /releaseUrl: 'https:\/\/qm\.ssssa\.cn\/#download'/);
  assert.doesNotMatch(mainSource, /github\.com\/liuhang798\/quillite-markdown\/releases/);
});

test('Word, HTML, and PDF export are available from the document menu', () => {
  assert.match(html, /data-action="export-word"/);
  assert.match(html, /data-action="export-html"/);
  assert.match(html, /data-action="export-pdf"/);
  assert.match(html, /data-i18n="exportWord"/);
  assert.match(html, /data-i18n="exportPDF"/);
  assert.match(mainSource, /exportDOCX: \(filePath, title, renderedHTML\) => desktopRuntime \? Backend\.ExportDOCX\(filePath, title, renderedHTML\)/);
  assert.match(mainSource, /exportHTML: \(filePath, title, renderedHTML, colorMode, accentColor\) => desktopRuntime \? Backend\.ExportHTML\(filePath, title, renderedHTML, colorMode, accentColor\)/);
  assert.match(renderer, /async function exportWordDocument\(\)/);
  assert.match(renderer, /async function exportHTMLDocument\(\)/);
  assert.match(renderer, /cleanRenderedHTMLForExport\(container\)/);
  assert.match(renderer, /formula\.setAttribute\('data-math-source', encodeURIComponent\(annotation\.textContent\.trim\(\)\)\)/);
  assert.match(renderer, /const mathOnly = math\.cloneNode\(true\)/);
  assert.match(renderer, /mathOnly\.querySelectorAll\('annotation, annotation-xml'\)/);
  assert.match(renderer, /\[mathOnly, \.\.\.mathOnly\.querySelectorAll\('semantics'\)\]/);
  assert.match(renderer, /child\.nodeType === 3 && child\.textContent\.trim\(\)/);
  assert.match(renderer, /formula\.replaceChildren\(mathOnly\)/);
  assert.match(renderer, /formula\.replaceChildren\(\)/);
  assert.match(renderer, /if \(action === 'export-word'\) exportWordDocument\(\)/);
  assert.match(renderer, /if \(action === 'export-html'\) exportHTMLDocument\(\)/);
  assert.match(html, /id="pdfTutorialDialog"/);
  assert.match(html, /Microsoft Print to PDF/);
  assert.match(html, /data-i18n="pdfSaveAsPDF"/);
  assert.match(renderer, /function exportPDFDocument\(\)[\s\S]*openPDFTutorial\(\)/);
  assert.match(renderer, /async function confirmPDFExport\(\)[\s\S]*if \(state\.editing\) toggleEditor\(false\)[\s\S]*window\.quilliteMarkdown\.print\(\)/);
  assert.match(renderer, /\$\('#confirmPDFTutorial'\)\.addEventListener\('click', confirmPDFExport\)/);
  assert.match(renderer, /if \(action === 'export-pdf'\) exportPDFDocument\(\)/);
  assert.match(styles, /html\[data-platform="darwin"\] \.pdf-tutorial-windows \{ display: none; \}/);
  assert.match(styles, /html\[data-platform="darwin"\] \.pdf-tutorial-macos \{ display: block; \}/);
  assert.match(styles, /@media print \{[\s\S]*\.toast, \.popover, \.pane-resizer \{ display: none !important; \}/);
});

test('reader header exposes responsive Word, HTML, and PDF export actions', () => {
  assert.match(html, /id="closePreviewButton" class="text-button close-preview-button"/);
  assert.match(html, /id="documentSaveAsButton"[^>]*data-document-action="save-as"[^>]*data-i18n="saveAs"/);
  assert.match(html, /id="documentExportWordButton"[^>]*data-document-action="export-word"[^>]*data-i18n="exportWord"/);
  assert.match(html, /id="documentExportHTMLButton"[^>]*data-document-action="export-html"[^>]*data-i18n="exportHTML"/);
  assert.match(html, /id="documentExportPDFButton"[^>]*data-document-action="export-pdf"[^>]*data-i18n="exportPDF"/);
  assert.match(html, /id="documentActionsMoreButton"[^>]*aria-haspopup="menu"[^>]*data-i18n="moreDocumentActions"/);
  assert.match(html, /id="documentActionsMenu"[^>]*role="menu"[\s\S]*data-document-action="save-as"[\s\S]*data-document-action="export-word"[\s\S]*data-document-action="export-html"[\s\S]*data-document-action="export-pdf"[\s\S]*data-document-action="print"/);
  assert.match(styles, /\.document-meta \{[^}]*container-type: inline-size;/);
  assert.match(styles, /\.text-button\.close-preview-button \{ color: var\(--accent-strong\); \}/);
  assert.match(styles, /@container \(max-width: 720px\) \{[\s\S]*\.document-actions > \.document-action-collapsible \{ display: none; \}[\s\S]*\.document-actions-more \{ display: block; \}/);
  assert.match(renderer, /function runDocumentHeaderAction\(action\)[\s\S]*action === 'save-as'[\s\S]*saveLibraryDocumentAs\(state\.currentFile\.path\)[\s\S]*action === 'export-word'\) exportWordDocument\(\)[\s\S]*action === 'export-html'\) exportHTMLDocument\(\)[\s\S]*action === 'export-pdf'\) exportPDFDocument\(\)[\s\S]*action === 'print'/);
  assert.match(renderer, /els\.documentActions\.addEventListener\('click', event =>[\s\S]*documentActionsMenu\.classList\.toggle\('hidden', !opening\)[\s\S]*runDocumentHeaderAction\(actionButton\.dataset\.documentAction\)/);
  assert.match(renderer, /function closeDocumentActionsMenu\(\)[\s\S]*aria-expanded', 'false'/);
});

test('unwritable documents explain the cause and offer Save Copy and Edit without repeating failed autosaves', () => {
  assert.match(mainSource, /canEditFile: filePath => desktopRuntime \? Backend\.CanEditFile\(filePath\) : resolved\(true\)/);
  assert.match(renderer, /const requestedPath = state\.currentFile\.path;[\s\S]*canEdit = await window\.quilliteMarkdown\.canEditFile\(requestedPath\)/);
  assert.match(renderer, /if \(!canEdit\) \{[\s\S]*state\.saveAsRequired = true;[\s\S]*openEditPermissionDialog\(\);[\s\S]*return;/);
  assert.match(html, /id="editPermissionDialog"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /data-i18n="permissionReasonCache"/);
  assert.match(html, /data-i18n="permissionReasonReadOnly"/);
  assert.match(html, /data-i18n="permissionReasonLocked"/);
  assert.match(html, /id="saveCopyAndEdit"[^>]*data-i18n="saveCopyAndEdit"/);
  assert.match(renderer, /function openEditPermissionDialog\(\)[\s\S]*editPermissionFileName\.textContent = state\.currentFile\?\.name[\s\S]*editPermissionDialog\.classList\.remove\('hidden'\)/);
  assert.match(renderer, /async function savePermissionCopyAndEdit\(\)[\s\S]*saveLibraryDocumentAs\(filePath, \{ editAfterSave: true \}\)/);
  assert.match(renderer, /async function saveLibraryDocumentAs\(filePath, \{ editAfterSave = false \} = \{\}\)[\s\S]*if \(editAfterSave\) await toggleEditor\(true\)/);
  assert.match(renderer, /\$\('#saveCopyAndEdit'\)\.addEventListener\('click', savePermissionCopyAndEdit\)/);
  assert.match(styles, /\.edit-permission-reasons \{[^}]*border-left: 3px solid var\(--accent\);[^}]*background: var\(--accent-soft\);/);
  assert.match(renderer, /if \(state\.saveAsRequired && options\.auto\) return;/);
  assert.match(renderer, /if \(state\.saveAsRequired && !options\.auto\) saveAs = true;/);
  assert.match(renderer, /state\.saveAsRequired = true;/);
  assert.match(renderer, /fallbackToSaveAs = true;/);
  assert.match(renderer, /if \(fallbackToSaveAs\) await saveDocument\(true, options\);/);
  assert.match(renderer, /saveAsRequiredHint: '原文件可能来自微信缓存/);
  assert.match(renderer, /async function refreshLibraryAfterReplacement\(saved\)[\s\S]*if \(!saved\?\.replacedPath\) return;[\s\S]*await refreshLibraryFileStatuses\(\)/);
  assert.match(renderer, /displayDocument\(saved\);\s*await refreshLibraryAfterReplacement\(saved\)/);
  assert.doesNotMatch(renderer, /replacingUnwritableSource|saved\.replacedPath \|\|/);
});

test('the editor header offers an exit editing button', () => {
  assert.match(html, /id="exitEditButton" class="text-button exit-edit-button"/);
  assert.match(html, /data-i18n="exitEdit"/);
  assert.match(renderer, /els\.exitEditButton\.addEventListener\('click', \(\) => \{\s*if \(state\.editing\) toggleEditor\(false\);/);
});

test('editor preview switching handles Ctrl+E once and serializes asynchronous transitions', () => {
  assert.match(renderer, /\{ key: 'Mod-e',[^\n]*stopPropagation: true \}/);
  assert.match(renderer, /document\.addEventListener\('keydown', event => \{\s*if \(event\.defaultPrevented\) return;/);
  assert.match(renderer, /let editorModeSwitching = false;/);
  assert.match(renderer, /async function toggleEditor\(forceEditing\) \{\s*if \(!state\.currentFile \|\| editorModeSwitching\) return;/);
  assert.match(renderer, /editorModeSwitching = true;[\s\S]*try \{[\s\S]*finally \{\s*editorModeSwitching = false;/);
  assert.match(renderer, /const requestedPath = state\.currentFile\.path;[\s\S]*sameDocumentPath\(state\.currentFile\.path, requestedPath\)/);
});

test('code blocks let the user pick a common programming language', () => {
  assert.match(html, /id="codeLangMenu"/);
  assert.match(renderer, /const CODE_LANGUAGES = \[/);
  assert.match(renderer, /\{ value: 'go', label: 'Go' \}/);
  assert.match(renderer, /if \(command === 'code-block'\) \{ openCodeLangMenu\(\); return true; \}/);
  assert.match(renderer, /function insertCodeBlock\(lang = ''\)/);
  assert.match(renderer, /els\.codeLangMenu\.addEventListener\('click', event => \{\s*event\.stopPropagation\(\);/);
  assert.match(renderer, /insertCodeBlock\(button\.dataset\.codeLang\)/);
  assert.match(renderer, /document\.addEventListener\('click', \(\) => \{\s*els\.moreMenu\.classList\.add\('hidden'\);\s*els\.codeLangMenu\.classList\.add\('hidden'\);/);
  assert.match(styles, /\.code-lang-menu \{ right: auto; top: auto;/);
});

test('LaTeX math, chemistry, and numbered equations are available in preview and editor formats', () => {
  assert.match(renderer, /import 'katex\/dist\/katex\.min\.css'/);
  assert.match(renderer, /extensions: \[highlightExtension, \.\.\.mathExtensions\]/);
  assert.match(html, /data-format-command="formula-builder" data-i18n="formulaBuilder"/);
  assert.doesNotMatch(html, /value="(?:inline-math|math-block|chemical-formula|numbered-math|math-guide)"/);
  assert.match(renderer, /command === 'formula-builder'/);
  assert.match(renderer, /MATH_GUIDE_URL = 'https:\/\/qm\.ssssa\.cn\/guides\/formulas\/'/);
  assert.match(html, /id="formulaDialog"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="openFormulaGuide"/);
  assert.match(html, /id="formulaDisciplineTabs"[^>]*role="tablist"/);
  assert.match(html, /id="formulaTemplateList"/);
  assert.match(html, /id="formulaBuilderPanel" class="formula-builder-panel"/);
  assert.match(html, /id="formulaOutputModes"[^>]*role="group"/);
  assert.match(html, /data-formula-mode="inline"/);
  assert.match(html, /data-formula-mode="block"/);
  assert.match(html, /data-formula-mode="numbered"/);
  assert.match(html, /id="formulaFields"/);
  assert.match(html, /id="formulaPreview"/);
  assert.match(renderer, /FORMULA_DISCIPLINES/);
  assert.match(renderer, /formulaTemplatesForDiscipline/);
  assert.match(renderer, /openFormulaDialog\(\)/);
  assert.match(renderer, /buildFormulaMarkdown\(formulaWizardState\.mode, expression/);
  assert.match(renderer, /function chooseFormulaTemplate\(templateId\)[\s\S]*els\.formulaBuilderPanel\.scrollTop = 0;/);
  assert.match(renderer, /function chooseFormulaDiscipline\(discipline\)[\s\S]*els\.formulaBuilderPanel\.scrollTop = 0;/);
  assert.match(html, /data-format-command="formula-builder" data-i18n="formulaBuilder">学科公式 🔥<\/button>/);
  assert.match(renderer, /formulaBuilder: '学科公式 🔥'/);
  assert.match(styles, /\.formula-dialog-layout \{ display: grid;/);
  assert.match(styles, /\.formula-preview \.katex-display \{ width: 100%; margin: 0; \}/);
  assert.match(html, /<textarea id="formulaMarkdownSource"[^>]*data-i18n-aria-label="generatedMarkdown"/);
  assert.match(renderer, /els\.formulaMarkdownSource\.addEventListener\('input', updateFormulaPreviewFromMarkdown\)/);
  assert.match(renderer, /const markdownSource = els\.formulaMarkdownSource\.value\.trim\(\)/);
  assert.match(styles, /\.markdown-body \.math-block \{[^}]*overflow-x: auto;/);
});

test('editor split panes are draggable without a maximum width limit', () => {
  assert.match(html, /id="editorResizer" class="pane-resizer editor-resizer"/);
  assert.match(renderer, /editorPreviewWidth/);
  assert.match(renderer, /setEditorPreviewWidth\(startPercent \+ deltaPercent\)/);
  assert.match(renderer, /Math\.max\(12, Math\.min\(max, Math\.round\(percent\)\)\)/);
  assert.match(renderer, /els\.editorResizer\?\.classList\.toggle\('hidden', !state\.editing\)/);
  assert.match(styles, /\.editor-preview-pane \{ flex: 0 0 var\(--editor-preview-width, 47%\);/);
  assert.match(styles, /\.editor-preview-pane, \.editor-resizer \{ display: none; \}/);
  assert.match(renderer, /localStorage\.setItem\('editorPreviewWidth', String\(state\.editorPreviewWidth\)\)/);
  assert.match(html, /data-i18n-title="resizeEditor"/);
});

test('right-clicking the live preview locates the matching editor source line with a pointer hint', () => {
  assert.match(html, /id="previewLocateHint" class="preview-locate-hint hidden"/);
  assert.match(html, /data-i18n="previewLocateHint"/);
  assert.match(renderer, /function previewBlockAtPointer\(event\)/);
  assert.match(renderer, /function locateEditorFromPreview\(event\)[\s\S]*selection: \{ anchor: line\.from \}[\s\S]*effects: EditorView\.scrollIntoView\(line\.from, \{ y: 'start', yMargin: 12 \}\)/);
  assert.match(renderer, /editorExtensions = \[[\s\S]*scrollPastEnd\(\)/);
  assert.doesNotMatch(renderer, /previewLocated/);
  assert.match(renderer, /els\.editorPreview\.addEventListener\('contextmenu', locateEditorFromPreview\)/);
  assert.match(renderer, /addEventListener\('pointermove', showPreviewLocateHint/);
  assert.match(styles, /\.editor-preview-content \[data-line\] \{ cursor: context-menu; \}/);
  assert.match(styles, /\.preview-locate-hint \{ position: fixed;/);
});

test('normal and exceptional notifications use distinct accessible toast treatments and readable durations', () => {
  assert.match(html, /id="toast" class="toast hidden" data-kind="info" role="status" aria-live="polite"/);
  assert.match(html, /id="closeToast"[\s\S]*data-i18n-title="dismissNotification"/);
  assert.match(renderer, /const durations = \{ success: 3200, info: 3600, warning: 5600, error: 8000 \}/);
  assert.match(renderer, /setAttribute\('role', normalizedKind === 'error' \|\| normalizedKind === 'warning' \? 'alert' : 'status'\)/);
  assert.match(renderer, /\$\('#closeToast'\)\.addEventListener\('click', hideToast\)/);
  assert.match(renderer, /els\.toast\.addEventListener\('mouseenter', \(\) => clearTimeout\(showToast\.timer\)\)/);
  assert.match(styles, /\.toast\[data-kind="success"\]/);
  assert.match(styles, /\.toast\[data-kind="warning"\]/);
  assert.match(styles, /\.toast\[data-kind="error"\]/);
  assert.match(styles, /\.toast:hover \.toast-progress i \{ animation-play-state: paused; \}/);
});

test('sidebar and TOC text respond to the shared global font scale', () => {
  assert.match(styles, /\.file-copy strong \{ font-size: calc\(13px \* var\(--font-scale\)\);/);
  assert.match(styles, /\.file-copy small \{ color: var\(--faint\); font-size: calc\(10\.5px \* var\(--font-scale\)\);/);
  assert.match(styles, /--toc-font-size: calc\(var\(--toc-base-font-size\) \* var\(--toc-font-user-scale\)\);/);
  assert.match(styles, /\.toc a \{[^}]*font-size: var\(--toc-font-size\);/);
  assert.match(renderer, /--toc-font-user-scale', state\.fontScale/);
  assert.match(renderer, /3: Math\.max\(baseFontSize - \.75, 12\.5\)/);
  assert.match(renderer, /4: Math\.max\(baseFontSize - 1\.5, 12\)/);
  assert.match(renderer, /5: Math\.max\(baseFontSize - 2, 11\.5\)/);
  assert.match(renderer, /6: Math\.max\(baseFontSize - 2\.5, 11\)/);
  assert.match(styles, /\.toc-node\.level-3 > \.toc-row a \{ font-size: calc\(var\(--toc-level-3-font-size\) \* var\(--toc-font-user-scale\)\); \}/);
  assert.match(styles, /\.toc-row \{[^}]*grid-template-columns: max\(24px, calc\(var\(--toc-font-size\) \* 1\.55\)\)/);
  assert.match(styles, /\.toc-toggle-placeholder \{[^}]*min-height: max\(30px, calc\(var\(--toc-font-size\) \* 2\)\)/);
  assert.match(styles, /\.toc-toggle svg \{[^}]*width: max\(12px, calc\(var\(--toc-font-size\) \* \.72\)\)/);
  assert.match(styles, /\.toc-panel > \.eyebrow \{ font-size: calc\(var\(--toc-eyebrow-font-size\) \* var\(--toc-font-user-scale\)\); \}/);
  assert.match(styles, /\.toc-panel > small \{[^}]*font-size: calc\(var\(--toc-reading-font-size\) \* var\(--toc-font-user-scale\)\);/);
  assert.match(styles, /\.sidebar-tab \{ [^}]*font-size: calc\(11px \* var\(--font-scale\)\);/);
  assert.match(styles, /\.eyebrow \{ display: block; color: var\(--faint\); font-size: calc\(10px \* var\(--font-scale\)\);/);
  assert.match(styles, /\.sidebar-heading h2 \{ margin: 5px 0 0; font-size: calc\(18px \* var\(--font-scale\)\);/);
});

test('the document outline renders as a persistent collapsible tree', () => {
  assert.match(renderer, /const tree = buildTocTree\(/);
  assert.match(renderer, /data-toc-toggle=/);
  assert.match(renderer, /writeCollapsedToc\(localStorage, state\.currentFile\?\.path, collapsed\)/);
  assert.match(renderer, /scrollDeltaForBounds\(\{[\s\S]*viewportTop,[\s\S]*viewportBottom,/);
  assert.match(renderer, /function scheduleActiveTocRefresh\(\)[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*updateActiveToc\(\)/);
  assert.match(renderer, /function setFontScale\([\s\S]*applyTocDisplayStyles\(\);\s*scheduleActiveTocRefresh\(\)/);
  assert.match(renderer, /function applyPaneWidths\(\)[\s\S]*setEditorPreviewWidth\(state\.editorPreviewWidth\);\s*scheduleActiveTocRefresh\(\)/);
  assert.doesNotMatch(renderer, /panelRect\.top \+ 38|panelRect\.bottom - 34/);
  assert.match(styles, /\.toc-children\.hidden \{ display: none; \}/);
  assert.match(styles, /\.toc-node\.collapsed > \.toc-row \.toc-toggle svg/);
});

test('sidebar and TOC resizers preserve preferred widths while fitting the current viewport', () => {
  assert.match(renderer, /sidebar: \{ min: 120, max: 2000, fallback: 258 \}/);
  assert.match(renderer, /toc: \{ \.\.\.TOC_WIDTH_LIMITS, fallback: initialTocDisplay\.defaultWidth \}/);
  assert.match(renderer, /sidebarPreferredWidth: initialSidebarPreferredWidth/);
  assert.match(renderer, /els\.appShell\.clientWidth - dividerWidth - 240/);
  assert.match(renderer, /fitReaderSidePanels\(\{[\s\S]*sidebarPreferredWidth: state\.sidebarPreferredWidth,[\s\S]*tocPreferredWidth: state\.tocPreferredWidth/);
  assert.match(renderer, /state\.sidebarWidth = fitted\.sidebarWidth;[\s\S]*state\.tocWidth = fitted\.tocWidth/);
  assert.match(renderer, /localStorage\.setItem\('sidebarWidth', String\(state\.sidebarPreferredWidth\)\)/);
  assert.match(renderer, /localStorage\.setItem\('tocWidth', String\(state\.tocPreferredWidth\)\)/);
  assert.match(renderer, /new ResizeObserver\(schedulePaneWidthRefresh\)/);
  assert.match(renderer, /window\.addEventListener\('resize', scheduleTocDisplayRefresh\)/);
  assert.match(renderer, /window\.matchMedia\(`\(resolution: \$\{window\.devicePixelRatio \|\| 1\}dppx\)`\)/);
  assert.match(renderer, /setAttribute\('aria-valuemax', String\(maximumSidebarWidth\)\)/);
  assert.match(renderer, /setAttribute\('aria-valuemax', String\(maximumTocWidth\)\)/);
  assert.match(renderer, /function paneResizeSnapshot\(panelName\)[\s\S]*effectiveWidth:[\s\S]*preferredWidth:[\s\S]*tocWidthCustomized:/);
  assert.match(renderer, /function resizePaneFromEffectiveWidth\(panelName, width, snapshot\)[\s\S]*effectiveWidth !== snapshot\.effectiveWidth[\s\S]*restorePaneResizeSnapshot\(panelName, snapshot\)/);
  assert.match(renderer, /const resizeSnapshot = paneResizeSnapshot\(panelName\);\s*const startWidth = resizeSnapshot\.effectiveWidth;\s*let changed = false;/);
  assert.match(renderer, /changed = resizePaneFromEffectiveWidth\(panelName, startWidth \+ delta, resizeSnapshot\)/);
  assert.match(renderer, /if \(changed\) persistPaneWidth\(panelName\)/);
  assert.match(renderer, /if \(resizePaneFromEffectiveWidth\(panelName, resizeSnapshot\.effectiveWidth \+ change, resizeSnapshot\)\) \{\s*persistPaneWidth\(panelName\)/);
  assert.match(renderer, /const startPercent = state\.editorPreviewWidth;\s*let changed = false;/);
  assert.match(renderer, /if \(changed\) localStorage\.setItem\('editorPreviewWidth', String\(state\.editorPreviewWidth\)\)/);
  assert.match(html, /aria-valuemax="2000"/);
});

test('TOC display metrics are polled while visible so same-DPR monitor moves are detected', () => {
  assert.match(renderer, /let lastTocDisplaySignature = tocDisplaySignature\(currentDisplay\(\)\)/);
  assert.match(renderer, /function detectTocDisplayChange\(\) \{[\s\S]*document\.visibilityState === 'hidden'[\s\S]*signature === lastTocDisplaySignature[\s\S]*scheduleTocDisplayRefresh\(\)/);
  assert.match(renderer, /window\.setInterval\(detectTocDisplayChange, 1500\)/);
  assert.match(renderer, /document\.addEventListener\('visibilitychange', detectTocDisplayChange\)/);
});

test('back-to-top follows the resized TOC while keeping a safe gap from the document scrollbar', () => {
  assert.match(styles, /\.back-to-top \{[^}]*right: calc\(var\(--toc-width\) \+ 24px\);/);
  assert.match(styles, /body:has\(\.toc-panel\.hidden\) \.back-to-top \{ right: 24px; \}/);
  assert.doesNotMatch(styles, /body\[data-doc-width="full"\][^{]*\.back-to-top/);
  assert.match(styles, /@media \(max-width: 1120px\)[\s\S]*\.back-to-top \{ right: 24px; \}/);
});

test('feedback dialog collects optional contact details, images, and automatic environment information', () => {
  assert.match(html, /data-action="feedback"/);
  assert.match(html, /id="feedbackDialog"[\s\S]*name="feedbackCategory" value="feature"[\s\S]*name="feedbackCategory" value="bug"/);
  assert.match(html, /id="feedbackEmail" type="email"/);
  assert.match(html, /id="feedbackPhone" type="tel"/);
  assert.match(html, /id="selectFeedbackImages"/);
  assert.match(html, /id="feedbackAppVersion"[\s\S]*id="feedbackSystemVersion"/);
  assert.match(mainSource, /getFeedbackSystemInfo:[\s\S]*Backend\.GetFeedbackSystemInfo/);
  assert.match(mainSource, /selectFeedbackImages:[\s\S]*Backend\.SelectFeedbackImages/);
  assert.match(mainSource, /submitFeedback:[\s\S]*Backend\.SubmitFeedback/);
  assert.match(renderer, /window\.quilliteMarkdown\.submitFeedback\(\{[\s\S]*category:[\s\S]*message,[\s\S]*email:[\s\S]*phone:[\s\S]*imagePaths:/);
  assert.match(renderer, /feedbackPrivacy: '提交后，以上反馈内容、联系方式、所选图片及版本信息将发送到轻阅官网服务器；服务器会记录请求 IP 并解析所在城市，不会上传当前文档。'/);
});

test('feedback disclosure explains server-side IP and city collection', () => {
  assert.match(html, /data-i18n="feedbackPrivacy">[^<]*记录请求 IP 并解析所在城市/);
  assert.match(renderer, /feedbackPrivacy: '提交后[^']*记录请求 IP 并解析所在城市[^']*不会上传当前文档。'/);
  assert.match(renderer, /feedbackPrivacy: 'Submitting[^']*records the request IP and resolves its city[^']*never uploaded.'/);
});

test('product improvement checkbox controls error logs without disabling anonymous daily active reporting', () => {
  assert.match(html, /data-i18n="usageAnalyticsDescription">此开关仅控制异常回传[^<]*每天最多提交一次匿名活跃记录/);
  assert.match(renderer, /usageAnalyticsDisabled: '已关闭异常自动回传'/);
  assert.match(renderer, /One anonymous daily-active event is submitted at most once per day regardless of this setting/);
});

test('the About dialog exposes the official website in both languages', () => {
  assert.match(html, /href="https:\/\/qm\.ssssa\.cn" data-external="https:\/\/qm\.ssssa\.cn"/);
  assert.match(html, /data-i18n="officialWebsite">官方网站<\/small><strong>qm\.ssssa\.cn<\/strong>/);
  assert.match(renderer, /officialWebsite: '官方网站'/);
  assert.match(renderer, /officialWebsite: 'Official website'/);
  assert.doesNotMatch(html, /https:\/\/(?:www\.)?ssssa\.cn/);
});
