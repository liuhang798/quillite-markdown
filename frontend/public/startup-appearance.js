// Classic, parser-blocking bootstrap. Restore the canvas before either the
// body or the application module can paint; don't wait for native bindings.
// Keep legacy/default handling aligned with src/appearance.js (covered by tests).
(() => {
  const root = document.documentElement;
  let mode = 'light', accent = 'green';
  try {
    const legacy = localStorage.getItem('theme');
    if (['dark', 'classic-dark', 'deep-ocean', 'amethyst-night'].includes(legacy)) mode = 'dark';
    const legacyAccent = {
      'alipay-blue': 'blue', wisteria: 'violet', 'amber-paper': 'orange',
      'deep-ocean': 'cyan', 'amethyst-night': 'violet'
    };
    accent = Object.hasOwn(legacyAccent, legacy) ? legacyAccent[legacy] : 'green';
    const savedMode = localStorage.getItem('colorMode');
    const savedAccent = localStorage.getItem('accentTheme');
    if (savedMode !== null) mode = savedMode === 'dark' ? 'dark' : 'light';
    if (savedAccent !== null) accent = ['green', 'blue', 'orange', 'violet', 'coral', 'cyan', 'slate', 'clay'].includes(savedAccent) ? savedAccent : 'green';
  } catch {
    // Blocked storage must not abort HTML parsing.
  }
  // macOS follows system appearance on launch. A prior temporary toggle must
  // not cause a flash before the runtime restores that same system policy.
  if (/Mac|iPhone|iPad/.test(navigator.platform) && typeof window.matchMedia === 'function') {
    mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.dataset.colorMode = mode;
  root.dataset.accent = accent;
})();
