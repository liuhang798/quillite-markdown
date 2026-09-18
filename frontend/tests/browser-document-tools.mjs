import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host:'127.0.0.1', port:0 }, logLevel:'error' });
await server.listen();
const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE || undefined});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(()=>window.quilliteMarkdown && document.querySelector('#documentToolsDialog'));
  await page.evaluate(()=>{
    window.toolWrites=[];
    Object.assign(window.quilliteMarkdown,{
      openFile:async()=>({path:'/test.md',name:'test.md',content:'# One\n\n### Three\n\n![x](missing.png)',revision:'a'.repeat(64)}),
      openRecentFile:async path=>({path,name:'hit.md',content:'# Search hit\nneedle',revision:'a'.repeat(64)}),
      checkDocumentAssets:async refs=>['missing.png'],
      openFolder:async()=>({root:'/workspace',files:[]}),
      searchWorkspace:async()=>({matches:[{path:'/workspace/hit.md',relativePath:'hit.md',line:2,text:'needle'}],scanned:1,skipped:1,limited:false}),
      previewWorkspaceReplace:async()=>({token:'opaque',changes:[{path:'/workspace/hit.md',relativePath:'hit.md',before:'needle',after:'new',count:1}],skipped:1}),
      applyWorkspaceReplace:async(token,paths)=>{window.toolWrites.push({token,paths});return paths.map(path=>({path,status:'conflict'}));},
      getRecoveryBackup:async()=>({path:'/recover.md',name:'recover.md',content:'DO NOT LOSE',updatedAt:'2026-09-17'}),
      listDocumentVersions:async()=>[],
      saveConflictCopy:async(path,content)=>{window.toolWrites.push({path,content});return {path:'/new-copy.md',content};},
      saveDiagnosticReport:async report=>{window.lastReport=report;return '/diagnostic.json';}
    });
  });
  await page.locator('#openFileButton').click();
  const open=async()=>{await page.locator('#moreButton').click();await page.locator('[data-action=document-tools]').click();};
  await open();
  const dialog=page.locator('#documentToolsDialog');
  await dialog.getByRole('button',{name:'检查当前文档',exact:true}).click();
  await dialog.getByRole('button',{name:/标题层级跳跃/}).waitFor();
  assert.match(await dialog.innerText(),/本地图片缺失/);
  await dialog.getByRole('button',{name:/标题层级跳跃/}).click();
  await dialog.waitFor({state:'hidden'});
  assert.equal(await dialog.isVisible(),false);
  assert.match(await page.locator('.cm-content').innerText(),/Three/);
  await open();
  await dialog.getByRole('button',{name:'全文搜索 / 替换',exact:true}).click();
  await dialog.getByRole('button',{name:'选择文件夹',exact:true}).click();
  await dialog.getByLabel('查找（区分大小写、纯文本）').fill('needle');
  await dialog.getByLabel('替换为（允许为空）').fill('new');
  await dialog.getByRole('button',{name:'搜索',exact:true}).click();
  assert.match(await dialog.innerText(),/hit.md:2/);
  await dialog.getByRole('button',{name:'预览批量替换',exact:true}).click();
  assert.equal(await dialog.locator('input[type=checkbox]:checked').count(),0);
  await dialog.locator('summary').click();
  assert.match(await dialog.locator('.tools-grid pre').first().innerText(),/needle/);
  await page.screenshot({path:join(tmpdir(),'quillite-document-tools.png')});
  await dialog.locator('input[type=checkbox]').check();
  page.once('dialog',d=>d.accept());
  await dialog.getByRole('button',{name:'确认替换已勾选文件',exact:true}).click();
  assert.match(await dialog.innerText(),/冲突，已跳过/);
  assert.deepEqual(await page.evaluate(()=>window.toolWrites[0]),{token:'opaque',paths:['/workspace/hit.md']});
  await dialog.getByRole('button',{name:'文档安全',exact:true}).click();
  await dialog.getByRole('button',{name:'读取恢复备份与当前文档历史',exact:true}).click();
  await dialog.locator('summary').click();
  assert.match(await dialog.innerText(),/DO NOT LOSE/);
  await dialog.getByRole('button',{name:'另存恢复副本（不覆盖）',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.toolWrites[1].content),'DO NOT LOSE');
  await dialog.getByRole('button',{name:'诊断报告',exact:true}).click();
  await dialog.getByRole('button',{name:'导出诊断报告（新文件）',exact:true}).click();
  assert.ok(!JSON.stringify(await page.evaluate(()=>window.lastReport)).includes('/test.md'));
  await dialog.getByRole('button',{name:'模板中心',exact:true}).click();
  await dialog.getByLabel('模板名称 / 文档标题').fill('My template');
  await dialog.getByLabel('模板正文').fill('# {{title}}\n{{date}}\n\n> ## Quoted &amp; <em>More</em>\n\n<div><h2>HTML</h2></div>\n\n#### Details\n\n[quote](#quoted-more-1) [HTML](#html-2) [details](#details-3)');
  await dialog.getByRole('button',{name:'保存为自定义模板',exact:true}).click();
  await dialog.getByLabel('选择模板').selectOption({label:'My template'});
  await dialog.getByRole('button',{name:'新建文档',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  assert.equal(await dialog.isVisible(),false);
  assert.match(await page.locator('.cm-content').innerText(),/My template/);
  await page.waitForFunction(()=>document.querySelector('#editorPreviewContent').textContent.includes('My template'));
  await open();
  await dialog.getByRole('button',{name:'文档检查',exact:true}).click();
  await dialog.getByRole('button',{name:'检查当前文档',exact:true}).click();
  await dialog.getByRole('button',{name:/标题层级跳跃/}).waitFor();
  assert.ok(!(await dialog.innerText()).includes('锚点未找到'));
  assert.equal(await page.locator('#editorPreviewContent #quoted-more-1').count(),1);
  assert.equal(await page.locator('#editorPreviewContent #html-2').count(),1);
  await dialog.getByRole('button',{name:'模板中心',exact:true}).click();
  await dialog.getByLabel('模板名称 / 文档标题').fill('Keep this unsaved template');
  await page.evaluate(()=>{window.savedNewFile=window.quilliteMarkdown.newFile;window.quilliteMarkdown.newFile=async()=>null;});
  const accept=d=>d.accept();page.on('dialog',accept);
  await dialog.getByRole('button',{name:'新建文档',exact:true}).click();
  await dialog.getByText('操作已取消或未完成，输入内容已保留。',{exact:true}).waitFor();
  assert.equal(await dialog.getByLabel('模板名称 / 文档标题').inputValue(),'Keep this unsaved template');
  await page.evaluate(()=>{window.quilliteMarkdown.newFile=async()=>{throw new Error('TEST_NEW_FILE_FAILURE');};});
  await dialog.getByRole('button',{name:'新建文档',exact:true}).click();
  await dialog.getByText('操作失败，输入内容已保留，请重试。',{exact:true}).waitFor();
  assert.equal(await dialog.getByLabel('模板名称 / 文档标题').inputValue(),'Keep this unsaved template');
  page.off('dialog',accept);
  await page.evaluate(()=>{window.quilliteMarkdown.newFile=window.savedNewFile;});
  await page.setViewportSize({width:620,height:760});
  const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=620);
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
  // Permission UI must be actionable, not covered by the native tools modal.
  await page.setViewportSize({width:1280,height:800});
  await page.locator('#editButton').click();
  await page.evaluate(()=>{window.quilliteMarkdown.canEditFile=async()=>false;});
  await open();
  await dialog.getByRole('button',{name:'文档检查',exact:true}).click();
  await dialog.getByRole('button',{name:'检查当前文档',exact:true}).click();
  await dialog.getByRole('button',{name:/标题层级跳跃/}).click();
  await page.locator('#saveCopyAndEdit').waitFor({state:'visible'});
  assert.equal(await dialog.isVisible(),false);
  await page.locator('#saveCopyAndEdit').click({trial:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: document check, locate, search, explicit batch preview, conflict result, recovery copy, private diagnostics, custom template, responsive modal.');
} finally {await browser.close();await server.close();}
