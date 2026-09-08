// All supported WebViews support WOFF2. Keep every KaTeX face, but avoid
// embedding the same font in three encodings. This also covers exported CSS.
export function woff2OnlyKaTeX(css) {
  return css.replace(/src:\s*([^;]+);/g, (declaration, sources) => {
    const woff2 = sources.match(/url\([^)]*\.woff2\)\s*format\(["']woff2["']\)/);
    return woff2 ? `src: ${woff2[0]};` : declaration;
  });
}
