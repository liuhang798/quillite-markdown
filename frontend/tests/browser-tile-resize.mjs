import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {patchCodeMirrorTileBoundaries} from '../scripts/codemirror-tile-boundaries.mjs';
import {patchCodeMirrorDOMRange} from '../scripts/codemirror-dom-range.mjs';
import {patchCodeMirrorNestedFocus} from '../scripts/codemirror-nested-focus.mjs';
const playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.TILE_BROWSER||'chromium';
const baseline=process.env.TILE_BASELINE==='1';
const bounds=code=>[code.indexOf('    advance(dist, side, walker) {'),code.indexOf('    get root() { return (this.parents')];
const server=await createServer({configFile:false,root:fileURLToPath(new URL('..',import.meta.url)),optimizeDeps:{exclude:['@codemirror/view']},plugins:[{
  name:'production-editor-guards',enforce:'pre',transform(code,id){
    if(!/\/@codemirror\/view\/dist\/index\.js(?:\?.*)?$/.test(id.replaceAll('\\','/')))return null;
    let patched=patchCodeMirrorTileBoundaries(patchCodeMirrorNestedFocus(patchCodeMirrorDOMRange(code)));
    if(baseline){const [a,b]=bounds(patched),[c,d]=bounds(code);patched=patched.slice(0,a)+code.slice(c,d)+patched.slice(b);}
    return {code:patched,map:null};
  }
}],server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
  await server.listen();
  browser=await playwright[engine].launch({headless:true,...(engine==='chromium'&&process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/tile-resize-audit.html');
  await page.waitForFunction(()=>window.tileAudit);
  const result=await page.evaluate(async()=>{
    const {view,ranges}=tileAudit;let seed=20261029;
    const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
    for(let i=0;i<400;i++) {
      const from=8+rand(60),to=90+rand(110);
      ranges([[from,to],[210,230]]);
      const pos=from+rand(to-from);
      const insert='中文'.repeat(1+rand(6));
      view.dispatch({changes:{from:pos,to:Math.min(pos+rand(6),to),insert},selection:{anchor:0}});
      if(view.docView.tile.length!==view.state.doc.length)throw Error('tree/document length mismatch at '+i);
      if(i%10===0) {
        const expected=view.state.doc.toString();
        tileAudit.undo();tileAudit.redo();
        if(view.state.doc.toString()!==expected)throw Error('undo/redo changed content');
        view.dispatch({selection:{anchor:view.state.doc.length},scrollIntoView:true});
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        view.coordsAtPos(view.state.doc.length);
      }
    }
    ranges([]);view.focus();
    return {iterations:400,length:view.state.doc.length,tree:view.docView.tile.length,errors:tileAudit.errors};
  });
  assert.equal(result.tree,result.length);
  assert.deepEqual(result.errors,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({engine,baseline,...result}));
}finally{await browser?.close();await server.close();}
