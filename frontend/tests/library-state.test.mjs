import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RECENT_LIMIT,
  directoryFromDocumentPath,
  filesFromPreferencePaths,
  isMissingDocumentError,
  normalizeSidebarMode,
  normalizePinnedRecentPaths,
  partitionRecentFiles,
  pinRecentFile,
  reorderPinnedRecentFiles,
  sameDocumentPath,
  unpinRecentFile,
  upsertRecentFile,
} from '../src/library-state.js';

function recentFile(path, extra = {}) {
  return { path, name: path.split(/[\\/]/).pop(), ...extra };
}

function paths(files) {
  return files.map(file => file.path);
}

test('normalizeSidebarMode keeps each supported library view', () => {
  assert.equal(normalizeSidebarMode('recent'), 'recent');
  assert.equal(normalizeSidebarMode('favorites'), 'favorites');
  assert.equal(normalizeSidebarMode('explorer'), 'explorer');
  assert.equal(normalizeSidebarMode('unknown'), 'recent');
});

test('filesFromPreferencePaths preserves unavailable documents', () => {
  const files = filesFromPreferencePaths(
    ['C:\\Docs\\kept.md', 'C:\\Docs\\moved.md'],
    [
      { path: 'C:\\Docs\\kept.md', exists: true },
      { path: 'C:\\Docs\\moved.md', exists: false },
    ],
  );

  assert.deepEqual(files, [
    { path: 'C:\\Docs\\kept.md', name: 'kept.md', directory: 'C:\\Docs', exists: true },
    { path: 'C:\\Docs\\moved.md', name: 'moved.md', directory: 'C:\\Docs', exists: false },
  ]);
});

test('directoryFromDocumentPath supports Windows and Unix paths', () => {
  assert.equal(directoryFromDocumentPath('D:\\wechat_files\\2026-08\\note.md'), 'D:\\wechat_files\\2026-08');
  assert.equal(directoryFromDocumentPath('/Users/demo/Documents/note.md'), '/Users/demo/Documents');
  assert.equal(directoryFromDocumentPath('note.md'), '.');
});

test('sameDocumentPath compares Windows separators and casing safely', () => {
  assert.equal(sameDocumentPath('C:\\Docs\\Guide.md', 'c:/docs/guide.md'), true);
  assert.equal(sameDocumentPath('C:\\Docs\\Guide.md', 'C:\\Docs\\Other.md'), false);
  assert.equal(sameDocumentPath('', ''), false);
});

test('missing document errors are recognized as an expected library state', () => {
  assert.equal(isMissingDocumentError(new Error('open /Users/demo/Downloads/note.md: no such file or directory')), true);
  assert.equal(isMissingDocumentError('The system cannot find the file specified.'), true);
  assert.equal(isMissingDocumentError('系统找不到指定的文件。'), true);
  assert.equal(isMissingDocumentError('permission denied'), false);
  assert.equal(isMissingDocumentError('unexpected renderer failure'), false);
});

test('POSIX case variants remain independently listed, selected and pinned',()=>{
  const a='/notes/README.md', b='/notes/readme.md';
  assert.equal(sameDocumentPath(a,b),false);
  assert.equal(sameDocumentPath('/notes/a\\b.md','/notes/a/b.md'),false);
  assert.deepEqual(paths(partitionRecentFiles([recentFile(a),recentFile(b)],[b]).files),[b,a]);
});

test('normalizePinnedRecentPaths keeps an ordered, deduplicated subset using recent path casing', () => {
  const recentFiles = [
    recentFile('C:\\Docs\\Alpha.md'),
    recentFile('C:\\Docs\\Beta.md'),
    recentFile('/Users/demo/Gamma.md'),
  ];

  assert.deepEqual(
    normalizePinnedRecentPaths(recentFiles, [
      'c:/docs/beta.md',
      'C:\\DOCS\\BETA.MD',
      '/Users/demo/Gamma.md',
      'C:\\Docs\\Unknown.md',
    ]),
    ['C:\\Docs\\Beta.md', '/Users/demo/Gamma.md'],
  );
});

test('partitionRecentFiles places pinned files first and limits only ordinary entries', () => {
  assert.equal(DEFAULT_RECENT_LIMIT, 100);
  const pinned = [recentFile('C:\\Docs\\Pinned-A.md'), recentFile('C:\\Docs\\Pinned-B.md')];
  const ordinary = Array.from({ length: DEFAULT_RECENT_LIMIT + 1 }, (_, index) => (
    recentFile(`C:\\Docs\\Recent-${index + 1}.md`)
  ));
  const result = partitionRecentFiles(
    [ordinary[0], pinned[0], ...ordinary.slice(1), pinned[1]],
    ['c:/docs/pinned-b.md', 'C:\\DOCS\\PINNED-A.MD'],
  );

  assert.deepEqual(paths(result.pinnedFiles), ['C:\\Docs\\Pinned-B.md', 'C:\\Docs\\Pinned-A.md']);
  assert.deepEqual(paths(result.ordinaryFiles), paths(ordinary.slice(0, DEFAULT_RECENT_LIMIT)));
  assert.deepEqual(paths(result.files), [
    'C:\\Docs\\Pinned-B.md',
    'C:\\Docs\\Pinned-A.md',
    ...paths(ordinary.slice(0, DEFAULT_RECENT_LIMIT)),
  ]);
  assert.deepEqual(result.pinnedPaths, ['C:\\Docs\\Pinned-B.md', 'C:\\Docs\\Pinned-A.md']);
});

test('upsertRecentFile inserts new files after pins while existing files keep their position', () => {
  const pinned = recentFile('/docs/pinned.md');
  const first = recentFile('/docs/first.md', { exists: false });
  const second = recentFile('/docs/second.md');

  const inserted = upsertRecentFile(
    [pinned, first, second],
    ['/docs/pinned.md'],
    recentFile('/docs/new.md'),
  );
  assert.deepEqual(paths(inserted.files), [
    '/docs/pinned.md',
    '/docs/new.md',
    '/docs/first.md',
    '/docs/second.md',
  ]);

  const updated = upsertRecentFile(
    inserted.files,
    inserted.pinnedPaths,
    recentFile('/docs/first.md', { exists: true, modifiedAt: 'now' }),
  );
  assert.deepEqual(paths(updated.files), [
    '/docs/pinned.md',
    '/docs/new.md',
    '/docs/first.md',
    '/docs/second.md',
  ]);
  assert.equal(updated.files[2].modifiedAt, 'now');
});

test('pinRecentFile moves a normal entry to the front of the pinned group without mutating inputs', () => {
  const recentFiles = [recentFile('/docs/pinned.md'), recentFile('/docs/one.md'), recentFile('/docs/two.md')];
  const pinnedPaths = ['/docs/pinned.md'];
  const originalFiles = [...recentFiles];
  const originalPins = [...pinnedPaths];

  const result = pinRecentFile(recentFiles, pinnedPaths, '/docs/two.md');

  assert.deepEqual(paths(result.files), ['/docs/two.md', '/docs/pinned.md', '/docs/one.md']);
  assert.deepEqual(result.pinnedPaths, ['/docs/two.md', '/docs/pinned.md']);
  assert.deepEqual(recentFiles, originalFiles);
  assert.deepEqual(pinnedPaths, originalPins);
  assert.deepEqual(pinRecentFile(result.files, result.pinnedPaths, '/docs/two.md'), result);
});

test('unpinRecentFile moves the entry to the front of ordinary recents and drops only the oldest ordinary', () => {
  const pinA = recentFile('/docs/pin-a.md');
  const pinB = recentFile('/docs/pin-b.md');
  const ordinary = Array.from({ length: DEFAULT_RECENT_LIMIT }, (_, index) => recentFile(`/docs/${index + 1}.md`));

  const result = unpinRecentFile(
    [pinA, pinB, ...ordinary],
    [pinA.path, pinB.path],
    '/docs/pin-a.md',
  );

  assert.deepEqual(result.pinnedPaths, ['/docs/pin-b.md']);
  assert.deepEqual(paths(result.pinnedFiles), ['/docs/pin-b.md']);
  assert.deepEqual(paths(result.ordinaryFiles), ['/docs/pin-a.md', ...paths(ordinary.slice(0, DEFAULT_RECENT_LIMIT - 1))]);
});

test('reorderPinnedRecentFiles accepts current pins only and appends omitted pins in their old order', () => {
  const files = [
    recentFile('C:\\Docs\\A.md'),
    recentFile('C:\\Docs\\B.md'),
    recentFile('C:\\Docs\\C.md'),
    recentFile('C:\\Docs\\Normal.md'),
  ];
  const result = reorderPinnedRecentFiles(
    files,
    ['C:\\Docs\\A.md', 'C:\\Docs\\B.md', 'C:\\Docs\\C.md'],
    ['c:/docs/b.md', 'C:\\Docs\\Unknown.md', 'C:\\DOCS\\B.MD'],
  );

  assert.deepEqual(result.pinnedPaths, ['C:\\Docs\\B.md', 'C:\\Docs\\A.md', 'C:\\Docs\\C.md']);
  assert.deepEqual(paths(result.files), [
    'C:\\Docs\\B.md',
    'C:\\Docs\\A.md',
    'C:\\Docs\\C.md',
    'C:\\Docs\\Normal.md',
  ]);
});
