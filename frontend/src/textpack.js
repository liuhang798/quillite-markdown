// Pure source transformations: never fetch resources or edit the open document.
// Filesystem/MIME checks and archive limits are enforced again by the backend.
import { documentImageRanges, imageReplacement, MAX_PORTABLE_BYTES } from './portable-images.js';

const encoder = new TextEncoder();
const MAX_IMAGES = 512;
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico']);
const safeLabel = ref => /^data:/i.test(ref) ? '[embedded image]' : String(ref).slice(0, 180);
const warning = (code, reference) => ({ code, reference: safeLabel(reference) });
const isRemote = ref => /^(?:https?:|\/\/)/i.test(ref.trim());
const isEmbedded = ref => /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(ref);

function inspect(source) {
  if (typeof source !== 'string' || source.length > MAX_PORTABLE_BYTES || encoder.encode(source).length > MAX_PORTABLE_BYTES) throw new Error('TEXTPACK_LIMIT');
  let ranges;
  try { ranges = documentImageRanges(source); }
  catch (error) {
    if (String(error.message).includes('PORTABLE_UNSUPPORTED_IMAGE')) throw new Error('TEXTPACK_UNSUPPORTED_IMAGE');
    throw error;
  }
  if (ranges.length > 4096) throw new Error('TEXTPACK_LIMIT');
  // These are not collected as images. Be conservative, even in an example
  // code block: never turn an incomplete resource scan into an offline promise.
  const external = /<(?:style|link|iframe|object|embed|video|audio|svg)\b|\bstyle\s*=|\burl\s*\(/i.test(source);
  return { ranges, external };
}

function replaceImages(source, ranges, resolve) {
  const parts = []; let cursor = 0;
  for (const item of ranges) {
    if (item.from < cursor || item.to < item.from || item.to > source.length) throw new Error('TEXTPACK_INVALID');
    const ref = resolve(item.ref);
    if (ref === null || ref === item.ref) continue;
    parts.push(source.slice(cursor, item.from), imageReplacement(item, ref));
    cursor = item.to;
  }
  parts.push(source.slice(cursor));
  const content = parts.join('');
  if (encoder.encode(content).length > MAX_PORTABLE_BYTES) throw new Error('TEXTPACK_LIMIT');
  return content;
}

function extension(ref) {
  const embedded = /^data:image\/(png|jpeg|gif|webp|bmp|svg\+xml|avif|x-icon)[;,]/i.exec(ref);
  if (embedded) return ({ 'svg+xml': 'svg', 'x-icon': 'ico' })[embedded[1].toLowerCase()] || embedded[1].toLowerCase();
  const ext = /\.([a-z0-9]+)$/i.exec(ref.split(/[?#]/, 1)[0])?.[1]?.toLowerCase();
  return imageExtensions.has(ext) ? ext : 'image';
}

function exportReferenceAllowed(ref) {
  if (isEmbedded(ref)) return true;
  if (!ref || /[\x00-\x1f\x7f]/.test(ref) || /^[\\/]{2}/.test(ref)) return false;
  if (/^file:/i.test(ref)) {
    try { const url = new URL(ref); return !url.host || url.host.toLowerCase() === 'localhost'; } catch { return false; }
  }
  return /^[a-z]:[\\/]/i.test(ref) || !/^[a-z][a-z0-9+.-]*:/i.test(ref);
}

export function prepareTextPackExport(source, {assetDirectory = 'assets'} = {}) {
  if (!/^assets(?:\/[A-Za-z0-9_-]+)*$/.test(assetDirectory)) throw new Error('TEXTPACK_INVALID');
  const { ranges, external } = inspect(source), warnings = [], images = [], cache = new Map();
  let remoteCount = 0, unsupportedCount = external ? 1 : 0;
  if (external) warnings.push(warning('EXTERNAL_RESOURCES', ''));
  const content = replaceImages(source, ranges, ref => {
    if (cache.has(ref)) return cache.get(ref);
    if (cache.size >= MAX_IMAGES) throw new Error('TEXTPACK_LIMIT');
    if (isRemote(ref)) {
      remoteCount++; warnings.push(warning('REMOTE_IMAGE', ref)); cache.set(ref, ref); return ref;
    }
    const target = `${assetDirectory}/image-${String(cache.size + 1).padStart(3, '0')}.${extension(ref)}`;
    if (!exportReferenceAllowed(ref)) {
      unsupportedCount++; warnings.push(warning('UNSAFE_REFERENCE', ref));
    } else images.push({ source: ref, target });
    cache.set(ref, target); return target;
  });
  return { content, images, warnings, remoteCount, missingCount: 0, unsupportedCount };
}

// Resolve only package-relative assets. Never interpret an imported local path
// against the user's computer, even when the original package is incomplete.
function packageAssetPath(ref) {
  if (/[?#\x00-\x1f\x7f\\]/.test(ref) || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('/')) return null;
  let decoded;
  try { decoded = decodeURIComponent(ref); } catch { return null; }
  if (/[%?\\:\x00-\x1f\x7f]/.test(decoded)) return null;
  while (decoded.startsWith('./')) decoded = decoded.slice(2);
  const segments = decoded.split('/');
  if (segments[0] !== 'assets' || segments.length < 2 || segments.some(part => !part || part === '.' || part === '..')) return null;
  return decoded;
}

function encodedAsset(path) { return path.split('/').map(part => encodeURIComponent(part)).join('/'); }

export function prepareTextBundleImport(source, assets = []) {
  const { ranges, external } = inspect(source), warnings = [], available = new Set(assets), cache = new Map();
  let remoteCount = 0, missingCount = 0, unsupportedCount = external ? 1 : 0;
  if (external) warnings.push(warning('EXTERNAL_RESOURCES', ''));
  // Missing placeholders cannot collide with a real imported attachment.
  let missingDirectory = 'assets/quillite-missing';
  const foldedAssets = [...available].map(path => path.toLowerCase());
  for (let index = 1; foldedAssets.some(path => path === missingDirectory || path.startsWith(missingDirectory + '/')); index++) missingDirectory = `assets/quillite-missing-${index}`;
  const content = replaceImages(source, ranges, ref => {
    if (cache.has(ref)) return cache.get(ref);
    if (cache.size >= MAX_IMAGES) throw new Error('TEXTPACK_LIMIT');
    if (isRemote(ref)) { remoteCount++; warnings.push(warning('REMOTE_IMAGE', ref)); cache.set(ref, ref); return ref; }
    // Embedded bytes remain part of Markdown and are never fetched. Only
    // supported raster data URLs are retained; SVG may contain external refs.
    if (/^data:image\/(?:png|jpeg|gif|webp|bmp);base64,[a-z0-9+/=]+$/i.test(ref)) { cache.set(ref, ref); return ref; }
    const path = packageAssetPath(ref);
    if (path && available.has(path)) { const value = encodedAsset(path); cache.set(ref, value); return value; }
    const code = path ? 'MISSING_IMAGE' : 'UNSAFE_REFERENCE';
    missingCount++; if (!path) unsupportedCount++;
    warnings.push(warning(code, ref));
    const value = `${missingDirectory}/image-${String(missingCount).padStart(3, '0')}.${extension(ref)}`;
    cache.set(ref, value); return value;
  });
  return { content, warnings, remoteCount, missingCount, unsupportedCount };
}
