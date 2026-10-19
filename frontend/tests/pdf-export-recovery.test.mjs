import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfEngineFailure} from '../src/pdf-export-recovery.js';
test('missing, timed out and failed native engines permit system print fallback',()=>{
  for(const code of ['PDF_ENGINE_NOT_FOUND','PDF_EXPORT_TIMEOUT','PDF_EXPORT_FAILED']) {
    assert.equal(pdfEngineFailure(new Error(code)),code);
    assert.equal(pdfEngineFailure(code+': engine unavailable'),code);
  }
});
test('destination and unrelated errors never trigger engine fallback',()=>{
  for(const message of ['Access is denied.', 'EXPORT_FILE_IN_USE', 'EXPORT_SOURCE_DOCUMENT_TOO_LARGE', 'rename C:/PDF_EXPORT_FAILED.md: Access is denied.', 'PDF_EXPORT_TIMEOUT_OTHER'])assert.equal(pdfEngineFailure(message),null);
});
