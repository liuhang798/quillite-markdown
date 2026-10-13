import { renderEChartsDiagrams, releaseEChartsDiagrams, validateEChartsSource } from './echarts-diagrams.js';
import { renderMermaidDiagrams, cancelMermaidRendering } from './mermaid-diagrams.js';

// Validate the exact draft with the same sanitization and rendering path as
// reading/export. A detached node is skipped by Mermaid, so mount off-screen.
export async function validateDiagramRendering(source, engine = 'mermaid') {
  if (engine === 'echarts') {
    const syntax = validateEChartsSource(source);
    if (!syntax.valid) return syntax;
  }
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;pointer-events:none';
  const diagram = document.createElement('div');
  diagram.className = `${engine}-diagram`;
  diagram.dataset[`${engine}Source`] = encodeURIComponent(source);
  host.append(diagram);
  document.body.append(host);
  let timer;
  try {
    const messages = { diagramLabel: 'Diagram', errorTitle: 'Invalid diagram', errorHint: '' };
    const rendering = engine === 'echarts' ? renderEChartsDiagrams(host, messages) : renderMermaidDiagrams(host, messages);
    await Promise.race([rendering, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Diagram validation timed out.')), 15000); })]);
    const valid = diagram.dataset[`${engine}Rendered`] === 'true' && Boolean(diagram.querySelector('svg'));
    return { valid, error: valid ? '' : diagram.querySelector('pre, code')?.textContent || 'Diagram could not be rendered.' };
  } catch (error) {
    return { valid: false, error: error?.message || String(error) };
  } finally {
    clearTimeout(timer);
    cancelMermaidRendering(host);
    releaseEChartsDiagrams(host);
    host.remove();
  }
}
