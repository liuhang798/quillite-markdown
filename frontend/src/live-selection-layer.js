import { Direction, EditorView, RectangleMarker, layer } from '@codemirror/view';

// Native caret hit testing can return either side of a hidden Markdown marker
// for the same pixel. CodeMirror then mistakes a single visual line for two
// wrapped lines and paints to the right edge. Measure visible text a physical
// line at a time; keep CodeMirror's rendering for selections owning widgets.
export function mergeSelectionRects(rectangles) {
  const result = [];
  for (const rect of rectangles.filter(r => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top || a.left - b.left)) {
    const last = result.at(-1);
    // Inline code may report both its padded span and its text box. Painting
    // both darkens the middle of the selection even though the text is one run.
    if(last&&rect.left>=last.left-.5&&rect.right<=last.right+.5&&rect.top>=last.top-.5&&rect.bottom<=last.bottom+.5)continue;
    if (last && Math.abs(last.top - rect.top) < .5 && Math.abs(last.bottom - rect.bottom) < .5 && rect.left <= last.right + .5) {
      last.right = Math.max(last.right, rect.right);
    } else result.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
  }
  return result;
}

export function liveSelectionDisplay(hasWidget, skipRange = () => false) {
  const measured=view=>{
    const {ranges}=view.state.selection,range=ranges[0];
    return ranges.length>1||!range.empty&&(skipRange(view,range)||!hasWidget(view,range));
  };
  return [
    EditorView.editorAttributes.of(view => ({ class: measured(view) ? 'cm-live-measured-selection' : '' })),
    layer({
      // Render over opaque inline code/highlight fills so selection remains
      // visible. The translucent layer never intercepts pointer events.
      above: true,
      class: 'cm-live-selection-layer',
      update: update => update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged,
      markers(view) {
        if (!measured(view)) return [];
        const markers = [], scroll = view.scrollDOM.getBoundingClientRect();
        const baseLeft = (view.textDirection === Direction.LTR ? scroll.left : scroll.right - view.scrollDOM.clientWidth * view.scaleX) - view.scrollDOM.scrollLeft * view.scaleX;
        const baseTop = scroll.top - view.scrollDOM.scrollTop * view.scaleY;
        for (const range of view.state.selection.ranges) {
          // An atomic card draws its own border while retaining the real
          // selection for copy/delete. Do not measure its hidden source DOM.
          if (range.empty || skipRange(view,range) || range.to <= view.viewport.from || range.from >= view.viewport.to) continue;
          let rects = [];
          if (!hasWidget(view, range)) {
            for(const part of selectionLineRanges(view.state.doc,range,view.visibleRanges)){
              const from=view.domAtPos(part.from),to=view.domAtPos(part.to),domRange=view.contentDOM.ownerDocument.createRange();
              domRange.setStart(from.node,from.offset);domRange.setEnd(to.node,to.offset);
              const lineRects=mergeSelectionRects(Array.from(domRange.getClientRects()));
              for(const rect of lineRects)rects.push(rect);
              // An empty selected line still needs a visible newline indicator,
              // not a full-width rectangle or an invisible selection.
              if(!lineRects.length&&part.newline){
                const caret=view.coordsAtPos(part.from);
                if(caret)rects.push({left:caret.left,right:caret.left+Math.max(4,view.defaultCharacterWidth/2),top:caret.top,bottom:caret.bottom});
              }
            }
          }
          if (rects.length) for (const rect of rects) markers.push(new RectangleMarker('cm-selectionBackground',
            rect.left - baseLeft, rect.top - baseTop, rect.right - rect.left, rect.bottom - rect.top));
          else for (const marker of RectangleMarker.forRange(view, 'cm-selectionBackground', range)) markers.push(marker);
        }
        return markers;
      },
    }),
  ];
}

export function selectionLineRanges(doc, range, visibleRanges) {
  const result=[];
  for(const visible of visibleRanges){
    const from=Math.max(range.from,visible.from),to=Math.min(range.to,visible.to);
    if(from>=to)continue;
    let line=doc.lineAt(from);
    while(line.from<to){
      result.push({from:Math.max(from,line.from),to:Math.min(to,line.to),newline:range.to>line.to&&to>line.to});
      if(line.to>=to||line.number===doc.lines)break;
      line=doc.line(line.number+1);
    }
  }
  return result;
}
