// Real shared sidebar rendering, synthetic paths and a fully isolated bridge.
// No native dialog, registry change, clipboard use or user document access.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';

const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.FILE_TYPE_BROWSER || 'chromium';
const output = process.env.FILE_TYPE_OUTPUT_DIR;
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
  server: {host: '127.0.0.1', port: Number(process.env.FILE_TYPE_PORT) || 41746, watch: null, hmr: false}, logLevel: 'error',
  plugins: [{name: 'file-type-list-test', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/renderer.js')) return code + '\nwindow.fileTypeListUI={state,renderFileList,setSidebarMode,setColorMode};';
  }}],
});
let browser;
try {
  if (output) await mkdir(output, {recursive: true});
  await server.listen();
  browser = await playwright[engine].launch({headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport: {width: 1280, height: 900}}), errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    remote.push(route.request().url()); return route.abort();
  });
  await page.addInitScript(() => { localStorage.setItem('language', 'zh-CN'); localStorage.setItem('sidebarWidth', '282'); });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.fileTypeListUI && window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(() => {
    const names = ['首汽5个接口 APISIX转发配置说明.md', '新建文档-20261105-100617.textpack',
      '新建文档-20261105-100617.textbundle', 'CHANGELOG.MD', '开发任务清单.txt',
      '.gitignore', 'README', '失效的参考文档.md', '数据表.csv', 'name.' + 'unknown'.repeat(12)];
    const directory = 'C:\\Users\\Demo\\Desktop\\项目资料\\一个很长的文件夹路径';
    const files = window.listFixture = names.map((name, index) => ({path: directory + '\\' + name, name, directory, exists: index !== 7}));
    const state = fileTypeListUI.state;
    Object.assign(state, {recentFiles: files, pinnedRecentFiles: [files[0].path], favoriteFiles: [files[0], files[1], files[2]],
      explorerFiles: files.slice(0, 5).map((file, index) => ({...file, directory: index === 1 ? 'docs' : '.', path: directory + (index === 1 ? '\\docs' : '') + '\\' + file.name})),
      root: directory, currentFile: {...files[1], content: ''}, recentSelection: [], sidebarMode: 'recent'});
    window.listReads = [];
    Object.assign(window.quilliteMarkdown, {reportErrorLog: async () => {},
      readFile: async path => { listReads.push(path); return null; }, openRecentFile: async path => { listReads.push(path); return null; }});
    fileTypeListUI.setSidebarMode('recent');
  });

  const cases = [
    {name: 'recent-light', mode: 'recent', color: 'light', width: 282, scale: 1},
    {name: 'recent-dark', mode: 'recent', color: 'dark', width: 282, scale: 1},
    {name: 'narrow-zoom', mode: 'recent', color: 'light', width: 229, scale: 1.5},
    {name: 'favorites', mode: 'favorites', color: 'light', width: 282, scale: 1},
    {name: 'explorer', mode: 'explorer', color: 'light', width: 282, scale: 1},
  ];
  for (const scenario of cases) {
    await page.evaluate(scenario => {
      const {state} = fileTypeListUI;
      state.recentSelection = [];
      state.sidebarPreferredWidth = scenario.width;
      state.sidebarWidth = scenario.width;
      state.fontScale = scenario.scale;
      fileTypeListUI.setColorMode(scenario.color, false);
      document.documentElement.style.setProperty('--font-scale', String(scenario.scale));
      fileTypeListUI.setSidebarMode(scenario.mode);
      // Rendering a mode can refit pane widths. Apply the fixture's preference
      // first, then verify its actual rendered width instead of trusting CSS.
      document.documentElement.style.setProperty('--sidebar-width', scenario.width + 'px');
      document.querySelector('#fileList').scrollTop = 0;
    }, scenario);
    await page.locator('#fileList .file-item').first().waitFor({state: 'visible'});
    await page.waitForFunction(width => Math.abs(document.querySelector('#sidebar').getBoundingClientRect().width - width) < .1, scenario.width);
    const sidebarBox = await page.locator('#sidebar').boundingBox();
    assert.equal(Math.round(sidebarBox.width), scenario.width, 'fixture must exercise the requested sidebar width');
    const rows = await page.locator('#fileList .file-item').evaluateAll(buttons => buttons.map(button => {
      const title = button.querySelector('.file-title-line strong');
      const badge = button.querySelector('.file-type-badge');
      const meta = button.querySelector('.file-meta-line');
      const location = button.querySelector('.file-location');
      const box = element => {const r = element.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height};};
      return {path: decodeURIComponent(button.dataset.path), title: title.textContent, badge: badge.textContent,
        kind: badge.dataset.fileKind, tooltip: button.title, location: location.textContent, metaTitle: meta.title,
        rowBox: box(button), badgeBox: box(badge), titleBox: box(title), locationBox: box(location), badgeScroll: badge.scrollWidth,
        badgeWidth: badge.clientWidth, missing: button.dataset.missing === 'true', aria: button.getAttribute('aria-label')};
    }));
    assert.ok(rows.length >= 3);
    for (const row of rows) {
      const original = row.path.split('\\').pop();
      assert.ok(row.tooltip.includes(original) && row.tooltip.includes(row.path));
      assert.ok(row.aria.includes(original), 'assistive name retains the full filename');
      assert.ok(row.badgeBox.left >= row.rowBox.left && row.badgeBox.right <= row.rowBox.right + 1);
      assert.ok(row.rowBox.left >= sidebarBox.x && row.rowBox.right <= sidebarBox.x + sidebarBox.width, 'the complete row stays inside the actual sidebar');
      assert.ok(row.badgeScroll <= row.badgeWidth + 1, 'badge must not ellipsize');
      assert.ok(row.badgeBox.top >= row.titleBox.bottom - 1, 'suffix is on the second row');
      assert.ok(row.locationBox.right <= row.rowBox.right + 1, 'long locations stay within the row');
      if (!row.missing) assert.ok(row.location.startsWith('C:\\Users\\Demo') || (scenario.mode === 'explorer' && row.location === 'docs'));
      assert.equal(row.metaTitle, row.path.slice(0, row.path.lastIndexOf('\\')), 'hover exposes the full parent even for relative Explorer entries');
      if (scenario.scale === 1) assert.ok(row.rowBox.height <= 55, 'normal list density stays close to the original 52px rows');
    }
    assert.deepEqual(rows.slice(0, 3).map(row => [row.badge, row.kind]), [['.md', 'markdown'], ['.textpack', 'textpack'], ['.textbundle', 'textbundle']]);
    if (scenario.name === 'recent-light') {
      const items = page.locator('#fileList .file-item');
      assert.equal(rows[3].badge, '.MD');
      assert.equal(rows[5].title, '.gitignore');
      assert.equal(rows[6].title, 'README');
      assert.equal(rows[7].missing, true);
      await items.nth(7).click(); assert.deepEqual(await page.evaluate(() => listReads), []);
      await items.nth(0).click({modifiers: ['Control']});
      await items.nth(2).click({modifiers: ['Control', 'Shift']});
      assert.deepEqual(await page.evaluate(() => fileTypeListUI.state.recentSelection), await page.evaluate(() => listFixture.slice(0, 3).map(file => file.path)));
      assert.equal(await page.locator('.file-item.bulk-selected').count(), 3);
      await items.nth(1).click({button: 'right'});
      assert.equal(decodeURIComponent(await page.locator('#recentContextMenu').getAttribute('data-path')), rows[1].path);
      await page.keyboard.press('Escape');
      await page.evaluate(() => { fileTypeListUI.state.recentSelection = []; fileTypeListUI.renderFileList(); });
    }
    if (scenario.mode === 'favorites') assert.equal(await page.locator('#fileList .favorite-marker').count(), 3);
    if (output) await page.locator('#sidebar').screenshot({path: join(output, `file-types-${scenario.name}-${engine}.png`), animations: 'disabled'});
    console.log(`PASS ${engine}: ${scenario.name}`);
  }
  await page.evaluate(() => {
    window.defaultAppTest = {attempts: 0, fail: true};
    window.quilliteMarkdown.openDefaultApps = async () => {
      defaultAppTest.attempts++;
      if (defaultAppTest.fail) throw Error('registry access failed');
    };
  });
  await page.locator('#moreButton').click();
  await page.locator('[data-action="default-app"]').click();
  await page.waitForFunction(() => document.querySelector('#toastMessage').textContent.includes('无法准备文件关联'));
  assert.equal(await page.evaluate(() => defaultAppTest.attempts), 1);
  assert.ok(!(await page.locator('#toastMessage').textContent()).includes('.textpack'));
  console.log(`PASS ${engine}: default-app-failure`);
  await page.evaluate(() => { defaultAppTest.fail = false; });
  await page.locator('#moreButton').click();
  await page.locator('[data-action="default-app"]').click();
  await page.waitForFunction(() => document.querySelector('#toastMessage').textContent.includes('.textpack'));
  assert.equal(await page.evaluate(() => defaultAppTest.attempts), 2);
  assert.ok((await page.locator('#toastMessage').textContent()).includes('默认应用需由你确认'));
  console.log(`PASS ${engine}: default-app-success`);
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, [], 'listing must not fetch package or remote resources');
} finally {
  await browser?.close(); await server.close();
}
