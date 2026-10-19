import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseTableClipboardTSV} from '../src/table-clipboard.js';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const handler=renderer.slice(renderer.indexOf('async function handleEditorPaste('),renderer.indexOf('async function initializeCodeEditor('));
function fixture(){
 const view={state:{readOnly:false,selection:{ranges:[{}]}}},calls=[];
 const showToast=(message,kind,duration,owner=null)=>{showToast.owner=owner;calls.push({message,kind,owner});};
 const c=vm.createContext({state:{editing:true,currentFile:{path:'test.md'},documentSession:1,editorPresentation:'live'},codeEditor:view,
  resolveEditorPasteTarget:()=>({view,plainText:false}),canPasteEditableTableGrid:()=>true,parseTableClipboardTSV,
  pasteEditableTableGrid:()=>true,t:k=>k,showToast,hideToast:()=>{calls.push('hide');showToast.owner=null;}});
 vm.runInContext(handler,c);
 const paste=async text=>{const e={target:{closest:()=>true},clipboardData:{items:[],getData:t=>t==='text/plain'?text:''},preventDefault(){this.defaultPrevented=true;}};await c.handleEditorPaste(e);return e;};
 return{paste,calls,showToast};
}
test('successful grid retry clears only its owned rejection',async()=>{
 const f=fixture();await f.paste('A\tB\nC');assert.equal(f.showToast.owner,'table-paste');assert.equal(f.calls[0].message,'tablePasteShape');
 assert.equal((await f.paste('A\tB\nC\tD')).defaultPrevented,true);assert.equal(f.calls.at(-1),'hide');assert.equal(f.showToast.owner,null);
});
test('successful grid paste preserves newer or unowned warnings',async()=>{
 for(const owner of [null,{},'another-operation']){
  const f=fixture();await f.paste('A\tB\nC');f.showToast('tablePasteShape','warning',undefined,owner);
  await f.paste('A\tB');assert.equal(f.showToast.owner,owner);assert.ok(!f.calls.includes('hide'));
 }
});
test('repeated failed retries and ordinary non-grid paste do not dismiss the warning',async()=>{
 const f=fixture();await f.paste('A\tB\nC');await f.paste('A\tB\nC');await f.paste('ordinary');
 assert.equal(f.showToast.owner,'table-paste');assert.ok(!f.calls.includes('hide'));assert.equal(f.calls.length,2);
});
