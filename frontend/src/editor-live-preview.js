import { ChangeSet, EditorSelection, EditorState, Facet, Prec, StateEffect, StateField, Transaction } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, ViewPlugin, keymap } from '@codemirror/view';
import { insertNewlineContinueMarkup, deleteMarkupBackward } from '@codemirror/lang-markdown';
import { searchPanelOpen } from '@codemirror/search';
import { markdownParser, tableRenderSource } from './markdown-parser.js';
import { frontmatterRange, maskFrontmatter } from './frontmatter.js';
import { isolateHistory, insertNewlineAndIndent, deleteCharBackward, deleteCharForward, deleteGroupBackward, deleteGroupForward } from '@codemirror/commands';
import { decodeHTML } from 'entities';
import { scanMarkdownFormulas } from './formula-editing.js';
import { editorImageItems } from './image-layout.js';
import { scanTextColorSpans } from './text-colors.js';
import { EditableBlockWidget, tableCellRanges, safeCellInsertion, editableFieldContains, focusEditableBlock, keepVisibleBlockStable, forwardEditableEffects, syncEditableSelections, syncEditableSearch, syncEditableSpelling, extendEditableSelection, editableClipboardMode, editableSearchSelection } from './live-editable-block.js';
import { editableForwardedChange, editableProjectionSync, resolveEditableOwner } from './editable-owner.js';
import { protectedBlockReplacement, crossSelection, crossSelectionField } from './editable-cross-selection.js';
import { structuredHtmlBlocks } from './html-block-editing.js';
import { sourceReturnPanel, revealSourceReturnCaret } from './source-return-panel.js';
import { activeDiagramSourceItem, returnDiagramSourceToRendered, editorDiagramField } from './editor-diagram-preview.js';
import { installCrossBlockDrag } from './editable-drag-selection.js';
import { installEditableTextDrag } from './editable-text-drag.js';
import { codeFenceRepairs } from './code-fence-editing.js';
import { codeProjection, indentedCodeProjection, mapProjection, fieldPosition, fieldOffset, fieldText, fieldInsertion, composeProjections } from './projected-code.js';
import { blockDropPrefix } from './block-drop-context.js';
import { findMarkdownTables, tableProjection } from './table-designer.js';
import { renderedContainerRanges, mediaOwnedByInnerEditor } from './media-ownership.js';
import { liveSelectionDisplay } from './live-selection-layer.js';
import {compositionSession, editorHasComposition, liveComposition, editorCompositionState} from './editor-composition.js';
export {editorHasComposition} from './editor-composition.js';
import { imageDefinitionsField, imageDefinitionsFor, updateImageDefinitions, footnotesField, footnotesFor, updateFootnotes, footnoteBodyContext } from './editor-reference-context.js';
import { footnoteProjection } from './footnote-editing.js';
import { prepareFootnotes } from './markdown-formats.js';
import { normalizeSetextCaret } from './editor-formatting.js';
import { findMarkdownLinkAt, validLinkDestination, markdownReferenceKey } from './link-editing.js';
import { inlineCodeLines } from './inline-code-syntax.js';
export { resolveEditableOwner } from './editable-owner.js';
export {spellingDecorations, setSpellingDecorations} from './spelling-decorations.js';
export { pasteEditableTableGrid, canPasteEditableTableGrid } from './live-editable-block.js';

// Presentation only: the CodeMirror document remains the sole source of truth.
// Never round-trip rendered HTML back to Markdown or create a second undo stack.
export const LIVE_PREVIEW_LIMIT = 300_000;
export const livePreviewContext = Facet.define({ combine: values => values[0] || {} });
export {liveComposition} from './editor-composition.js';
export const liveSourceBlock = StateEffect.define();
// A toolbar may retain its selection for stacking formats. Only that transient
// selection should be preserved when Enter finishes formatting.
export const liveFormatSelection = StateEffect.define();
export const livePreviewPhrases = {
  'Click to edit source': '点击编辑源码', 'Toggle task': '切换任务完成状态',
  'Edit table': '编辑表格', 'Source retained for large document': '文档较大，保留源码编辑',
  'View source': '查看源码', 'Table cell': '表格单元格', 'Code content': '代码内容',
  'Tab / Shift+Tab: indent / unindent. Escape: return to document.': 'Tab / Shift+Tab：增加／减少缩进；Escape：返回正文。',
  'Section title': '折叠标题', 'Section content': '区块正文', 'Comment (not shown when reading)': '注释（阅读时不显示）',
  'Collapse content': '收起正文', 'Expand content': '展开正文', 'Return to rendered view': '返回渲染',
  'Editing block source': '正在编辑区块源码',
  'Edit footnote': '编辑脚注',
  'Footnote content': '脚注正文', 'Footnote': '脚注',
  'Separate comment and heading': '分离注释，恢复标题',
};
const overlaps = (a, b) => a.from < b.to && b.from < a.to;
const children = node => { const result = []; for (let child = node.firstChild; child; child = child.nextSibling) result.push(child); return result; };

export function buildLivePlan(source, footnotes = null, inFootnote = false, definitions = null) {
  const plan = { marks: [], hides: [], lines: [], widgets: [], oversized: source.length > LIVE_PREVIEW_LIMIT };
  if (plan.oversized) {
    // Base64 size is not prose size. Parse a compact projection, then restore
    // every original offset; never write this projection into the editor.
    const payloads = editorImageItems(source).filter(item => item.sourceKind === 'embedded').map(item => {
      const offset = source.slice(item.from, item.to).indexOf(item.ref), comma = item.ref.indexOf(',');
      return offset < 0 || comma < 0 ? null : { from: item.from + offset + comma + 1, to: item.from + offset + item.ref.length };
    }).filter(item => item && item.to - item.from > 512).sort((a, b) => a.from - b.from);
    if (!payloads.length) return plan;
    const parts = [], mappings = [];
    let position = 0, removed = 0;
    for (const item of payloads) {
      if (item.from < position) continue;
      parts.push(source.slice(position, item.from), 'A');
      mappings.push({ ...item, compact: item.from - removed });
      removed += item.to - item.from - 1; position = item.to;
    }
    parts.push(source.slice(position));
    const compact = parts.join('');
    if (compact.length > LIVE_PREVIEW_LIMIT) return plan;
    const restore = position => {
      let difference = 0;
      for (const mapping of mappings) {
        if (position <= mapping.compact) break;
        difference += mapping.to - mapping.from - 1;
      }
      return position + difference;
    };
    const projected = buildLivePlan(compact,footnotes,inFootnote,definitions);
    const range = item => ({ ...item, from: restore(item.from), ...(item.to === undefined ? {} : { to: restore(item.to) }) });
    for (const key of ['marks', 'hides', 'lines']) projected[key] = projected[key].map(range);
    projected.widgets = projected.widgets.map(item => {
      const mapped = range(item);
      if(item.split !== undefined) mapped.split = restore(item.split);
      return { ...mapped, raw: source.slice(mapped.from, mapped.to), ...(item.contentFrom === undefined ? {} : { contentFrom: restore(item.contentFrom), contentTo: restore(item.contentTo) }), ...(item.projection ? {projection:mapProjection(item.projection,restore)} : {}), ...(item.fences ? {fences:item.fences.map(range)} : {}), ...(item.cells ? { cells: item.cells.map(range) } : {}), ...(item.headings ? { headings: item.headings.map(range) } : {}) };
    });
    return projected;
  }
  const noteData=inFootnote?{definitions:new Map(),references:[]}:prepareFootnotes(source,footnotes);
  const noteBlocks=[...noteData.definitions.values()].map(definition=>{
    const projection=footnoteProjection(source,definition);
    return {...definition,kind:'footnote-definition',raw:source.slice(definition.from,definition.to),
      contentFrom:definition.bodyFrom,contentTo:definition.to,projection,block:true};
  });
  const formulas = scanMarkdownFormulas(source).filter(formula=>!noteBlocks.some(block=>overlaps(formula,block)));
  // TeX punctuation is opaque to Markdown. Preserve offsets and whitespace,
  // but do not let underscores/asterisks inside inline equations steal an
  // enclosing emphasis delimiter. Never write this parsing projection back.
  const pieces = []; let formulaEnd = 0;
  for (const formula of [...formulas.filter(item => item.mode === 'inline'),...noteBlocks].sort((a,b)=>a.from-b.from)) {
    pieces.push(source.slice(formulaEnd, formula.from), source.slice(formula.from, formula.to).replace(/\S/g, formula.kind==='footnote-definition'?' ':'x'));
    formulaEnd = formula.to;
  }
  pieces.push(source.slice(formulaEnd));
  const metadata = inFootnote ? null : frontmatterRange(source);
  const parsedSource = inFootnote ? pieces.join('') : maskFrontmatter(pieces.join(''));
  let tree = markdownParser.parse(parsedSource);
  const references = new Set(definitions?.keys()), headings = [], imageRanges = [];
  const tableLayouts = findMarkdownTables(source,tree);
  const tableMetadata = new Set(tableLayouts.filter(table => table.hasWidthMetadata).map(table => table.from));
  const images = editorImageItems(source);
  const htmlProtected = [...formulas, ...images, ...noteBlocks, ...(metadata ? [metadata] : [])];
  const blocked = [...formulas, ...images, ...noteBlocks];
  const mark = (from, to, className) => { if (to > from) plan.marks.push({ from, to, className }); };
  const hide = (from, to) => { if (to > from) plan.hides.push({ from, to }); };
  const lineStart = position => source.lastIndexOf('\n', position - 1) + 1;
  const line = (position, className) => plan.lines.push({ from: lineStart(position), className });
  const containerLines = new Map();
  const containerDepth = node => {
    let lists = 0, quotes = 0;
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.name === 'ListItem') lists++;
      if (parent.name === 'Blockquote') quotes++;
    }
    return { lists, quotes };
  };
  const container = (node, kind) => {
    const depth = containerDepth(node);
    const last = lineStart(Math.max(node.from, node.to - 1));
    for (let from = lineStart(node.from); from <= last;) {
      if (!containerLines.has(from)) containerLines.set(from, { quotes: [], lists: 0, starts: 0, ends: 0 });
      const layout = containerLines.get(from);
      if (kind === 'quote') {
        layout.quotes.push(depth);
        if (from === lineStart(node.from)) layout.starts++;
        if (from === last) layout.ends++;
      } else {
        layout.lists = Math.max(layout.lists, depth.lists + 1);
      }
      const next = source.indexOf('\n', from);
      if (next < 0) break;
      from = next + 1;
    }
  };
  const eachLine = (node, className) => {
    line(node.from, className);
    for (let next = source.indexOf('\n', node.from); next >= 0 && next + 1 < node.to; next = source.indexOf('\n', next + 1)) line(next + 1, className);
  };
  if (metadata) {
    eachLine(metadata, 'cm-live-frontmatter');
    line(metadata.from, 'cm-live-frontmatter-start');
    line(metadata.to, 'cm-live-frontmatter-end');
  }
  const collect = node => {
    if (['FencedCode', 'CodeBlock', 'InlineCode', 'Image'].includes(node.name)) htmlProtected.push({ from: node.from, to: node.to, code: node.name !== 'Image' });
    if (node.name === 'Image') imageRanges.push({ from: node.from, to: node.to });
    if (/^(ATXHeading|SetextHeading)[1-6]$/.test(node.name)) headings.push({ from: node.from, level: Number(node.name.slice(-1)), text: source.slice(node.from, node.to).replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').replace(/\n[=-]+\s*$/, '') });
    if (node.name === 'LinkReference') {
      const label = children(node).find(child => child.name === 'LinkLabel');
      if (label) references.add(markdownReferenceKey(source.slice(label.from + 1, label.to - 1)));
    }
    if (['Image', 'FencedCode', 'CodeBlock', 'InlineCode', 'HTMLBlock', 'CommentBlock', 'Table'].includes(node.name)) blocked.push({ from: node.from, to: node.to });
    children(node).forEach(collect);
  };
  collect(tree.topNode);
  const inlineImages = new Set([...imageRanges, ...images].map(image => `${image.from}:${image.to}`));
  const blocksWrapper = (from, to, openEnd, closeStart) => blocked.some(range => overlaps({from,to},range)
    && !((range.mode === 'inline' || inlineImages.has(`${range.from}:${range.to}`))
      && range.from >= openEnd && range.to <= closeStart));
  const htmlBlocks = structuredHtmlBlocks(source, htmlProtected);
  plan.widgets.push(...htmlBlocks,...noteBlocks);
  blocked.push(...htmlBlocks);
  if (htmlBlocks.length) {
    // CommonMark's raw HTML node can swallow the rest of a quoted container.
    // Parse surrounding Markdown again with owned widgets blanked out, keeping
    // exact offsets/newlines. Their inner editors parse the projected bodies.
    const outside = []; let end = 0;
    for (const item of htmlBlocks) {
      outside.push(parsedSource.slice(end,item.from),parsedSource.slice(item.from,item.to).replace(/[^\r\n]/g,' '));
      end = item.to;
    }
    outside.push(parsedSource.slice(end));
    tree = markdownParser.parse(outside.join(''));
  }
  const visit = node => {
    const name = node.name, raw = source.slice(node.from, node.to), parts = children(node);
    if (name !== 'Document' && htmlBlocks.some(range => overlaps(node, range))) {
      // Visit the containing quote/list so surrounding prose and its markers
      // still render. Only the structured HTML itself belongs to its widget.
      if (!['Blockquote', 'BulletList', 'OrderedList', 'ListItem'].includes(name)
        || htmlBlocks.some(range => range.from <= node.from && node.to <= range.to)) return;
    }
    if (formulas.some(range => overlaps(node, range)) && name !== 'Document' && !parts.length) return;
    if (name === 'Image') return; // The existing image extension owns these ranges.
    if (name === 'CommentBlock' && tableMetadata.has(node.from)) { hide(node.from,node.to); return; }
    if (node.parent?.name !== 'Document' && ['HTMLBlock', 'CommentBlock'].includes(name)) return;
    if (name === 'Paragraph' && node.parent?.name === 'Document' && /^\[toc\]$/i.test(raw.trim())) {
      plan.widgets.push({ from: node.from, to: node.to, kind: 'toc', raw, headings, block: true }); return;
    }
    if (name === 'FencedCode' || name === 'CodeBlock') {
      const info = parts.find(child => child.name === 'CodeInfo');
      const language = info ? source.slice(info.from, info.to).trim() : '';
      if (/^(mermaid|echarts)$/i.test(language)) return;
      if (name === 'CodeBlock') {
        const {to,projection}=indentedCodeProjection(source,node);
        if (to <= node.from) return; // Empty container indentation has no replaceable code body.
        plan.widgets.push({from:node.from,to,kind:'code',raw:source.slice(node.from,to),language:'',text:projection.text,
          contentFrom:projection.from,contentTo:projection.to,projection,indented:true,block:true});
        return;
      }
      if (name === 'FencedCode' && parts.filter(child => child.name === 'CodeMark').length === 2) {
        const pieces = parts.filter(child => child.name === 'CodeText'), fences = parts.filter(child => child.name === 'CodeMark');
        const nested = node.parent?.name !== 'Document';
        // Lezer omits the container prefix on a final empty code line. Keep a
        // zero-length segment after that prefix, so the last visible caret does
        // not map before `>`/list indentation when typing after Enter.
        const last = pieces.at(-1), finalLineEnd = source.lastIndexOf('\n', fences[1].from - 1);
        if (nested && last && source[last.to - 1] === '\n' && finalLineEnd >= last.to
          && /^[\t >]*$/.test(source.slice(last.to, finalLineEnd))) pieces.push({from:finalLineEnd,to:finalLineEnd});
        const contentFrom = pieces[0]?.from ?? (nested ? fences[1].from : source.indexOf('\n', node.from) + 1);
        const projection = nested ? codeProjection(source,pieces,contentFrom,blockDropPrefix(source,Math.max(0,node.from-1)),node) : undefined;
        plan.widgets.push({ from: node.from, to: node.to, kind: 'code', raw, language, text: projection?.text ?? (pieces[0] ? source.slice(contentFrom,pieces.at(-1).to) : ''), contentFrom, contentTo: pieces.at(-1)?.to ?? contentFrom, projection,
          fences:fences.map(f=>({from:f.from,to:f.to})), block: true });
        for (const child of parts.filter(child => child.name === 'CodeMark')) hide(child.from, child.to);
        for (const child of parts.filter(child => child.name === 'CodeInfo')) mark(child.from, child.to, 'cm-live-code-language');
      } else { eachLine(node, 'cm-live-code-line'); mark(node.from, node.to, 'cm-live-code'); }
      return;
    }
    if (name === 'Table' || name === 'HTMLBlock' || name === 'CommentBlock') {
      if (name === 'CommentBlock' && tableMetadata.has(node.from)) { hide(node.from, node.to); return; }
      if (name === 'CommentBlock') {
        const close = raw.indexOf('-->');
        if (close >= 0 && !raw.slice(close + 3).trim()) {
          const end = node.from + close + 3;
          plan.widgets.push({ from: node.from, to: end, kind: 'comment', raw: source.slice(node.from,end), cells: [{ from: node.from + 4, to: end - 3, role: 'comment' }], block: true });
        } else if (close >= 0 && /^#{1,6}[ \t]+\S/.test(raw.slice(close + 3)) && lineStart(node.from) === node.from) {
          // Older toolbar insertions could glue a comment before an ATX title.
          // Offer an explicit, undoable repair; never rewrite an opened document.
          plan.widgets.push({from:node.from,to:node.from,kind:'comment-heading-repair',raw:'',split:node.from+close+3,block:true});
        }
        // A mixed or unfinished comment must remain directly editable source.
        // Sanitizing it into an HTML widget hides text and destabilizes clicks.
        return;
      }
      if (name !== 'Table' && /<\/?(?:details|summary|div)\b/i.test(raw)) return;
      // Tables delegate media to their cell editors. Other HTML keeps its
      // original media owners; executable/interactive HTML is never mounted.
      if ((name !== 'Table' && (formulas.some(range => overlaps(node, range)) || imageRanges.some(range => overlaps(node, range)) || /<img\b/i.test(raw))) || /<(?:script|style|iframe|object|embed|input|button|form)\b/i.test(raw)) return;
      const projection = name === 'Table' ? tableProjection(source,node) : undefined;
      const projectedCells = projection ? tableCellRanges(projection.text) : [];
      const cells = projectedCells?.map(cell=>({...cell,from:fieldPosition({projection},cell.from),to:fieldPosition({projection},cell.to)}));
      if (name === 'Table' && !cells) return; // Irregular rows retain lossless source.
      const layout=tableLayouts.find(table=>table.tableFrom===node.from);
      // Width metadata belongs to this rendered block, not to preceding prose.
      // Partial selection protects it with the table skeleton; whole-block
      // moves/deletes include it, and source-return exposes one coherent range.
      const from=layout?.hasWidthMetadata?layout.from:node.from;
      plan.widgets.push({ from, to: node.to, kind: name === 'Table' ? 'table' : 'html', raw:source.slice(from,node.to), cells, projection,
        ...(projection?{renderSource:tableRenderSource(projection.text),alignments:layout?.model.alignments,widths:layout?.hasWidthMetadata?layout.model.widths:undefined}:{}),block: true });
      return;
    }
    if (/^(ATXHeading|SetextHeading)[1-6]$/.test(name)) {
      eachLine(node, `cm-live-heading cm-live-h${name.slice(-1)}`);
      line(node.from, 'cm-live-heading-start');
      line(node.to, 'cm-live-heading-end');
      let blanks = 0, previous = lineStart(node.from) - 1;
      while (previous >= 0 && blanks < 4) {
        const start = source.lastIndexOf('\n', previous - 1) + 1;
        if (source.slice(start, previous).trim()) break;
        blanks++; previous = start - 1;
      }
      line(node.from, node.from === 0 ? 'cm-live-heading-first' : `cm-live-heading-gap-${blanks}`);
      for (const child of parts.filter(child => child.name === 'HeaderMark')) {
        let end = child.to;
        if (child.from === node.from) while (source[end] === ' ') end++;
        hide(child.from, end);
      }
    } else if (name === 'BulletList' || name === 'OrderedList') {
      if (node.parent?.name === 'ListItem') line(Math.max(node.from, node.to - 1), 'cm-live-nested-list-end');
      const previous = node.prevSibling;
      if (previous && /Heading[1-6]$/.test(previous.name) && /^\r?\n[\t ]*\r?\n[\t ]*$/.test(source.slice(previous.to,node.from))) {
        line(previous.to, 'cm-live-heading-before-list');
        line(source.indexOf('\n',previous.to)+1, 'cm-live-list-leading-gap');
      }
    } else if (name === 'Blockquote') {
      eachLine(node, 'cm-live-quote');
      container(node, 'quote');
    } else if (name === 'QuoteMark') {
      hide(node.from, node.to + (source[node.to] === ' ' ? 1 : 0));
    } else if (name === 'ListItem') {
      eachLine(node, 'cm-live-list-line');
      container(node, 'list');
      line(node.from, 'cm-live-list-start');
    } else if (name === 'ListMark') {
      const layout = containerLines.get(lineStart(node.from));
      if (layout) layout.markerWidth = Math.max(1, /^\d/.test(raw) ? raw.length * .65 : 1);
      if (/^[-+*]$/.test(raw) && /^\s+\[[ xX]\]\s/.test(source.slice(node.to, node.to + 8))) hide(node.from, node.to);
      else if (/^[-+*]$/.test(raw)) plan.widgets.push({ from: node.from, to: node.to, kind: 'bullet', raw, text: ['•', '◦', '▪'][Math.min(2, Math.max(0, containerDepth(node).lists - 1))] });
      else mark(node.from, node.to, 'cm-live-list-number');
    } else if (name === 'TaskMarker') {
      plan.widgets.push({ from: node.from, to: node.to, kind: 'task', raw });
    } else if (name === 'HorizontalRule') {
      plan.widgets.push({ from: node.from, to: node.to, kind: 'rule', raw, block: true });
      return;
    } else if (['StrongEmphasis', 'Emphasis', 'Strikethrough', 'InlineCode'].includes(name)) {
      const css = { StrongEmphasis: 'strong', Emphasis: 'em', Strikethrough: 'strike', InlineCode: 'inline-code' }[name];
      mark(node.from, node.to, `cm-live-${css}`);
      if(name==='InlineCode'){
        const fences=parts.filter(child=>child.name==='CodeMark');
        if(fences.length===2){
          const body=source.slice(fences[0].to,fences[1].from);
          // CommonMark removes one paired padding space (except all-space
          // code). Hide the same padding, so literal backticks remain editable.
          const pad=body.startsWith(' ')&&body.endsWith(' ')&&/[^ \n]/.test(body)?1:0;
          hide(fences[0].from,fences[0].to+pad);hide(fences[1].from-pad,fences[1].to);
        }
        return;
      }
      for (const child of parts.filter(child => /^(EmphasisMark|StrikethroughMark|CodeMark)$/.test(child.name))) hide(child.from, child.to);
    } else if (name === 'Link') {
      const delimiters = parts.filter(child => child.name === 'LinkMark');
      const closing = delimiters.find(child => source.slice(child.from, child.to) === ']');
      if (closing && delimiters[0]) {
        const url = parts.find(child => child.name === 'URL' && child.from >= closing.to);
        const labelNode = parts.find(child => child.name === 'LinkLabel');
        const label = markdownReferenceKey((labelNode && source.slice(labelNode.from + 1, labelNode.to - 1)) || source.slice(delimiters[0].to, closing.from));
        if (!url && !/\]\(\s*\)$/.test(raw) && !references.has(label)) return;
        mark(delimiters[0].to, closing.from, 'cm-live-link');
        hide(node.from, delimiters[0].to); hide(closing.from, node.to);
        // GFM can tokenize URL-looking label text as one opaque URL node,
        // so its entities never reach the ordinary Entity visitor below.
        // Decode label entities as text widgets, never destination text/HTML.
        for(const part of parts.filter(child=>child.name==='URL'&&child.to<=closing.from)){
          const label=source.slice(part.from,part.to);
          for(const match of label.matchAll(/\\.|&(?:#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/gi)){
            if(!match[0].startsWith('&'))continue;
            const text=decodeHTML(match[0]);if(text===match[0])continue;
            plan.widgets.push({from:part.from+match.index,to:part.from+match.index+match[0].length,kind:'text',raw:match[0],text});
          }
        }
        // No href is placed in the DOM. Editing a link never navigates away.
        if (url) blocked.push({ from: url.from, to: node.to });
      }
    } else if (name === 'Autolink') {
      for(let parent=node.parent;parent;parent=parent.parent)if(parent.name==='Link')return;
      mark(node.from, node.to, 'cm-live-link');
      if (raw.startsWith('<') && raw.endsWith('>')) { hide(node.from, node.from + 1); hide(node.to - 1, node.to); }
      return;
    } else if (name === 'HTMLTag' && /^<br\s*\/?>$/i.test(raw)) {
      plan.widgets.push({ from: node.from, to: node.to, kind: 'break', raw }); return;
    } else if (name === 'Escape') {
      hide(node.from, node.from + 1); return;
    } else if (name === 'Entity') {
      plan.widgets.push({ from: node.from, to: node.to, kind: 'text', raw, text: decodeHTML(raw) }); return;
    }
    // Quillite's inline extensions are not part of CommonMark/GFM. Only match
    // within parser-confirmed prose, outside code, image URLs and equations.
    // GFM task text is a Task node, not a Paragraph. It is still editable
    // prose and must share the same inline formatting and closing boundaries.
    if (name === 'Paragraph' || name === 'Task' || /Heading[1-6]$/.test(name)) {
      const addInline = (pattern, css, openLength, closeLength) => {
        for (const match of raw.matchAll(pattern)) {
          const from = node.from + match.index, to = from + match[0].length;
          if (blocksWrapper(from,to,from+openLength(match),to-closeLength(match)) || source[from - 1] === '\\') continue;
          mark(from, to, css); hide(from, from + openLength(match)); hide(to - closeLength(match), to);
        }
      };
      addInline(/==(?=\S)([^\n]*?\S)==/g, 'cm-live-highlight', () => 2, () => 2);
      if (/Heading[1-6]$/.test(name)) addInline(/<span class="reference-new-badge">NEW<\/span>/g, 'reference-new-badge', match => match[0].indexOf('>') + 1, () => 7);
      for (const tag of ['u', 'sup', 'sub', 'kbd', 'mark']) addInline(new RegExp(`<${tag}>([^\\n]*?)<\\/${tag}>`, 'gi'), `cm-live-${tag}`, () => tag.length + 2, () => tag.length + 3);
      for (const [tag,css] of [['strong','strong'],['em','em'],['del','strike']]) addInline(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi'), `cm-live-${css}`, () => tag.length + 2, () => tag.length + 3);
      // Toolbar colors use named, whitelisted palette values, not inline CSS.
      // Decorate the original editable text; never mount document HTML here.
      for (const span of scanTextColorSpans(raw, node.from)) {
        const { from, to, color } = span;
        if (source[from - 1] === '\\' || blocksWrapper(from,to,from+span.openLength,to-span.closeLength)) continue;
        plan.marks.push({ from, to, className: 'cm-live-color', color });
        hide(from, from + span.openLength); hide(to - span.closeLength, to);
      }
    }
    parts.forEach(visit);
  };
  visit(tree.topNode);
  // Line decorations retain the real document/selection. Derive indentation
  // from parser containers, not the number of spaces or literal `>` characters.
  // Repeated quote classes alone cannot represent nested rails in a flat editor.
  for (const [from, layout] of containerLines) {
    if (plan.widgets.some(item => item.block && item.from <= from && from < item.to)) continue;
    const style = [`--live-list-depth:${layout.lists}`, `--live-quote-depth:${layout.quotes.length}`,
      `--live-quote-top:${layout.starts * 13}px`, `--live-quote-bottom:${layout.ends * 13}px`,
      `--live-marker-width:${layout.markerWidth ?? 1}em`];
    if (layout.quotes.length) {
      style.push(`background-image:${layout.quotes.map(() => 'linear-gradient(var(--accent),var(--accent))').join(',')}`);
      style.push(`background-position:${layout.quotes.map(depth => `calc(${depth.quotes * 23}px + ${depth.lists * 1.7}em) 0`).join(',')}`);
      style.push('background-size:3px 100%', 'background-repeat:no-repeat');
    }
    plan.lines.push({ from, className: 'cm-live-container-line', style: style.join(';') });
    // Source indentation is retained in the document, but the visual nesting
    // now has a measured width. Do not remove prefixes inside owned code/media.
    const end = source.indexOf('\n', from);
    const raw = source.slice(from, end < 0 ? source.length : end);
    if (layout.quotes.length && /^[\t >]*$/.test(raw)) line(from, 'cm-live-quote-gap');
    const prefix = /^[\t ]+/.exec(raw);
    if (prefix) hide(from, from + prefix[0].length);
    // Whitespace between quote markers and list markers is also structural.
    if (layout.lists) {
      const prefix = /^(?:[\t ]|>)+/.exec(raw);
      if (prefix) hide(from, from + prefix[0].length);
    }
  }
  for (const reference of noteData.references) {
    // Tables/details own their inner editor's references; never mount a second
    // replacement inside the outer block widget.
    if (!plan.widgets.some(item => item.block && overlaps(item,reference))) plan.widgets.push({...reference,kind:'footnote'});
  }
  // A math expression must never acquire Markdown emphasis or hidden escapes.
  for (const key of ['marks', 'hides', 'widgets']) plan[key] = plan[key].filter(item => noteBlocks.includes(item) || htmlBlocks.includes(item) || item.kind === 'table'
    || !formulas.some(range => overlaps(item, range) && !(key === 'marks' && range.mode === 'inline' && item.from < range.from && item.to > range.to)));
  return plan;
}

function selected(state, item, wholeLine = true) {
  const from = wholeLine ? state.doc.lineAt(item.from).from : item.from;
  const to = wholeLine ? state.doc.lineAt(item.to).to : item.to;
  return state.selection.ranges.some(range => range.empty ? range.head >= from && range.head <= to : range.from <= to && range.to >= from);
}

class LiveWidget extends WidgetType {
  constructor(item, state) { super(); this.item = item; this.doc = state.doc; this.context = state.facet(livePreviewContext); this.label = state.phrase('Click to edit source'); this.taskLabel = state.phrase('Toggle task'); this.tableLabel = state.phrase('Edit table'); this.footnoteLabel = state.phrase('Edit footnote'); this.repairLabel = state.phrase('Separate comment and heading'); }
  eq(other) { return this.doc === other.doc && this.context === other.context && this.item.from === other.item.from && this.item.to === other.item.to && this.item.raw === other.item.raw && this.item.number === other.item.number && this.item.text === other.item.text && this.label === other.label; }
  ignoreEvent() { return this.item.kind !== 'break'; }
  get lineBreaks() { return this.item.kind === 'break' ? 1 : 0; }
  toDOM(view) {
    const item = this.item, root = document.createElement(item.block ? 'div' : 'span');
    root.className = `cm-live-widget cm-live-${item.kind}`; root.contentEditable = 'false';
    if (item.kind === 'break') { root.append(document.createElement('br')); return root; }
    const valid = () => view.state.doc === this.doc && !view.state.readOnly && view.state.field(livePreviewField, false);
    if (item.kind === 'comment-heading-repair') {
      const button=document.createElement('button');button.type='button';button.textContent=this.repairLabel;button.disabled=view.state.readOnly;
      button.onmousedown=event=>{event.preventDefault();event.stopPropagation();};
      button.onclick=event=>{
        event.stopPropagation();if(!valid())return;
        view.dispatch({changes:{from:item.split,insert:'\n'},selection:{anchor:item.split+1},annotations:isolateHistory.of('full'),userEvent:'input.comment-heading',scrollIntoView:true});view.focus();
      };
      root.append(button);return root;
    }
    if (item.kind === 'footnote') {
      const button=document.createElement('button');button.type='button';button.textContent=String(item.number);
      button.setAttribute('aria-label',`${this.footnoteLabel} ${item.number}`);button.title=`${this.footnoteLabel} ${item.number}: ${item.text}`;
      button.disabled=view.state.readOnly;
      const edit=()=>{if(valid())this.context.editFootnote?.(item,view);};
      button.onmousedown=event=>{event.preventDefault();event.stopPropagation();};
      button.onclick=event=>{event.stopPropagation();edit();};
      button.onkeydown=event=>{
        if(event.isComposing||!valid())return;
        if(['Enter',' ','Delete','Backspace','ArrowLeft','ArrowRight','Escape'].includes(event.key)){
          event.preventDefault();event.stopPropagation();
          if(event.key==='Enter'||event.key===' ')edit();
          else if(event.key==='Delete'||event.key==='Backspace'){
            view.dispatch({changes:{from:item.from,to:item.to,insert:''},selection:{anchor:item.from},annotations:isolateHistory.of('full'),userEvent:'delete.footnote'});view.focus();
          }else{view.dispatch({selection:{anchor:event.key==='ArrowLeft'?item.from:item.to}});view.focus();}
        }
      };
      button.addEventListener('copy',event=>{if(valid()&&event.clipboardData){event.preventDefault();event.stopPropagation();event.clipboardData.setData('text/plain',item.raw);}});
      root.append(button);return root;
    }
    const reveal = event => {
      if (!valid()) return;
      event?.preventDefault(); event?.stopPropagation();
      const cellElement = event?.target?.closest?.('td, th');
      const index = cellElement ? Array.from(root.querySelectorAll('td, th')).indexOf(cellElement) : -1;
      const position = item.cells?.[index]?.from ?? item.from;
      view.dispatch({ selection: { anchor: position }, scrollIntoView: true }); view.focus();
    };
    if (item.kind === 'task') {
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = /x/i.test(item.raw);
      input.disabled = view.state.readOnly; input.setAttribute('aria-label', this.taskLabel);
      input.onmousedown = event => { event.preventDefault(); event.stopPropagation(); };
      input.onclick = event => {
        event.stopPropagation(); if (!valid()) { event.preventDefault(); return; }
        view.dispatch({ changes: { from: item.from + 1, to: item.from + 2, insert: input.checked ? 'x' : ' ' }, annotations: isolateHistory.of('full'), userEvent: 'input.task' });
        view.focus();
      };
      root.append(input); return root;
    }
    if (item.kind === 'toc') {
      const title = document.createElement('strong'); title.textContent = 'TOC'; root.append(title);
      for (const heading of item.headings) {
        const link = document.createElement('button'); link.type = 'button'; link.textContent = heading.text;
        link.style.paddingLeft = `${(heading.level - 1) * 12}px`;
        link.onclick = event => { event.stopPropagation(); if (valid()) { view.dispatch({ selection: { anchor: heading.from }, scrollIntoView: true }); view.focus(); } };
        root.append(link);
      }
    } else if (item.kind === 'table' || item.kind === 'html' || item.kind === 'code') {
      const content = document.createElement('div'); content.className = 'cm-live-block-content';
      // The host MUST provide an already-sanitized renderer. No raw HTML fallback.
      if (this.context.render) content.innerHTML = this.context.render(item.raw, item);
      else content.textContent = item.raw;
      root.append(content);
      if (item.kind === 'table' && this.context.editTable) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'cm-live-table-edit'; button.textContent = this.tableLabel;
        button.onmousedown = event => event.preventDefault();
        button.onclick = event => { event.stopPropagation(); if (valid()) this.context.editTable(item, view); };
        root.append(button);
      }
      // HTML details/links never trigger arbitrary navigation in edit mode.
      root.addEventListener('click', reveal);
    } else if (item.kind === 'rule') root.append(document.createElement('hr'));
    else root.textContent = item.kind === 'bullet' ? (item.text || '•') : item.text;
    root.title = this.label; root.setAttribute('aria-label', this.label); root.setAttribute('role', 'button'); root.tabIndex = item.block ? 0 : -1;
    root.onmousedown = event => { if (!event.target.closest('button')) reveal(event); };
    root.onkeydown = event => {
      if (event.target !== root || event.isComposing) return;
      if (event.key === 'Enter' || event.key === ' ') reveal(event);
      else if ((event.key === 'Delete' || event.key === 'Backspace') && valid()) {
        event.preventDefault();
        view.dispatch({ changes: { from: item.from, to: item.to, insert: '' }, selection: { anchor: item.from }, annotations: isolateHistory.of('full'), userEvent: 'delete.live-block' }); view.focus();
      } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Escape') && valid()) {
        event.preventDefault(); view.dispatch({ selection: { anchor: event.key === 'ArrowLeft' ? item.from : item.to }, scrollIntoView: true }); view.focus();
      }
    };
    root.addEventListener('copy', event => {
      if (document.activeElement !== root || view.state.doc !== this.doc || !event.clipboardData) return;
      event.preventDefault(); event.stopPropagation(); event.clipboardData.setData('text/plain', item.raw);
    });
    return root;
  }
}

class SourceNotice extends WidgetType {
  constructor(label) { super(); this.label = label; }
  eq(other) { return this.label === other.label; }
  toDOM() { const node = document.createElement('div'); node.className = 'cm-live-source-notice'; node.textContent = this.label; node.setAttribute('role', 'status'); return node; }
}

export function activeSourceItem(view) {
  if(view.destroyed||view.state.readOnly)return null;
  const live=view.state.field(livePreviewField,false);
  return live?.sourceBlock===null?null:live?.plan.widgets.find(item=>item.from===live.sourceBlock)||null;
}

export function returnSourceToRendered(view) {
  const item=activeSourceItem(view);
  if(!item||view.state.sliceDoc(item.from,item.to)!==item.raw)return false;
  let selection=view.state.selection;
  const fields=item.cells||[{from:item.contentFrom??item.from,to:item.contentTo??item.to}];
  if(selection.ranges.length===1&&selection.main.empty){
    const head=selection.main.head;
    const nearest=fields.reduce((best,field)=>{
      const position=Math.max(field.from,Math.min(field.to,head));
      return !best||Math.abs(position-head)<Math.abs(best.position-head)?{position}:best;
    },null);
    selection=EditorSelection.cursor(nearest?.position??item.from);
  }
  view.dispatch({effects:liveSourceBlock.of(null),selection});
  if(view.state.selection.ranges.length>1||!focusEditableBlock(view))view.focus();
  if(view.requestMeasure)revealSourceReturnCaret(view);
  return true;
}

class SourceReturnWidget extends WidgetType {
  constructor(item, state) { super(); this.sourceItem = item; this.label = state.phrase('Return to rendered view'); }
  eq(other) { return this.sourceItem.from === other.sourceItem.from && this.sourceItem.raw === other.sourceItem.raw && this.label === other.label; }
  ignoreEvent() { return true; }
  toDOM(view) {
    const root = document.createElement('div'); root.className = 'cm-live-source-return';
    // The actionable return control floats above the active source block.
    // This zero-height marker preserves the source decoration's identity.
    root.setAttribute('aria-hidden','true');return root;
  }
}

function decorate(plan, state, sourceBlock = null, searchSelection = false) {
  const decorations = [], lines = new Map(), lineStyles = new Map();
  if (plan.oversized) return Decoration.set([Decoration.widget({ widget: new SourceNotice(state.phrase('Source retained for large document')), block: true, side: -1 }).range(0)]);
  for (const item of plan.lines) {
    if (!lines.has(item.from)) lines.set(item.from, new Set());
    lines.get(item.from).add(item.className);
    if (item.style) lineStyles.set(item.from, item.style);
  }
  // Keep the exposed source visually inside its block, including empty lines
  // and delimiters. Line decorations survive edits without touching Markdown.
  const sourceItem = plan.widgets.find(item => item.from === sourceBlock);
  if (sourceItem) {
    const first = state.doc.lineAt(sourceItem.from).number;
    const last = state.doc.lineAt(Math.max(sourceItem.from, sourceItem.to - 1)).number;
    for (let number = first; number <= last; number++) {
      const from = state.doc.line(number).from;
      if (!lines.has(from)) lines.set(from, new Set());
      const classes = lines.get(from);
      classes.add('cm-live-source-line');
      if (sourceItem.kind === 'comment') classes.add('cm-live-source-comment');
      if (number === first) classes.add('cm-live-source-first');
      if (number === last) classes.add('cm-live-source-last');
    }
  }
  for (const [from, classes] of lines) decorations.push(Decoration.line({ class: [...classes].join(' '),
    ...(lineStyles.has(from) ? { attributes: { style: lineStyles.get(from) } } : {}) }).range(from));
  for (const item of plan.marks) decorations.push(Decoration.mark({ class: item.className, ...(item.color ? { attributes: { style: `color:${item.color}` } } : {}) }).range(item.from, item.to));
  const replacements = [];
  for (const item of plan.widgets) {
    if (item.kind === 'comment-heading-repair') {
      decorations.push(Decoration.widget({widget:new LiveWidget(item,state),block:true,side:-1}).range(item.from));continue;
    }
    const editable = ['table', 'code', 'details', 'html-content', 'comment', 'footnote-definition'].includes(item.kind);
    const stableInline = !item.block && ['task', 'bullet', 'text', 'break', 'footnote'].includes(item.kind);
    if (editable && sourceBlock === item.from) decorations.push(Decoration.widget({ widget: new SourceReturnWidget(item, state), block: true, side: -1 }).range(item.from));
    if (editable ? sourceBlock === item.from : !stableInline && selected(state, item)) continue;
    replacements.push(item);
    const widget = editable ? new EditableBlockWidget(item, state, {
      context: state.facet(livePreviewContext),
      inline: () => [editorLivePreview, livePreviewContext.of(state.facet(livePreviewContext)), state.facet(livePreviewContext).nestedExtensions || []],
      source: (view, position) => view.dispatch({ effects: liveSourceBlock.of(item.from), selection: { anchor: position } }),
    }) : new LiveWidget(item, state);
    // Footnotes, indented code and pipe-less final cells can end exactly at
    // their widget boundary. That end is still editable text, not the next
    // document line; let coordinate queries reach the child at that boundary.
    const editableEnd = editable && (item.contentTo === item.to || item.cells?.some(cell=>cell.to===item.to));
    decorations.push(Decoration.replace({ widget, block: !!item.block, inclusive: false, inclusiveEnd: !!editableEnd, atomicWidget: stableInline }).range(item.from, item.to));
  }
  let lastEnd = -1;
  for (const item of [...plan.hides].sort((a, b) => a.from - b.from || b.to - a.to)) {
    // Keep the displayed text stable during caret placement and drag selection.
    // Syntax editing is an explicit mode, not a side effect of pointer-down.
    if (searchSelection && state.selection.ranges.some(range=>!range.empty&&overlaps(item,range))) continue;
    if (item.from < lastEnd || replacements.some(range => overlaps(item, range)) || (sourceBlock !== null && plan.widgets.some(block => block.from === sourceBlock && overlaps(block, item)))) continue;
    decorations.push(Decoration.replace({ hiddenSyntax: true, inclusive: false }).range(item.from, item.to)); lastEnd = item.to;
  }
  return Decoration.set(decorations, true);
}

const visibleDecorationCache=new WeakMap();
export function visibleLiveDecorations(state) {
  if(visibleDecorationCache.has(state))return visibleDecorationCache.get(state);
  const live=state.field(livePreviewField,false);
  if(!live)return Decoration.none;
  // Compute after both fields, not from livePreviewField's update: diagram
  // ownership itself depends on the live container ranges. Rendering, atomic
  // ranges and pointer placement must agree on which syntax remains visible.
  const ranges=(state.field(editorDiagramField,false)?.items||[])
    .filter(item=>item.open&&!mediaOwnedByInnerEditor(state,item))
    .map(item=>({from:state.doc.lineAt(item.from).from,to:item.to}));
  const decorations=ranges.length?live.decorations.update({filter:(from,to)=>!ranges.some(range=>from>=range.from&&to<=range.to)}):live.decorations;
  visibleDecorationCache.set(state,decorations);return decorations;
}

export const livePreviewField = StateField.define({
  create(state) { const plan = buildLivePlan(state.doc.toString(),footnotesFor(state),state.facet(footnoteBodyContext),imageDefinitionsFor(state)); return { plan, composing: false, sourceBlock: null, formatSelection: null, searchSelection: false, decorations: decorate(plan, state) }; },
  update(value, transaction) {
    let composing = value.composing;
    let formatSelection = transaction.docChanged || transaction.selection ? null : value.formatSelection;
    let sourceBlock = value.sourceBlock === null ? null : transaction.changes.mapPos(value.sourceBlock);
    for (const effect of transaction.effects) if (effect.is(liveSourceBlock)) sourceBlock = effect.value;
    for (const effect of transaction.effects) if (effect.is(liveComposition)) composing = effect.value;
    for (const effect of transaction.effects) if (effect.is(liveFormatSelection)) {
      const ranges = transaction.newSelection.ranges, ends = Array.isArray(effect.value) ? effect.value : ranges.length === 1 ? [effect.value] : [];
      if (ends.length === ranges.length && ends.some(end => end !== null) && ends.every((end, i) => end === null || (!ranges[i].empty && Number.isInteger(end) && end >= ranges[i].to && end <= transaction.newDoc.length))) {
        formatSelection = { selection: transaction.newSelection, ends, end: ends[transaction.newSelection.mainIndex] };
      }
    }
    // Preserve native IME DOM while composition is active. Reparse only after it
    // commits. All ordinary changes are CodeMirror transactions, including undo.
    if (composing) return { ...value, composing, formatSelection: null, decorations: value.decorations.map(transaction.changes) };
    const plan = transaction.docChanged || value.composing || transaction.effects.some(effect=>effect.is(updateFootnotes)||effect.is(updateImageDefinitions)) ? buildLivePlan(transaction.newDoc.toString(),footnotesFor(transaction.state),transaction.state.facet(footnoteBodyContext),imageDefinitionsFor(transaction.state)) : value.plan;
    if (!transaction.docChanged && !transaction.selection && !transaction.reconfigured && !transaction.effects.length && !value.composing) return value;
    if (sourceBlock !== null && !plan.widgets.some(item => item.from === sourceBlock && selected(transaction.state, item))) sourceBlock = null;
    // Only explicit search navigation reveals hidden syntax. Ordinary mouse
    // placement remains stable, and closing search restores the rendered view.
    // F3/Mod-g continue navigating even after the panel has closed.
    let searchSelection = transaction.isUserEvent('select.search') || transaction.isUserEvent('input.replace')
      || !transaction.selection && value.searchSelection;
    if (searchPanelOpen(transaction.startState) && !searchPanelOpen(transaction.state)) searchSelection = false;
    for (const effect of transaction.effects) if (effect.is(editableSearchSelection)) searchSelection = effect.value;
    return { plan, composing, sourceBlock, formatSelection, searchSelection, decorations: decorate(plan, transaction.state, sourceBlock, searchSelection) };
  },
  provide: field => [EditorView.decorations.compute([field], visibleLiveDecorations), renderedContainerRanges.compute([field], state => {
    const live = state.field(field);
    return live.plan.widgets.filter(item => ['table', 'details', 'html-content', 'footnote-definition'].includes(item.kind) && item.from !== live.sourceBlock);
  })],
});

// Text input at a visible formatted line end belongs inside the closing
// markers; a paragraph break belongs after them. Keep this selection adjustment
// private so the newline and its Markdown continuation remain one undo step.
function splitLiveHeading({ state, dispatch }) {
  const range = state.selection.main, live = state.field(livePreviewField, false);
  if (!range.empty || !live) return false;
  const line = state.doc.lineAt(range.head);
  if (!live.plan.lines.some(item => item.from === line.from && item.className.includes('cm-live-heading'))) return false;
  const normalized = normalizeSetextCaret(state, range.head);
  if (normalized) {
    const next = state.update(normalized).state;
    let result;
    const target = { state: next, dispatch: transaction => { result = transaction; } };
    if (!splitLiveHeading(target) && !insertNewlineContinueMarkup(target) && !insertNewlineAndIndent(target)) return false;
    dispatch(state.update({ changes: normalized.changes.compose(result.changes), selection: result.newSelection }), range => {
      const anchor = result.changes.mapPos(normalized.mapPosition(range.anchor)), head = result.changes.mapPos(normalized.mapPosition(range.head));
      return range.empty ? EditorSelection.cursor(head,range.assoc) : EditorSelection.range(anchor,head);
    });
    return true;
  }
  const source = state.doc.toString(), tree = markdownParser.parse(source), position = range.head;
  let heading;
  for (let node = tree.resolveInner(position, -1); node; node = node.parent)
    if (/^ATXHeading[1-6]$/.test(node.name)) { heading = node; break; }
  if (!heading) return false;
  const opening = heading.firstChild, closing = heading.lastChild;
  const contentFrom = opening.to + (source.slice(opening.to,line.to).match(/^[ \t]*/)?.[0].length || 0);
  const hasCloser = closing.name === 'HeaderMark' && closing.from !== opening.from;
  const contentTo = hasCloser ? closing.from - (source.slice(contentFrom,closing.from).match(/[ \t]*$/)?.[0].length || 0) : heading.to;
  if (position < contentFrom || position >= contentTo) return false;
  const edits = [], active = [];
  const visible = (from,to) => {
    let value = source.slice(from,to);
    for (const hide of [...live.plan.hides].sort((a,b)=>b.from-a.from)) {
      if (hide.from >= from && hide.to <= to) value = value.slice(0,hide.from-from)+value.slice(hide.to-from);
    }
    return value.trim().length > 0;
  };
  const addWrapper = (open,close,openText=source.slice(open.from,open.to),closeText=source.slice(close.from,close.to)) => {
    if (position < open.to || position > close.from) return;
    const left = visible(open.to,position), right = visible(position,close.from);
    if (!left && !right) return;
    active.push({ from: open.from, open: openText, close: closeText, left, right });
    if (!left) edits.push({ from: open.from, to: open.to });
    else if (source.slice(open.from,open.to)!==openText) edits.push({ from: open.from, to: open.to, insert: openText });
    if (!right) edits.push({ from: close.from, to: close.to });
    else if (source.slice(close.from,close.to)!==closeText) edits.push({ from: close.from, to: close.to, insert: closeText });
  };
  for (const mark of live.plan.marks) {
    if (!/^cm-live-(strong|em|strike|inline-code|highlight|color|u|sup|sub|kbd|mark)$/.test(mark.className)) continue;
    const open = live.plan.hides.find(hide => hide.from === mark.from), close = live.plan.hides.find(hide => hide.to === mark.to);
    if (open && close) addWrapper(open,close);
  }
  if (live.plan.marks.some(mark => mark.className === 'cm-live-link' && mark.from <= position && position <= mark.to)) {
    const link = findMarkdownLinkAt(source,position);
    if (link && (validLinkDestination(link.url) || (link.kind === 'inline' && !link.url)) && position >= link.labelFrom && position <= link.labelTo) {
      const close = link.kind === 'reference' ? `][${link.reference}]` : link.kind === 'autolink'
        ? `](<${link.url.replaceAll('<','%3C').replaceAll('>','%3E')}>)` : source.slice(link.labelTo,link.to);
      addWrapper({from:link.from,to:link.labelFrom},{from:link.labelTo,to:link.to},'[',close);
      // An autolink's literal URL becomes a Markdown label. Escape characters
      // that would otherwise become label syntax, without changing its target.
      if (link.kind === 'autolink') for (const match of source.slice(link.labelFrom,link.labelTo).matchAll(/[\\`*_~\[\]]/g))
        edits.push({from:link.labelFrom+match.index,insert:'\\'});
    }
  }
  const before = source.slice(contentFrom,position).match(/[ \t]*$/)[0].length;
  const after = source.slice(position,contentTo).match(/^[ \t]*/)[0].length;
  if (before || after) edits.push({ from: position-before, to: position+after });
  if (hasCloser) edits.push({ from: contentTo, to: closing.to });
  edits.sort((a,b)=>a.from-b.from);
  const prep = state.changes(edits), prepared = state.update({ changes: prep, selection: { anchor: prep.mapPos(position) } }).state;
  let newline;
  const target = { state: prepared, dispatch: transaction => { newline = transaction; } };
  if (!insertNewlineContinueMarkup(target) && !insertNewlineAndIndent(target)) return false;
  active.sort((a,b)=>a.from-b.from);
  const closeText = [...active].reverse().filter(mark=>mark.left).map(mark=>mark.close).join('');
  const openText = active.filter(mark=>mark.right).map(mark=>mark.open).join('');
  let breakAt;
  newline.changes.iterChanges((from,to,start,_end,text) => {
    const offset = text.toString().indexOf('\n');
    if (from <= prepared.selection.main.head && to >= prepared.selection.main.head && offset >= 0) breakAt = start+offset;
  });
  const caret = newline.newSelection.main.head;
  const wrap = newline.state.changes([
    ...(closeText ? [{from:breakAt,insert:closeText}] : []),
    ...(openText ? [{from:caret,insert:openText}] : []),
  ]);
  dispatch(state.update({ changes: prep.compose(newline.changes).compose(wrap), selection: { anchor: wrap.mapPos(caret,1) } }));
  return true;
}

function perRangeCommand(state, commands) {
  let working = state, changes = state.changes([]), ranges = [...state.selection.ranges];
  // Work backwards so ordered-list renumbering sees the already inserted later
  // items. Composing avoids overlapping renumber edits in one ChangeSet.
  for (let index = ranges.length - 1; index >= 0; index--) {
    const single = working.update({ selection: EditorSelection.create([ranges[index]]) }).state;
    let result, mapRange;
    const target = { state: single, dispatch: (transaction, mapping) => { result = transaction.state ? transaction : single.update(transaction); mapRange = mapping; } };
    for (const command of commands) if (command(target, changes)) break;
    if (!result) continue;
    changes = changes.compose(result.changes);
    ranges = ranges.map(range => mapRange ? mapRange(range) : range.map(result.changes));
    ranges[index] = result.newSelection.main;
    working = result.state;
  }
  return { changes, selection: EditorSelection.create(ranges, state.selection.mainIndex) };
}

export function editSelectedFootnote(view) {
  const state=view.state,live=state.field(livePreviewField,false),selection=state.selection.main;
  if(!live||live.composing||view.composing||state.readOnly||selection.empty||state.selection.ranges.length!==1)return false;
  const item=live.plan.widgets.find(item=>item.kind==='footnote'&&item.from===selection.from&&item.to===selection.to);
  const edit=state.facet(livePreviewContext).editFootnote;
  if(!item||!edit)return false;edit(item,view);return true;
}

export function insertLiveNewline(view) {
  const state = view.state, live = state.field(livePreviewField, false);
  if (!live || live.composing || view.composing || state.readOnly || (view.dom?.classList.contains('cm-live-inner') && !view.dom.classList.contains('cm-live-prose'))) return false;
  let moved = false;
  let tree;
  const ranges = state.selection.ranges.map((range, index) => {
    let position = range.head, result = range;
    if (!range.empty && live.formatSelection?.selection.eq(state.selection) && live.formatSelection.ends[index] !== null) {
      moved = true;
      position = live.formatSelection.ends[index];
      result = EditorSelection.cursor(position);
    } else if (!range.empty) return range;
    const line = state.doc.lineAt(position), hidden = [];
    visibleLiveDecorations(state).between(line.from, line.to, (from, to, value) => {
      if (value.spec.hiddenSyntax) hidden.push({ from, to });
    });
    let end = line.to;
    for (const marker of hidden.reverse()) if (marker.to === end) end = marker.from;
    if (position >= end && live.plan.lines.some(item => item.from === line.from && item.className.includes('cm-live-heading'))) {
      tree ||= markdownParser.parse(state.doc.toString());
      for (let node = tree.resolveInner(position, -1); node; node = node.parent) {
        if (!/^SetextHeading[12]$/.test(node.name)) continue;
        const marker = node.getChild('HeaderMark');
        if (state.doc.lineAt(marker.from).number === line.number + 1) {
          moved = true;
          return EditorSelection.cursor(node.to);
        }
      }
    }
    if (end === line.to || position < end || position >= line.to) return result;
    moved = true;
    return EditorSelection.cursor(line.to);
  });
  if (!moved && ranges.length === 1 && (!ranges[0].empty || !live.plan.lines.some(item => item.from === state.doc.lineAt(ranges[0].head).from && item.className.includes('cm-live-heading')))) return false;
  const adjusted = state.update({ selection: EditorSelection.create(ranges, state.selection.mainIndex) }).state;
  const projectedNewline = target => {
    const range = target.state.selection.main;
    if (ranges.length < 2 || !renderedEditableBlocks(target.state).some(block =>
      (block.cells || [{from:block.contentFrom,to:block.contentTo}]).some(field => editableFieldContains(target.state.doc, field, range.from, range.to, block.kind)))) return false;
    target.dispatch(target.state.update(replaceLiveSelections(target.state, '\n')));
    return true;
  };
  const newline = perRangeCommand(adjusted, [projectedNewline, splitLiveHeading, insertNewlineContinueMarkup, insertNewlineAndIndent]);
  if (newline.changes.empty) return false;
  view.dispatch({
    ...newline, userEvent: 'input',
    annotations: isolateHistory.of('full'), scrollIntoView: true,
  });
  return true;
}

// Setext headings have no prefix to erase at their visible start. Remove the
// semantic underline instead, retaining its container and paragraph boundary.
export function deleteLiveHeadingBackward(view) {
  const state = view.state, live = state.field(livePreviewField, false);
  if (!live || live.composing || view.composing || state.readOnly || view.dom?.classList.contains('cm-live-inner')) return false;
  if (state.selection.ranges.length > 1) {
    // Generic character deletion must still treat hidden markers/media as
    // atomic, just as the actual EditorView does for a single caret.
    const atoms = view instanceof EditorView ? state.facet(EditorView.atomicRanges).map(provider => provider(view)) : [];
    const fallback = (target, prior) => {
      let deletion;
      if (!deleteCharBackward({ state: target.state, dispatch: transaction => { deletion = transaction; } })) return false;
      const edits = [];
      deletion.changes.iterChanges((from,to) => {
        let changed;
        do {
          changed = false;
          for (const set of atoms) set.map(prior).between(from,to,(start,end) => {
            if (start < from && from < end) { from = start; changed = true; }
            if (start < to && to < end) { to = end; changed = true; }
          });
        } while (changed);
        edits.push({ from, to });
      });
      if (!edits.length) return false;
      target.dispatch(target.state.update({ changes: edits, selection: { anchor: edits[0].from } }));
      return true;
    };
    const result = perRangeCommand(state, [deleteLiveHeadingBackward, deleteMarkupBackward, fallback]);
    if (result.changes.empty) return false;
    view.dispatch({ ...result, userEvent: 'delete.backward', annotations: isolateHistory.of('full'), scrollIntoView: true });
    return true;
  }
  if (state.selection.ranges.some(range => !range.empty || !live.plan.lines.some(item => item.from === state.doc.lineAt(range.head).from && item.className.includes('cm-live-heading')))) return false;
  const tree = markdownParser.parse(state.doc.toString()), markers = new Map();
  for (const range of state.selection.ranges) {
    let heading;
    for (let node = tree.resolveInner(range.head, 1); node; node = node.parent)
      if (/^SetextHeading[12]$/.test(node.name)) { heading = node; break; }
    if (!heading) return false;
    let visibleStart = heading.from;
    visibleLiveDecorations(state).between(heading.from, range.head, (from, to, decoration) => {
      if (decoration.spec.hiddenSyntax && from === visibleStart && to <= range.head) visibleStart = to;
    });
    if (range.head !== visibleStart) return false;
    const marker = heading.getChild('HeaderMark');
    markers.set(marker.from, { from: marker.from, to: marker.to });
  }
  const changes = state.changes([...markers.values()].sort((a,b) => a.from - b.from));
  view.dispatch({ changes, selection: state.selection.map(changes), userEvent: 'delete.backward', annotations: isolateHistory.of('full'), scrollIntoView: true });
  return true;
}

export function renderedSelectionCrossesField(live, selection) {
  if (!live || live.composing || selection.empty) return false;
  return live.plan.widgets.some(item => {
    if (item.from === live.sourceBlock || !['table', 'code', 'details', 'html-content', 'comment', 'footnote-definition'].includes(item.kind)) return false;
    const fields = item.cells || [{ from: item.contentFrom, to: item.contentTo }];
    return fields.some(field => selection.from <= field.to && selection.to >= field.from
      && !(selection.from >= field.from && selection.to <= field.to));
  });
}

export function protectRenderedBlockSelection(transaction) {
  const state = transaction.startState, live = state.field(livePreviewField, false), selection = state.selection.main;
  // The root DOM cannot represent a caret inside another contenteditable. Its
  // asynchronous selection observer must not replace our exact source anchor.
  if (state.field(crossSelectionField, false) && transaction.selection && !transaction.docChanged && transaction.annotation(Transaction.userEvent) === 'select' && !transaction.scrollIntoView
    && !transaction.effects.some(effect => effect.is(crossSelection))) return [];
  // A collapsed caret in a projected code editor is also authoritative. The
  // outer DOM can only describe the replacement widget's edge, not that caret.
  // Discard only this lossy observer echo; explicit pointer/keyboard/search
  // navigation, source mode and nonempty selections must still work normally.
  if (live && !live.composing && selection.empty && state.selection.ranges.length === 1
    && transaction.selection?.ranges.length === 1 && transaction.selection.main.empty
    && !transaction.docChanged && !transaction.effects.length && !transaction.scrollIntoView
    && transaction.annotation(Transaction.userEvent) === 'select') {
    const head = transaction.selection.main.head;
    if (live.plan.widgets.some(item => item.kind === 'code' && item.from !== live.sourceBlock
      && selection.head >= item.contentFrom && selection.head <= item.contentTo
      && head >= item.from && head <= item.to && (head < item.contentFrom || head > item.contentTo))) return [];
  }
  if (!live || live.composing || state.readOnly || !transaction.docChanged || selection.empty || state.selection.ranges.length !== 1
    || transaction.annotation(editableForwardedChange) || transaction.annotation(editableProjectionSync)
    || !(transaction.isUserEvent('input.type') || transaction.isUserEvent('input.paste') || transaction.isUserEvent('delete'))) return transaction;
  const changes = [];
  transaction.changes.iterChanges((from, to, _a, _b, text) => changes.push({ from, to, insert: text.toString() }));
  if (changes.length !== 1 || changes[0].from !== selection.from || changes[0].to !== selection.to) return transaction;
  const source = state.doc.toString(), blocks = renderedEditableBlocks(state);
  const safe = protectedBlockReplacement(source, selection.from, selection.to, changes[0].insert, blocks);
  return safe ? { ...safe, annotations: transaction.annotations, effects: transaction.effects, scrollIntoView: transaction.scrollIntoView } : transaction;
}

export function renderedEditableBlocks(state, sourceContext = false) {
  const source = state.doc.toString(), live = state.field(livePreviewField, false)
    || (sourceContext ? {plan:buildLivePlan(source),sourceBlock:null} : null), blocks = [];
  if (!live) return blocks;
  const collect = (plan, base = 0, depth = 0, localSource = source, parentProjection = null, inFootnote = false) => {
    const map=position=>parentProjection?fieldPosition({from:parentProjection.from,to:parentProjection.to,projection:parentProjection},position):base+position;
    const project=projection=>parentProjection?composeProjections(projection,parentProjection):mapProjection(projection,map);
    const fieldProjection=(from,to)=>codeProjection(localSource,[{from,to}],from,'');
    for (const item of plan.widgets) {
      if (!['table', 'code', 'details', 'html-content', 'comment', 'footnote-definition'].includes(item.kind) || (!depth && item.from === live.sourceBlock && !sourceContext)) continue;
      blocks.push({ ...item, from: map(item.from), to: map(item.to),raw:source.slice(map(item.from),map(item.to)),
        ...(item.projection ? {projection:project(item.projection)} : parentProjection&&!item.cells?{projection:project(fieldProjection(item.contentFrom,item.contentTo))}:{}),
        ...(item.fences ? {fences:item.fences.map(f=>({from:map(f.from),to:map(f.to)}))} : {}),
        ...(item.cells ? { cells: item.cells.map(range => ({ ...range, from: map(range.from), to: map(range.to),...(range.projection||parentProjection?{projection:project(range.projection||fieldProjection(range.from,range.to))}:{}) })) }
          : { contentFrom: map(item.contentFrom), contentTo: map(item.contentTo) }) });
      if (depth < 32 && ['details', 'html-content'].includes(item.kind)) {
        const body = item.cells.find(range => range.role === 'body');
        if (body) {const text=body.projection?.text??localSource.slice(body.from,body.to);collect(buildLivePlan(text,null,inFootnote),map(body.from),depth+1,text,body.projection||parentProjection?project(body.projection||fieldProjection(body.from,body.to)):null,inFootnote);}
      } else if(depth<32 && item.kind==='footnote-definition') {
        collect(buildLivePlan(item.projection.text,null,true),map(item.contentFrom),depth+1,item.projection.text,project(item.projection),true);
      }
    }
  };
  collect(live.plan);
  return blocks;
}

function editableFields(blocks) {
  return blocks.flatMap(block=>(block.cells||[{from:block.contentFrom,to:block.contentTo,projection:block.projection}]).map(range=>({...range,kind:block.kind})))
    .sort((a,b)=>(a.to-a.from)-(b.to-b.from));
}

function rangePrefersPlain(state, range, fields, tree, fieldTrees = new Map()) {
  // Clipboard interpretation follows where insertion starts, including a
  // selection extending out of literal code into following prose.
  const field=fields.find(f=>editableFieldContains(state.doc,f,range.from,range.from,f.kind));
  if (field && (['code','comment'].includes(field.kind) || field.role==='summary')) return true;
  for(let node=tree.resolveInner(range.from,-1);node;node=node.parent){
    if(node.name==='InlineCode' && range.from>node.from && range.from<node.to) return true;
    if(node.name==='CodeText') return true;
  }
  // Raw HTML/footnotes can hide inline-code nodes from the outer parse. Inspect
  // the smallest projected prose field, using its own source-to-body mapping.
  if(field){
    let local=fieldTrees.get(field);
    if(!local){local=markdownParser.parse(fieldText(state.doc.toString(),field));fieldTrees.set(field,local);}
    const offset=fieldOffset(field,range.from);
    for(let node=local.resolveInner(offset,-1);node;node=node.parent)
      if(node.name==='InlineCode'&&offset>node.from&&offset<node.to||node.name==='CodeText')return true;
  }
  return false;
}

// A collapsed root caret in a projected field must delete field text, not its
// source fence, cell delimiter or footnote prefix. The same boundary applies
// to each caret, including one left in trimmed table padding after deletion.
export function deleteLiveFieldContent(view, direction, byWord = false) {
  const state=view.state, live=state.field(livePreviewField,false);
  if(!live || live.composing || view.composing || state.readOnly || (view.dom?.classList.contains('cm-live-inner')&&!view.dom.classList.contains('cm-live-prose'))) return false;
  const fields=editableFields(renderedEditableBlocks(state));
  const joinLines=!byWord&&direction>0&&!live.searchSelection;
  if(!state.selection.ranges.some(r=>fields.some(f=>editableFieldContains(state.doc,f,r.from,r.to,f.kind))||joinLines&&liveLineJoin(state,r))) return false;
  const command=byWord ? (direction<0?deleteGroupBackward:deleteGroupForward) : (direction<0?deleteCharBackward:deleteCharForward);
  const projected=target=>{
    const range=target.state.selection.main;
    const blocks=renderedEditableBlocks(target.state);
    const field=editableFields(blocks).find(f=>editableFieldContains(target.state.doc,f,range.from,range.to,f.kind));
    if(!field){
      const safe=!range.empty&&protectedBlockReplacement(target.state.doc.toString(),range.from,range.to,'',blocks);
      if(!safe)return false;
      target.dispatch(target.state.update(safe));return true;
    }
    const prose=!live.searchSelection&&(field.kind==='footnote-definition'||(['details','html-content'].includes(field.kind)&&field.role==='body'));
    const styled=prose||!live.searchSelection&&field.kind==='table';
    const local=EditorState.create({doc:fieldText(target.state.doc.toString(),field),selection:EditorSelection.range(fieldOffset(field,range.anchor),fieldOffset(field,range.head)),extensions:styled?[livePreviewField,EditorState.transactionFilter.of(unwrapLiveInlineBoundary)]:[]});
    const join=joinLines&&prose&&liveLineJoin(local);
    let tr;if(join)tr=local.update(join);else command({state:local,dispatch:value=>{tr=value;}});
    if(!tr || tr.changes.empty) return true;
    if(styled&&!join){
      // The projected document has no EditorView to supply atomic ranges.
      // Expand deletion over its hidden markers before mapping back to source.
      const atomic=visibleLiveDecorations(local),changes=[];
      tr.changes.iterChanges((from,to,_a,_b,insert)=>{
        let changed;do{changed=false;atomic.between(from,to,(start,end,value)=>{
          if(!value.spec.hiddenSyntax)return;
          if(start<from&&from<end){from=start;changed=true;}
          if(start<to&&to<end){to=end;changed=true;}
        });}while(changed);
        changes.push({from,to,insert});
      });
      const edits=local.changes(changes);
      tr=local.update({changes:edits,selection:local.selection.map(edits),userEvent:direction<0?'delete.backward':'delete.forward'});
    }
    const changes=[];tr.changes.iterChanges((from,to,_a,_b,insert)=>changes.push({from:fieldPosition(field,from),to:fieldPosition(field,to),insert:fieldInsertion(field,insert.toString())}));
    const edits=target.state.changes(changes);
    target.dispatch(target.state.update({changes:edits,selection:range.map(edits)}));
    return true;
  };
  const atoms=view instanceof EditorView?state.facet(EditorView.atomicRanges).map(provider=>provider(view)):[];
  const fallback=(target,prior)=>{
    let tr;if(!command({state:target.state,dispatch:value=>{tr=value;}}))return false;
    const changes=[];tr.changes.iterChanges((from,to)=>{
      let changed;do{changed=false;for(const set of atoms)set.map(prior).between(from,to,(start,end)=>{
        if(start<from&&from<end){from=start;changed=true;}if(start<to&&to<end){to=end;changed=true;}
      });}while(changed);changes.push({from,to});
    });
    if(changes.length)target.dispatch(target.state.update({changes,selection:{anchor:changes[0].from}}));
    return true;
  };
  const join=target=>{const spec=joinLines&&liveLineJoin(target.state);if(!spec)return false;target.dispatch(spec);return true;};
  const result=perRangeCommand(state,[projected,join,...(!byWord&&direction<0?[deleteLiveHeadingBackward,deleteMarkupBackward]:[]),fallback]);
  if(!result.changes.empty)view.dispatch({...result,userEvent:direction<0?'delete.backward':'delete.forward',annotations:isolateHistory.of('full'),scrollIntoView:true});
  return true;
}

// Forward deletion of a line break must not turn the next line's hidden quote
// or list prefix into visible text. Only parser-confirmed containers qualify.
export function deleteLiveLineForward(view) {
  const state=view.state,live=state.field(livePreviewField,false),range=state.selection.main;
  if(!live||live.composing||live.searchSelection||view.composing||state.readOnly)return false;
  if(state.selection.ranges.length>1)return deleteLiveFieldContent(view,1);
  const spec=liveLineJoin(state,range);
  if(!spec)return false;
  view.dispatch({...spec,userEvent:'delete.forward',annotations:isolateHistory.of('full'),scrollIntoView:true});
  return true;
}

function liveLineJoin(state,range=state.selection.main) {
  const live=state.field(livePreviewField,false);
  if(!live||!range.empty)return null;
  const line=state.doc.lineAt(range.head);
  if(range.head!==line.to||line.number===state.doc.lines)return false;
  const next=state.doc.line(line.number+1),source=state.doc.toString();
  if(live.plan.widgets.some(widget=>!['bullet','task'].includes(widget.kind)&&widget.from<=next.to&&widget.to>=next.from))return false;
  let end=next.from;
  markdownParser.parse(source).iterate({from:next.from,to:next.to,enter(ref){
    if(['InlineCode','FencedCode','CodeBlock','HTMLBlock'].includes(ref.name))return false;
    if(['QuoteMark','ListMark','TaskMarker'].includes(ref.name)&&ref.from>=end&&/^[\t ]*$/.test(source.slice(end,ref.from)))end=ref.to;
  }});
  if(end===next.from){
    const prefix=blockDropPrefix(source,next.from+1);
    if(prefix&&next.text.startsWith(prefix))end+=prefix.length;
  }
  if(end===next.from)return false;
  while(end<next.to&&/[\t ]/.test(source[end]))end++;
  return {changes:{from:line.to,to:end},selection:{anchor:line.to}};
}

export function replaceLiveSelections(state, text, plainText = null) {
  // Clipboard text on Windows uses CRLF; CM stores a single line separator.
  // Normalize before calculating selection offsets, including literal fields.
  text = text.replace(/\r\n?/g, '\n');
  plainText = plainText?.replace(/\r\n?/g, '\n') ?? null;
  const blocks=renderedEditableBlocks(state),source=state.doc.toString();
  const fields=editableFields(blocks);
  const pasteFields=plainText!==null?editableFields(renderedEditableBlocks(state,true)):fields;
  const tree=plainText!==null?markdownParser.parse(source):null;
  const fieldTrees=new Map();
  return state.changeByRange(range=>{
    let insert=plainText!==null&&rangePrefersPlain(state,range,pasteFields,tree,fieldTrees)?plainText:text;
    const safe=protectedBlockReplacement(source,range.from,range.to,insert,blocks);
    if(safe)return{changes:safe.changes,range:EditorSelection.cursor(safe.selection.anchor)};
    const field=fields.find(f=>editableFieldContains(source,f,range.from,range.to,f.kind));
    if(field?.kind==='table')insert=safeCellInsertion(insert);
    else if(field?.role==='summary')insert=insert.replace(/\r\n?|\n/g,' ').replaceAll('<','&lt;').replaceAll('>','&gt;');
    else if(field?.projection)insert=fieldInsertion(field,insert.replace(/\r\n?/g,'\n'));
    return{changes:{from:range.from,to:range.to,insert},range:EditorSelection.cursor(range.from+insert.length)};
  });
}

// AI receives Markdown, so a reply may already carry the enclosing source
// prefix. Preserve it once (unlike literal typing/paste, which adds a prefix).
// Keep explicit source editing raw; callers opt in only for live presentation.
export function liveAIReplacement(state, from, to, text) {
  const source=state.doc.toString(),blocks=renderedEditableBlocks(state);
  let insert=text.replace(/\r\n?/g,'\n');
  const fields=editableFields(blocks),entry=fields.find(f=>from>=f.from&&from<=f.to);
  const outerPrefix=entry?.kind!=='table'&&entry?.role!=='summary'&&entry?.projection?.prefix;
  // Cross-block protection re-adds the insertion field's outer prefix. Strip
  // that prefix once from a Markdown reply first, preserving deeper indentation.
  const protectedInsert=outerPrefix?insert.split('\n').map((line,i)=>i&&line.startsWith(outerPrefix)?line.slice(outerPrefix.length):line).join('\n'):insert;
  const safe=protectedBlockReplacement(source,from,to,protectedInsert,blocks);
  if(safe)return safe;
  const field=fields.find(f=>editableFieldContains(source,f,from,to,f.kind));
  if(field?.kind==='table')insert=safeCellInsertion(insert);
  else if(field?.role==='summary')insert=insert.replaceAll('\n',' ').replaceAll('<','&lt;').replaceAll('>','&gt;');
  else if(insert.includes('\n')) {
    const line=state.doc.lineAt(from);
    let prefix=field?.projection?.prefix || '';
    if(!field && from>line.from){
      const candidate=blockDropPrefix(source,from);
      if(candidate && (from===to || candidate===blockDropPrefix(source,to)))prefix=candidate;
    }
    if(prefix)insert=insert.split('\n').map((line,i)=>i&&!line.startsWith(prefix)?prefix+line:line).join('\n');
  }
  return {changes:{from,to,insert},selection:{anchor:from+insert.length}};
}

export function handleCrossBlockTextInput(event, view) {
  const selection = view.state.selection.main;
  if (view.state.selection.ranges.length > 1 && !view.state.readOnly && !view.composing && !event.isComposing
    && event.cancelable && event.inputType === 'insertText' && typeof event.data === 'string'
    && view.state.field(livePreviewField,false)?.plan.widgets.some(w=>view.state.selection.ranges.some(r=>overlaps(w,r)))) {
    // Native DOM has only one selection and cannot express selected text inside
    // several widgets. Apply the original input to authoritative CM ranges.
    event.preventDefault();
    view.dispatch({...replaceLiveSelections(view.state,event.data),userEvent:'input.type',scrollIntoView:true});
    return true;
  }
  if (!view.state.field(crossSelectionField, false) || selection.empty || view.state.selection.ranges.length !== 1 || view.state.readOnly || view.composing || event.isComposing
    || !event.cancelable || event.inputType !== 'insertText' || typeof event.data !== 'string') return false;
  // Use the actual input, not a DOM diff spanning noneditable widgets. The
  // latter can include hidden fence text around the native selection edge.
  event.preventDefault();
  // Replacing a toolbar placeholder must collapse the selection after the
  // inserted text. Mapping the old range alone keeps selecting every new
  // character, so the next keystroke replaces it again.
  view.dispatch({ ...view.state.replaceSelection(event.data), userEvent: 'input.type', scrollIntoView: true });
  return true;
}

export function editorPastePrefersPlain(state) {
  return rangePrefersPlain(state,state.selection.main,editableFields(renderedEditableBlocks(state,true)),markdownParser.parse(state.doc.toString()));
}

export function resolveEditorPasteTarget(root, target) {
  if (!target || root.destroyed || root.state.readOnly) return null;
  const view = EditorView.findFromDOM(target), owner = view && resolveEditableOwner(view);
  if (!owner || owner.view !== root || view.state.readOnly) return null;
  const mode = view === root ? 'rich' : editableClipboardMode(view);
  if (!mode) return null;
  return {view,literalField:mode === 'plain',plainText:mode === 'plain' || editorPastePrefersPlain(view.state)};
}

function liveInlineWrappers(plan,source) {
  return plan.marks.filter(mark=>/^cm-live-(strong|em|strike|highlight|color|link|inline-code|u|sup|sub|kbd|mark)$/.test(mark.className)).map(mark=>{
    if(mark.className==='cm-live-link'&&source[mark.from]==='<'&&source[mark.to-1]==='>'
      &&plan.hides.some(h=>h.from===mark.from&&h.to===mark.from+1)&&plan.hides.some(h=>h.from===mark.to-1&&h.to===mark.to)){
      const label=source.slice(mark.from+1,mark.to-1);
      // CommonMark email autolinks imply mailto; without it the shortened
      // explicit link would silently become a relative document path.
      const target=/^[a-z][a-z\d+.-]*:/i.test(label)?label:`mailto:${label}`;
      return{...mark,open:{from:mark.from,to:mark.from+1},close:{from:mark.to-1,to:mark.to},openText:'[',closeText:`](<${target.replaceAll('&','&amp;').replaceAll('\\','&#92;')}>)`,literalLabel:true};
    }
    const link=mark.className==='cm-live-link',open=plan.hides.find(h=>link?h.to===mark.from:h.from===mark.from),close=plan.hides.find(h=>link?h.from===mark.to:h.to===mark.to);
    // Link labels use the *original* reference name even after their visible
    // text is shortened. Do not accidentally borrow a neighbouring marker.
    if(link){
      if(!open||!close||source.slice(open.from,open.to)!=='[')return null;
      const closing=source.slice(close.from,close.to);
      if(closing===']'||closing==='][]')return{...mark,open,close,closeText:`][${source.slice(open.to,close.from)}]`,implicitReference:true};
    }
    return {...mark,open,close};
  }).filter(mark=>mark?.open&&mark.close);
}

// In live editing the visible label is editable text, not the identifier of a
// shared definition. Freeze an implicit identifier on the first local edit.
// Source/search edits, cross-boundary changes and emptied links keep their
// existing handling. This repair shares the original transaction/history.
export function preserveLiveReferenceLabels(tr) {
  const live=tr.startState.field(livePreviewField,false);
  if(!live||live.composing||live.searchSelection||tr.startState.readOnly||!tr.docChanged
    ||tr.annotation(editableProjectionSync)||tr.annotation(editableForwardedChange)
    ||!(tr.isUserEvent('input')||tr.isUserEvent('delete')))return tr;
  const source=tr.startState.doc.toString(),edits=[];
  for(const mark of liveInlineWrappers(live.plan,source).filter(mark=>mark.implicitReference)){
    let inside=false,outside=false;
    tr.changes.iterChangedRanges((from,to)=>{
      if(from>=mark.open.to&&to<=mark.close.from)inside=true;
      else if(from<mark.close.to&&to>mark.open.from)outside=true;
    });
    if(!inside||outside)continue;
    const from=tr.changes.mapPos(mark.open.to,-1),to=tr.changes.mapPos(mark.close.from,1),end=tr.changes.mapPos(mark.close.to,1);
    const label=tr.newDoc.sliceString(from,to);
    if(!label||label===source.slice(mark.open.to,mark.close.from)
      ||tr.newDoc.sliceString(to,end)!==source.slice(mark.close.from,mark.close.to))continue;
    edits.push({from:to,to:end,insert:mark.closeText});
  }
  if(!edits.length)return tr;
  const changes=ChangeSet.of(edits,tr.newDoc.length);
  return[tr,{changes,selection:tr.newSelection.map(changes),sequential:true}];
}

// Edits inside rendered code are literal. Widen colliding delimiters and add
// CommonMark padding at backtick/space edges without escaping the code body.
// Apply repairs to the same history event; source and forwarded edits bypass it.
export function protectLiveInlineCode(tr) {
  const live=tr.startState.field(livePreviewField,false);
  if(!live||live.composing||live.searchSelection||tr.startState.readOnly||!tr.docChanged
    ||tr.annotation(editableProjectionSync)||tr.annotation(editableForwardedChange)
    ||!(tr.isUserEvent('input')||tr.isUserEvent('delete')))return tr;
  const source=tr.startState.doc.toString(),edits=[],bodies=[];
  for(const mark of liveInlineWrappers(live.plan,source).filter(m=>m.className==='cm-live-inline-code')){
    let inside=false,outside=false;
    tr.changes.iterChangedRanges((from,to)=>{
      if(from>=mark.open.to&&to<=mark.close.from)inside=true;
      else if(from<mark.close.to&&to>mark.open.from)outside=true;
    });
    if(!inside||outside)continue;
    const from=tr.changes.mapPos(mark.open.from,-1),start=tr.changes.mapPos(mark.open.to,-1),end=tr.changes.mapPos(mark.close.from,1),to=tr.changes.mapPos(mark.close.to,1);
    const body=tr.newDoc.sliceString(start,end);
    if(!body)continue;
    const original=source.slice(mark.open.from,mark.open.to).match(/^`+/)?.[0];if(!original)continue;
    const continuation=body.includes('\n')?blockDropPrefix(source,mark.open.from+1):'',autoPrefixes=new Map();
    const continued=tr.isUserEvent('input')&&!tr.isUserEvent('input.type')&&!tr.isUserEvent('input.paste');
    if(continuation&&continued)tr.changes.iterChanges((_from,_to,newFrom,_newTo,insert)=>{
      const text=insert.toString();
      for(const match of text.matchAll(/\n([\t >]*(?:(?:[-+*]|\d+[.)]) +(?:\[[ xX]\] +)?)?)(?=\n|$)/g))autoPrefixes.set(newFrom+match.index+1,match[1]);
    });
    const parts=inlineCodeLines(body,original.length);
    if(continuation)parts.forEach((part,index)=>{
      if(!index)return;
      const position=start+part.from,old=tr.changes.invertedDesc.mapPos(position,-1),prefix=autoPrefixes.get(position)??continuation;
      part.prefix=prefix;
      if(!part.text.startsWith(prefix))return;
      const existing=source.lastIndexOf('\n',old-1)+1===old&&tr.changes.mapPos(old,1)===position;
      // Existing container prefixes and Enter's automatic continuation are
      // structural. A pasted leading > or spaces are still literal code.
      if(existing||continued){
        const offset=part.from+prefix.length;
        Object.assign(part,inlineCodeLines(part.text.slice(prefix.length),original.length)[0]);
        part.from+=offset;part.to+=offset;
      }
    });
    const open=parts[0].open,close=parts.at(-1).close;
    if(tr.newDoc.sliceString(from,start)!==open)edits.push({from,to:start,insert:open});
    if(tr.newDoc.sliceString(end,to)!==close)edits.push({from:end,to,insert:close});
    parts.forEach((part,index)=>{
      bodies.push({start:start+part.from,end:start+part.to});
      if(index<parts.length-1)edits.push({from:start+part.to,to:start+parts[index+1].from,insert:part.close+'\n'+(parts[index+1].prefix||continuation)+parts[index+1].open});
    });
  }
  if(!edits.length)return tr;
  const changes=ChangeSet.of(edits,tr.newDoc.length),position=pos=>changes.mapPos(pos,bodies.some(b=>pos===b.end)?-1:1);
  const selection=EditorSelection.create(tr.newSelection.ranges.map(r=>EditorSelection.range(position(r.anchor),position(r.head))),tr.newSelection.mainIndex);
  return[tr,{changes,selection,sequential:true}];
}

// A mixed comment has visible source rather than an editable block projection.
// Deleting one of its delimiters in live mode must not hide the rest of the file.
export function unwrapLiveCommentBoundary(tr) {
  const live=tr.startState.field(livePreviewField,false);
  if(!live||live.composing||live.searchSelection||tr.startState.readOnly||!tr.docChanged||!tr.isUserEvent('delete')
    ||tr.annotation(editableProjectionSync)||tr.annotation(editableForwardedChange))return tr;
  const source=tr.startState.doc.toString(),edits=[];
  if(!source.includes('<!--'))return tr;
  for(let node=markdownParser.parse(source).topNode.firstChild;node;node=node.nextSibling){
    if(node.name!=='CommentBlock'||node.from===live.sourceBlock)continue;
    const raw=source.slice(node.from,node.to),close=raw.indexOf('-->');
    if(close<0||!raw.slice(close+3).trim())continue;
    const boundaries=[{from:node.from,to:node.from+4},{from:node.from+close,to:node.from+close+3}];
    let touched=false;
    tr.changes.iterChanges((from,to,_a,_b,insert)=>{
      if(!insert.length&&boundaries.some(b=>from<b.to&&to>b.from))touched=true;
    });
    if(!touched)continue;
    // A rendered-mode deletion touching either delimiter unwraps the pair.
    // Otherwise one erased '>' turns all following blocks into a comment.
    // Keep the comment body and every other byte; source mode remains literal.
    for(const b of boundaries){
      const from=tr.changes.mapPos(b.from,1),to=tr.changes.mapPos(b.to,-1);
      if(to>from)edits.push({from,to});
    }
  }
  if(!edits.length)return tr;
  const changes=ChangeSet.of(edits,tr.newDoc.length);
  return[tr,{changes,selection:tr.newSelection.map(changes),sequential:true}];
}

// Backspace/Delete at a hidden inline edge removes one atomic marker. Remove
// its partner as well. Only unwrap that layer: enclosing styles, link targets
// and shared reference definitions must remain untouched.
export function unwrapLiveInlineBoundary(tr) {
  const live=tr.startState.field(livePreviewField,false);
  if(!live||live.composing||live.searchSelection||tr.startState.readOnly||!tr.docChanged||!tr.isUserEvent('delete')
    ||tr.annotation(editableProjectionSync)||tr.annotation(editableForwardedChange))return tr;
  const source=tr.startState.doc.toString(),wrappers=liveInlineWrappers(live.plan,source),edits=new Map();
  tr.changes.iterChanges((from,to,_start,_end,insert)=>{
    if(insert.length)return;
    for(const mark of wrappers){
      const opening=from===mark.open.from&&to===mark.open.to,closing=from===mark.close.from&&to===mark.close.to;
      if(!(opening||closing)||!tr.startState.selection.ranges.some(r=>r.empty&&r.head===(opening?mark.open.to:mark.close.from)))continue;
      const partner=opening?mark.close:mark.open,start=tr.changes.mapPos(partner.from,-1),end=tr.changes.mapPos(partner.to,1);
      if(tr.newDoc.sliceString(start,end)!==source.slice(partner.from,partner.to))continue;
      edits.set(`${start}:${end}`,{from:start,to:end});
      if(mark.className==='cm-live-inline-code'){
        // Removing a hidden code boundary makes its body ordinary prose.
        // Keep literal punctuation inert, including ticks beside another span
        // after the next Backspace joins the two lines.
        const bodyFrom=tr.changes.mapPos(mark.open.to,-1),bodyTo=tr.changes.mapPos(mark.close.from,1);
        const body=tr.newDoc.sliceString(bodyFrom,bodyTo),prefix=blockDropPrefix(source,mark.open.from+1);
        for(const match of body.matchAll(/[!-/:-@\[-`{-~]/g)){
          const position=bodyFrom+match.index,line=tr.newDoc.lineAt(position);
          if(prefix&&line.from>bodyFrom&&tr.newDoc.sliceString(line.from,line.from+prefix.length)===prefix&&position<line.from+prefix.length)continue;
          edits.set(`escape:${position}`,{from:position,insert:'\\'});
        }
      }
    }
  });
  if(!edits.size)return tr;
  const changes=ChangeSet.of([...edits.values()],tr.newDoc.length);
  return[tr,{changes,selection:tr.newSelection.map(changes),sequential:true}];
}

// A visual selection can cut the closing delimiter of one style and the
// opening delimiter of another. Keep both unselected fragments well formed.
// HTML emphasis at these new seams avoids ambiguous runs such as **** or ***
// without inserting visible whitespace or changing the pasted rich fragment.
export function protectLiveInlineReplacement(tr) {
  const live=tr.startState.field(livePreviewField,false);
  if(!live||live.composing||tr.startState.readOnly||!tr.docChanged||tr.startState.selection.ranges.every(r=>r.empty)
    ||tr.annotation(editableProjectionSync)||tr.annotation(editableForwardedChange)
    ||!(tr.isUserEvent('input.paste')||tr.isUserEvent('input.type')||tr.isUserEvent('delete')))return tr;
  const source=tr.startState.doc,wrappers=liveInlineWrappers(live.plan,source.toString()),edits=[],carets=[];
  const visible=(from,to)=>{
    let text=source.sliceString(from,to);
    for(const hide of [...live.plan.hides].sort((a,b)=>b.from-a.from))if(hide.from>=from&&hide.to<=to)text=text.slice(0,hide.from-from)+text.slice(hide.to-from);
    return text.length>0;
  };
  const delimiters=mark=>{
    const tags={'cm-live-strong':'strong','cm-live-em':'em','cm-live-strike':'del','cm-live-highlight':'mark'},tag=tags[mark.className];
    return tag?[`<${tag}>`,`</${tag}>`]:[mark.openText??source.sliceString(mark.open.from,mark.open.to),mark.closeText??source.sliceString(mark.close.from,mark.close.to)];
  };
  const retainLiteralLabel=(mark,from,to)=>{
    if(!mark.literalLabel)return;
    // Autolink label text is literal, unlike a normal Markdown link label.
    // Preserve punctuation/entities without creating emphasis, HTML or math.
    for(const match of source.sliceString(from,to).matchAll(/[\\`*_\[\]~=$&<>]/g)){
      const at=from+match.index;edits.push({from:tr.changes.mapPos(at,-1),to:tr.changes.mapPos(at+1,-1),insert:`&#${match[0].charCodeAt(0)};`});
    }
  };
  tr.changes.iterChanges((from,to,start,end)=>{
    if(from===to||!tr.startState.selection.ranges.some(r=>r.from===from&&r.to===to))return;
    const left=wrappers.filter(m=>m.open.to<=from&&from<m.close.from&&to>=m.close.to);
    const right=wrappers.filter(m=>m.open.from>=from&&m.open.to<=to&&to<=m.close.from);
    if(!left.length&&!right.length)return;
    let closing='',opening='';
    for(const mark of left.sort((a,b)=>b.open.from-a.open.from)){
      const keep=visible(mark.open.to,from),[open,close]=delimiters(mark);
      edits.push({from:tr.changes.mapPos(mark.open.from,-1),to:tr.changes.mapPos(mark.open.to,-1),insert:keep?open:''});
      if(keep){closing+=close;retainLiteralLabel(mark,mark.open.to,from);}
    }
    for(const mark of right.sort((a,b)=>a.open.from-b.open.from)){
      const keep=visible(to,mark.close.from),[open,close]=delimiters(mark);
      edits.push({from:tr.changes.mapPos(mark.close.from,1),to:tr.changes.mapPos(mark.close.to,1),insert:keep?close:''});
      if(keep){opening+=open;retainLiteralLabel(mark,to,mark.close.from);}
    }
    if(start===end){if(closing||opening)edits.push({from:start,insert:closing+opening});}
    else {if(closing)edits.push({from:start,insert:closing});if(opening)edits.push({from:end,insert:opening});}
    carets.push({end,offset:start===end?closing.length:0});
  });
  if(!edits.length)return tr;
  edits.sort((a,b)=>a.from-b.from||(a.to??a.from)-(b.to??b.from));
  const changes=ChangeSet.of(edits,tr.newDoc.length),position=pos=>changes.mapPos(pos,-1)+(carets.find(c=>c.end===pos)?.offset||0);
  const selection=EditorSelection.create(tr.newSelection.ranges.map(r=>EditorSelection.range(position(r.anchor),position(r.head))),tr.newSelection.mainIndex);
  return[tr,{changes,selection,sequential:true}];
}

// CommonMark emphasis (and our == highlight) cannot enclose edge whitespace.
// Keep the whitespace as text, but move it outside the existing hidden markers
// after deletion/paste. Empty rendered wrappers (including links and HTML
// styles) disappear together. Inner wrappers normalize first for nested styles.
export function normalizeLiveInlineWhitespace(tr) {
  const live=tr.startState.field(livePreviewField,false);
  if(!live || live.composing || tr.startState.readOnly || !tr.docChanged
    || tr.annotation(editableProjectionSync) || tr.annotation(editableForwardedChange)
    || !(tr.isUserEvent('delete') || tr.isUserEvent('input.paste'))) return tr;
  const candidates=liveInlineWrappers(live.plan,tr.startState.doc.toString())
    .map(mark=>{
      const {open,close}=mark;
      return {...mark,from:open?.from??mark.from,to:close?.to??mark.to,open,close,trimWhitespace:/^cm-live-(strong|em|strike|highlight)$/.test(mark.className)};
    })
    .filter(mark=>{
      if(!mark.open || !mark.close)return false;
      let inside=false,outside=false;
      tr.changes.iterChangedRanges((from,to)=>{if(from<=mark.to&&to>=mark.from){if(from>=mark.open.to&&to<=mark.close.from)inside=true;else outside=true;}});
      return inside&&!outside;
    }).sort((a,b)=>(a.to-a.from)-(b.to-b.from));
  let repairs=ChangeSet.empty(tr.newDoc.length),doc=tr.newDoc,selection=tr.newSelection;
  for(const mark of candidates){
    const mapped=tr.changes.compose(repairs),from=mapped.mapPos(mark.from,1),to=mapped.mapPos(mark.to,-1);
    const open=tr.startState.doc.sliceString(mark.open.from,mark.open.to),close=tr.startState.doc.sliceString(mark.close.from,mark.close.to);
    const start=from+open.length,end=to-close.length;
    if(start>end || doc.sliceString(from,start)!==open || doc.sliceString(end,to)!==close)continue;
    const body=doc.sliceString(start,end);if(/[\r\n]/.test(body))continue;
    if(!mark.trimWhitespace&&body.length)continue; // Literal/code/HTML spaces remain intentional content.
    const leading=body.match(/^[\t ]*/)[0].length,trailing=body.match(/[\t ]*$/)[0].length;
    const edits=[],moves=[];
    if(!body.trim())edits.push({from,to:start},{from:end,to});
    else {
      if(leading){
        let whitespace=body.slice(0,leading);
        const prefix=doc.sliceString(doc.lineAt(from).from,from).replace(/^(?:(?: {0,3}> ?)|(?: {0,3}(?:[-+*]|\d+[.)]) ))+/,'');
        // Moving four leading spaces out of emphasis must not create code.
        const encoded=/^[\t ]*$/.test(prefix)&&(/\t/.test(prefix+whitespace)||(prefix+whitespace).length>=4);
        if(encoded)whitespace=(whitespace[0]==='\t'?'&#9;':'&#32;')+whitespace.slice(1);
        edits.push({from,to:start+leading,insert:whitespace+open});
        moves.push({from:start,to:start+leading,base:from,offset:pos=>pos===start+leading?whitespace.length+open.length:pos-start+(encoded&&pos>start?(body[0]==='\t'?3:4):0)});
      }
      if(trailing){
        let whitespace=body.slice(-trailing);const line=doc.lineAt(to),suffix=doc.sliceString(to,line.to);
        // Do not introduce a Markdown hard break on the following prose line.
        const encoded=/^ ?$/.test(suffix)&&/ {2}$/.test(whitespace+suffix)&&line.number<doc.lines&&doc.line(line.number+1).text.trim();
        if(encoded)whitespace=whitespace.slice(0,-1)+'&#32;';
        edits.push({from:end-trailing,to,insert:close+whitespace});
        moves.push({from:end-trailing,to:end,base:end-trailing,offset:pos=>close.length+pos-(end-trailing)+(encoded&&pos===end?4:0)});
      }
    }
    if(!edits.length)continue;
    const changes=ChangeSet.of(edits,doc.length),position=pos=>{
      for(const move of moves)if(pos>=move.from&&pos<=move.to)return changes.mapPos(move.base,-1)+move.offset(pos);
      return changes.mapPos(pos,1);
    };
    selection=EditorSelection.create(selection.ranges.map(r=>EditorSelection.range(position(r.anchor),position(r.head))),selection.mainIndex);
    doc=changes.apply(doc);repairs=repairs.compose(changes);
  }
  return repairs.empty?tr:[tr,{changes:repairs,selection,sequential:true}];
}

export const editorLivePreview = [editorCompositionState, imageDefinitionsField, footnotesField, livePreviewField, crossSelectionField,
  EditorState.transactionFilter.of(preserveLiveReferenceLabels),
  EditorState.transactionFilter.of(unwrapLiveInlineBoundary),
  EditorState.transactionFilter.of(unwrapLiveCommentBoundary),
  EditorState.transactionFilter.of(normalizeLiveInlineWhitespace),
  EditorState.transactionFilter.of(protectLiveInlineReplacement),
  EditorState.transactionFilter.of(protectLiveInlineCode),
  sourceReturnPanel(view=>activeSourceItem(view)||activeDiagramSourceItem(view),
    view=>activeSourceItem(view)?returnSourceToRendered(view):returnDiagramSourceToRendered(view)),
  liveSelectionDisplay((view, range) => view.state.field(livePreviewField).plan.widgets.some(widget => overlaps(widget, range))),
  EditorState.transactionFilter.of(tr => {
    if (!tr.docChanged || tr.startState.readOnly) return tr;
    const changes = codeFenceRepairs(tr, renderedEditableBlocks(tr.startState));
    return changes.length ? [tr, {changes, sequential:true}] : tr;
  }), EditorState.transactionFilter.of(protectRenderedBlockSelection),
  EditorState.transactionExtender.of(tr => {
    if (!tr.selection || tr.docChanged || tr.newSelection.ranges.length !== 1 || tr.effects.some(effect => effect.is(crossSelection))) return null;
    // Pointer and ordinary keyboard selections can cross a projected editor
    // without going through its boundary keymap. Give them the same input path.
    const crossing = renderedSelectionCrossesField(tr.startState.field(livePreviewField, false), tr.newSelection.main);
    return { effects: crossSelection.of(crossing) };
  }),
  Prec.highest(EditorView.domEventHandlers({ beforeinput: handleCrossBlockTextInput })),
  ViewPlugin.define(view => { const disposeDrag = installCrossBlockDrag(view), disposeTextDrag = installEditableTextDrag(view, () => renderedEditableBlocks(view.state)); return { destroy() { disposeDrag(); disposeTextDrag(); }, update(update) {
    const types = update.state.facet(livePreviewContext).nestedEffects || [];
    const effects = update.transactions.flatMap(transaction => transaction.effects.filter(effect => types.some(type => effect.is(type))));
    if (effects.length) forwardEditableEffects(view, effects);
    const searchSelection = update.state.field(livePreviewField).searchSelection;
    const searchChanged = searchSelection !== update.startState.field(livePreviewField).searchSelection;
    if (!editorHasComposition(view) && (update.selectionSet || searchChanged)) syncEditableSelections(view, searchSelection);
    if (update.selectionSet || update.docChanged || searchChanged || update.viewportChanged || update.transactions.some(tr=>tr.effects.length)) queueMicrotask(() => {
      // Widget ranges update after the plugin callback. Reconcile again once
      // those ranges are current, including non-empty drag/copy selections.
      if (view.destroyed || editorHasComposition(view) || view.state.doc !== update.state.doc) return;
      const live = view.state.field(livePreviewField, false);
      if (!live) return; // The mode may have changed before this microtask ran.
      syncEditableSelections(view, live.searchSelection);
      syncEditableSearch(view);
      syncEditableSpelling(view);
      if (view.hasFocus && view.state.selection.ranges.length === 1 && view.state.selection.main.empty) focusEditableBlock(view);
    });
  } }; }),
  Prec.highest(keymap.of([{ key: 'Enter', run: editSelectedFootnote }, { key: 'Enter', run: insertLiveNewline },
    { key: 'Backspace', run: view=>deleteLiveFieldContent(view,-1) }, { key: 'Delete', run: deleteLiveLineForward }, { key: 'Delete', run: view=>deleteLiveFieldContent(view,1) }, { key: 'Backspace', run: deleteLiveHeadingBackward },
    { key: 'Mod-Backspace', mac: 'Alt-Backspace', run: view=>deleteLiveFieldContent(view,-1,true) },
    { key: 'Mod-Delete', mac: 'Alt-Delete', run: view=>deleteLiveFieldContent(view,1,true) },
    { key: 'Shift-ArrowLeft', run: view => extendEditableSelection(view, -1) }, { key: 'Shift-ArrowRight', run: view => extendEditableSelection(view, 1) },
    { key: 'Shift-ArrowUp', run: view => extendEditableSelection(view, -1, true) }, { key: 'Shift-ArrowDown', run: view => extendEditableSelection(view, 1, true) },
  ])),
  EditorView.mouseSelectionStyle.of((view, event) => {
    if (event.button !== 0 || event.detail !== 1) return null;
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position === null) return null;
    const live = view.state.field(livePreviewField), line = view.state.doc.lineAt(position);
    let start = line.from, end = line.to;
    const hidden = [];
    visibleLiveDecorations(view.state).between(line.from, line.to, (from, to, value) => {
      if (value.spec.hiddenSyntax) hidden.push({ from, to });
    });
    for (const range of hidden) if (range.from === start) start = range.to;
    for (const range of hidden.slice().reverse()) if (range.to === end) end = range.from;
    const leading = start > line.from && position <= start;
    const trailing = end < line.to && position >= end;
    const boundary = hidden.find(range => position >= range.from && position <= range.to);
    if (!leading && !trailing && !boundary) return null;
    // Bias the DOM caret toward visible text. Otherwise both sides of a hidden
    // prefix/suffix share a DOM offset and native input may edit the markers.
    const assoc = trailing ? -1 : 1;
    let initial = view.state.selection, anchor = leading ? start : trailing ? end : boundary.to;
    return {
      update(update) { initial = initial.map(update.changes); anchor = update.changes.mapPos(anchor); },
      get(next, extend, multiple) {
        const head = next === event ? anchor : view.posAtCoords({ x: next.clientX, y: next.clientY }, false);
        const range = extend ? EditorSelection.range(initial.main.anchor, head) : head === anchor ? EditorSelection.cursor(anchor, assoc) : EditorSelection.range(anchor, head);
        return multiple ? initial.addRange(range) : EditorSelection.create([range]);
      },
    };
  }),
  EditorView.scrollHandler.of(keepVisibleBlockStable),
  EditorView.atomicRanges.of(view => {
    const live = view.state.field(livePreviewField, false);
    return live ? visibleLiveDecorations(view.state).update({ filter: (_from, _to, value) => value.spec.hiddenSyntax === true || value.spec.atomicWidget === true }) : Decoration.none;
  }),
  EditorView.editorAttributes.of({ class: 'cm-live-preview' }),
  EditorView.domEventHandlers({
    mousedown(_event, view) { if (view.state.field(crossSelectionField, false)) view.dispatch({ effects: crossSelection.of(false) }); return false; },
    keydown(event, view) {
      if (view.state.field(crossSelectionField, false) && ((!event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape', 'Tab'].includes(event.key))
        || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a'))) view.dispatch({ effects: crossSelection.of(false) });
      return false;
    },
    focus(event, view) {
      if (event.target === view.contentDOM) queueMicrotask(() => {
        // Focus the editable projection for native typing while retaining the
        // search reveal intent throughout the focus handoff.
        const live = view.state.field(livePreviewField, false);
        if (!view.destroyed && live && !editorHasComposition(view) && view.hasFocus) focusEditableBlock(view, live.searchSelection);
      });
      return false;
    },
  }),
  ViewPlugin.define(view => compositionSession(view, active => {
    if (!view.destroyed && view.state.field(livePreviewField, false)) view.dispatch({effects:liveComposition.of(active)});
  }), {eventHandlers:{
    compositionstart() { this.start(); return false; },
    compositionend() { this.end(); return false; },
  }}),
];

// CodeMirror's default active-line decoration can split a replaced block when
// its logical selection is inside a nested editor, destroying the focused DOM.
export const stableActiveLine = ViewPlugin.fromClass(class {
  constructor(view) { this.update(view); }
  update(update) {
    const state = update.state, live = state.field(livePreviewField, false), ranges = [], seen = new Set();
    for (const selection of state.selection.ranges) {
      if (!selection.empty) continue;
      if (live?.plan.widgets.some(item => item.block && item.from !== live.sourceBlock && selection.head >= item.from && selection.head <= item.to)) continue;
      const from = state.doc.lineAt(selection.head).from;
      if (!seen.has(from)) { seen.add(from); ranges.push(Decoration.line({ class: 'cm-activeLine' }).range(from)); }
    }
    this.decorations = Decoration.set(ranges, true);
  }
}, { decorations: value => value.decorations });
