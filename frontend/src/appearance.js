export const ACCENT_THEMES = Object.freeze({
  green: Object.freeze({ zhCN: '清新绿', en: 'Fresh Green', color: '#159A63', logo: new URL('./assets/images/app-logo-green.png', import.meta.url).href }),
  blue: Object.freeze({ zhCN: '晴空蓝', en: 'Clear Blue', color: '#075DF3', logo: new URL('./assets/images/app-logo-blue.png', import.meta.url).href }),
  orange: Object.freeze({ zhCN: '活力橙', en: 'Vivid Orange', color: '#F57C04', logo: new URL('./assets/images/app-logo-orange.png', import.meta.url).href }),
  violet: Object.freeze({ zhCN: '灵动紫', en: 'Vivid Violet', color: '#7940E0', logo: new URL('./assets/images/app-logo-violet.png', import.meta.url).href }),
  coral: Object.freeze({ zhCN: '珊瑚红', en: 'Coral Red', color: '#FC5540', logo: new URL('./assets/images/app-logo-coral.png', import.meta.url).href }),
  cyan: Object.freeze({ zhCN: '湖水蓝', en: 'Lake Cyan', color: '#0789B6', logo: new URL('./assets/images/app-logo-cyan.png', import.meta.url).href }),
  slate: Object.freeze({ zhCN: '雾蓝灰', en: 'Mist Slate', color: '#556477', logo: new URL('./assets/images/app-logo-slate.png', import.meta.url).href }),
  clay: Object.freeze({ zhCN: '陶土棕', en: 'Clay Brown', color: '#A56254', logo: new URL('./assets/images/app-logo-clay.png', import.meta.url).href }),
});

const DEFAULT_APPEARANCE = Object.freeze({ accentTheme: 'green', colorMode: 'light' });

const LEGACY_THEMES = Object.freeze({
  light: DEFAULT_APPEARANCE,
  'classic-light': DEFAULT_APPEARANCE,
  'wechat-green': DEFAULT_APPEARANCE,
  dark: Object.freeze({ accentTheme: 'green', colorMode: 'dark' }),
  'classic-dark': Object.freeze({ accentTheme: 'green', colorMode: 'dark' }),
  'alipay-blue': Object.freeze({ accentTheme: 'blue', colorMode: 'light' }),
  wisteria: Object.freeze({ accentTheme: 'violet', colorMode: 'light' }),
  'amber-paper': Object.freeze({ accentTheme: 'orange', colorMode: 'light' }),
  'deep-ocean': Object.freeze({ accentTheme: 'cyan', colorMode: 'dark' }),
  'amethyst-night': Object.freeze({ accentTheme: 'violet', colorMode: 'dark' }),
});

export function normalizeAccentTheme(value) {
  return Object.hasOwn(ACCENT_THEMES, value) ? value : DEFAULT_APPEARANCE.accentTheme;
}

export function normalizeColorMode(value) {
  return value === 'dark' ? 'dark' : DEFAULT_APPEARANCE.colorMode;
}

export function colorModeFromSystem(prefersDark) {
  return prefersDark ? 'dark' : 'light';
}

export function resolveMacColorMode(prefersDark, temporaryMode = null) {
  return temporaryMode === 'light' || temporaryMode === 'dark'
    ? temporaryMode
    : colorModeFromSystem(prefersDark);
}

export function temporaryMacColorModeAfterToggle(currentMode, prefersDark) {
  const nextMode = normalizeColorMode(currentMode) === 'dark' ? 'light' : 'dark';
  return nextMode === colorModeFromSystem(prefersDark) ? null : nextMode;
}

export function readAppearanceStorage(storage) {
  const savedTheme = storage.getItem('theme');
  const legacy = Object.hasOwn(LEGACY_THEMES, savedTheme) ? LEGACY_THEMES[savedTheme] : DEFAULT_APPEARANCE;
  const savedAccent = storage.getItem('accentTheme');
  const savedMode = storage.getItem('colorMode');
  const appearance = {
    accentTheme: savedAccent === null ? legacy.accentTheme : normalizeAccentTheme(savedAccent),
    colorMode: savedMode === null ? legacy.colorMode : normalizeColorMode(savedMode),
  };

  storage.setItem('accentTheme', appearance.accentTheme);
  storage.setItem('colorMode', appearance.colorMode);
  return appearance;
}
