import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyBodyTypography, bodyTypographyStyles, normalizeBodyTypography, readBodyTypography, BODY_STYLES, bodyStyleFor, typographyForStyle } from '../src/body-typography.js';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/body-typography.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const defaults = { chineseFont: 'follow', englishFont: 'follow', formulaSize: 'standard' };

test('eleven distinct styles round-trip and migrate custom pairs without loss', () => {
  assert.equal(BODY_STYLES.length, 11);
  assert.equal(new Set(BODY_STYLES.map(([, c, e]) => `${c}/${e}`)).size, 11);
  for (const [id, chineseFont, englishFont] of BODY_STYLES) {
    for (const formulaSize of ['small', 'standard', 'large']) {
      const settings = typographyForStyle(id, formulaSize);
      assert.deepEqual(settings, { chineseFont, englishFont, formulaSize });
      assert.equal(bodyStyleFor(settings), id);
      assert.match(html, new RegExp(`value="${id}"`));
    }
  }
  const legacy = { chineseFont: 'kaiti', englishFont: 'arial', formulaSize: 'small' };
  assert.equal(bodyStyleFor(legacy), 'legacy');
  assert.deepEqual(typographyForStyle('legacy', 'large', legacy), { ...legacy, formulaSize: 'large' });
  assert.deepEqual(typographyForStyle('__proto__', 'standard'), defaults);
});

test('live preview leaves saved settings alone and close/Escape restore presentation', () => {
  const source = renderer.slice(renderer.indexOf('function updateTypographySample()'), renderer.indexOf('function fillTypographyForm'));
  const saved = { ...defaults };
  const draft = typographyForStyle('book', 'large');
  let applied;
  let measures = 0;
  new Function('applyBodyTypography', 'typographyFormSettings', 'document', 'codeEditor', `${source}; updateTypographySample();`)(
    (value, style, editor) => { applied = value; editor.requestMeasure(); }, () => draft,
    { documentElement: { style: {} } }, { requestMeasure() { measures++; } }
  );
  assert.equal(applied, draft);
  assert.deepEqual(saved, defaults);
  assert.equal(measures, 1);
  const start = renderer.indexOf("$('#typographyDialog').addEventListener('keydown'");
  const escape = renderer.slice(start, start + 850);
  assert.match(escape, /event\.key === 'Escape'[\s\S]*closeTypographySettings\(\)/);
});

test('closing restores saved CSS synchronously before export/print and cannot interrupt persistence', () => {
  const source = renderer.slice(renderer.indexOf('function closeTypographySettings()'), renderer.indexOf('async function saveTypographySettings()'));
  const events = [], dialog = { dataset: {}, open: true, close() { events.push('close'); } };
  const fn = new Function('$', 'applyBodyTypography', 'state', 'document', 'codeEditor', `${source};return closeTypographySettings;`)(
    () => dialog, () => events.push('restore'), { bodyTypography: defaults }, { documentElement: { style: {} } }, null
  );
  assert.equal(fn(), true);
  assert.deepEqual(events, ['restore', 'close']);
  dialog.dataset.saving = 'true';
  events.length = 0;
  assert.equal(fn(), false);
  assert.deepEqual(events, []);
  assert.match(renderer, /async function openExportCenter\(\) \{\s*if \(!closeTypographySettings\(\)\) return/);
  assert.match(renderer, /async function printCurrentDocument\(options = \{\}\) \{\s*if \(!closeTypographySettings\(\)\) return/);
});

test('body typography migrates missing, corrupt and arbitrary font input to safe defaults', () => {
  for (const value of [null, undefined, '', {}, 42, { chineseFont: 'url(https://example.com)', englishFont: '__proto__', formulaSize: 'constructor' }]) {
    assert.deepEqual(normalizeBodyTypography(value), defaults);
  }
  assert.deepEqual(readBodyTypography({ getItem: () => '{bad' }), defaults);
  assert.deepEqual(readBodyTypography({ getItem() { throw new Error('storage denied'); } }), defaults);
  assert.deepEqual(normalizeBodyTypography({ chineseFont: ' SONGTI ', englishFont: ' GEORGIA ', formulaSize: ' LARGE ' }), { chineseFont: 'songti', englishFont: 'georgia', formulaSize: 'large' });
});

test('all Chinese/English combinations share one presentation-only stack and local fallback', () => {
  for (const chineseFont of ['follow', 'sans', 'songti', 'kaiti', 'rounded', 'mono']) {
    for (const englishFont of ['follow', 'arial', 'georgia', 'times', 'verdana', 'mono']) {
      const value = bodyTypographyStyles({ chineseFont, englishFont });
      assert.ok(value.fontFamily.endsWith('var(--app-font-family)'));
      assert.equal(value.formulaScale, 1.21);
      if (chineseFont !== 'follow') assert.ok(value.fontFamily.includes(`"Quillite Chinese ${chineseFont}"`));
      if (englishFont !== 'follow') assert.ok(value.fontFamily.includes(`"Quillite English ${englishFont}"`));
    }
  }
  assert.equal(bodyTypographyStyles().fontFamily, 'var(--app-font-family)');
  assert.equal(bodyTypographyStyles({ formulaSize: 'small' }).formulaScale, 1.08);
  assert.equal(bodyTypographyStyles({ formulaSize: 'large' }).formulaScale, 1.35);
  // Unicode-scoped aliases, no network fonts or document paths.
  assert.equal((css.match(/@font-face/g) || []).length, 10);
  assert.equal((css.match(/unicode-range:/g) || []).length, 10);
  assert.doesNotMatch(css, /url\(/);
  assert.match(css, /Quillite Chinese songti[^\n]*U\+2E80-9FFF/);
  assert.match(css, /Quillite English georgia[^\n]*U\+0000-024F/);
});

test('applying typography updates CSS metrics only and preserves editor state', () => {
  const values = new Map();
  let measured = 0;
  const editor = { requestMeasure() { measured++; }, dispatch() { assert.fail('font changes cannot edit text'); }, setState() { assert.fail('history must not reset'); } };
  applyBodyTypography({ chineseFont: 'kaiti', englishFont: 'arial', formulaSize: 'large' }, { setProperty: (key, value) => values.set(key, value) }, editor);
  assert.equal(measured, 1);
  assert.equal(values.get('--math-font-scale'), 1.35);
  assert.equal(values.size, 2);
  assert.equal(values.get('--body-font-family'), '"Quillite Chinese kaiti", "Quillite English arial", var(--app-font-family)');
  assert.doesNotThrow(() => applyBodyTypography({}, { setProperty() {} }, null));
});

test('nonmodal typography panel previews actual prose without persisting or rendering', () => {
  const source = renderer.slice(renderer.indexOf('function syncBodyTypography('), renderer.indexOf('\nfunction setFontScale('));
  const update = source.slice(source.indexOf('function updateTypographySample()'), source.indexOf('function fillTypographyForm'));
  assert.match(update, /document\.documentElement\.style, codeEditor/);
  assert.doesNotMatch(update, /syncBodyTypography|localStorage|state\.bodyTypography\s*=/);
  assert.match(source, /dialog\.show\(\)/);
  assert.doesNotMatch(source, /showModal|renderLatex|typographyMathSample/);
  const save = source.slice(source.indexOf('async function saveTypographySettings()'));
  assert.ok(save.indexOf('await window.quilliteMarkdown.setBodyTypography(settings)') < save.indexOf('syncBodyTypography(saved)'));
  assert.match(save, /dataset\.saving === 'true'/);
  assert.match(save, /element\.disabled = true/);
  assert.match(save, /finally[\s\S]*element\.disabled = false/);
  assert.doesNotMatch(source, /\.dispatch\(|\.setState\(|renderMarkdown|renderEditorPreview|schedulePreview/);
  assert.match(renderer, /syncBodyTypography\(prefs\.bodyTypography\)/);
  assert.match(renderer, /typographyDialog.*addEventListener\('cancel'/);
  assert.match(html, /<dialog id="typographyDialog"[^>]*aria-labelledby="typographyTitle"/);
  for (const id of ['bodyStyle', 'bodyFormulaSize']) assert.match(html, new RegExp(`for="${id}"`));
  assert.doesNotMatch(html, /id="bodyChineseFont"|id="bodyEnglishFont"|id="typographySample"/);
  assert.match(renderer, /addEventListener\('close', \(\) => \{\s*applyBodyTypography\(state\.bodyTypography/);
  assert.match(styles, /\.markdown-body \.katex, \.formula-preview \.katex, \.typography-math-sample \.katex, \.cm-formula-render \.katex \{ font-size: calc\(1em \* var\(--math-font-scale, 1\.21\)\)/);
  assert.doesNotMatch(styles, /\.katex[^}]*font-family: var\(--body-font-family/);
  assert.match(renderer, /tags\.monospace[^\n]*Cascadia Code/);
});

test('failed or pending saves retain the current typography and reject duplicate submissions', async () => {
  const source = renderer.slice(renderer.indexOf('async function saveTypographySettings()'), renderer.indexOf('\nfunction setFontScale('));
  for (const fail of [false, true]) {
    const controls = [{ disabled: false }, { disabled: false }];
    let calls = 0;
    let closed = false;
    let current = defaults;
    let release;
    const promise = new Promise((resolve, reject) => { release = fail ? reject : resolve; });
    const dialog = { dataset: {}, querySelectorAll: () => controls, close() { closed = true; } };
    const error = { textContent: '' };
    const selected = { chineseFont: 'songti', englishFont: 'georgia', formulaSize: 'large' };
    let restored = 0;
    const fn = new Function('$', 'typographyFormSettings', 'window', 'syncBodyTypography', 'showToast', 't', 'reportSilentError', 'applyBodyTypography', 'state', 'document', 'codeEditor', `${source}; return saveTypographySettings;`)(
      selector => selector === '#typographyDialog' ? dialog : error,
      () => selected, { quilliteMarkdown: { setBodyTypography() { calls++; return promise; } } },
      value => { current = value; }, () => {}, value => value, () => {},
      value => { assert.equal(value, defaults); restored++; }, { bodyTypography: defaults }, { documentElement: { style: {} } }, null
    );
    const pending = fn();
    await fn();
    assert.equal(calls, 1);
    assert.equal(current, defaults);
    assert.equal(closed, false);
    assert.ok(controls.every(control => control.disabled));
    release(fail ? new Error('write rejected') : selected);
    await pending;
    assert.equal(current, fail ? defaults : selected);
    assert.equal(restored, fail ? 1 : 0);
    assert.equal(closed, !fail);
    assert.equal(error.textContent, fail ? 'typographySaveFailed' : '');
    assert.ok(controls.every(control => !control.disabled));
    assert.equal(dialog.dataset.saving, 'false');
  }
});
