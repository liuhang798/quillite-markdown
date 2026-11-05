// Presentation only: never change the document's name, path or extension on disk.
export function documentListName(value) {
  const name = String(value ?? '');
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return { title: name, extension: '', kind: 'other' };
  const extension = name.slice(dot);
  const lower = extension.toLowerCase();
  const kind = lower === '.textpack' ? 'textpack'
    : lower === '.textbundle' ? 'textbundle'
      : ['.md', '.markdown', '.mdown', '.mkd'].includes(lower) ? 'markdown'
        : lower === '.txt' ? 'text' : 'other';
  return { title: name.slice(0, dot), extension, kind };
}
