// Only immutable, sanitised HTML is cached. Never cache live DOM, file data URLs,
// editor state, or chart instances. Count both source and output as UTF-16 bytes.
export function createReaderCache({ maxEntries = 4, maxBytes = 16 * 1024 * 1024 } = {}) {
  const entries = new Map();
  let bytes = 0;
  const remove = key => {
    const entry = entries.get(key);
    if (entry) { bytes -= entry.bytes; entries.delete(key); }
  };
  return {
    get(key, source) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.source !== source) { remove(key); return null; }
      entries.delete(key); entries.set(key, entry);
      return entry.html;
    },
    getMapping(key, source) {
      const entry = entries.get(key);
      return entry?.source === source ? entry.mapping : '';
    },
    set(key, source, html, mapping = '') {
      remove(key);
      const size = 2 * (key.length + source.length + html.length + mapping.length);
      if (size > maxBytes || maxEntries < 1) return;
      while (entries.size && (entries.size >= maxEntries || bytes + size > maxBytes)) remove(entries.keys().next().value);
      entries.set(key, { source, html, mapping, bytes: size }); bytes += size;
    },
    get size() { return entries.size; },
    get bytes() { return bytes; },
    clear() { entries.clear(); bytes = 0; }
  };
}

export const READER_DEFER_THRESHOLD = 32_000;
const sessions = new WeakMap();

export function cancelReaderWork(container) {
  const session = sessions.get(container);
  if (!session) return;
  session.observer?.disconnect();
  cancelAnimationFrame(session.frame);
  session.queue.clear();
  sessions.delete(container);
}

export function revealReaderLayout(container) {
  container.querySelectorAll('.reader-deferred-layout').forEach(el => {
    el.classList.remove('reader-deferred-layout');
    el.style.removeProperty('contain-intrinsic-size');
  });
}

export function highlightReaderCode(code, highlight) {
  if (!code.hasAttribute('data-reader-code')) return;
  const language = code.getAttribute('data-reader-code');
  const source = code.textContent;
  code.removeAttribute('data-reader-code');
  // Huge/pathological blocks remain complete, copyable plain code. A single
  // synchronous highlighter call cannot be interrupted by a frame budget.
  if (source.length > READER_DEFER_THRESHOLD) return;
  try { code.innerHTML = highlight(source, language); } catch { code.textContent = source; }
}

export function finishReaderWork(container, highlight) {
  cancelReaderWork(container);
  revealReaderLayout(container);
  container.querySelectorAll('code[data-reader-code]').forEach(code => highlightReaderCode(code, highlight));
}

export function scheduleReaderWork(container, highlight) {
  cancelReaderWork(container);
  const session = { observer: null, frame: 0, queue: new Set() };
  sessions.set(container, session);
  const run = () => {
    session.frame = 0;
    if (sessions.get(container) !== session) return;
    const start = performance.now();
    for (const code of session.queue) {
      session.queue.delete(code);
      if (container.contains(code) && code.isConnected) {
        const selection = window.getSelection();
        // Never destroy the DOM underneath an active text selection.
        if (selection?.rangeCount && !selection.isCollapsed && selection.containsNode(code, true)) {
          code.removeAttribute('data-reader-code');
        } else highlightReaderCode(code, highlight);
      }
      if (performance.now() - start >= 6) break;
    }
    if (session.queue.size) session.frame = requestAnimationFrame(run);
  };
  const enqueue = code => {
    if (sessions.get(container) !== session) return;
    session.queue.add(code);
    if (!session.frame) session.frame = requestAnimationFrame(run);
  };
  const codes = container.querySelectorAll('code[data-reader-code]');
  if (typeof IntersectionObserver === 'undefined') { codes.forEach(enqueue); return; }
  session.observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      session.observer.unobserve(entry.target); enqueue(entry.target);
    }
  }, { root: container.closest('.reader-pane'), rootMargin: '400px' });
  codes.forEach(code => session.observer.observe(code));
  // Keep headings and charts normally laid out. No wrapper changes, missing
  // text, or source-position mapping changes are introduced.
  for (const block of container.children) {
    if (!block.matches('.code-block, .markdown-table-scroll') || block.querySelector('.mermaid-diagram, .echarts-diagram')) continue;
    if (block.matches('.code-block') && !block.querySelector('pre > code')) continue;
    block.classList.add('reader-deferred-layout');
    const lines = block.matches('.code-block') ? block.querySelector('code').textContent.split('\n').length : block.querySelectorAll('tr').length;
    block.style.containIntrinsicSize = `auto ${Math.min(20000, Math.max(80, lines * 28 + 40))}px`;
  }
}
