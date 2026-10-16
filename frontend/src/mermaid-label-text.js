// Keep labels as text. Decoding never inserts HTML or interprets tags, and is
// deliberately single-pass so a literal "&#34;" is not decoded twice.
export function decodeMermaidTextEntities(value) {
  return String(value).replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu, (original, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    if (!entity.startsWith('#')) return original;
    const hexadecimal = /^#x/iu.test(entity);
    const code = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : original;
  });
}

export function encodeMindmapLabel(value) {
  // Mermaid syntax and inline Markdown must not consume literal punctuation.
  // Escape '#' too, so text resembling an entity is stable on every round trip.
  return String(value ?? '').replace(/[()[\]{}"`<>#&%:*_~\\\r\n\t]/gu, character => `#${character.codePointAt(0)};`)
    .replace(/^ +| +$/gu, spaces => '#32;'.repeat(spaces.length))
    .replace(/^mindmap\b/iu, word => `#${word.codePointAt(0)};${word.slice(1)}`);
}

export function decodeMindmapLabel(value) {
  return String(value).replace(/#(\w+);/gu, (original, entity) => {
    const html = `&${/^\d+$/u.test(entity) ? '#' : ''}${entity};`;
    const decoded = decodeMermaidTextEntities(html);
    return decoded === html ? original : decoded;
  });
}
