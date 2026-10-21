import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchCodeMirrorTileBoundaries} from '../scripts/codemirror-tile-boundaries.mjs';
import {patchCodeMirrorDOMRange} from '../scripts/codemirror-dom-range.mjs';
import {patchCodeMirrorNestedFocus} from '../scripts/codemirror-nested-focus.mjs';
const source=readFileSync(new URL('../node_modules/@codemirror/view/dist/index.js',import.meta.url),'utf8');
const patched=patchCodeMirrorTileBoundaries(source);
test('tile compatibility patches are asserted, idempotent and compose with DOM range/focus fixes',()=>{
 assert.equal(patchCodeMirrorTileBoundaries(patched),patched);
 assert.throws(()=>patchCodeMirrorTileBoundaries('changed dependency'),/review/);
 assert.equal(patchCodeMirrorDOMRange(patchCodeMirrorNestedFocus(patched)),patchCodeMirrorTileBoundaries(patchCodeMirrorDOMRange(patchCodeMirrorNestedFocus(source))));
});
test('mouse hit testing with a missing rendered line returns no precise hit, not a null tile crash',()=>{
 const get=code=>new Function('BlockType','PosAssoc','InlineCoordsScan','posAtCoordsImprecise',code.slice(code.indexOf('function posAtCoords(view,'),code.indexOf('class InlineCoordsScan'))+';return posAtCoords;')({Text:0},class {constructor(pos,assoc){Object.assign(this,{pos,assoc});}},class {scanTile(tile){return tile.length;}},()=>7);
 const view={contentDOM:{getBoundingClientRect:()=>({top:0})},viewState:{paddingTop:0,docHeight:100},elementAtHeight:()=>({type:0,from:1,to:10,length:9}),viewport:{from:0,to:20},docView:{lineAt:()=>null},state:{doc:{length:20}},textDirectionAt:()=>0};
 assert.throws(()=>get(source)(view,{x:1,y:10},true),/length/);
 assert.equal(get(patched)(view,{x:1,y:10},true),null);
 assert.equal(get(patched)(view,{x:1,y:10},false).pos,7);
});
test('composition without a current builder line retains the existing native text and line DOM',()=>{
 const get=code=>new Function('Tile','TextTile',`return function ${code.slice(code.indexOf('    addComposition(composition, context) {'),code.indexOf('    addInlineWidget(widget,')).trim()}`)({get:()=>null},class {constructor(dom,text){Object.assign(this,{dom,text});}});
 const dom={},text={nodeValue:'拼音'},children=[];
 const context={line:{dom,attrs:{class:'cm-line'}},marks:[]};
 const builder=()=>({curLine:null,cache:{reused:new Map()},ensureLine(attrs){this.curLine={dom,attrs,append:node=>children.push(node)};}});
 const composition={text,range:{toB:2}};
 assert.throws(()=>get(source).call(builder(),composition,context),/dom/);
 const b=builder();get(patched).call(b,composition,context);
 assert.equal(b.curLine.dom,dom);assert.equal(children[0].dom,text);assert.equal(children[0].text,'拼音');assert.equal(b.pos,2);
});
test('detached or unowned composition DOM is rejected before traversal and falls back to state rendering',()=>{
 const get=code=>new Function('Tile','MarkTile','BlockWrapperTile',`return function ${code.slice(code.indexOf('    getCompositionContext(text) {'),code.indexOf('\n}\nfunction hasContent')).trim()}`)({get:node=>node.cmTile},class {},class {});
 const root={contains:node=>node?.parentNode===root};
 const context={view:{contentDOM:root}};
 assert.throws(()=>get(source).call(context,{parentNode:null}),/cmTile/);
 assert.equal(get(patched).call(context,{parentNode:null}),null);
 assert.equal(get(patched).call(context,null),null);
 assert.equal(get(patched).call(context,{parentNode:root}),null);
 assert.match(patched,/if \(!compositionContext\) composition = null;/);
});
test('AI limits use shared bilingual guidance and never mislabel quota as a transient busy service',()=>{
 const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
 const fn=new Function('diagnosticErrorMessage','t',renderer.slice(renderer.indexOf('function aiErrorMessage(error)'),renderer.indexOf('const aiProviderConfigs'))+'return aiErrorMessage;')(String,x=>x);
 for(const value of ['AI_RATE_LIMITED: HTTP 429','AI service returned HTTP 429: free users'])assert.equal(fn(value),'aiRateLimitedHint');
 assert.equal(fn('AI_QUOTA_EXCEEDED: credits exhausted'),'aiQuotaExceededHint');
 assert.equal(fn('AI_EMPTY_REPLY: empty'),'aiEmptyReplyHint');
 assert.match(renderer,/UPDATE_DOWNLOAD_INTERRUPTED[\s\S]*updateInterrupted/);
});
