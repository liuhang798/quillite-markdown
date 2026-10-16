// Compact only the empty lane before the C4 drawing. Move every body element
// together so relationship endpoints, nested boundaries and node geometry stay
// aligned. Do not infer layout from node labels or rewrite the diagram source.
export function c4ViewportPlan(viewBox, title, body) {
  if (!Array.isArray(viewBox) || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) return null;
  const valid = box => box && ['x','y','width','height'].every(key => Number.isFinite(box[key])) && box.width >= 0 && box.height >= 0;
  if (!valid(body) || title && !valid(title)) return null;
  const top = title ? title.y + title.height + 32 : viewBox[1] + 24;
  if (body.y - top <= 64) return null;
  const dy = top - body.y;
  const bottom = Math.max(title ? title.y + title.height : top, body.y + body.height + dy) + 24;
  const height = bottom - viewBox[1];
  if (height <= 0 || height >= viewBox[3]) return null;
  return { dy, viewBox: [viewBox[0], viewBox[1], viewBox[2], height] };
}

function localBounds(svg, element) {
  try {
    const box = element.getBBox();
    const matrix = svg.getScreenCTM().inverse().multiply(element.getScreenCTM());
    const corners = [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]]
      .map(([x,y])=>({x:matrix.a*x+matrix.c*y+matrix.e,y:matrix.b*x+matrix.d*y+matrix.f}));
    const x=Math.min(...corners.map(point=>point.x)), y=Math.min(...corners.map(point=>point.y));
    return {x,y,width:Math.max(...corners.map(point=>point.x))-x,height:Math.max(...corners.map(point=>point.y))-y};
  } catch { return null; }
}

export function compactC4Viewport(svg) {
  if (svg.querySelector(':scope > [data-c4-compacted]')) return;
  const titles = [...svg.querySelectorAll(':scope > text')];
  // C4 emits its optional title as its only direct text child. Unexpected
  // structures are left unchanged instead of guessing which text is a title.
  if (titles.length > 1) return;
  const title = titles[0];
  const graphics = new Set(['g','path','line','polyline','polygon','rect','circle','ellipse','use','image']);
  const elements = [...svg.children].filter(child=>graphics.has(child.localName));
  const boxes = elements.map(element=>localBounds(svg,element));
  if (!boxes.length || boxes.some(box=>!box)) return;
  const titleBounds = title ? localBounds(svg,title) : null;
  if (title && !titleBounds) return;
  // Mermaid leaves an empty root group at (0,0). It has no painted content
  // and must not make an otherwise empty leading lane appear occupied.
  const painted = boxes.filter(box=>box.width>0 || box.height>0);
  if (!painted.length) return;
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
  for (const box of painted) {x=Math.min(x,box.x);y=Math.min(y,box.y);right=Math.max(right,box.x+box.width);bottom=Math.max(bottom,box.y+box.height);}
  const plan = c4ViewportPlan((svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/u).map(Number),titleBounds,{x,y,width:right-x,height:bottom-y});
  if (!plan) return;
  const group = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','g');
  group.setAttribute('data-c4-compacted','true');
  group.setAttribute('transform',`translate(0 ${plan.dy})`);
  svg.insertBefore(group,elements[0]);
  for (const element of elements) group.appendChild(element);
  svg.setAttribute('viewBox',plan.viewBox.join(' '));
  // Keep the intrinsic aspect ratio in step with the new viewBox.
  svg.setAttribute('height',String(plan.viewBox[3]));
}
