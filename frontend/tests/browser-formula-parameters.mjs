// Fresh browser, synthetic document, real controls. No runtime editor mutations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {FORMULA_TEMPLATES, buildFormulaExpression, buildFormulaMarkdown} from '../src/formula-templates.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const chemistry={
 'chem-custom':{formula:'2Na + Cl2 -> 2NaCl'},molecule:{formula:'NaCl'},ion:{formula:'Ca^2+'},
 reaction:{reactants:'2Na + Cl2',products:'2NaCl'},reversible:{reactants:'H2 + I2',products:'2HI',condition:'light'},
 states:{reactants:'2H2(g) + O2(g)',products:'2H2O(l)'},precipitate:{reactants:'Ba^2+ + SO4^2-',product:'BaSO4 v'},gas:{reactants:'Zn + 2H+',products:'Zn^2+ + H2 ^'},
};
let browser,page;const results=[];
try{
 if(process.env.AUDIT_OUTPUT)await mkdir(process.env.AUDIT_OUTPUT,{recursive:true});
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1500,height:1100}});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});
 const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const root=app.locator('#markdownEditor > .cm-editor'),content=root.locator('> .cm-scroller > .cm-content'),widget=root.locator('.cm-formula-render').first();
 const read=()=>root.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const source=()=>app.locator('#formulaMarkdownSource').inputValue();
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});}};
 const save=async()=>{assert.equal(await app.locator('#insertFormula').isEnabled(),true);await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});await widget.waitFor();};
 const reopen=async()=>{await widget.focus();await page.keyboard.press('Enter');await app.locator('#formulaDialog').waitFor({state:'visible'});};
 const history=async(key,expected)=>{await content.focus();await page.keyboard.press(key);await page.waitForTimeout(80);assert.equal(await read(),expected);};
 const advanced=async()=>{if(!await app.locator('#formulaAdvanced').evaluate(el=>el.open))await app.locator('#formulaAdvanced > summary').click();};
 const shard=Number(process.env.AUDIT_SHARD||0),shards=Number(process.env.AUDIT_SHARDS||1);
 assert.ok(Number.isInteger(shard)&&Number.isInteger(shards)&&shards>0&&shard>=0&&shard<shards);
 const templates=FORMULA_TEMPLATES.filter((t,index)=>(!process.env.AUDIT_CASE||t.id===process.env.AUDIT_CASE)&&index%shards===shard);
 for(const template of templates)for(const mode of ['inline','numbered']){
  const label=template.id+'-'+mode;assert.equal(await read(),'');
  const entry=app.locator('[data-format="formula-builder"]');
  if(await entry.isVisible())await entry.click();
  else{await app.locator('#moreFormatButton').click();await app.locator('#moreFormatMenu [data-format-command="formula-builder"]:visible').click();}
  await app.locator('[data-formula-discipline="all"]').click();await app.locator('#formulaSearch').fill(template.name.zh);await app.locator(`[data-formula-template="${template.id}"]`).click();
  await app.locator(`[data-formula-mode="${mode}"]`).click();
  if(mode==='inline')await app.locator('[data-formula-layout="normal"]').click();else await app.locator('#formulaNumber').fill('审-12');
  assert.equal(await app.locator('#insertFormula').isEnabled(),true,label+' default valid');
  assert.ok(await app.locator('#formulaPreview .katex').count(),label+' default preview');
  if(template===templates[0])await shot(label+'-01-default');
  const values={},changes=[];
  if(template.id==='custom'){
   values.formula='u+v';await advanced();const before=await source();await app.locator('#formulaMarkdownSource').fill(buildFormulaMarkdown(mode,values.formula,'审-12'));assert.notEqual(await source(),before);changes.push({field:'formula',value:values.formula});
  }else{
   if(!await app.locator('#formulaParameters').evaluate(el=>el.open))await app.locator('#formulaParameters > summary').click();
   for(const [i,field]of template.fields.entries()){
    const input=app.locator(`[data-formula-field="${field.key}"]`),before=await source();
    let value=template.kind==='chemistry'?chemistry[template.id]?.[field.key]:'uvwxyzabc'[i%9];assert.ok(value,'test input for '+label+'/'+field.key);
    if(template.id==='matrix3')value=['u,v,w','x,y,z','a,b,c'][i];
    if(value===await input.inputValue())value=template.kind==='chemistry'?field.value:'k';
    values[field.key]=value;await input.fill(value);assert.notEqual(await source(),before,label+'/'+field.key+' affects source');changes.push({field:field.key,value});
   }
  }
  const expression=buildFormulaExpression(template,values),expected=buildFormulaMarkdown(mode,expression,'审-12');assert.equal(await source(),expected,label+' parameter transport');assert.equal(await app.locator('#insertFormula').isEnabled(),true,label+' edited valid');assert.ok(await app.locator('#formulaPreview .katex').count());assert.equal(await app.locator('#formulaPreview .katex-error').count(),0);
  // Mode switching must not accumulate tags or discard edited parameters.
  await app.locator('[data-formula-mode="block"]').click();await app.locator(`[data-formula-mode="${mode}"]`).click();assert.equal(await source(),expected,label+' mode roundtrip');
  if(template===templates[0]||['matrix2','molecule','custom'].includes(template.id))await shot(label+'-02-parameters');
  await save();const inserted=await read();assert.equal(inserted.trim(),expected.trim(),label+' inserted');assert.equal(await widget.locator('.katex').count()>0,true);assert.equal(await widget.locator('.katex-error').count(),0);
  if(template===templates[0]||['matrix2','molecule'].includes(template.id))await shot(label+'-03-document');
  await reopen();assert.equal((await source()).trim(),expected.trim(),label+' reopen');await save();await history('Control+z','');await history('Control+y',inserted);
  await reopen();await advanced();const revised=buildFormulaMarkdown(mode,expression+'\\quad + 1','审-12');await app.locator('#formulaMarkdownSource').fill(revised);await save();const edited=await read();assert.equal(edited.trim(),revised.trim(),label+' edit');
  await reopen();assert.equal((await source()).trim(),revised.trim());await advanced();await app.locator('#formulaMarkdownSource').fill('$z+999$');await app.locator('#cancelFormula').click();assert.equal(await read(),edited,label+' cancel');
  await app.locator('[data-editor-presentation="source"]').click();assert.equal(await read(),edited);await app.locator('[data-editor-presentation="live"]').click();await widget.waitFor();
  await history('Control+z',inserted);await history('Control+y',edited);await history('Control+z',inserted);await history('Control+z','');
  results.push({template:template.id,mode,changes,expected,inserted,revised,edited,status:'pass'});console.log(`PASS ${results.length} ${label} (${changes.length} parameter controls)`);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:results.length,templates:templates.length,parameters:results.reduce((n,r)=>n+r.changes.length,0),errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw error;}
finally{if(process.env.AUDIT_OUTPUT)await writeFile(process.env.AUDIT_OUTPUT+'/results.json',JSON.stringify(results,null,2));await browser?.close();await server.close();}
