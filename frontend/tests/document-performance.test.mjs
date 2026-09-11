import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LARGE_DOCUMENT_CHARS,
  VERY_LARGE_DOCUMENT_CHARS,
  documentHasDiagrams,
  documentPerformanceProfile
} from '../src/document-performance.js';

test('normal documents keep responsive live features', () => {
  const profile = documentPerformanceProfile(LARGE_DOCUMENT_CHARS - 1);
  assert.equal(profile.level, 'normal');
  assert.equal(profile.previewDelay, 90);
  assert.equal(profile.liveSpellcheck, true);
  assert.equal(profile.deferContentSync, false);
});

test('large documents defer full-buffer work and disable full spell scans', () => {
  const large = documentPerformanceProfile(LARGE_DOCUMENT_CHARS);
  const veryLarge = documentPerformanceProfile(VERY_LARGE_DOCUMENT_CHARS, true);
  assert.equal(large.level, 'large');
  assert.equal(large.liveSpellcheck, false);
  assert.equal(large.deferContentSync, true);
  assert.equal(veryLarge.level, 'very-large');
  assert.equal(veryLarge.previewDelay, 900);
  assert.ok(veryLarge.recoveryDelay > large.recoveryDelay);
});

test('diagram detection covers Mermaid and ECharts fences', () => {
  assert.equal(documentHasDiagrams('# title\n```mermaid\ngraph TD\n```'), true);
  assert.equal(documentHasDiagrams('```echarts\n{}\n```'), true);
  assert.equal(documentHasDiagrams('`mermaid` is only inline text'), false);
});
