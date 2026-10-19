import { markdownParser } from './markdown-parser.js';
import { codeProjection } from './projected-code.js';

export const TABLE_LIMITS = Object.freeze({ minRows: 2, maxRows: 20, minColumns: 1, maxColumns: 12, minWidth: 170, maxWidth: 360, defaultWidth: 220 });

const WIDTH_METADATA = /^\s*<!--\s*quillite-table-widths:\s*([\d,\s]+)\s*-->\s*$/i;
const DIVIDER_CELL = /^:?-{3,}:?$/;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || minimum));

export function splitMarkdownTableRow(line) {
  let source = String(line || '').trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);
  const cells = [];
  let cell = '';
  let codeFenceLength = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && source[index + 1] === '|') {
      cell += '|';
      index += 1;
      continue;
    }
    if (character === '`') {
      let run = 1;
      while (source[index + run] === '`') run += 1;
      if (codeFenceLength === 0) codeFenceLength = run;
      else if (codeFenceLength === run) codeFenceLength = 0;
      cell += '`'.repeat(run);
      index += run - 1;
      continue;
    }
    if (character === '|' && codeFenceLength === 0) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function dividerAlignment(cell) {
  const value = cell.trim();
  if (!DIVIDER_CELL.test(value)) return null;
  if (value.startsWith(':') && value.endsWith(':')) return 'center';
  if (value.endsWith(':')) return 'right';
  return 'left';
}

function normalizedWidths(rawWidths, columns) {
  const widths = Array.isArray(rawWidths) ? rawWidths : [];
  return Array.from({ length: columns }, (_, index) => clamp(widths[index] || TABLE_LIMITS.defaultWidth, TABLE_LIMITS.minWidth, TABLE_LIMITS.maxWidth));
}

export function createTableModel(rows = 3, columns = 3, headerLabel = index => `Column ${index + 1}`) {
  const rowCount = clamp(rows, TABLE_LIMITS.minRows, TABLE_LIMITS.maxRows);
  const columnCount = clamp(columns, TABLE_LIMITS.minColumns, TABLE_LIMITS.maxColumns);
  return {
    cells: Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => rowIndex === 0 ? headerLabel(columnIndex) : '')),
    alignments: Array(columnCount).fill('left'),
    widths: normalizedWidths([], columnCount)
  };
}

export function resizeTableModel(model, rows, columns, headerLabel = index => `Column ${index + 1}`) {
  const rowCount = clamp(rows, TABLE_LIMITS.minRows, TABLE_LIMITS.maxRows);
  const columnCount = clamp(columns, TABLE_LIMITS.minColumns, TABLE_LIMITS.maxColumns);
  const cells = Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => {
    const existing = model.cells?.[rowIndex]?.[columnIndex];
    if (existing !== undefined) return existing;
    return rowIndex === 0 ? headerLabel(columnIndex) : '';
  }));
  return {
    cells,
    alignments: Array.from({ length: columnCount }, (_, index) => model.alignments?.[index] || 'left'),
    widths: normalizedWidths(model.widths, columnCount)
  };
}

function moveItem(items, from, to) {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function reorderTableColumn(model, from, to) {
  if (from === to || from < 0 || to < 0 || from >= model.alignments.length || to >= model.alignments.length) return model;
  return {
    cells: model.cells.map(row => moveItem(row, from, to)),
    alignments: moveItem(model.alignments, from, to),
    widths: moveItem(model.widths, from, to)
  };
}

export function reorderTableRow(model, from, to) {
  if (from === 0 || to === 0 || from === to || from < 1 || to < 1 || from >= model.cells.length || to >= model.cells.length) return model;
  return { ...model, cells: moveItem(model.cells, from, to) };
}

export function removeTableRow(model, index) {
  if (index <= 0 || index >= model.cells.length || model.cells.length <= TABLE_LIMITS.minRows) return model;
  return { ...model, cells: model.cells.filter((_, rowIndex) => rowIndex !== index) };
}

export function removeTableColumn(model, index) {
  if (index < 0 || index >= model.alignments.length || model.alignments.length <= TABLE_LIMITS.minColumns) return model;
  return {
    cells: model.cells.map(row => row.filter((_, columnIndex) => columnIndex !== index)),
    alignments: model.alignments.filter((_, columnIndex) => columnIndex !== index),
    widths: model.widths.filter((_, columnIndex) => columnIndex !== index)
  };
}

function escapeTableCell(value) {
  return String(value ?? '').replace(/\r?\n/g, '<br>').replace(/(?<!\\)\|/g, '\\|').trim();
}

export function serializeMarkdownTable(model) {
  const columns = model.alignments.length;
  const widths = normalizedWidths(model.widths, columns);
  const row = values => `| ${Array.from({ length: columns }, (_, index) => escapeTableCell(values?.[index] || '')).join(' | ')} |`;
  const divider = model.alignments.map(alignment => alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : ':---');
  return [
    `<!-- quillite-table-widths: ${widths.join(', ')} -->`,
    row(model.cells[0]),
    row(divider),
    ...model.cells.slice(1).map(row)
  ].join('\n');
}

// Project whole syntax rows, omitting only their quote/list prefixes. Cell
// contents remain original Markdown and retain exact UTF-16 source positions.
export function tableProjection(source, node) {
  const rows=[];
  for(let child=node.firstChild;child;child=child.nextSibling) if(['TableHeader','TableDelimiter','TableRow'].includes(child.name)) rows.push(child);
  const start=source.lastIndexOf('\n',node.from-1)+1;
  let prefix=source.slice(start,node.from);
  for(let parent=node.parent;parent;parent=parent.parent) {
    const mark=parent.name==='ListItem' && parent.getChild('ListMark');
    if(mark && mark.from>=start && mark.to<=node.from) prefix=prefix.slice(0,mark.from-start)+' '.repeat(mark.to-mark.from)+prefix.slice(mark.to-start);
  }
  return codeProjection(source,rows.map((row,index)=>({from:row.from,to:index<rows.length-1?source.indexOf('\n',row.to)+1:row.to})),node.from,prefix,node);
}

export function serializeTableReplacement(model, table) {
  return serializeMarkdownTable(model).replaceAll('\n','\n'+(table?.prefix || ''))+(table?.trailingNewline===false?'':'\n');
}

export function findMarkdownTables(source, syntaxTree) {
  const text = String(source || '');
  if (!syntaxTree && text.includes('\r\n')) {
    const removed=[];
    for(const match of text.matchAll(/\r(?=\n)/g))removed.push(match.index-removed.length);
    const restore=position=>{let low=0,high=removed.length;while(low<high){const middle=(low+high)>>1;if(removed[middle]<=position)low=middle+1;else high=middle;}return position+low;};
    return findMarkdownTables(text.replace(/\r(?=\n)/g,'')).map(table=>({...table,
      from:restore(table.from),to:restore(table.to),tableFrom:restore(table.tableFrom),tableTo:restore(table.tableTo)}));
  }
  const tables = [];
  const visit=node=>{
    if(node.name==='Table') {
      const projection=tableProjection(text,node), rows=projection.text.split('\n');
      const alignments=splitMarkdownTableRow(rows[1]).map(dividerAlignment);
      const cells=[rows[0],...rows.slice(2)].map(splitMarkdownTableRow);
      // An irregular row cannot be round-tripped without inventing/dropping cells.
      if(!alignments.length || alignments.some(a=>a===null) || cells.some(row=>row.length!==alignments.length)) return;
      if(cells.length<TABLE_LIMITS.minRows)cells.push(Array(alignments.length).fill(''));
      let previous=node.prevSibling;
      while(previous?.name==='QuoteMark')previous=previous.prevSibling;
      const lineStart=text.lastIndexOf('\n',node.from-1)+1;
      const adjacent=previous && text.slice(previous.to,node.from).replaceAll('\r','')==='\n'+text.slice(lineStart,node.from);
      const metadata=adjacent && previous.name==='CommentBlock' && text.slice(previous.from,previous.to).match(WIDTH_METADATA);
      const widths=metadata?metadata[1].split(',').map(value=>Number(value.trim())):[];
      tables.push({from:metadata?previous.from:node.from,to:node.to+(text[node.to]==='\n'?1:0),
        line:text.slice(0,node.from).split('\n').length,hasWidthMetadata:!!metadata,
        prefix:projection.prefix,tableFrom:node.from,tableTo:node.to,
        model:{cells,alignments,widths:normalizedWidths(widths,alignments.length)}});
      return;
    }
    for(let child=node.firstChild;child;child=child.nextSibling)visit(child);
  };
  visit((syntaxTree || markdownParser.parse(text)).topNode);
  return tables;
}

export function findMarkdownTableAt(source, offset) {
  const position = clamp(offset, 0, String(source || '').length);
  return findMarkdownTables(source).find(table => position >= table.from && position <= table.to) || null;
}

export function stripTableWidthMetadata(source) {
  const text = String(source || '');
  const characters = text.split(''); // Source ranges use UTF-16, including after emoji.
  findMarkdownTables(text).filter(table => table.hasWidthMetadata).forEach(table => {
    const lineEnd = text.indexOf('\n', table.from);
    const end = lineEnd < 0 ? text.length : lineEnd;
    for (let index = table.from; index < end; index += 1) {
      if (characters[index] !== '\r') characters[index] = ' ';
    }
  });
  return characters.join('');
}
