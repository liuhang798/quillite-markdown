import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpellChecker, findSpellingErrors, normalizePersonalWords, proseForSpellcheck } from '../src/spellcheck.js';

const aff = `SET UTF-8\nTRY esiarntolcdugmphbyfvkwzxjq\n`;
const dic = `9\nhello\nworld\ncolour\ncolor\nmarkdown\ndocument\nvisible\nword\nlink\n`;

test('findSpellingErrors preserves positions and skips Markdown non-prose', () => {
  const checker = createSpellChecker(aff, dic);
  const source = 'Hello wurld\n\n`teh` and [visible](https://example.com/teh)\n\n```js\nteh\n```';
  const errors = findSpellingErrors(source, checker);
  assert.deepEqual(errors.map(error => error.word), ['wurld', 'and']);
  assert.equal(source.slice(errors[0].from, errors[0].to), 'wurld');
  assert.equal(proseForSpellcheck(source).slice(source.indexOf('`teh`'), source.indexOf('`teh`') + 5), '     ');
});

test('findSpellingErrors respects ignored and personal words', () => {
  const checker = createSpellChecker(aff, dic, ['Quillite']);
  const source = 'Quillite teh API camelCase';
  const errors = findSpellingErrors(source, checker, { ignoredWords: new Set(['teh']) });
  assert.deepEqual(errors, []);
});

test('normalizePersonalWords validates, de-duplicates and sorts words', () => {
  assert.deepEqual(normalizePersonalWords(['Beta', 'beta', 'alpha', '', 'two words', 'writer’s']), ['alpha', 'Beta', "writer's"]);
});

test('spelling offsets stay UTF-16 after emoji and code is excluded in containers', () => {
  const source='😀 Hello wurld\n\n> ```text\n> speling\n> ```\n\n    speling\n\n`speling`\n';
  const errors=findSpellingErrors(source,createSpellChecker(aff,dic));
  assert.deepEqual(errors,[{from:source.indexOf('wurld'),to:source.indexOf('wurld')+5,word:'wurld'}]);
  assert.equal(proseForSpellcheck(source).length,source.length);
});

test('footnote prose is checked without treating continuation code or labels as words', () => {
  const source='Hello[^speling]\n\n[^speling]: Hello wurld\n    \n    world wurld\n    \n    ```text\n    speling\n    ```';
  const errors=findSpellingErrors(source,createSpellChecker(aff,dic));
  assert.deepEqual(errors.map(e=>e.word),['wurld','wurld']);
  for(const e of errors)assert.equal(source.slice(e.from,e.to),'wurld');
});
