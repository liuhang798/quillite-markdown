import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {marked} from 'marked';
import {decodeHTML} from 'entities';
import {buildLivePlan,livePreviewField,normalizeLiveInlineWhitespace,protectLiveInlineReplacement,LIVE_PREVIEW_LIMIT} from '../src/editor-live-preview.js';
import {imageDefinitionsField,inheritedImageDefinitions} from '../src/editor-reference-context.js';
const create=(doc,extra=[])=>EditorState.create({doc,extensions:[imageDefinitionsField,livePreviewField,history(),EditorState.transactionFilter.of(normalizeLiveInlineWhitespace),EditorState.transactionFilter.of(protectLiveInlineReplacement),...extra]});
const replace=(doc,insert,extra=[])=>{
 let state=create(doc,extra),from=doc.indexOf('ALPHA')+2,to=doc.indexOf('OMEGA')+3;
 state=state.update({selection:EditorSelection.single(from,to)}).state;
 return state.update({...state.replaceSelection(insert),userEvent:insert?'input.paste':'delete.backward'}).state;
};
for(const label of ['[ALPHA][ref]','[ALPHA][]','[ALPHA]'])test(`partial ${label} retains original reference and shared definition`,()=>{
 const ref=label.includes('ref')?'ref':'ALPHA',definition=`\n\n[${ref}]: https://example.com "Shared"`,doc=label+' gap *OMEGA*'+definition;
 let state=replace(doc,'X');assert.equal(state.doc.toString(),`[AL][${ref}]X<em>GA</em>`+definition);
 assert.match(marked.parse(state.doc.toString()),/<a href="https:\/\/example.com" title="Shared">AL<\/a>/);
 undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),doc);
 redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),`[AL][${ref}]X<em>GA</em>`+definition);
});
test('inherited implicit reference names survive child-field edits without copying definitions',()=>{
 const defs=new Map([['alpha',{ref:'https://example.com',title:'"Shared"'}]]),doc='[ALPHA][] gap *OMEGA*';
 const state=replace(doc,'X',[inheritedImageDefinitions.of(defs)]);
 assert.equal(state.doc.toString(),'[AL][ALPHA]X<em>GA</em>');assert.ok(!state.doc.toString().includes(']:'));
});
for(const right of [false,true])test(`partial autolink on ${right?'right':'left'} keeps its complete original destination`,()=>{
 const doc=right?'**ALPHA** gap <https://example.com/OMEGA>':'<https://example.com/ALPHA> gap *OMEGA*';
 let state=replace(doc,'X');const expected=right?'<strong>AL</strong>X[GA](<https://example.com/OMEGA>)':'[https://example.com/AL](<https://example.com/ALPHA>)X<em>GA</em>';
 assert.equal(state.doc.toString(),expected);assert.match(marked.parse(expected),new RegExp(`href="https://example.com/${right?'OMEGA':'ALPHA'}"`));
 undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),doc);redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),expected);
});
test('autolink punctuation and entities remain literal in the shortened label and full target',()=>{
 const url='https://example.com/*bold*/_em_/==mark==/$x$/[a]?x=1&copy;ALPHA',doc=`<${url}> gap *OMEGA*`;
 const state=replace(doc,'X'),html=marked.parse(state.doc.toString());
 assert.ok(state.doc.toString().includes('&#42;bold&#42;'));assert.ok(state.doc.toString().includes('&#38;copy;AL]'));
 assert.ok(state.doc.toString().includes('x=1&amp;copy;ALPHA>'));assert.ok(!html.includes('<strong>bold</strong>'));
 assert.equal(decodeHTML(html.match(/href="([^"]+)"/)[1]),encodeURI(url));
 const plan=buildLivePlan(state.doc.toString());
 assert.ok(plan.widgets.some(w=>w.kind==='text'&&w.raw==='&#42;'&&w.text==='*'));
 assert.ok(plan.widgets.some(w=>w.kind==='text'&&w.raw==='&#38;'&&w.text==='&'));
 assert.ok(plan.widgets.every(w=>w.to<state.doc.toString().indexOf('](<')));
});
test('URL-looking link labels decode known entities only, leaving targets and code untouched',()=>{
 const doc='[https://example.com/&amp;&#42;&unknown;](https://target.example/?a=1&amp;b=2) `&amp;`',plan=buildLivePlan(doc);
 assert.deepEqual(plan.widgets.filter(w=>w.kind==='text').map(w=>w.text),['&','*']);
 assert.ok(plan.widgets.every(w=>w.to<doc.indexOf('](')));
});
test('partial email autolinks keep their mailto destination',()=>{
 const state=replace('<ALPHA@example.com> gap *OMEGA*','X');
 assert.equal(state.doc.toString(),'[AL](<mailto:ALPHA@example.com>)X<em>GA</em>');
});
test('autolink wrapper removal never consumes neighbouring emphasis delimiters',()=>{
 const doc='**B**<https://example.com/X>*I*';let state=create(doc),from=doc.indexOf('https'),to=doc.indexOf('>');
 state=state.update({selection:{anchor:from,head:to}}).state;
 assert.equal(state.update({...state.replaceSelection(''),userEvent:'delete.backward'}).newDoc.toString(),'**B***I*');
});
test('reference-like strings in literal code remain unchanged by cross-style repair',()=>{
 const doc='`[ALPHA][]` gap *OMEGA*\n\n[ALPHA]: https://example.com';
 assert.equal(replace(doc,'X').doc.toString(),'`[AL`X<em>GA</em>\n\n[ALPHA]: https://example.com');
});
test('large embedded-image projection retains exact reference wrapper offsets',()=>{
 const image='![image](data:image/png;base64,'+'A'.repeat(LIVE_PREVIEW_LIMIT)+')\n\n',doc=image+'[ALPHA][] gap *OMEGA*\n\n[ALPHA]: https://example.com';
 const state=replace(doc,'X');assert.equal(state.doc.toString(),image+'[AL][ALPHA]X<em>GA</em>\n\n[ALPHA]: https://example.com');
});
test('an explicit link label owns URL-looking text rather than nesting an editable autolink',()=>{
 const doc='[https://example.com](https://target.example)',plan=buildLivePlan(doc);
 assert.equal(plan.marks.filter(m=>m.className==='cm-live-link').length,1);
});
