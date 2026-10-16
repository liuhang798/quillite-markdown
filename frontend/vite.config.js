import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { woff2OnlyKaTeX } from './scripts/katex-fonts.mjs';
import { patchMathliveMatrixHistory } from './scripts/mathlive-matrix-history.mjs';

export default defineConfig({
  resolve: { alias: [{ find: /^mathlive$/, replacement: fileURLToPath(new URL('./node_modules/mathlive/mathlive.mjs', import.meta.url)) }] },
  optimizeDeps: { exclude: ['mathlive'] },
  plugins: [{
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/katex\/dist\/katex(?:\.min)?\.css$/.test(id.replaceAll('\\', '/'))) return null;
      return { code: woff2OnlyKaTeX(code), map: null };
    },
  }, {
    name: 'mathlive-matrix-history',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/mathlive\/mathlive\.mjs(?:\?.*)?$/.test(id.replaceAll('\\', '/'))) return null;
      return { code: patchMathliveMatrixHistory(code), map: null };
    },
  }],
});
