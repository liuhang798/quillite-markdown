import test from 'node:test';
import assert from 'node:assert/strict';
import { Text } from '@codemirror/state';
import { editorImageItems, editorImageGroups, alignedImageSource, imageRowSource, canJoinImageGroups, imageSourceKind, imageDimensions, sizedImageSource, resizeImageChanges } from '../src/image-layout.js';
import { transformMarkdownImages } from '../src/portable-images.js';
import { separateImageChanges, alignImageChanges } from '../src/image-layout.js';
import { marked } from 'marked';
import { EditorState } from '@codemirror/state';
import { history, undo, isolateHistory } from '@codemirror/commands';

const apply = (source, change) => source.slice(0, change.from) + change.insert + source.slice(change.to);

test('quote soft-break rows preserve all images and lone image alignment preserves following Markdown', () => {
  assert.equal(editorImageGroups('![a](a.png) > ![b](b.png)')[0].row, false);
  for (const source of ['> ![a](a.png)\n> ![b](b.png)', '> > ![a](a.png)\n> > ![b](b.png)']) {
    const group = editorImageGroups(source)[0];
    assert.equal(group.images.length, 2);
    for (let index = 0; index < 2; index++) {
      const output = apply(source, alignImageChanges(source, group, index, 'right'));
      const html = marked(output);
      assert.equal((html.match(/<img /g) || []).length, 2);
      assert.ok(html.lastIndexOf('<img ') < html.lastIndexOf('</blockquote>'));
      assert.equal(editorImageItems(output)[index].alignment, 'right');
    }
  }
  for (const prefix of ['', '> ', '> > ', '- ', '> - ']) {
    const continuation = prefix.replace(/- /g, '  ');
    const source = `${prefix}![a](a.png)\n${continuation}**keep bold** and [link](https://example.com)`;
    const group = editorImageGroups(source)[0], output = apply(source, alignImageChanges(source, group, 0, 'left'));
    const html = marked(output);
    assert.match(html, /<strong>keep bold<\/strong>/);
    assert.match(html, /href="https:\/\/example.com"/);
    assert.equal((html.match(/<img /g) || []).length, 1);
    if (prefix.includes('>')) assert.ok(html.indexOf('<strong>') < html.lastIndexOf('</blockquote>'));
    if (prefix.includes('-')) assert.ok(html.indexOf('<strong>') < html.lastIndexOf('</li>'));
  }
});

test('row alignment and container splitting each undo in one step', () => {
  for (const source of ['![a](a.png)\n![b](b.png)', '> - ![a](a.png) ![b](b.png)']) {
    for (const action of ['align', 'split']) {
      let state = EditorState.create({ doc: source, extensions: [history()] });
      const group = editorImageGroups(source)[0];
      const changes = action === 'align' ? alignImageChanges(source, group, 0, 'left') : separateImageChanges(source, group);
      state = state.update({ changes, annotations: isolateHistory.of('full'), userEvent: 'input.image-layout' }).state;
      assert.equal(undo({ state, dispatch: transaction => { state = transaction.state; } }), true);
      assert.equal(state.doc.toString(), source);
    }
  }
});

test('splitting retains quote and list containers without inventing list items', () => {
  for (const prefix of ['', '> ', '> > ', '- ', '1. ', '> - ', '  - ']) {
    const source = `${prefix}![a](a.png) ![b](b.png)`, group = editorImageGroups(source)[0];
    const output = apply(source, separateImageChanges(source, group));
    const before = marked(source), after = marked(output);
    assert.equal((after.match(/<img /g) || []).length, 2, output);
    assert.equal((after.match(/<li>/g) || []).length, (before.match(/<li>/g) || []).length, output);
    assert.equal((after.match(/<blockquote>/g) || []).length, (before.match(/<blockquote>/g) || []).length, output);
    if (prefix.includes('>')) assert.ok(after.lastIndexOf('<img ') < after.lastIndexOf('</blockquote>'), output);
    if (prefix.includes('-') || prefix.includes('1.')) assert.ok(after.lastIndexOf('<img ') < after.lastIndexOf('</li>'), output);
  }
});

test('aligning any soft-break image preserves the complete row and references', () => {
  for (const separator of [' ', '\n', '  \n']) {
    const source = ['![a](a.png)', '![b](b.png)', '![c](c.png)'].join(separator);
    const group = editorImageGroups(source)[0];
    for (let index = 0; index < 3; index++) {
      const output = apply(source, alignImageChanges(source, group, index, 'right'));
      assert.equal((marked(output).match(/<img /g) || []).length, 3);
      assert.deepEqual(editorImageItems(output).map(image => image.ref), ['a.png', 'b.png', 'c.png']);
      assert.equal(editorImageItems(output)[index].alignment, 'right');
    }
  }
});

test('HTML paths do not undergo Markdown unescaping; entities decode exactly once', () => {
  for (const [source, expected] of [
    ['![a](assets/a&#46;png)', 'assets/a.png'], ['![a](assets/a&#x2e;png)', 'assets/a.png'],
    ['![a](assets/a&sol;b.png)', 'assets/a/b.png'], ['![a](assets/a&amp;#46;png)', 'assets/a&#46;png'],
    [String.raw`![a](assets/a\&amp;png)`, 'assets/a&amp;png'],
    [String.raw`<img src="D:\assets\_a.jpg">`, String.raw`D:\assets\_a.jpg`]
  ]) {
    const [item] = editorImageItems(source); assert.equal(item.ref, expected);
    assert.equal(editorImageItems(alignedImageSource(source, item, 'left'))[0].ref, expected);
  }
});

test('custom image width and height persist, reset cleanly, and undo in one step', () => {
  const source = '![产品图](assets/product.png "保留标题")';
  const group = editorImageGroups(source)[0];
  const change = resizeImageChanges(source, group, 0, { width: '64%', height: '280' });
  const output = apply(source, change), [image] = editorImageItems(output);
  assert.deepEqual(imageDimensions(image), { width: '64%', height: '280' });
  assert.match(output, /title="保留标题"/);
  assert.match(marked(output), /width="64%"/);
  assert.match(marked(output), /height="280"/);

  let state = EditorState.create({ doc: source, extensions: [history()] });
  state = state.update({ changes: change, annotations: isolateHistory.of('full'), userEvent: 'input.image-layout' }).state;
  assert.equal(undo({ state, dispatch: transaction => { state = transaction.state; } }), true);
  assert.equal(state.doc.toString(), source);

  const resetChange = resizeImageChanges(output, editorImageGroups(output)[0], 0, { width: '', height: '' });
  const reset = apply(output, resetChange), [resetImage] = editorImageItems(reset);
  assert.deepEqual(imageDimensions(resetImage), { width: '', height: '' });
  assert.ok(!/\s(?:width|height)=/i.test(reset));
  assert.match(reset, /title="保留标题"/);
});

test('resizing one image in a Markdown row keeps every sibling and validates dimensions', () => {
  const source = '![a](a.png) ![b](b.png)';
  const output = apply(source, resizeImageChanges(source, editorImageGroups(source)[0], 1, { width: '320px', height: '180px' }));
  const [group] = editorImageGroups(output);
  assert.equal(group.row, true);
  assert.deepEqual(group.images.map(image => image.ref), ['a.png', 'b.png']);
  assert.deepEqual(imageDimensions(group.images[1]), { width: '320', height: '180' });
  assert.deepEqual(imageDimensions(group.images[0]), { width: '', height: '' });
  const [item] = editorImageItems('![a](a.png)');
  assert.throws(() => sizedImageSource('![a](a.png)', item, { width: '101%', height: '' }), /Invalid image width/);
  assert.throws(() => sizedImageSource('![a](a.png)', item, { width: '50%', height: '5000' }), /Invalid image height/);
  assert.throws(() => sizedImageSource('![a](a.png)', item, { width: '1;display:none', height: '' }), /Invalid image width/);
});

test('all supported storage forms expose alignment without changing their references', () => {
  for (const ref of ['assets/a.jpg', 'folder%20name/a.webp', 'D:/图片/a.png', '/tmp/a.gif', 'file:///D:/a.bmp', 'https://example.com/a.png?x=1&y=2', '//example.com/a.svg', 'data:image/png;base64,AAAA', 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E']) {
    const source = `![A](<${ref}> "Title")`, [item] = editorImageItems(source);
    assert.ok(item, ref);
    for (const alignment of ['left', 'center', 'right']) {
      const output = alignedImageSource(source, item, alignment), [result] = editorImageItems(output);
      assert.equal(result.ref, ref); assert.equal(result.alignment, alignment); assert.equal(result.title, undefined);
      assert.ok(output.includes('title="Title"'));
    }
  }
  for (const ref of ['javascript:alert(1)', 'data:text/html,evil', 'blob:unknown', '#anchor', 'https://x/\nsecret']) assert.equal(imageSourceKind(ref), null);
});

test('reference image alignment leaves shared definitions and links intact', () => {
  const source = '![first][id]\n\n![second][id]\n\n[link][id]\n\n[id]: assets/photo.jpg "原题"';
  const [item] = editorImageItems(source), changed = source.slice(0, item.from) + alignedImageSource(source.slice(item.from, item.to), item, 'right') + source.slice(item.to);
  assert.ok(changed.endsWith('[id]: assets/photo.jpg "原题"'));
  assert.ok(changed.includes('![second][id]')); assert.ok(changed.includes('[link][id]'));
  assert.deepEqual(editorImageItems(changed).map(image => image.ref), ['assets/photo.jpg', 'assets/photo.jpg']);
});

test('two to six mixed image forms become one row, with exact references and per-image alignment', async () => {
  const source = '![A](assets/a.jpg)\n\n<img src="data:image/png;base64,AAAA" width="50%" title="Keep" style="margin-left:auto;margin-right:0">\n\n![C](https://example.com/c.webp)';
  const images = editorImageItems(source), row = imageRowSource(source, images), [group] = editorImageGroups(row);
  assert.equal(group.row, true); assert.equal(group.images.length, 3);
  assert.deepEqual(group.images.map(image => image.ref), images.map(image => image.ref));
  assert.equal(group.images[1].alignment, 'right'); assert.ok(row.includes('width="50%"')); assert.ok(row.includes('title="Keep"'));
  const twoLocal = '![a](a.png)\n\n![b](b.jpg)', portableRow = imageRowSource(twoLocal, editorImageItems(twoLocal));
  const portable = await transformMarkdownImages(portableRow, async () => 'data:image/png;base64,AAAA', { portable: true });
  assert.equal(editorImageGroups(portable)[0].images.length, 2);
  for (const count of [2, 6]) {
    const input = Array.from({ length: count }, (_, i) => `![${i}](${i}.jpg)`).join('\n\n');
    assert.equal(editorImageGroups(imageRowSource(input, editorImageItems(input)))[0].images.length, count);
  }
  assert.throws(() => imageRowSource(source, []));
});

test('same-paragraph images form rows; prose and arbitrary HTML tables never disappear', () => {
  for (const separator of [' ', '\n']) assert.equal(editorImageGroups(`![a](a.png)${separator}![b](b.png)`)[0].images.length, 2);
  assert.equal(editorImageGroups('caption ![a](a.png) ![b](b.png)').length, 2);
  const source = '![a](a.png)\n\n![b](b.png)', row = imageRowSource(source, editorImageItems(source));
  for (const tampered of [row.replace('<tbody>', '<caption>do not hide</caption><tbody>'), row.replace('</td>', 'keep text</td>'), row.replace('quillite-image-row', 'ordinary-table')]) {
    assert.equal(editorImageGroups(tampered).length, 2); assert.equal(editorImageGroups(tampered)[0].row, false);
  }
});

test('joining adjacent image-only blocks checks the text rope and never consumes prose/list markers', () => {
  for (const source of ['![a](a.png)\n\n![b](b.png)', '![a](a.png) ![b](b.png)\n\n![c](c.png)']) {
    const groups = editorImageGroups(source);
    assert.equal(canJoinImageGroups(source, groups[0], groups[1]), true);
    assert.equal(canJoinImageGroups(Text.of(source.split('\n')), groups[0], groups[1]), true);
  }
  for (const source of ['![a](a.png)\n\ncaption\n\n![b](b.png)', 'before ![a](a.png)\n\n![b](b.png)', '![a](a.png)\n\n![b](b.png) after', '- ![a](a.png)\n\n![b](b.png)']) {
    const groups = editorImageGroups(source); assert.equal(canJoinImageGroups(source, groups[0], groups[1]), false, source);
  }
  const source = Array.from({ length: 7 }, (_, i) => `![${i}](${i}.png)`).join(' ');
  assert.equal(editorImageGroups(source).length, 7);
});
