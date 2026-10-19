import path from 'node:path';
import {readLiveEvidence} from './live-evidence.mjs';

const tableKinds=['plain','quote','list','nested','ordered','task','quotedList','listQuote','inlineList','details'];
const gridCases=['plain','quote','list','details','footnote'].flatMap(kind=>['tsv','expand','html','blank','drag','reverse','invalid','limit','merged','mixed','media'].map(mode=>`${kind}-${mode}`));
const pasteCases=['quote','list','quote-list','list-quote','nested-list','ordered','task'].flatMap(kind=>['out-paste','in-paste','out-fence','out-delete','in-delete'].map(action=>`${kind}/${action}`));
const richCases=['cross-code','cross-quote-code','details-body','direct-code','source-code','nested-code','table-cell','summary','prose','inline-code'];
const jsonLines=text=>text.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);
export function exactEvidenceCases(actual, expected) {
  return actual.length===expected.length&&expected.every(name=>actual.filter(value=>value===name).length===1);
}
const tableCases=text=>text.split(/\r?\n/).filter(line=>line.endsWith('shared undo passed')).map(line=>line.split(':')[0]);
const specs=[
 {name:'table-grid-paste',script:'browser-table-grid-paste.mjs',settings:{},cases:gridCases,
  scope:'55 cases: plain/quote/list/details/footnote; TSV, rich HTML, expansion, blank cells, forward/reverse drag, atomic rejection, one undo/redo and continued input',
  outcomes:text=>[...text.matchAll(/^PASS ([\w-]+)$/gm)].map(match=>match[1])},
 ...[['container-tables',{}],['container-tables-whitespace',{AUDIT_TABLE_WHITESPACE:'1'}]].map(([name,settings])=>({name,settings,script:'browser-container-tables.mjs',cases:tableKinds,
  scope:'10 containers: cell typing/escaping, Tab navigation, source return, cross-cell/block drag, designer row/column changes, drag reorder, width/alignment, reopen, remove and undo; '+(settings.AUDIT_TABLE_WHITESPACE?'trailing space/tab preservation':'standard whitespace'),outcomes:tableCases})),
 {name:'container-paste',script:'browser-container-paste.mjs',settings:{},cases:[...pasteCases,'app/quote','app/nested-list'],
  scope:'35 container code drag paste/delete cases plus two full-app clipboard/reading-preview/undo cases',
  outcomes:text=>[...jsonLines(text).filter(row=>row.pass===true&&row.undoExact===true).map(row=>`${row.kind}/${row.action}`),...[...text.matchAll(/^Full application ([\w-]+) native clipboard and undo passed\.$/gm)].map(match=>'app/'+match[1])]},
 {name:'rich-paste',script:'browser-rich-paste.mjs',settings:{},cases:richCases,
  scope:'10 full-app rich clipboard targets: prose, summary, table, details, inline/block/source code and cross-container selections; exact conversion, reading preview and undo',
  outcomes:text=>jsonLines(text).filter(row=>row.pass===true&&row.undoExact===true).map(row=>row.name)},
 {name:'copy-options',script:'browser-copy-options.mjs',settings:{},
  cases:['markdown','inline-html','entities','literal-code','html-break','hidden-html'].flatMap(kind=>['source','live'].flatMap(mode=>['markdown','plain'].map(format=>`${kind}-${mode}-${format}`))),
  scope:'24 actual right-click copy/paste cases in source/live modes, exact Markdown/plain text, HTML/entities/code/break/hidden-text semantics, unchanged source and undo/redo; immediate external-frame focus',
  outcomes:text=>text.includes('PASS 24 copy option cases')?jsonLines(text).filter(row=>row.actual===row.expected).map(row=>row.id):[]},
];

export async function editingBoundaryEvidence({root,evidenceRoot,fingerprint}) {
  return Promise.all(specs.map(async spec=>{
    const result=evidenceRoot?await readLiveEvidence({root,evidenceRoot,fingerprint,name:spec.name,script:'frontend/tests/'+spec.script,settings:spec.settings}):{accepted:false,reason:'no boundary evidence directory',text:''};
    const actual=result.accepted?spec.outcomes(result.text):[];
    return {id:spec.name,status:result.accepted&&exactEvidenceCases(actual,spec.cases)?'recorded-pass':'pending',scope:spec.scope,
      expectedCases:spec.cases.length,passedCases:spec.cases.filter(name=>actual.filter(value=>value===name).length===1).length,
      missing:spec.cases.filter(name=>actual.filter(value=>value===name).length!==1),provenance:{accepted:result.accepted,reason:result.reason},
      log:evidenceRoot?path.join(evidenceRoot,spec.name,'run.log'):null};
  }));
}
