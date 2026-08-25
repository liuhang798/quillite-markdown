function isEscaped(source, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor--) slashes += 1;
  return slashes % 2 === 1;
}

function maskFencedCode(source) {
  const masked = [...source];
  let offset = 0;
  let fence = null;
  for (const lineWithBreak of source.match(/.*(?:\n|$)/g) || []) {
    if (!lineWithBreak) continue;
    const line = lineWithBreak.replace(/\n$/, '');
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    const existingFence = fence;
    if (!fence && marker) fence = { char: marker[1][0], length: marker[1].length };
    const insideFence = Boolean(fence);
    if (insideFence) {
      for (let index = offset; index < offset + line.length; index++) masked[index] = ' ';
    } else {
      let cursor = 0;
      while (cursor < line.length) {
        const opening = line.slice(cursor).match(/`+/);
        if (!opening) break;
        const start = cursor + opening.index;
        const markerText = opening[0];
        const close = line.indexOf(markerText, start + markerText.length);
        if (close < 0) break;
        for (let index = offset + start; index < offset + close + markerText.length; index++) masked[index] = ' ';
        cursor = close + markerText.length;
      }
    }
    if (existingFence && new RegExp(`^ {0,3}${existingFence.char === '`' ? '`' : '~'}{${existingFence.length},}[ \\t]*$`).test(line)) {
      fence = null;
    }
    offset += lineWithBreak.length;
  }
  return masked.join('');
}

function lineEnd(source, from) {
  const end = source.indexOf('\n', from);
  return end < 0 ? source.length : end;
}

function nextUnescaped(source, token, from, limit = source.length) {
  let cursor = source.indexOf(token, from);
  while (cursor >= 0 && cursor < limit) {
    if (!isEscaped(source, cursor)) return cursor;
    cursor = source.indexOf(token, cursor + token.length);
  }
  return -1;
}

function formulaDetails(source, from, to, expression, displayMode) {
  let cleaned = expression.trim();
  let mode = displayMode ? 'block' : 'inline';
  let equationNumber = '1';
  const numbered = cleaned.match(/\s*\\tag\{([^{}]*)\}\s*$/);
  if (numbered) {
    mode = 'numbered';
    equationNumber = numbered[1].trim() || '1';
    cleaned = cleaned.slice(0, numbered.index).trim();
  }
  const chemistry = cleaned.match(/^\\ce\{([\s\S]*)\}$/);
  return {
    from,
    to,
    raw: source.slice(from, to),
    source: chemistry ? chemistry[1].trim() : cleaned,
    expression: cleaned,
    templateId: chemistry ? 'chem-custom' : 'custom',
    mode,
    equationNumber,
  };
}

export function scanMarkdownFormulas(markdown = '') {
  const source = String(markdown);
  const searchable = maskFencedCode(source);
  const formulas = [];
  const occupied = [];
  const add = formula => {
    formulas.push(formula);
    occupied.push([formula.from, formula.to]);
  };
  const overlaps = (from, to) => occupied.some(range => from < range[1] && to > range[0]);

  let lineStart = 0;
  while (lineStart <= searchable.length) {
    const end = lineEnd(searchable, lineStart);
    const line = searchable.slice(lineStart, end);
    const opener = line.match(/^ {0,3}(\$\$|\\\[)/);
    if (opener) {
      const token = opener[1];
      const closeToken = token === '$$' ? '$$' : '\\]';
      const from = lineStart + opener.index + opener[0].length - token.length;
      const contentFrom = from + token.length;
      const sameLineClose = nextUnescaped(searchable, closeToken, contentFrom, end);
      if (sameLineClose >= 0) {
        add(formulaDetails(source, from, sameLineClose + closeToken.length, source.slice(contentFrom, sameLineClose), true));
      } else {
        let closeFrom = -1;
        let closeEnd = -1;
        let nextLine = end < searchable.length ? end + 1 : searchable.length + 1;
        while (nextLine <= searchable.length) {
          const nextEnd = lineEnd(searchable, nextLine);
          const closeLine = searchable.slice(nextLine, nextEnd);
          const close = closeLine.match(token === '$$' ? /^ {0,3}\$\$[ \t]*$/ : /^ {0,3}\\\][ \t]*$/);
          if (close) {
            closeFrom = nextLine + closeLine.indexOf(closeToken);
            closeEnd = closeFrom + closeToken.length;
            break;
          }
          if (nextEnd >= searchable.length) break;
          nextLine = nextEnd + 1;
        }
        if (closeFrom >= 0) add(formulaDetails(source, from, closeEnd, source.slice(contentFrom, closeFrom), true));
      }
    }
    if (end >= searchable.length) break;
    lineStart = end + 1;
  }

  lineStart = 0;
  while (lineStart <= searchable.length) {
    const end = lineEnd(searchable, lineStart);
    let cursor = lineStart;
    while (cursor < end) {
      if (overlaps(cursor, cursor + 1)) {
        const range = occupied.find(item => cursor >= item[0] && cursor < item[1]);
        cursor = range ? range[1] : cursor + 1;
        continue;
      }
      if (searchable.startsWith('\\(', cursor) && !isEscaped(searchable, cursor)) {
        const close = nextUnescaped(searchable, '\\)', cursor + 2, end);
        if (close >= 0) {
          add(formulaDetails(source, cursor, close + 2, source.slice(cursor + 2, close), false));
          cursor = close + 2;
          continue;
        }
      }
      if (searchable[cursor] === '$' && searchable[cursor + 1] !== '$' && !isEscaped(searchable, cursor) && !/\s/.test(searchable[cursor + 1] || '')) {
        let close = cursor + 1;
        while ((close = searchable.indexOf('$', close)) >= 0 && close < end) {
          if (!isEscaped(searchable, close) && !/\s/.test(searchable[close - 1] || '') && searchable[close - 1] !== '\\' && !/\d/.test(searchable[close + 1] || '')) break;
          close += 1;
        }
        if (close >= 0 && close < end) {
          add(formulaDetails(source, cursor, close + 1, source.slice(cursor + 1, close), false));
          cursor = close + 1;
          continue;
        }
      }
      cursor += 1;
    }
    if (end >= searchable.length) break;
    lineStart = end + 1;
  }
  return formulas.sort((left, right) => left.from - right.from);
}

export function findFormulaAt(markdown, from, to = from) {
  const start = Math.max(0, Number(from) || 0);
  const end = Math.max(start, Number(to) || start);
  return scanMarkdownFormulas(markdown).find(formula => {
    if (start === end) return start >= formula.from && start <= formula.to;
    return start < formula.to && end > formula.from;
  }) || null;
}
