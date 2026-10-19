const TEXT_COLOR_HUES = [
  { id: 'red', zh: '红色', en: 'Red', hue: 0 },
  { id: 'orange', zh: '橙色', en: 'Orange', hue: 28 },
  { id: 'yellow', zh: '黄色', en: 'Yellow', hue: 48 },
  { id: 'green', zh: '绿色', en: 'Green', hue: 138 },
  { id: 'cyan', zh: '青色', en: 'Cyan', hue: 180 },
  { id: 'blue', zh: '蓝色', en: 'Blue', hue: 215 },
  { id: 'purple', zh: '紫色', en: 'Purple', hue: 270 },
  { id: 'pink', zh: '粉色', en: 'Pink', hue: 326 }
];

const TEXT_COLOR_LIGHTNESS = [24, 34, 44, 56, 70];

const neutralColors = [
  { id: 'neutral-1', value: '#111827', zh: '墨黑', en: 'Ink black' },
  { id: 'neutral-2', value: '#374151', zh: '深灰', en: 'Dark gray' },
  { id: 'neutral-3', value: '#6b7280', zh: '中灰', en: 'Gray' },
  { id: 'neutral-4', value: '#9ca3af', zh: '银灰', en: 'Silver gray' },
  { id: 'neutral-5', value: '#cbd5e1', zh: '浅灰', en: 'Light gray' },
  { id: 'neutral-6', value: '#e5e7eb', zh: '雾灰', en: 'Mist gray' },
  { id: 'neutral-7', value: '#f3f4f6', zh: '近白', en: 'Off white' }
];

const spectrumColors = TEXT_COLOR_LIGHTNESS.flatMap((lightness, rowIndex) =>
  TEXT_COLOR_HUES.map(color => ({
    id: `spectrum-${rowIndex + 1}-${color.id}`,
    value: `hsl(${color.hue} 76% ${lightness}%)`,
    zh: `${color.zh} ${rowIndex + 1}`,
    en: `${color.en} ${rowIndex + 1}`
  }))
);

// 47 个动态色块，加上 HTML 中的“默认颜色”后恰好组成 8 × 6 完整色板。
export const TEXT_COLOR_PALETTE = [...neutralColors, ...spectrumColors];

// 兼容 2.4.4 及更早版本已经写入 Markdown 的颜色名称。
export const LEGACY_TEXT_COLORS = new Map([
  ['red', 'var(--md-color-red)'],
  ['orange', 'var(--md-color-orange)'],
  ['amber', 'var(--md-color-amber)'],
  ['green', 'var(--md-color-green)'],
  ['blue', 'var(--md-color-blue)'],
  ['purple', 'var(--md-color-purple)'],
  ['gray', 'var(--md-color-gray)']
]);

export const TEXT_COLOR_BY_ID = new Map([
  ...TEXT_COLOR_PALETTE.map(color => [color.id, color.value]),
  ...LEGACY_TEXT_COLORS
]);

export const TEXT_COLOR_VALUES = new Set(['default', ...TEXT_COLOR_BY_ID.keys()]);

export function textColorValue(color) {
  return color === 'default' ? 'var(--text)' : TEXT_COLOR_BY_ID.get(color) || null;
}

// Match balanced span tags, not a lazy regex that stops at a nested close tag.
// Only the product's palette or legacy hex-color syntax may become a style.
export function scanTextColorSpans(source, offset = 0) {
  const stack = [], spans = [];
  for (const match of source.matchAll(/<\/?span\b[^>\n]*>/gi)) {
    const tag = match[0];
    if (/^<\/span\s*>$/i.test(tag)) {
      const open = stack.pop();
      if (open?.color) spans.push({ from: offset + open.from, to: offset + match.index + tag.length,
        openLength: open.length, closeLength: tag.length, color: open.color });
    } else if (/^<span\b/i.test(tag)) {
      const named = tag.match(/^<span\s+data-md-color=(["'])([^"']+)\1\s*>$/i);
      const legacy = tag.match(/^<span\s+style=(["'])color:\s*(#[\da-f]{3,8})\s*;?\1\s*>$/i);
      stack.push({ from: match.index, length: tag.length, color: named ? textColorValue(named[2]) : legacy?.[2] || null });
    }
  }
  return spans.sort((a, b) => a.from - b.from || b.to - a.to);
}
