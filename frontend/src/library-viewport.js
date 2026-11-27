// Keep the scroll extent of each long group without building off-screen rows.
// Retain overlapping DOM nodes when scrolling (keyboard focus, pointer events).
export function createLibraryViewport(list, renderRow, changed) {
  const threshold = 48, overscan = 5;
  let groups = [], step = 55, frame = 0;
  const rows = (files, pinned = false, reorderable = true) => {
    const draw = file => renderRow(file, typeof pinned === 'function' ? pinned(file) : pinned, reorderable);
    if (files.length < threshold) return files.map(draw).join('');
    const id = groups.push({ files, draw, start: 0, end: 0 }) - 1;
    return `<div class="library-row-window" data-library-window="${id}"${pinned === true ? ' data-pinned-list' : ''} style="height:${step * files.length}px;--library-step:${step}px"></div>`;
  };
  function fill(g, start, end) {
    if (!g.el || (start === g.start && end === g.end)) return false;
    const left = Math.max(start, g.start), right = Math.min(end, g.end);
    const html = (a, b) => g.files.slice(a, b).map(g.draw).join('');
    if (right <= left) g.el.innerHTML = html(start, end);
    else {
      for (let i = g.start; i < left; i++) g.el.firstElementChild.remove();
      for (let i = right; i < g.end; i++) g.el.lastElementChild.remove();
      if (start < left) g.el.insertAdjacentHTML('afterbegin', html(start, left));
      if (right < end) g.el.insertAdjacentHTML('beforeend', html(right, end));
    }
    g.el.style.paddingTop = (start * step) + 'px';
    g.start = start; g.end = end;
    return true;
  }
  function paint(updateSelection = true) {
    if (!groups.length) return;
    const box = list.getBoundingClientRect();
    let dirty = false;
    for (const g of groups) {
      if (g.expanded || !g.el) continue;
      const offset = box.top - g.el.getBoundingClientRect().top;
      const clamp = i => Math.min(g.files.length, Math.max(0, i));
      dirty = fill(g, clamp(Math.floor(offset / step) - overscan),
        clamp(Math.ceil((offset + box.height) / step) + overscan)) || dirty;
    }
    if (dirty && updateSelection) changed();
  }
  function schedule() {
    if (!groups.length || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; paint(); });
  }
  list.addEventListener('scroll', schedule, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(list);
  else window.addEventListener('resize', schedule);
  function locate(path) {
    for (const g of groups) {
      if (!g.el) continue;
      const i = g.files.findIndex(f => f.path === path);
      if (i >= 0) return g.el.getBoundingClientRect().top - list.getBoundingClientRect().top + i * step;
    }
    const row = [...list.querySelectorAll('.file-row')].find(r => decodeURIComponent(r.dataset.path) === path);
    return row ? row.getBoundingClientRect().top - list.getBoundingClientRect().top : null;
  }
  return {
    rows, paint,
    reset(scale) { groups = []; step = Math.max(55, Math.ceil(25 + 30 * scale)); },
    attach() { for (const el of list.querySelectorAll('[data-library-window]')) groups[Number(el.dataset.libraryWindow)].el = el; paint(false); },
    get active() { return groups.length > 0; },
    restore(path, offset) {
      const y = locate(path);
      if (y !== null) { list.scrollTop += y - offset; paint(); }
    },
    reveal(path) {
      const y = locate(path);
      if (y !== null && (y < 0 || y + step > list.clientHeight)) {
        list.scrollTop += y < 0 ? y : y + step - list.clientHeight;
        paint();
      }
    },
    // If fast keyboard navigation reaches the mounted boundary before the
    // browser scroll event, Tab must continue to the next logical file.
    advanceTab(event, files) {
      if (!groups.length || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const row = event.target.closest('.file-row');
      if (!row) return;
      const withinRow = event.shiftKey ? event.target.matches('.file-item') : event.target.matches('.pin-drag-handle');
      if (withinRow && row.querySelector('.pin-drag-handle:not(:disabled)')) return;
      const index = files.findIndex(f => f.path === decodeURIComponent(row.dataset.path));
      const next = files[index + (event.shiftKey ? -1 : 1)];
      if (index < 0 || !next) return;
      const selector = '.file-row[data-path="' + CSS.escape(encodeURIComponent(next.path)) + '"]';
      if (list.querySelector(selector)) return;
      this.reveal(next.path);
      const el = list.querySelector(selector);
      const target = el && ((!event.shiftKey && el.querySelector('.pin-drag-handle:not(:disabled)')) || el.querySelector('.file-item'));
      if (target) { event.preventDefault(); target.focus(); }
    },
    // Existing pin drag sorts the DOM and commits its complete order. Expand
    // only the dragged group for that gesture and retain the captured row.
    expandForDrag(el) {
      const g = groups.find(g => g.el === el);
      if (!g) return false;
      g.expanded = true;
      fill(g, 0, g.files.length);
      return true;
    },
  };
}
