import test from 'node:test';
import assert from 'node:assert/strict';
import {marked} from 'marked';
import {prepareFootnotes,highlightExtension} from '../src/markdown-formats.js';
import {renderPreparedFootnotes} from '../src/footnote-rendering.js';
const render=source=>renderPreparedFootnotes(prepareFootnotes(source),marked,'Footnotes');
for(const [form,token] of [['full','[Text][ref]'],['collapsed','[ref][]'],['shortcut','[ref]']])test(`footnote ${form} link/image inherits the document definition before inline lexing`,()=>{
  const html=render(`Text[^n]\n\n[^n]: ${token}\n    \n    !${token}\n\n[ref]: https://example.com/image.png "Shared"`);
  assert.match(html,/<a href="https:\/\/example.com\/image.png" title="Shared">/);assert.match(html,/<img src="https:\/\/example.com\/image.png"/);
});
test('root first-wins definitions, escaped labels, and note-local fallback are stable',()=>{
  const html=render('Text[^n]\n\n[^n]: [one][A&amp;B] [local]\n    \n    [local]: https://example.com/local\n\n[A&amp;B]: https://example.com/first\n[A&amp;B]: https://example.com/second');
  assert.match(html,/href="https:\/\/example.com\/first"/);assert.match(html,/href="https:\/\/example.com\/local"/);assert.doesNotMatch(html,/example.com\/second/);
});
test('shared definition dictionaries cannot leak from one document to the next',()=>{
  render('Text[^n]\n\n[^n]: [ref]\n\n[ref]: https://example.com/private');
  const html=render('Text[^n]\n\n[^n]: [ref] ![ref]');assert.doesNotMatch(html,/example.com\/private/);assert.match(html,/\[ref\] !\[ref\]/);
});
test('footnote references in inline/fenced code stay literal and custom Markdown extensions remain active',()=>{
  marked.use({extensions:[highlightExtension]});
  const html=render('Text[^n]\n\n[^n]: `[ref]` ==Highlighted==\n    \n    ```md\n    [ref]\n    ```\n\n[ref]: https://example.com/one');
  assert.match(html,/<code>\[ref\]<\/code>/);assert.match(html,/<pre><code class="language-md">\[ref\]/);assert.match(html,/<mark class="markdown-highlight">Highlighted<\/mark>/);assert.doesNotMatch(html,/href="https:\/\/example.com/);
});
