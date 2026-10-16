// Keep the original border intersections and arrow markers. Parallel dynamic
// interactions receive separate quadratic lanes, in document order.
export function c4RelationLane(start,end,index,count,step,reverse=false) {
 if(![start.x,start.y,end.x,end.y,index,count,step].every(Number.isFinite)||count<2||index<0||index>=count||step<=0)return null;
 const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);if(length<1)return null;
 const lane=(index-(count-1)/2)*step*(reverse?-1:1),x=-dy/length*lane,y=dx/length*lane;
 return{dx:x,dy:y,d:`M ${start.x},${start.y} Q ${(start.x+end.x)/2+2*x},${(start.y+end.y)/2+2*y} ${end.x},${end.y}`};
}

// Project label bounds onto the lane normal: horizontal edges need label
// height, vertical edges need width, and diagonal edges need both.
export function c4RelationLaneSpacing(start,end,boxes) {
 const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
 if(!Number.isFinite(length)||length<1)return 32;
 let step=32;
 for(const box of boxes)if(Number.isFinite(box.width)&&Number.isFinite(box.height)&&box.width>=0&&box.height>=0)
  step=Math.max(step,Math.abs(dy/length)*box.width+Math.abs(dx/length)*box.height+18);
 return step;
}

export function separateC4DynamicRelations(svg) {
 const pairs=new Map();
 for(const group of svg.querySelectorAll('[data-c4-dynamic-from][data-c4-dynamic-to]')) {
  const from=group.getAttribute('data-c4-dynamic-from'),to=group.getAttribute('data-c4-dynamic-to');
  const key=JSON.stringify([from,to].sort());if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(group);
 }
 for(const groups of pairs.values()) {
  if(groups.length<2||groups.some(g=>g.hasAttribute('data-c4-lane')))continue;
  const first=groups[0],boxes=[];
  for(const group of groups){let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(const text of group.querySelectorAll('text')){const b=text.getBBox();left=Math.min(left,b.x);right=Math.max(right,b.x+b.width);top=Math.min(top,b.y);bottom=Math.max(bottom,b.y+b.height);}boxes.push({width:right-left,height:bottom-top});}
  const step=c4RelationLaneSpacing({x:Number(first.getAttribute('data-c4-start-x')),y:Number(first.getAttribute('data-c4-start-y'))},{x:Number(first.getAttribute('data-c4-end-x')),y:Number(first.getAttribute('data-c4-end-y'))},boxes);
  groups.forEach((group,index)=>{
   const old=group.querySelector(':scope > line,:scope > path');if(!old)return;
   const start={x:Number(group.getAttribute('data-c4-start-x')),y:Number(group.getAttribute('data-c4-start-y'))},end={x:Number(group.getAttribute('data-c4-end-x')),y:Number(group.getAttribute('data-c4-end-y'))};
   const plan=c4RelationLane(start,end,index,groups.length,step,group.getAttribute('data-c4-dynamic-from')>group.getAttribute('data-c4-dynamic-to'));if(!plan)return;
   const path=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','path');
   for(const attr of old.attributes)if(!['x1','x2','y1','y2','d'].includes(attr.name))path.setAttribute(attr.name,attr.value);
   path.setAttribute('d',plan.d);old.replaceWith(path);
   for(const text of group.querySelectorAll(':scope > text'))text.setAttribute('transform',`translate(${plan.dx} ${plan.dy}) ${text.getAttribute('transform')||''}`.trim());
   group.setAttribute('data-c4-lane',String(index));
  });
 }
}

// C4 draws connectors through the text baseline. Mask the connector beneath
// each caption after lane placement; retain measured text and its transform.
export function protectC4Labels(svg, background) {
 for(const group of svg.querySelectorAll('[data-c4-relation]')) {
  for(const old of group.querySelectorAll(':scope > [data-c4-label-background]'))old.remove();
  for(const text of group.querySelectorAll(':scope > text')) {
   const box=text.getBBox();
   if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0)continue;
   // Upstream passes the edge midpoint as the LEFT of a text box. Centre
   // each caption there instead, keeping explicit offsetX and lane shifts.
   if(!text.hasAttribute('data-c4-label-centered')) {
    const midpoint=(Number(group.getAttribute('data-c4-start-x'))+Number(group.getAttribute('data-c4-end-x')))/2;
    const offset=Number(group.getAttribute('data-c4-offset-x'))||0;
    const shift=midpoint+offset-box.x-box.width/2;
    if(Number.isFinite(shift))text.setAttribute('transform',`translate(${shift} 0) ${text.getAttribute('transform')||''}`.trim());
    text.setAttribute('data-c4-label-centered','');
   }
   const rect=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','rect');
   rect.setAttribute('data-c4-label-background','');rect.setAttribute('aria-hidden','true');
   rect.setAttribute('x',String(box.x-3));rect.setAttribute('y',String(box.y-1));
   rect.setAttribute('width',String(box.width+6));rect.setAttribute('height',String(box.height+2));
   if(text.hasAttribute('transform'))rect.setAttribute('transform',text.getAttribute('transform'));
   rect.style.setProperty('fill',background,'important');rect.style.setProperty('stroke','none','important');
   rect.style.setProperty('pointer-events','none');group.insertBefore(rect,text);
  }
 }
}

// Accept only fragment references owned by this SVG, never external URLs.
export function c4LocalMarkerId(value) {
 return /^url\(\s*["']?#([^\s"'()]+)["']?\s*\)$/u.exec(value || '')?.[1] || null;
}

// Mermaid shares arrow definitions across every relationship. Recolouring a
// shared marker would silently change other edges, so clone only when needed.
// Keep the engine's geometry/orientation and resolve references inside this SVG.
export function matchC4ArrowColors(svg) {
 const markers=new Map([...svg.querySelectorAll('marker[id]')].map(marker=>[marker.id,marker]));
 const colored=new Map();let sequence=0;
 for(const edge of svg.querySelectorAll('[data-c4-relation] > line, [data-c4-relation] > path')) {
  const color=getComputedStyle(edge).stroke;
  if(!color || color==='none')continue;
  for(const attribute of ['marker-start','marker-end']) {
   const id=c4LocalMarkerId(edge.getAttribute(attribute)),original=markers.get(id);
   if(!original)continue;
   const paths=[...original.querySelectorAll('path')];
   if(!paths.length || paths.every(path=>getComputedStyle(path).fill===color && getComputedStyle(path).stroke===color))continue;
   const key=JSON.stringify([id,color]);let marker=colored.get(key);
   if(!marker) {
    marker=original.cloneNode(true);
    do {marker.id=`${id}-c4-color-${++sequence}`;} while(svg.ownerDocument.getElementById(marker.id));
    marker.setAttribute('data-c4-original-marker',id);
    for(const child of marker.querySelectorAll('[id]'))child.removeAttribute('id');
    for(const path of marker.querySelectorAll('path')) {
     path.style.setProperty('fill',color,'important');
     path.style.setProperty('stroke',color,'important');
    }
    original.parentElement.appendChild(marker);colored.set(key,marker);
   }
   edge.setAttribute(attribute,`url(#${marker.id})`);
  }
 }
}
