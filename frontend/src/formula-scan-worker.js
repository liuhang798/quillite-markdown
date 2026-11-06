import { scanMarkdownFormulas } from './formula-editing.js';

// Keep whole-document context: slicing a viewport can turn fenced code,
// frontmatter or HTML into false formulas. No document data leaves this worker.
self.onmessage = event => {
  try {
    const { source, tableCell } = event.data;
    self.postMessage({ items: scanMarkdownFormulas(source, { maxSourceLength: Infinity, maxTokens: Infinity, tableCell }) });
  } catch {
    self.postMessage({ error: true });
  }
};
