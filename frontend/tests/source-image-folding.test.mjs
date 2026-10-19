import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, Compartment } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { sourceImageFolding, sourceImageFoldField, sourceImagePhrases } from '../src/source-image-folding.js';

const uri='data:image/jpeg;base64,'+'ABcd+/09'.repeat(12000)+'==';
const ranges=state=>{const result=[];state.field(sourceImageFoldField).between(0,state.doc.length,(from,to,value)=>result.push({from,to,label:value.spec.widget.label}));return result;};
function create(doc){return EditorState.create({doc,extensions:[sourceImageFolding,history(),EditorState.phrases.of(sourceImagePhrases)]});}
for(const [name,wrap] of [
  ['HTML',u=>`<img src="${u}" alt="说明" width="50">`],
  ['Markdown',u=>`![说明](${u})`],
  ['table',u=>`| 图片 | 内容 |\n|---|---|\n| <img src="${u}"> | 正文 |`],
  ['code sample',u=>'```html\n<img src="'+u+'">\n```'],
  ['reference',u=>`![说明][img]\n\n[img]: ${u}`],
]) test(`fold ${name} data only without mutating source`,()=>{
  const doc=wrap(uri),state=create(doc),r=ranges(state);
  assert.equal(r.length,1);assert.equal(state.sliceDoc(r[0].from,r[0].to),uri);
  assert.match(r[0].label,/Base64 图片 · JPEG · 70 KiB/);
  assert.ok(r[0].label.length<45);assert.equal(state.doc.toString(),doc);
  assert.equal(state.update({selection:{anchor:doc.length}}).state.field(sourceImageFoldField),state.field(sourceImageFoldField));
});
test('nearby edits map unchanged payloads, changed lines rescan, undo and redo preserve bytes',()=>{
  const original=`Before\n<img src="${uri}" alt="说明">\nAfter`;
  let state=create(original);const view={get state(){return state;},dispatch(spec){state=state.update(spec).state;}};
  const widget=state.field(sourceImageFoldField).iter().value.spec.widget;
  view.dispatch({changes:{from:0,insert:'前缀\n'}});
  assert.equal(state.field(sourceImageFoldField).iter().value.spec.widget,widget);
  const old=ranges(state)[0];assert.equal(state.sliceDoc(old.from,old.to),uri);
  const pos=state.doc.toString().indexOf('说明');view.dispatch({changes:{from:pos,to:pos+2,insert:'新说明'}});
  assert.equal(ranges(state).length,1);assert.ok(state.doc.toString().includes(uri));
  view.dispatch({changes:{from:ranges(state)[0].from,to:ranges(state)[0].to,insert:'https://example.com/a.png'}});
  assert.equal(ranges(state).length,0);
  assert.ok(undo(view));assert.ok(state.doc.toString().includes(uri));assert.equal(ranges(state).length,1);
  assert.ok(redo(view));assert.equal(ranges(state).length,0);
});
test('new pasted data and multiple images fold, short/remote/non-image data stay literal',()=>{
  const state=create('before\nafter'),doc=`<img src="${uri}"> ![b](${uri})\n`;
  const updated=state.update({changes:{from:7,insert:doc}}).state;
  assert.equal(ranges(updated).length,2);
  assert.equal(ranges(create('data:image/png;base64,YQ== data:text/plain;base64,'+'A'.repeat(300)+' https://example.com/a.png')).length,0);
});
test('language reconfiguration updates summaries without touching data',()=>{
  const language=new Compartment();
  const state=EditorState.create({doc:uri,extensions:[sourceImageFolding,language.of(EditorState.phrases.of(sourceImagePhrases))]});
  const updated=state.update({effects:language.reconfigure(EditorState.phrases.of({}))}).state;
  assert.match(ranges(state)[0].label,/Base64 图片/);assert.match(ranges(updated)[0].label,/Base64 image/);
  assert.equal(updated.doc.toString(),uri);
});

test('incremental edits match a fresh scan across payloads and line boundaries',()=>{
  let state=create(`A\n${uri}\nB\n${uri}\nC`),seed=19;
  for(let i=0;i<45;i++) {
    seed=(seed*1664525+1013904223)>>>0;
    const from=seed%(state.doc.length+1),to=Math.min(state.doc.length,from+(i%7));
    const insert=['x','\n','',' ',uri][i%5];
    state=state.update({changes:{from,to,insert}}).state;
    assert.deepEqual(ranges(state),ranges(create(state.doc.toString())),'edit '+i);
  }
});
