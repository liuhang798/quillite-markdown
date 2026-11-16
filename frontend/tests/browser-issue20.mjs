// Replay a delayed local image while editing the prose below it. The browser
// profile, image bytes and document are synthetic; no real files are written.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.ISSUE20_BROWSER || 'chromium';
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});
const imageSource = '![Delayed image](pending.png)';
const target = 'TARGET 中文编辑行。';
const sourceFor = name => {
  const lines = name === 'image below'
    ? ['短段落', '', '一句中文。', '', '一句中文。', '', '一句中文。', '', '', target, '', imageSource]
    : name === 'nested table cell'
      ? ['短段落', '', imageSource, '', '一句中文。', '', '', '| Name | Data |', '| --- | --- |', `| ${target} | cell |`]
      : ['短段落', '', imageSource, '', '一句中文。', '', '一句中文。', '', '', target];
  return [...lines, '', ...Array.from({ length: 70 }, () => '末尾段落。\n')].join('\n');
};

let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const cases = ['ordinary typing', ...(engine === 'chromium' ? ['composition'] : []), 'scrolled visible caret', 'image below', 'off-screen caret', 'nested table cell'];
  for (const name of cases) {
    if (process.env.ISSUE20_CASE && name !== process.env.ISSUE20_CASE) continue;
    const page = await browser.newPage({ viewport: { width: 1320, height: 720 } });
    const source = sourceFor(name);
    const ime = name === 'composition', nested = name === 'nested table cell', manual = name === 'off-screen caret';
    const scrolled = name === 'scrolled visible caret';
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (process.env.ISSUE20_TRACE) page.on('console', message => console.log(`${name} [${message.type()}] ${message.text()}`));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('editorPresentation', 'live');
      localStorage.setItem('editorLayout', 'editor-only');
      localStorage.setItem('spellcheckEnabled', 'false');
    });
    try {
      await page.goto(server.resolvedUrls.local[0]);
      await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
      await page.evaluate(content => {
        let release;
        const pending = new Promise(resolve => { release = resolve; });
        Object.assign(window.quilliteMarkdown, {
          openFile: async () => ({ path: '/issue20.md', name: 'issue20.md', directory: '/', content, revision: 'a'.repeat(64) }),
          canEditFile: async () => true,
          reportErrorLog: async () => {},
          readImageData: async ref => ref === 'pending.png' ? pending : null
        });
        window.releaseIssue20Image = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 250; canvas.height = 1000;
          const context = canvas.getContext('2d');
          context.fillStyle = 'blue'; context.fillRect(0, 0, canvas.width, canvas.height);
          release(canvas.toDataURL());
        };
      }, source);
      await page.locator('#openFileButton').click();
      await page.locator('#editButton').click();

      const editor = page.locator('#markdownEditor > .cm-editor');
      const line = editor.locator(nested ? '.cm-live-table td .cm-content' : '> .cm-scroller > .cm-content > .cm-line').filter({ hasText: 'TARGET' });
      const image = editor.locator('.cm-embedded-image');
      await image.waitFor();
      await line.click({ position: { x: 45, y: 11 } });
      await editor.evaluate(async dom => {
        const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
        const view = EditorView.findFromDOM(dom);
        const focus = document.activeElement;
        const inner = EditorView.findFromDOM(focus?.closest('.cm-editor'));
        window.issue20Read = () => {
          const { doc, selection } = view.state;
          const caret = inner?.coordsAtPos(inner.state.selection.main.head);
          const widget = dom.querySelector('.cm-embedded-image')?.getBoundingClientRect();
          const viewport = view.scrollDOM.getBoundingClientRect();
          return { head: selection.main.head, line: doc.lineAt(selection.main.head).number,
            active: document.activeElement === focus && focus?.classList.contains('cm-content'), composing: Boolean(inner?.compositionStarted),
            scroll: view.scrollDOM.scrollTop, widgetHeight: widget?.height ?? null,
            caretTop: caret?.top ?? null, availableBelow: viewport.bottom - (caret?.bottom ?? Infinity),
            visible: Boolean(caret && caret.top >= viewport.top - 2 && caret.bottom <= viewport.bottom + 2) };
        };
        window.issue20Source = () => view.state.doc.toString();
      });
      const first = await page.evaluate(() => issue20Read());
      assert.equal(first.line, 10, 'fixture targets the real tenth Markdown line');
      assert.equal(first.active && first.visible, true, 'the caret starts inside the live editor');
      if (name !== 'image below') assert.ok(first.availableBelow < 170, 'fixture places the caret close enough to the editor bottom to catch displacement');
      await page.keyboard.insertText('abc');
      const cdp = ime ? await page.context().newCDPSession(page) : null;
      if (cdp) {
        await cdp.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
        await page.waitForFunction(() => issue20Read().composing && issue20Source().includes('abcni'));
      }
      if (manual || scrolled) {
        const box = await editor.boundingBox();
        await page.mouse.move(box.x + 45, box.y + 100);
        await page.mouse.wheel(0, manual ? 520 : 140);
        if (manual) await page.waitForFunction(() => !issue20Read().visible && issue20Read().scroll > 400);
        else await page.waitForFunction(() => issue20Read().visible && issue20Read().scroll >= 120);
      }
      const before = await page.evaluate(() => issue20Read());
      assert.equal(before.visible, !manual);
      assert.ok(before.widgetHeight > 0, 'fixture keeps the pending widget in the rendered DOM');
      await page.evaluate(() => {
        window.issue20Frames = [];
        // Sample after frame work, including any CodeMirror read/write pair.
        // Sampling in a pre-paint callback can see a same-frame correction in
        // progress that the user would never have seen.
        let active = true;
        const sample = () => requestAnimationFrame(() => setTimeout(() => {
          if (!active) return;
          issue20Frames.push(issue20Read());
          sample();
        }, 0));
        window.stopIssue20Frames = () => { active = false; return issue20Frames; };
        sample();
      });

      await page.evaluate(() => releaseIssue20Image());
      if (cdp) {
        // Give the pending image time to arrive while a candidate still owns
        // its native range, whether the presentation defers display or not.
        await page.waitForFunction(() => issue20Frames.length >= 7);
        assert.equal((await page.evaluate(() => issue20Read())).composing, true);
        await cdp.send('Input.imeSetComposition', { text: 'nihao', selectionStart: 5, selectionEnd: 5 });
        await cdp.send('Input.insertText', { text: '你好' });
        await cdp.detach();
      }
      await image.locator('img[src]').evaluate(img => img.decode());
      await page.waitForFunction(height => issue20Read().widgetHeight > height + 150, before.widgetHeight);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const frames = await page.evaluate(() => stopIssue20Frames());
      const settled = await page.evaluate(() => issue20Read());
      if (process.env.ISSUE20_TRACE) console.log(`${name} trace: ${JSON.stringify({ before, frames, settled })}`);
      const changed = [...frames, settled].filter(frame => frame.visible === manual || !frame.active || frame.line !== 10);
      assert.deepEqual(changed, [], `${name}: image settlement must not change caret visibility or displace focus`);
      if (!manual) {
        const maxCaretDrift = Math.max(...[...frames, settled].map(frame => Math.abs(frame.caretTop - before.caretTop)));
        assert.ok(maxCaretDrift <= 2, `${name}: visible caret shifted by ${maxCaretDrift}px`);
      }
      const maxScrollDelta = Math.max(...frames.map(frame => Math.abs(frame.scroll - before.scroll)), Math.abs(settled.scroll - before.scroll));
      const growth = settled.widgetHeight - before.widgetHeight;
      if (name === 'image below') assert.ok(maxScrollDelta < 4, `image below the caret unexpectedly scrolled ${maxScrollDelta}px`);
      else if (manual) assert.ok(settled.scroll >= before.scroll - 4 && maxScrollDelta <= growth + 4, 'image keeps manual scroll instead of snapping back to the off-screen caret');
      else assert.ok(maxScrollDelta <= growth + 4, `${name}: scrolled ${maxScrollDelta}px for ${growth}px of image growth`);
      const expected = source.slice(0, first.head) + 'abc' + (ime ? '你好' : '') + source.slice(first.head);
      assert.equal(await page.evaluate(() => issue20Source()), expected, `${name}: image settlement must not disturb the source or the candidate`);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${name}: stable caret in ${frames.length} sampled frames through delayed local image settlement`);
    } finally { await page.close(); }
  }
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
