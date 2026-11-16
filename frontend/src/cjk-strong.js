// A closing ** after punctuation is not right-flanking when followed by a
// letter in CommonMark. Recognize the common Chinese inline case without
// changing the source, normal delimiter grammar, or consuming nested markup.
const bodyPattern = /^\*\*([\p{L}\p{M}\p{N} \t（【《「『〔〈［｛〖〘〚。，、；：！？…()）】》」』〕〉］｝〗〙〛]{0,255}[）】》」』〕〉］｝〗〙〛。，、；：！？…)])\*\*(?=\p{Script=Han})/u;
const han = /\p{Script=Han}/u;
const rawTagPattern = /^<(\/?)\s*(pre|code|kbd|script|style|textarea)(?=\s|>)/i;

function withinRawTag(tags) {
  let raw = null;
  for (const text of tags) {
    const tag = rawTagPattern.exec(text);
    if (!tag) continue;
    const name = tag[2].toLowerCase();
    if (tag[1]) { if (raw === name) raw = null; }
    else if (!raw) raw = name;
  }
  return raw !== null;
}

export function cjkStrongAt(source) {
  const match = bodyPattern.exec(source.slice(0, 262));
  return match && match[0].length <= 260 && !/^\s/u.test(match[1]) && han.test(match[1]) ? { raw: match[0], text: match[1] } : null;
}

export const cjkStrongToken = {
  name: 'cjkStrong',
  level: 'inline',
  tokenizer(source, tokens) {
    if (this.lexer.state.inRawBlock || tokens.at(-1)?.raw.endsWith('*')) return;
    const match = cjkStrongAt(source);
    if (match && !withinRawTag(tokens.filter(token => token.type === 'html').map(token => token.raw))) {
      return { type: 'strong', ...match, tokens: [{ type: 'text', raw: match.text, text: match.text }] };
    }
  },
};

export function cjkStrongSyntax(base) {
  const emphasis = new Set(base.nodeSet.types.filter(node => ['StrongEmphasis', 'Emphasis'].includes(node.name)).map(node => node.id));
  const htmlTag = base.nodeSet.types.find(node => node.name === 'HTMLTag').id;
  const accepted = new WeakMap();
  return { parseInline: [{ name: 'CJKStrong', before: 'Emphasis', parse(cx, next, from) {
    if (next !== 42 || cx.char(from + 1) !== 42 || from > cx.offset && cx.char(from - 1) === 42) return -1;
    const match = cjkStrongAt(cx.slice(from, Math.min(cx.end, from + 262)));
    if (!match) return -1;
    const offset = from - cx.offset;
    // A ** that already closes an earlier standard span is not ours to open.
    // Bound this ambiguity check; long inline sections keep normal behavior.
    if (offset > 8192) return -1;
    const before = accepted.get(cx);
    const prefix = before ? before.text + cx.text.slice(before.end, offset) : cx.text.slice(0, offset);
    if (prefix.includes('*') || prefix.includes('<')) {
      const nodes = base.parseInline(prefix + '**', cx.offset);
      const last = nodes.at(-1);
      if (last?.to === from + 2 && emphasis.has(last.type)) return -1;
      // Inspect actual HTML tokens, not text inside code, comments or another
      // tag's attributes that happens to contain something like "<code>".
      if (withinRawTag(nodes.filter(node => node.type === htmlTag).map(node => cx.slice(node.from, node.to)))) return -1;
    }
    const to = from + match.raw.length;
    // The default parser must not reconsider an earlier compatibility pair
    // as an unmatched opener when two such spans share a paragraph.
    accepted.set(cx, { text: prefix + 'x'.repeat(match.raw.length), end: to - cx.offset });
    return cx.addElement(cx.elt('StrongEmphasis', from, to, [
      cx.elt('EmphasisMark', from, from + 2), cx.elt('EmphasisMark', to - 2, to),
    ]));
  } }] };
}
