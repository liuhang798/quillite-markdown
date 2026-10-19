// Fresh browser, synthetic document. UI mutations only; DOM reads for evidence.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const cases=[
 ['prefix-comment','%% A comment before the chart\nflowchart LR\n A["Auto commented"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['prefix-init','%%{init: {"flowchart":{"curve":"linear"}}}%%\nflowchart LR\n A["Auto configured"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['prefix-frontmatter','---\ntitle: Prefix example\nconfig:\n  flowchart:\n    curve: linear\n---\nflowchart LR\n A["Auto frontmatter"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['prefix-css','%%{init: {"themeCSS":".custom .label text, .custom .label tspan { fill: #ffffff !important; }"}}%%\nflowchart LR\n A["Chosen CSS"]:::custom --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['style','flowchart LR\n A["Auto light"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['class','flowchart LR\n A["Auto dark"]:::custom --> B["Explicit"]:::fixed\n classDef custom fill:#111\n classDef fixed fill:#fff,color:#b00000'],
 ['default','flowchart LR\n A["Auto named"] --> B["Explicit"]\n classDef default fill:lightyellow\n style B color:#b00000'],
 ['circle','flowchart LR\n A(("Auto circle")) --> B{"Explicit"}\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['transparent','flowchart LR\n A["Transparent"] --> B["Explicit"]\n style A fill:transparent\n style B fill:#fff,color:#b00000'],
 ['alpha','flowchart LR\n A["Auto alpha"] --> B["Explicit"]\n style A fill:#fffffff2\n style B fill:#fff,color:#b00000'],
 ['fill-opacity','flowchart LR\n A["Translucent"] --> B["Explicit"]\n style A fill:#fff,fill-opacity:0.4\n style B fill:#fff,color:#b00000'],
 ['graph','graph LR\n A["Auto graph"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['explicit-low','flowchart LR\n A["Chosen white"] --> B["Explicit"]\n style A fill:#fff,color:#fff\n style B fill:#fff,color:#b00000'],
 ['init-explicit','%%{init: {"themeVariables":{"primaryTextColor":"#ffffff","nodeTextColor":"#ffffff","textColor":"#ffffff"}}}%%\nflowchart LR\n A["Chosen theme"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['init-base','%%{init: {"theme":"base","themeVariables":{"primaryTextColor":"#ffffff","nodeTextColor":"#ffffff","textColor":"#ffffff"}}}%%\nflowchart LR\n A["Chosen theme"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['init-base-primary','%%{init: {"theme":"base","themeVariables":{"primaryTextColor":"#246399"}}}%%\nflowchart LR\n A["Chosen blue"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['frontmatter-primary','---\nconfig:\n  theme: base\n  themeVariables:\n    primaryTextColor: "#246399"\n---\nflowchart LR\n A["Chosen blue"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['implicit-primary','%%{init: {"themeVariables":{"primaryTextColor":"#246399"}}}%%\nflowchart LR\n A["Chosen blue"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['implicit-frontmatter','---\nconfig:\n  themeVariables:\n    primaryTextColor: "#246399"\n---\nflowchart LR\n A["Chosen blue"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['implicit-multiple','%%{init: {"themeVariables":{"primaryTextColor":"#ff0000"}}}%%\n%%{init: {"themeVariables":{"primaryTextColor":"#246399"}}}%%\nflowchart LR\n A["Chosen blue"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000'],
 ['implicit-security','%%{init: {"securityLevel":"loose","themeVariables":{"primaryTextColor":"#246399"}}}%%\nflowchart LR\n A["Chosen blue"] --> B["Explicit"]\n style A fill:#fff\n style B fill:#fff,color:#b00000\n click A "javascript:alert(1)"'],
];
let browser,page,failures=0;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const check=(pass,message)=>{if(!pass)failures++;console.log(JSON.stringify({check:message,pass}));if(process.env.AUDIT_STRICT==='1')assert.ok(pass,message);};
 for(const [id,source]of cases){if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  if((process.env.AUDIT_EXCLUDE||'').split(',').includes(id)){console.log(JSON.stringify({id,SKIPPED:true,reason:'Explicitly excluded known finding; not a passing case'}));continue;}
  const doc='```mermaid\n'+source+'\n```\n\nAFTER';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();
  const card=editor.locator('.cm-diagram-card');await card.locator('svg g.node').first().waitFor();await card.hover();await shot(id+'-01-rendered');
  const inspect=()=>card.locator('svg').evaluate(svg=>[...svg.querySelectorAll('g.node')].map(node=>{const shape=node.querySelector('.label-container')||node.querySelector('rect,polygon,path,circle,ellipse'),label=node.querySelector('text');return{id:node.id,fill:getComputedStyle(shape).fill,opacity:getComputedStyle(shape).fillOpacity,text:label?.textContent,color:label&&getComputedStyle(label.querySelector('tspan')||label).fill,html:node.outerHTML};}));
  const nodes=await inspect();console.log(JSON.stringify({id,nodes:nodes.map(n=>process.env.AUDIT_VERBOSE==='1'?n:({...n,html:undefined}))}));
  if(process.env.AUDIT_VERBOSE==='1')console.log(await card.locator('svg style').textContent());
  const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),lum=value=>rgb(value).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0),ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const verify=async current=>{
   const auto=current.find(n=>n.text!=='Explicit'),explicit=current.find(n=>n.text==='Explicit');
   if(!['transparent','alpha','fill-opacity','explicit-low','init-explicit','init-base','prefix-css'].includes(id))check(ratio(auto.fill,auto.color)>=4.5,id+' automatic label contrast >=4.5');
   if(['transparent','alpha','fill-opacity'].includes(id))check(!/fill:\s*(?:rgb|#)/.test(auto.html.split('<text')[1]?.split('</text>')[0]||''),id+' uncertain background not recolored');
   if(['explicit-low','init-explicit','init-base','prefix-css'].includes(id))check(auto.color==='rgb(255, 255, 255)',id+' chosen foreground not overridden');
   if(['init-base-primary','frontmatter-primary'].includes(id)||id.startsWith('implicit-'))check(auto.color==='rgb(36, 99, 153)',id+' primary foreground derived without pinning');
   if(id==='implicit-security')check(await card.locator('svg').evaluate(svg=>!svg.querySelector('script,foreignObject,[onclick]')&&![...svg.querySelectorAll('a')].some(a=>/javascript:/i.test(a.getAttribute('href')||a.getAttribute('xlink:href')||''))),id+' unsafe link and executable content absent');
   check(explicit.color==='rgb(176, 0, 0)',id+' explicit foreground retained');assert.equal(await read(),doc);
   assert.deepEqual(current.map(n=>[n.fill,n.opacity]),nodes.map(n=>[n.fill,n.opacity]),id+' all custom backgrounds retained');
  };
  await verify(nodes);
  for(const phase of ['switched','restored']){
   const prior=await card.locator('svg').getAttribute('id');await app.locator('#colorModeButton').click();
   for(let i=0;i<100;i++){if(await card.locator('svg g.node').count()&&await card.locator('svg').getAttribute('id')!==prior)break;await page.waitForTimeout(50);}
   assert.notEqual(await card.locator('svg').getAttribute('id'),prior,id+' fresh theme render');await verify(await inspect());await shot(id+'-02-'+phase);
  }
  await card.hover();await card.locator('[data-diagram-action="source"]').click();await editor.getByRole('button',{name:'返回渲染',exact:true}).click();await card.locator('svg g.node').first().waitFor();assert.equal(await read(),doc);await shot(id+'-02-returned');
  await verify(await inspect());
  // A diagram-level override must not bleed into the next ordinary diagram.
  const resetDoc='```mermaid\nflowchart LR\n A["Default after custom"] --> B["Default"]\n```\n\nAFTER';
  await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(resetDoc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();
  await card.locator('svg g.node').first().waitFor();const resetNodes=await inspect();
  const defaultText=await card.evaluate(el=>{const probe=document.createElement('span');probe.style.color='var(--text)';el.append(probe);const value=getComputedStyle(probe).color;probe.remove();return value;});
  check(resetNodes.every(n=>n.color===defaultText),id+' default foreground restored for next diagram');assert.equal(await read(),resetDoc);
  await shot(id+'-03-default-restored');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:failures===0,failures,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
