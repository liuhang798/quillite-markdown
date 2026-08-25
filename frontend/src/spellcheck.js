import nspell from 'nspell';

export const SPELLCHECK_LANGUAGES = ['auto', 'en-US', 'en-GB'];

export function normalizeSpellcheckLanguage(value) {
  return SPELLCHECK_LANGUAGES.includes(value) ? value : 'auto';
}

export function normalizePersonalWords(words) {
  if (!Array.isArray(words)) return [];
  const unique = new Map();
  for (const value of words) {
    const word = String(value || '').trim().replace(/’/g, "'");
    if (!/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(word)) continue;
    const key = word.toLocaleLowerCase('en');
    if (!unique.has(key)) unique.set(key, word);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
}

export function createSpellChecker(aff, dic, personalWords = []) {
  const checker = nspell(aff, dic);
  for (const word of normalizePersonalWords(personalWords)) checker.add(word);
  return checker;
}

function maskRange(characters, from, to) {
  for (let index = Math.max(0, from); index < Math.min(characters.length, to); index += 1) {
    if (characters[index] !== '\n' && characters[index] !== '\r') characters[index] = ' ';
  }
}

function maskPattern(characters, source, pattern, group = 0) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const value = match[group] || '';
    const offset = group ? match[0].indexOf(value) : 0;
    maskRange(characters, match.index + offset, match.index + offset + value.length);
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
}

// Markdown source contains many non-prose ranges. Masking keeps source offsets
// stable while preventing URLs, code, HTML and formulas from becoming false hits.
export function proseForSpellcheck(markdownSource) {
  const source = String(markdownSource || '');
  const characters = [...source];

  if (/^---\s*(?:\r?\n|$)/.test(source)) {
    const end = source.slice(source.indexOf('\n') + 1).search(/^---\s*$/m);
    if (end >= 0) {
      const contentStart = source.indexOf('\n') + 1;
      const closingStart = contentStart + end;
      const closingEnd = source.indexOf('\n', closingStart);
      maskRange(characters, 0, closingEnd < 0 ? source.length : closingEnd);
    }
  }

  const lines = source.split(/(?<=\n)/);
  let offset = 0;
  let fence = null;
  for (const line of lines) {
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      maskRange(characters, offset, offset + line.length);
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length) fence = null;
    } else if (opening) {
      fence = { character: opening[1][0], length: opening[1].length };
      maskRange(characters, offset, offset + line.length);
    }
    offset += line.length;
  }

  maskPattern(characters, source, /<!--[^]*?-->/g);
  maskPattern(characters, source, /<[^>\n]+>/g);
  maskPattern(characters, source, /`+[^`\n]*`+/g);
  maskPattern(characters, source, /\$\$[^]*?\$\$/g);
  maskPattern(characters, source, /(?<!\\)\$(?!\s)[^$\n]+?(?<!\s)\$/g);
  maskPattern(characters, source, /(?:https?:\/\/|www\.)[^\s<>()]+/gi);
  maskPattern(characters, source, /^ {0,3}\[[^\]\n]+\]:\s+\S+.*$/gm);
  maskPattern(characters, source, /\]\(([^)\s]+)(?:\s+["'][^)]*)?\)/g, 1);
  maskPattern(characters, source, /\]\[([^\]\n]+)\]/g, 1);

  return characters.join('');
}

function shouldSkipWord(word) {
  if (word.length < 3 || word.length > 48) return true;
  if (/^[A-Z]{2,}$/.test(word)) return true;
  if (/[A-Z]/.test(word.slice(1))) return true;
  return false;
}

export function findSpellingErrors(markdownSource, checker, options = {}) {
  if (!checker || typeof checker.correct !== 'function') return [];
  const source = String(markdownSource || '');
  const prose = proseForSpellcheck(source);
  const ignoredWords = options.ignoredWords instanceof Set ? options.ignoredWords : new Set();
  const maxErrors = Number.isFinite(options.maxErrors) ? Math.max(1, options.maxErrors) : 400;
  const errors = [];
  const words = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g;
  let match;
  while ((match = words.exec(prose)) && errors.length < maxErrors) {
    const original = source.slice(match.index, match.index + match[0].length);
    const normalized = original.replace(/’/g, "'");
    if (shouldSkipWord(normalized)) continue;
    if (ignoredWords.has(normalized.toLocaleLowerCase('en'))) continue;
    if (checker.correct(normalized)) continue;
    errors.push({ from: match.index, to: match.index + original.length, word: original });
  }
  return errors;
}
