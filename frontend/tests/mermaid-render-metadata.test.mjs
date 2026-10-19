import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizedMermaidType, hasMermaidConfiguration, hasConfiguredMermaidForeground } from '../src/mermaid-render-metadata.js';

test('engine diagram types map to the existing SVG normalization families', () => {
  for (const [type, expected] of Object.entries({
    'flowchart-v2':'flowchart','flowchart-elk':'flowchart',graph:'flowchart',
    er:'erdiagram',requirement:'requirementdiagram',xychart:'xychart-beta',
    treemap:'treemap-beta',sankey:'sankey-beta',C4:'c4',gantt:'gantt',
    mindmap:'mindmap',journey:'journey',sequence:'sequence'
  })) assert.equal(normalizedMermaidType(type), expected);
  assert.equal(normalizedMermaidType(undefined), '');
  assert.equal(normalizedMermaidType('constructor'), 'constructor');
});

test('configuration detection delegates actual directive and YAML parsing to Mermaid', () => {
  for (const source of ['%%{init: {}}%%\nflowchart LR', 'flowchart LR\n%%{init: {}}%%', '---\nconfig: {}\n---\nflowchart LR', '\r\n---\r\nconfig: {}\r\n---']) assert.equal(hasMermaidConfiguration(source), true);
  for (const source of ['%% plain comment\nflowchart LR','flowchart LR\nA-->B','---not frontmatter']) assert.equal(hasMermaidConfiguration(source), false);
});

test('only authored foreground variables or CSS suppress automatic foreground adjustment', () => {
  for (const key of ['primaryTextColor','nodeTextColor','textColor','labelTextColor']) assert.equal(hasConfiguredMermaidForeground({themeVariables:{[key]:'#fff'}}), true);
  assert.equal(hasConfiguredMermaidForeground({themeCSS:'.label text { fill: white; }'}), true);
  for (const config of [null,{}, {theme:'base'}, {themeVariables:{primaryColor:'#fff'}}, {flowchart:{curve:'linear'}}, {themeCSS:'  '}, {themeVariables:{primaryTextColor:null}}, {themeVariables:Object.create({primaryTextColor:'#fff'})}]) assert.equal(hasConfiguredMermaidForeground(config), false);
});
