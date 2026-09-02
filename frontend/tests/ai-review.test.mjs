import test from 'node:test';
import assert from 'node:assert/strict';
import { hasOverlappingReviewSuggestions, locateAIReviewSuggestions, nthTextIndex } from '../src/ai-review.js';

test('AI review locates the requested occurrence with JavaScript editor offsets', () => {
  const source = '第一处错误。😀 第二处错误。第一处错误。';
  assert.equal(nthTextIndex(source, '第一处错误。', 2), source.lastIndexOf('第一处错误。'));
  const suggestions = locateAIReviewSuggestions([{
    id: 'one',
    category: 'grammar',
    severity: 'high',
    original: '第一处错误。',
    replacement: '第一处已修改。',
    reason: '修改第二次出现的句子',
    occurrence: 2
  }], source);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].start, source.lastIndexOf('第一处错误。'));
  assert.equal(suggestions[0].end, suggestions[0].start + suggestions[0].original.length);
});

test('AI review drops unlocatable and duplicate changes and normalizes labels', () => {
  const suggestions = locateAIReviewSuggestions([
    { original: '重复重复', replacement: '重复', reason: '删除重复词', occurrence: 1, category: 'spelling', severity: 'low' },
    { original: '重复重复', replacement: '重复', reason: '相同建议', occurrence: 1, category: 'grammar', severity: 'high' },
    { original: '不存在', replacement: '内容', reason: '无法定位', occurrence: 1 },
    { original: '正常', replacement: '正常', reason: '没有变化', occurrence: 1 }
  ], '这里有重复重复。');
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].category, 'spelling');
  assert.equal(suggestions[0].severity, 'low');
  assert.equal(suggestions[0].selected, true);
});

test('AI review detects overlapping selected changes before one-step apply', () => {
  assert.equal(hasOverlappingReviewSuggestions([
    { start: 1, end: 5 },
    { start: 4, end: 8 }
  ]), true);
  assert.equal(hasOverlappingReviewSuggestions([
    { start: 1, end: 5 },
    { start: 5, end: 8 }
  ]), false);
});
