import { MathfieldElement, convertLatexToMathMl, convertLatexToMarkup } from 'mathlive';
import { canLoadVisualFormula, visualFormulaValue } from './formula-visual-policy.js';
import { renderLatexResult } from './math-rendering.js';

// Fully offline: never use the package's CDN font/audio defaults or URL menu.
MathfieldElement.fontsDirectory = '/vendor/mathlive/fonts';
MathfieldElement.soundsDirectory = null;
MathfieldElement.speechEngine = 'local';
MathfieldElement.openUrl = () => {};

export function createFormulaVisualEditor(host, onChange) {
  const field = new MathfieldElement();
  field.id = 'formulaMathfield';
  field.classList.add('formula-visual-input');
  host.replaceChildren(field);
  field.mathVirtualKeyboardPolicy = 'manual';
  field.smartMode = false;
  field.smartFence = false;
  field.menuItems = [];
  field.onExport = (mf, _latex, range) => mf.getValue(range, 'latex');
  let original = '', initial = '', syncing = false, supported = false;
  field.addEventListener('input', () => {
    if (syncing || !supported) return;
    onChange(visualFormulaValue(original, initial, field.getValue('latex')));
  });
  return {
    field,
    load(source, locale = 'zh-CN', label = '') {
      syncing = true; original = source; supported = false;
      MathfieldElement.locale = locale;
      field.setAttribute('aria-label', label);
      try {
        if (!canLoadVisualFormula(source) || !renderLatexResult(source, true).valid) throw new Error('unsupported');
        // MathLive skips setValue when source already equals its serialized value.
        // Force a silent transition before resetting so even reopening that exact
        // formula establishes an undo baseline, without retaining prior sessions.
        field.setValue(source === '' ? '0' : '', { silenceNotifications: true });
        field.resetUndo();
        field.setValue(source, { silenceNotifications: true, selectionMode: 'after' });
        initial = field.getValue('latex');
        // Reject lossy imports, not just syntax errors. No compute engine or simplification.
        supported = field.errors.length === 0
          && renderLatexResult(initial, true).valid
          && convertLatexToMathMl(source) === convertLatexToMathMl(initial)
          && (!/\\ce\b/.test(source) || convertLatexToMarkup(source) === convertLatexToMarkup(initial));
      } catch { supported = false; }
      field.readOnly = !supported;
      syncing = false;
      return supported;
    },
    value() { return visualFormulaValue(original, initial, field.getValue('latex')); },
    insert(latex) {
      if (!supported) return;
      field.focus(); field.insert(latex, { format: 'latex', selectionMode: 'placeholder' });
    },
    command(command) { if (supported) { field.focus(); field.executeCommand(command); } },
    blur() { field.blur(); window.mathVirtualKeyboard?.hide(); },
  };
}
