import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EditorState, Compartment } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { embeddedImageItems, alignedImageSource, imageAlignment, imagePreviewField, toggleImageSource, refreshImagePreviews, imagePreviewPhrases, imagePreviewContext, updateImagePreviewDirectory } from '../src/embedded-image-preview.js';
import { editorImageGroups } from '../src/image-layout.js';

const data = 'data:image/png;base64,iVBORw0KGgo=';
const image = `![图片](${data} "title")`;
const create = source => EditorState.create({ doc: source, extensions: [imagePreviewField, history()] });

test('single-image actions wrap together without turning the image into a scroll container', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.cm-embedded-image \{[^}]*overflow: clip;/);
  assert.match(css, /\.cm-image-tools \{[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.cm-embedded-image:is\(:hover, :focus-within\) \{ overflow: visible;/);
  const source = readFileSync(new URL('../src/embedded-image-preview.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!this\.item\.row\) \{ toolbar\.append\(tools, sizeTools\); \}/);
  assert.match(source, /toolbar\.querySelectorAll\(':scope > button'\)/);
  assert.match(source, /const controlRoot = group\.row \? toolbar\.querySelectorAll\('\.cm-image-item-tools'\)\[index\] : toolbar/);
  assert.match(source, /if \(!current\.open\) view\.requestMeasure/);
  assert.match(source, /!root\.isConnected \|\| !this\.current\(view\)\?\.open/);
});

test('image groups share a bounded toolbar and keyboard-accessible image picker', () => {
  const source=readFileSync(new URL('../src/embedded-image-preview.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  for(const fragment of ["picker.onchange = () => selectImageControls", "panel.hidden = i !== index", "['Enter', ' ', 'Escape']", "Math.min(innerWidth - 8", "toolbar.style.cssText = ''"] ) assert.ok(source.includes(fragment),fragment);
  assert.match(css,/\.cm-image-item-tools\[hidden\] \{ display: none;/);
  const liveCSS=readFileSync(new URL('../src/editor-live-preview.css',import.meta.url),'utf8');
  assert.match(liveCSS,/\.cm-live-inner:has\(\.cm-embedded-image\.is-image-row[^\n]+z-index: 3;/);
  assert.equal(imagePreviewPhrases['Edit image'],'操作图片');
});

test('expanded image source keeps an in-flow, always-visible return control', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const rule = css.match(/\.cm-embedded-image\.is-source-open > \.cm-image-tools\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  for (const declaration of ['position: static', 'opacity: 1', 'visibility: visible', 'pointer-events: auto', 'transform: none']) {
    assert.ok(rule.includes(declaration), declaration);
  }
  assert.equal(imagePreviewPhrases['Hide source'], '收起源码');
});

test('Save As updates local image directory and async session without changing source or undo history', () => {
  let state = EditorState.create({ doc: '![a](assets/a.jpg)', extensions: [history(), imagePreviewField, imagePreviewContext.of({ directory: '/old', readImageData: () => '' })] });
  state = state.update({ changes: { from: state.doc.length, insert: '\nText' }, userEvent: 'input' }).state;
  const before = state.field(imagePreviewField).session, source = state.doc.toString();
  const transaction = state.update({ effects: updateImagePreviewDirectory.of('/new') });
  assert.equal(transaction.docChanged, false); state = transaction.state;
  const after = state.field(imagePreviewField).session;
  assert.notEqual(before, after); assert.equal(after.context.directory, '/new'); assert.equal(state.doc.toString(), source);
  assert.equal(undo({ state, dispatch: transaction => { state = transaction.state; } }), true);
  assert.equal(state.doc.toString(), '![a](assets/a.jpg)'); assert.equal(state.field(imagePreviewField).session, after);
});

test('folded inline / multiline embedded images keep exact Markdown and surrounding text', () => {
  for (const source of [image, `before ${image} after`, `before ![图片](\n${data}) after`]) {
    const state = create(source), field = state.field(imagePreviewField);
    assert.equal(state.doc.toString(), source);
    assert.equal(field.items.length, 1);
    assert.equal(field.atoms.size, 1);
    assert.ok(source.slice(field.items[0].from, field.items[0].to).startsWith('![图片]'));
    assert.equal(field.items[0].ref, data);
  }
});

test('code, escapes and ordinary links are not rendered; all safe image storage forms are', () => {
  const source = `\`${image}\`\n\n\\${image}\n\n\`\`\`md\n${image}\n\`\`\`\n\n[text](${data})\n\n![a](a.png)\n\n![b](https://example.com/x.png)\n\n![svg](data:image/svg+xml;base64,AAAA)\n\n![ref][id]\n\n[id]: ${data}\n\n<!-- ${image} -->`;
  assert.deepEqual(embeddedImageItems(source).map(item => item.sourceKind), ['local', 'remote', 'embedded', 'embedded']);
  assert.equal(embeddedImageItems(`<img src="${data}" srcset="remote.png 2x">\n\n${image}`).length, 2);
  assert.equal(embeddedImageItems(`<img src="${data}" src="different.png">`).length, 0);
});

test('HTML previews use actual src and preserve attributes during alignment', () => {
  const source = `<img data-src="not.png" alt="A &amp; B" width="50%" title="T" src='${data}' style='border:1px solid red; margin:1em auto'>`;
  const [item] = embeddedImageItems(source);
  assert.equal(item.alt, 'A & B');
  for (const alignment of ['left', 'center', 'right']) {
    const aligned = alignedImageSource(source, item, alignment);
    assert.ok(aligned.includes(`src='${data}'`));
    assert.ok(aligned.includes('width="50%"'));
    assert.ok(aligned.includes('border:1px solid red'));
    assert.equal(embeddedImageItems(aligned)[0].alignment, alignment);
  }
});

test('Markdown alignment persists as standard HTML with escaped alt/title, without modifying data', () => {
  const source = `![<A & B>](${data} 'A "title"')`;
  const [item] = embeddedImageItems(source);
  for (const alignment of ['left', 'center', 'right']) {
    const aligned = alignedImageSource(source, item, alignment);
    assert.ok(aligned.includes(`src="${data}"`));
    assert.ok(aligned.includes('alt="&lt;A &amp; B&gt;"'));
    assert.ok(aligned.includes('title="A &quot;title&quot;"'));
    assert.equal(embeddedImageItems(aligned)[0].alignment, alignment);
  }
  assert.throws(() => alignedImageSource(source, item, 'evil'), /Invalid/);
  assert.equal(imageAlignment('margin-left:AUTO; margin-right:0px'), 'right');
});

test('show/hide source changes only presentation, not document or undo history', () => {
  let state = create(image), item = state.field(imagePreviewField).items[0];
  const toggle = toggleImageSource.of({ from: item.from, to: item.to });
  let transaction = state.update({ effects: toggle });
  assert.equal(transaction.docChanged, false);
  state = transaction.state;
  assert.equal(state.field(imagePreviewField).atoms.size, 0);
  assert.equal(state.field(imagePreviewField).decorations.size, 1);
  assert.equal(state.doc.toString(), image);
  assert.equal(undo({ state, dispatch() {} }), false);
  state = state.update({ effects: toggle }).state;
  assert.equal(state.field(imagePreviewField).atoms.size, 1);
});

test('alignment is a single undoable edit and session tokens never cross fresh EditorStates', () => {
  let state = create(`before\n${image}\nafter`), item = state.field(imagePreviewField).items[0];
  const original = state.doc.toString();
  const insert = alignedImageSource(state.doc.sliceString(item.from, item.to), item, 'right');
  state = state.update({ changes: { from: item.from, to: item.to, insert }, userEvent: 'input.image-align' }).state;
  assert.equal(undo({ state, dispatch: transaction => { state = transaction.state; } }), true);
  assert.equal(state.doc.toString(), original);
  assert.equal(state.field(imagePreviewField).items.length, 1);
  assert.notEqual(create(image).field(imagePreviewField).session, create(image).field(imagePreviewField).session);
});

test('edits outside an image map ranges immediately, stale scans are ignored, edits inside expose source', () => {
  let state = create(`prefix\n${image}\nsuffix`);
  const doc = state.doc, old = state.field(imagePreviewField).items[0];
  state = state.update({ changes: { from: 0, insert: 'added' } }).state;
  const item = state.field(imagePreviewField).items[0];
  assert.equal(item.from, old.from + 5);
  assert.equal(state.doc.sliceString(item.from, item.to), image);
  state = state.update({ effects: refreshImagePreviews.of({ doc, items: [] }) }).state;
  assert.equal(state.field(imagePreviewField).items.length, 1);
  state = state.update({ changes: { from: item.from + 3, insert: 'edit' } }).state;
  assert.equal(state.field(imagePreviewField).items.length, 0);
  state = state.update({ effects: refreshImagePreviews.of({ doc: state.doc, items: editorImageGroups(state.doc.toString()) }) }).state;
  assert.equal(state.field(imagePreviewField).items.length, 1);
});

test('explicit selection into hidden source reveals it; language changes rebuild labels', () => {
  const language = new Compartment();
  let state = EditorState.create({ doc: image, extensions: [imagePreviewField, language.of([])] });
  state = state.update({ effects: language.reconfigure(EditorState.phrases.of(imagePreviewPhrases)) }).state;
  assert.equal(state.field(imagePreviewField).decorations.iter().value.spec.widget.labels['Show source'], '查看源码');
  state = state.update({ selection: { anchor: 5 } }).state;
  assert.equal(state.field(imagePreviewField).items[0].open, true);
});

test('editing expanded source stays expanded after deferred rescanning', () => {
  let state = create(image);
  state = state.update({ selection: { anchor: 4 } }).state;
  state = state.update({ changes: { from: 4, insert: '新' }, selection: { anchor: 5 } }).state;
  state = state.update({ effects: refreshImagePreviews.of({ doc: state.doc, items: editorImageGroups(state.doc.toString()) }) }).state;
  assert.equal(state.field(imagePreviewField).items[0].open, true);
  assert.equal(state.field(imagePreviewField).atoms.size, 0);
});

test('HTML alignment handles self-closing tags without damaging the URL, title or width', () => {
  const source = `<img alt="&lt;literal&gt;" src="${data}" width="80%" />`;
  const [item] = embeddedImageItems(source);
  const aligned = alignedImageSource(source, item, 'right');
  assert.ok(aligned.endsWith('/>'));
  assert.ok(aligned.includes(`src="${data}"`));
  assert.ok(aligned.includes('width="80%"'));
  assert.equal(embeddedImageItems(aligned)[0].alignment, 'right');
});

test('multi-megabyte encoded lines avoid recursion; image count is bounded', () => {
  const large = `![big](data:image/png;base64,${'A'.repeat(3_000_000)})`;
  assert.equal(embeddedImageItems(large)[0].ref.length, 3_000_022);
  const state = create(large);
  assert.equal(state.field(imagePreviewField).decorations.size, 1);
  assert.equal(state.doc.toString(), large);
  assert.equal(embeddedImageItems(Array(260).fill(image).join('\n\n')).length, 256);
});
