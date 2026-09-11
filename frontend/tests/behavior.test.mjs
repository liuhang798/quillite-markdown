import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const renderer = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const aiChunkingSource = await readFile(new URL('../../ai_chunking.go', import.meta.url), 'utf8');

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
  assert.match(renderer, /missingCurrentFilePath = requestedPath;[\s\S]*await refreshLibraryFileStatuses\(\);[\s\S]*if \(requestedSession === state.documentSession && firstMissingNotice\) showToast\(t\('currentDocumentMissing'\), 'warning'\);[\s\S]*return;[\s\S]*reportSilentError\(error, 'document\.refresh'\)/);
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

test('closing a dirty document offers save, discard, and cancel actions', () => {
  assert.match(html, /id="unsavedCloseDialog"[\s\S]*id="cancelUnsavedClose"[\s\S]*id="discardUnsavedClose"[\s\S]*id="saveUnsavedClose"/);
  assert.match(mainSource, /if \(desktopRuntime\) return EventsOn\('document:confirm-close', callback\)/);
  assert.match(mainSource, /discardChangesAndQuit: \(\) => desktopRuntime \? Backend\.DiscardChangesAndQuit\(\)/);
  assert.match(renderer, /window\.quilliteMarkdown\.onConfirmClose\(openUnsavedCloseDialog\);\s*initialize\(\)/);
  assert.match(renderer, /async function saveAndQuit\(\)[\s\S]*await saveDocument\(false, \{ silent: true \}\)[\s\S]*!saved \|\| state\.dirty[\s\S]*await window\.quilliteMarkdown\.closeWindow\(\)/);
  assert.match(renderer, /async function discardAndQuit\(\)[\s\S]*await window\.quilliteMarkdown\.discardChangesAndQuit\(\)/);
});

test('an occupied export target is explained without uploading a software error', () => {
  assert.match(renderer, /function isExportFileInUseError\(error\)[\s\S]*message\.includes\('EXPORT_FILE_IN_USE'\)/);
  assert.match(renderer, /function reportSilentError\(error, source = 'frontend'\) \{[\s\S]*if \(isExportFileInUseError\(error\)\) return;/);
  assert.match(renderer, /async function exportWordDocument\(options = \{\}\)[\s\S]*catch \(error\) \{\s*if \(isExportFileInUseError\(error\)\) \{\s*showToast\(t\('exportFileInUse'\), 'warning'\);\s*return false;/);
  assert.match(renderer, /async function exportHTMLDocument\(options = \{\}\)[\s\S]*catch \(error\) \{\s*if \(isExportFileInUseError\(error\)\) \{\s*showToast\(t\('exportFileInUse'\), 'warning'\);\s*return false;/);
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
  assert.match(renderer, /if \(requestedSession !== state.documentSession \|\| !state\.currentFile \|\| !sameDocumentPath\(state\.currentFile\.path, requestedPath\) \|\| state\.dirty \|\| state\.saving\) return/);
  assert.match(renderer, /window\.addEventListener\('focus', \(\) => \{[\s\S]*scheduleMacWindowModeSync\(\);[\s\S]*refreshCurrentFileFromDisk\(\);[\s\S]*\}\)/);
});

test('document width presets are selectable in the more menu and persist', () => {
  assert.match(html, /data-settings-submenu="width"[^>]*aria-haspopup="menu"/);
  assert.match(html, /data-settings-submenu-panel="width"[^>]*role="menu"/);
  assert.match(html, /id="docWidthCurrent"/);
  assert.match(html, /data-doc-width="narrow"/);
  assert.match(html, /data-doc-width="medium"/);
  assert.match(html, /data-doc-width="wide"/);
  assert.match(html, /data-doc-width="full"/);
  assert.match(html, /role="menuitemradio" data-doc-width="medium"/);
  assert.match(html, /id="docWidthCurrent" data-i18n="widthWide">宽</);
  assert.match(html, /data-doc-width="wide" aria-checked="true"/);
  assert.match(renderer, /docWidth: normalizeDocWidth\(localStorage\.getItem\('docWidth'\)\)/);
  assert.match(renderer, /const DEFAULT_DOC_WIDTH = 'wide'/);
  assert.match(renderer, /return DOC_WIDTH_LEVELS\.includes\(value\) \? value : DEFAULT_DOC_WIDTH/);
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
  assert.match(styles, /@media \(max-width: 1120px\)[\s\S]*body:not\(\[data-doc-width="full"\]\) \.document-view \{ max-width: min\(var\(--doc-width\), 790px\); \}/);
  assert.doesNotMatch(styles, /@media \(max-width: 1120px\) \{[\s\S]*?\n\s*\.document-view \{ max-width: min\(var\(--doc-width\), 790px\); \}/);
  assert.match(renderer, /function syncDocumentWidthOptions\(\)/);
  assert.match(renderer, /current\.textContent = t\(`width\$\{state\.docWidth/);
});

test('software font presets update the interface and persist through preferences', () => {
  assert.match(html, /data-settings-submenu="font"[^>]*aria-haspopup="menu"/);
  assert.match(html, /data-settings-submenu-panel="font"[^>]*role="menu"/);
  assert.match(html, /id="fontFamilyCurrent"/);
  for (const preset of ['system', 'sans', 'serif', 'rounded', 'songti', 'kaiti']) {
    assert.match(html, new RegExp(`role="menuitemradio" data-font-family="${preset}"`));
  }
  assert.match(mainSource, /setFontFamily: fontFamily => desktopRuntime \? Backend\.SetFontFamily\(fontFamily\)/);
  assert.match(renderer, /const FONT_FAMILY_PRESETS = new Set\(\['system', 'sans', 'serif', 'rounded', 'songti', 'kaiti'\]\)/);
  assert.match(renderer, /if \(preset === 'songti'\) return '"Songti SC", STSong, SimSun, NSimSun/);
  assert.match(renderer, /async function setFontFamily\(fontFamily, silent = false, persist = true\)/);
  assert.match(renderer, /document\.documentElement\.style\.setProperty\('--app-font-family', fontFamilyCSS\(state\.fontFamily\)\)/);
  assert.match(renderer, /window\.quilliteMarkdown\.setFontFamily\(state\.fontFamily\)/);
  assert.match(renderer, /setFontFamily\(prefs\.fontFamily \|\| 'system', true, false\)/);
  assert.match(styles, /body \{[\s\S]*font-family: var\(--app-font-family\);/);
  assert.match(styles, /\.markdown-body \{ font-family: var\(--app-font-family\);/);
  assert.match(styles, /\.plain-text \{[^}]*font-family: "Cascadia Code"/);
  assert.match(styles, /\.markdown-body code:not\(\.hljs\) \{[^}]*font-family: "Cascadia Code"/);
});

test('large settings use adaptive cascading submenus without removing their existing controls', () => {
  assert.match(html, /data-settings-submenu="language"[^>]*aria-haspopup="menu"/);
  assert.match(html, /data-settings-submenu-panel="language"[^>]*role="menu"/);
  assert.match(html, /id="interfaceLanguageCurrent"/);
  assert.match(html, /role="menuitemradio" data-language="zh-CN"/);
  assert.match(html, /role="menuitemradio" data-language="en"/);
  assert.match(html, /data-settings-submenu="dictionary"[^>]*aria-haspopup="menu"/);
  assert.match(html, /data-settings-submenu-panel="dictionary"[^>]*role="menu"/);
  assert.match(html, /id="spellcheckLanguageCurrent"/);
  assert.match(renderer, /function positionSettingsSubmenu\(trigger, panel\)/);
  assert.match(renderer, /rightSpace >= panelRect\.width \+ gap/);
  assert.match(renderer, /function openSettingsSubmenu\(name, focusSelected = false\)/);
  assert.match(renderer, /if \(submenu\) \{[\s\S]*openSettingsSubmenu\(submenu, true\);[\s\S]*return;/);
  assert.match(renderer, /\['ArrowRight', 'Enter', ' '\]\.includes\(event\.key\)/);
  assert.match(renderer, /event\.key !== 'ArrowLeft' && event\.key !== 'Escape'/);
  assert.match(styles, /\.settings-submenu\.popover \{[^}]*position:/);
  assert.match(styles, /\.popover \.settings-submenu-trigger\[aria-expanded="true"\]/);
  assert.match(renderer, /function syncInterfaceLanguageOptions\(\)/);
  assert.match(renderer, /current\.textContent = state\.language === 'en' \? 'English' : '简体中文'/);
});

test('the More settings menu aligns to the three-dot button on every platform', () => {
  assert.match(html, /id="moreButton"[^>]*aria-haspopup="menu"/);
  assert.match(renderer, /function positionMoreMenu\(\)/);
  assert.match(renderer, /anchorRect\.right - menuRect\.width/);
  assert.match(renderer, /els\.moreMenu\.style\.left = `\$\{left\}px`/);
  assert.match(renderer, /if \(opening\) positionMoreMenu\(\)/);
  assert.match(renderer, /window\.addEventListener\('resize', positionMoreMenu\)/);
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

test('new document creation blocks double clicks and starts a three-second cooldown only after success', () => {
  assert.match(renderer, /const NEW_FILE_COOLDOWN_MS = 3000;/);
  assert.match(renderer, /async function newFile\(\) \{\s*if \(newFileRequestInProgress \|\| Date\.now\(\) < newFileCooldownUntil\) return;/);
  assert.match(renderer, /newFileRequestInProgress = true;\s*updateNewFileButtonState\(\);\s*try \{\s*const doc = await window\.quilliteMarkdown\.newFile\(\);\s*if \(!doc\?\.path\) return;\s*startNewFileCooldown\(\);/);
  assert.match(renderer, /finally \{\s*newFileRequestInProgress = false;\s*updateNewFileButtonState\(\);/);
  assert.match(renderer, /button\.disabled = newFileRequestInProgress \|\| Date\.now\(\) < newFileCooldownUntil;/);
  assert.match(renderer, /newFileCooldownTimer = window\.setTimeout\(releaseNewFileCooldown, NEW_FILE_COOLDOWN_MS\);/);
});

test('visual table designer edits cells, structure, order, alignment and persistent column widths', () => {
  assert.match(html, /id="tableDialog"[\s\S]*id="tableRows"[\s\S]*id="tableColumns"[\s\S]*id="addTableRow"[\s\S]*id="addTableColumn"[\s\S]*id="tableDesignerGrid"/);
  assert.match(renderer, /findMarkdownTableAt\(source, selection\.head\)/);
  assert.match(renderer, /function renderTableDesigner\(focusCell = null\)/);
  assert.match(renderer, /tools\.dataset\.tableDrag = 'column'/);
  assert.match(renderer, /rowTools\.dataset\.tableDrag = 'row'/);
  assert.match(renderer, /select\.dataset\.tableAlignment/);
  assert.match(renderer, /resizer\.dataset\.resizeTableColumn/);
  assert.match(renderer, /removeTableRow\(tableDesignerState\.model/);
  assert.match(renderer, /removeTableColumn\(tableDesignerState\.model/);
  assert.match(renderer, /reorderTableColumn\(tableDesignerState\.model/);
  assert.match(renderer, /reorderTableRow\(tableDesignerState\.model/);
  assert.match(renderer, /serializeMarkdownTable\(tableDesignerState\.model\)/);
  assert.match(renderer, /stripTableWidthMetadata\(content\)/);
  assert.match(renderer, /function applyMarkdownTableLayouts\(container, layouts\)/);
  assert.match(styles, /\.table-designer-dialog \{[^}]*width: min\(1020px/);
  assert.match(styles, /\.table-column-resizer \{[^}]*cursor: col-resize/);
  assert.match(styles, /\.markdown-table-scroll \{[^}]*overflow-x: auto/);
  assert.match(renderer, /visualTableEditor: '可视化表格编辑'/);
  assert.match(renderer, /visualTableEditor: 'Visual table editor'/);
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
  assert.match(renderer, /codeEditor\.contentDOM\.addEventListener\('paste', handleEditorPaste\)/);
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
  assert.match(renderer, /openExternal\(installerURL \|\| 'https:\/\/qm\.ssssa\.cn\/#download'\)/);
  assert.match(mainSource, /releaseUrl: 'https:\/\/qm\.ssssa\.cn\/#download'/);
  assert.doesNotMatch(mainSource, /github\.com\/liuhang798\/quillite-markdown\/releases/);
});

test('Word, HTML, and PDF export are available through the unified Export document action', () => {
  assert.match(html, /data-action="export-center"/);
  assert.doesNotMatch(html, /data-action="export-(?:word|html|pdf)"/);
  assert.match(html, /data-export-format="docx"/);
  assert.match(html, /data-export-format="html"/);
  assert.match(html, /data-export-format="pdf"/);
  assert.match(mainSource, /exportDOCX: \(filePath, title, renderedHTML\) => desktopRuntime \? Backend\.ExportDOCX\(filePath, title, renderedHTML\)/);
  assert.match(mainSource, /exportHTML: \(filePath, title, renderedHTML, colorMode, accentColor\) => desktopRuntime \? Backend\.ExportHTML\(filePath, title, renderedHTML, colorMode, accentColor\)/);
  assert.match(renderer, /async function exportWordDocument\(options = \{\}\)/);
  assert.match(renderer, /async function exportHTMLDocument\(options = \{\}\)/);
  assert.match(renderer, /cleanRenderedHTMLForExport\(container\)/);
  assert.match(renderer, /formula\.setAttribute\('data-math-source', encodeURIComponent\(annotation\.textContent\.trim\(\)\)\)/);
  assert.match(renderer, /const mathOnly = math\.cloneNode\(true\)/);
  assert.match(renderer, /mathOnly\.querySelectorAll\('annotation, annotation-xml'\)/);
  assert.match(renderer, /\[mathOnly, \.\.\.mathOnly\.querySelectorAll\('semantics'\)\]/);
  assert.match(renderer, /child\.nodeType === 3 && child\.textContent\.trim\(\)/);
  assert.match(renderer, /formula\.replaceChildren\(mathOnly\)/);
  assert.match(renderer, /formula\.replaceChildren\(\)/);
  assert.match(html, /id="pdfTutorialDialog"/);
  assert.match(html, /Microsoft Print to PDF/);
  assert.match(html, /data-i18n="pdfSaveAsPDF"/);
  assert.match(mainSource, /exportPDF: \(filePath, title, renderedHTML, header, footer\) => desktopRuntime \? Backend\.ExportPDF/);
  assert.match(renderer, /async function exportPDFWithBookmarks\(options = \{\}/);
  assert.match(renderer, /window\.quilliteMarkdown\.exportPDF\(/);
  assert.match(renderer, /async function confirmPDFExport\(\)[\s\S]*await printCurrentDocument\(\)/);
  assert.match(renderer, /async function printCurrentDocument\(options = \{\}\)[\s\S]*if \(state\.editing\) toggleEditor\(false\)[\s\S]*window\.quilliteMarkdown\.print\(\)/);
  assert.match(renderer, /\$\('#confirmPDFTutorial'\)\.addEventListener\('click', confirmPDFExport\)/);
  assert.match(renderer, /if \(action === 'export-center'\) openExportCenter\(\)/);
  assert.match(styles, /html\[data-platform="darwin"\] \.pdf-tutorial-windows \{ display: none; \}/);
  assert.match(styles, /html\[data-platform="darwin"\] \.pdf-tutorial-macos \{ display: block; \}/);
  assert.match(styles, /@media print \{[\s\S]*\.toast, \.popover, \.pane-resizer \{ display: none !important; \}/);
  assert.match(styles, /@media print \{[\s\S]*\.markdown-body pre, \.code-block pre \{[^}]*white-space: pre-wrap !important;[^}]*overflow-wrap: anywhere;/);
  assert.match(styles, /@media print \{[\s\S]*\.markdown-table-scroll table, \.markdown-body table \{[^}]*table-layout: fixed;/);
});

test('reader header exposes one responsive Export document action', () => {
  assert.match(html, /id="documentActions"[\s\S]*id="documentSummaryButton"[^>]*data-i18n="aiSummaryGenerate"[\s\S]*id="revealButton"/);
  assert.match(html, /id="closePreviewButton" class="text-button close-preview-button"/);
  assert.match(html, /id="documentSaveAsButton"[^>]*data-document-action="save-as"[^>]*data-i18n="saveAs"/);
  assert.match(html, /id="documentExportButton"[^>]*data-document-action="export-center"[^>]*data-i18n="exportDocument"/);
  assert.doesNotMatch(html, /id="documentExport(?:Word|HTML|PDF)Button"/);
  assert.match(html, /id="documentActionsMoreButton"[^>]*aria-haspopup="menu"[^>]*data-i18n="moreDocumentActions"/);
  assert.match(html, /id="documentActionsMenu"[^>]*role="menu"[\s\S]*data-document-action="save-as"[\s\S]*data-document-action="export-center"[\s\S]*data-document-action="print"/);
  const documentActionsMenu = html.match(/<div id="documentActionsMenu"[\s\S]*?<\/div>/)?.[0] || '';
  assert.equal((documentActionsMenu.match(/data-document-action="export-center"/g) || []).length, 1);
  assert.doesNotMatch(documentActionsMenu, /data-document-action="export-(?:word|html|pdf)"/);
  assert.match(styles, /\.document-meta \{[^}]*container-type: inline-size;/);
  assert.match(styles, /\.text-button\.close-preview-button \{ color: var\(--accent-strong\); \}/);
  assert.match(styles, /@container \(max-width: 720px\) \{[\s\S]*\.document-actions > \.document-action-collapsible \{ display: none; \}[\s\S]*\.document-actions-more \{ display: block; \}/);
  assert.match(renderer, /function runDocumentHeaderAction\(action\)[\s\S]*action === 'save-as'[\s\S]*saveLibraryDocumentAs\(state\.currentFile\.path\)[\s\S]*action === 'export-center'\) openExportCenter\(\)[\s\S]*action === 'print'/);
  assert.match(renderer, /els\.documentActions\.addEventListener\('click', event =>[\s\S]*documentActionsMenu\.classList\.toggle\('hidden', !opening\)[\s\S]*runDocumentHeaderAction\(actionButton\.dataset\.documentAction\)/);
  assert.match(html, /id="documentSummaryPanel"[^>]*aria-live="polite"[\s\S]*id="closeDocumentSummary"[\s\S]*id="documentSummaryProgress"[\s\S]*id="documentSummaryProgressBar"[\s\S]*id="documentSummaryContent"/);
	assert.match(html, /id="documentSummaryPrivacy"[\s\S]*id="documentSummaryPrivacyCheck"[\s\S]*id="documentSummaryPrivacyList"[\s\S]*id="documentSummaryConsent"[\s\S]*id="confirmDocumentSummary"/);
  const summaryFunction = renderer.slice(renderer.indexOf('async function openAIDocumentSummary()'), renderer.indexOf('function aiRewriteRequestText()'));
  assert.match(summaryFunction, /state\.currentFile\?\.content[\s\S]*getAISettings\(\)[\s\S]*requestID = `summary-[\s\S]*onAIRewriteChunk[\s\S]*action: 'summarize'[\s\S]*5–10 seconds[\s\S]*requestedSession !== state\.documentSession[\s\S]*renderDocumentSummary\(summary\)/);
	assert.match(summaryFunction, /documentSummaryPrivacyFindings = detectAISensitiveContent\(markdown\)[\s\S]*renderAISendPrivacy\('summary', markdown\)[\s\S]*documentSummaryConsent\.checked[\s\S]*prepareAIContent\(markdown, documentSummaryPrivacyFindings\)[\s\S]*text: prepared\.text[\s\S]*restoreAISensitiveContent/);
  assert.doesNotMatch(summaryFunction, /openAIRewrite\(/);
  assert.match(renderer, /function resetDocumentSummary\(hide = true\)[\s\S]*cancelAIRewrite[\s\S]*documentSummaryPanel\.classList\.add\('hidden'\)/);
  assert.match(renderer, /event\.kind === 'summary'[\s\S]*activeDocumentSummaryRequestID[\s\S]*updateDocumentSummaryProgress\(\)/);
  assert.match(renderer, /function displayDocument[\s\S]*resetDocumentSummary\(true\)[\s\S]*state\.documentSession \+= 1/);
  assert.match(aiChunkingSource, /strings\.EqualFold\(strings\.TrimSpace\(input\.Action\), "summarize"\)[\s\S]*summarizeAIChunks[\s\S]*Kind: "summary"[\s\S]*5–10 seconds/);
  assert.match(styles, /\.text-button\.document-summary-button \{[^}]*border:[^}]*color: var\(--accent-contrast\);[^}]*background: var\(--accent-strong\);[^}]*font-weight: 750/);
  assert.match(styles, /\.document-summary-panel \{[^}]*border:[^}]*border-radius: 12px/);
  assert.match(styles, /\.document-summary-content \{[^}]*max-height: 270px;[^}]*overflow-y: auto/);
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
  assert.match(renderer, /if \(fallbackToSaveAs && isCurrentSession\(\)\) return await saveDocument\(true, options\);/);
  assert.match(renderer, /saveAsRequiredHint: '原文件可能来自微信缓存/);
  assert.match(renderer, /async function refreshLibraryAfterReplacement\(saved\)[\s\S]*if \(!saved\?\.replacedPath\) return;[\s\S]*await refreshLibraryFileStatuses\(\)/);
  assert.match(renderer, /displayDocument\(saved\);\s*const savedSession = state.documentSession;\s*await refreshLibraryAfterReplacement\(saved\)/);
  assert.doesNotMatch(renderer, /replacingUnwritableSource|saved\.replacedPath \|\|/);
});

test('the editor header offers an exit editing button', () => {
  assert.match(html, /id="exitEditButton" class="text-button exit-edit-button"/);
  assert.match(html, /id="editorSaveState"[\s\S]*id="saveAsButton"[\s\S]*id="exitEditButton"[\s\S]*id="documentHistoryButton"/);
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
  assert.match(renderer, /document\.addEventListener\('click', \(\) => \{\s*closeMoreMenu\(\);\s*els\.codeLangMenu\.classList\.add\('hidden'\);/);
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
  assert.match(html, /id="editFormulaButton" class="edit-flowchart-button hidden"/);
  assert.match(renderer, /mode: 'inline',[\s\S]*editRange: null/);
  assert.match(renderer, /activeFormulaMatch = activeFlowchartFence \? null : findFormulaAt/);
  assert.match(renderer, /changes: \{ from: editRange\.from, to: editRange\.to, insert: markdownSource \}/);
  assert.match(renderer, /els\.editorPreview\.addEventListener\('dblclick'/);
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
  assert.match(styles, /\.dialog-backdrop \{[^}]*z-index: 150;/);
  assert.match(styles, /\.toast \{[^}]*z-index: 1000;/);
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
  assert.match(styles, /\.toc-panel-header > \.eyebrow \{ font-size: calc\(var\(--toc-eyebrow-font-size\) \* var\(--toc-font-user-scale\)\); \}/);
  assert.match(styles, /\.toc-panel > small \{[^}]*font-size: calc\(var\(--toc-reading-font-size\) \* var\(--toc-font-user-scale\)\);/);
  assert.match(styles, /\.sidebar-tab \{ [^}]*font-size: calc\(11px \* var\(--font-scale\)\);/);
  assert.match(styles, /\.eyebrow \{ display: block; color: var\(--faint\); font-size: calc\(10px \* var\(--font-scale\)\);/);
  assert.match(styles, /\.sidebar-heading h2 \{ margin: 5px 0 0; font-size: calc\(18px \* var\(--font-scale\)\);/);
});

test('the document outline renders as a persistent searchable tree or flat list', () => {
  assert.match(html, /id="tocSearchInput"/);
  assert.match(html, /data-toc-mode="tree"[\s\S]*data-toc-mode="flat"/);
  assert.match(renderer, /function tocTreeItems\(headings\)[\s\S]*buildTocTree\(/);
  assert.match(renderer, /filterTocTree\(tocTreeItems\(headings\), query\)/);
  assert.match(renderer, /localStorage\.setItem\('tocMode', state\.tocMode\)/);
  assert.match(renderer, /data-toc-toggle=/);
  assert.match(renderer, /writeCollapsedToc\(localStorage, state\.currentFile\?\.path, collapsed\)/);
  assert.match(renderer, /scrollDeltaForBounds\(\{[\s\S]*viewportTop,[\s\S]*viewportBottom,/);
  assert.match(renderer, /function scheduleActiveTocRefresh\(\)[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*updateActiveToc\(\)/);
  assert.match(renderer, /function setFontScale\([\s\S]*applyTocDisplayStyles\(\);\s*scheduleActiveTocRefresh\(\)/);
  assert.match(renderer, /function applyPaneWidths\(\)[\s\S]*setEditorPreviewWidth\(state\.editorPreviewWidth\);\s*scheduleActiveTocRefresh\(\)/);
  assert.doesNotMatch(renderer, /panelRect\.top \+ 38|panelRect\.bottom - 34/);
  assert.match(styles, /\.toc-children\.hidden \{ display: none; \}/);
  assert.match(styles, /\.toc-node\.collapsed > \.toc-row \.toc-toggle svg/);
  assert.match(styles, /\.toc\.is-flat \.toc-row \{ display: block; \}/);
  assert.match(renderer, /class="toc-link-text"/);
  assert.match(styles, /\.toc-link-text \{[^}]*display: -webkit-box;[^}]*max-height: 3em;[^}]*overflow: hidden;[^}]*-webkit-box-orient: vertical;[^}]*-webkit-line-clamp: 2;[^}]*line-clamp: 2;/);
  assert.match(styles, /\.toc-search-box:focus-within/);
});

test('narrow screens keep the document outline as a non-resizing overlay', () => {
  assert.match(html, /id="compactTocButton"[^>]*aria-controls="tocPanel"[^>]*aria-expanded="false"/);
  assert.match(html, /id="compactTocBackdrop"/);
  assert.match(html, /id="closeCompactToc"/);
  assert.match(renderer, /const compactTocMediaQuery = window\.matchMedia\?\.\('\(max-width: 1120px\)'\)/);
  assert.match(renderer, /compactTocOpen: false/);
  assert.match(renderer, /function setCompactTocOpen\(open, restoreFocus = false\)/);
  assert.doesNotMatch(renderer, /state\.compactTocOpen\) requestAnimationFrame\(\(\) => els\.closeCompactToc\.focus\(\)\)/);
  assert.match(renderer, /compactTocButton\.focus\(\{ preventScroll: true \}\)/);
  assert.match(renderer, /const tocVisible = !isCompactTocLayout\(\) && paneParticipates/);
  assert.match(renderer, /if \(isCompactTocLayout\(\)\) setCompactTocOpen\(false\)/);
  assert.match(renderer, /event\.key === 'Escape' && state\.compactTocOpen/);
  assert.match(html, /id="compactTocButton" class="rail-button compact-toc-button hidden"/);
  assert.match(styles, /@media \(max-width: 1120px\) \{[\s\S]*\.compact-toc-button \{[^}]*z-index: 26;/);
  assert.match(renderer, /compactTocButton\.classList\.toggle\('compact-open', open\)/);
  assert.match(styles, /\.compact-toc-button\.compact-open \{[^}]*right: calc\(min\(clamp\(280px, var\(--toc-width\), 360px\), calc\(100% - 48px\)\) \+ 10px\);/);
  assert.match(styles, /\.compact-toc-button\.compact-open svg \{ transform: rotate\(180deg\); \}/);
  assert.match(styles, /\.toc-panel \{[^}]*position: absolute;[^}]*transform: translateX\(100%\);/);
  assert.match(styles, /\.toc-panel\.compact-open \{[^}]*transform: translateX\(0\);/);
  assert.match(renderer, /compactTocBackdrop\.classList\.toggle\('compact-open', open\)/);
  assert.match(styles, /\.compact-toc-backdrop \{[^}]*opacity: 0;[^}]*visibility: hidden;[^}]*pointer-events: none;[^}]*transition: opacity/);
  assert.match(styles, /\.compact-toc-backdrop\.compact-open \{[^}]*opacity: 1;[^}]*visibility: visible;[^}]*pointer-events: auto;/);
  assert.doesNotMatch(styles, /body\.compact-toc-open \.reader-pane \{ overflow: hidden; \}/);
  assert.doesNotMatch(styles, /@media \(max-width: 1120px\) \{\s*\.toc-panel, \.toc-resizer \{ display: none; \}/);
});

test('wide screens can collapse and restore the document outline like the recent-reading sidebar', () => {
  assert.match(renderer, /tocPanelCollapsed: localStorage\.getItem\('tocPanelCollapsed'\) === 'true'/);
  assert.match(renderer, /function setWideTocCollapsed\(collapsed\)/);
  assert.match(renderer, /localStorage\.setItem\('tocPanelCollapsed', String\(state\.tocPanelCollapsed\)\)/);
  assert.match(renderer, /tocPanel\.classList\.toggle\('collapsed', wideCollapsed\)/);
  assert.match(renderer, /tocPanel\.classList\.contains\('collapsed'\)/);
  assert.match(styles, /\.toc-panel\.collapsed \{ width: 0; flex-basis: 0;/);
  assert.match(html, /id="closeCompactToc" class="small-icon toc-panel-close"/);
  assert.match(renderer, /else setWideTocCollapsed\(false\)/);
  assert.match(renderer, /else setWideTocCollapsed\(true\)/);
});

test('body [TOC] markers render a dynamic linked outline and PDF export requests heading bookmarks', () => {
  assert.match(renderer, /replaceDynamicTocMarkers\(stripTableWidthMetadata\(content\)\)/);
  assert.match(renderer, /function renderDynamicTocs\(container/);
  assert.match(renderer, /querySelectorAll\('\[data-dynamic-toc\]'\)/);
  assert.match(renderer, /scrollPreviewContainerToHeading\(container, link\.dataset\.target\)/);
  assert.match(styles, /\.markdown-dynamic-toc \{/);
  assert.match(mainSource, /Backend\.ExportPDF/);
  assert.match(renderer, /pdfWithBookmarks: '标题书签'/);
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

test('export center groups formats and only exposes settings required by the selected format', () => {
  for (const format of ['docx', 'html', 'html-plain', 'pdf', 'png', 'jpeg', 'epub', 'rtf', 'odt', 'latex', 'mediawiki', 'custom']) {
    assert.match(html, new RegExp(`data-export-format="${format}"`));
  }
  assert.match(html, /id="exportCenterDialog"[\s\S]*data-i18n="exportCategoryDocument"[\s\S]*data-i18n="exportCategoryWeb"[\s\S]*data-i18n="exportCategoryImage"[\s\S]*id="exportAdvancedFormats"/);
  assert.doesNotMatch(html, /class="export-preset-bar"|class="export-center-section export-header-footer-section"/);
  assert.match(html, /id="pandocExtraArguments"/);
  assert.match(html, /id="exportImageOptions" class="export-center-section hidden"[\s\S]*id="exportImageLayout"[\s\S]*value="pages" selected[\s\S]*value="long"[\s\S]*id="exportImageScale"[\s\S]*value="2" selected/);
  assert.match(html, /value="pages" selected data-i18n="imageOutputPages">A4 高清分页（推荐）<\/option>[\s\S]*value="long" data-i18n="imageOutputLong">单张长图（仅适合短文档）<\/option>/);
  assert.match(mainSource, /exportPlainHTML:[\s\S]*Backend\.ExportPlainHTML/);
  assert.match(mainSource, /exportWithPandoc:[\s\S]*Backend\.ExportWithPandoc/);
  assert.match(mainSource, /saveExportImage:[\s\S]*Backend\.SaveExportImage/);
  assert.match(mainSource, /saveExportImageSlices:[\s\S]*Backend\.SaveExportImageSlices/);
  assert.match(mainSource, /saveExportImagePages:[\s\S]*Backend\.SaveExportImagePages/);
  assert.match(renderer, /imageScale: 2,\s*imageLayout: 'pages'/);
  assert.match(renderer, /imageLayout: els\.exportImageLayout\.value/);
  assert.match(renderer, /exportImageOptions\.classList\.toggle\('hidden', !\['png', 'jpeg'\]\.includes\(format\)\)/);
  assert.match(renderer, /const imageLayout = value\.imageLayout === 'long' \? 'long' : 'pages'/);
  assert.match(renderer, /await import\('html-to-image'\)/);
  assert.match(renderer, /const \{ toCanvas \} = await import\('html-to-image'\)/);
  assert.match(renderer, /host\.className = 'export-image-host'[\s\S]*viewport\.append\(stage\)[\s\S]*host\.append\(viewport\)[\s\S]*document\.body\.append\(host\)/);
  assert.match(renderer, /const width = Math\.ceil\(stage\.scrollWidth\)[\s\S]*toCanvas\(viewport, \{[\s\S]*width,[\s\S]*height: currentHeight,/);
  assert.match(renderer, /const backgroundColor = state\.colorMode === 'dark' \? '#171b18' : '#ffffff'[\s\S]*backgroundColor,[\s\S]*imageCanvasHasVisibleContent\(canvas, backgroundColor\)[\s\S]*EXPORT_IMAGE_BLANK/);
  assert.match(renderer, /const requestedLongImage = options\.imageLayout === 'long'[\s\S]*const a4PageRanges = createExportImagePageRanges\(stage, Math\.max\(320, Math\.floor\(width \* Math\.SQRT2\) - pageMargin \* 2\)\)[\s\S]*const autoPaginatedLongImage = requestedLongImage && a4PageRanges\.length > 3[\s\S]*const splitIntoPages = !requestedLongImage \|\| autoPaginatedLongImage[\s\S]*Array\.from\(\{ length: Math\.ceil\(height \/ sliceHeight\) \}/);
  assert.match(renderer, /stage\.style\.width = requestedLongImage \? '1280px' : '840px'[\s\S]*stage\.style\.fontSize = '16px'/);
  assert.match(renderer, /scaledWidth \* scaledHeight > 64000000/);
  assert.match(renderer, /stage\.style\.top = `\$\{\(splitIntoPages \? pageMargin : 0\) - range\.start\}px`[\s\S]*toCanvas\(viewport, \{[\s\S]*skipAutoScale: true[\s\S]*slices\.push\(canvas\.toDataURL\('image\/png'\)\)/);
  assert.match(renderer, /function createExportImagePageRanges\(stage, maximumContentHeight\)[\s\S]*minimumUsefulBreak[\s\S]*ranges\.push\(\{ start, end \}\)/);
  assert.match(renderer, /if \(splitIntoPages\) \{[\s\S]*saveExportImagePages\(state\.currentFile\.path, state\.currentFile\.name, format, slices\)[\s\S]*return paths\?\.length \? \{ paths, autoPaginatedLongImage \} : null/);
  assert.match(renderer, /saveExportImageSlices\(state\.currentFile\.path, state\.currentFile\.name, format, slices\)/);
  assert.match(renderer, /output\?\.autoPaginatedLongImage[\s\S]*longImageAutoPaged[\s\S]*output\.paths\.length/);
  assert.match(renderer, /function setExportInProgress\(inProgress\)[\s\S]*confirmExportCenter\.disabled = state\.exportInProgress[\s\S]*setAttribute\('aria-busy', String\(state\.exportInProgress\)\)/);
  assert.match(renderer, /async function performExportCenter\(\) \{\s*if \(state\.exportInProgress\) return;\s*setExportInProgress\(true\);[\s\S]*finally \{\s*setExportInProgress\(false\)/);
  assert.doesNotMatch(renderer, /imageCanvasHasVisibleContent\(canvas, stage\.style\.background\)/);
  assert.match(styles, /\.export-image-host \{[^}]*width: 1px;[^}]*height: 1px;[^}]*overflow: hidden;/);
  assert.match(styles, /\.export-image-viewport \{[^}]*position: relative;[^}]*overflow: hidden;/);
  assert.match(styles, /\.export-image-page-mask \{[^}]*position: absolute;[^}]*z-index: 2;/);
  assert.match(styles, /\.export-center-actions \.large-button\.primary:disabled \{[^}]*cursor: not-allowed;[^}]*filter: grayscale\(1\);[^}]*pointer-events: none;/);
  assert.doesNotMatch(styles, /\.export-image-stage \{[^}]*(?:left: -100000px|z-index: -1)/);
  assert.match(renderer, /function exportPageBoxContent\(template\)[\s\S]*counter\(page\)/);
  assert.match(renderer, /function createPrintPageStyle\(options = \{\}\)[\s\S]*@top-center[\s\S]*@bottom-center/);
  assert.match(renderer, /const pageStyle = createPrintPageStyle\(options\)[\s\S]*await window\.quilliteMarkdown\.print\(\)[\s\S]*pageStyle\?\.remove\(\)/);
  assert.match(renderer, /header: '',\s*footer: '',[\s\S]*imageScale: 2,\s*imageLayout: 'pages'/);
  assert.match(renderer, /const needsPandocSetup = pandocFormat && !state\.pandocStatus\.available;[\s\S]*pandocExportOptions\.classList\.toggle\('hidden', !needsPandocSetup && !customPandoc\)/);
  assert.match(renderer, /pandocArgumentsField'\)\.classList\.toggle\('hidden', !customPandoc\)/);
  assert.match(renderer, /custom pandoc arguments cannot override the output path|pandocSecurityHint/);
  assert.match(styles, /\.export-format-categories[\s\S]*\.export-format-category[\s\S]*\.export-format-advanced/);
});

test('rich clipboard HTML converts to Markdown and selected source has Markdown or plain-text copy options', () => {
  assert.match(renderer, /import \{ hasRichClipboardHTML, htmlToMarkdown, markdownToPlainText \} from '\.\/rich-clipboard\.js'/);
  assert.match(renderer, /async function handleEditorPaste\(event\)[\s\S]*getData\('text\/html'\)[\s\S]*hasRichClipboardHTML\(html\)[\s\S]*htmlToMarkdown\(html\)[\s\S]*replaceSelection\(markdownSource/);
  assert.match(renderer, /codeEditor\.contentDOM\.addEventListener\('contextmenu', openEditorClipboardMenu\)/);
  assert.match(renderer, /async function copyEditorSelection\(mode\)[\s\S]*markdownToPlainText\(markdownSource\)[\s\S]*navigator\.clipboard\.writeText\(output\)/);
  assert.match(html, /id="editorClipboardMenu"[\s\S]*data-editor-copy="markdown"[\s\S]*data-editor-copy="plain"/);
  assert.match(styles, /\.editor-clipboard-menu \{[^}]*width: 218px/);
  assert.match(renderer, /copyAsMarkdown: '复制为 Markdown'/);
  assert.match(renderer, /copyAsPlainText: 'Copy as plain text'/);
});

test('AI Edit supports isolated official and third-party providers and can replace a selection or insert generated content at the cursor', () => {
  assert.match(html, /data-action="ai-settings"[\s\S]*data-i18n="aiAssistant"/);
  assert.doesNotMatch(html, /id="aiEditButton"|id="aiReviewButton"/);
  assert.match(html, /id="headingSelect"[\s\S]*id="aiToolbarButton"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[\s\S]*id="aiToolbarMenu"/);
  assert.match(html, /data-ai-toolbar-action="generate"[\s\S]*data-ai-toolbar-action="edit"[\s\S]*data-ai-toolbar-action="proofread"[\s\S]*data-ai-toolbar-action="continue"[\s\S]*data-ai-toolbar-action="translate"[\s\S]*data-ai-toolbar-action="concise"[\s\S]*data-ai-toolbar-action="expand"[\s\S]*data-ai-toolbar-action="custom"/);
  assert.match(renderer, /async function runAIToolbarAction\(action\)[\s\S]*action === 'proofread'[\s\S]*openAIDocumentReview\(\)[\s\S]*action === 'generate'[\s\S]*dialogTitleKey: 'aiGenerateDialogTitle'[\s\S]*tool: 'generate'[\s\S]*mode: 'insert'[\s\S]*action === 'continue'[\s\S]*promptText[\s\S]*dialogTitleKey: 'aiContinueDialogTitle'[\s\S]*tool: 'continue'[\s\S]*const rewriteTools = \{[\s\S]*edit: \{ action: 'polish'[\s\S]*translate: \{ action: 'translate'[\s\S]*concise: \{ action: 'concise'[\s\S]*expand: \{ action: 'expand'[\s\S]*custom: \{ action: 'custom'/);
  assert.match(renderer, /function openAIToolbarMenu\(\)[\s\S]*getBoundingClientRect\(\)[\s\S]*setAttribute\('aria-expanded', 'true'\)/);
  assert.match(html, /id="aiSettingsDialog"[\s\S]*id="aiProvider"[\s\S]*value="deepseek"[\s\S]*value="zhipu"[\s\S]*value="qwen"[\s\S]*value="openai"[\s\S]*value="kimi"[\s\S]*id="setDefaultAIProvider"[\s\S]*id="aiKeyOnboarding"[\s\S]*id="aiMaskedAPIKey"[\s\S]*id="editAIAPIKey"[\s\S]*id="deleteAIAPIKey"[\s\S]*id="aiAPIKey"[\s\S]*id="refreshAIModels"[\s\S]*id="aiModel"[\s\S]*id="aiModelState"/);
  assert.doesNotMatch(html, /value="ollama"|value="openai-compatible"/);
  assert.match(html, /id="aiRewriteDialog"[\s\S]*id="aiRewriteAction" type="hidden" value="polish"/);
  assert.doesNotMatch(html, /<select id="aiRewriteAction"|data-i18n="aiAction"/);
  const targetLanguageSelect = html.match(/<select id="aiTargetLanguage">[\s\S]*?<\/select>/)?.[0] || '';
  assert.equal((targetLanguageSelect.match(/<option value=/g) || []).length, 30);
  assert.match(targetLanguageSelect, /简体中文（简体中文）[\s\S]*繁體中文（繁体中文）[\s\S]*English（英语）[\s\S]*Español（西班牙语）[\s\S]*हिन्दी（印地语）[\s\S]*العربية（阿拉伯语）[\s\S]*Français（法语）[\s\S]*বাংলা（孟加拉语）[\s\S]*Português（葡萄牙语）[\s\S]*Bahasa Indonesia（印度尼西亚语）[\s\S]*اردو（乌尔都语）[\s\S]*Русский（俄语）[\s\S]*Deutsch（德语）[\s\S]*日本語（日语）[\s\S]*한국어（韩语）[\s\S]*Tiếng Việt（越南语）[\s\S]*Türkçe（土耳其语）[\s\S]*Italiano（意大利语）[\s\S]*ไทย（泰语）[\s\S]*فارسی（波斯语）[\s\S]*Polski（波兰语）[\s\S]*Nederlands（荷兰语）[\s\S]*Українська（乌克兰语）[\s\S]*Bahasa Melayu（马来语）[\s\S]*Filipino（菲律宾语）[\s\S]*Kiswahili（斯瓦希里语）[\s\S]*தமிழ்（泰米尔语）[\s\S]*తెలుగు（泰卢固语）[\s\S]*मराठी（马拉地语）[\s\S]*ਪੰਜਾਬੀ（旁遮普语）/);
  assert.match(html, /id="aiCloudConsent" type="checkbox" checked/);
  assert.match(html, /id="aiTaskSettings"[\s\S]*id="aiInstructionField"[\s\S]*id="aiInstructionLabel"[\s\S]*id="aiInstructionHint"[\s\S]*id="aiLengthField"[\s\S]*id="aiLength"[\s\S]*class="ai-generate-row"[\s\S]*id="generateAIRewrite" class="large-button primary ai-generate-button"[\s\S]*id="aiCompareGrid"/);
  assert.match(html, /<input id="aiInstruction" type="text" maxlength="1000"/);
  assert.doesNotMatch(html, /<textarea id="aiInstruction"/);
  assert.match(html, /id="aiRewriteProgress"[\s\S]*id="aiRewriteProgressPhase"[\s\S]*id="aiRewriteProgressMeta"[\s\S]*id="aiRewriteProgressBar"[\s\S]*id="aiRewriteProgressPercent"/);
  assert.match(html, /id="generateAIRewrite"[\s\S]*id="replaceWithAIResult" class="large-button primary"/);
  assert.match(html, /id="aiReviewDialog"[\s\S]*id="aiReviewInstruction"[\s\S]*id="aiReviewSuggestions"[\s\S]*id="aiReviewConsent"[\s\S]*id="runAIReview"[\s\S]*id="applyAIReview"/);
  assert.match(html, /data-editor-ai[\s\S]*data-i18n="aiSelectionAction"/);
  assert.match(mainSource, /getAISettings:[\s\S]*Backend\.GetAISettings/);
  assert.match(mainSource, /getAIProviderSettings:[\s\S]*Backend\.GetAIProviderSettings/);
  assert.match(mainSource, /setDefaultAIProvider:[\s\S]*Backend\.SetDefaultAIProvider/);
  assert.match(mainSource, /listAIModels:[\s\S]*Backend\.ListAIModels/);
  assert.match(mainSource, /discoverAIModels:[\s\S]*Backend\.DiscoverAIModels/);
  assert.match(mainSource, /diagnoseAIProvider:[\s\S]*Backend\.DiagnoseAIProvider/);
  assert.match(mainSource, /cancelAIRewrite:[\s\S]*Backend\.CancelAIRewrite/);
  assert.match(mainSource, /cancelAIDocumentReview:[\s\S]*Backend\.CancelAIDocumentReview/);
  assert.match(mainSource, /onAIRewriteChunk:[\s\S]*EventsOn\('ai:rewrite-chunk'/);
  assert.match(mainSource, /testAIProviderConnection:[\s\S]*Backend\.TestAIProviderConnection/);
  assert.match(mainSource, /rewriteWithAI:[\s\S]*Backend\.RewriteWithAI/);
  assert.match(mainSource, /reviewDocumentWithAI:[\s\S]*Backend\.ReviewDocumentWithAI/);
  assert.match(renderer, /function currentAIEditContext\(\)[\s\S]*selection\.empty[\s\S]*mode: 'insert'/);
  assert.match(renderer, /async function openAIRewrite\(selection = editorClipboardSelection, preferredAction = '', presetInstruction = ''\)[\s\S]*!currentAISettings\?\.hasApiKey[\s\S]*openAISettings\(\{ required: true \}\)[\s\S]*aiRewriteSelection = editContext/);
  assert.match(renderer, /aiOriginalTextField\.classList\.toggle\('hidden', insertMode\)/);
  assert.match(renderer, /aiCompareGrid\.classList\.toggle\('is-insert-mode', insertMode\)/);
  assert.match(renderer, /const aiRewritePromptProfiles = \{[\s\S]*generate:[\s\S]*edit:[\s\S]*continue:[\s\S]*translate:[\s\S]*concise:[\s\S]*expand:[\s\S]*custom:/);
  assert.match(html, /id="aiRequestSettings" class="ai-request-settings"[\s\S]*id="aiRewriteControls"[\s\S]*id="aiTaskSettings"[\s\S]*id="generateAIRewrite"/);
  assert.match(renderer, /function updateAIRewriteControls\(\)[\s\S]*aiRequestSettings\.classList\.toggle\('has-language', action === 'translate'\)[\s\S]*aiInstructionField\.classList\.remove\('hidden'\)[\s\S]*aiInstructionLabel\.textContent[\s\S]*aiLengthField\.classList\.toggle\('hidden', !showLength\)/);
  assert.match(renderer, /async function generateAIRewrite\(\)[\s\S]*if \(!instruction\)[\s\S]*const length = els\.aiLengthField\.classList\.contains\('hidden'\) \? '' : els\.aiLength\.value\.trim\(\)[\s\S]*instruction: length \? `\$\{instruction\}\\n\$\{t\('aiLengthInstruction', \{ length \}\)\}` : instruction/);
  assert.doesNotMatch(renderer, /if \(!els\.aiLengthField\.classList\.contains\('hidden'\) && !length\)/);
  assert.match(renderer, /aiLengthHint: '可填写字数、段落数或比例；留空表示不限制。'/);
  for (const [key, label] of Object.entries({ aiGenerateDialogTitle: 'AI生成', aiContinueDialogTitle: 'AI续写', aiTranslateDialogTitle: 'AI翻译', aiConciseDialogTitle: 'AI精简', aiExpandDialogTitle: 'AI扩写', aiCustomDialogTitle: 'AI自定义' })) {
    assert.match(renderer, new RegExp(`${key}: '${label}'`));
  }
  assert.match(renderer, /els\.aiCloudConsent\.checked = true;/);
  assert.match(renderer, /function renderAISettingsKeyUI\(\)[\s\S]*aiKeySavedCard[\s\S]*maskedApiKey/);
  assert.match(renderer, /async function deleteAIAPIKey\(\)[\s\S]*aiSettingsInput\(true\)/);
  assert.match(renderer, /async function loadAIModels\(\)[\s\S]*window\.quilliteMarkdown\.discoverAIModels\(discoveryInput\)[\s\S]*setAIModelOptions/);
  assert.match(renderer, /function scheduleAIModelDiscovery\(\)[\s\S]*setTimeout\([\s\S]*loadAIModels\(\)[\s\S]*700/);
  assert.match(renderer, /async function setDefaultAIProvider\(\)[\s\S]*window\.quilliteMarkdown\.setDefaultAIProvider\(currentAISettings\.provider, model\)/);
  assert.match(renderer, /async function testAIConnection\(\)[\s\S]*diagnoseAIProvider\(\{ \.\.\.aiSettingsInput\(\), provider, model \}\)[\s\S]*renderAIDiagnostics/);
  assert.match(html, /id="aiDiagnostics"[\s\S]*id="aiDiagnosticChecks"/);
  assert.match(renderer, /function closeAIRewrite\(\)[\s\S]*cancelAIRewrite/);
  assert.match(renderer, /function cancelActiveAIDocumentReview\(\)[\s\S]*cancelAIDocumentReview/);
  assert.match(renderer, /function closeAIDocumentReview\(\)[\s\S]*cancelActiveAIDocumentReview/);
  assert.match(renderer, /function startAIRewriteProgress\(\)[\s\S]*setInterval\(updateAIRewriteProgress, 500\)/);
  assert.match(renderer, /async function generateAIRewrite\(\)[\s\S]*const requestNumber = \+\+aiRewriteRequest[\s\S]*onAIRewriteChunk[\s\S]*startAIRewriteProgress\(\)[\s\S]*requestNumber !== aiRewriteRequest/);
  assert.match(html, /id="aiDiffReview"[\s\S]*id="acceptAllAIDiff"[\s\S]*id="rejectAllAIDiff"[\s\S]*id="aiDiffList"/);
  assert.match(renderer, /function rebuildAIRewriteDiff\(\)[\s\S]*buildAITextDiff[\s\S]*renderAIRewriteDiff/);
  assert.match(renderer, /function clearAIRewriteDiff\(\)[\s\S]*classList\.remove\('has-ai-diff-review'\)[\s\S]*replaceWithAIResult'[\s\S]*disabled = !els\.aiResultText\.value\.trim\(\)/);
  assert.match(renderer, /function renderAIRewriteDiff\(\)[\s\S]*const showDiff = !insertMode && changes\.length > 0[\s\S]*classList\.toggle\('has-ai-diff-review', showDiff\)/);
  assert.match(renderer, /function replaceWithAIResult\(\)[\s\S]*applyAITextDiff\(aiRewriteDiffSegments\)/);
  assert.match(renderer, /async function runAIDocumentReview\(\)[\s\S]*const instruction = els\.aiReviewInstruction\.value\.trim\(\)[\s\S]*reviewDocumentWithAI\(\{ text: prepared\.text, instruction, requestId: activeAIReviewRequestID \}\)[\s\S]*locateAIReviewSuggestions/);
  assert.match(renderer, /function applySelectedAIReviewSuggestions\(\)[\s\S]*editorContent\(\) !== aiReviewSnapshot[\s\S]*hasOverlappingReviewSuggestions[\s\S]*changes: selected\.map/);
  assert.match(html, /id="rerunAIReview"[\s\S]*data-i18n="aiReviewAgain"/);
  const closeReview = renderer.slice(renderer.indexOf('function closeAIDocumentReview()'), renderer.indexOf('async function runAIDocumentReview()'));
  assert.match(closeReview, /classList\.add\('hidden'\)[\s\S]*focusCodeEditor\(\)/);
  assert.doesNotMatch(closeReview, /aiReviewSuggestions = \[\]|aiReviewSnapshot = ''|aiReviewRequest \+= 1/);
  assert.match(renderer, /function resetAIDocumentReviewSession\(\)[\s\S]*aiReviewSnapshot = ''[\s\S]*aiReviewSuggestions = \[\]/);
  assert.match(renderer, /state\.editing = nextEditing;[\s\S]*if \(state\.editing\) \{[\s\S]*resetAIDocumentReviewSession\(\)[\s\S]*\} else \{[\s\S]*resetAIDocumentReviewSession\(\)/);
  assert.match(renderer, /aiReviewApplied = true;[\s\S]*updateAIReviewSelectionUI\(\)[\s\S]*closeAIDocumentReview\(\)/);
  assert.match(renderer, /els\.setDefaultAIProvider\.disabled = !hasKey \|\| !selectedAIModel\(\) \|\| isDefault/);
  assert.match(renderer, /if \(!els\.aiCloudConsent\.checked\)/);
  assert.match(renderer, /codeEditor\.state\.doc\.sliceString\(from, to\) !== markdown/);
  assert.match(renderer, /const insertAt = insertMode[\s\S]*\? from : documentLength/);
  assert.match(renderer, /function replaceWithAIResult\(\)[\s\S]*codeEditor\.dispatch\(\{[\s\S]*changes: \{ from: changeFrom, to: changeTo, insert: replacement \}[\s\S]*userEvent: 'input\.ai'/);
  assert.match(renderer, /aiPrivacyNote: '只有你主动选择或确认检查的文档内容会发送给所选 AI 服务/);
  assert.match(renderer, /const aiProviderConfigs = Object\.freeze\([\s\S]*glm-4\.7-flash[\s\S]*qwen-plus[\s\S]*gpt-5-mini[\s\S]*kimi-k3[\s\S]*aiProviderBailian[\s\S]*api\.siliconflow\.cn[\s\S]*openrouter\.ai[\s\S]*localhost:11434/);
  assert.match(renderer, /async function changeAIProvider\(\)[\s\S]*getAIProviderSettings\(provider\)/);
  assert.match(styles, /\.ai-key-saved-card \{[^}]*grid-template-columns/);
  assert.match(styles, /\.ai-rewrite-progress \{[^}]*grid-template-columns/);
  assert.match(styles, /\.ai-diff-list \{[^}]*flex: 1 1 auto;[^}]*grid-auto-rows: max-content;[^}]*overflow: auto/);
  assert.match(styles, /\.ai-default-provider-button\.active \{[^}]*background: var\(--accent-strong\)/);
  assert.match(styles, /\.ai-model-label \{[^}]*justify-content: space-between/);
  assert.match(styles, /\.ai-review-dialog \{[^}]*display: flex;[^}]*flex-direction: column/);
  assert.match(styles, /\.ai-review-suggestion\.selected \{[^}]*border-color/);
  assert.match(styles, /\.ai-review-dialog \{[^}]*height: auto;[^}]*max-height: min\(780px, calc\(100vh - 40px\)\);[^}]*overflow-y: auto/);
  assert.match(styles, /\.ai-review-suggestions \{[^}]*flex: 0 0 auto;[^}]*overflow: visible/);
  assert.match(styles, /\.ai-review-comparison pre \{[^}]*height: auto;[^}]*max-height: 300px;[^}]*overflow-y: auto/);
  assert.match(styles, /\.ai-edit-button \{[^}]*color: var\(--accent-strong\)/);
  assert.match(styles, /\.editor-format-bar #aiToolbarButton \{[^}]*width: 57px;[^}]*color: var\(--accent-strong\)/);
  assert.match(styles, /\.ai-toolbar-menu \{[^}]*width: 190px;[^}]*z-index: 90/);
  assert.match(styles, /\.ai-toolbar-menu \.ai-toolbar-generate \{[^}]*background: var\(--accent-strong\);[^}]*font-weight: 750/);
  assert.match(styles, /\.ai-request-settings \{[^}]*grid-template-columns: minmax\(220px, \.32fr\) minmax\(0, 1fr\) auto;[^}]*align-items: start/);
  assert.match(styles, /\.ai-rewrite-controls \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.ai-task-settings \{[^}]*grid-template-columns: minmax\(0, 1fr\) 220px/);
  assert.match(styles, /\.ai-instruction-field input,\s*\.ai-length-field input \{ height: 38px; \}/);
  assert.match(styles, /\.ai-review-instruction textarea \{[^}]*min-height: 68px/);
  assert.match(styles, /\.ai-generate-row \{[^}]*justify-content: flex-end;[^}]*align-self: start;[^}]*margin-top: 23px/);
  assert.match(styles, /\.ai-rewrite-dialog \{[^}]*width: 80vw;[^}]*height: 80vh/);
  assert.match(styles, /\.ai-compare-grid \{[^}]*grid-template-columns: 1fr 1fr/);
  assert.match(styles, /\.ai-compare-grid\.is-insert-mode \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /\.dialog-backdrop\.has-ai-diff-review \.ai-compare-grid \{[^}]*flex: 0 0 104px/);
  assert.match(styles, /\.dialog-backdrop\.has-ai-diff-review \.ai-diff-review \{[^}]*flex: 1 1 0;[^}]*max-height: none/);
});

test('AI privacy, chunk progress, paragraph review, and local version history are fully wired', () => {
  assert.match(html, /id="documentHistoryButton"[\s\S]*id="documentHistoryDialog"[\s\S]*id="documentHistoryList"[\s\S]*id="restoreDocumentHistory"/);
  assert.match(mainSource, /listDocumentVersions:[\s\S]*Backend\.ListDocumentVersions/);
  assert.match(mainSource, /getDocumentVersion:[\s\S]*Backend\.GetDocumentVersion/);
  assert.match(mainSource, /onAIProgress:[\s\S]*EventsOn\('ai:progress'/);
  assert.match(html, /id="aiDiffFilter"[\s\S]*id="loadMoreAIDiff"/);
  assert.match(renderer, /function renderAIRewriteDiff\(\)[\s\S]*aiDiffRenderLimit[\s\S]*data-ai-diff-locate/);
  assert.match(renderer, /detectAISensitiveContent[\s\S]*prepareAIContent[\s\S]*restoreAISensitiveContent/);
  assert.match(renderer, /window\.quilliteMarkdown\.onAIProgress\(handleAIProgress\)/);
  assert.match(renderer, /function openDocumentHistory\(\)[\s\S]*listDocumentVersions[\s\S]*selectDocumentVersion/);
  assert.match(renderer, /function restoreSelectedDocumentVersion\(\)[\s\S]*userEvent: 'input\.history-restore'/);
  assert.match(styles, /\.document-history-layout \{[^}]*grid-template-columns/);
  assert.match(styles, /\.ai-send-privacy \{[^}]*display: grid/);
});

test('unsafe Windows uninstallers force a full installer instead of in-app update', () => {
  assert.match(html, /id="manualUpdateTitle"[\s\S]*id="manualUpdateDescription"/);
  assert.match(renderer, /unsafeWindowsUninstallerTitle: '检测到旧版卸载程序，必须完整安装'/);
  assert.match(renderer, /function openUpdateDialog\(info\)[\s\S]*manualInstallReason === 'windows-unsafe-uninstaller'[\s\S]*#applyUpdate'[\s\S]*manualInstallRequired/);
  assert.match(renderer, /if \(info\?\.available \|\| info\?\.manualInstallRequired\) openUpdateDialog\(info\)/);
  assert.match(renderer, /manualInstallRequired \? state\.updateInfo\?\.manualInstallerUrl[\s\S]*installerURL \|\| 'https:\/\/qm\.ssssa\.cn\/#download'/);
});

test('unsafe Windows uninstallers show a dedicated startup warning before update checks', () => {
  assert.match(html, /id="unsafeUninstallerDialog"[\s\S]*role="alertdialog"[\s\S]*id="unsafeUninstallerDownload"/);
  assert.match(mainSource, /getWindowsInstallSafety: \(\) => desktopRuntime[\s\S]*Backend\.GetWindowsInstallSafety\(\)/);
  assert.match(renderer, /unsafeUninstallerDialogTitle: '当前卸载程序存在重大缺陷'/);
  assert.match(renderer, /async function checkWindowsInstallSafety\(\)[\s\S]*status\?\.applicable && status\.safe === false[\s\S]*return false/);
  assert.match(renderer, /if \(await checkWindowsInstallSafety\(\)\) await checkForUpdates\(false\)/);
  assert.match(renderer, /unsafeUninstallerDownloadURL[\s\S]*openExternal\(unsafeUninstallerDownloadURL\)/);
});

test('spell check marks English errors and offers correction, ignore, and personal dictionary actions', () => {
  assert.match(html, /data-spellcheck-toggle/);
  assert.match(html, /data-spellcheck-language="auto"/);
  assert.match(html, /data-spellcheck-language="en-US"/);
  assert.match(html, /data-spellcheck-language="en-GB"/);
  assert.match(html, /id="spellcheckContextMenu"/);
  assert.match(renderer, /class: 'cm-spelling-error'/);
  assert.match(renderer, /activeSpellchecker\.suggest\(normalized\)\.slice\(0, 6\)/);
  assert.match(renderer, /state\.spellcheckIgnoredWords\.add/);
  assert.match(renderer, /localStorage\.setItem\('spellcheckPersonalWords'/);
  assert.match(renderer, /spellcheckPersonalWords: readPersonalDictionary\(\)/);
  assert.match(styles, /\.cm-spelling-error \{[^}]*text-decoration-style: wavy/);
  assert.match(renderer, /spellcheck: '拼写检查'/);
  assert.match(renderer, /spellcheck: 'Spell check'/);
});

test('PicGo Cloud uploads directly while local PicGo remains compatible and every failure preserves assets', () => {
  assert.match(html, /data-action="image-upload-settings"/);
  assert.match(html, /id="imageUploadSettingsDialog"[\s\S]*name="imageUploadMode" value="local"[\s\S]*name="imageUploadMode" value="picgo-cloud"[\s\S]*name="imageUploadMode" value="picgo"/);
  assert.match(html, /id="picGoCloudSetup"[\s\S]*id="loginPicGoCloud"/);
  assert.match(html, /id="picGoSetupWizard"[\s\S]*data-picgo-step="1"[\s\S]*data-picgo-step="2"[\s\S]*data-picgo-step="3"/);
  assert.match(html, /id="downloadPicGo"[\s\S]*id="picGoInstalledNext"[\s\S]*id="testPicGo"/);
  assert.match(html, /id="picGoAdvancedSettings"[\s\S]*id="picGoServerURL"/);
  assert.match(html, /id="picGoServerURL"[^>]*value="http:\/\/127\.0\.0\.1:36677"/);
  assert.match(mainSource, /getImageUploadSettings:[\s\S]*Backend\.GetImageUploadSettings/);
  assert.match(mainSource, /loginPicGoCloud:[\s\S]*Backend\.LoginPicGoCloud/);
  assert.match(mainSource, /uploadImageToPicGoCloud:[\s\S]*Backend\.UploadImageToPicGoCloud/);
  assert.match(mainSource, /uploadImageToPicGo:[\s\S]*Backend\.UploadImageToPicGo/);
  assert.match(mainSource, /onImageUploadProgress:[\s\S]*EventsOn\('image-upload:progress'/);
  assert.match(renderer, /function setPicGoWizardStep\(step\)[\s\S]*picGoConnectionReady/);
  assert.match(renderer, /if \(state\.imageUploadMode === 'picgo'\) testPicGoConnection\(\{ automatic: true \}\)/);
  assert.match(renderer, /PICGO_DOWNLOAD_URL = 'https:\/\/picgo\.app\/'/);
  assert.match(renderer, /selectedImageUploadMode\(\) === 'picgo' && !state\.picGoConnectionReady[\s\S]*await testPicGoConnection\(\)/);
  assert.match(renderer, /async function uploadedOrLocalImagePath\(localPath\)[\s\S]*uploadImageToPicGoCloud\(state\.currentFile\.path, localPath\)[\s\S]*uploadImageToPicGo\(state\.currentFile\.path, localPath\)[\s\S]*return \{ path: localPath, uploaded: false, fallback: true \}/);
  assert.match(html, /id="imageUploadProgress"[\s\S]*id="imageUploadProgressPercent"[\s\S]*id="imageUploadProgressBar"/);
  assert.match(renderer, /function beginImageUploadProgress\(\)[\s\S]*imageUploadPreparing[\s\S]*function updateImageUploadProgress\(progress\)[\s\S]*imageUploadFinalizing/);
  assert.match(renderer, /finally \{[\s\S]*finishImageUploadProgress\(uploadRun, succeeded\)/);
  assert.match(renderer, /imageUploadingTitle: '正在上传图片'[^\n]*imageUploadFinalizing: '正在生成在线链接…'/);
  assert.match(renderer, /imageUploadingTitle: 'Uploading image'[^\n]*imageUploadFinalizing: 'Generating the online link…'/);
  assert.match(renderer, /async function handleEditorPaste\(event\)[\s\S]*savePastedImage[\s\S]*uploadedOrLocalImagePath\(imagePath\)[\s\S]*insertImageReference\(result\.path/);
  assert.match(renderer, /picGoUploadFailedFallback: '在线图床上传失败，已自动使用本地图片'/);
  assert.match(styles, /\.picgo-setup-progress \{[^}]*grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(styles, /\.image-upload-progress \{[^}]*position: fixed[^}]*grid-template-columns/);
});
