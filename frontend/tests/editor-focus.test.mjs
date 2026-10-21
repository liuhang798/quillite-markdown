import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {editorHasComposition} from '../src/editor-composition.js';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const source = renderer.slice(renderer.indexOf('function focusCodeEditor('), renderer.indexOf('function replaceSelection('));
function harness() {
  const frames = [], body = { classList: { contains: () => false } };
  const document = { body, activeElement: {}, hasFocus: () => true };
  const editor = { measures: 0, focuses: 0, requestMeasure() { this.measures++; }, focus() { this.focuses++; }, contentDOM: {} };
  const context = vm.createContext({ document, editorHasComposition, codeEditor: editor, state: { editing: true, documentSession: 1 }, requestAnimationFrame: callback => frames.push(callback) });
  vm.runInContext(source, context);
  return { context, document, editor, frame: () => frames.shift()?.(), flush: () => { while (frames.length) frames.shift()(); } };
}

test('deferred editor focus preserves normal return from a dismissed dialog', () => {
  for (const blur of [false, true]) {
    const h = harness(); h.context.focusCodeEditor();
    if (blur) h.document.activeElement = h.document.body;
    h.flush(); assert.equal(h.editor.focuses, 1); assert.equal(h.editor.measures, 1);
  }
});

test('layout focus callbacks never interrupt a new IME session in either frame', () => {
  for (const property of ['compositionStarted', 'composing', 'destroyed', 'hasFocus']) for (const afterMeasure of [false, true]) {
    const h = harness(); h.context.focusCodeEditor(); if (afterMeasure) h.frame();
    h.editor[property] = true; h.flush(); assert.equal(h.editor.focuses, 0, property);
  }
});

test('deferred editor focus cannot steal a newly selected card or control in either frame', () => {
  for (const afterMeasure of [false, true]) {
    const h = harness(); h.context.focusCodeEditor();
    if (afterMeasure) h.frame();
    h.document.activeElement = { role: 'new-control' };
    h.flush(); assert.equal(h.editor.focuses, 0);
  }
});

test('deferred focus cannot return after the user focuses another frame or window',()=>{
  for(const afterMeasure of [false,true]){
    const h=harness();h.context.focusCodeEditor();if(afterMeasure)h.frame();
    // Browsers keep the old activeElement in an unfocused frame.
    h.document.hasFocus=()=>false;h.flush();assert.equal(h.editor.focuses,0);
  }
});

test('deferred focus is cancelled by a new dialog, document session, editor or leaving edit mode', () => {
  for (const change of [h => { h.document.body.classList.contains = () => true; },
    h => { h.context.state.documentSession++; }, h => { h.context.state.editing = false; },
    h => { h.context.codeEditor = { requestMeasure() { throw Error('wrong editor'); }, focus() { throw Error('wrong editor'); } }; },
    h => { h.context.codeEditor = null; }]) {
    for (const afterMeasure of [false, true]) {
      const h = harness(); h.context.focusCodeEditor(); if (afterMeasure) h.frame();
      change(h); h.flush(); assert.equal(h.editor.focuses, 0);
    }
  }
});

test('diagram entry focuses a visible control for new, visual, fallback and source-only charts', () => {
  const source = renderer.slice(renderer.indexOf('function focusDiagramDialogControl('), renderer.indexOf('function updateDiagramFullscreenButton('));
  for (const existing of [false, true]) for (const visualAvailable of [false, true]) for (const mode of ['visual', 'source']) {
    let focused = '', closed = false;
    const control = id => ({ focus: () => { focused = id; } });
    const context = vm.createContext({
      els: { diagramDialog: { classList: { contains: () => closed } }, flowchartModeBar: { classList: { contains: () => !visualAvailable } },
        diagramSource: control('source'), diagramTemplateList: { querySelector: () => control('template') } },
      flowchartDesignerState: { mode }, $: id => control(id)
    });
    vm.runInContext(source, context); context.focusDiagramDialogControl(existing);
    assert.equal(focused, !existing ? 'template' : (!visualAvailable || mode === 'source') ? 'source' : '#flowchartVisualMode');
    closed = true; focused = ''; context.focusDiagramDialogControl(existing); assert.equal(focused, '');
  }
});
