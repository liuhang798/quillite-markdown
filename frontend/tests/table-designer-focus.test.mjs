import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createTableModel,TABLE_LIMITS} from '../src/table-designer.js';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const render=renderer.slice(renderer.indexOf('function renderTableDesigner('),renderer.indexOf('\nfunction resizeTableFromFields('));
function fixture() {
 const queued=[],fields=new Map(),nodes=[];
 let active=null;
 const node=tag=>{const el={tag,style:{},dataset:{},children:[],setAttribute(){},append(...children){this.children.push(...children);},focus(){active=this;}};nodes.push(el);return el;};
 const grid={replaceChildren(table){this.table=table;},querySelector(selector){
  const [,row,column]=selector.match(/row="(\d+)".*column="(\d+)"/);
  const visit=el=>el.dataset?.tableCellRow===row&&el.dataset?.tableCellColumn===column?el:el.children?.map(visit).find(Boolean);
  return visit(this.table);
 }};
 const context=vm.createContext({tableDesignerState:{model:createTableModel(3,3)},TABLE_LIMITS,
  els:{tableDesignerGrid:grid},document:{createElement:node},t:key=>key,tableAlignmentLabel:value=>value,
  $:id=>{if(!fields.has(id))fields.set(id,{});return fields.get(id);},requestAnimationFrame:cb=>queued.push(cb)});
 vm.runInContext(render,context);
 return{context,queued,grid,get active(){return active;},nodes};
}
test('table render focuses the new cell synchronously, never stealing a later user choice',()=>{
 const f=fixture();f.context.renderTableDesigner({row:0,column:2});
 assert.equal(f.active?.dataset.tableCellColumn,'2');assert.equal(f.queued.length,0);
 const chosen=f.grid.querySelector('[data-table-cell-row="2"][data-table-cell-column="1"]');chosen.focus();
 f.queued.forEach(cb=>cb());assert.equal(f.active,chosen);
});
test('table render without focus request never focuses or schedules a cell',()=>{
 const f=fixture();f.context.renderTableDesigner();assert.equal(f.active,null);assert.equal(f.queued.length,0);
 f.context.tableDesignerState=null;f.context.renderTableDesigner({row:0,column:0});assert.equal(f.active,null);
});
