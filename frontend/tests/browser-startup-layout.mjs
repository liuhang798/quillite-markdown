import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:process.env.AUDIT_DIST||fileURLToPath(new URL('..',import.meta.url)),...(process.env.AUDIT_DIST?{configFile:false}:{}),server:{host:'127.0.0.1',port:41866,strictPort:true,watch:null,hmr:false},logLevel:'error'});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 for(const [mode,last] of [['expanded','true'],['collapsed','false'],['remember','true']]){
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({mode,last})=>{
   localStorage.setItem('sidebarStartup',mode);localStorage.setItem('sidebarCollapsed',last);
   window.startupWidths=[];
   const sample=()=>{const el=document.querySelector('#sidebar');if(el)window.startupWidths.push(el.getBoundingClientRect().width);requestAnimationFrame(sample);};requestAnimationFrame(sample);
  },{mode,last});
  let release;const gate=new Promise(r=>release=r);
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();
   if(url.pathname==='/src/renderer.js'||/\/assets\/renderer-[^/]+\.js$/.test(url.pathname))await gate;
   await route.continue();
  });
  const navigation=page.goto(server.resolvedUrls.local[0]);
  await page.locator('#sidebar').waitFor({state:'attached'});
  await page.waitForTimeout(350);
  const width=await page.locator('#sidebar').evaluate(el=>el.getBoundingClientRect().width);
  assert.ok(last==='false'?width>100:width===0,`${mode} before renderer: ${width}`);
  release();await navigation;
  await page.waitForFunction(()=>!document.documentElement.dataset.startupSidebar);
  await page.waitForTimeout(400);
  const frames=await page.evaluate(()=>window.startupWidths);
  assert.ok(frames.length>8);
  assert.ok(frames.every(w=>last==='false'?w>100:w===0),`${mode}: startup width frames ${frames}`);
  if(last!=='false'){
   await page.locator('#expandSidebar').click();
   await page.waitForTimeout(300);assert.ok(await page.locator('#sidebar').evaluate(el=>el.getBoundingClientRect().width)>100,'manual expand still works');
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${mode}: no first-paint flash with delayed renderer`);
 }
}finally{await browser?.close();await server.close();}
