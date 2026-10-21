import { markdownParser } from './markdown-parser.js';
import { maskFrontmatter } from './frontmatter.js';

// Parse real headings; a regex over lines would include fenced code examples
// and YAML. Only small value descriptors leave this function.
export function editorOutline(source) {
  const headings = [];
  markdownParser.parse(maskFrontmatter(source)).iterate({ enter(node) {
    if (!/^(ATXHeading|SetextHeading)[1-6]$/.test(node.name)) return;
    const text = source.slice(node.from, node.to)
      .replace(/^#{1,6}[\t ]+/, '').replace(/[\t ]+#+[\t ]*$/, '')
      .replace(/\r?\n[\t ]*[=-]+[\t ]*$/, '').trim();
    headings.push({ from: node.from, text, level: Number(node.name.slice(-1)) });
  }});
  return headings;
}

export function captureEditorPosition(view) {
  const top = view.scrollDOM.getBoundingClientRect().top;
  let block = view.lineBlockAtHeight(Math.max(0, top + 1 - view.documentTop));
  let line = view.state.doc.lineAt(block.from);
  // Markdown blank lines have height in the editor but no reader element.
  // Anchor the next real block instead of mapping the gap to the prior paragraph.
  while (!line.text.trim() && line.number < view.state.doc.lines) line = view.state.doc.line(line.number + 1);
  if (line.from !== block.from) block = view.lineBlockAt(line.from);
  const offset = view.documentTop + block.top - top;
  return { line: line.number, offset, scrollTop: view.scrollDOM.scrollTop,
    ...(offset < 0 && block.height > 0 ? { fraction: Math.min(1, -offset / block.height) } : {}) };
}

// Bounded, cancelable layout correction. It never changes selection, history,
// content or focus, and stops as soon as the user navigates/edits.
export function restoreEditorPosition(view, position, scrollIntoView, isCurrent) {
  if (!position?.line) return () => {};
  let doc = view.state.doc;
  const from = doc.line(Math.min(doc.lines, Math.max(1, position.line))).from;
  let stopped = false, frame = 0;
  let scroller = view.scrollDOM, content = view.contentDOM;
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'beforeinput'];
  const apply = () => {
    frame = 0;
    if (stopped) return;
    if (!isCurrent() || view.state.doc !== doc) { stop(); return; }
    view.requestMeasure({ key: position, read: () => {
      if (stopped || !isCurrent() || view.state.doc !== doc) return null;
      const block = view.lineBlockAt(from);
      const offset = Number.isFinite(position.fraction) ? -position.fraction * block.height : position.offset;
      return position.scrollTop === 0 ? 0 : Math.max(0, scroller.scrollTop
        + view.documentTop + block.top - scroller.getBoundingClientRect().top - offset);
    }, write: top => {
      if (top !== null && !stopped && isCurrent() && view.state.doc === doc && Math.abs(scroller.scrollTop - top) > 1)
        scroller.scrollTop = top;
    }});
  };
  const schedule = () => { if (!stopped && !frame) frame = requestAnimationFrame(apply); };
  const observer = new ResizeObserver(schedule), mutations = new MutationObserver(schedule);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame); clearTimeout(timer);
    observer.disconnect(); mutations.disconnect();
    content.removeEventListener('load', schedule, true);
    events.forEach(event => scroller.removeEventListener(event, stop, true));
    view = null; position = null; doc = null; scroller = null; content = null;
  };
  const timer = setTimeout(stop, 10000);
  observer.observe(content);
  mutations.observe(content, { childList: true, subtree: true });
  content.addEventListener('load', schedule, true);
  events.forEach(event => scroller.addEventListener(event, stop, { capture: true, passive: true }));
  // Materialise a virtualised line before applying its pixel offset.
  view.dispatch({ effects: scrollIntoView(from, { y: 'start', yMargin: 0 }) });
  schedule();
  return stop;
}
