import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAITextDiff, buildAITextDiff, changedAITextSegments } from '../src/ai-text-diff.js';

test('AI text diff preserves unchanged lines and applies accepted changes', () => {
  const original = '标题\n旧内容\n结尾\n';
  const revised = '标题\n新内容\n结尾\n';
  const segments = buildAITextDiff(original, revised);
  const changes = changedAITextSegments(segments);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].original, '旧内容\n');
  assert.equal(changes[0].replacement, '新内容\n');
  assert.equal(applyAITextDiff(segments), revised);
});

test('AI text diff can reject an individual change without losing accepted changes', () => {
  const original = '甲\n乙\n丙\n丁\n';
  const revised = '甲\n改乙\n丙\n改丁\n';
  const segments = buildAITextDiff(original, revised);
  const changes = changedAITextSegments(segments);
  assert.equal(changes.length, 2);
  changes[0].accepted = false;
  assert.equal(applyAITextDiff(segments), '甲\n乙\n丙\n改丁\n');
});

test('AI text diff handles insertions, deletions, and unchanged text', () => {
  const insertion = buildAITextDiff('', '新增内容');
  assert.equal(changedAITextSegments(insertion).length, 1);
  assert.equal(applyAITextDiff(insertion), '新增内容');

  const deletion = buildAITextDiff('删除内容', '');
  changedAITextSegments(deletion)[0].accepted = false;
  assert.equal(applyAITextDiff(deletion), '删除内容');

  assert.equal(changedAITextSegments(buildAITextDiff('相同', '相同')).length, 0);
});
