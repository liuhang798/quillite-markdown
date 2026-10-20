// Keep only a small descriptor, never the detached reader DOM or document text.
const signature = element => ({
  tag: element.tagName,
  text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
});

export function captureReadingPosition(reader, content) {
  const top = reader.getBoundingClientRect().top;
  const children = [...content.children];
  let index = children.findIndex(element => element.getBoundingClientRect().bottom > top + 1);
  if (index < 0) index = Math.max(0, children.length - 1);
  const element = children[index];
  return {
    scrollTop: reader.scrollTop,
    index,
    anchor: element ? signature(element) : null,
    offset: element ? element.getBoundingClientRect().top - top : 0
  };
}

export function findReadingAnchor(children, position) {
  if (!position.anchor) return null;
  let best = null, distance = Infinity;
  children.forEach((element, index) => {
    const candidate = signature(element);
    if (candidate.tag !== position.anchor.tag || candidate.text !== position.anchor.text) return;
    if (Math.abs(index - position.index) < distance) {
      best = element;
      distance = Math.abs(index - position.index);
    }
  });
  // The paragraph itself may have been edited or removed.
  return best || children[Math.min(position.index, children.length - 1)] || null;
}

export function restoreReadingPosition(reader, content, position, isCurrent) {
  if (!position) {
    if (isCurrent()) reader.scrollTo({ top: 0, behavior: 'instant' });
    return () => {};
  }
  let stopped = false, frame = 0;
  let firstChild = content.firstChild;
  const apply = () => {
    frame = 0;
    if (stopped) return;
    if (!isCurrent() || content.firstChild !== firstChild) { stop(); return; }
    const anchor = findReadingAnchor([...content.children], position);
    const top = position.scrollTop === 0 ? 0 : anchor
      ? reader.scrollTop + anchor.getBoundingClientRect().top - reader.getBoundingClientRect().top - position.offset
      : position.scrollTop;
    reader.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  };
  const schedule = () => { if (!stopped && !frame) frame = requestAnimationFrame(apply); };
  const observer = new ResizeObserver(schedule);
  const mutations = new MutationObserver(schedule);
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    observer.disconnect();
    mutations.disconnect();
    content.removeEventListener('load', schedule, true);
    events.forEach(event => reader.removeEventListener(event, stop, true));
    // The caller keeps the cancellation function until the next transition.
    // Do not let that closure retain the old rendered tree after cancellation.
    firstChild = null;
    reader = null;
    content = null;
    position = null;
  };
  const timer = setTimeout(stop, 10000);
  observer.observe(content);
  mutations.observe(content, { childList: true, subtree: true });
  content.addEventListener('load', schedule, true);
  events.forEach(event => reader.addEventListener(event, stop, { capture: true, passive: true }));
  apply();
  schedule();
  return stop;
}
