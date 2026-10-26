// Resolve document links against the document file, never the WebView origin.
const controls = /[\x00-\x1f\x7f]/;
const drive = /^[a-z]:\//i;
function fileURL(path) {
  const normalized = String(path || '').replaceAll('\\', '/');
  if ((!drive.test(normalized) && !normalized.startsWith('/')) || normalized.startsWith('//')) return null;
  return new URL('file://' + (drive.test(normalized) ? '/' : '') + normalized.split('/').map(encodeURIComponent).join('/').replace(/^([a-z])%3A/i, '$1:'));
}

export function resolveDocumentLink(value, currentPath) {
  const unsupported = { kind: 'unsupported' };
  if (typeof value !== 'string' || controls.test(value)) return unsupported;
  const raw = value.trim();
  if (!raw) return unsupported;
  try {
    if (raw.startsWith('#')) return { kind: 'anchor', fragment: decodeURIComponent(raw.slice(1)) };
    if (/^(https?:\/\/|mailto:)/i.test(raw)) {
      const url = new URL(raw);
      if (url.hostname.toLowerCase() === 'wails.localhost') return unsupported;
      return { kind: 'external', url: raw };
    }
    const normalized = raw.replaceAll('\\', '/');
    // Do not turn UNC/network paths or arbitrary schemes into local file reads.
    if (normalized.startsWith('//') || (!drive.test(normalized) && /^[a-z][a-z\d+.-]*:/i.test(normalized) && !/^file:/i.test(normalized))) return unsupported;
    const base = fileURL(currentPath);
    let url;
    if (drive.test(normalized)) url = new URL('file:///' + normalized);
    else if (/^file:/i.test(normalized)) url = new URL(normalized);
    else {
      if (!base) return unsupported;
      url = new URL(normalized, base);
    }
    if (url.protocol !== 'file:' || url.host || url.search || url.username || url.password) return unsupported;
    let path = decodeURIComponent(url.pathname);
    const fragment = decodeURIComponent(url.hash.slice(1));
    if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
    if (controls.test(path + fragment) || path.startsWith('//') || path.includes('\\')
      || path.replace(/^[a-z]:/i, '').includes(':') || !/\.(md|markdown|mdown|mkd|txt)$/i.test(path)) return unsupported;
    return { kind: 'document', path, fragment };
  } catch { return unsupported; }
}
