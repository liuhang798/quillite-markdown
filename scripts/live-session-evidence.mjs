import path from 'node:path';
import {readLiveEvidence} from './live-evidence.mjs';
import {exactEvidenceCases} from './live-editing-evidence.mjs';
const historyCases=['restore-history','selection-pending','stale-selection-error','reopen-list','reopen-list-error','reopen-version','switch-document','closed-response','list-error-retry','read-error','invalid-version','wrong-path-version','wrong-id-version','invalid-content-version'];
const sessionCases=['switch-live','switch-source','same-path-reopen','cancel-open','save-during-input','late-save-new','late-save-same','late-save-error','late-save-closed','save-receipt-mismatch','save-as-cancel','draft-manual-save'];
const specs=[
 {id:'document-identity',script:'browser-document-identity.mjs',settings:{},cases:['rename','save-as'].flatMap(mode=>['formula','nested-formula','diagram','nested-diagram','table','footnote','image'].map(kind=>mode+'-'+kind)),scope:'Rename and Save As followed immediately by media edit/source-return, retained history, continue typing and save to the new identity; synthetic file responses'},
 {id:'history-sessions',script:'browser-history-sessions.mjs',settings:{},cases:historyCases,scope:'1440 Chinese: history restore/history continuation, selection pending/error, reopen/switch races, invalid response identity/content; synthetic disk only'},
 {id:'history-sessions-en',script:'browser-history-sessions.mjs',settings:{AUDIT_LANGUAGE:'en',AUDIT_WIDTH:'960'},cases:historyCases,scope:'960 English: same 14 history interaction cases; no native disk writes'},
 {id:'document-sessions',script:'browser-document-sessions.mjs',settings:{},cases:sessionCases,scope:'Real UI document A/B/A and same-path history isolation, cancelled open, typing during save, late success/error after switch/close, receipt mismatch, Save As cancellation and draft first-save routing; synthetic backend'},
];
export function sessionCaseOutcomes(text,count){
 const rows=text.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
 if(!rows.some(r=>r.PASS===count&&r.total===count&&Array.isArray(r.failures)&&r.failures.length===0))return [];
 return [...text.matchAll(/^PASS ([\w-]+)$/gm)].map(m=>m[1]);
}
export async function documentSessionEvidence({root,evidenceRoot,fingerprint}){
 return Promise.all(specs.map(async spec=>{
  const result=evidenceRoot?await readLiveEvidence({root,evidenceRoot,fingerprint,name:spec.id,script:'frontend/tests/'+spec.script,settings:spec.settings}):{accepted:false,reason:'no document-session evidence directory',text:''};
  const actual=result.accepted?sessionCaseOutcomes(result.text,spec.cases.length):[];
  return{id:spec.id,status:result.accepted&&exactEvidenceCases(actual,spec.cases)?'recorded-pass':'pending',scope:spec.scope,expectedCases:spec.cases.length,
   passedCases:spec.cases.filter(name=>actual.filter(value=>value===name).length===1).length,missing:spec.cases.filter(name=>actual.filter(value=>value===name).length!==1),
   provenance:{accepted:result.accepted,reason:result.reason},log:evidenceRoot?path.join(evidenceRoot,spec.id,'run.log'):null};
 }));
}
