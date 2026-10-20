import { imageSourceKind } from './image-layout.js';

// Share only pending reads, never retain resolved base64 strings in a cache.
// Disposal drops queued work; the bridge cannot abort reads already in flight.
export function createImageLoadSession(context, concurrency = 4) {
  const pending = [], inFlight = new Map();
  let running = 0;
  const session = { active: true, context };
  const closed = () => new Error('IMAGE_SESSION_CLOSED');
  const drain = () => {
    while (session.active && running < concurrency && pending.length) {
      const task = pending.shift(); running++;
      Promise.resolve().then(() => {
        if (!session.active) throw closed();
        return context.readImageData?.(task.ref, context.directory || '');
      }).then(value => {
        if (!session.active) throw closed();
        if (imageSourceKind(value || '') !== 'embedded') throw new Error('IMAGE_UNAVAILABLE');
        task.resolve(value);
      }).catch(task.reject).finally(() => {
        running--; inFlight.delete(task.ref); drain();
      });
    }
  };
  session.load = ref => {
    if (!session.active) return Promise.reject(closed());
    if (inFlight.has(ref)) return inFlight.get(ref);
    const promise = new Promise((resolve, reject) => pending.push({ ref, resolve, reject }));
    inFlight.set(ref, promise); drain(); return promise;
  };
  session.dispose = () => {
    session.active = false;
    for (const task of pending.splice(0)) task.reject(closed());
    inFlight.clear();
  };
  // Do not aggregate fulfilled data URLs into a second retained results array.
  session.settled = () => Promise.all([...inFlight.values()].map(promise => promise.then(() => undefined, () => undefined)));
  return session;
}

const previews = new WeakMap();
export function cancelPreviewImages(container) {
  previews.get(container)?.dispose();
  previews.delete(container);
}

export async function waitForPreviewImageReads(container, timeout = 30_000) {
  const session = previews.get(container);
  if (!session) return;
  let timer;
  try {
    await Promise.race([
      session.settled(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('EXPORT_IMAGE_RESOURCE_FAILED: local image loading timed out')), timeout); })
    ]);
    if (!session.active || container.querySelector('.local-image-loading, .local-image-error')) {
      throw new Error('EXPORT_IMAGE_RESOURCE_FAILED: local image unavailable');
    }
  } finally { clearTimeout(timer); }
}

export function loadPreviewImages(container, context) {
  cancelPreviewImages(container);
  const session = createImageLoadSession(context);
  previews.set(container, session);
  container.querySelectorAll('img').forEach(img => {
    const ref = img.dataset.markdownSrc || img.getAttribute('src') || '';
    delete img.dataset.markdownSrc;
    if (/^(https?:|data:)/i.test(ref)) return;
    img.removeAttribute('src');
    img.classList.add('local-image-loading');
    const current = () => session.active && img.isConnected && container.contains(img);
    session.load(ref).then(dataUrl => {
      if (!current()) return;
      img.src = dataUrl;
      img.classList.remove('local-image-loading', 'local-image-error');
    }).catch(() => {
      if (!current()) return;
      img.classList.remove('local-image-loading');
      img.classList.add('local-image-error');
    });
  });
}
