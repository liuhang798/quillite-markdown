import { scanMarkdownFormulas } from './formula-editing.js';

// Keep whole-document context: slicing a viewport can turn fenced code,
// frontmatter or HTML into false formulas. No document data leaves this worker.
self.onmessage = event => {
  try {
    self.postMessage({ items: scanMarkdownFormulas(event.data, { maxSourceLength: Infinity, maxTokens: Infinity }) });
  } catch {
    self.postMessage({ error: true });
  }
};
