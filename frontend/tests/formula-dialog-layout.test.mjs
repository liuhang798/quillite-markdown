import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('compact equation layout retains controls and is scoped away from diagram dialogs', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const dialog = html.slice(html.indexOf('id="formulaDialog"'), html.indexOf('id="diagramDialog"'));
  assert.match(dialog, /class="formula-options-bar"/);
  for (const id of ['formulaOutputModes', 'formulaInlineLayouts', 'formulaInlineLayoutHint', 'formulaVisualHost', 'formulaPreview', 'formulaAdvanced', 'cancelFormula', 'insertFormula', 'closeFormulaDialog', 'openFormulaGuide']) {
    assert.match(dialog, new RegExp(`id="${id}"`));
  }
  assert.match(css, /#formulaDialog \.formula-options-bar \{[^}]*flex-wrap: wrap/);
  assert.match(css, /#formulaDialog \.formula-dialog-header \{[^}]*display: flex/);
  assert.match(css, /#formulaDialog \.formula-output-section \{ flex-direction: row; align-items: center; \}/);
  assert.match(css, /\.formula-dialog \{[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto/);
});
