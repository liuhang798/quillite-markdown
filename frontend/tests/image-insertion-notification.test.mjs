import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const start=renderer.indexOf('function imageInsertionCurrent('),end=renderer.indexOf('\nfunction insertImageReference(',start);
test('explicit edit-session cancellation is silent but overlapping edits still warn',()=>{
 const target={session:1,path:'A.md'},state={editing:true,documentSession:1,currentFile:{path:'A.md'},imageInsertionTargets:new Set([target]),imageUploadRun:1},messages=[];
 const context=vm.createContext({state,codeEditor:{},imageInsertionTargetCurrent:()=>false,t:k=>k,showToast:m=>messages.push(m),els:{imageUploadProgress:{classList:{add(){}}}}});
 vm.runInContext(renderer.slice(start,end),context);
 context.imageInsertionCurrent(target,true);assert.deepEqual(messages,['imageInsertionChanged']);messages.length=0;
 context.cancelImageInsertions();assert.equal(target.cancelled,true);assert.equal(target.dismissed,true);assert.equal(state.imageInsertionTargets.size,0);
 context.imageInsertionCurrent(target,true);assert.deepEqual(messages,[]);
});
test('async root image insertion only moves focus when its editor still owns focus',()=>{
 assert.match(renderer,/const ownsCaret = codeEditor\.hasFocus && selection\.from === target\.from/);
 assert.match(renderer,/if \(ownsCaret\) codeEditor\.focus\(\)/);
});
