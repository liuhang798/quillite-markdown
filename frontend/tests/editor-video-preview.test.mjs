import assert from 'node:assert/strict';
import test from 'node:test';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorVideoPreview, liveVideoBlockRanges, standaloneLiveVideoSource, videoPreviewContext } from '../src/editor-video-preview.js';
import { liveComposition } from '../src/editor-composition.js';

const web = '<video controls preload="none" src="https://developer.mozilla.org/shared-assets/videos/flower.mp4"></video>';
const clip = '<video src="assets/录屏.WeBm" />';

test('live video claims only complete standalone Markdown video blocks', () => {
  const source = 'Above.\n\n' + web + '\n\n  ' + clip + '\n\nBelow.';
  assert.equal(standaloneLiveVideoSource('<video src="assets/演示.mp4"></video>'), 'assets/演示.mp4');
  assert.equal(standaloneLiveVideoSource('<video autoplay poster="https://media.example.com/evil.png" src="https://media.example.com/v?id=5&amp;sig=4"></video>'),
    'https://media.example.com/v?id=5&sig=4');
  assert.deepEqual(liveVideoBlockRanges(source).map(({from,to,reference}) => [
    source.slice(from,to), reference
  ]), [[web, 'https://developer.mozilla.org/shared-assets/videos/flower.mp4'], ['  ' + clip, 'assets/录屏.WeBm']]);
});

test('live video leaves invalid or mixed HTML, examples and protected Markdown regions unchanged', () => {
  for (const source of [
    `prefix ${web}`, `${web} suffix`, `${web}\nprose`, `> ${web}`, `- ${web}`, '    ' + web,
    '\x60\x60\x60html\n' + web + '\n\x60\x60\x60', '\x60' + web + '\x60',
    `---\ntitle: demo\n\n${web}\n---`,
    '<video src="assets/movie.mp4"><img src="https://media.example.com/p.png"></video>',
    '<video src="http://media.example.com/a.mp4"></video>',
    '<video src="https://www.youtube.com/watch?v=abc"></video>',
    '<video src="https://media.example.com/a.mp4" src="https://media.example.com/b.mp4"></video>',
  ]) assert.deepEqual(liveVideoBlockRanges(source), [], source);
});

const decorations = state => {
  const entries = [];
  const [ranges] = state.facet(EditorView.decorations);
  for (let it = ranges.iter(); it.value; it.next()) entries.push({from:it.from, to:it.to, widget:it.value.spec.widget});
  return entries;
};

test('a moved video keeps its own widget identity on unrelated edits, never transfers to a duplicate', () => {
  const context = new Compartment(), config = { enabled:true, session:5, documentPath:'record.md', t:key=>key };
  let state = EditorState.create({doc:`Above\n\n${clip}\n\n${clip}\n\nBelow`,
    extensions:[editorVideoPreview, context.of(videoPreviewContext.of(config))]});
  const [first, second] = decorations(state);
  assert.equal(first.widget.eq(second.widget), false);
  state = state.update({changes:{from:0, insert:'Line\n\n'}}).state;
  const [movedFirst,movedSecond] = decorations(state);
  assert.equal(movedFirst.from, first.from + 6);
  assert.equal(first.widget.eq(movedFirst.widget), true);
  assert.equal(second.widget.eq(movedSecond.widget), true);
  state = state.update({changes:{from:movedFirst.from,to:movedFirst.to + 2}}).state;
  assert.equal(decorations(state).length, 1);
  assert.equal(first.widget.eq(decorations(state)[0].widget), false);
  assert.equal(second.widget.eq(decorations(state)[0].widget), true);
  state = state.update({effects:context.reconfigure(videoPreviewContext.of({...config, session:6}))}).state;
  assert.equal(second.widget.eq(decorations(state)[0].widget), false);
  state = state.update({effects:context.reconfigure(videoPreviewContext.of({...config, enabled:false}))}).state;
  assert.deepEqual(decorations(state), []);
});

test('typing or joining characters can introduce the first video, with decoration deferred until composition commits', () => {
  const config = { enabled:true, session:5, documentPath:'record.md', t:key=>key };
  let state = EditorState.create({ doc:clip.replace('video','vid eo'),
    extensions:[editorVideoPreview, videoPreviewContext.of(config)] });
  assert.deepEqual(decorations(state), []);
  state = state.update({changes:{from:4,to:5}}).state;
  assert.equal(decorations(state).length, 1);
  state = state.update({changes:{from:0,to:state.doc.length}}).state;
  assert.deepEqual(decorations(state), []);
  state = state.update({changes:{from:0,insert:clip},effects:liveComposition.of(true)}).state;
  assert.deepEqual(decorations(state), []);
  state = state.update({effects:liveComposition.of(false)}).state;
  assert.equal(decorations(state).length, 1);
});
