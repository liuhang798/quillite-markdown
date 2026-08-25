import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTocTree, filterTocTree, normalizeTocMode, readCollapsedToc, replaceDynamicTocMarkers, writeCollapsedToc } from '../src/toc-tree.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

test('table-of-contents headings form a hierarchical tree', () => {
  const tree = buildTocTree([
    { id: 'a', text: 'A', level: 1 },
    { id: 'b', text: 'B', level: 2 },
    { id: 'c', text: 'C', level: 3 },
    { id: 'd', text: 'D', level: 2 },
    { id: 'e', text: 'E', level: 1 }
  ]);

  assert.deepEqual(tree.map(node => node.id), ['a', 'e']);
  assert.deepEqual(tree[0].children.map(node => node.id), ['b', 'd']);
  assert.deepEqual(tree[0].children[0].children.map(node => node.id), ['c']);
});

test('collapsed table-of-contents nodes persist independently for each document', () => {
  const storage = memoryStorage();
  writeCollapsedToc(storage, 'D:\\Docs\\One.md', new Set(['section-a', 'section-b']));
  writeCollapsedToc(storage, 'D:\\Docs\\Two.md', new Set(['section-c']));

  assert.deepEqual([...readCollapsedToc(storage, 'd:/docs/one.md')], ['section-a', 'section-b']);
  assert.deepEqual([...readCollapsedToc(storage, 'D:/DOCS/TWO.MD')], ['section-c']);
});

test('outline search keeps matching headings together with their ancestors', () => {
  const tree = buildTocTree([
    { id: 'guide', text: 'Guide', level: 1 },
    { id: 'install', text: 'Installation', level: 2 },
    { id: 'edit', text: 'Editing', level: 2 },
    { id: 'syntax', text: 'Markdown syntax', level: 3 }
  ]);
  const filtered = filterTocTree(tree, 'syntax');
  assert.deepEqual(filtered.map(node => node.id), ['guide']);
  assert.deepEqual(filtered[0].children.map(node => node.id), ['edit']);
  assert.deepEqual(filtered[0].children[0].children.map(node => node.id), ['syntax']);
  assert.equal(normalizeTocMode('flat'), 'flat');
  assert.equal(normalizeTocMode('invalid'), 'tree');
});

test('[TOC] markers become dynamic placeholders outside fenced code only', () => {
  const source = ['# Guide', '[TOC]', '```md', '[TOC]', '```', '[toc]'].join('\n');
  const converted = replaceDynamicTocMarkers(source);
  assert.equal((converted.match(/data-dynamic-toc/g) || []).length, 2);
  assert.match(converted, /```md\n\[TOC\]\n```/);
});
