import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { editorLivePreview, livePreviewField, liveSourceBlock, buildLivePlan } from '../src/editor-live-preview.js';
import { editorFormulaField } from '../src/editor-formula-preview.js';
import { imagePreviewField, toggleImageSource } from '../src/embedded-image-preview.js';
import { editorDiagramField } from '../src/editor-diagram-preview.js';
import { renderedContainerRanges, singleLineMedia } from '../src/media-ownership.js';
import { editableProjectionSync } from '../src/editable-owner.js';

const body = '公式 $x^2$\n\n![img](https://example.com/a.png)\n\n```mermaid\nflowchart LR\nA --> B\n```';
const wrap = content => `<details open>\n<summary>标题</summary>\n\n${content}\n\n</details>`;
const fields = [editorFormulaField, imagePreviewField, editorDiagramField];
const create = doc => EditorState.create({ doc, extensions: [...fields, editorLivePreview] });
const counts = state => fields.map(field => state.field(field).decorations.size);

test('cell image line breaks are hidden only between closed image previews', () => {
  const source='![a](https://example.com/a.png)<br><br>![b](https://example.com/b.png)';
  let state=EditorState.create({doc:source,extensions:[imagePreviewField,singleLineMedia.of(true)]});
  let images=state.field(imagePreviewField);
  assert.equal(images.items.length,2);assert.equal(images.decorations.size,3);assert.equal(images.atoms.size,3);
  state=state.update({effects:toggleImageSource.of({from:images.items[0].from,to:images.items[0].to})}).state;
  assert.equal(state.field(imagePreviewField).decorations.size,2);assert.equal(state.doc.toString(),source);
  assert.equal(EditorState.create({doc:source,extensions:[imagePreviewField]}).field(imagePreviewField).decorations.size,2);
  const prose=source.replace('<br><br>','<br>retain<br>');
  assert.equal(EditorState.create({doc:prose,extensions:[imagePreviewField,singleLineMedia.of(true)]}).field(imagePreviewField).decorations.size,2);
});

test('mixed structured blocks delegate media without duplicate replacement ranges', () => {
  const source = wrap(body), state = create(source);
  assert.equal(state.field(livePreviewField).plan.widgets[0].kind, 'details');
  assert.deepEqual(counts(state), [0, 0, 0]);
  assert.deepEqual(counts(create(body)), [1, 1, 1]);
  assert.equal(state.doc.toString(), source);
});

test('table cells own direct Markdown and HTML images with formulas in every container', () => {
  for (const image of ['![图](https://example.com/a.png)', '<img src="https://example.com/a.png" width="80">', '<img src="data:image/png;base64,'+'A'.repeat(310000)+'" width="80">']) {
    const table='| 公式 | 图片 |\n| --- | --- |\n| $x^2$ | '+image+' |';
    for (const [intro,prefix,outro] of [['','',''],['','> ',''],['- 项目\n\n','  ',''],['<details open>\n<summary>标题</summary>\n\n','','\n\n</details>']]) {
      const source=intro+table.split('\n').map(line=>prefix+line).join('\n')+outro;
      let state=create(source);
      assert.deepEqual(counts(state),[0,0,0]);
      const owner=state.field(livePreviewField).plan.widgets.find(item=>['table','details'].includes(item.kind));
      assert.equal(owner.kind,intro.startsWith('<details')?'details':'table');
      if(owner.kind==='table') assert.equal(source.slice(owner.cells[3].from,owner.cells[3].to),image);
      state=state.update({effects:liveSourceBlock.of(owner.from),selection:{anchor:owner.from+1}}).state;
      assert.deepEqual(counts(state),[1,1,0]);
      state=state.update({effects:liveSourceBlock.of(null)}).state;
      assert.deepEqual(counts(state),[0,0,0]);assert.equal(state.doc.toString(),source);
    }
  }
});

test('shared reference images delegate to a rendered table without an outer duplicate', () => {
  const source='| 公式 | 图片 |\n| --- | --- |\n| $x^2$ | ![图][ref] |\n\n[ref]: https://example.com/a.png';
  const state=create(source);
  assert.equal(state.field(livePreviewField).plan.widgets.some(item=>item.kind==='table'),true);
  assert.deepEqual(counts(state),[0,0,0]);assert.equal(state.doc.toString(),source);
});
test('source return moves media ownership back and forth without losing scanned items', () => {
  let state = create(wrap(body));
  state = state.update({ effects: liveSourceBlock.of(0), selection: { anchor: 1 } }).state;
  assert.equal(state.facet(renderedContainerRanges).length, 0);
  assert.deepEqual(counts(state), [1, 1, 1]);
  state = state.update({ effects: liveSourceBlock.of(null) }).state;
  assert.deepEqual(counts(state), [0, 0, 0]);
  assert.ok(fields.every(field => state.field(field).items.length === 1));
});
test('nested HTML and details keep only the current outer container as media owner', () => {
  const nested = `<div>\n\n${wrap(body)}\n\n</div>`;
  assert.deepEqual(counts(create(nested)), [0, 0, 0]);
  assert.deepEqual(counts(create(wrap(body))), [0, 0, 0]);
  assert.deepEqual(counts(create(body)), [1, 1, 1]);
});
test('media outside a structured block stays visible while internal media is delegated', () => {
  const state = create(body + '\n\n' + wrap(body));
  assert.deepEqual(counts(state), [1, 1, 1]);
});
test('HTML image markup and embedded payloads retain exact body and source offsets', () => {
  for (const payload of ['AAAA', 'A'.repeat(310000)]) {
    const image = `<img src="data:image/png;base64,${payload}" width="100" alt="图片">`;
    const source = wrap('$x$\n\n' + image), item = buildLivePlan(source).widgets[0];
    assert.equal(item.kind, 'details');
    assert.equal(source.slice(item.cells[1].from, item.cells[1].to), '$x$\n\n' + image);
    assert.equal(item.raw, source);
  }
});
test('unsupported HTML never suppresses independent media previews', () => {
  const state = create(wrap(body).replace('<details open>', '<details class="custom">'));
  assert.equal(state.facet(renderedContainerRanges).length, 0);
  assert.deepEqual(counts(state), [1, 1, 1]);
});
test('projection updates immediately refresh media without a source-flash interval', () => {
  let state = create(body);
  state = state.update({ changes: { from: 0, to: state.doc.length, insert: body.replace('$x^2$', '$x^3$') }, annotations: editableProjectionSync.of(true) }).state;
  assert.deepEqual(counts(state), [1, 1, 1]);
  assert.equal(state.field(editorFormulaField).items[0].source, 'x^3');
});
test('fake container tags inside an HTML image attribute do not close the real section', () => {
  const source = wrap('<img src="https://example.com/a.png" alt="</details>">');
  const plan = buildLivePlan(source);
  assert.equal(plan.widgets.length, 1); assert.equal(plan.widgets[0].raw, source);
});
test('presentation-only ownership toggles preserve source and neighboring media', () => {
  const source = '$a$\n\n' + wrap(body) + '\n\n$b$';
  let state = create(source);
  const owner = state.field(livePreviewField).plan.widgets[0];
  assert.deepEqual(counts(state), [2, 0, 0]);
  for (let i = 0; i < 3; i++) {
    state = state.update({ effects: liveSourceBlock.of(owner.from), selection: { anchor: owner.from + 1 } }).state;
    assert.deepEqual(counts(state), [3, 1, 1]);
    state = state.update({ effects: liveSourceBlock.of(null) }).state;
    assert.deepEqual(counts(state), [2, 0, 0]);
  }
  assert.equal(state.doc.toString(), source);
});
