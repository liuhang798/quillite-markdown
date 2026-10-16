import {findMarkdownTableAt} from './table-designer.js';
import {resolveEditableOwner} from './editable-owner.js';
import {prepareFootnotes} from './markdown-formats.js';
import {footnoteProjection} from './footnote-editing.js';
import {fieldOffset,fieldPosition} from './projected-code.js';
import {blockDropPrefix} from './block-drop-context.js';

export function tableInsertion(source, from, to, markdown) {
  if(![from,to].every(Number.isInteger)||from<0||to<from||to>source.length)return null;
  let scope=source,at=from,end=to,outerPrefix='';
  if(source.includes('[^'))for(const note of prepareFootnotes(source).definitions.values()) {
    if(from<note.bodyFrom||to>note.to)continue;
    const projection=footnoteProjection(source,note),range={from:note.bodyFrom,to:note.to,projection};
    scope=projection.text;at=fieldOffset(range,from);end=fieldOffset(range,to);outerPrefix=projection.prefix;break;
  }
  const localPrefix=blockDropPrefix(scope,at),prefix=outerPrefix+localPrefix;
  // Do not leave an empty list item followed by a blank line: Markdown would
  // close the list before the new table. Put metadata on its marker line.
  const lineBefore=scope.slice(scope.lastIndexOf('\n',at-1)+1,at);
  const markerOnly=/^(?:[ \t]*>[ \t]*)*[ \t]*(?:[-+*]|\d+[.)])[ \t]+$/.test(lineBefore);
  const leading=at>0&&scope[at-1]!=='\n'&&!markerOnly?'\n\n':'';
  const trailing=end<scope.length&&scope[end]!=='\n'?'\n\n':'\n';
  const indent=text=>text.replaceAll('\n','\n'+prefix);
  // An unindented blank line can still belong to a list item. Its first
  // inserted line needs that local prefix too (outer footnote indent already
  // precedes the root caret). Otherwise width metadata escapes the container.
  const firstPrefix=!leading&&!markerOnly?localPrefix:'';
  const insert=firstPrefix+indent(leading+markdown+trailing);
  return {changes:{from,to,insert},selection:{anchor:from+firstPrefix.length+indent(leading).length,head:from+firstPrefix.length+indent(leading+markdown).length}};
}

// Toolbar selections already use root coordinates, even when focus came from
// a nested cell. Parse the containing footnote's projected body, then map the
// whole table (including width metadata) back without consuming its suffix.
export function findEditableTableAt(source, position) {
  if(!Number.isInteger(position)||position<0||position>source.length)return null;
  if(source.includes('[^'))for(const note of prepareFootnotes(source).definitions.values()) {
    if(position<note.bodyFrom||position>note.to)continue;
    const projection=footnoteProjection(source,note),range={from:note.bodyFrom,to:note.to,projection};
    const table=findMarkdownTableAt(projection.text,fieldOffset(range,position));
    if(!table)return null;
    const map=offset=>fieldPosition(range,offset);
    return {...table,from:map(table.from),to:map(table.tableTo),tableFrom:map(table.tableFrom),tableTo:map(table.tableTo),
      line:source.slice(0,map(table.tableFrom)).split('\n').length,prefix:projection.prefix+table.prefix,trailingNewline:false};
  }
  return findMarkdownTableAt(source,position);
}

// Parse in the widget's actual Markdown scope. The root parser cannot see
// tables inside a footnote's indented body. Only then map the exact replacement
// back to the history-owning document, retaining every container prefix.
export function resolveEditableTable(view, item) {
  if (item?.kind !== 'table' || view.destroyed) return null;
  const source=view.state.doc.toString();
  if (source.slice(item.from,item.to)!==item.raw) return null;
  const table=findMarkdownTableAt(source,item.from);
  if (!table || table.from!==item.from || table.tableTo!==item.to) return null;
  const owner=resolveEditableOwner(view,{from:table.from,to:table.tableTo},true);
  if (!owner) return null;
  // Leave the following newline and its original indentation untouched.
  return {...table,editor:owner.view,from:owner.from,to:owner.to,
    prefix:owner.projectionPrefix+table.prefix,trailingNewline:false};
}
