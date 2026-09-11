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
