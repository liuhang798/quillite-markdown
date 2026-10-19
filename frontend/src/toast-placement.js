// Keep transient notifications clear of the editor's bottom command panels.
export function toastBottomInset(viewportHeight, toast, panels, base = 28, gap = 12) {
  let bottom = base;
  for (const panel of [...panels].sort((a, b) => b.top - a.top)) {
    if (panel.width <= 0 || panel.height <= 0 || panel.bottom <= 0 || panel.top >= viewportHeight) continue;
    const top = viewportHeight - bottom - toast.height;
    if (toast.right > panel.left && toast.left < panel.right
      && viewportHeight - bottom > panel.top && top < panel.bottom) {
      bottom = Math.max(bottom, viewportHeight - panel.top + gap);
    }
  }
  return Math.max(base, Math.min(bottom, viewportHeight - toast.height - gap));
}

export function createToastPlacement({ toast, editor }) {
  const win = toast.ownerDocument.defaultView;
  let active = false, frame = 0, observer;
  const update = () => {
    frame = 0;
    if (!active || toast.classList.contains('hidden')) return;
    const rect = toast.getBoundingClientRect();
    const panels = [...editor.querySelectorAll('.cm-panels-bottom')].map(el => el.getBoundingClientRect());
    const bottom = toastBottomInset(win.innerHeight, { left: rect.left, right: rect.right, height: toast.offsetHeight }, panels);
    // No editor transaction, scrolling or focus change: only move the overlay.
    toast.style.bottom = `${bottom}px`;
  };
  const schedule = () => {
    if (active && !frame) frame = win.requestAnimationFrame(update);
  };
  const stop = () => {
    active = false;
    win.cancelAnimationFrame(frame); frame = 0;
    observer?.disconnect(); observer = null;
    win.removeEventListener('resize', schedule);
    toast.style.removeProperty('bottom');
  };
  return {
    schedule,
    start() {
      stop(); active = true;
      if (win.ResizeObserver) {
        observer = new win.ResizeObserver(schedule);
        observer.observe(toast); observer.observe(editor);
        editor.querySelectorAll('.cm-scroller,.cm-panels-bottom').forEach(el => observer.observe(el));
      }
      win.addEventListener('resize', schedule);
      update();
    },
    stop,
  };
}
