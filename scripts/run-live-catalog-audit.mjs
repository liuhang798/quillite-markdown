// Bounded concurrent browsers, never attached to the user's profile/document.
import {spawn} from 'node:child_process';
import {mkdir,open,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {liveSourceFingerprint} from './live-source-fingerprint.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const group=process.argv[3]||'catalog';
if(!['catalog','editing-boundaries','selection-search','document-layout','document-sessions','document-identity'].includes(group))throw Error('Unknown audit group');
if(!process.argv[2])throw Error('Supply a fresh audit directory under D:/工作/CodexTemp');
const output=path.resolve(process.argv[2]),temp=path.resolve('D:/工作/CodexTemp');
if(!output.toLowerCase().startsWith(temp.toLowerCase()+path.sep))throw Error('Audit output must stay under CodexTemp');
await mkdir(output,{recursive:true});
const lock=await open(path.join(output,'run-manifest.json'),'wx');
await lock.close(); // create-only: do not erase or silently rerun any previous batch.
const tests=group==='document-identity'?[
 ['document-identity','browser-document-identity.mjs',{}],
]:group==='document-sessions'?[
 ['history-sessions','browser-history-sessions.mjs',{}],
 ['history-sessions-en','browser-history-sessions.mjs',{AUDIT_LANGUAGE:'en',AUDIT_WIDTH:'960'}],
 ['document-sessions','browser-document-sessions.mjs',{}],
 ['document-identity','browser-document-identity.mjs',{}],
]:group==='document-layout'?[
 ['header-reflow','browser-header-reflow.mjs',{}],
 ['split-limits','browser-split-limits.mjs',{}],
 ['recovery-interactions','browser-recovery-interactions.mjs',{}],
 ['recovery-archive','browser-recovery-archive.mjs',{}],
 ['startup-race','browser-startup-race.mjs',{}],
 ['startup-explorer','browser-startup-explorer.mjs',{}],
 ['editor-only','browser-editor-only.mjs',{}],
 ['document-conflict','browser-document-conflict.mjs',{}],
]:group==='selection-search'?[
 ['multi-format','browser-multi-format.mjs',{}],
 ['multi-block','browser-multi-block.mjs',{}],
 ['multi-actions','browser-multi-actions.mjs',{}],
 ['cross-format','browser-cross-format.mjs',{}],
 ['live-search','browser-live-search.mjs',{}],
 ['nested-search','browser-nested-search.mjs',{}],
 ['search-all','browser-search-all.mjs',{}],
 ['spelling-live','browser-spelling-live.mjs',{}],
]:group==='editing-boundaries'?[
 ['table-grid-paste','browser-table-grid-paste.mjs',{}],
 ['container-tables','browser-container-tables.mjs',{}],
 ['container-tables-whitespace','browser-container-tables.mjs',{AUDIT_TABLE_WHITESPACE:'1'}],
 ['container-paste','browser-container-paste.mjs',{}],
 ['rich-paste','browser-rich-paste.mjs',{}],
 ['copy-options','browser-copy-options.mjs',{}],
]:[
 ['formulas','browser-formula-roundtrip.mjs',{}],
 ['mermaid-roundtrip','browser-mermaid-roundtrip.mjs',{}],
 ['chart-source-roundtrip','browser-chart-source-roundtrip.mjs',{}],
 ['complete-wide','browser-toolbar-catalog.mjs',{AUDIT_WIDTH:'1500'}],
 ['complete-narrow','browser-toolbar-catalog.mjs',{AUDIT_WIDTH:'960'}],
 ...Array.from({length:4},(_,i)=>['parameters-final-'+i,'browser-formula-parameters.mjs',{AUDIT_WIDTH:'960',AUDIT_SHARDS:'4',AUDIT_SHARD:String(i)}]),
];
const fingerprint=await liveSourceFingerprint(root),records=[];
await writeFile(path.join(output,'run-manifest.json'),JSON.stringify({group,startedAt:new Date().toISOString(),sourceFingerprint:fingerprint,tests},null,2));
async function run([name,script,settings]) {
 const dir=path.join(output,name);await mkdir(dir,{recursive:true});
 const scriptPath=path.join(root,'frontend/tests',script),scriptSHA256=createHash('sha256').update(await readFile(scriptPath)).digest('hex');
 const before=await liveSourceFingerprint(root);
 if(before!==fingerprint)throw Error('Production source changed during audit; do not combine runs');
 const metadata={name,script:'frontend/tests/'+script,scriptSHA256,settings,startedAt:new Date().toISOString(),sourceFingerprint:before,status:'running'};
 await writeFile(path.join(dir,'run-meta.json'),JSON.stringify(metadata,null,2));
 const log=createWriteStream(path.join(dir,'run.log'),{flags:'wx'});
 const env={...process.env};
 for(const key of Object.keys(env))if(key.startsWith('AUDIT_'))delete env[key];
 Object.assign(env,settings,{AUDIT_OUTPUT:dir});
 const child=spawn(process.execPath,[scriptPath],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
 metadata.pid=child.pid;await writeFile(path.join(dir,'run-meta.json'),JSON.stringify(metadata,null,2));
 console.log(JSON.stringify({started:name,pid:child.pid}));
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code));});
 await new Promise(resolve=>log.end(resolve));
 const after=await liveSourceFingerprint(root);
 Object.assign(metadata,{endedAt:new Date().toISOString(),exitCode,endSourceFingerprint:after,status:exitCode===0&&after===before?'passed':'failed'});
 await writeFile(path.join(dir,'run-meta.json'),JSON.stringify(metadata,null,2));records.push(metadata);
 console.log(JSON.stringify({finished:name,status:metadata.status,exitCode}));
}
let next=0;
// Native Ctrl+C / Ctrl+V uses the OS clipboard even in fresh browser profiles.
// Do not let independent clipboard tests overwrite each other's synthetic data.
await Promise.all(Array.from({length:group==='catalog'?3:1},async()=>{while(next<tests.length){const item=tests[next++];await run(item);}}));
await writeFile(path.join(output,'batch-results.json'),JSON.stringify({sourceFingerprint:fingerprint,records,finishedAt:new Date().toISOString()},null,2));
console.log(JSON.stringify({PASS:records.filter(r=>r.status==='passed').length,total:tests.length,sourceFingerprint:fingerprint}));
if(records.some(r=>r.status!=='passed'))process.exitCode=1;
