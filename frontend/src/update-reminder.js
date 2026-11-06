// Presentation-only release helpers. Update state stays in renderer.state and
// network/install authority stays in the existing desktop bridge.
export const UPDATE_REMINDER_DAY = 24 * 60 * 60 * 1000;

export function updateReminderUntil(value) {
  const time = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time > 0 ? time : 0;
}

export function updateReminderSuppressed(until, now = Date.now()) {
  return updateReminderUntil(until) > now;
}

export function updateReminderText(value, limit = 180) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/gu, ' ').trim();
  const characters = Array.from(text);
  return characters.length > limit ? characters.slice(0, limit).join('') + '…' : text;
}

export function updateReleaseSummary(info, language, fallback = '') {
  const primary = language === 'en' ? info?.summaryEn : info?.summaryZh;
  const other = language === 'en' ? info?.summaryZh : info?.summaryEn;
  return updateReminderText(primary) || updateReminderText(info?.summary) || updateReminderText(other) || fallback;
}

export function updateReleaseNotes(value, limit = 5000) {
  const characters = Array.from(typeof value === 'string' ? value : '');
  return {notes: characters.slice(0, limit).join(''), notesTruncated: characters.length > limit};
}

function versionParts(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const version = value.trim().replace(/^[vV]/, '');
  if (!/^\d+(?:\.\d+){0,3}(?:[-+][a-zA-Z\d.-]+)?$/.test(version)) return null;
  const parts = version.split(/[-+]/, 1)[0].split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? {version, parts} : null;
}

function compareParts(left, right) {
  for (let i = 0; i < 4; i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return difference;
  }
  return 0;
}

export function updateReleaseHistory(info, language) {
  if (!Array.isArray(info?.updates)) return [];
  const current = versionParts(info.currentVersion);
  const latest = versionParts(info.latestVersion);
  const seen = new Set();
  const entries = [];
  for (const entry of info.updates.slice(0, 96)) {
    const parsed = versionParts(entry?.version);
    if (!parsed || parsed.version.split('+', 1)[0].includes('-') || (current && compareParts(parsed.parts, current.parts) <= 0)
        || (latest && compareParts(parsed.parts, latest.parts) > 0)) continue;
    const identity = parsed.version;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const primary = language === 'en' ? entry.notesEn : entry.notesZh;
    const secondary = language === 'en' ? entry.notesZh : entry.notesEn;
    const notes = typeof primary === 'string' && primary.trim() ? primary : secondary;
    const bounded = updateReleaseNotes(notes);
    entries.push({version: parsed.version, parts: parsed.parts, summary: updateReleaseSummary(entry, language),
      notes: bounded.notes, notesTruncated: entry.notesTruncated === true || bounded.notesTruncated});
  }
  return entries.sort((left, right) => compareParts(right.parts, left.parts)).slice(0, 12);
}

export function updateReleaseCount(info) {
  return Number.isSafeInteger(info?.updateCount) && info.updateCount > 0 ? info.updateCount : 0;
}
