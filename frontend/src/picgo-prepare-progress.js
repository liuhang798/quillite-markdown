const phases = {
  starting: [0, 'picGoPhaseStarting'], downloading: [0, 'picGoPhaseDownloading'],
  verifying: [1, 'picGoPhaseVerifying'], extracting: [1, 'picGoPhaseExtracting'],
  installing: [2, 'picGoPhaseInstalling'], checking: [3, 'picGoPhaseChecking'],
  complete: [4, 'picGoPhaseComplete'], failed: [-1, 'picGoPhaseFailed'],
};

export function picGoPrepareProgressModel(progress = {}) {
  const phase = Object.hasOwn(phases, progress.phase) ? progress.phase : 'starting';
  const finite = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const done = finite(progress.done), total = finite(progress.total);
  const [step, title] = phases[phase];
  // Percent is the runtime download only, never a fabricated installation ETA.
  const percent = phase === 'complete' ? 100 : phase === 'downloading' && total > 0 ? Math.min(100, Math.floor(done / total * 100)) : null;
  return { phase, step, title, done, total, percent, active: !['complete', 'failed'].includes(phase) };
}

export function picGoPrepareBytes(bytes) {
  return `${(Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} MB`;
}
