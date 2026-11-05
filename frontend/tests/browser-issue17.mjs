// Production-browser structural regression: measures work, not machine-specific
// timing. Uses only generated documents and an isolated backend bridge fixture.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {preview} from 'vite';

const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.ISSUE17_BROWSER || 'chromium';
const baseline = process.env.ISSUE17_BASELINE === '1';
const output = process.env.ISSUE17_OUTPUT_DIR;
const server = await preview({root:fileURLToPath(new URL('..', import.meta.url)), preview:{host:'127.0.0.1', port:0}, logLevel:'error'});
let browser;
try {
  browser = await playwright[engine].launch({headless:true, ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport:{width:1600, height:900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('language', 'zh-CN'));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  const sections = 600;
  const content = '# Scroll audit\n\n'
    + Array.from({length:sections}, (_,i) => `## Section ${String(i + 1).padStart(4, '0')}\n\n`
      + 'Generated scroll regression text. '.repeat(12) + '\n\n'
      + (i % 30 === 0 ? '### Child section\n\nNested outline entry.\n\n' : '')).join('');
  await page.evaluate(content => Object.assign(window.quilliteMarkdown, {
    openFile:async () => ({path:'/issue17.md', name:'issue17.md', directory:'/', content, revision:'a'.repeat(64)}),
    reportErrorLog:async () => {},
  }), content);
  await page.locator('#openFileButton').click();
  await page.locator('#markdownContent h1').waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const host = document.querySelector('#markdownContent');
    const toc = document.querySelector('#toc');
    window.issue17Metrics = {headingRects:0, headingQueries:0, tocClassCalls:0, progressWrites:0};
    const lists = new WeakSet([...toc.querySelectorAll('*')].map(el => el.classList));
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function(...args) {
      if (/^H[1-6]$/.test(this.tagName) && host.contains(this)) issue17Metrics.headingRects++;
      return rect.apply(this, args);
    };
    const query = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function(selector) {
      if (this === host && /h1/.test(selector)) issue17Metrics.headingQueries++;
      return query.call(this, selector);
    };
    for (const method of ['add','remove','toggle']) {
      const original = DOMTokenList.prototype[method];
      DOMTokenList.prototype[method] = function(...args) {
        if (lists.has(this)) issue17Metrics.tocClassCalls++;
        return original.apply(this, args);
      };
    }
    const progress = document.querySelector('#progressBar');
    window.issue17ProgressObserver = new MutationObserver(records => issue17Metrics.progressWrites += records.length);
    issue17ProgressObserver.observe(progress, {attributes:true, attributeFilter:['style']});
    window.issue17Reset = () => { for (const key in issue17Metrics) issue17Metrics[key] = 0; };
  });

  const burst = await page.evaluate(async () => {
    issue17Reset();
    const reader = document.querySelector('.reader-pane');
    for (let i=0; i<20; i++) reader.dispatchEvent(new Event('scroll'));
    const immediate = {...issue17Metrics};
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {immediate, settled:{...issue17Metrics}};
  });
  console.log(`${baseline ? 'BASELINE' : 'METRICS'} ${engine}: ${JSON.stringify(burst)}`);
  if (output) {
    await mkdir(output, {recursive:true});
    await writeFile(join(output, `issue17-${engine}-${baseline ? 'baseline' : 'fixed'}.json`), JSON.stringify(burst, null, 2));
  }
  if (!baseline) {
    assert.equal(burst.immediate.headingRects, 0, 'scroll listeners must defer layout work to a shared frame');
    assert.ok(burst.settled.headingRects < 30, 'a scroll frame must not read geometry for every document heading');
    assert.ok(burst.settled.tocClassCalls < 30, 'unchanged active section must not rewrite the whole TOC');
    assert.ok(burst.settled.progressWrites <= 2, 'a synchronous scroll burst must coalesce progress updates');
  }
  // The rest verifies user-facing correctness, independently of timings and
  // document size. Explicit navigation reveals deferred layout in production;
  // reveal it here too so resource reflow is the only changing geometry.
  await page.evaluate(() => document.querySelectorAll('.reader-deferred-layout').forEach(el => {
    el.classList.remove('reader-deferred-layout');
    el.style.removeProperty('contain-intrinsic-size');
  }));
  await page.locator('.reader-pane').evaluate(reader => reader.style.overflowAnchor = 'none');
  const headingId = text => page.evaluate(text => [...document.querySelectorAll('#markdownContent h1,#markdownContent h2,#markdownContent h3')].find(el => el.textContent === text)?.id, text);
  const scrollTo = async (text, index=0) => {
    const id = await page.evaluate(({text,index}) => {
      const reader = document.querySelector('.reader-pane');
      const heading = [...document.querySelectorAll('#markdownContent h1,#markdownContent h2,#markdownContent h3')].filter(el => el.textContent === text)[index];
      reader.scrollTo({top:reader.scrollTop + heading.getBoundingClientRect().top - reader.getBoundingClientRect().top - 35, behavior:'instant'});
      reader.dispatchEvent(new Event('scroll'));
      return heading.id;
    }, {text,index});
    try {
      await page.waitForFunction(id => document.querySelector('#toc a.active')?.dataset.target === id, id);
    } catch (error) {
      console.error('Navigation diagnostics', await page.evaluate(() => ({
        active:document.querySelector('#toc a.active')?.dataset.target,
        readerTop:document.querySelector('.reader-pane').getBoundingClientRect().top,
        scrollTop:document.querySelector('.reader-pane').scrollTop,
        max:document.querySelector('.reader-pane').scrollHeight - document.querySelector('.reader-pane').clientHeight,
        headings:[...document.querySelectorAll('#markdownContent h1,#markdownContent h2,#markdownContent h3')].map(el => ({text:el.textContent,top:el.getBoundingClientRect().top,hidden:!!el.closest('[hidden]')})),
      })));
      throw error;
    }
    return id;
  };
  const targetId = await scrollTo('Section 0300');
  assert.equal(targetId, await headingId('Section 0300'));
  assert.equal(await page.locator('#backToTop').evaluate(el => el.classList.contains('visible')), true);

  await page.locator('#tocSearchInput').fill('Section 0300');
  await page.waitForFunction(id => document.querySelector('#toc a.active')?.dataset.target === id, targetId);
  assert.equal(await page.locator('#toc a.active').count(), 1, 'TOC filtering retains the active section');
  await page.locator('#tocSearchInput').fill('not-a-real-heading');
  await page.waitForFunction(() => document.querySelector('#tocEmpty')?.classList.contains('hidden') === false);
  assert.equal(await page.locator('#toc a.active').count(), 0, 'filtering out current section clears the visible active link');
  await page.locator('#clearTocSearch').click();
  await page.waitForFunction(id => document.querySelector('#toc a.active')?.dataset.target === id, targetId);

  // A child remains the semantic active heading while its ancestor is folded.
  const parentId = await headingId('Section 0301');
  await page.evaluate(parentId => document.querySelector(`#toc a[data-target="${parentId}"]`).closest('.toc-node').querySelector('[data-toc-toggle]').click(), parentId);
  const childId = await scrollTo('Child section', 10);
  assert.equal(await page.evaluate(childId => !!document.querySelector(`#toc a[data-target="${childId}"]`).closest('.toc-children.hidden'), childId), true);
  assert.equal(await page.evaluate(parentId => document.querySelector(`#toc a[data-target="${parentId}"]`).closest('.toc-node').classList.contains('contains-active'), parentId), true);

  // Layout shifts (for example, a late image) must not leave cached heading
  // coordinates stale. Disable browser anchoring so it cannot hide the reflow.
  await scrollTo('Section 0300');
  await page.evaluate(id => {
    const heading = document.getElementById(id);
    heading.previousElementSibling.style.height = '900px';
    document.querySelector('.reader-pane').dispatchEvent(new Event('scroll'));
  }, targetId);
  await page.waitForFunction(id => document.querySelector('#toc a.active')?.dataset.target !== id, targetId);
  await scrollTo('Section 0300');
  await page.setViewportSize({width:1400,height:760});
  await scrollTo('Section 0300');

  await page.locator('.reader-pane').evaluate(reader => {
    reader.scrollTo({top:reader.scrollHeight, behavior:'instant'});
    reader.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(() => {
    const headings = document.querySelectorAll('#markdownContent h1,#markdownContent h2,#markdownContent h3');
    return document.querySelector('#toc a.active')?.dataset.target === headings[headings.length - 1].id;
  });
  assert.equal(await page.locator('#progressBar').evaluate(el => el.style.width), '100%');
  // Switching documents must discard the previous outline and its DOM nodes.
  const plain = 'No-heading document\n\n' + 'Complete plain text remains scrollable.\n\n'.repeat(150);
  await page.evaluate(content => {
    window.quilliteMarkdown.openFile = async () => ({path:'/issue17-no-headings.md', name:'issue17-no-headings.md', directory:'/', content, revision:'b'.repeat(64)});
  }, plain);
  await page.locator('#openFileButton').click();
  await page.waitForFunction(() => document.querySelector('#markdownContent')?.textContent.startsWith('No-heading document'));
  await page.locator('.reader-pane').evaluate(reader => {
    reader.scrollTo({top:reader.scrollHeight, behavior:'instant'});
    reader.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(() => document.querySelector('#backToTop')?.classList.contains('visible'));
  assert.equal(await page.locator('#toc a.active').count(), 0);
  assert.equal(await page.locator('#tocPanel').evaluate(el => el.classList.contains('hidden')), true);

  // Closed <details> descendants can report virtual, non-monotonic rects.
  // They belong in the full outline, but must not participate in visible
  // section selection until expanded. The same applies to hidden ancestors.
  const detailsContent = '# Details audit\n\n'
    + Array.from({length:10}, (_,i) => `## Visible section ${i + 1}\n\n<div style="height:200px">Visible section spacer ${i + 1}</div>\n\n`
      + (i === 3 ? '<section hidden><h3>Hidden attribute heading</h3></section>\n\n' : '')
      + (i === 6 ? '<details><summary>Expandable section</summary><div style="height:800px">Hidden spacer</div><h3>Hidden detail heading</h3></details>\n\n' : '')).join('');
  await page.evaluate(content => {
    window.quilliteMarkdown.openFile = async () => ({path:'/issue17-details.md', name:'issue17-details.md', directory:'/', content, revision:'c'.repeat(64)});
  }, detailsContent);
  await page.locator('#openFileButton').click();
  await page.waitForFunction(() => document.querySelector('#markdownContent h1')?.textContent === 'Details audit');
  await page.waitForTimeout(300);
  const detailId = await headingId('Hidden detail heading');
  const attributeId = await headingId('Hidden attribute heading');
  assert.equal(await page.locator('#markdownContent details').evaluate(el => el.open), false);
  assert.equal(await page.locator(`#toc a[data-target="${detailId}"]`).count(), 1, 'closed details heading remains in the complete outline');
  assert.equal(await page.locator(`#toc a[data-target="${attributeId}"]`).count(), 1, 'hidden attribute heading remains in the complete outline');
  await scrollTo('Visible section 5');
  const section7Id = await headingId('Visible section 7');
  await page.evaluate(() => {
    const reader = document.querySelector('.reader-pane');
    const h8 = [...document.querySelectorAll('#markdownContent h2')].find(el => el.textContent === 'Visible section 8');
    reader.scrollTo({top:reader.scrollTop + h8.getBoundingClientRect().top - reader.getBoundingClientRect().top - 65, behavior:'instant'});
    reader.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(id => document.querySelector('#toc a.active')?.dataset.target === id, section7Id);
  await scrollTo('Visible section 8');
  await page.locator('#markdownContent details summary').evaluate(el => el.click());
  await page.waitForFunction(() => document.querySelector('#markdownContent details')?.open === true);
  await scrollTo('Hidden detail heading');
  await page.locator('#markdownContent details summary').evaluate(el => el.click());
  await page.waitForFunction(() => document.querySelector('#markdownContent details')?.open === false);
  await scrollTo('Visible section 8');
  assert.notEqual(await page.locator('#toc a.active').getAttribute('data-target'), detailId);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: ${baseline ? 'recorded scroll baseline' : 'bounded/coalesced scroll work'}; active section, search, folded ancestor, resource reflow, resize, bottom progress, no-heading switch, hidden sections and details expansion`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
