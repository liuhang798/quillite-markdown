import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DIAGRAM_TEMPLATES, diagramTemplateSource } from '../src/diagram-templates.js';
import { parseStructuredDiagram, serializeStructuredDiagram, validateStructuredDiagram } from '../src/structured-diagram-editor.js';
const template = id => DIAGRAM_TEMPLATES.find(item => item.id === id);
const model = id => parseStructuredDiagram(id, diagramTemplateSource(template(id))).model;

test('all localized structured statistical defaults retain zero and fractional values', () => {
  const original = 'pie showData\n title Old\n "Zero" : 0\n "Fraction" : 0.25';
  const pie = parseStructuredDiagram('pie', original).model;
  pie.settings.title = 'New';
  const updated = parseStructuredDiagram('pie', serializeStructuredDiagram('pie', pie));
  assert.equal(updated.valid, true); assert.deepEqual(updated.model.rows, pie.rows);
  pie.rows[1].value = 1e-7;
  assert.match(serializeStructuredDiagram('pie', pie), /0\.0000001/);
  for (const id of ['pie','bar-chart','line-chart','doughnut-chart','sankey']) for (const locale of ['zh','en']) {
    const parsed = parseStructuredDiagram(id, diagramTemplateSource(template(id), locale));
    assert.equal(parsed.valid, true, id);
    assert.equal(parseStructuredDiagram(id, serializeStructuredDiagram(id, parsed.model)).valid, true, id);
  }
});

test('blank, non-finite, negative percentage data and missing categories never serialize as zero or disappear', () => {
  for (const id of ['pie','bar-chart','line-chart','doughnut-chart','sankey']) {
    for (const value of ['', ' ', NaN, Infinity, '1e999', null, undefined, true]) {
      const draft = model(id); draft.rows[0].value = value;
      assert.equal(validateStructuredDiagram(id, draft).valid, false, `${id}:${value}`);
      assert.throws(() => serializeStructuredDiagram(id, draft), /invalid-number/);
    }
    const zero = model(id); zero.rows[0].value = '0';
    assert.equal(validateStructuredDiagram(id, zero).valid, true);
    assert.ok(serializeStructuredDiagram(id, zero));
    const empty = model(id); empty.rows = []; assert.throws(() => serializeStructuredDiagram(id, empty), /empty-rows/);
  }
  for (const id of ['pie','doughnut-chart','sankey']) {
    const draft = model(id); draft.rows[0].value = -1; assert.throws(() => serializeStructuredDiagram(id, draft), /number-range/);
  }
  for (const id of ['bar-chart','line-chart']) {
    const draft = model(id); draft.rows[0].value = -1.25;
    assert.equal(JSON.parse(serializeStructuredDiagram(id, draft)).series[0].data[0], -1.25);
  }
  const pie = model('pie'); pie.rows[0].label = ''; assert.throws(() => serializeStructuredDiagram('pie', pie), /empty-label/);
});

test('ring category rename, swap, add and delete preserve legend styles and selected state', () => {
  const option = { legend: [{data:[{name:'A',icon:'circle'},'B'],selected:{A:false,B:true},top:12}], series:[{type:'pie',radius:['40%','60%'],data:[{name:'A',value:60,itemStyle:{color:'red'}},{name:'B',value:40}]}] };
  const parsed = parseStructuredDiagram('doughnut-chart', JSON.stringify(option));
  assert.equal(parsed.valid,true);
  parsed.model.rows[0].label='B'; parsed.model.rows[1].label='A';
  let saved = JSON.parse(serializeStructuredDiagram('doughnut-chart',parsed.model));
  assert.deepEqual(saved.legend[0].data,[{name:'B',icon:'circle'},'A']);
  assert.deepEqual(saved.legend[0].selected,{B:false,A:true});
  assert.equal(saved.legend[0].top,12); assert.deepEqual(saved.series[0].data[0].itemStyle,{color:'red'});
  parsed.model.rows.pop(); parsed.model.rows.push({label:'C',value:1});
  saved=JSON.parse(serializeStructuredDiagram('doughnut-chart',parsed.model));
  assert.deepEqual(saved.legend[0].data,[{name:'B',icon:'circle'},'C']);
  assert.deepEqual(saved.legend[0].selected,{B:false});
  assert.deepEqual(option.legend[0].selected,{A:false,B:true});
  parsed.model.rows[1].label='B'; assert.throws(()=>serializeStructuredDiagram('doughnut-chart',parsed.model),/duplicate-label/);
});

test('bar and line series rename synchronize string/object legends without touching unrelated config', () => {
  for (const id of ['bar-chart','line-chart']) {
    const option=JSON.parse(diagramTemplateSource(template(id))); option.series[0].name='Old';
    option.legend={data:[{name:'Old',icon:'rect'}],selected:{Old:false},formatter:'{name}'};
    const draft=parseStructuredDiagram(id,JSON.stringify(option)).model; draft.settings.seriesName='New';
    const saved=JSON.parse(serializeStructuredDiagram(id,draft));
    assert.deepEqual(saved.legend,{data:[{name:'New',icon:'rect'}],selected:{New:false},formatter:'{name}'});
  }
});

test('waterfall cumulative totals and every loss baseline agree in both locales', () => {
  for (const locale of ['zh','en']) {
    const option=JSON.parse(diagramTemplateSource(template('waterfall-chart'),locale));
    const [helper,inc,dec]=option.series.map(s=>s.data);
    let total=inc[0];
    for(let i=1;i<inc.length-1;i++) {
      if(typeof inc[i]==='number') {assert.equal(helper[i],total);total+=inc[i];}
      if(typeof dec[i]==='number') {total-=dec[i];assert.equal(helper[i],total);}
    }
    assert.equal(inc.at(-1),total); assert.equal(total,1330);
  }
});

test('ECharts syntax validation rejects missing/null series types and overflow before JSON cloning', () => {
  const source=readFileSync(new URL('../src/echarts-diagrams.js',import.meta.url),'utf8');
  const validate=vm.runInNewContext('('+source.slice(source.indexOf('export function validateEChartsSource')).replace('export ','')+')');
  for(const value of ['{"series":[null]}','{"series":[{}]}','{"series":[{"type":"pie","data":[1e999]}]}']) assert.equal(validate(value).valid,false);
  for(const item of DIAGRAM_TEMPLATES.filter(item=>item.engine==='echarts')) assert.equal(validate(diagramTemplateSource(item)).valid,true,item.id);
});

test('actual save commits only the successfully rendered unchanged draft in its original document and dialog', async () => {
  const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
  const fn=renderer.slice(renderer.indexOf('function insertGeneratedDiagram('),renderer.indexOf('function openTableDialog('));
  for(const scenario of ['valid','invalid','source','model','document','session','closed','reopened','selection','bad-input']) {
    let resolve, commits=0, closed=0;
    const selection={eq: other=>other===selection};
    const context=vm.createContext({state:{editing:true,documentSession:1},codeEditor:{state:{doc:{},selection}},
      els:{diagramSource:{value:'pie\n"A": 1',focus(){}},diagramDialog:{classList:{contains:()=>scenario==='closed'}}},
      diagramWizardState:{templateId:'pie',editRange:{}},structuredDiagramState:{model:{rows:[{value:1}]}},flowchartDesignerState:{mode:'visual'},
      diagramTemplateById:()=>({engine:'mermaid'}),checkStructuredDiagramDraft:()=>scenario!=='bad-input',
      validateDiagramRendering:()=>new Promise(done=>{resolve=done;}),updateDiagramActionLabels(){},showToast(){},t:k=>k,
      replaceExistingFlowchart:()=>{commits++;return true;},closeDiagramDialog:()=>closed++});
    vm.runInContext(fn,context);
    const pending=context.insertGeneratedDiagram();
    if(scenario==='bad-input'){assert.equal(resolve,undefined);continue;}
    assert.equal(context.insertGeneratedDiagram(),pending,'duplicate clicks share one request');
    if(scenario==='source')context.els.diagramSource.value='pie\n"A": 2';
    if(scenario==='model')context.structuredDiagramState.model.rows[0].value='';
    if(scenario==='document')context.codeEditor.state.doc={};
    if(scenario==='session')context.state.documentSession++;
    if(scenario==='reopened')context.diagramWizardState.saveRequest=null;
    if(scenario==='selection')context.codeEditor.state.selection={};
    resolve({valid:scenario!=='invalid',error:'bad chart'}); await pending;
    assert.equal(commits,scenario==='valid'?1:0,scenario); assert.equal(closed,commits,scenario);
  }
});
