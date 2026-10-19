import path from 'node:path';
import {readLiveEvidence} from './live-evidence.mjs';
import {exactEvidenceCases} from './live-editing-evidence.mjs';

const passNames=text=>[...text.matchAll(/^PASS ([\w-]+)(?: |$)/gm)].map(m=>m[1]);
const specs=[
 {id:'header-reflow',cases:['zh-CN','en'].flatMap(l=>[980,1100,1500,1920].flatMap(w=>['preview-left','editor-left','editor-only'].map(v=>`${l}-${w}-${v}`))),
  scope:'24 language/width/layout combinations: labels, hit targets, source/live, Save As cancellation, history entry, rename cancellation, exit/reenter and Tab/Enter; no real file writes',
  outcomes:text=>[...text.matchAll(/^([\w-]+): labels, hit targets, modes, Save As cancel, history, rename cancel, exit\/reenter and Tab\/Enter passed$/gm)].map(m=>m[1])},
 {id:'split-limits',cases:[...[920,1100,1500].flatMap(w=>['preview-left','editor-left'].flatMap(l=>['right','left'].map(d=>`${w}-${l}-${d}`))),'keyboard-window-sidebar'],
  scope:'12 pointer limits with code editing/undo/source return; aggregate keyboard limits, window shrink/restore, preferred divider persistence and sidebar limit',
  outcomes:text=>[...[...text.matchAll(/^([\w-]+): pointer limits, code editing\/undo, source return and format menu passed$/gm)].map(m=>m[1]),...(text.includes('keyboard limits, window shrink/restore and sidebar limit passed')?['keyboard-window-sidebar']:[])]},
 {id:'recovery-interactions',cases:['keyboard','cancel-read','cancel-create','retry-pending','missing','create-failed','narrow-en'],
  scope:'Synthetic recovery: focus containment, blocked background shortcuts, Escape/Later, pending cancellation/retry isolation, missing-file draft, creation failure and narrow English controls',outcomes:passNames},
 {id:'recovery-archive',cases:['zh-CN','en'],
  scope:'Safety Center archive preview, escaped text and copy payload in both languages; backend intercepted, not a native save dialog or disk-write proof',outcomes:passNames},
 {id:'startup-race',cases:['new-pending','new-typed','open-typed','initial-pending','mode-pending','normal-preview','normal-edit'],
  scope:'Delayed preferences/initial file/startup mode must preserve a newer open/new request or user input; normal preview/edit startup',outcomes:passNames},
 {id:'startup-explorer',cases:['prefs-folder','pending-folder','restore-old','restore-same','refresh-mode','refresh-order','refresh-error','recovery-late','recovery-idle'],
  scope:'Folder selection and refresh ordering, stale errors suppressed, late recovery cannot steal typing focus or replace dirty content, idle explicit recovery',outcomes:passNames},
 {id:'editor-only',cases:['editor-only-windows','editor-only-mac-key-emulation'],
  scope:'Full editor width, no hidden preview mutation, layout persistence, Ctrl/Cmd key emulation, cursor/history, save receipt, fresh export and large-document restore; not native macOS verification',outcomes:passNames},
 {id:'document-conflict',cases:['reader-recovery','autosave-blocking','conflict-controls'],
  scope:'Synthetic disk conflict comparison, keep/cancel copy/merge/explicit save and undo; reader-only merge backup/restart; legacy/conflicted recovery blocked across actual autosave interval',
  outcomes:text=>[
   ...(text.includes('Reader-only merge backup and restart recovery: PASS')?['reader-recovery']:[]),
   ...(text.includes('Legacy and conflicted crash recovery across autosave interval: PASS')?['autosave-blocking']:[]),
   ...(text.includes('Browser conflict comparison / keep / cancelled copy / merge / explicit save: PASS')?['conflict-controls']:[]),
  ]},
];

export function documentCaseOutcomes(id,text){
 const spec=specs.find(s=>s.id===id);
 if(!spec)throw Error('Unknown document/layout scope');
 return spec.outcomes(text);
}

export async function documentLayoutEvidence({root,evidenceRoot,fingerprint}){
 return Promise.all(specs.map(async spec=>{
  const result=evidenceRoot?await readLiveEvidence({root,evidenceRoot,fingerprint,name:spec.id,script:`frontend/tests/browser-${spec.id}.mjs`,settings:{}}):{accepted:false,reason:'no document/layout evidence directory',text:''};
  const actual=result.accepted?spec.outcomes(result.text):[];
  return {id:spec.id,status:result.accepted&&exactEvidenceCases(actual,spec.cases)?'recorded-pass':'pending',scope:spec.scope,
   expectedCases:spec.cases.length,passedCases:spec.cases.filter(name=>actual.filter(value=>value===name).length===1).length,
   missing:spec.cases.filter(name=>actual.filter(value=>value===name).length!==1),provenance:{accepted:result.accepted,reason:result.reason},
   log:evidenceRoot?path.join(evidenceRoot,spec.id,'run.log'):null};
 }));
}
