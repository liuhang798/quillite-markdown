import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Logs alone are not acceptance: they must come from a completed run against
// the current source and the expected test. This is provenance, not log signing.
export function validateLiveEvidence(meta, expected) {
  if (!meta) return 'missing metadata';
  if (meta.status !== 'passed' || meta.exitCode !== 0) return 'run did not pass';
  if (!meta.startedAt || !meta.endedAt || !Number.isFinite(Date.parse(meta.startedAt))
    || !Number.isFinite(Date.parse(meta.endedAt)) || Date.parse(meta.endedAt) < Date.parse(meta.startedAt)) return 'invalid run dates';
  if (meta.sourceFingerprint !== expected.fingerprint || meta.endSourceFingerprint !== expected.fingerprint) return 'source changed or stale';
  if (meta.script !== expected.script || meta.scriptSHA256 !== expected.scriptSHA256) return 'test changed or unexpected';
  if (JSON.stringify(Object.entries(meta.settings || {}).sort()) !== JSON.stringify(Object.entries(expected.settings || {}).sort())) return 'unexpected test settings';
  return null;
}

export async function readLiveEvidence({root, evidenceRoot, name, script, settings = {}, fingerprint}) {
  let meta;
  try { meta = JSON.parse(await readFile(path.join(evidenceRoot, name, 'run-meta.json'), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return {accepted: false, reason: 'missing metadata', text: ''};
    if (error instanceof SyntaxError) return {accepted: false, reason: 'invalid metadata', text: ''};
    throw error;
  }
  const scriptSHA256 = createHash('sha256').update(await readFile(path.join(root, script))).digest('hex');
  const reason = validateLiveEvidence(meta, {script, settings, scriptSHA256, fingerprint});
  if (reason) return {accepted: false, reason, text: ''};
  try { return {accepted: true, reason: null, text: await readFile(path.join(evidenceRoot, name, 'run.log'), 'utf8')}; }
  catch (error) { if (error.code === 'ENOENT') return {accepted: false, reason: 'missing log', text: ''}; throw error; }
}
