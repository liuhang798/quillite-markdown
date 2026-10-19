import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {patchCodeMirrorNestedFocus} from '../scripts/codemirror-nested-focus.mjs';
import {patchCodeMirrorDOMRange} from '../scripts/codemirror-dom-range.mjs';

const source=await readFile(new URL('../node_modules/@codemirror/view/dist/index.js',import.meta.url),'utf8');
const patched=patchCodeMirrorNestedFocus(source);
test('nested focus patch is pinned, idempotent and composes with DOM-range protection',()=>{
 assert.equal(patchCodeMirrorNestedFocus(patched),patched);
 assert.throws(()=>patchCodeMirrorNestedFocus('class CompositeTile {}'),/review/);
 assert.equal(patchCodeMirrorDOMRange(patched),patchCodeMirrorNestedFocus(patchCodeMirrorDOMRange(source)));
});

class Node {
 constructor(name,doc){this.name=name;this.ownerDocument=doc;this.childNodes=[];this.parentNode=null;}
 get firstChild(){return this.childNodes[0]||null;}
 get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null;}
 contains(node){for(;node;node=node.parentNode)if(node===this)return true;return false;}
 removeChild(node){if(this.ownerDocument.activeElement&&node.contains(this.ownerDocument.activeElement)){this.ownerDocument.activeElement=null;this.ownerDocument.blurs++;}this.childNodes.splice(this.childNodes.indexOf(node),1);node.parentNode=null;return node;}
 insertBefore(node,next){if(node===next)return node;if(node.parentNode)node.parentNode.removeChild(node);const i=next?this.childNodes.indexOf(next):this.childNodes.length;assert.ok(i>=0);this.childNodes.splice(i,0,node);node.parentNode=this;return node;}
}
const permutations=items=>items.length?items.flatMap((item,i)=>permutations(items.filter((_,j)=>j!==i)).map(rest=>[item,...rest])):[[]];
function run(code,order,focus='B'){
 const doc={activeElement:null,blurs:0},parent=new Node('root',doc),nodes=Object.fromEntries(['A','B','C','D','X'].map(name=>[name,new Node(name,doc)]));
 for(const name of ['A','B','C','D'])parent.insertBefore(nodes[name],null);
 const caret=new Node('caret',doc);if(focus==='root')doc.activeElement=parent;else if(focus){nodes[focus].insertBefore(caret,null);doc.activeElement=caret;}
 class Tile{constructor(dom){this.dom=dom;this.flags=0;}sync(){}}
 const start=code.indexOf('class CompositeTile extends Tile {'),end=code.indexOf('// Remove a DOM node',start);
 const CompositeTile=new Function('Tile','rm$1',code.slice(start,end)+';return CompositeTile;')(Tile,node=>{const next=node.nextSibling;node.parentNode.removeChild(node);return next;});
 const tile=new CompositeTile(parent);tile._children=order.map(name=>({dom:nodes[name],length:1,breakAfter:0,sync(){}}));tile.sync();
 assert.deepEqual(parent.childNodes.map(node=>node.name),order);assert.equal(tile.length,order.length);
 return {doc,caret,parent};
}
test('upstream reordering disconnects a retained focused widget',()=>{
 const {doc}=run(source,['C','A','B','D']);assert.equal(doc.blurs,1);
});
test('all retained sibling permutations preserve focus and exact DOM order',()=>{
 for(const order of permutations(['A','B','C','D']))for(const focus of ['A','B','C','D']){
  const {doc,caret}=run(patched,order,focus);assert.equal(doc.activeElement,caret);assert.equal(doc.blurs,0,order.join()+' '+focus);
 }
});
test('insertions and deletions do not preserve obsolete widgets or steal root focus',()=>{
 for(const order of [['X','D','B'],['D','X','B','A'],['B'],['X','B','D','A','C']]){
  const {doc,caret}=run(patched,order);assert.equal(doc.activeElement,caret);assert.equal(doc.blurs,0);
 }
 for(const order of [[],['A','D'],['X','C','D']]){const {doc}=run(patched,order);assert.equal(doc.activeElement,null);assert.equal(doc.blurs,1);}
 for(const order of permutations(['A','B','C','D'])){const {doc,parent}=run(patched,order,'root');assert.equal(doc.activeElement,parent);assert.equal(doc.blurs,0);run(patched,order,null);}
});
