import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {search,openSearchPanel,closeSearchPanel} from '@codemirror/search';
import {livePreviewField} from '../src/editor-live-preview.js';
import {editableSearchSelection} from '../src/live-editable-block.js';

const doc='[Site](https://example.com/needle)';
const selected={anchor:doc.indexOf('needle'),head:doc.indexOf('needle')+6};
const hidden=state=>{let found=false;state.field(livePreviewField).decorations.between(selected.anchor,selected.head,(from,to,value)=>{if(value.spec.hiddenSyntax&&from<selected.head&&to>selected.anchor)found=true;});return found;};
const view=()=>({state:EditorState.create({doc,extensions:[search(),livePreviewField]}),dispatch(tr){this.state=this.state.update(tr).state;},plugin(){return null;}});

test('explicit search reveals matched hidden syntax, close and pointer restore rendering without changing source',()=>{
 const v=view();openSearchPanel(v);
 v.dispatch({selection:selected,userEvent:'select.pointer'});assert.ok(hidden(v.state));
 v.dispatch({selection:selected,userEvent:'select.search'});assert.equal(hidden(v.state),false);
 v.dispatch({});assert.equal(hidden(v.state),false);
 closeSearchPanel(v);assert.ok(hidden(v.state));assert.equal(v.state.doc.toString(),doc);
});
test('projected search reveal is temporary and does not require a child search panel',()=>{
 const v=view();v.dispatch({selection:selected,effects:editableSearchSelection.of(true)});assert.equal(hidden(v.state),false);
 v.dispatch({effects:editableSearchSelection.of(false)});assert.ok(hidden(v.state));
 v.dispatch({selection:selected,effects:editableSearchSelection.of(true)});
 v.dispatch({selection:selected,userEvent:'select.pointer'});assert.ok(hidden(v.state));assert.equal(v.state.doc.toString(),doc);
});
test('F3-style search navigation reveals syntax with a closed panel, then ordinary selection restores it',()=>{
 const v=view();v.dispatch({selection:selected,userEvent:'select.search'});assert.equal(hidden(v.state),false);
 v.dispatch({selection:selected,userEvent:'select.pointer'});assert.ok(hidden(v.state));assert.equal(v.state.doc.toString(),doc);
});
