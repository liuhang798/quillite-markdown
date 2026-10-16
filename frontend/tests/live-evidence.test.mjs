import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLiveEvidence} from '../../scripts/live-evidence.mjs';
import {exactEvidenceCases,editingBoundaryEvidence} from '../../scripts/live-editing-evidence.mjs';
import {selectionSearchEvidence,selectionCaseOutcomes} from '../../scripts/live-selection-evidence.mjs';
import {documentLayoutEvidence,documentCaseOutcomes} from '../../scripts/live-document-evidence.mjs';
import {documentSessionEvidence,sessionCaseOutcomes} from '../../scripts/live-session-evidence.mjs';

test('document sessions require named cases, complete terminal summary and provenance',async()=>{
 const rows=await documentSessionEvidence({root:'.',fingerprint:'current'});
 assert.deepEqual(rows.map(r=>r.expectedCases),[14,14,14,12]);assert.ok(rows.every(r=>r.status==='pending'&&r.passedCases===0));
 assert.deepEqual(sessionCaseOutcomes('PASS restore-history\n',14),[]);
 assert.deepEqual(sessionCaseOutcomes('PASS restore-history\n{"PASS":13,"total":14,"failures":["read-error"]}',14),[]);
 assert.deepEqual(sessionCaseOutcomes('{"PASS":14,"total":14,"failures":[]}',14),[]);
 assert.deepEqual(sessionCaseOutcomes('PASS restore-history\n{"PASS":14,"total":14,"failures":[]}',14),['restore-history']);
});

const expected = {fingerprint: 'current', script: 'frontend/tests/example.mjs', scriptSHA256: 'test-hash', settings: {AUDIT_WIDTH: '960', AUDIT_SHARD: '0'}};
test('document/layout evidence requires every named scope and a supplied run',async()=>{
  const rows=await documentLayoutEvidence({root:'.',fingerprint:'current'});
  assert.deepEqual(rows.map(row=>row.expectedCases),[24,13,7,2,7,9,2,3]);
  assert.ok(rows.every(row=>row.status==='pending'&&row.passedCases===0&&row.missing.length===row.expectedCases));
});
test('document/layout evidence does not accept a bare total or partial case names',()=>{
  for(const id of ['header-reflow','split-limits','recovery-interactions','recovery-archive','startup-race','startup-explorer','editor-only','document-conflict']) {
    assert.deepEqual(documentCaseOutcomes(id,'{"PASS":67,"errors":[]}'),[]);
  }
  assert.deepEqual(documentCaseOutcomes('startup-race','PASS new-pending [\n  "prefs"\n]\nPASS new-typed [ "prefs" ]'),['new-pending','new-typed']);
  assert.deepEqual(documentCaseOutcomes('editor-only','PASS editor-only-windows\n'),['editor-only-windows']);
});
const valid = {status: 'passed', exitCode: 0, startedAt: '2026-10-15T01:00:00Z', endedAt: '2026-10-15T02:00:00Z', sourceFingerprint: 'current', endSourceFingerprint: 'current', script: expected.script, scriptSHA256: expected.scriptSHA256, settings: {AUDIT_SHARD: '0', AUDIT_WIDTH: '960'}};
test('live evidence accepts a completed matching run regardless of settings key order', () => assert.equal(validateLiveEvidence(valid, expected), null));
for (const [name, patch, reason] of [
  ['running', {status: 'running'}, 'run did not pass'],
  ['failed exit with successful-looking log', {exitCode: 1}, 'run did not pass'],
  ['missing exit', {exitCode: undefined}, 'run did not pass'],
  ['old source', {sourceFingerprint: 'old'}, 'source changed or stale'],
  ['source changed while running', {endSourceFingerprint: 'different'}, 'source changed or stale'],
  ['changed test', {scriptSHA256: 'different'}, 'test changed or unexpected'],
  ['different test', {script: 'other.mjs'}, 'test changed or unexpected'],
  ['wrong viewport', {settings: {...valid.settings, AUDIT_WIDTH: '1500'}}, 'unexpected test settings'],
  ['wrong shard', {settings: {...valid.settings, AUDIT_SHARD: '1'}}, 'unexpected test settings'],
  ['unexpected filtering', {settings: {...valid.settings, AUDIT_CASE: 'single'}}, 'unexpected test settings'],
  ['no completion date', {endedAt: undefined}, 'invalid run dates'],
  ['reversed dates', {endedAt: '2026-10-14T00:00:00Z'}, 'invalid run dates'],
]) test('live evidence rejects ' + name, () => assert.equal(validateLiveEvidence({...valid, ...patch}, expected), reason));
test('live evidence rejects missing metadata', () => assert.equal(validateLiveEvidence(null, expected), 'missing metadata'));
test('editing coverage requires every distinct named case, without missing/duplicate/extra cases',()=>{
  assert.equal(exactEvidenceCases(['b','a'],['a','b']),true);
  for(const actual of [[],['a'],['a','a'],['a','b','b'],['a','b','c']])assert.equal(exactEvidenceCases(actual,['a','b']),false);
});
test('editing evidence without a supplied directory cannot become a pass',async()=>{
  const rows=await editingBoundaryEvidence({root:'.',fingerprint:'current'});
  assert.equal(rows.length,6);
  assert.deepEqual(rows.map(row=>row.expectedCases),[55,10,10,37,10,24]);
  assert.ok(rows.every(row=>row.status==='pending'&&row.passedCases===0&&row.missing.length===row.expectedCases));
});

test('selection/search evidence enumerates each scope and requires a supplied run',async()=>{
  const rows=await selectionSearchEvidence({root:'.',fingerprint:'current'});
  assert.equal(rows.length,8);
  assert.deepEqual(rows.map(row=>row.expectedCases),[26,27,36,128,14,12,16,14]);
  assert.ok(rows.every(row=>row.status==='pending'&&row.passedCases===0&&row.missing.length===row.expectedCases));
});

test('selection evidence cannot derive cases from a bare successful total',()=>{
  assert.deepEqual(selectionCaseOutcomes('multi-actions','{"PASS":36,"pageErrors":[]}'),[]);
  assert.deepEqual(selectionCaseOutcomes('cross-format','{"passed":128,"pageErrors":[]}'),[]);
  assert.deepEqual(selectionCaseOutcomes('live-search','{"PASS":12,"searchOptionModes":2,"pageErrors":[]}'),[]);
});

test('selection evidence rejects incomplete or page-error action summaries',()=>{
  const rows='PASS table-Delete\nVISIBLE CURSORS table-cursor {}\n';
  assert.deepEqual(selectionCaseOutcomes('multi-actions',rows),[]);
  assert.deepEqual(selectionCaseOutcomes('multi-actions',rows+'{"PASS":1,"pageErrors":[]}'),[]);
  assert.deepEqual(selectionCaseOutcomes('multi-actions',rows+'{"PASS":36,"pageErrors":["error"]}'),[]);
  assert.deepEqual(selectionCaseOutcomes('multi-actions',rows+'{"PASS":36,"pageErrors":[]}'),['table-Delete','table-cursor']);
});
