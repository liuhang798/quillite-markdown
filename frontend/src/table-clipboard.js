import {TABLE_LIMITS} from './table-designer.js';
import {escapeMarkdownText} from './markdown-formats.js';

export const TABLE_CLIPBOARD_LIMIT = 500000;

// TSV only: ordinary prose/newlines and comma-containing text keep normal paste.
// Preserve blank rows/cells, quoted tabs/newlines, and a single terminal newline.
export function parseTableClipboardTSV(source) {
  if (!source.includes('\t')) return null;
  if (source.length > TABLE_CLIPBOARD_LIMIT) throw new Error('table-paste-limit');
  const rows=[];let row=[],value='',quoted=false,closed=false;
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(quoted) {
      if(c==='"'&&source[i+1]==='"'){value+='"';i++;}
      else if(c==='"'){quoted=false;closed=true;}
      else value+=c;
    }else if(c==='\t'||c==='\r'||c==='\n') {
      row.push(value);value='';closed=false;
      if(c!=='\t'){rows.push(row);row=[];if(c==='\r'&&source[i+1]==='\n')i++;}
    }else if(c==='"'&&!value&&!closed)quoted=true;
    else {if(closed)throw new Error('table-paste-shape');value+=c;}
  }
  if(quoted)throw new Error('table-paste-shape');
  if(row.length||value||!/[\r\n]$/.test(source))rows.push([...row,value]);
  if(!rows.length||rows.some(row=>row.length!==rows[0].length))throw new Error('table-paste-shape');
  return rows.map(row=>row.map(value=>escapeMarkdownText(value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'))
    .replace(/[~=$]/g,'\\$&').replace(/\r\n?|\n/g,'<br>').replaceAll('\t','&#9;').replace(/^ +| +$/g,spaces=>'&#32;'.repeat(spaces.length))));
}

// Cell source is already safe inline Markdown, including rich-cell conversion.
export function tableGridEdit(source,item,index,grid) {
  if(item?.kind!=='table'||!item.cells?.[index]||source.slice(item.from,item.to)!==item.raw)return null;
  if(!Array.isArray(grid)||!grid.length||!grid[0]?.length||grid.some(row=>!Array.isArray(row)||row.length!==grid[0].length||row.some(cell=>typeof cell!=='string')))throw new Error('table-paste-shape');
  const start=item.cells[index],last=item.cells.at(-1),rows=Math.max(last.row+1,start.row+grid.length),columns=Math.max(last.column+1,start.column+grid[0].length);
  if(rows>Math.max(TABLE_LIMITS.maxRows,last.row+1)||columns>Math.max(TABLE_LIMITS.maxColumns,last.column+1)||grid.reduce((n,row)=>n+row.reduce((m,cell)=>m+cell.length,0),0)>TABLE_CLIPBOARD_LIMIT)throw new Error('table-paste-limit');
  const safe=text=>text.replace(/\r\n?|\n/g,'<br>').replace(/(\\*)\|/g,(match,slashes)=>slashes.length%2?match:`${slashes}\\|`);
  const targetRow=start.row+grid.length-1,targetColumn=start.column+grid[0].length-1;
  if(rows===last.row+1&&columns===last.column+1) {
    const changes=[];let delta=0,anchor=0;
    for(const cell of item.cells)if(cell.row>=start.row&&cell.row<=targetRow&&cell.column>=start.column&&cell.column<=targetColumn){
      const insert=safe(grid[cell.row-start.row][cell.column-start.column]);changes.push({from:cell.from,to:cell.to,insert});
      if(cell.row===targetRow&&cell.column===targetColumn)anchor=cell.from+delta+insert.length;
      delta+=insert.length-(cell.to-cell.from);
    }
    return{changes,selection:{anchor}};
  }
  // Expansion retains every old raw cell, rather than parsing/escaping it again.
  const cells=Array.from({length:rows},()=>Array(columns).fill(''));
  for(const cell of item.cells)cells[cell.row][cell.column]=source.slice(cell.from,cell.to);
  grid.forEach((row,r)=>row.forEach((value,c)=>{cells[start.row+r][start.column+c]=safe(value);}));
  const prefix=item.projection?.prefix||'';let insert='',anchor=0;
  const add=line=>{if(insert)insert+='\n'+prefix;insert+=line;};
  if(item.widths)add(`<!-- quillite-table-widths: ${Array.from({length:columns},(_,c)=>item.widths[c]||TABLE_LIMITS.defaultWidth).join(', ')} -->`);
  cells.forEach((row,r)=>{
    if(insert)insert+='\n'+prefix;
    insert+='| ';
    row.forEach((value,c)=>{insert+=value;if(r===targetRow&&c===targetColumn)anchor=item.from+insert.length;insert+=c===columns-1?' |':' | ';});
    if(r===0)add('| '+Array.from({length:columns},(_,c)=>item.alignments?.[c]==='center'?':---:':item.alignments?.[c]==='right'?'---:':'---').join(' | ')+' |');
  });
  return{changes:{from:item.from,to:item.to,insert},selection:{anchor}};
}
