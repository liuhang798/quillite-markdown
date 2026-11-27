import test from 'node:test';
import assert from 'node:assert/strict';
import { planLibrarySearch } from '../src/library-search.js';

const file = path => ({ path, name: path.split('/').at(-1) });
const paths = rows => rows.map(f => f.path);

test('DIC: stable tiers, distinct same-name files, and late content cannot outrank filenames', () => {
  const source = Object.freeze(['notes.md', 'z/dict.txt', 'azDIC.md', 'DIC.md', 'ideas.md', 'a/dict.txt', 'dic.TEXTPACK', 'adict.txt'].map(file));
  const plan = planLibrarySearch(source, ' DiC ');
  const names = ['DIC.md', 'dic.TEXTPACK', 'z/dict.txt', 'a/dict.txt', 'azDIC.md', 'adict.txt'];
  assert.deepEqual(plan.paths, ['notes.md', 'ideas.md']); // no disk scan for a name match
  assert.deepEqual(paths(plan.visible(new Set())), names);
  assert.deepEqual(paths(plan.visible(new Set(['ideas.md']))), [...names, 'ideas.md']);
  assert.deepEqual(paths(plan.visible(new Set(['ideas.md','z/dict.txt','notes.md']))), [...names, 'notes.md', 'ideas.md']);
});

test('use the displayed stem without dropping earlier dots; full names and extensions remain searchable', () => {
  const files = ['xguide.v2.md','guide.v21.md','guide.v2.MD','guide.v2','.gitignore','README'].map(file);
  const ranked = q => paths(planLibrarySearch(files, q).visible(new Set()));
  assert.deepEqual(ranked('GUIDE.V2'), ['guide.v2.MD','guide.v2','guide.v21.md','xguide.v2.md']);
  assert.deepEqual(ranked('guide.v2.md'), ['guide.v2.MD','xguide.v2.md']);
  assert.deepEqual(ranked('.md'), ['xguide.v2.md','guide.v21.md','guide.v2.MD']);
  assert.deepEqual(ranked('.GITIGNORE'), ['.gitignore']);
  assert.deepEqual(ranked('readme'), ['README']);
});
