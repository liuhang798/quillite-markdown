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

// Store only numeric geometry from the current split preview, never image
// data. A fixed-width pane can still give an image a very different slot
// when the number of images or the column widths in a row change.
function previewImageSlotKey(img) {
  const owner = img.closest('table, blockquote, li, figure, details');
  const cell = img.closest('td, th');
  return JSON.stringify([owner?.tagName || '', cell?.clientWidth, cell?.colSpan, cell?.parentElement?.cells?.length]);
}

function previewImageMarkupKey(img, ref) {
  return JSON.stringify([ref, img.getAttribute('width'), img.getAttribute('height'), img.getAttribute('style')]);
}

export function snapshotPreviewImageSizes(container, scope) {
  const layout = previews.get(container)?.layout;
  if (!layout || layout.scope !== scope) return undefined;
  const width = container.clientWidth, sizes = new Map();
  if (!width) return undefined;
  // Multiple refs with the same markup consume their measurements in order.
  for (const [img, record] of layout.images) {
    if (!container.contains(img)) continue;
    const slot = previewImageSlotKey(img);
    let size;
    if (record.loading) size = record.width === width && record.slot === slot ? record.size : undefined;
    else if (img.complete && img.naturalWidth) {
      const w = img.offsetWidth, h = img.offsetHeight;
      if (w > 0 && h > 0) size = { w, h };
    }
    const key = JSON.stringify([record.markup, slot]);
    if (!sizes.has(key)) sizes.set(key, []);
    sizes.get(key).push(size);
  }
  return { width, sizes };
}

function reservePreviewImageSize(img, size) {
  if (!size) return () => {};
  const declarations = [['width', `${size.w}px`], ['height', 'auto'], ['aspect-ratio', `${size.w} / ${size.h}`]].map(([name, value]) => {
    const previous = [name, img.style.getPropertyValue(name), img.style.getPropertyPriority(name)];
    img.style.setProperty(name, value, 'important');
    return previous;
  });
  img.classList.add('local-image-reserved');
  return () => {
    img.classList.remove('local-image-reserved');
    for (const [name, value, priority] of declarations) {
      if (value) img.style.setProperty(name, value, priority);
      else img.style.removeProperty(name);
    }
    if (!img.getAttribute('style')) img.removeAttribute('style');
  };
}

export function cancelPreviewImages(container) {
  const session = previews.get(container);
  // A native read may outlive cancellation. Its promise must not keep the
  // already-loaded images from that whole, now detached preview alive.
  session?.layout?.images.clear();
  session?.dispose();
  previews.delete(container);
}

export async function waitForPreviewImageReads(container, timeout = 30_000) {
  const session = previews.get(container);
  if (!session) return;
  let timer;
  try {
    // Only an explicit export/print retries reads that already failed in
    // this preview. Never loop on failure or retry a pending read.
    session.retryFailed();
    await Promise.race([
      session.settled(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('EXPORT_IMAGE_RESOURCE_FAILED: local image loading timed out')), timeout); })
    ]);
    if (!session.active || session.hasUnavailable()) {
      throw new Error('EXPORT_IMAGE_RESOURCE_FAILED: local image unavailable');
    }
  } finally { clearTimeout(timer); }
}

export function loadPreviewImages(container, context) {
  cancelPreviewImages(container);
  const session = createImageLoadSession(context);
  previews.set(container, session);
  const split = context.splitLayout;
  if (split) session.layout = { scope: split.scope, images: new Map() };
  const width = split ? container.clientWidth : 0;
  const previous = split?.previous?.width === width ? split.previous.sizes : undefined;
  // Use an index per key (rather than shift) for duplicate refs in large docs.
  const occurrences = new Map();
  const failed = new Map(), pending = new Set();
  session.hasUnavailable = () => {
    for (const img of failed.keys()) if (container.contains(img)) return true;
    for (const img of pending) if (container.contains(img)) return true;
    return false;
  };
  session.retryFailed = () => {
    for (const [img, ref] of failed) {
      failed.delete(img);
      if (container.contains(img)) read(img, ref);
    }
  };
  function read(img, ref, record = session.layout?.images.get(img)) {
    pending.add(img);
    img.removeAttribute('src');
    img.classList.add('local-image-loading');
    if (record) record.loading = true;
    const release = reservePreviewImageSize(img, record?.size);
    const current = () => session.active && img.isConnected && container.contains(img);
    const finish = ok => {
      if (!current()) return;
      release();
      if (record) {
        record.loading = false;
        record.size = undefined;
      }
      img.classList.remove('local-image-loading', 'local-image-error');
      if (!ok) {
        failed.set(img, ref);
        img.classList.add('local-image-error');
      }
      if (record) split.onLayout?.();
    };
    session.load(ref).then(dataUrl => {
      pending.delete(img);
      if (!current()) return;
      if (record) {
        // Lazy images can gain intrinsic size after the bridge has returned.
        // Keep the placeholder through the actual browser load, not just I/O.
        const settle = event => {
          img.removeEventListener('load', settle);
          img.removeEventListener('error', settle);
          finish(event.type === 'load');
        };
        img.addEventListener('load', settle);
        img.addEventListener('error', settle);
      }
      img.src = dataUrl;
      if (!record) finish(true);
    }).catch(() => {
      pending.delete(img);
      finish(false);
    });
  }
  const reads = [];
  container.querySelectorAll('img').forEach(img => {
    if (img.dataset.remoteImageBlocked === 'true') return;
    const ref = img.dataset.markdownSrc || img.getAttribute('src') || '';
    delete img.dataset.markdownSrc;
    if (!/^(https?:|data:)/i.test(ref)) {
      if (split && imageSourceKind(ref) === 'local') {
        const markup = previewImageMarkupKey(img, ref), slot = previewImageSlotKey(img);
        const key = JSON.stringify([markup, slot]);
        const index = occurrences.get(key) || 0;
        occurrences.set(key, index + 1);
        session.layout.images.set(img, { markup, slot, width, size: previous?.get(key)?.[index] });
      }
      reads.push([img, ref]);
    }
  });
  // Measure all column slots before dropping src or setting placeholder size.
  for (const [img, ref] of reads) read(img, ref);
  // The read callbacks may outlive this render. Release the measurement batch.
  reads.length = 0;
}
