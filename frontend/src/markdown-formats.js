import { markdownParser } from './markdown-parser.js';
import { frontmatterRange } from './frontmatter.js';
import { scanMarkdownFormulas } from './formula-editing.js';

const footnoteDefinitionPattern = /^\[\^([^\]]+)\]:[ \t]*(.*)$/;

function replaceReferencesOutsideInlineCode(line, replaceReference) {
  // Code is excluded by parser ranges below, including multi-line/backtick
  // runs. Odd backslash counts escape a reference; pairs remain literal slashes.
  return line.replace(/\[\^([^\]]+)\]/g,(raw,label,index)=>{
    let escapes=0;for(let i=index-1;i>=0&&line[i]==='\\';i--)escapes++;
    return escapes%2?raw:replaceReference(raw,label,index);
  });
}

export function prepareFootnotes(source, inherited = null) {
  source = String(source);
  if(!source.includes('[^'))return {source,markdown:source,notes:[],lineMap:null,references:[],definitions:new Map()};
  const lines = source.split('\n'), offsets = [];
  let offset = 0;
  for (const line of lines) { offsets.push(offset); offset += line.length + 1; }
  const protectedRanges = scanMarkdownFormulas(source);
  const metadata = frontmatterRange(source);
  if (metadata) protectedRanges.push(metadata);
  // Footnote syntax is not a CommonMark reference link. Mask just that token
  // when finding protected structures, so it cannot steal an enclosing link.
  const structure=source.replace(/\[\^[^\]\r\n]+\]/g,raw=>'x'.repeat(raw.length));
  markdownParser.parse(structure).iterate({enter(node) {
    if (['FencedCode','CodeBlock','InlineCode','HTMLTag','HTMLBlock','Image','Link','URL','LinkTitle'].includes(node.name)) {
      protectedRanges.push({from:node.from,to:node.to}); return false;
    }
  }});
  const protectedAt = (from,to) => protectedRanges.some(range => from < range.to && to > range.from);
  const definitions = new Map();
  const definitionRanges = new Map(), references = [];
  const contentLines = [];
  const lineMap = []; // 处理后第 n 行（0-based）对应源文档第 lineMap[n] 行（0-based）；定义行被移除
  for (let sourceIndex = 0; sourceIndex < lines.length; sourceIndex++) {
    const line = lines[sourceIndex];
    const definition = !protectedAt(offsets[sourceIndex],offsets[sourceIndex]+1) && line.match(footnoteDefinitionPattern);
    if (definition) {
      const from = offsets[sourceIndex], bodyFrom = from + line.length - definition[2].length;
      const noteLines = [definition[2].trim()];
      // Markdown footnote continuations belong to the definition, never to
      // an unrelated code block in the document body. Blank lines are included
      // only when followed by another indented continuation.
      while (sourceIndex + 1 < lines.length) {
        const next = lines[sourceIndex + 1];
        if (/^(?: {4}|\t)/.test(next)) { noteLines.push(next.replace(/^(?: {4}|\t)/, '')); sourceIndex++; }
        else if (!next.trim() && /^(?: {4}|\t)/.test(lines[sourceIndex + 2] || '')) { noteLines.push(''); sourceIndex++; }
        else break;
      }
      definitions.set(definition[1], noteLines.join('\n').trim());
      definitionRanges.set(definition[1], {label:definition[1],from,to:offsets[sourceIndex]+lines[sourceIndex].length,bodyFrom,text:noteLines.join('\n').trim()});
      continue;
    }
    contentLines.push(line);
    lineMap.push(sourceIndex);
  }

  if (!definitions.size && !inherited?.size) return { source, markdown: source, notes: [], lineMap: null, references, definitions: definitionRanges };

  const numbers = new Map();
  const referenceCounts = new Map();
  const referencedLabels = [];
  const markdown = contentLines.map((line,lineIndex) => {
    return replaceReferencesOutsideInlineCode(line, (raw, label, index) => {
      const from = offsets[lineMap[lineIndex]]+index, to = from+raw.length;
      if ((!definitions.has(label) && !inherited?.has(label)) || protectedAt(from,to)) return raw;
      if (!numbers.has(label)) {
        numbers.set(label, inherited?.get(label)?.number ?? numbers.size + 1);
        referencedLabels.push(label);
      }
      const number = numbers.get(label);
      const count = (referenceCounts.get(label) || 0) + 1;
      referenceCounts.set(label, count);
      references.push({from,to,label,number,text:definitions.get(label) ?? inherited?.get(label)?.text,raw});
      return `<sup class="footnote-ref"><a id="fnref-${number}-${count}" href="#fn-${number}">${number}</a></sup>`;
    });
  }).join('\n');

  const unreferencedLabels = [...definitions.keys()].filter(label => !numbers.has(label));
  for (const label of unreferencedLabels) {
    numbers.set(label, numbers.size + 1);
    referencedLabels.push(label);
  }

  return {
    source, markdown,
    notes: referencedLabels.filter(label => definitions.has(label)).map(label => ({
      number: numbers.get(label),
      text: definitions.get(label),
      referenceCount: referenceCounts.get(label) || 0
    })),
    lineMap, references,
    definitions: new Map([...definitionRanges].map(([label,value]) => [label,{...value,number:numbers.get(label)}]))
  };
}

export function renderFootnoteSection(notes, parseContent, label) {
  if (!notes.length) return '';
  const items = notes.map(note => {
    const backlinks = Array.from({ length: note.referenceCount }, (_, index) =>
      `<a class="footnote-backref" href="#fnref-${note.number}-${index + 1}" aria-label="${label} ${note.number}">↩</a>`
    ).join(' ');
    return `<li id="fn-${note.number}">${parseContent(note.text)}${backlinks ? ` ${backlinks}` : ''}</li>`;
  }).join('');
  return `<section class="footnotes" aria-label="${label}"><hr><ol>${items}</ol></section>`;
}

export const highlightExtension = {
  name: 'highlight',
  level: 'inline',
  start(source) {
    return source.indexOf('==');
  },
  tokenizer(source) {
    const match = /^==(?=\S)([\s\S]*?\S)==/.exec(source);
    if (!match) return undefined;
    return {
      type: 'highlight',
      raw: match[0],
      text: match[1],
      tokens: this.lexer.inlineTokens(match[1])
    };
  },
  renderer(token) {
    return `<mark class="markdown-highlight">${this.parser.parseInline(token.tokens)}</mark>`;
  }
};

export function nextFootnoteNumber(source) {
  let maximum = 0;
  for (const match of String(source).matchAll(/\[\^(\d+)\]/g)) maximum = Math.max(maximum, Number(match[1]));
  return maximum + 1;
}

export function escapeMarkdownText(value) {
  return String(value).replace(/([\\`*_[\]{}()#+\-.!>|])/g, '\\$1');
}
