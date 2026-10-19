// Inventory, not a success gate: missing UI evidence stays explicitly pending.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {FORMULA_TEMPLATES} from '../frontend/src/formula-templates.js';
import {DIAGRAM_TEMPLATES} from '../frontend/src/diagram-templates.js';
import {liveSourceFingerprint} from './live-source-fingerprint.mjs';
import {readLiveEvidence} from './live-evidence.mjs';
import {editingBoundaryEvidence} from './live-editing-evidence.mjs';
import {selectionSearchEvidence} from './live-selection-evidence.mjs';
import {documentLayoutEvidence} from './live-document-evidence.mjs';
import {documentSessionEvidence} from './live-session-evidence.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const html=await readFile(path.join(root,'frontend/index.html'),'utf8');
const attributes=name=>[...new Set([...html.matchAll(new RegExp(`${name}="([^"]+)"`,'g'))].map(m=>m[1]))];
const evidenceRoot=process.argv[2],output=process.argv[3];
if(!evidenceRoot||!output)throw Error('Usage: node scripts/live-acceptance-inventory.mjs <current-run-directory> <output.json>');
const fingerprint=await liveSourceFingerprint(root),provenance={};
const parameterPrefix=process.env.AUDIT_PARAMETER_PREFIX||'focus-final-960';
if(!/^[a-z0-9-]+$/.test(parameterPrefix))throw Error('Invalid parameter evidence prefix');
const runs={
 'formulas':['browser-formula-roundtrip.mjs',{}],
 'mermaid-roundtrip':['browser-mermaid-roundtrip.mjs',{}],
 'chart-source-roundtrip':['browser-chart-source-roundtrip.mjs',{}],
 'complete-wide':['browser-toolbar-catalog.mjs',{AUDIT_WIDTH:'1500'}],
 'complete-narrow':['browser-toolbar-catalog.mjs',{AUDIT_WIDTH:'960'}],
 'complete-1500':['browser-ai-edit.mjs',{AUDIT_WIDTH:'1500'}],
 'complete-960':['browser-ai-edit.mjs',{AUDIT_WIDTH:'960'}],
 ...Object.fromEntries(Array.from({length:4},(_,i)=>[`${parameterPrefix}-${i}`,['browser-formula-parameters.mjs',{AUDIT_WIDTH:'960',AUDIT_SHARDS:'4',AUDIT_SHARD:String(i)}]])),
};
const log=async name=>{
 const [script,settings]=runs[name];
 const result=await readLiveEvidence({root,evidenceRoot,name,script:'frontend/tests/'+script,settings,fingerprint});
 provenance[name]={accepted:result.accepted,reason:result.reason};
 return result.text;
};
const formulaLog=await log('formulas'),mermaidLog=await log('mermaid-roundtrip'),chartLog=await log('chart-source-roundtrip');
const jsonLines=text=>text.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
const formulaIDs=[...formulaLog.matchAll(/^\d+\/\d+ ([\w-]+): .*document isolation passed$/gm)].map(m=>m[1]);
const mermaid=jsonLines(mermaidLog),charts=jsonLines(chartLog);
const toolbarNames=['complete-wide','complete-narrow'];
const toolbars=await Promise.all(toolbarNames.map(async name=>({name,rows:jsonLines(await log(name))})));
const aiRuns=await Promise.all(['complete-1500','complete-960'].map(async name=>{const text=await log(name);return{name,text,rows:jsonLines(text)};}));
const aiEvidence=id=>aiRuns.map(({name,text,rows})=>({
 log:path.join(evidenceRoot,name,'run.log'),
 passed:rows.some(row=>row.PASS===19&&row.pageErrors?.length===0&&row.transport==='synthetic only')
   && text.split(/\r?\n/).filter(line=>line===`PASS ${id}`).length===1,
}));
const toolbarEvidence=(key,id)=>toolbars.map(({name,rows})=>({
 log:path.join(evidenceRoot,name,'run.log'),
 passed:rows.some(row=>row.PASS===attributes('data-format').length&&row.headings===6&&row.pageErrors?.length===0)
   && rows.filter(row=>row[key]===id&&row.history&&row.continued).length===1,
}));
const formulaComplete=formulaLog.includes(`PASS ${FORMULA_TEMPLATES.length}/${FORMULA_TEMPLATES.length} current formula templates`);
const parameterParts=await Promise.all(Array.from({length:4},(_,i)=>`${parameterPrefix}-${i}`).map(async(name,index)=>{
 const text=await log(name);let rows=[];
 try{rows=JSON.parse(await readFile(path.join(evidenceRoot,name,'results.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const count=FORMULA_TEMPLATES.filter((_,i)=>i%4===index).length;
 const summary=jsonLines(text).find(row=>row.PASS===count*2&&row.templates===count&&row.errors?.length===0);
 return{name,rows,complete:Boolean(summary)&&rows.length===count*2};
}));
const parameterRuns=[{parts:parameterParts.map(p=>p.name),rows:parameterParts.flatMap(p=>p.rows),complete:parameterParts.every(p=>p.complete)}];
const parameterEvidence=id=>parameterRuns.map(({parts,rows,complete})=>({
 logs:parts.map(name=>path.join(evidenceRoot,name,'run.log')),results:parts.map(name=>path.join(evidenceRoot,name,'results.json')),
 passed:complete&&['inline','numbered'].every(mode=>{
  const matching=rows.filter(row=>row.template===id&&row.mode===mode);
  return matching.length===1&&matching[0].status==='pass'&&matching[0].changes.length===FORMULA_TEMPLATES.find(t=>t.id===id).fields.length
   &&matching[0].inserted.trim()===matching[0].expected.trim()&&matching[0].edited.trim()===matching[0].revised.trim();
 }),
}));
const mermaidComplete=mermaid.some(x=>x.PASS===DIAGRAM_TEMPLATES.filter(t=>t.engine!=='echarts').length&&x.pageErrors?.length===0);
const chartComplete=charts.some(x=>x.catalog===DIAGRAM_TEMPLATES.filter(t=>t.engine==='echarts').length&&x.PASS===x.catalog+x.custom&&x.pageErrors?.length===0);
const evidence=(done,scope,file)=>({status:done?'recorded-pass':'pending',scope,log:path.join(evidenceRoot,file,'run.log')});
const inventory={
 generatedAt:new Date().toISOString(),sourceFingerprint:fingerprint,provenance,
 interpretation:'A recorded pass proves only its named scope. Runs require successful exit, matching source fingerprints before and after, current test hash and exact settings. This is not log signing, a native-platform check or complete feature acceptance.',
 formulas:FORMULA_TEMPLATES.map(t=>{const checks=parameterEvidence(t.id);return{id:t.id,name:t.name,core:evidence(formulaComplete&&formulaIDs.filter(id=>id===t.id).length===1,'Block mode, default parameters, advanced source edit, reopen, cancel, source toggles, history and new-document isolation','formulas'),parameters:{status:checks.every(e=>e.passed)?'recorded-pass':'pending',scope:'Current run: inline/numbered, each parameter with one non-default input, block-mode roundtrip, insert, no-op, advanced source edit, cancel, source/live and history at 960 px',evidence:checks},remainingEvidence:['parameter validation and compound/boundary values','visual structure editing where supported']};}),
 diagrams:DIAGRAM_TEMPLATES.map(t=>{const echarts=t.engine==='echarts',rows=echarts?charts:mermaid,row=rows.filter(r=>r.id===t.id);return{id:t.id,name:t.name,engine:echarts?'echarts':'mermaid',core:evidence((echarts?chartComplete:mermaidComplete)&&row.length===1&&row[0].history&&row[0].sourceReturn&&row[0].invalidRejected,'Insert, source edit, invalid input, reopen, cancel, source return and history',echarts?'chart-source-roundtrip':'mermaid-roundtrip'),visualEditing:!echarts&&row[0]?.visual?'recorded-pass (one field)':'needs separate evidence',remainingEvidence:['data/structure controls applicable to template','rendered data and label visibility']};}),
 formats:attributes('data-format').map(id=>{const evidence=toolbarEvidence('command',id);return{id,status:evidence.every(e=>e.passed)?'recorded-pass':'pending',scope:'Root selection, toolbar/overflow action, dialog cancellation where applicable, source/live, undo/redo and continued input at 1500/960 px',evidence,remainingEvidence:['empty and partial selections','multiple selections and nested editing contexts','all dialog parameters and validation']};}),
 headings:Array.from({length:6},(_,i)=>{const level=i+1,evidence=toolbarEvidence('heading',level);return{level,status:evidence.every(e=>e.passed)?'recorded-pass':'pending',scope:'Heading/paragraph conversion, visible heading style, history and continued input at 1500/960 px',evidence};}),
 aiActions:attributes('data-ai-toolbar-action').map(id=>{const evidence=aiEvidence(id);return{id,status:evidence.every(e=>e.passed)?'recorded-pass':'pending',scope:'Synthetic transport only: actual toolbar entry, explicit generation, unchecked-consent blocking, apply, one undo/redo at 1500/960 px; rewrite flows also cancel/reopen and continue typing',evidence,remainingEvidence:['real provider streaming/authentication and platform credentials','all task parameters and target languages','multiline/nested AI output semantics','document-session transitions during service requests']};}),
 additionalEditingRequirements:['format painter','undo and redo','mouse caret placement and drag selection','keyboard movement and multiline editing','multiple selections','rich clipboard and copy formats','image source return, size, alignment and storage','table structure and cell editing','find and replace','spelling suggestions, ignore and personal dictionary','document sessions, save, save-as and recovery/history','source/live and split/editor-only layouts','theme, language and supported viewport access','native IME input'],
 editingBoundaries:await editingBoundaryEvidence({root,evidenceRoot:process.argv[4],fingerprint}),
 selectionSearch:await selectionSearchEvidence({root,evidenceRoot:process.argv[5],fingerprint}),
 documentLayout:await documentLayoutEvidence({root,evidenceRoot:process.argv[6],fingerprint}),
 documentSessions:await documentSessionEvidence({root,evidenceRoot:process.argv[7],fingerprint}),
 completion:'unproven',
};
if(await liveSourceFingerprint(root)!==fingerprint)throw Error('Source changed while collecting inventory');
await writeFile(output,JSON.stringify(inventory,null,2)+'\n');
console.log(JSON.stringify({documentSessionsPassed:inventory.documentSessions.filter(t=>t.status==='recorded-pass').length,documentSessionCasesPassed:inventory.documentSessions.filter(t=>t.status==='recorded-pass').reduce((n,t)=>n+t.passedCases,0)}));
console.log(JSON.stringify({documentLayoutPassed:inventory.documentLayout.filter(t=>t.status==='recorded-pass').length,documentLayoutCasesPassed:inventory.documentLayout.filter(t=>t.status==='recorded-pass').reduce((n,t)=>n+t.passedCases,0)}));
console.log(JSON.stringify({formulas:inventory.formulas.length,formulaCorePassed:inventory.formulas.filter(t=>t.core.status==='recorded-pass').length,diagrams:inventory.diagrams.length,diagramCorePassed:inventory.diagrams.filter(t=>t.core.status==='recorded-pass').length,formats:inventory.formats.length,aiActions:inventory.aiActions.length,editingBoundaryPassed:inventory.editingBoundaries.filter(t=>t.status==='recorded-pass').length,editingCasesPassed:inventory.editingBoundaries.filter(t=>t.status==='recorded-pass').reduce((n,t)=>n+t.passedCases,0),selectionSearchPassed:inventory.selectionSearch.filter(t=>t.status==='recorded-pass').length,selectionSearchCasesPassed:inventory.selectionSearch.filter(t=>t.status==='recorded-pass').reduce((n,t)=>n+t.passedCases,0),completion:inventory.completion,sourceFingerprint:inventory.sourceFingerprint}));
