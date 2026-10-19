import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EditorState, EditorSelection } from '@codemirror/state';
import { history, isolateHistory, undo, redo } from '@codemirror/commands';
import { editorLivePreview, editorPastePrefersPlain, replaceLiveSelections } from '../src/editor-live-preview.js';
import { hasRichClipboardHTML, htmlToMarkdown, markdownToPlainText } from '../src/rich-clipboard.js';

const renderer = fs.readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const handler = renderer.slice(renderer.indexOf('async function handleEditorPaste('), renderer.indexOf('async function initializeCodeEditor('));
function harness(source = 'before\nafter', selection = { anchor: 7, head: 12 }, readOnly = false, literalField = false) {
  const root = {}, nested = {}, events = [], notices = [];
  const view = { contentDOM: root, state: EditorState.create({ doc: source, selection,
    extensions: [history(), editorLivePreview, EditorState.allowMultipleSelections.of(true), EditorState.readOnly.of(readOnly)] }),
    dispatch(spec) { const tr = spec.state ? spec : view.state.update(spec); events.push(tr); view.state = tr.state; } };
  const context = vm.createContext({ state: { editing: true, currentFile: { path: 'memory.md' }, documentSession: 1 },
    codeEditor: view, hasRichClipboardHTML, htmlToMarkdown, markdownToPlainText, replaceLiveSelections, isolateHistory, t: key => key,
    resolveEditorPasteTarget: (_root,target) => target.closest() === root ? {view,literalField,plainText:literalField||editorPastePrefersPlain(view.state)} : null,
    showToast: value => notices.push(value) });
  vm.runInContext(handler, context);
  const event = (html, plain = 'Rich', owner = root) => ({ defaultPrevented: false,
    target: { closest: () => owner }, clipboardData: { items: [], getData: type => type === 'text/html' ? html : plain },
    preventDefault() { this.defaultPrevented = true; } });
  return { view, events, notices, event, nested, paste: context.handleEditorPaste };
}

test('rich paste captures before native insertion and replaces once with one undo step', async () => {
  assert.match(renderer, /addEventListener\('paste', handleEditorPaste, true\)/);
  const h = harness(); const event = h.event('<p><strong>Rich</strong></p>');
  const pending = h.paste(event);
  assert.equal(event.defaultPrevented, true, 'must claim synchronously before native default');
  await pending;
  assert.equal(h.view.state.doc.toString(), 'before\n**Rich**');
  assert.equal(h.events.length, 1); assert.ok(h.events[0].isUserEvent('input.paste'));
  assert.equal(undo(h.view), true); assert.equal(h.view.state.doc.toString(), 'before\nafter');
  assert.equal(redo(h.view), true); assert.equal(h.view.state.doc.toString(), 'before\n**Rich**');
});

test('plain paste, nested editors, handled events and readonly state stay untouched', async () => {
  const h = harness();
  for (const event of [h.event(''), h.event('<b>Rich</b>', 'Rich', h.nested), { ...h.event('<b>Rich</b>'), defaultPrevented: true }]) {
    const before = event.defaultPrevented; await h.paste(event); assert.equal(event.defaultPrevented, before);
  }
  assert.equal(h.events.length, 0);
  const readonly = harness('abc', { anchor: 0, head: 3 }, true), event = readonly.event('<b>Rich</b>');
  await readonly.paste(event); assert.equal(event.defaultPrevented, false); assert.equal(readonly.events.length, 0);
});

test('rich paste across a rendered code boundary defers to native literal text and preserves the fence', async () => {
  const source = 'before\n\n```text\nABC\nDEF\n```\n\nafter\n\nend';
  const h = harness(source, { anchor: source.indexOf('F'), head: source.indexOf('after') + 5 });
  const event=h.event('<p><strong>Rich</strong></p>');await h.paste(event);
  assert.equal(event.defaultPrevented,false);assert.equal(h.events.length,0);
  h.view.dispatch({...h.view.state.replaceSelection('Rich'),userEvent:'input.paste'});
  assert.equal(h.view.state.doc.toString(), 'before\n\n```text\nABC\nDERich\n```\n\nend');
  undo(h.view); assert.equal(h.view.state.doc.toString(), source);
});

test('unsafe rich clipboard links are filtered by the actual paste handler', async () => {
  const h = harness(); await h.paste(h.event('<p><a href="javascript:alert(1)">safe text</a></p>'));
  assert.equal(h.view.state.doc.toString(), 'before\nsafe text');
});

test('HTML-only mixed clipboard derives literal text rather than clearing code selections',async()=>{
 const doc='needle\n\n```text\nneedle\n```',selection=EditorSelection.create([...doc.matchAll(/needle/g)].map(m=>EditorSelection.range(m.index,m.index+6)));
 const h=harness(doc,selection);await h.paste(h.event('<b>Rich</b>',''));
 assert.equal(h.view.state.doc.toString(),'**Rich**\n\n```text\nRich\n```');
 assert.equal(h.events.length,1);undo(h.view);assert.equal(h.view.state.doc.toString(),doc);
});

for(const plain of ['Rich',''])test(`literal child multi-caret paste respects field type (${plain?'plain+HTML':'HTML only'})`,async()=>{
 const doc='one two',selection=EditorSelection.create([EditorSelection.cursor(3),EditorSelection.cursor(7)]);
 const h=harness(doc,selection,false,true);await h.paste(h.event('<b>Rich</b>',plain));
 assert.equal(h.view.state.doc.toString(),'oneRich twoRich');assert.equal(h.view.state.selection.ranges.length,2);
 assert.equal(h.events.length,1);assert.equal(h.notices.length,0);undo(h.view);assert.equal(h.view.state.doc.toString(),doc);
});

test('paste policy follows the insertion field for source code, inline code and nested rendered code',()=>{
  for(const [source,needle] of [
    ['```text\nBODY\n```','BODY'], ['    BODY','BODY'], ['文本 `BODY` 后文','BODY'],
    ['> ```text\n> BODY\n> ```\n\n后文','BODY'],
    ['<details open>\n<summary>概要</summary>\n\n```text\nBODY\n```\n\n</details>','BODY'],
    ['<details open>\n<summary>BODY</summary>\n\n后文\n\n</details>','BODY'],
    ['<!--BODY-->','BODY'],
  ]) {
    const at=source.indexOf(needle)+2;
    assert.equal(editorPastePrefersPlain(EditorState.create({doc:source,selection:{anchor:at,head:source.length},extensions:editorLivePreview})),true,source);
  }
  const raw=EditorState.create({doc:'```text\nBODY\n```',selection:{anchor:10}});
  assert.equal(editorPastePrefersPlain(raw),true,'Source mode has no rendered fields');
});

test('rendered prose and table fields retain rich conversion without leaking across code boundaries',()=>{
  for(const source of ['BODY','`CODE` BODY','| Name |\n| --- |\n| BODY |','<details open>\n<summary>title</summary>\n\nBODY\n\n</details>']) {
    const state=EditorState.create({doc:source,selection:{anchor:source.indexOf('BODY')+1},extensions:editorLivePreview});
    assert.equal(editorPastePrefersPlain(state),false,source);
  }
});
