import {markdownParser} from './markdown-parser.js';
import {frontmatterRange} from './frontmatter.js';
import {prepareFootnotes} from './markdown-formats.js';
import {footnoteProjection} from './footnote-editing.js';
import {fieldPosition} from './projected-code.js';
import {scanMarkdownFormulas} from './formula-editing.js';
import {decodeHTML} from 'entities';

export const referenceLabelKey=text=>text.trim().replace(/\s+/g,' ').toLowerCase();
// Markdown entities require a semicolon. HTML's permissive text decoder would
// corrupt ordinary query parameters such as &not=2 and &copy=2.
export const decodeReferenceValue=(text,angles=false)=>(angles?text.replace(/^<|>$/g,''):text).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])|&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g,(match,escaped)=>escaped??decodeHTML(match));

// All definitions belong to one document scope, including footnote bodies.
// Keep exact root coordinates for edits and first-declaration-wins ordering;
// neither the reference's location nor footnote display order changes priority.
export function markdownReferenceDefinitions(source,tree=null,footnotes=null) {
  if(!source.includes(']:'))return new Map();
  const found=[];
  footnotes??=source.includes('[^')?prepareFootnotes(source).definitions:new Map();
  const collect=(text,syntax,map,excluded=[])=>{
    const protectedRanges=[...excluded,...scanMarkdownFormulas(text)];
    syntax.iterate({enter(node){
      if(node.name!=='LinkReference'||protectedRanges.some(range=>node.from<range.to&&node.to>range.from))return;
      const label=node.node.getChild('LinkLabel'),url=node.node.getChild('URL'),title=node.node.getChild('LinkTitle');
      if(!label||!url)return;
      const key=referenceLabelKey(text.slice(label.from+1,label.to-1));if(key.startsWith('^'))return;
      found.push({key,from:map(node.from),to:map(node.to),ref:decodeReferenceValue(text.slice(url.from,url.to),true),
        title:title?text.slice(title.from,title.to):'',urlFrom:map(url.from),urlTo:map(url.to),
        titleFrom:title?map(title.from):undefined,titleTo:title?map(title.to):undefined});
    }});
  };
  const metadata=frontmatterRange(source);
  collect(source,tree||markdownParser.parse(source),position=>position,[...footnotes.values(),...(metadata?[metadata]:[])]);
  for(const note of footnotes.values()) {
    const projection=footnoteProjection(source,note),range={from:note.bodyFrom,to:note.to,projection};
    collect(projection.text,markdownParser.parse(projection.text),position=>fieldPosition(range,position));
  }
  found.sort((a,b)=>a.from-b.from);
  const definitions=new Map();for(const item of found)if(!definitions.has(item.key))definitions.set(item.key,item);
  return definitions;
}
