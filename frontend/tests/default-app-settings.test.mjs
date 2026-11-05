import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const source = renderer.slice(renderer.indexOf('let defaultAppSettingsOpening = false;'), renderer.indexOf("els.moreMenu.addEventListener('click'"));
const harness = open => {
  const calls = [];
  const c = vm.createContext({window: {quilliteMarkdown: {openDefaultApps: open}}, t: key => key,
    showToast: (...args) => calls.push(args)});
  vm.runInContext(source, c);
  return {c, calls};
};

test('default-app guidance waits for registration and the Windows settings request', async () => {
  let resolve, attempts = 0;
  const pending = new Promise(done => {resolve = done;});
  const {c, calls} = harness(async () => { attempts++; await pending; });
  const opening = c.openDefaultAppSettings();
  assert.deepEqual(calls, []);
  assert.equal(await c.openDefaultAppSettings(), false, 'repeated clicks cannot duplicate registration');
  assert.equal(attempts, 1);
  resolve();
  assert.equal(await opening, true);
  assert.deepEqual(calls, [['defaultAppHint', 'info', 8000]]);
});

test('registration or settings failure is caught without a success hint and can be retried', async () => {
  let attempts = 0;
  const {c, calls} = harness(async () => { if (++attempts === 1) throw Error('registry access failed'); });
  assert.equal(await c.openDefaultAppSettings(), false);
  assert.deepEqual(calls, [['defaultAppFailed', 'warning', 8000]]);
  assert.equal(await c.openDefaultAppSettings(), true);
  assert.equal(attempts, 2);
  assert.equal(calls[1][0], 'defaultAppHint');
});

test('both language hints explain MD and TextPack choices without claiming an automatic default change', () => {
  const hints = [...renderer.matchAll(/defaultAppHint: '([^']+)'/g)].map(match => match[1]);
  assert.equal(hints.length, 2);
  for (const hint of hints) {assert.ok(hint.includes('.md')); assert.ok(hint.includes('.textpack'));}
  assert.match(renderer, /if \(action === 'default-app'\) void openDefaultAppSettings\(\)/);
});
