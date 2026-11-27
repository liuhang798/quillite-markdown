// Pure tokenizers shared by reading, source-range mapping and the translation worker.
import { mathBlockStart } from './markdown-performance.js';
import { escapedAt, isInlineDollarOpen, isInlineDollarClose } from './math-delimiters.js';

const blockDelimiters = [
  {
    start: '$$',
    multiline: /^ {0,3}\$\$[ \t]*\n([\s\S]*?)\n {0,3}\$\$[ \t]*(?:\n|$)/,
    singleline: /^ {0,3}\$\$(?!\$)([^\n]*?)(?<!\\)\$\$[ \t]*(?:\n|$)/,
  },
  {
    start: '\\[',
    multiline: /^ {0,3}\\\[[ \t]*\n([\s\S]*?)\n {0,3}\\\][ \t]*(?:\n|$)/,
    singleline: /^ {0,3}\\\[([^\n]*?)\\\][ \t]*(?:\n|$)/,
  },
];

function inlineDollarMatch(source) {
  if (!isInlineDollarOpen(source, 0)) return undefined;
  for (let index = 1; index < source.length && source[index] !== '\n'; index++) {
    if (isInlineDollarClose(source, index)) return { raw: source.slice(0, index + 1), text: source.slice(1, index) };
    // An opening-only dollar (e.g. after "$10 and ") starts its own formula.
    if (isInlineDollarOpen(source, index)) return undefined;
  }
  return undefined;
}

function inlineLatexDelimiterMatch(source) {
  if (!source.startsWith('\\(')) return undefined;
  for (let index = 2; index < source.length && source[index] !== '\n'; index++) {
    if (source[index] === '\\' && source[index + 1] === ')' && !escapedAt(source, index)) {
      return { raw: source.slice(0, index + 2), text: source.slice(2, index) };
    }
  }
  return undefined;
}

function firstUnescapedInlineDelimiter(source) {
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '$' && !escapedAt(source, index) && source[index + 1] !== '$') return index;
    if (source[index] === '\\' && source[index + 1] === '(' && !escapedAt(source, index)) return index;
  }
  return -1;
}

export const mathBlockSyntax = {
  name: 'mathBlock',
  level: 'block',
  start: mathBlockStart,
  tokenizer(source) {
    // WebKit can flatten the entire remaining string even for an anchored
    // regexp mismatch. Reject ordinary paragraphs using a bounded prefix.
    if (!/^ {0,3}(?:\$\$|\\\[)/.test(source.slice(0, 5))) return undefined;
    for (const delimiter of blockDelimiters) {
      const match = delimiter.multiline.exec(source) || delimiter.singleline.exec(source);
      if (!match) continue;
      return { type: 'mathBlock', raw: match[0], text: match[1] };
    }
    return undefined;
  },
};

export const mathInlineSyntax = {
  name: 'mathInline',
  level: 'inline',
  start(source) {
    const index = firstUnescapedInlineDelimiter(source);
    return index >= 0 ? index : undefined;
  },
  tokenizer(source) {
    const match = inlineDollarMatch(source) || inlineLatexDelimiterMatch(source);
    if (!match) return undefined;
    return { type: 'mathInline', raw: match.raw, text: match.text };
  },
};
