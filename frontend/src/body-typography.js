const CHINESE_FONTS = new Set(['sans', 'songti', 'kaiti', 'rounded', 'mono']);
const ENGLISH_FONTS = new Set(['arial', 'georgia', 'times', 'verdana', 'mono']);
const FORMULA_SCALES = { small: 1.08, standard: 1.21, large: 1.35 };
const LINE_SPACING = { compact: 1.5, standard: 1.86, relaxed: 2, loose: 2.25 };

// Persist font pairs rather than display labels, preserving previous preferences.
export const BODY_STYLES = Object.freeze([
  ['default', 'follow', 'follow'], ['modern', 'sans', 'arial'],
  ['clear', 'sans', 'verdana'], ['book', 'songti', 'georgia'],
  ['classic', 'songti', 'times'], ['literary', 'kaiti', 'georgia'],
  ['handwritten', 'kaiti', 'times'], ['gentle', 'rounded', 'verdana'],
  ['magazine', 'rounded', 'arial'], ['technical', 'sans', 'mono'],
  ['mono', 'mono', 'mono']
].map(Object.freeze));

export function bodyStyleFor(input) {
  const value = normalizeBodyTypography(input);
  return BODY_STYLES.find(([, chinese, english]) => chinese === value.chineseFont && english === value.englishFont)?.[0] || 'legacy';
}

export function typographyForStyle(style, formulaSize, previous) {
  const pair = BODY_STYLES.find(([id]) => id === style);
  if (!pair) return normalizeBodyTypography({ ...previous, formulaSize });
  return normalizeBodyTypography({ ...previous, chineseFont: pair[1], englishFont: pair[2], formulaSize });
}

export function normalizeBodyTypography(input) {
  const value = input && typeof input === 'object' ? input : {};
  const preset = item => typeof item === 'string' ? item.trim().toLowerCase() : '';
  const chinese = preset(value.chineseFont);
  const english = preset(value.englishFont);
  const formula = preset(value.formulaSize);
  const spacing = preset(value.lineSpacing);
  return {
    chineseFont: CHINESE_FONTS.has(chinese) ? chinese : 'follow',
    englishFont: ENGLISH_FONTS.has(english) ? english : 'follow',
    formulaSize: Object.hasOwn(FORMULA_SCALES, formula) ? formula : 'standard',
    lineSpacing: Object.hasOwn(LINE_SPACING, spacing) ? spacing : 'standard'
  };
}

export function readBodyTypography(storage) {
  try { return normalizeBodyTypography(JSON.parse(storage.getItem('bodyTypography'))); }
  catch { return normalizeBodyTypography(); }
}

export function bodyTypographyStyles(input) {
  const value = normalizeBodyTypography(input);
  const fonts = [];
  if (value.chineseFont !== 'follow') fonts.push(`"Quillite Chinese ${value.chineseFont}"`);
  if (value.englishFont !== 'follow') fonts.push(`"Quillite English ${value.englishFont}"`);
  fonts.push('var(--app-font-family)');
  return { fontFamily: fonts.join(', '), formulaScale: FORMULA_SCALES[value.formulaSize], lineHeight: LINE_SPACING[value.lineSpacing] };
}

// Only presentation changes: keep EditorState, text, selection and history untouched.
export function applyBodyTypography(input, style, editor) {
  const styles = bodyTypographyStyles(input);
  style.setProperty('--body-font-family', styles.fontFamily);
  style.setProperty('--math-font-scale', styles.formulaScale);
  style.setProperty('--body-line-height', styles.lineHeight);
  editor?.requestMeasure();
}
