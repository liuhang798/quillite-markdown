export const DOCUMENT_LOADING_DELAY = 300;
export const DOCUMENT_LOADING_LONG_DELAY = 3000;

// A single owner prevents an older request's finally block from hiding a newer
// document's indicator. Injected clocks keep the timing contract testable.
export function createDocumentLoading({show, hide, prime = () => {}, now = () => performance.now(),
  schedule = setTimeout, cancel = clearTimeout, yieldFrame = documentLoadingFrame}) {
  let current = null;
  function stop() {
    if (!current) return;
    for (const timer of current.timers) cancel(timer);
    current = null; hide();
  }
  return {
    cancel: stop,
    begin() {
      stop();
      const job = {started: now(), phase: 'opening', timers: []};
      current = job;
      prime();
      const refresh = () => {
        if (current !== job) return;
        const elapsed = now() - job.started;
        if (elapsed >= DOCUMENT_LOADING_DELAY) show({phase: job.phase, long: elapsed >= DOCUMENT_LOADING_LONG_DELAY});
      };
      job.timers.push(schedule(refresh, DOCUMENT_LOADING_DELAY), schedule(refresh, DOCUMENT_LOADING_LONG_DELAY));
      return {
        phase(value) { job.phase = value; refresh(); },
        async yield() { refresh(); await yieldFrame(); refresh(); },
        finish() { if (current === job) stop(); }
      };
    }
  };
}

export function documentLoadingFrame() {
  return new Promise(resolve => {
    let frame, task;
    const finish = () => { cancelAnimationFrame(frame); clearTimeout(task); clearTimeout(fallback); resolve(); };
    // A timer after rAF permits painting before the next synchronous stage.
    const fallback = setTimeout(finish, 80); // Hidden/minimized WebViews pause rAF.
    frame = requestAnimationFrame(() => { task = setTimeout(finish, 0); });
  });
}

export function mountDocumentLoading(pane, language) {
  const overlay = document.createElement('div');
  overlay.className = 'document-loading'; overlay.hidden = true;
  const card = document.createElement('div'); card.className = 'document-loading-card';
  const spinner = document.createElement('span'); spinner.className = 'document-loading-spinner'; spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('div'); text.setAttribute('role', 'status'); text.setAttribute('aria-live', 'polite');
  const title = document.createElement('strong'), hint = document.createElement('span');
  hint.className = 'document-loading-hint'; text.append(title, hint); card.append(spinner, text); overlay.append(card); document.body.append(overlay);
  let observer;
  const position = () => {
    const box = pane.getBoundingClientRect();
    Object.assign(overlay.style, {left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`});
  };
  return createDocumentLoading({
    prime() {
      // Paint a transparent, compositor-animated card before synchronous work.
      // CSS reveals it at 300ms even if a single parser call is still running;
      // fast operations remove it before it ever becomes visible.
      title.textContent = language() === 'en' ? 'Opening document…' : '正在打开文档…';
      hint.hidden = true;
      text.setAttribute('aria-hidden', 'true');
      overlay.classList.add('is-pending'); position(); overlay.hidden = false;
      observer = new ResizeObserver(position); observer.observe(pane);
      window.addEventListener('resize', position);
    },
    show({phase, long}) {
      const en = language() === 'en';
      const label = en ? {opening: 'Opening document…', processing: 'Processing content…', displaying: 'Displaying document…'}
        : {opening: '正在打开文档…', processing: '正在处理内容…', displaying: '正在显示正文…'};
      title.textContent = label[phase] || label.opening;
      hint.textContent = long ? (en ? 'This document is taking longer to load. Please wait.' : '文档加载较慢，正在处理，请稍候。') : '';
      hint.hidden = !long;
      overlay.classList.remove('is-pending'); text.removeAttribute('aria-hidden'); pane.setAttribute('aria-busy', 'true');
    },
    hide() {
      overlay.hidden = true; overlay.classList.remove('is-pending'); text.setAttribute('aria-hidden', 'true'); pane.removeAttribute('aria-busy');
      observer?.disconnect(); observer = null; window.removeEventListener('resize', position);
    }
  });
}
