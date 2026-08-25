export const TABLE_LIMITS = Object.freeze({ minRows: 2, maxRows: 20, minColumns: 1, maxColumns: 12, minWidth: 170, maxWidth: 360, defaultWidth: 220 });

const WIDTH_METADATA = /^\s*<!--\s*quillite-table-widths:\s*([\d,\s]+)\s*-->\s*$/i;
const DIVIDER_CELL = /^:?-{3,}:?$/;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || minimum));

function sourceLines(source) {
  const lines = [];
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    if (index !== source.length && source[index] !== '\n') continue;
    const rawEnd = index > start && source[index - 1] === '\r' ? index - 1 : index;
    lines.push({ text: source.slice(start, rawEnd), start, end: index < source.length ? index + 1 : index });
    start = index + 1;
  }
  return lines;
}

function fencedCodeLines(lines) {
  const blocked = Array(lines.length).fill(false);
  let activeFence = null;
  lines.forEach((line, index) => {
    if (!activeFence) {
      const opening = line.text.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
      if (!opening) return;
      activeFence = { character: opening[1][0], length: opening[1].length };
      blocked[index] = true;
      return;
    }
    blocked[index] = true;
    const closing = line.text.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);
    if (closing && closing[1][0] === activeFence.character && closing[1].length >= activeFence.length) activeFence = null;
  });
  return blocked;
}

export function splitMarkdownTableRow(line) {
  let source = String(line || '').trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);
  const cells = [];
  let cell = '';
  let codeFenceLength = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && source[index + 1] === '|') {
      cell += '|';
      index += 1;
      continue;
    }
    if (character === '`') {
      let run = 1;
      while (source[index + run] === '`') run += 1;
      if (codeFenceLength === 0) codeFenceLength = run;
      else if (codeFenceLength === run) codeFenceLength = 0;
      cell += '`'.repeat(run);
      index += run - 1;
      continue;
    }
    if (character === '|' && codeFenceLength === 0) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function dividerAlignment(cell) {
  const value = cell.trim();
  if (!DIVIDER_CELL.test(value)) return null;
  if (value.startsWith(':') && value.endsWith(':')) return 'center';
  if (value.endsWith(':')) return 'right';
  return 'left';
}

function normalizedWidths(rawWidths, columns) {
  const widths = Array.isArray(rawWidths) ? rawWidths : [];
  return Array.from({ length: columns }, (_, index) => clamp(widths[index] || TABLE_LIMITS.defaultWidth, TABLE_LIMITS.minWidth, TABLE_LIMITS.maxWidth));
}

export function createTableModel(rows = 3, columns = 3, headerLabel = index => `Column ${index + 1}`) {
  const rowCount = clamp(rows, TABLE_LIMITS.minRows, TABLE_LIMITS.maxRows);
  const columnCount = clamp(columns, TABLE_LIMITS.minColumns, TABLE_LIMITS.maxColumns);
  return {
    cells: Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => rowIndex === 0 ? headerLabel(columnIndex) : '')),
    alignments: Array(columnCount).fill('left'),
    widths: normalizedWidths([], columnCount)
  };
}

export function resizeTableModel(model, rows, columns, headerLabel = index => `Column ${index + 1}`) {
  const rowCount = clamp(rows, TABLE_LIMITS.minRows, TABLE_LIMITS.maxRows);
  const columnCount = clamp(columns, TABLE_LIMITS.minColumns, TABLE_LIMITS.maxColumns);
  const cells = Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => {
    const existing = model.cells?.[rowIndex]?.[columnIndex];
    if (existing !== undefined) return existing;
    return rowIndex === 0 ? headerLabel(columnIndex) : '';
  }));
  return {
    cells,
    alignments: Array.from({ length: columnCount }, (_, index) => model.alignments?.[index] || 'left'),
    widths: normalizedWidths(model.widths, columnCount)
  };
}

function moveItem(items, from, to) {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function reorderTableColumn(model, from, to) {
  if (from === to || from < 0 || to < 0 || from >= model.alignments.length || to >= model.alignments.length) return model;
  return {
    cells: model.cells.map(row => moveItem(row, from, to)),
    alignments: moveItem(model.alignments, from, to),
    widths: moveItem(model.widths, from, to)
  };
}

export function reorderTableRow(model, from, to) {
  if (from === 0 || to === 0 || from === to || from < 1 || to < 1 || from >= model.cells.length || to >= model.cells.length) return model;
  return { ...model, cells: moveItem(model.cells, from, to) };
}

export function removeTableRow(model, index) {
  if (index <= 0 || index >= model.cells.length || model.cells.length <= TABLE_LIMITS.minRows) return model;
  return { ...model, cells: model.cells.filter((_, rowIndex) => rowIndex !== index) };
}

export function removeTableColumn(model, index) {
  if (index < 0 || index >= model.alignments.length || model.alignments.length <= TABLE_LIMITS.minColumns) return model;
  return {
    cells: model.cells.map(row => row.filter((_, columnIndex) => columnIndex !== index)),
    alignments: model.alignments.filter((_, columnIndex) => columnIndex !== index),
    widths: model.widths.filter((_, columnIndex) => columnIndex !== index)
  };
}

function escapeTableCell(value) {
  return String(value ?? '').replace(/\r?\n/g, '<br>').replace(/(?<!\\)\|/g, '\\|').trim();
}

export function serializeMarkdownTable(model) {
  const columns = model.alignments.length;
  const widths = normalizedWidths(model.widths, columns);
  const row = values => `| ${Array.from({ length: columns }, (_, index) => escapeTableCell(values?.[index] || '')).join(' | ')} |`;
  const divider = model.alignments.map(alignment => alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : ':---');
  return [
    `<!-- quillite-table-widths: ${widths.join(', ')} -->`,
    row(model.cells[0]),
    row(divider),
    ...model.cells.slice(1).map(row)
  ].join('\n');
}

export function findMarkdownTables(source) {
  const text = String(source || '');
  const lines = sourceLines(text);
  const fencedLines = fencedCodeLines(lines);
  const tables = [];
  for (let dividerIndex = 1; dividerIndex < lines.length; dividerIndex += 1) {
    if (fencedLines[dividerIndex] || fencedLines[dividerIndex - 1]) continue;
    if (!lines[dividerIndex].text.includes('|') && !lines[dividerIndex - 1].text.includes('|')) continue;
    const dividerCells = splitMarkdownTableRow(lines[dividerIndex].text);
    const alignments = dividerCells.map(dividerAlignment);
    if (!alignments.length || alignments.some(alignment => alignment === null)) continue;
    const headerCells = splitMarkdownTableRow(lines[dividerIndex - 1].text);
    if (headerCells.length !== alignments.length) continue;
    let lastIndex = dividerIndex;
    const cells = [headerCells];
    for (let rowIndex = dividerIndex + 1; rowIndex < lines.length; rowIndex += 1) {
      const line = lines[rowIndex].text;
      if (!line.trim() || !line.includes('|')) break;
      const row = splitMarkdownTableRow(line);
      if (row.length !== alignments.length) break;
      cells.push(row);
      lastIndex = rowIndex;
    }
    if (cells.length < TABLE_LIMITS.minRows) cells.push(Array(alignments.length).fill(''));
    let firstIndex = dividerIndex - 1;
    let widths = [];
    let hasWidthMetadata = false;
    if (firstIndex > 0) {
      const match = lines[firstIndex - 1].text.match(WIDTH_METADATA);
      if (match) {
        widths = match[1].split(',').map(value => Number(value.trim()));
        firstIndex -= 1;
        hasWidthMetadata = true;
      }
    }
    tables.push({
      from: lines[firstIndex].start,
      to: lines[lastIndex].end,
      line: dividerIndex,
      hasWidthMetadata,
      model: { cells, alignments, widths: normalizedWidths(widths, alignments.length) }
    });
    dividerIndex = lastIndex;
  }
  return tables;
}

export function findMarkdownTableAt(source, offset) {
  const position = clamp(offset, 0, String(source || '').length);
  return findMarkdownTables(source).find(table => position >= table.from && position <= table.to) || null;
}

export function stripTableWidthMetadata(source) {
  const text = String(source || '');
  const characters = [...text];
  findMarkdownTables(text).filter(table => table.hasWidthMetadata).forEach(table => {
    const lineEnd = text.indexOf('\n', table.from);
    const end = lineEnd < 0 ? text.length : lineEnd;
    for (let index = table.from; index < end; index += 1) {
      if (characters[index] !== '\r') characters[index] = ' ';
    }
  });
  return characters.join('');
}
