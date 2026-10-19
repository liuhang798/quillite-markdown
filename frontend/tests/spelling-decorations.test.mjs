import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,RangeSet} from '@codemirror/state';
import {Decoration} from '@codemirror/view';
import {spellingDecorations,setSpellingDecorations,projectSpellingDecorations} from '../src/spelling-decorations.js';
import {codeProjection} from '../src/projected-code.js';
const mark=Decoration.mark({class:'cm-spelling-error',attributes:{'aria-invalid':'spelling'}});
const ranges=set=>{const values=[];set.between(0,1e9,(from,to)=>values.push([from,to]));return values;};
test('spelling marks map edits and can be cleared without touching content or selection',()=>{
 let state=EditorState.create({doc:'hello wurld',extensions:[spellingDecorations]});
 state=state.update({effects:setSpellingDecorations.of(Decoration.set([mark.range(6,11)]))}).state;
 state=state.update({changes:{from:0,insert:'😀 '}}).state;
 assert.deepEqual(ranges(state.field(spellingDecorations)),[[9,14]]);
 const old=state;state=state.update({effects:setSpellingDecorations.of(Decoration.none)}).state;
 assert.equal(state.doc,old.doc);assert.ok(state.selection.eq(old.selection));assert.deepEqual(ranges(state.field(spellingDecorations)),[]);
});
test('marks project into cells and prefixed bodies without inventing partial words',()=>{
 const marks=Decoration.set([mark.range(2,7),mark.range(10,15)]);
 assert.deepEqual(ranges(projectSpellingDecorations(marks,{from:10,to:15})),[[0,5]]);
 assert.deepEqual(ranges(projectSpellingDecorations(marks,{from:3,to:6})),[]);
 const source='> wurld\n> wurld',projection=codeProjection(source,[{from:2,to:8},{from:10,to:15}],2,'> ');
 const result=projectSpellingDecorations(marks,{from:2,to:15,projection});
 assert.deepEqual(ranges(result),[[0,5],[6,11]]);
 assert.ok(RangeSet.eq([result],[projectSpellingDecorations(marks,{from:2,to:15,projection})]));
});
