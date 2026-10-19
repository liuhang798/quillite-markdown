import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ACCENT_THEMES } from '../src/appearance.js';

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('visual formula selection follows app colors rather than the operating system preference', () => {
  const rule = styles.match(/#formulaMathfield\s*\{([^}]+)\}/)?.[1];
  assert.match(rule, /--selection-color:\s*var\(--text\)/);
  assert.match(rule, /--selection-background-color:\s*var\(--accent-soft\)/);
});

test('incomplete formula save has a distinct disabled state without primary hover brightening', () => {
  const rule = styles.match(/#insertFormula:disabled\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /background:\s*color-mix\(in srgb, var\(--line\) 78%, var\(--paper\)\) !important/);
  assert.match(rule, /color:\s*var\(--muted\) !important/);
  assert.match(rule, /cursor:\s*not-allowed/);
  assert.match(rule, /filter:\s*none/);
});

test('invalid chart data shares the formula disabled action appearance', () => {
  assert.match(styles, /#insertDiagram:disabled,\s*#insertFormula:disabled\s*\{/);
});

function relativeLuminance([red, green, blue]) {
  return [red, green, blue]
    .map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('chart validation text and focused invalid fields remain visible in both color modes', () => {
  const dark = styles.match(/:root\[data-color-mode="dark"\] \.structured-diagram-editor \{ --chart-validation-color: (#[a-f\d]{6}); \}/)?.[1];
  assert.equal(dark, '#ff858d');
  const channels = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));
  assert.ok(contrastRatio(channels(dark), channels('#1b1d1c')) >= 4.5);
  assert.ok(contrastRatio(channels('#b42318'), channels('#f4f4f2')) >= 4.5);
  assert.match(styles, /\.structured-diagram-table input\[aria-invalid="true"\], \.structured-diagram-table select\[aria-invalid="true"\] \{ border-color: var\(--chart-validation-color, #b42318\); \}/);
  assert.match(styles, /\[aria-invalid="true"\]:focus \{ box-shadow: 0 0 0 2px color-mix\(in srgb, var\(--chart-validation-color, #b42318\) 25%, transparent\); \}/);
});

test('custom reference badge uses readable light/dark colors and overrides editor heading sizing', () => {
  const rule = styles.match(/\.markdown-body h3 > \.reference-new-badge,[^{]+\{([^}]+)\}/)[1];
  const dark = styles.match(/:root\[data-color-mode="dark"\] \.markdown-body h3 > \.reference-new-badge,[^{]+\{([^}]+)\}/)[1];
  const color = (rule, property) => rule.match(new RegExp(`(?:^|[;\\s])${property}:\\s*(#[a-f\\d]{6})`))[1].slice(1).match(/../g).map(n => parseInt(n, 16));
  for (const value of [rule, dark]) assert.ok(contrastRatio(color(value, 'color'), color(value, 'background')) >= 4.5);
  assert.deepEqual(color(rule, 'background'), [217, 54, 36], 'NEW badge uses the requested fiery red');
  assert.deepEqual(color(rule, 'color'), [255, 255, 255]);
  assert.match(rule, /font: 750 max\(10px, \.5em\)/);
  assert.ok(styles.includes('.cm-editor.cm-live-preview .cm-live-heading .reference-new-badge'));
  assert.match(styles, /\.formula-template-list \.template-new-badge \{\s*display: inline-block;/);
  assert.ok(styles.includes(':root[data-color-mode="dark"] .formula-template-list .template-new-badge'));
});

test('formula and chart catalog text stays readable in all light/dark accents', () => {
  assert.match(styles, /\.formula-dialog \{ --accent-strong: color-mix\(in srgb, var\(--accent\) 62%, #111312\); \}/);
  assert.match(styles, /data-color-mode="dark"\] \.formula-dialog \{ --accent-strong: color-mix\(in srgb, var\(--accent\) 60%, #ffffff\); \}/);
  for (const [name, theme] of Object.entries(ACCENT_THEMES)) {
    const accent = theme.color.match(/[a-f\d]{2}/gi).map(channel => parseInt(channel, 16));
    const light = accent.map((channel, i) => channel * .62 + [17,19,18][i] * .38);
    const dark = accent.map(channel => channel * .6 + 255 * .4);
    for (const surface of [[255,255,255], [240,240,240]]) assert.ok(contrastRatio(light, surface) >= 4.5, `${name} light text`);
    for (const surface of [[38,40,39], [45,55,48]]) assert.ok(contrastRatio(dark, surface) >= 4.5, `${name} dark text`);
  }
});

test('light-mode primary buttons preserve the approved green and keep other accents at AA contrast', () => {
  const accentWeight = Number(styles.match(/data-color-mode="light"[\s\S]*?--accent-strong:\s*color-mix\(in srgb, var\(--accent\)\s*(\d+)%/)?.[1]);
  assert.ok(accentWeight > 0 && accentWeight < 100);

  for (const [name, theme] of Object.entries(ACCENT_THEMES)) {
    const accent = theme.color.match(/[a-f\d]{2}/gi).map(channel => Number.parseInt(channel, 16));
    if (name === 'green') {
      assert.deepEqual(accent, [21, 154, 99]);
      assert.ok(
        contrastRatio(accent, [255, 255, 255]) >= 3,
        'the approved green must keep at least 3:1 contrast for prominent bold controls',
      );
      continue;
    }
    const button = accent.map(channel => channel * accentWeight / 100);
    assert.ok(
      contrastRatio(button, [255, 255, 255]) >= 4.5,
      `${name} primary button must reach 4.5:1 against white text`,
    );
  }
});
