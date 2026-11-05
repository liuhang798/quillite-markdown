import test from 'node:test';
import assert from 'node:assert/strict';
import { activeHeadingIndex, readerFlowHeadings } from '../src/toc-scroll.js';

test('active chapter covers empty, first, exact, between and last positions', () => {
  assert.equal(activeHeadingIndex([], () => { throw Error('empty'); }), -1);
  for (const [position, expected] of [[-1, 0], [10, 0], [19, 0], [20, 1], [29, 1], [30, 2], [99, 2]]) {
    assert.equal(activeHeadingIndex([10, 20, 30], top => top <= position), expected);
  }
  assert.equal(activeHeadingIndex([10, 20, 20, 30], top => top <= 20), 2);
});

test('scroll geometry reads grow logarithmically, not with document length', () => {
  const headings = Array.from({ length: 100_000 }, (_, i) => ({ top: i * 50 }));
  for (const boundary of [0, 12345, 1500000, 5000000]) {
    let reads = 0;
    const result = activeHeadingIndex(headings, heading => { reads++; return heading.top <= boundary; });
    assert.equal(result, Math.min(headings.length - 1, Math.floor(boundary / 50)));
    assert.ok(reads <= 17, `only a bounded search should read geometry: ${reads}`);
  }
});

test('new geometry is read after layout changes rather than reusing old offsets', () => {
  const headings = [{ top: 0 }, { top: 100 }, { top: 200 }];
  const select = () => activeHeadingIndex(headings, heading => heading.top <= 150);
  assert.equal(select(), 1);
  // A delayed image expands before the second chapter without changing nodes.
  headings[1].top = 300; headings[2].top = 400;
  assert.equal(select(), 0);
});

test('closed disclosure bodies are excluded without layout reads, including nested disclosures', () => {
  const node = (tagName, parentElement, extra = {}) => {
    const result = { tagName, parentElement, children: [], ...extra,
      contains(target) { for (; target; target = target.parentElement) if (target === this) return true; return false; } };
    parentElement?.children.push(result);
    return result;
  };
  const root = node('ARTICLE', null, { hidden: true }); // Hidden reader during editor exit is not a heading filter.
  const first = node('H2', root);
  const details = node('DETAILS', root, { open: false });
  const summary = node('SUMMARY', details);
  const summaryHeading = node('H3', summary);
  const bodyHeading = node('H3', details);
  const inner = node('DETAILS', details, { open: true });
  const nestedHeading = node('H4', inner);
  const hidden = node('H2', node('DIV', root, { hidden: true }));
  const headings = [first, summaryHeading, bodyHeading, nestedHeading, hidden];
  assert.deepEqual(readerFlowHeadings(headings, root), [first, summaryHeading]);
  details.open = true;
  assert.deepEqual(readerFlowHeadings(headings, root), [first, summaryHeading, bodyHeading, nestedHeading]);
  inner.open = false;
  assert.deepEqual(readerFlowHeadings(headings, root), [first, summaryHeading, bodyHeading]);
});
