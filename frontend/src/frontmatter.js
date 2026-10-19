// Recognise only a closed, document-leading metadata envelope. This is not a
// YAML interpreter: values stay literal, never become HTML, links or formulas.
export function frontmatterRange(source) {
  const opening = /^(?:\uFEFF)?---[\t ]*\r?\n/.exec(source);
  if (!opening) return null;
  const closing = /^(?:---|\.\.\.)[\t ]*\r?$/gm;
  closing.lastIndex = opening[0].length;
  const end = closing.exec(source);
  if (!end) return null;
  const body = source.slice(opening[0].length, end.index);
  const first = body.split(/\r?\n/).find(line => line.trim() && !/^\s*#/.test(line));
  if (!first || !/^(?:[\w.-]+|"[^"\r\n]+"|'[^'\r\n]+')[\t ]*:(?:\s|$)/.test(first)) return null;
  return { from: 0, to: end.index + end[0].length };
}

export function maskFrontmatter(source) {
  const range = frontmatterRange(source);
  return range ? source.slice(0, range.to).replace(/[^\r\n]/g, ' ') + source.slice(range.to) : source;
}

export function frontmatterRenderSource(source) {
  const range = frontmatterRange(source);
  if (!range) return source;
  const literal = source.slice(0, range.to).replace(/^\uFEFF/, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  // Preserve the line count for preview-to-editor navigation.
  return `<pre class="markdown-frontmatter"><code>${literal}</code></pre>` + source.slice(range.to);
}
