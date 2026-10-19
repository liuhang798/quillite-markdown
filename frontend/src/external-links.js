// Only the existing web/email schemes are allowed. Never pass relative paths,
// credentials, malformed URLs or control characters to the OS URL handler.
export function normalizeExternalURL(value) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) throw new Error('UNSUPPORTED_URL');
  const raw = value.trim();
  if (!/^(?:https?:\/\/|mailto:)/i.test(raw)) throw new Error('UNSUPPORTED_URL');
  const url = new URL(raw);
  if (url.username || url.password || (url.protocol !== 'mailto:' && !url.hostname)
    || (url.protocol === 'mailto:' && !url.pathname)) throw new Error('UNSUPPORTED_URL');
  return url.href;
}

export async function openExternalSafely(value, open, failed) {
  try { await open(normalizeExternalURL(value)); return true; }
  catch { failed(); return false; }
}
