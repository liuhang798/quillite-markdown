import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {buildLivePlan} from '../src/editor-live-preview.js';
import {parseTableClipboardTSV,tableGridEdit} from '../src/table-clipboard.js';
import {findMarkdownTables} from '../src/table-designer.js';

test('TSV retains blank rows, trailing cells, escaped quotes and embedded line breaks',()=>{
 assert.deepEqual(parseTableClipboardTSV('a\tb\r\n\t\r\nc\t\r\n'),[['a','b'],['',''],['c','']]);
 assert.deepEqual(parseTableClipboardTSV('"a\tb"\t"c\n d"\n"a""b"\tx'),[['a&#9;b','c<br> d'],['a"b','x']]);
 assert.equal(parseTableClipboardTSV('paragraph\nsecond'),null);assert.equal(parseTableClipboardTSV('one,two'),null);
});
test('spreadsheet text stays literal and HTML cannot execute',()=>{
 assert.deepEqual(parseTableClipboardTSV('**a**\t<script>x</script>\n$x$\t==a=='),[['\\*\\*a\\*\\*','&lt;script&gt;x&lt;/script&gt;'],['\\$x\\$','\\=\\=a\\=\\=']]);
 assert.deepEqual(parseTableClipboardTSV(' a \t b '),[['&#32;a&#32;','&#32;b&#32;']]);
 for(const value of ['a\tb\nc','"open\tb','"closed"tail\tb'])assert.throws(()=>parseTableClipboardTSV(value),/shape/);
 assert.throws(()=>parseTableClipboardTSV('a'.repeat(500001)+'\tb'),/limit/);
});
const table='| A | B | C |\n| :--- | ---: | :---: |\n| one | two | three |\n| four | five | six |';
for(const prefix of ['', '> ', '  ', '>   '])for(const expanded of [false,true])for(const metadata of [false,true])test(`grid ${JSON.stringify(prefix)} expansion=${expanded} metadata=${metadata}: cells, alignment, source and history`,()=>{
 const header=prefix==='  '?'- Intro\n\n':prefix==='>   '?'> - Intro\n>\n':'';
 const doc='Before\n\n'+header+((metadata?'<!-- quillite-table-widths: 180, 250, 300 -->\n':'')+table).replace(/^/gm,prefix)+'\n\nAfter';
 const item=buildLivePlan(doc).widgets.find(item=>item.kind==='table');assert.ok(item);
 const grid=parseTableClipboardTSV(expanded?'甲\t乙\t丙\n丁\t戊\t己\n庚\t辛\t壬':'甲\t乙\n丙\t丁');
 const edit=tableGridEdit(doc,item,4,grid),view={state:EditorState.create({doc,extensions:[history()]})};view.dispatch=spec=>{view.state=view.state.update(spec).state;};
 view.dispatch({...edit,userEvent:'input.paste'});const next=view.state.doc.toString(),saved=findMarkdownTables(next)[0];
 assert.equal(saved.model.cells[1][0],'one');assert.equal(saved.model.cells[2][0],'four');assert.equal(saved.model.cells[1][1],'甲');assert.equal(saved.model.cells[2][2],expanded?'戊':'丁');assert.equal(saved.model.cells[0][0],'A');
 assert.deepEqual(saved.model.alignments.slice(0,3),['left','right','center']);if(metadata)assert.deepEqual(saved.model.widths.slice(0,3),[180,250,300]);
 assert.equal(next.slice(0,item.from),doc.slice(0,item.from));assert.ok(next.endsWith('\n\nAfter'));
 assert.equal(next.slice(view.state.selection.main.head-1,view.state.selection.main.head),expanded?'壬':'丁');
 undo(view);assert.equal(view.state.doc.toString(),doc);redo(view);assert.equal(view.state.doc.toString(),next);
});
test('grid edits reject stale, oversized and malformed input without partial changes',()=>{
 const item=buildLivePlan(table).widgets.find(item=>item.kind==='table');
 assert.equal(tableGridEdit(table+'X',{...item,raw:'stale'},4,[['x']]),null);
 for(const grid of [[],[[]],[['a'],['b','c']],Array.from({length:21},()=>['a']),[Array(13).fill('a')]])assert.throws(()=>tableGridEdit(table,item,4,grid));
});
test('unselected raw escapes remain byte-for-byte intact during expansion',()=>{
 const doc=table.replace('one','`a\\|b` &amp; \\*literal\\*'),item=buildLivePlan(doc).widgets.find(item=>item.kind==='table');
 const edit=tableGridEdit(doc,item,8,[['new','other']]);const state=EditorState.create({doc}).update(edit).state;
 assert.ok(state.doc.toString().includes('`a\\|b` &amp; \\*literal\\*'));
});
