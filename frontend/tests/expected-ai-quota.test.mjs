import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const diagnostics = between('function diagnosticErrorMessage(error)', 'function isKnownMacUpdateMigrationError(error)');

function diagnosticHarness(extra = {}) {
  const reports = [];
  const context = vm.createContext({
    Error, recordToolDiagnostic() {}, runtimeDiagnostics: {format: () => ''},
    isExportFileInUseError: () => false, isKnownMacUpdateMigrationError: () => false,
    isExportAccessDeniedError: () => false, isMissingDocumentError: () => false,
    window: {quilliteMarkdown: {reportErrorLog: (...args) => reports.push(args)}},
    ...extra,
  });
  vm.runInContext(diagnostics, context);
  return {context, reports};
}

test('only the exact known AI quota error is an expected AI account condition', () => {
  const {context} = diagnosticHarness();
  for (const error of [
    'AI_QUOTA_EXCEEDED: provider credits or quota exhausted',
    new Error('AI_QUOTA_EXCEEDED: provider credits or quota exhausted'),
    {message: 'AI_QUOTA_EXCEEDED: provider credits or quota exhausted'},
  ]) {
    for (const stage of ['ai.summary', 'ai.edit', 'ai.review']) {
      assert.equal(context.isExpectedOperationalError(error, stage), true);
    }
    assert.equal(context.isExpectedOperationalError(error, 'frontend.unhandled'), false);
  }
  for (const error of [
    'AI_PROVIDER_ERROR: unknown service failure',
    'AI_QUOTA_EXCEEDED_UNKNOWN: different failure',
    'Unexpected error while handling AI_QUOTA_EXCEEDED',
    'quota calculation crashed',
  ]) assert.equal(context.isExpectedOperationalError(error, 'ai.summary'), false);
});

const element = () => ({
  textContent: '', disabled: false, dataset: {}, checked: true,
  classList: {add() {}, remove() {}},
});

test('a quota rejection stays a visible failed summary, leaves the source unchanged and does not retry', async () => {
  for (const [failure, expectedReports] of [
    ['AI_QUOTA_EXCEEDED: provider credits or quota exhausted', 0],
    ['AI_PROVIDER_ERROR: unknown service failure', 1],
  ]) {
    const original = '# Unchanged original';
    const els = Object.fromEntries(['documentSummaryStatus', 'documentSummaryConsent', 'documentSummaryPrivacy',
      'documentSummaryPanel', 'documentSummaryButton', 'confirmDocumentSummary'].map(key => [key, element()]));
    const {context, reports} = diagnosticHarness({
      state: {currentFile: {path: '/test.md', content: original}, documentSession: 7}, els,
      documentSummaryPrivacyFindings: [], documentSummaryRequest: 0, activeDocumentSummaryRequestID: '',
      documentSummaryStreamCleanup: null, t: key => key,
      exceedsAIInputLimit: () => false, detectAISensitiveContent: () => [], renderAISendPrivacy() {},
      prepareAIContent: text => ({text, replacements: []}), setAISendPrivacyDisabled() {},
      startDocumentSummaryProgress() {}, stopDocumentSummaryProgress() {}, stopDocumentSummaryStream() {},
      showToast: () => assert.fail('a consented nonempty summary should reach the provider'),
      closeDocumentSummary: () => assert.fail('failed summary should remain visible'),
      renderDocumentSummary: () => assert.fail('a failed request must not render a successful summary'),
    });
    let requests = 0;
    context.window.quilliteMarkdown.rewriteWithAI = async () => { requests++; throw failure; };
    vm.runInContext(between('function aiErrorMessage(error)', 'const aiProviderConfigs')
      + between('async function generateAIDocumentSummary()', 'function aiRewriteRequestText()'), context);
    await context.generateAIDocumentSummary();
    assert.equal(requests, 1);
    assert.equal(context.state.currentFile.content, original);
    assert.match(els.documentSummaryStatus.textContent, /^aiSummaryFailed: /);
    if (!expectedReports) assert.equal(els.documentSummaryStatus.textContent, 'aiSummaryFailed: aiQuotaExceededHint');
    assert.equal(reports.length, expectedReports);
    assert.equal(els.documentSummaryButton.disabled, false);
    assert.equal(els.confirmDocumentSummary.disabled, false);
    assert.equal(context.activeDocumentSummaryRequestID, '');
  }
});
