import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {patchMermaidC4Spacing} from '../scripts/mermaid-c4-spacing.mjs';
const original=readFileSync(new URL('../node_modules/mermaid/dist/mermaid.min.js',import.meta.url),'utf8');
test('C4 vertical spacing patch fails closed on upstream changes and repeated application',()=>{
 const patched=patchMermaidC4Spacing(original);
 assert.throws(()=>patchMermaidC4Spacing('changed bundle'),/C4 spacing changed/);
 assert.throws(()=>patchMermaidC4Spacing(original+original),/C4 spacing changed/);
 assert.throws(()=>patchMermaidC4Spacing(patched),/C4 spacing changed/);
 assert.equal(patched.length-original.length,4*'Math.min(,32)'.length);
 // Horizontal placement, row padding and horizontal boundary padding unchanged.
 for(const text of ['r+t.margin:r+t.margin*2','this.nextData.startx+t.margin+Cr.nextLinePaddingX','r.data.stopx=Math.max(o.data.stopx+Cr.c4ShapeMargin,r.data.stopx)'])assert.ok(patched.includes(text));
});
test('C4 vertical cap retains small margins and leaves relationship calculation intact',()=>{
 const patched=patchMermaidC4Spacing(original);
 const method=patched.match(/bumpLastMargin\(t\)\{([^}]+)\}/)[1];
 const bump=new Function('t',method);
 for(const margin of [0,20,32,50,60,120,200]){
  const bounds={data:{stopx:200,stopy:300}};bump.call(bounds,margin);
  assert.equal(bounds.data.stopx,200+margin);assert.equal(bounds.data.stopy,300+Math.min(margin,32));
 }
 const start=original.indexOf('"getIntersectPoint"'),end=original.indexOf('"drawRels"',start);
 assert.ok(start>0&&end>start);assert.ok(patched.includes(original.slice(start,end)));
});
