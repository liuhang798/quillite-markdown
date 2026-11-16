import { decodeHTMLAttribute } from 'entities';

// HTML ignores the closing slash on <video>. Handle Typora's shorthand in
// Marked's tokenizers, not in a global source rewrite that can touch code.
const videoOpening = /^<video(?=[\s/>])(?:"[^"]*"|'[^']*'|[^"'<>])*>/i;
const videoClosing = /^\s*<\/video\s*>/i;

function openingAt(source) {
  return videoOpening.exec(source.slice(0, 4096))?.[0];
}

function pair(opening) {
  const attributes = opening.slice(6, -1).replace(/\/\s*$/, '');
  const nextAttribute = /\s*([^\s=<>"'/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
  let match;
  while ((match = nextAttribute.exec(attributes))) {
    if (match[1].toLowerCase() !== 'src') continue;
    const authored = decodeHTMLAttribute(match[2] ?? match[3] ?? match[4] ?? '');
    const network = parseNetworkVideoReference(authored);
    if (network) return `<video src="${escapeVideoAttribute(network)}"></video>`;
    const source = parseLocalVideoReference(authored);
    if (!source) break;
    // DOMPurify correctly rejects arbitrary URI schemes. Present a validated
    // local drive/file path as a percent-encoded path, never widen its policy.
    let path = decodeURIComponent(source).replace(/\\/g, '/');
    if (/^file:\/\/\//i.test(path)) path = path.slice(7);
    if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
    const ref = /^[a-z]:\//i.test(path) || /^file:/i.test(source)
      ? path.split('/').map(encodeURIComponent).join('/') : source;
    return `<video src="${escapeVideoAttribute(ref)}"></video>`;
  }
  return '<video></video>';
}

export const localVideoMarkdownExtensions = [
  {
    name: 'localVideoBlock', level: 'block',
    tokenizer(source) {
      const indent = /^ {0,3}(?=<video[\s/>])/i.exec(source)?.[0];
      if (indent === undefined) return;
      const opening = openingAt(source.slice(indent.length));
      if (!opening) return;
      let length = indent.length + opening.length;
      if (!/\/\s*>$/.test(opening)) {
        const closing = videoClosing.exec(source.slice(length, length + 64));
        if (!closing) return;
        length += closing[0].length;
      }
      const eol = /^[ \t]*(?:\r?\n|$)/.exec(source.slice(length));
      if (!eol) return;
      return { type: 'localVideoBlock', raw: source.slice(0, length + eol[0].length), opening };
    },
    renderer(token) { return pair(token.opening) + '\n'; }
  },
  {
    name: 'localVideoInline', level: 'inline',
    start(source) {
      const index = source.search(/<video(?=[\s/>])/i);
      return index < 0 ? undefined : index;
    },
    tokenizer(source) {
      if (this.lexer.state.inRawBlock) return;
      const opening = openingAt(source);
      if (!opening) return;
      const selfClosing = /\/\s*>$/.test(opening);
      const closing = selfClosing ? '' : videoClosing.exec(source.slice(opening.length, opening.length + 64))?.[0];
      if (closing === undefined) return;
      return { type: 'localVideoInline', raw: opening + closing, opening };
    },
    renderer(token) { return pair(token.opening); }
  }
];

// This is only the presentation allowlist. The native side still owns all
// authorization, path resolution, containment, and file-type checks.
const localVideoSuffix = /\.(mp4|webm)$/i;

export function parseLocalVideoReference(source) {
  const reference = String(source ?? '').trim();
  if (!reference || reference.length > 4096 || /[\x00-\x1f\x7f]/.test(reference)) return '';
  if (/^file:/i.test(reference) && /[?#]/.test(reference)) return '';
  let decoded;
  try { decoded = decodeURIComponent(reference); } catch { return ''; }
  let path = decoded.replace(/\\/g, '/');
  if (/^file:\/\/\//i.test(path)) path = path.slice(7);
  if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
  if (path.startsWith('//') || /[\x00-\x1f\x7f]/.test(path) || !localVideoSuffix.test(path)) return '';
  if (/^[a-z]:\//i.test(path)) path = path.slice(2);
  if (/[:?]/.test(path) || path.split('/').some(part => part === '..' ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[. ]|$)/i.test(part))) return '';
  return reference;
}

export function localVideoMarkup(reference) {
  const path = parseLocalVideoReference(reference);
  if (!path) return '';
  return `<video controls preload="none" src="${escapeVideoAttribute(path)}"></video>`;
}

const localHostSuffix = /(?:^|\.)(?:localhost|localdomain|local|internal|intranet|corp|lan|home|arpa|test|invalid|onion)$/i;
const videoPlatformHost = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com|bilibili\.com|bilibili\.tv|b23\.tv|bili2233\.cn)$/i;
const dnsHost = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function parsePublicHTTPS(source) {
  const reference = String(source ?? '').trim();
  if (reference.length > 4096 || /[\x00-\x20\x7f\\]/.test(reference)) return null;
  const authority = /^https:\/\/([^/?#]+)/i.exec(reference)?.[1];
  if (!authority || authority.includes('@')) return null;
  try {
    const { protocol, hostname, username, password } = new URL(reference);
    const host = hostname.replace(/\.$/, '');
    // Deliberately use public DNS names in this phase. URL parses disguised
    // IPv4 literals (decimal/octal/hex) into their dotted form, and IPv6
    // literals fail the DNS syntax below. This does not resolve DNS or proxy
    // the resource; the browser retains its own network/redirect policies.
    if (protocol !== 'https:' || username || password || host.length > 253 ||
        !dnsHost.test(host) || /\.\d+$/.test(host) || localHostSuffix.test(host)) return null;
    return { reference, host };
  } catch { return null; }
}

export function isVideoPlatformPage(source) {
  const result = parsePublicHTTPS(source);
  return Boolean(result && videoPlatformHost.test(result.host));
}

export function parseNetworkVideoReference(source) {
  const result = parsePublicHTTPS(source);
  if (!result || videoPlatformHost.test(result.host)) return '';
  // The presence of a video tag/command is the explicit media intent. Signed
  // CDN URLs do not always have .mp4 suffixes, and probing in advance would
  // connect without consent. Never rebuild the query string or path.
  return result.reference;
}

export function networkVideoMarkup(reference) {
  const url = parseNetworkVideoReference(reference);
  return url ? `<video controls preload="none" src="${escapeVideoAttribute(url)}"></video>` : '';
}

function escapeVideoAttribute(value) {
  return value.replace(/[&"<>]/g, ch => ({'&':'&amp;', '"':'&quot;', '<':'&lt;', '>':'&gt;'}[ch]));
}

const records = new WeakMap();
const cardSelector = '.qm-local-video';
const activeCards = new WeakMap();

function leafName(reference) {
  if (!reference) return '';
  const leaf = reference.split(/[/\\]/).at(-1) || '';
  try { return decodeURIComponent(leaf).split(/[/\\]/).at(-1).slice(0, 160); }
  catch { return leaf.slice(0, 160); }
}

function streamURL(value) {
  // Accept only the backend's same-origin capability. Never resolve an
  // authored URL or grant network access from the media element.
  return typeof value === 'string' && /^\/__quillite_video\/[a-f0-9]{64}\.(?:mp4|webm)$/.test(value) ? value : '';
}

const textElement = (doc, tag, className, text) => {
  const node = doc.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

function staticLabel(doc, t, name, className = 'qm-video-static', online = false) {
  const label = t(online ? 'networkVideoLabel' : 'localVideoLabel');
  const info = name ? `${label}: ${name}` : label;
  return textElement(doc, 'span', className, `${info} · ${t('localVideoExportPlaceholder')}`);
}

function placeSourceAnchor(source, replacement) {
  const anchor = source.getAttribute('data-qm-source');
  if (anchor !== null) replacement.setAttribute('data-qm-source', anchor);
  return replacement;
}

const proseTags = new Set(['p', 'div', 'span', 'br', 'pre', 'code', 'blockquote', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'strong', 'b', 'i', 'u', 's', 'del', 'small', 'sub', 'sup']);
const nonProseTags = new Set(['img', 'picture', 'video', 'audio', 'source', 'track', 'style', 'script',
  'link', 'meta', 'base', 'iframe', 'embed', 'object', 'svg', 'math', 'template', 'textarea']);

function inertVideoFallback(doc, video) {
  const prose = doc.createDocumentFragment();
  const copyProse = (source, target) => {
    for (const child of source.childNodes) {
      if (child.nodeType === 3) { target.append(doc.createTextNode(child.data)); continue; }
      if (child.nodeType !== 1 || child.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
          nonProseTags.has(child.localName)) continue;
      // Explicitly rebuild inert formatting, never reparent attributes
      // (src/srcset/poster/href/style/background) from authored fallback HTML.
      const next = proseTags.has(child.localName) ? doc.createElement(child.localName) : target;
      copyProse(child, next);
      if (next !== target) target.append(next);
    }
  };
  copyProse(video, prose);
  return prose;
}

function makeVideoCard(doc, reference, { enabled, documentPath, session, bridge, t }, name, online) {
  const key = suffix => `${online ? 'networkVideo' : 'localVideo'}${suffix}`;
  const card = textElement(doc, 'div', online ? 'qm-local-video qm-local-video--network' : 'qm-local-video');
  const title = textElement(doc, 'div', 'qm-local-video__title', name || t(key('Label')));
  const status = textElement(doc, 'div', 'qm-local-video__status');
  status.setAttribute('role', 'status');
  card.append(title, status, staticLabel(doc, t, name, 'qm-local-video__print', online));
  if (!enabled || !reference || !documentPath || (!online && (typeof bridge?.beginLocalVideo !== 'function' ||
      typeof bridge?.endLocalVideo !== 'function'))) {
    status.textContent = t('localVideoUnsupported');
    return card;
  }

  const stage = textElement(doc, 'div', 'qm-local-video__stage');
  stage.hidden = true;
  const controls = textElement(doc, 'div', 'qm-local-video__controls');
  const load = textElement(doc, 'button', 'qm-local-video__action', t(key('Load')));
  const close = textElement(doc, 'button', 'qm-local-video__action', t('localVideoClose'));
  const external = textElement(doc, 'button', 'qm-local-video__action', t(key('OpenExternally')));
  for (const button of [load, close, external]) button.type = 'button';
  close.hidden = true;
  external.hidden = typeof (online ? bridge?.openExternal : bridge?.openLocalVideoExternally) !== 'function';
  controls.append(load, close, external);
  const seekNotice = online ? textElement(doc, 'span', 'qm-local-video__notice', t('networkVideoSeekLimited')) : null;
  if (seekNotice) {
    seekNotice.hidden = true;
    seekNotice.setAttribute('role', 'status');
    controls.append(textElement(doc, 'span', 'qm-local-video__notice', t('networkVideoNotice')), seekNotice);
  }
  card.append(stage, controls);

  let generation = 0, url = '', player, activeRoot, disposed = false;
  const end = value => { if (!online && value) void Promise.resolve().then(() => bridge.endLocalVideo(value)).catch(() => {}); };
  const clear = () => {
    generation++;
    if (activeRoot && activeCards.get(activeRoot) === stop) activeCards.delete(activeRoot);
    activeRoot = undefined;
    if (player) {
      const oldPlayer = player;
      player = undefined;
      oldPlayer.pause();
      oldPlayer.removeAttribute('src');
      oldPlayer.load();
      oldPlayer.remove();
    }
    end(url);
    url = '';
    stage.hidden = true;
    load.hidden = false;
    load.disabled = false;
    close.hidden = true;
    if (seekNotice) seekNotice.hidden = true;
  };
  const stop = () => { clear(); status.textContent = ''; };
  const authorizedAction = async (action, current) => {
    try { return await action(documentPath, reference); }
    catch (error) {
      // An absolute reference can survive an app restart, while a deliberate
      // outside-folder grant must not. The native picker grants the file that
      // the user actually selects; retry the original reference only once.
      if (!current() || !String(error?.message || error).includes('LOCAL_VIDEO_NOT_AUTHORIZED') ||
          typeof bridge.selectLocalVideo !== 'function') throw error;
      status.textContent = t('localVideoAuthorize');
      const file = await bridge.selectLocalVideo(documentPath);
      if (!current() || !file?.reference) throw error;
      return action(documentPath, reference);
    }
  };
  records.set(card, {
    documentPath, session, reference, online,
    active: () => !disposed && (load.disabled || Boolean(url)),
    dispose() { disposed = true; stop(); }
  });
  close.addEventListener('click', event => {
    if (!event.isTrusted) return;
    stop();
    load.focus({ preventScroll: true });
  });
  load.addEventListener('click', async event => {
    if (!event.isTrusted || disposed || load.disabled || url || !card.isConnected) return;
    // The split preview is nested inside the editing workspace. Use the
    // workspace first so the split and inline cards cannot play over each other.
    const root = card.closest('#editorView') || card.closest('#editorPreviewContent, #markdownContent') || card.parentElement;
    if (root) {
      activeCards.get(root)?.();
      activeCards.set(root, stop);
      activeRoot = root;
    }
    const ticket = ++generation;
    load.disabled = true;
    close.hidden = false;
    status.textContent = t(key('Loading'));
    try {
      const authorized = online ? reference : streamURL(await authorizedAction(bridge.beginLocalVideo,
        () => !disposed && card.isConnected && generation === ticket));
      if (disposed || !card.isConnected || generation !== ticket) { end(authorized); return; }
      if (!authorized) throw new Error('LOCAL_VIDEO_UNAVAILABLE');
      if (!online && !authorized.endsWith(localVideoSuffix.exec(decodeURIComponent(reference))?.[0].toLowerCase())) {
        end(authorized);
        throw new Error('LOCAL_VIDEO_UNAVAILABLE');
      }
      url = authorized;
      const video = textElement(doc, 'video', 'qm-local-video__player');
      player = video;
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.setAttribute('aria-label', name || t(key('Label')));
      video.addEventListener('loadedmetadata', () => {
        if (player === video && generation === ticket) status.textContent = '';
      }, { once: true });
      if (seekNotice) {
        const lastEnd = ranges => ranges.length ? ranges.end(ranges.length - 1) : 0;
        const updateSeekability = () => {
          if (player !== video || generation !== ticket) return;
          const { duration, buffered, seekable, currentTime, readyState } = video;
          const reached = Math.max(currentTime, lastEnd(buffered));
          // This reports a current media-element limitation, not a verdict
          // about the server. The buffer or seekable region may grow later.
          seekNotice.hidden = readyState < 2 || !Number.isFinite(duration) || duration - reached <= 0.25 ||
            lastEnd(seekable) > reached + 0.25;
        };
        for (const event of ['loadeddata', 'canplay', 'progress', 'durationchange', 'seeked']) {
          video.addEventListener(event, updateSeekability);
        }
      }
      video.addEventListener('error', () => {
        if (player !== video || generation !== ticket) return;
        clear();
        status.textContent = t(key('Unavailable'));
      }, { once: true });
      stage.replaceChildren(video);
      stage.hidden = false;
      load.hidden = true;
      video.src = authorized;
      // This is a continuation of the user's trusted click, not autoplay on
      // opening a document. Some WebViews expire transient activation during
      // the native bridge call; in that case the native Play button still works.
      try { void Promise.resolve(video.play()).catch(() => {}); }
      catch { /* The manual controls remain available. */ }
    } catch {
      if (disposed || generation !== ticket) return;
      clear();
      status.textContent = t(key('Unavailable'));
    }
  });
  external.addEventListener('click', async event => {
    if (!event.isTrusted || disposed || external.hidden || external.disabled) return;
    external.disabled = true;
    try {
      if (online) await bridge.openExternal(reference);
      else await authorizedAction(bridge.openLocalVideoExternally, () => !disposed && card.isConnected);
      if (!disposed && card.isConnected) status.textContent = '';
    }
    catch { if (!disposed && card.isConnected) status.textContent = t(key('ExternalFailed')); }
    finally { if (!disposed) external.disabled = false; }
  });
  return card;
}

// Shared by rendered document HTML and standalone live-editor blocks. Only
// the validated reference is used; the card never adopts authored DOM.
export function createDocumentVideoCard(doc, source, options) {
  const network = parseNetworkVideoReference(source);
  const reference = network || parseLocalVideoReference(source);
  return makeVideoCard(doc, reference, options,
    network ? parsePublicHTTPS(network).host : leafName(reference), Boolean(network));
}

// Called before mounting, with the application's existing sanitized HTML
// parsed in an inert template. *No* authored video or audio reaches the DOM.
export function prepareDocumentVideos(fragment, options) {
  const doc = fragment.ownerDocument;
  fragment.querySelectorAll('audio, track').forEach(node => node.remove());
  for (const video of fragment.querySelectorAll('video')) {
    if (!fragment.contains(video)) continue;
    const card = createDocumentVideoCard(doc, video.getAttribute('src'), options);
    placeSourceAnchor(video, card);
    // An HTML template can treat malformed or self-closing nested <video />
    // as an open element. Preserve subsequent ordinary prose, but never
    // synthesize media from fallback <source> markup in the first phase.
    video.replaceWith(card, inertVideoFallback(doc, video));
  }
  return fragment;
}

export function releaseLocalVideos(container, { except } = {}) {
  for (const card of container?.querySelectorAll(cardSelector) || []) {
    if (card === except) continue;
    records.get(card)?.dispose();
    records.delete(card);
  }
}

export function getActiveDocumentVideo(container) {
  return [...(container?.querySelectorAll(cardSelector) || [])].find(card => records.get(card)?.active()) || null;
}

export function findRetainedVideoCard(container, fragment) {
  const current = getActiveDocumentVideo(container);
  const old = current && records.get(current);
  if (!old || old.session == null) return null;
  const matching = root => [...root.querySelectorAll(cardSelector)].filter(card => {
    const candidate = records.get(card);
    return candidate && candidate.documentPath === old.documentPath && candidate.session === old.session &&
      candidate.online === old.online && candidate.reference === old.reference;
  });
  const previous = matching(container), next = matching(fragment);
  // The nth instance is stable across surrounding text edits. Removal,
  // insertion or ambiguity in duplicates cannot pick a different player.
  if (previous.length !== next.length) return null;
  const candidate = next[previous.indexOf(current)];
  return candidate ? { current, next: candidate } : null;
}

// Call on the cloned export DOM. No media node, token, or host filesystem
// path may survive; show only the presentation label and filename.
export function flattenDocumentVideos(container, t) {
  const doc = container.ownerDocument;
  for (const node of container.querySelectorAll(`${cardSelector}, video, audio, track`)) {
    if (!container.contains(node)) continue;
    if (node.matches('audio, track')) { node.remove(); continue; }
    const card = node.matches(cardSelector);
    const reference = card ? '' : parseNetworkVideoReference(node.getAttribute('src'));
    const online = card ? node.classList.contains('qm-local-video--network') : Boolean(reference);
    let name = card ? node.querySelector('.qm-local-video__title')?.textContent
      : online ? parsePublicHTTPS(reference).host : leafName(parseLocalVideoReference(node.getAttribute('src')));
    // Do not trust a Markdown-authored card lookalike in an export DOM.
    if (online && !dnsHost.test(name || '')) name = '';
    if (!online && name === t('localVideoLabel')) name = '';
    node.replaceWith(staticLabel(doc, t, name, undefined, online));
  }
  return container;
}
