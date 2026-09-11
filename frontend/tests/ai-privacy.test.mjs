import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAISensitiveContent, redactAISensitiveContent, restoreAISensitiveContent, restoreAISuggestions } from '../src/ai-privacy.js';

test('AI privacy detection finds common credentials and personal identifiers without overlaps', () => {
  const text = '邮箱 user@example.com 手机 13800138000 身份证 11010519491231002X Key sk-example0123456789';
  const findings = detectAISensitiveContent(text);
  assert.deepEqual(findings.map(item => item.type), ['email', 'phone', 'idNumber', 'apiKey']);
  assert.ok(findings.every(item => !item.masked.includes(item.value)));
});

test('selected sensitive values are restored after AI processing', () => {
  const source = '联系 user@example.com，密钥 sk-example0123456789。';
  const findings = detectAISensitiveContent(source);
  findings[1].selected = false;
  const prepared = redactAISensitiveContent(source, findings);
  assert.doesNotMatch(prepared.text, /user@example\.com/);
  assert.match(prepared.text, /sk-example0123456789/);
  assert.equal(restoreAISensitiveContent(prepared.text, prepared.replacements), source);
  const restored = restoreAISuggestions([{ original: prepared.text, replacement: prepared.text, reason: prepared.text }], prepared.replacements);
  assert.equal(restored[0].original, source);
});
