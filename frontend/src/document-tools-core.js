import { marked } from 'marked';

export const TOOL_LIMITS = { checkBytes: 2 * 1024 * 1024, templates: 20, templateBytes: 65536 };
const bytes = value => new TextEncoder().encode(value).length;
const plain = tokens => (tokens || []).map(t => t.tokens ? plain(t.tokens) : t.type === 'html' ? '' : t.text || '').join('');
export function checkMarkdown(source, renderedAnchors) {
  if (source.length > TOOL_LIMITS.checkBytes || bytes(source) > TOOL_LIMITS.checkBytes) throw new Error('DOCUMENT_CHECK_LIMIT');
  const issues = [], assets = [], links = [], headings = [];
  const add = (code, line, detail = '') => { if (issues.length < 300) issues.push({ code, line, detail }); };
  const lines = source.split('\n');
  let fence = null;
  lines.forEach((line, i) => {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (m) {
      if (!fence && !(m[1][0] === '`' && m[2].includes('`'))) fence = { char: m[1][0], length: m[1].length, line: i + 1 };
      else if (fence && m[1][0] === fence.char && m[1].length >= fence.length && !m[2].trim()) fence = null;
    }
  });
  if (fence) add('fence', fence.line);
  // Marked supplies parsed links/images, excluding code, including references.
  const tokens = marked.lexer(source);
  let lineNumber = 1, previousDepth = 0;
  const explicit = new Set([...source.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
  const walkInline = (items, line) => {
    for (const t of items || []) {
      if (t.type === 'heading') {
        if (previousDepth && t.depth > previousDepth + 1) add('heading', line, `${previousDepth} → ${t.depth}`);
        previousDepth = t.depth;
        headings.push(`${plain(t.tokens).toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section'}-${headings.length}`);
      }
      if (t.type === 'image' && !/^(?:https?:|data:|\/\/|#)/i.test(t.href || '')) assets.push({ ref: t.href.split('#')[0].split('?')[0], line });
      if (t.type === 'link' && t.href?.startsWith('#')) links.push({ ref: t.href.slice(1), line });
      if (t.tokens) walkInline(t.tokens, line);
      if (t.items) walkInline(t.items, line);
      line += (t.raw?.match(/\n/g) || []).length;
    }
  };
  for (const token of tokens) {
    const line = lineNumber;
    if (token.type === 'heading') {
      if (previousDepth && token.depth > previousDepth + 1) add('heading', line, `${previousDepth} → ${token.depth}`);
      previousDepth = token.depth;
      headings.push(`${plain(token.tokens).toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section'}-${headings.length}`);
    }
    if (token.type === 'table') {
      const count = s => s.trim().replace(/^\||\|$/g, '').replace(/\\\|/g, '').replace(/`[^`]*`/g, '').split('|').length;
      const rows = token.raw.trimEnd().split('\n'), expected = count(rows[0]);
      rows.slice(2).forEach((row, i) => { if (count(row) !== expected) add('table', line + i + 2); });
      token.header.forEach(cell => walkInline(cell.tokens, line));
      token.rows.forEach((row, i) => row.forEach(cell => walkInline(cell.tokens, line + i + 2)));
    }
    walkInline(token.tokens || token.items, line);
    lineNumber += (token.raw.match(/\n/g) || []).length;
  }
  // The application supplies IDs from its sanitised preview pipeline (including
  // nested/raw HTML headings, entities and footnotes). Token IDs are a fallback
  // for headless callers, not a second source of truth for the UI.
  const headingIDs = renderedAnchors ? renderedAnchors(source) : new Set([...headings, ...explicit]);
  for (const link of links) {
    let ref; try { ref = decodeURIComponent(link.ref); } catch { ref = link.ref; }
    // Explicit HTML ids are also valid, but never execute HTML to inspect them.
    if (!headingIDs.has(ref)) add('anchor', link.line, ref);
  }
  return { issues, assets: assets.slice(0, 128), limited: assets.length > 128 || issues.length >= 300 };
}

export const BUILTIN_TEMPLATES = [
  { id: 'meeting', zh: '会议纪要', en: 'Meeting notes', content: '# {{title}}\n\n{{date}}\n\n## 参会人员 / Attendees\n\n## 议题 / Agenda\n\n## 决议 / Decisions\n\n## 待办 / Action items\n\n- [ ] 负责人 / Owner · 截止时间 / Due date\n' },
  { id: 'weekly', zh: '工作周报', en: 'Weekly report', content: '# {{title}}\n\n{{date}}\n\n## 本周进展 / Progress\n\n## 风险与阻碍 / Risks\n\n## 下周计划 / Next week\n\n- [ ] \n' },
  { id: 'requirements', zh: '需求说明', en: 'Requirements', content: '# {{title}}\n\n{{date}}\n\n## 背景与目标 / Goals\n\n## 范围 / Scope\n\n## 功能要求 / Requirements\n\n## 验收标准 / Acceptance criteria\n\n- [ ] \n' }
];
export function renderDocumentTemplate(content, title, date = new Date()) {
  if (title.length > 80 || bytes(content) > TOOL_LIMITS.templateBytes) throw new Error('TEMPLATE_LIMIT');
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return content.replace(/\{\{(title|date)\}\}/g, (_, key) => key === 'title' ? title.replace(/[\r\n]/g, ' ') : day);
}
export function parseCustomTemplates(json) {
  try { const value = JSON.parse(json || '[]'); return Array.isArray(value) ? value.filter(t => typeof t?.id === 'string' && typeof t.name === 'string' && t.name.length <= 80 && typeof t.content === 'string' && bytes(t.content) <= TOOL_LIMITS.templateBytes).slice(0, TOOL_LIMITS.templates) : []; } catch { return []; }
}

const errorCounts = new Map();
export function recordToolDiagnostic(source) {
  // Only fixed categories survive. No error messages, paths, keys or stacks.
  const category = String(source).split('.')[0];
  if (!['document', 'frontend', 'preview', 'export', 'library', 'folder', 'preferences', 'ai', 'spellcheck', 'tools'].includes(category)) return;
  errorCounts.set(category, Math.min(9999, (errorCounts.get(category) || 0) + 1));
}
export function diagnosticSummary(context) {
  return { schema: 1, version: '2.7.5', platform: ['windows', 'darwin', 'linux', 'browser'].includes(context.platform) ? context.platform : 'unknown',
    checks: { documentOpen: Boolean(context.path), unsaved: Boolean(context.dirty), conflict: Boolean(context.conflict), saving: Boolean(context.saving) }, errors: Object.fromEntries(errorCounts) };
}
