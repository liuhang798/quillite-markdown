// Each physical line gets a complete code span. A single wide delimiter
// around several lines can instead become a fenced block at a line start.
export function inlineCodeLines(body, minimum = 1) {
  let from = 0;
  return body.split('\n').map(text => {
    let length = minimum;
    for (const run of text.matchAll(/`+/g)) length = Math.max(length, run[0].length + 1);
    const fence = text ? '`'.repeat(length) : '';
    const pad = text.startsWith('`') || text.endsWith('`') || (text.startsWith(' ') && text.endsWith(' ') && /[^ ]/.test(text)) ? ' ' : '';
    const part = {from, to: from + text.length, text, open: fence + pad, close: pad + fence};
    from += text.length + 1;
    return part;
  });
}

export function inlineCodeText(body, minimum = 1, prefixAt = () => '') {
  const parts = inlineCodeLines(body, minimum);
  let text = '';
  for (const part of parts) {
    if (part.from) text += '\n';
    const prefix = prefixAt(part.from, part.text);
    if (prefix) {
      const from = part.from;
      Object.assign(part, inlineCodeLines(part.text.slice(prefix.length), minimum)[0]);
      part.from += from + prefix.length; part.to += from + prefix.length;
      text += prefix;
    }
    part.start = text.length + part.open.length;
    text += part.open + part.text + part.close;
  }
  return {text, position(offset) {
    const part = parts.find(part => offset <= part.to) || parts.at(-1);
    return part.start + Math.max(0, Math.min(offset - part.from, part.text.length));
  }};
}
