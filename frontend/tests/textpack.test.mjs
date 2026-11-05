import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTextPackExport, prepareTextBundleImport } from '../src/textpack.js';

test('packaging rewrites only actual images and deduplicates without changing the source', () => {
  const source = '# 中文\n\n![a](assets/photo.png "title") ![b](assets/photo.png)\n\n`![code](assets/photo.png)`\n\n```md\n![code](assets/photo.png)\n```\n\n[link](assets/photo.png)';
  const result = prepareTextPackExport(source);
  assert.deepEqual(result.images, [{source:'assets/photo.png',target:'assets/image-001.png'}]);
  assert.equal(result.content, source.replace('![a](assets/photo.png "title")', '![a](<assets/image-001.png> "title")').replace('![b](assets/photo.png)', '![b](<assets/image-001.png>)'));
  assert.ok(!('offlineComplete' in result));
});

test('reference definitions shared with normal links remain unchanged', () => {
  const source = '![image][id]\n\n[ordinary][id]\n\n[id]: <中文 图.png> "title"';
  const result = prepareTextPackExport(source);
  assert.deepEqual(result.images,[{source:'中文 图.png',target:'assets/image-001.png'}]);
  assert.equal(result.content, source.replace('![image][id]', '![image](<assets/image-001.png> "title")'));
});

test('Markdown copies use a unique nested asset directory without touching literal examples', () => {
  const source = '![a](a.png)\n\n`![example](a.png)`';
  const result = prepareTextPackExport(source, {assetDirectory: 'assets/quillite-operation-id'});
  assert.equal(result.images[0].target, 'assets/quillite-operation-id/image-001.png');
  assert.match(result.content, /`!\[example\]\(a.png\)`/);
  for (const directory of ['../assets', 'assets/../host', '/assets', 'assets/%2e%2e', 'assets\\host']) {
    assert.throws(() => prepareTextPackExport(source, {assetDirectory: directory}), /TEXTPACK_INVALID/);
  }
});

test('footnotes, HTML width, comments and formulas retain exact source coordinates', () => {
  const source = 'Note[^n]\n\n[^n]: text\n    \n    ![a](p.webp)\n    \n    <img src="p.webp" width="200">\n\n<!-- <img src="keep.webp"> -->\n\n$\\text{![x](keep.webp)}$';
  const result = prepareTextPackExport(source);
  assert.deepEqual(result.images,[{source:'p.webp',target:'assets/image-001.webp'}]);
  assert.equal(result.content,source.replace('![a](p.webp)','![a](<assets/image-001.webp>)').replace('src="p.webp"','src="assets/image-001.webp"'));
});

test('network images remain links and never become backend file reads', () => {
  const source = '![a](https://example.invalid/a.png) ![b](http://example.invalid/b.png) ![c](//example.invalid/c.png)';
  for (const prepare of [prepareTextPackExport, prepareTextBundleImport]) {
    const result = prepare(source);
    assert.equal(result.content,source); assert.equal(result.remoteCount,3);
    assert.equal(result.warnings.length,3); assert.equal(result.images?.length || 0,0);
  }
});

test('embedded data is represented once without sending it to warning UI', () => {
  const source = '![a](data:image/png;base64,iVBORw0KGgo=)';
  const result = prepareTextPackExport(source);
  assert.equal(result.images[0].target,'assets/image-001.png');
  assert.equal(prepareTextBundleImport(source).content,source);
  const bad = prepareTextBundleImport('![a](data:image/svg+xml;base64,'+'A'.repeat(10000)+')');
  assert.equal(bad.warnings[0].reference,'[embedded image]');
  assert.ok(bad.content.length < 200);
});

test('imports use package assets and encode filenames safely', () => {
  const source = '![a](<./assets/中文 图.png>)\n<img src="assets/a&amp;b.webp" width="50%">';
  const result = prepareTextBundleImport(source,['assets/中文 图.png','assets/a&b.webp']);
  assert.equal(result.warnings.length,0);
  assert.equal(result.content,'![a](<assets/%E4%B8%AD%E6%96%87%20%E5%9B%BE.png>)\n<img src="assets/a%26b.webp" width="50%">');
});

for (const ref of ['../secret.png','/home/me/secret.png','file:///home/me/secret.png','file://server/share/a.png','C:/secret.png','assets/../secret.png','assets/%2e%2e/secret.png','assets/%252e%252e/secret.png','assets/a%5cb.png','assets/a%00.png','assets/a%3ab.png','assets/%xx.png','javascript:alert(1)']) {
  test(`import never resolves host paths: ${ref}`, () => {
    const result = prepareTextBundleImport(`![a](<${ref}>)`,[]);
    assert.equal(result.missingCount,1);
    assert.match(result.content,/assets\/quillite-missing\/image-001\./);
    assert.ok(!result.content.includes(ref));
  });
}

test('missing images are explicit and placeholders cannot collide with real attachments', () => {
  const result = prepareTextBundleImport('![x](assets/missing.png) ![x](assets/missing.png) ![y](assets/A.png)', ['assets/a.png','assets/quillite-missing/image-001.png','assets/quillite-missing-1/image-001.png']);
  assert.equal(result.missingCount,2); assert.equal(result.warnings.length,2);
  assert.match(result.content,/assets\/quillite-missing-2\/image-001.png/);
  assert.match(result.content,/assets\/quillite-missing-2\/image-002.png/);
});

test('missing placeholders avoid case-insensitive filesystem aliases', () => {
  const result = prepareTextBundleImport('![x](absent.png)', ['assets/Quillite-Missing/image-001.png','assets/QUILLITE-MISSING-1/image-001.png']);
  assert.match(result.content,/assets\/quillite-missing-2\/image-001.png/);
  assert.equal(result.missingCount,1);
});

test('percent-encoded hashes in asset filenames remain filenames, not fragments', () => {
  const result = prepareTextBundleImport('![x](assets/photo%231.png)', ['assets/photo#1.png']);
  assert.equal(result.content,'![x](assets/photo%231.png)');
  assert.equal(result.missingCount,0);
});

test('unsafe export schemes are not sent to the backend and are diagnosed', () => {
  const result = prepareTextPackExport('![x](<file://server/share/a.png>) ![x](<smb://server/a.png>)');
  assert.equal(result.images.length,0); assert.equal(result.unsupportedCount,2);
  assert.ok(result.warnings.every(w=>w.code==='UNSAFE_REFERENCE'));
});

test('unsupported responsive images fail explicitly rather than a misleading complete package', () => {
  for (const prepare of [prepareTextPackExport, prepareTextBundleImport]) {
    assert.throws(()=>prepare('<img src="a.png" srcset="b.png 2x">'),/TEXTPACK_UNSUPPORTED_IMAGE/);
    assert.throws(()=>prepare('<picture><source src="x.png"><img src="a.png"></picture>'),/TEXTPACK_UNSUPPORTED_IMAGE/);
  }
});

test('uncollected embedded resources produce conservative warnings', () => {
  const result = prepareTextPackExport('<video src="clip.mp4"></video>\n<div style="background:url(image.png)"></div>');
  assert.equal(result.unsupportedCount,1); assert.equal(result.warnings[0].code,'EXTERNAL_RESOURCES');
  assert.equal(result.images.length,0);
});

test('resource and document limits stop before unbounded work', () => {
  assert.throws(()=>prepareTextPackExport(Array.from({length:513},(_,i)=>`![x](a${i}.png)`).join('\n')),/TEXTPACK_LIMIT/);
  assert.throws(()=>prepareTextBundleImport('x'.repeat(64*1024*1024+1)),/TEXTPACK_LIMIT/);
});
