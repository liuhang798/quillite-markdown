export const LARGE_DOCUMENT_CHARS = 100_000;
export const VERY_LARGE_DOCUMENT_CHARS = 300_000;

export function documentPerformanceProfile(length, hasDiagrams = false) {
  const size = Math.max(0, Number(length) || 0);
  if (size >= VERY_LARGE_DOCUMENT_CHARS) {
    return {
      level: 'very-large',
      previewDelay: hasDiagrams ? 900 : 700,
      recoveryDelay: 2200,
      liveSpellcheck: false,
      deferContentSync: true,
      idlePreview: true
    };
  }
  if (size >= LARGE_DOCUMENT_CHARS) {
    return {
      level: 'large',
      previewDelay: hasDiagrams ? 520 : 360,
      recoveryDelay: 1800,
      liveSpellcheck: false,
      deferContentSync: true,
      idlePreview: true
    };
  }
  return {
    level: 'normal',
    previewDelay: hasDiagrams ? 220 : 90,
    recoveryDelay: 1200,
    liveSpellcheck: true,
    deferContentSync: false,
    idlePreview: false
  };
}

export function documentHasDiagrams(content) {
  return /(^|\n)\s*```(?:mermaid|echarts)\s*(\n|$)/i.test(String(content || ''));
}

// Preserve the reading-time convention (one CJK character or alphanumeric run
// is one word), without allocating a document-sized replacement and match arrays.
export function documentWordCount(content) {
  let words = 0;
  const cjk = /[\u3400-\u9fff\uf900-\ufaff]/;
  for (const match of content.matchAll(/[\u3400-\u9fff\uf900-\ufaff\p{L}\p{N}]+/gu)) {
    const word = match[0];
    // Long Latin/base64 runs need no per-character JavaScript work.
    if (!cjk.test(word)) { words++; continue; }
    let inWord = false;
    for (let i = 0; i < word.length; i++) {
      const point = word.charCodeAt(i);
      if (point >= 0x3400 && point <= 0x9fff || point >= 0xf900 && point <= 0xfaff) {
        words++; inWord = false;
      } else if (!inWord) {
        words++; inWord = true;
      }
    }
  }
  return words;
}
