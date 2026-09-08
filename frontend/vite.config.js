import { defineConfig } from 'vite';
import { woff2OnlyKaTeX } from './scripts/katex-fonts.mjs';

export default defineConfig({
  plugins: [{
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/katex\/dist\/katex(?:\.min)?\.css$/.test(id.replaceAll('\\', '/'))) return null;
      return { code: woff2OnlyKaTeX(code), map: null };
    },
  }],
});
