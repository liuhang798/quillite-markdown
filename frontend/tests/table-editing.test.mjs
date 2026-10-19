import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {registerEditableOwner} from '../src/editable-owner.js';
import {resolveEditableTable,findEditableTableAt,tableInsertion} from '../src/table-editing.js';
import {findMarkdownTables,serializeTableReplacement} from '../src/table-designer.js';
import {prepareFootnotes} from '../src/markdown-formats.js';
import {footnoteProjection} from '../src/footnote-editing.js';
const base='| Head | Other |\n| --- | ---: |\n| Cell | $x^2$ |';
const inserted='<!-- quillite-table-widths: 180, 270 -->\n'+base;
for(const [kind,body,prefix] of [
  ['plain','Insert\n\nTail',''], ['quote','> Insert\n>\n> Tail','> '],
  ['list','- Insert\n\n  Tail','  '], ['ordered','12. Insert\n\n    Tail','    '],
  ['task','- [ ] Insert\n\n  Tail','  '], ['quote-list','> - Insert\n>\n>   Tail','>   '],
  ['nested','- Intro\n  - Insert\n\n    Tail','    '],
  ['details','<details open>\n<summary>More</summary>\n\nInsert\n\nTail\n\n</details>',''],
])for(const footnote of [false,true])for(const position of ['start','middle','end','selected','blank']){
  test(`insert table: ${footnote?'footnote':'root'} ${kind} ${position} preserves scope, metadata and undo`,()=>{
    const source=footnote?'Before[^n]\n\n[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ')+'\n\nAfter':'Before\n\n'+body+'\n\nAfter';
    let from=source.indexOf('Insert')+({start:0,middle:3,end:6,selected:0,blank:6}[position]);
    if(position==='blank')from=source.indexOf('\n',from+1);
    const to=position==='selected'?from+6:from,edit=tableInsertion(source,from,to,inserted),root=view(source,[history()]);
    root.dispatch(edit);const saved=root.state.doc.toString(),target=findEditableTableAt(saved,saved.indexOf('| Head'));
    assert.ok(target, saved);assert.ok(target.hasWidthMetadata);assert.deepEqual(target.model.widths,[180,270]);
    assert.equal(target.prefix,(footnote?'    ':'')+prefix);
    assert.equal(saved.slice(0,from),source.slice(0,from));assert.equal(saved.slice(from+edit.changes.insert.length),source.slice(to));
    if(footnote){const note=prepareFootnotes(saved).notes[0];assert.ok(note.text.includes('Head'));assert.ok(note.text.includes('Tail'));}
    undo(root);assert.equal(root.state.doc.toString(),source);
  });
}
test('table insertion rejects invalid source ranges',()=>{
  for(const[from,to]of[[-1,0],[0,99],[3,2],[NaN,0],[1.5,2]])assert.equal(tableInsertion('Text',from,to,base),null);
});
function view(doc,extensions=[]) {
  const v={state:EditorState.create({doc,extensions}),destroyed:false};
  v.dispatch=spec=>{v.state=v.state.update(spec).state;};return v;
}
function item(source) {const table=findMarkdownTables(source)[0];return{kind:'table',from:table.from,to:table.tableTo,raw:source.slice(table.from,table.tableTo)};}

for(const [name,body] of [['plain',base],['quote',base.replaceAll('\n','\n> ').replace(/^/,'> ')],['list','- Intro\n\n'+base.split('\n').map(line=>'  '+line).join('\n')],['metadata','<!-- quillite-table-widths: 180, 270 -->\n'+base]]) {
  for(const tail of ['', '\n    \n    Tail\n\nAfter'])test(`footnote ${name}: exact replacement boundaries, metadata, prefix and undo (${tail?'followed':'at end'})`,()=>{
    const source='Before[^n]\n\n[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ')+tail;
    const root=view(source,[history()]),definition=prepareFootnotes(source).definitions.get('n');
    const projection=footnoteProjection(source,definition),inner=view(projection.text);
    registerEditableOwner(inner,root,()=>({from:definition.bodyFrom,to:definition.to,projection}),()=>true);
    const target=resolveEditableTable(inner,item(projection.text));assert.equal(target.editor,root);
    assert.equal(target.model.cells[1][1],'$x^2$');
    target.model.cells.push(['Added','Value']);const insert=serializeTableReplacement(target.model,target);
    const suffix=source.slice(target.to);root.dispatch({changes:{from:target.from,to:target.to,insert}});
    const saved=root.state.doc.toString(),note=prepareFootnotes(saved).notes[0],tables=findMarkdownTables(note.text);
    assert.equal(tables.length,1);assert.equal(tables[0].model.cells[2][0],'Added');
    assert.equal(saved.slice(target.from+insert.length),suffix);assert.equal(saved.split('quillite-table-widths').length,2);
    assert.equal(saved.slice(0,target.from),source.slice(0,target.from));
    if(name==='metadata')assert.deepEqual(tables[0].model.widths,[180,270]);
    undo(root);assert.equal(root.state.doc.toString(),source);
  });
}
test('nested details resolve through a footnote to the root history owner',()=>{
  const body='Intro\n\n<details open>\n<summary>More</summary>\n\n'+base+'\n\n</details>\n\nTail';
  const source='Before[^n]\n\n[^n]: '+body.replaceAll('\n','\n    '),root=view(source);
  const definition=prepareFootnotes(source).definitions.get('n'),projection=footnoteProjection(source,definition),note=view(projection.text),inner=view(base);
  registerEditableOwner(note,root,()=>({from:definition.bodyFrom,to:definition.to,projection}),()=>true);
  registerEditableOwner(inner,note,()=>({from:body.indexOf(base),to:body.indexOf(base)+base.length}),()=>true);
  const target=resolveEditableTable(inner,item(base));assert.equal(target.editor,root);assert.equal(target.prefix,'    ');
  assert.equal(source.slice(target.from,target.to),base.replaceAll('\n','\n    '));
});
test('table targets reject stale widgets, invalid ownership, read-only and destroyed editors',()=>{
  const root=view(base),inner=view(base),widget=item(base);
  assert.equal(resolveEditableTable(root,{...widget,raw:'old'}),null);
  assert.equal(resolveEditableTable(root,{...widget,to:widget.to-1,raw:base.slice(0,-1)}),null);
  assert.equal(resolveEditableTable(root,{...widget,kind:'code'}),null);
  registerEditableOwner(inner,root,()=>({from:0,to:base.length}),()=>false);
  assert.equal(resolveEditableTable(inner,widget),null);
  root.state=EditorState.create({doc:base,extensions:EditorState.readOnly.of(true)});assert.equal(resolveEditableTable(root,widget),null);
  root.destroyed=true;assert.equal(resolveEditableTable(root,widget),null);
});

for(const [name,body] of [['plain',base],['quote',base.split('\n').map(line=>'> '+line).join('\n')],['list','- Intro\n\n'+base.split('\n').map(line=>'  '+line).join('\n')],['details','<details open>\n<summary>More</summary>\n\n'+base+'\n\n</details>'],['metadata','<!-- quillite-table-widths: 180, 270 -->\n'+base]]) {
  test(`toolbar locates footnote ${name} table from root selection and preserves surrounding source`,()=>{
    const source='😀 Before[^n]\n\n[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ')+'\n    \n    Tail\n\nAfter';
    const target=findEditableTableAt(source,source.indexOf('Cell')+2),widget=target.model;
    assert.equal(widget.cells[0][0],'Head');assert.equal(widget.cells[1][1],'$x^2$');
    if(name==='metadata')assert.deepEqual(widget.widths,[180,270]);
    assert.equal(source.slice(target.tableFrom,target.tableFrom+6),'| Head');
    widget.cells.push(['Added','Value']);const insert=serializeTableReplacement(widget,target);
    const root=view(source,[history()]);root.dispatch({changes:{from:target.from,to:target.to,insert}});
    const saved=root.state.doc.toString();assert.equal(saved.slice(0,target.from),source.slice(0,target.from));assert.equal(saved.slice(target.from+insert.length),source.slice(target.to));
    const reopened=findEditableTableAt(saved,saved.indexOf('Added'));
    assert.equal(reopened.model.cells[2][0],'Added');assert.deepEqual(reopened.model.widths,widget.widths);
    assert.equal(saved.split('quillite-table-widths').length,2);undo(root);assert.equal(root.state.doc.toString(),source);
    assert.equal(findEditableTableAt(source,source.indexOf('Tail')),null);
  });
}
test('toolbar table lookup preserves root behavior, tabs and excludes code or unrelated prose',()=>{
  const source='Text\n\n'+base+'\n\nAfter';assert.deepEqual(findEditableTableAt(source,source.indexOf('Cell')),findMarkdownTables(source)[0]);
  const note='[^n]: Intro\n\t\n\t'+base.replaceAll('\n','\n\t')+'\n\t\n\tTail';
  const target=findEditableTableAt(note,note.indexOf('Cell'));assert.equal(target.model.cells[1][0],'Cell');assert.equal(target.prefix,'    ');
  for(const body of ['```md\n'+base+'\n```',base.split('\n').map(line=>'    '+line).join('\n')]) {
    const code='[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ');assert.equal(findEditableTableAt(code,code.indexOf('Cell')),null);
  }
  for(const pos of [-1,source.length+1,NaN,1.5])assert.equal(findEditableTableAt(source,pos),null);
  assert.equal(findEditableTableAt(source,source.indexOf('After')),null);
});
