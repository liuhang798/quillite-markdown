// Technical context only: never accept document data, paths, settings or a
// user action history. Keep context on the error, not in a global last-stage.
const stages = new Set(['dependencies', 'extensions', 'state', 'view', 'listeners', 'plugin']);
const modes = new Set(['normal', 'source-fallback']);

export function createRuntimeDiagnostics(moduleURL) {
  let asset = 'unbundled';
  try {
    const url = new URL(moduleURL);
    if ((['http:', 'https:'].includes(url.protocol) && url.hostname === 'wails.localhost')
      || (url.protocol === 'wails:' && url.hostname === 'wails')) {
      const match = /^\/assets\/(renderer-[A-Za-z0-9_-]{6,64}\.js)$/.exec(url.pathname);
      if (match) asset = match[1];
    }
  } catch { /* Do not echo an invalid URL. */ }
  const contexts = new WeakMap();
  return {
    capture(error, stage, mode) {
      if (!error || (typeof error !== 'object' && typeof error !== 'function')) return;
      // A second catch must not overwrite the original failure stage.
      if (contexts.has(error)) return;
      contexts.set(error, {
        stage: stages.has(stage) ? stage : 'unknown',
        mode: modes.has(mode) ? mode : 'unknown',
      });
    },
    format(error) {
      const context = error && (typeof error === 'object' || typeof error === 'function') ? contexts.get(error) : null;
      return `[diagnostics-v1 asset=${asset}${context ? ` stage=${context.stage} mode=${context.mode}` : ''}]`;
    },
  };
}
