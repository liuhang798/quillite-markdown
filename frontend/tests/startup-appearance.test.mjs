import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { readAppearanceStorage } from '../src/appearance.js';

const bootstrap = readFileSync(new URL('../public/startup-appearance.js', import.meta.url), 'utf8');
const critical = readFileSync(new URL('../public/startup-layout.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
function boot(values = {}, {platform = 'Linux x86_64', dark = false, blocked = false} = {}) {
  const dataset = {}, writes = [];
  const storage = {
    getItem(key) { if (blocked) throw Error('denied'); return Object.hasOwn(values, key) ? values[key] : null; },
    setItem(key, value) { writes.push([key, value]); }
  };
  vm.runInNewContext(bootstrap, {document:{documentElement:{dataset}}, localStorage:storage,
    navigator:{platform}, window:{matchMedia:query=>({matches:dark})}});
  return {dataset, writes, storage};
}
test('critical appearance matches the runtime for every legacy, saved and invalid setting', () => {
  for (const theme of [null, 'dark', 'classic-dark', 'deep-ocean', 'amethyst-night', 'light', 'classic-light',
    'wechat-green', 'alipay-blue', 'wisteria', 'amber-paper', 'invalid', '__proto__', 'constructor']) {
    for (const colorMode of [null, 'light', 'dark', 'invalid']) {
      for (const accentTheme of [null, 'blue', 'coral', 'invalid']) {
        const settings = Object.fromEntries(Object.entries({theme, colorMode, accentTheme}).filter(([,v])=>v !== null));
        const {dataset, writes, storage} = boot(settings);
        assert.deepEqual({accentTheme:dataset.accent, colorMode:dataset.colorMode}, readAppearanceStorage(storage), JSON.stringify(settings));
        assert.equal(writes.length, 2, 'only runtime normalization writes to storage');
      }
    }
  }
});
test('macOS prepaint follows system appearance, without changing persisted user settings', () => {
  for (const platform of ['MacIntel', 'iPhone', 'iPad']) for (const dark of [false, true]) {
    const {dataset, writes} = boot({colorMode:dark ? 'light' : 'dark'}, {platform, dark});
    assert.equal(dataset.colorMode, dark ? 'dark' : 'light');
    assert.deepEqual(writes, []);
  }
  assert.equal(boot({colorMode:'light'}, {dark:true}).dataset.colorMode, 'light', 'Linux manual choice stays authoritative');
});
test('critical appearance tolerates blocked storage and does not write a new preference', () => {
  assert.deepEqual({...boot({}, {blocked:true}).dataset}, {colorMode:'light', accent:'green'});
  assert.equal(boot({}, {blocked:true, platform:'MacIntel', dark:true}).dataset.colorMode, 'dark');
  assert.deepEqual(boot({colorMode:'dark'}).writes, []);
});
test('bootstrap is parser-blocking and critical canvas colors match the normal theme', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tag = '<script src="/startup-appearance.js"></script>';
  assert.ok(html.indexOf(tag) > html.indexOf('Content-Security-Policy'));
  assert.ok(html.indexOf(tag) < html.indexOf('<link rel="stylesheet" href="/startup-layout.css">'));
  assert.ok(html.indexOf(tag) < html.indexOf('<body>'));
  assert.ok(html.includes("script-src 'self';"));
  assert.doesNotMatch(bootstrap, /\b(?:import|await|fetch)\s*\(/);
  for (const color of ['#151716', '#eceeec', '#f7f7f6', '#171918']) {
    assert.ok(critical.includes(color) && styles.includes(color));
  }
  assert.match(critical, /html, body\s*\{[^}]*background: var\(--bg\)/);
});
