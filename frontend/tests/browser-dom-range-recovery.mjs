// Synthetic DOM mutations only. Exercises the real patched CodeMirror observer,
// document application, redraw, subsequent typing and undo (not just DOMReader).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),optimizeDeps:{noDiscovery:true,exclude:['@codemirror/state','@codemirror/commands']},logLevel:'error',server:{host:'127.0.0.1',port:0,watch:null,hmr:false},plugins:[{
 name:'test-dom-boundaries',enforce:'post',transform(code,id){
  if(id.replaceAll('\\','/').includes('/@codemirror/view/dist/index.js'))return code+'\nexport {DOMChange, applyDOMChange};';
 },
 configureServer(s){s.middlewares.use('/dom-range-test.html',(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><div id="editor"></div>');});},
}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'dom-range-test.html');
 const result=await page.evaluate(async()=>{
  const cm=await import('/node_modules/@codemirror/view/dist/index.js');
  const {EditorState}=await import('/node_modules/@codemirror/state/dist/index.js');
  const {history,undo,redo,undoDepth}=await import('/node_modules/@codemirror/commands/dist/index.js');
  const view=window.testView=new cm.EditorView({state:EditorState.create({doc:'AAA\nBBB\nCCC\nDDD',selection:{anchor:5},extensions:[history()]}),parent:document.querySelector('#editor')});
  // Include an existing undo entry that recovery must not clear or add to.
  view.dispatch({changes:{from:15,insert:'!'}});view.focus();
  const before=view.state.doc.toString(),depth=undoDepth(view.state),selection=view.state.selection;
  const lines=[...view.contentDOM.children],wrapper=document.createElement('div');
  view.contentDOM.insertBefore(wrapper,lines[0]);wrapper.append(lines[0],lines[1],lines[3]);
  const change=new cm.DOMChange(view,4,7,false);
  const rejected=change.bounds===null&&change.newSel===null&&change.text==='';
  const handled=cm.applyDOMChange(view,change);
  // Model a stale partial observer range after nodes have moved parents.
  // Still process native records so their dirty flags are retained.
  const original=view.observer.processRecords.bind(view.observer);
  view.observer.processRecords=()=>{original();return {from:4,to:7,typeOver:false};};
  view.observer.flush();view.observer.processRecords=original;
  const after=view.state.doc.toString(),sameSelection=view.state.selection.eq(selection),sameDepth=undoDepth(view.state)===depth;
  const restored=[...view.contentDOM.children].map(line=>line.textContent).join('\n');
  undo(view);const undone=view.state.doc.toString();redo(view);const redone=view.state.doc.toString();
  view.dispatch({selection:{anchor:5}});view.focus();
  return {before,after,restored,rejected,handled,sameSelection,sameDepth,undone,redone};
 });
 assert.equal(result.rejected,true);assert.equal(result.handled,false);
 assert.equal(result.after,result.before);assert.equal(result.restored,result.before);
 assert.equal(result.sameSelection,true);assert.equal(result.sameDepth,true);
 assert.equal(result.undone,'AAA\nBBB\nCCC\nDDD');assert.equal(result.redone,result.before);
 await page.keyboard.insertText('字');
 assert.equal(await page.evaluate(()=>testView.state.doc.toString()),'AAA\nB字BB\nCCC\nDDD!');
 assert.deepEqual(errors,[]);
 console.log('PASS: stale DOM range rejected; text, selection and history preserved; DOM restored and typing works');
}finally{await browser?.close();await server.close();}
