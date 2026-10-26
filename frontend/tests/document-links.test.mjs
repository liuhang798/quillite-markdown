import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveDocumentLink as resolve} from '../src/document-links.js';

test('relative document links use the current file directory on Windows and POSIX', () => {
  for (const [href, base, path, fragment] of [
    ['04_综合知识/02_网络新技术.md', 'D:\\笔记\\首页.md', 'D:/笔记/04_综合知识/02_网络新技术.md', ''],
    ['../其他/文件%20名.MD#章节一', 'C:/笔记/子目录/当前.md', 'C:/笔记/其他/文件 名.MD', '章节一'],
    ['./a%23b%25.md#%E6%A0%87%E9%A2%98', '/notes/a.md', '/notes/a#b%.md', '标题'],
    ['..\\other\\a.markdown', 'C:\\notes\\sub\\a.md', 'C:/notes/other/a.markdown', ''],
    ['child.txt', '/notes/100% #中文/a.md', '/notes/100% #中文/child.txt', ''],
    ['file:///C:/notes/a%20b.md#part', '/notes/a.md', 'C:/notes/a b.md', 'part'],
    ['D:\\笔记\\a.md', 'C:/notes/a.md', 'D:/笔记/a.md', ''],
    ['/notes/next.mkd', '/notes/a.md', '/notes/next.mkd', ''],
  ]) assert.deepEqual(resolve(href, base), {kind:'document', path, fragment});
});

test('anchors and internet links are kept separate from local document paths', () => {
  assert.deepEqual(resolve('#中文', '/a.md'), {kind:'anchor',fragment:'中文'});
  for (const url of ['https://example.com/a.md#part','http://example.com','mailto:test@example.com'])
    assert.deepEqual(resolve(url, '/a.md'), {kind:'external',url});
});

test('unsupported, malformed and network targets never fall back to WebView navigation', () => {
  for (const href of ['', 'javascript:alert(1)','data:text/html,x','https://wails.localhost/a.md','//server/a.md', '\\\\server\\a.md', 'file://server/a.md', 'app:foo.md', 'a.exe','a.md?query=1','%00.md','a%ZZ.md','a.md#%ZZ','a.md:stream.md'])
    assert.deepEqual(resolve(href, 'C:/notes/a.md'), {kind:'unsupported'},href);
  assert.deepEqual(resolve('a.md','reference:example'), {kind:'unsupported'});
});
