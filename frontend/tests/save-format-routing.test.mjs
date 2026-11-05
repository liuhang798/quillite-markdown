import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { rebaseMarkdownImages } from '../src/portable-images.js';
import { directoryFromDocumentPath } from '../src/library-state.js';
import { prepareTextPackExport } from '../src/textpack.js';

const bridge = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const functions = bridge.slice(bridge.indexOf('async function saveDocumentCopy('), bridge.indexOf('window.quilliteMarkdown ='));
function harness(target = '/same/copy.md') {
  const calls = [];
  const Backend = {
    ChooseDocumentSavePath: async source => { calls.push(['choose', source]); return target; },
    SaveDocumentCopy: async (...args) => { calls.push(['copy', ...args]); return {path: args[1], content: args[2]}; },
    SaveDocumentAsFormat: async (...args) => {
      calls.push(['convert', ...args]);
      const content = !args[2] && ['textbundle', 'textpack'].includes(args[3]) ? args[5].replace(/^\uFEFF/, '') : args[5];
      return {path: '/copy.' + args[3], content};
    }
  };
  const context = vm.createContext({ desktopRuntime: true, Backend, rebaseMarkdownImages, directoryFromDocumentPath,
    prepareTextPackExport, crypto: {randomUUID: () => 'test-id'} });
  vm.runInContext(functions, context);
  return {context, Backend, calls};
}

test('same-folder ordinary Markdown backups bypass portable-image parsing and limits', async () => {
  for (const text of [
    '<picture><source srcset="assets/a.png 2x"><img src="assets/a.png"></picture>',
    '![missing](assets/missing.png)\n\n![online](https://example.invalid/image.png)',
    Array.from({length: 513}, (_, i) => `![image](missing-${i}.png)`).join('\n'),
    '\uFEFF# Exact BOM, Unicode 中文 and CRLF\r\n\r\n![image](missing.png)\r\n'
  ]) {
    const {context: c, calls} = harness();
    c.prepareTextPackExport = () => { throw Error('backup must not run portable parser'); };
    const saved = await c.saveDocumentAsFormat('/same/original.md', text, '', 'markdown');
    assert.equal(saved.content, text);
    assert.equal(saved.sourceContent, text);
    assert.equal(saved.rebaseContent(text + '\nnewer edit'), text + '\nnewer edit');
    assert.deepEqual(calls.map(call => call[0]), ['choose', 'copy']);
    assert.equal(calls[1][3], text, 'same-folder copy must preserve the exact submitted bytes');
    assert.equal(saved.exportWarnings, undefined, 'an ordinary backup must not claim portable/offline validation');
  }
});

test('same-folder Windows Markdown aliases preserve references without case-sensitive misclassification', async () => {
  const text = '<img src="missing.png" srcset="missing@2x.png 2x">';
  const {context: c, calls} = harness('c:\\SAME\\copy.markdown');
  const saved = await c.saveDocumentAsFormat('C:\\same\\ORIGINAL.MARKDOWN', text, '', 'markdown');
  assert.equal(saved.content, text);
  assert.deepEqual(calls.map(call => call[0]), ['choose', 'copy']);
});

test('relocated ordinary Markdown retains established rebase behavior without collecting missing files', async () => {
  const text = '![local](assets/missing.png)\n\n![online](https://example.invalid/image.png)\n\n`![code](untouched.png)`';
  const {context: c, calls} = harness('/elsewhere/copy.md');
  c.prepareTextPackExport = () => { throw Error('ordinary copy must not package images'); };
  const saved = await c.saveDocumentAsFormat('/same/original.md', text, '', 'markdown');
  assert.equal(saved.content, rebaseMarkdownImages(text, '/same'));
  assert.match(saved.content, /file:\/\/\/same\/assets\/missing\.png/);
  assert.match(saved.content, /https:\/\/example.invalid\/image.png/);
  assert.match(saved.content, /`!\[code\]\(untouched\.png\)`/);
  assert.equal(saved.rebaseContent(text + '\n![later](new.png)'), rebaseMarkdownImages(text + '\n![later](new.png)', '/same'));
  assert.deepEqual(calls.map(call => call[0]), ['choose', 'copy']);
});

test('same-format TXT saves are literal even when relocated and contain malformed image markup', async () => {
  const text = '\uFEFF# Literal plain text\r\n![missing](never-read.png)\r\n<img srcset="also-not-read.png 2x">\r\n![remote](smb://host/private.png)';
  for (const target of ['/same/copy.txt', '/elsewhere/copy.txt']) {
    const {context: c, calls} = harness(target);
    c.prepareTextPackExport = c.rebaseMarkdownImages = () => { throw Error('TXT must not parse images'); };
    const saved = await c.saveDocumentAsFormat('/same/notes.TXT', text, '', 'text');
    assert.equal(saved.content, text);
    assert.equal(saved.rebaseContent(text + '\nmore literal text'), text + '\nmore literal text');
    assert.deepEqual(calls.map(call => call[0]), ['choose', 'copy']);
    assert.equal(calls[0][1], '/same/notes.TXT', 'the native copy chooser retains the TXT name/extension');
  }
});

test('ordinary copy cancellation and errors do not fall back to portable conversion', async () => {
  const {context: c, calls, Backend} = harness('');
  assert.equal(await c.saveDocumentAsFormat('/same/notes.md', 'local', '', 'markdown'), null);
  assert.deepEqual(calls.map(call => call[0]), ['choose']);
  Backend.ChooseDocumentSavePath = async () => '/same/existing.md';
  Backend.SaveDocumentCopy = async () => { throw Error('DOCUMENT_COPY_EXISTS'); };
  await assert.rejects(c.saveDocumentAsFormat('/same/notes.md', 'local', '', 'markdown'), /DOCUMENT_COPY_EXISTS/);
  assert.ok(!calls.some(call => call[0] === 'convert'));
});

test('ordinary copy rejects mismatched backend receipts instead of adopting unrelated content', async () => {
  const {context: c, Backend} = harness();
  Backend.SaveDocumentCopy = async () => ({path:'/same/copy.md', content:'unrelated'});
  await assert.rejects(c.saveDocumentAsFormat('/same/notes.md', 'submitted', '', 'markdown'), /receipt mismatch/);
});

test('ordinary-to-package receipt accepts exactly one canonical encoding BOM removal', async () => {
  for (const format of ['textpack', 'textbundle']) {
    for (const source of ['# No BOM\n', '\uFEFF# One BOM\n', '\uFEFF\uFEFF# BOM plus literal FEFF\n']) {
      const {context: c, Backend} = harness();
      const saved = await c.saveDocumentAsFormat('/same/notes.md', source, '', format);
      assert.equal(saved.sourceContent, source);
      assert.equal(saved.content, source.replace(/^\uFEFF/, ''));
      assert.equal(saved.rebaseContent(source), saved.content);
      assert.throws(() => saved.rebaseContent(source + 'new edit'), /DOCUMENT_COPY_EDITOR_CHANGED/);
      Backend.SaveDocumentAsFormat = async () => ({path:'/copy.' + format, content:'external content'});
      await assert.rejects(c.saveDocumentAsFormat('/same/notes.md', source, '', format), /DOCUMENT_COPY_RECEIPT_MISMATCH/);
    }
  }
});

test('package-to-package receipt must retain a literal FEFF rather than stripping another BOM', async () => {
  const source = '\uFEFF# Literal package text\n';
  const {context: c, Backend} = harness();
  const saved = await c.saveDocumentAsFormat('/same/notes.textpack', source, 'session-a', 'textbundle');
  assert.equal(saved.content, source);
  Backend.SaveDocumentAsFormat = async () => ({path:'/copy.textbundle', content:source.slice(1)});
  await assert.rejects(c.saveDocumentAsFormat('/same/notes.textpack', source, 'session-a', 'textbundle'), /DOCUMENT_COPY_RECEIPT_MISMATCH/);
});
