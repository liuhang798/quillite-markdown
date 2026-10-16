import path from 'node:path';
import {readLiveEvidence} from './live-evidence.mjs';
import {exactEvidenceCases} from './live-editing-evidence.mjs';

const passNames=text=>[...text.matchAll(/^PASS (.+)$/gm)].map(m=>m[1]);
const jsonLines=text=>text.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
const formats=['bold','italic','bold-italic','strikethrough','highlight','inline-code','underline','superscript','subscript','keyboard-key'];
const specs=[
 {id:'multi-format',cases:[...['live','source'].flatMap(mode=>formats.map(f=>`${mode} ${f}`)),'live colors','source colors','live cursors','source cursors','bidi','wrapped'],
  scope:'Three keyboard-created selections: ten format toggles, colors, placeholders, Enter, source/live, exact history and visible bidi/wrapped selection geometry',
  outcomes:text=>[...[...text.matchAll(/^(live|source) ([\w-]+): all ranges, toggle, undo\/redo, newline where live passed$/gm)].map(m=>`${m[1]} ${m[2]}`),...[...text.matchAll(/^(live|source): all-range color replace\/reset and isolated undo passed$/gm)].map(m=>m[1]+' colors'),...[...text.matchAll(/^(live|source): three empty cursors, placeholders, typing and undo passed$/gm)].map(m=>m[1]+' cursors'),...[...text.matchAll(/^(bidi|wrapped): multi-range selection paint, format and undo passed$/gm)].map(m=>m[1])]},
 {id:'multi-block',cases:[...['live','source'].flatMap(mode=>['h1','h2','h3','h4','h5','h6','quote','unordered-list','ordered-list','task-list'].map(f=>`${mode} ${f}`)),'live nested','source nested','source heading painter','source color painter','live heading painter','live color painter','pointer painter'],
  scope:'Six heading levels and four block styles on multiple selections, nested list indentation, same-line deduplication; format painter for heading/inline/color styles, modifier and mouse-release timing, exact history',
  outcomes:text=>[...[...text.matchAll(/^(live|source) ([\w-]+): all selected lines, untouched gaps, undo\/redo passed$/gm)].map(m=>`${m[1]} ${m[2]}`),...[...text.matchAll(/^(live|source): nested list markers\/continuation and same-line deduplication passed$/gm)].map(m=>m[1]+' nested'),...[...text.matchAll(/^painter (source|live) (true|false) /gm)].map(m=>`${m[1]} ${m[2]==='true'?'color':'heading'} painter`),...(text.includes('Pointer pause, release-to-apply and undo passed')?['pointer painter']:[])]},
 {id:'multi-actions',cases:['table','code','details','footnote','summary','nested'].flatMap(c=>['cursor','Backspace','Delete','Enter','paste','paste-plain'].map(a=>c+'-'+a)),
  scope:'Six nested contexts: select-all matches, visible carets, deletion, Enter, rich/plain paste, exact continuation and history',
  outcomes:text=>jsonLines(text).some(r=>r.PASS===36&&r.pageErrors?.length===0)?[...passNames(text),...[...text.matchAll(/^VISIBLE CURSORS ([\w-]+-cursor) /gm)].map(m=>m[1])]:[]},
 {id:'cross-format',cases:['root','details','table','footnote'].flatMap(c=>['bold-em','color-u','link-mark','nested'].flatMap(f=>['backward','forward'].flatMap(d=>['paste','delete','type','whole'].map(a=>`${c}-${f}-${d}-${a}`)))),
  scope:'128 real forward/reverse drags across formatting: rich paste, delete, type, whole replacement; retained side styles, plain continuation, toggle and exact history',
  outcomes:text=>jsonLines(text).some(r=>r.passed===128&&r.pageErrors?.length===0)?[...text.matchAll(/^([\w-]+) \{"before":/gm)].map(m=>m[1]):[]},
 {id:'live-search',cases:['heading','bold','table','code','formula','diagram','image','link','details','footnote','table-link','details-link','search options live','search options source'],
  scope:'12 block types plus source/live options: visible result, replace, hidden-source restore, case/word/regex, select/replace all, invalid/no-match input and undo',outcomes:passNames},
 {id:'nested-search',cases:['table','code','details','html','footnote','nested-code','summary','comment','deep-table','hidden root-link','hidden table-link','hidden details-link'],
  scope:'Nine nested entry points: Ctrl+F root search and four next/previous shortcuts, focus-to-result and typing; three hidden URL destinations restored after pointer placement',
  outcomes:text=>[...passNames(text),...(jsonLines(text).some(r=>r.PASS===9&&r.closedPanelHidden===3&&r.pageErrors?.length===0)?['hidden root-link','hidden table-link','hidden details-link']:[])]},
 {id:'search-all',cases:['table','code','details','nested','html','footnote','summary','comment'].flatMap(c=>['mixed','only'].map(m=>c+'-'+m)),
  scope:'16 nested-only/mixed selections: all visible matches, original-source regex anchors, Escape retains selections, replacement/pipe escaping and undo/redo',outcomes:passNames},
 {id:'spelling-live',cases:['plain','emoji','bold','quote','table','details','summary','footnote','nested','ignore all occurrences without source changes','personal dictionary add, new document, cancel and clear','disable and re-enable','non-prose exclusions','US and UK dictionaries'],
  scope:'Nine prose locations: actual context menu correction and history; ignore scope, personal dictionary, cancel/clear, re-enable, code/math/URL exclusions and US/UK switch using local dictionaries',outcomes:passNames},
];

export function selectionCaseOutcomes(id,text) {
 const spec=specs.find(spec=>spec.id===id);
 if(!spec)throw Error('Unknown selection/search scope');
 return spec.outcomes(text);
}

export async function selectionSearchEvidence({root,evidenceRoot,fingerprint}) {
 return Promise.all(specs.map(async spec=>{
  const result=evidenceRoot?await readLiveEvidence({root,evidenceRoot,fingerprint,name:spec.id,script:`frontend/tests/browser-${spec.id}.mjs`,settings:{}}):{accepted:false,reason:'no selection/search evidence directory',text:''};
  const actual=result.accepted?spec.outcomes(result.text):[];
  return {id:spec.id,status:result.accepted&&exactEvidenceCases(actual,spec.cases)?'recorded-pass':'pending',scope:spec.scope,
   expectedCases:spec.cases.length,passedCases:spec.cases.filter(name=>actual.filter(value=>value===name).length===1).length,
   missing:spec.cases.filter(name=>actual.filter(value=>value===name).length!==1),provenance:{accepted:result.accepted,reason:result.reason},
   log:evidenceRoot?path.join(evidenceRoot,spec.id,'run.log'):null};
 }));
}
