import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { documentListName } from '../src/document-list-name.js';
import { directoryFromDocumentPath, sameDocumentPath } from '../src/library-state.js';

for (const [name, title, extension, kind] of [
  ['国际站数据库结构与业务关系手册.md', '国际站数据库结构与业务关系手册', '.md', 'markdown'],
  ['release.v3.0.2.textpack', 'release.v3.0.2', '.textpack', 'textpack'],
  ['图表范例.MD', '图表范例', '.MD', 'markdown'],
  ['notes.TEXTBUNDLE', 'notes', '.TEXTBUNDLE', 'textbundle'],
  ['guide.markdown', 'guide', '.markdown', 'markdown'],
  ['notes.txt', 'notes', '.txt', 'text'],
  ['data.csv', 'data', '.csv', 'other'],
  ['.gitignore', '.gitignore', '', 'other'],
  ['.draft.md', '.draft', '.md', 'markdown'],
  ['README', 'README', '', 'other'],
  ['name.', 'name.', '', 'other'],
  ['文档.第一版.md', '文档.第一版', '.md', 'markdown'],
  ['a.<img onerror=x>', 'a', '.<img onerror=x>', 'other'],
]) {
  test(`document list separates only the final extension: ${name}`, () => {
    assert.deepEqual(documentListName(name), { title, extension, kind });
    assert.equal(name, title + extension, 'display formatting must retain the original identity');
  });
}

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function render(file, changes = {}, pinned = false) {
  const state = { currentFile: null, favoriteFiles: [], sidebarMode: 'recent', ...changes };
  const c = vm.createContext({ documentListName, directoryFromDocumentPath, sameDocumentPath, escapeHtml,
    state, pinMutationInProgress: false, fileIcon: () => '<svg></svg>',
    t: (key, values) => values?.name ? `${key}: ${values.name}` : key,
  });
  vm.runInContext(renderer.slice(renderer.indexOf('function renderFileRow('), renderer.indexOf('function renderRecentFileGroups(')), c);
  return c.renderFileRow(file, pinned);
}

test('list markup preserves the full name and path, renders the stem and a separate exact suffix', () => {
  const file = { path: 'C:\\文档\\notes.v3.textpack', name: 'notes.v3.textpack', directory: 'C:\\文档' };
  const before = structuredClone(file);
  const html = render(file);
  assert.match(html, /<strong>notes\.v3<\/strong>/);
  assert.match(html, /data-file-kind="textpack"[^>]*>\.textpack<\/span>/);
  assert.ok(html.includes(`data-path="${encodeURIComponent(file.path)}"`));
  assert.ok(html.includes('aria-label="notes.v3.textpack, C:\\文档"'));
  assert.ok(html.includes('notes.v3.textpack\nC:\\文档\\notes.v3.textpack'));
  assert.deepEqual(file, before);
});

test('favorites retain the path while their marker conveys favorite status', () => {
  const file = { path: '/notes/guide.md', name: 'guide.md', directory: '/notes' };
  const html = render(file, { sidebarMode: 'favorites', favoriteFiles: [file] }, true);
  assert.match(html, /class="favorite-marker"/);
  assert.match(html, /class="pin-marker"/);
  assert.match(html, /class="pin-drag-handle"/);
  assert.match(html, /class="file-location">\/notes<\/span>/);
});

test('missing rows keep their warning and full document identity', () => {
  const html = render({ path: '/missing/guide.md', name: 'guide.md', directory: '/missing', exists: false });
  assert.match(html, /class="file-row missing"/);
  assert.match(html, /aria-disabled="true" data-missing="true"/);
  assert.match(html, /aria-label="recentMissingAria: guide\.md"/);
  assert.match(html, /class="file-location">recentMissing<\/span>/);
  assert.match(html, /class="file-meta-line" title="\/missing"/);
});

test('Explorer relative directories stay readable and expose full absolute paths on hover', () => {
  const root = render({ path: '/project/notes.textpack', name: 'notes.textpack', directory: '.' }, { sidebarMode: 'explorer' });
  assert.match(root, /class="file-location">\/project<\/span>/);
  assert.match(root, /class="file-meta-line" title="\/project"/);
  const nested = render({ path: '/project/docs/guide.md', name: 'guide.md', directory: 'docs' }, { sidebarMode: 'explorer' });
  assert.match(nested, /class="file-location">docs<\/span>/);
  assert.match(nested, /class="file-meta-line" title="\/project\/docs"/);
  assert.match(nested, /aria-label="guide.md, \/project\/docs"/);
});

test('unsafe names and paths remain escaped text and never become a CSS kind', () => {
  const file = { path: '/x/<img onerror="boom">.md', name: '<img onerror="boom">.md', directory: '/x/<unsafe>' };
  const html = render(file);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<unsafe>'));
  assert.match(html, /<strong>&lt;img onerror=&quot;boom&quot;&gt;<\/strong>/);
  assert.match(html, /data-file-kind="markdown"/);
  const unsafeSuffix = render({ path: '/x/name."><img src=x>', name: 'name."><img src=x>', directory: '/x' });
  assert.ok(!unsafeSuffix.includes('<img'));
  assert.match(unsafeSuffix, /data-file-kind="other"/);
});

test('extensionless and oversized unknown suffixes use bounded neutral labels', () => {
  assert.match(render({ path: '/README', name: 'README', directory: '/' }), />documentTypeNoExtension<\/span>/);
  const extension = '.' + 'unusual'.repeat(20);
  const html = render({ path: '/notes' + extension, name: 'notes' + extension, directory: '/' });
  assert.match(html, />documentTypeFile<\/span>/);
  assert.ok(html.includes(extension), 'the complete extension remains available in the tooltip');
});

test('the two-line layout keeps suffix badges fixed while only the path ellipsizes', () => {
  assert.match(styles, /\.file-list \{[^}]*min-width: 0;/);
  assert.match(styles, /\.file-meta-line \{[^}]*display: flex/);
  assert.match(styles, /\.file-type-badge \{[^}]*flex: 0 0 auto;[^}]*white-space: nowrap/);
  assert.match(styles, /\.file-location \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis/);
  assert.match(styles, /\.file-type-badge\[data-file-kind="textpack"\][^}]*var\(--md-color-blue\)/);
  assert.match(styles, /\.file-type-badge\[data-file-kind="textbundle"\][^}]*var\(--md-color-purple\)/);
});
