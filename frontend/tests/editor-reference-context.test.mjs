import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {imageDefinitionsField, imageDefinitionsFor, inheritedImageDefinitions, updateImageDefinitions} from '../src/editor-reference-context.js';
import {markdownImageDefinitions, markdownImageRanges} from '../src/portable-images.js';
import {editorImageGroups} from '../src/image-layout.js';
import {imagePreviewField, toggleImageSource} from '../src/embedded-image-preview.js';
import {editorLivePreview, livePreviewField} from '../src/editor-live-preview.js';
import {footnotesFor, sameFootnotePresentation} from '../src/editor-reference-context.js';

test('footnote snapshots retain identity when text, numbering and source ranges are unchanged',()=>{
  for(const doc of ['plain text','[^a]: note\n\nText[^a]\n\nend']) {
    const before=create(doc),after=before.update({changes:{from:doc.length,insert:' more'}}).state;
    assert.equal(footnotesFor(before),footnotesFor(after));
  }
});
test('shifted footnote offsets stay current without invalidating identical widget presentation',()=>{
  const doc='| A |\n| --- |\n| cell[^a] |\n\n```text\ncode\n```\n\n[^a]: note';
  const before=create(doc),after=before.update({changes:{from:doc.indexOf('code')+2,insert:'longer'}}).state;
  const refs=footnotesFor(before),next=footnotesFor(after);
  assert.notEqual(refs,next);assert.equal(next.get('a').from,refs.get('a').from+6);
  assert.equal(sameFootnotePresentation(refs,next),true);
  const table=state=>{let widget;state.field(livePreviewField).decorations.between(0,state.doc.length,(_a,_b,d)=>{if(d.spec.widget?.item?.kind==='table')widget=d.spec.widget;});return widget;};
  assert.equal(table(before).eq(table(after)),true);
  const changed=after.update({changes:{from:after.doc.length,insert:' changed'}}).state;
  assert.equal(table(after).eq(table(changed)),false,'real note content changes must refresh its tooltip');
});
test('footnote numbering changes invalidate the inherited presentation',()=>{
  const before=create('Text[^a] [^b]\n\n[^a]: A\n\n[^b]: B');
  const after=before.update({changes:{from:4,insert:'[^b]'}}).state;
  assert.equal(sameFootnotePresentation(footnotesFor(before),footnotesFor(after)),false);
});

const definitions='[Shared Label]: <https://example.com/a.png> "A &amp; B"\n\n[shared label]: https://example.com/ignored.png';
const create=(doc, inherited)=>EditorState.create({doc,extensions:[imageDefinitionsField,imagePreviewField,editorLivePreview,
  ...(inherited?[inheritedImageDefinitions.of(inherited)]:[])]});

test('projected reference links inherit definitions and refresh when those definitions are removed/restored',()=>{
  const refs=markdownImageDefinitions(definitions);
  for(const token of ['[Text][Shared Label]','[Shared Label][]','[Shared Label]']) {
    let state=create(token,refs);
    const links=()=>state.field(livePreviewField).plan.marks.filter(mark=>mark.className==='cm-live-link');
    assert.equal(links().length,1,token);
    state=state.update({effects:updateImageDefinitions.of(new Map())}).state;assert.equal(links().length,0);
    state=state.update({effects:updateImageDefinitions.of(refs)}).state;assert.equal(links().length,1);
    assert.equal(state.doc.toString(),token);
  }
});

test('full, collapsed and shortcut images inherit first-wins definitions and local source offsets',()=>{
  const refs=markdownImageDefinitions(definitions);
  for(const token of ['![图片][SHARED  label]','![Shared Label][]','![Shared Label]']) {
    const source='前😀 '+token+' 后文';
    const image=markdownImageRanges(source,{preview:true,definitions:refs})[0];
    assert.equal(image.ref,'https://example.com/a.png');assert.equal(image.title,'A & B');
    assert.equal(source.slice(image.previewFrom,image.previewTo),token);
    const state=create(source,refs);assert.equal(state.field(imagePreviewField).items[0].images[0].ref,image.ref);
    assert.equal(state.doc.toString(),source);
  }
});

test('reference snapshots retain identity on unrelated edits and change on target/title/delete',()=>{
  let state=create(definitions),refs=imageDefinitionsFor(state);
  state=state.update({changes:{from:state.doc.length,insert:'\n\n正文'}}).state;
  assert.equal(imageDefinitionsFor(state),refs);
  const from=state.doc.toString().indexOf('a.png');
  state=state.update({changes:{from,to:from+5,insert:'b.png'}}).state;
  assert.notEqual(imageDefinitionsFor(state),refs);refs=imageDefinitionsFor(state);
  const title=state.doc.toString().indexOf('A &amp; B');
  state=state.update({changes:{from:title,to:title+9,insert:'New'}}).state;
  assert.notEqual(imageDefinitionsFor(state),refs);
  state=state.update({changes:{from:0,to:state.doc.length,insert:''}}).state;
  assert.equal(imageDefinitionsFor(state).size,0);
});

test('retained inner editors refresh reference images without changing text or source-open state',()=>{
  const refs=markdownImageDefinitions(definitions),source='![Shared Label]';
  let state=create(source,refs),item=state.field(imagePreviewField).items[0];
  state=state.update({effects:toggleImageSource.of({from:item.from,to:item.to})}).state;
  const changed=markdownImageDefinitions('[shared label]: https://example.com/new.png "New"');
  state=state.update({effects:updateImageDefinitions.of(changed)}).state;
  item=state.field(imagePreviewField).items[0];
  assert.equal(item.images[0].ref,'https://example.com/new.png');assert.equal(item.images[0].title,'New');assert.equal(item.open,true);
  assert.equal(state.doc.toString(),source);
  state=state.update({effects:updateImageDefinitions.of(new Map())}).state;
  assert.equal(state.field(imagePreviewField).items.length,0);assert.equal(state.doc.toString(),source);
  state=state.update({effects:updateImageDefinitions.of(refs)}).state;
  assert.equal(state.field(imagePreviewField).items.length,1);
});

test('definitions stay document scoped; fake definitions in code do not resolve images',()=>{
  const a=create('![Shared Label]\n\n'+definitions),b=create('![Shared Label]');
  assert.equal(a.field(imagePreviewField).items.length,1);assert.equal(b.field(imagePreviewField).items.length,0);
  for(const content of ['```md\n[ref]: https://example.com/a.png\n```','    [ref]: https://example.com/a.png','<!-- [ref]: https://example.com/a.png -->']) {
    assert.equal(markdownImageDefinitions(content).size,0);
  }
  const refs=markdownImageDefinitions('[ref]: javascript:alert(1)');
  assert.equal(editorImageGroups('![图][ref]',refs).length,0);
});

test('nested tables receive the same definition snapshot when a widget is retained',()=>{
  const source='| 图片 |\n| --- |\n| ![图][ref] |\n\n[ref]: https://example.com/a.png';
  const state=create(source),field=state.field(livePreviewField);
  const widgets=[];field.decorations.between(0,state.doc.length,(_from,_to,value)=>{if(value.spec.widget?.item?.kind==='table')widgets.push(value.spec.widget);});
  assert.equal(widgets.length,1);assert.equal(widgets[0].references,imageDefinitionsFor(state));
  const next=state.update({changes:{from:source.indexOf('a.png'),to:source.indexOf('a.png')+5,insert:'b.png'}}).state;
  const changed=[];next.field(livePreviewField).decorations.between(0,next.doc.length,(_from,_to,value)=>{if(value.spec.widget?.item?.kind==='table')changed.push(value.spec.widget);});
  assert.equal(widgets[0].eq(changed[0]),false,'Changed external references must refresh identical table source');
});
