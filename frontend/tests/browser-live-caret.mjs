import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { buildLivePlan } from '../src/editor-live-preview.js';
import { scanMarkdownFormulas } from '../src/formula-editing.js';
import { editorImageItems } from '../src/image-layout.js';
import { editorDiagramItems } from '../src/editor-diagram-preview.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
// Optional real documents are read only. The bridge below saves into memory;
// neither the source document nor its contents are written into test artifacts.
const original = process.env.CARET_DOCUMENT ? await readFile(process.env.CARET_DOCUMENT) : null;
const doc = (original?.toString('utf8') || Array.from({ length: 6 }, (_, i) => `${'#'.repeat(i + 1)} 标题 Heading ${i}

普通段落 **加粗**、*斜体*、\`code\`、[链接](https://example.com)。

| 名称 | 说明 |
| --- | --- |
| 中文 | \`value\` |
| **加粗** | plain |
| | empty |

\`\`\`text
first line
中文内容 ${i}
last line
\`\`\`

## **后续标题 ${i}**

完整接口地址 = 环境地址 + 路径，点击此处编辑。

> 引用内容

- 列表内容

---

`).join('') + '\n$$\nx^2+y^2=z^2\n$$\n\n## 公式之后的标题\n\n公式后的正文。\n\n```mermaid\ngraph LR\n A-->B\n```\n\n## 图表之后的标题\n\n图表后的正文。\n\n![sample](tests/fixtures/sample-image.svg)\n\n## 图片之后的标题\n\n图片后的正文。\n').replace(/\r\n/g, '\n');
const plan = buildLivePlan(doc), targets = [];
const otherWidgets = [...scanMarkdownFormulas(doc), ...editorImageItems(doc), ...editorDiagramItems(doc)];
const add = (from, to, kind, hidden, extra = {}) => {
  const positions = [];
  for (let p = from; p < to; p++) {
    if (!hidden.some(h => p >= h.from && p < h.to) && !/[\r\n]/.test(doc[p])) positions.push(p);
  }
  const points = positions.length ? [positions[0], positions[Math.floor(positions.length / 2)], positions.at(-1) + 1] : [from];
  for (const [index, pos] of points.entries()) targets.push({ kind, pos, point: ['start', 'middle', 'end'][index], ...extra });
  for (const range of hidden) {
    if (range.to > from && range.to < to && !hidden.some(h => range.to >= h.from && range.to < h.to)) {
      targets.push({ kind, pos: range.to, point: 'format-boundary', ...extra });
    }
  }
};
let from = 0;
for (const [index, text] of doc.split('\n').entries()) {
  if (text.trim() && !plan.widgets.some(w => w.block && from >= w.from && from <= w.to) && !otherWidgets.some(w => from >= w.from && from < w.to)) {
    add(from, from + text.length, plan.lines.some(l => l.from === from && l.className.includes('heading')) ? 'heading' : 'prose', [...plan.hides, ...plan.widgets], { line: index + 1 });
  }
  from += text.length + 1;
}
for (const block of plan.widgets.filter(w => w.kind === 'table' || w.kind === 'code')) {
  (block.cells || [{ from: block.contentFrom, to: block.contentTo }]).forEach((range, index) => {
    // Hidden backticks/bold delimiters have no clickable glyph. Test the actual
    // visible start/end, not a deliberately invisible source position.
    const hidden = block.kind === 'table' ? buildLivePlan(doc.slice(range.from, range.to)).hides.map(h => ({ from: h.from + range.from, to: h.to + range.from })) : [];
    add(range.from, range.to, block.kind, hidden, { block: block.from, index, base: range.from, line: doc.slice(0, range.from).split('\n').length });
  });
}
targets.sort((a, b) => a.pos - b.pos);
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(doc => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path: '/caret-audit.md', name: 'caret-audit.md', directory: '/', content: doc, revision: 'a'.repeat(64) }),
    canEditFile: async () => true,
    saveFile: async (path, content) => ({ path, name: 'caret-audit.md', directory: '/', content, revision: 'b'.repeat(64) }),
    readImageData: async () => { const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 80; return canvas.toDataURL('image/png'); },
  }), doc);
  await page.locator('#openFileButton').click(); await page.locator('#editButton').click();
  await page.locator('#hideLivePreviewButton').click();
  await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const view = EditorView.findFromDOM(document.querySelector('#markdownEditor > .cm-editor'));
    // Use the mounted editor's class: raw and Vite-optimized modules can have
    // different StateEffect identities even when DOM lookup works in both.
    window.caretAudit = { view, EditorView: view.constructor, doc: view.state.doc.toString() };
  });
  for (const [i, target] of targets.entries()) {
    const coords = await page.evaluate(async target => {
      const { view, EditorView } = caretAudit;
      view.dispatch({ effects: EditorView.scrollIntoView(target.pos, { y: 'center' }) });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      let editor = view, offset = target.pos;
      if (target.block !== undefined) {
        const root = [...view.dom.querySelectorAll('.cm-live-editable-block')].find(node => view.posAtDOM(node) === target.block);
        if (!root) return { error: 'block not mounted' };
        editor = EditorView.findFromDOM(root.querySelectorAll('.cm-live-inner')[target.index]);
        offset -= target.base;
      }
      let rect = editor.coordsAtPos(offset);
      if (!rect) return { error: 'no coordinates' };
      const viewport = view.scrollDOM.getBoundingClientRect();
      if (rect.top < viewport.top + 10 || rect.bottom > viewport.bottom - 10) {
        view.scrollDOM.scrollTop += rect.top - (viewport.top + viewport.height / 2);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        rect = editor.coordsAtPos(offset);
      }
      const x = rect.left + .3, y = (rect.top + rect.bottom) / 2;
      return { x, y, mapped: editor.posAtCoords({ x, y }), hit: document.elementFromPoint(x, y)?.className };
    }, target);
    if (coords.error) { results.push({ ...target, ...coords }); continue; }
    await page.mouse.click(coords.x, coords.y);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const head = await page.evaluate(() => caretAudit.view.state.selection.main.head);
    await page.keyboard.insertText('测');
    const result = await page.evaluate(pos => {
      const { view, doc } = caretAudit, after = view.state.doc.toString();
      let changedAt = 0; while (changedAt < doc.length && after[changedAt] === doc[changedAt]) changedAt++;
      return { correct: after === doc.slice(0, pos) + '测' + doc.slice(pos), inserted: after !== doc, changedAt };
    }, target.pos);
    if (result.inserted) await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => caretAudit.view.state.doc.toString() === caretAudit.doc), true, `undo at ${i}`);
    results.push({ ...target, head, ...result, ...(!result.correct ? { coords } : {}) });
    if (i % 100 === 0) console.log(`caret audit ${i}/${targets.length}`);
  }
  // The custom boundary click must still participate in ordinary drag/Shift
  // selection rather than swallowing the gesture or exposing the heading mark.
  const heading = targets.find(t => t.kind === 'heading' && t.point === 'start');
  if (heading) {
    const points = await page.evaluate(async pos => {
      const { view, EditorView } = caretAudit;
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return [pos, pos + 2].map(p => { const r = view.coordsAtPos(p); return { x: r.left + .3, y: (r.top + r.bottom) / 2 }; });
    }, heading.pos);
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    await page.mouse.move(points[1].x, points[1].y, { steps: 5 }); await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => { const r = caretAudit.view.state.selection.main; return [r.from, r.to]; }), [heading.pos, heading.pos + 2]);
    await page.keyboard.insertText('改');
    assert.equal(await page.evaluate(pos => caretAudit.view.state.doc.toString() === caretAudit.doc.slice(0, pos) + '改' + caretAudit.doc.slice(pos + 2), heading.pos), true);
    await page.keyboard.press('Control+z');
    await page.mouse.click(points[1].x, points[1].y);
    await page.keyboard.down('Shift'); await page.mouse.click(points[0].x, points[0].y); await page.keyboard.up('Shift');
    assert.deepEqual(await page.evaluate(() => { const r = caretAudit.view.state.selection.main; return [r.from, r.to]; }), [heading.pos, heading.pos + 2]);
    assert.equal(await page.evaluate(() => caretAudit.view.state.doc.toString() === caretAudit.doc), true);
  }
  const failures = results.filter(r => !r.correct), summary = {
    targets: targets.length, failures, errors,
    counts: results.reduce((counts, r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; return counts; }, {}),
  };
  if (process.env.CARET_REPORT) await writeFile(process.env.CARET_REPORT, JSON.stringify(summary, null, 2));
  if (original) assert.ok(original.equals(await readFile(process.env.CARET_DOCUMENT)), 'original document remains byte-identical');
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, [], `caret failures: ${JSON.stringify(failures.slice(0, 8))}`);
  console.log('PASS: every sampled visible block accepts input at the clicked position and undoes exactly', summary.counts);
} finally { await browser.close(); await server.close(); }
