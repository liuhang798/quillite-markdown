const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const finiteBox=b=>b&&['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.width>0&&b.height>0;
const inside=(p,b)=>p.x>b.x+0.01&&p.x<b.x+b.width-0.01&&p.y>b.y+0.01&&p.y<b.y+b.height-0.01;
const overlaps=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+0.01&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+0.01;

// Open-rectangle intersection: touching a port/border is not crossing a node.
export function c4SegmentHitsBox(a,b,box) {
 if(!finitePoint(a)||!finitePoint(b)||!finiteBox(box))return false;
 let low=0,high=1;
 for(const[axis,size]of [['x','width'],['y','height']]){
  const d=b[axis]-a[axis],min=box[axis]+0.01,max=box[axis]+box[size]-0.01;
  if(Math.abs(d)<1e-8){if(a[axis]<=min||a[axis]>=max)return false;continue;}
  const v=(min-a[axis])/d,w=(max-a[axis])/d;low=Math.max(low,Math.min(v,w));high=Math.min(high,Math.max(v,w));
  if(low>=high)return false;
 }
 return low<high;
}

function port(point,boxes,paddingX,paddingY){
 const owner=boxes.find(b=>point.x>=b.x-2&&point.x<=b.x+b.width+2&&point.y>=b.y-2&&point.y<=b.y+b.height+2);
 if(!owner)return null;
 const sides=[{d:Math.abs(point.x-owner.x),x:-1,y:0},{d:Math.abs(point.x-owner.x-owner.width),x:1,y:0},{d:Math.abs(point.y-owner.y),x:0,y:-1},{d:Math.abs(point.y-owner.y-owner.height),x:0,y:1}].sort((a,b)=>a.d-b.d);
 if(sides[0].d>2)return null;
 return{x:point.x+sides[0].x*(paddingX+1),y:point.y+sides[0].y*(paddingY+1),owner};
}

// Shortest orthogonal path on obstacle-edge coordinates. Direction is part of
// the search state so fewer bends win, without changing the two original ports.
export function c4ObstacleRoute(start,end,boxes,label={width:0,height:0,offsetX:0,offsetY:0},reserved=[]) {
 if(!finitePoint(start)||!finitePoint(end)||!boxes.length||!boxes.every(finiteBox)||!['width','height'].every(k=>Number.isFinite(label[k])&&label[k]>=0))return null;
 const ox=Number(label.offsetX)||0,oy=Number(label.offsetY)||0;
 const horizontal=Math.abs(end.x-start.x)>=Math.abs(end.y-start.y),lane=Math.max(0,Number(label.lane)||0);
 const channelWidth=Math.max(label.width,Number(label.channelWidth)||0),channelHeight=Math.max(label.height,Number(label.channelHeight)||0);
 const extra=lane*((horizontal?channelHeight:channelWidth)+18);
 // Caption clearance belongs across the route, not in the narrow gap the
 // port must exit through. A long caption must not seal that exit corridor.
 const paddingX=horizontal?12:Math.max(20,channelWidth/2+Math.abs(ox)+12)+extra,paddingY=horizontal?Math.max(20,channelHeight/2+Math.abs(oy)+12)+extra:12;
 const a=port(start,boxes,paddingX,paddingY),b=port(end,boxes,paddingX,paddingY);if(!a||!b)return null;
 const obstacles=boxes.map(r=>({x:r.x-paddingX,y:r.y-paddingY,width:r.width+2*paddingX,height:r.height+2*paddingY}));
 if(obstacles.some(r=>inside(a,r)||inside(b,r)))return null;
 const xs=new Set([a.x,b.x]),ys=new Set([a.y,b.y]);
 for(const r of obstacles){xs.add(r.x);xs.add(r.x+r.width);ys.add(r.y);ys.add(r.y+r.height);}
 const xx=[...xs].sort((a,b)=>a-b),yy=[...ys].sort((a,b)=>a-b),width=xx.length;
 const begin=yy.indexOf(a.y)*width+xx.indexOf(a.x),goal=yy.indexOf(b.y)*width+xx.indexOf(b.x);
 const point=id=>({x:xx[id%width],y:yy[Math.floor(id/width)]});
 const heap=[],best=new Map(),previous=new Map();
 const push=item=>{heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].cost<=item.cost)break;heap[i]=heap[p];i=p;}heap[i]=item;};
 const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let child=2*i+1;if(child+1<heap.length&&heap[child+1].cost<heap[child].cost)child++;if(heap[child].cost>=last.cost)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;};
 const initial=begin*3;best.set(initial,0);push({key:initial,cost:0});let finish=null,steps=0;
 // Bound layout work on adversarial documents; no route means keep the engine
 // geometry, never drop the relation or invent a connection to another node.
 while(heap.length&&steps++<20000){
  const current=pop();if(best.get(current.key)!==current.cost)continue;
  const id=Math.floor(current.key/3),direction=current.key%3,p=point(id);if(id===goal){finish=current.key;break;}
  const x=id%width,y=Math.floor(id/width);
  for(const[nx,ny,dir]of [[x-1,y,1],[x+1,y,1],[x,y-1,2],[x,y+1,2]]){
   if(nx<0||nx>=width||ny<0||ny>=yy.length)continue;
   const next=ny*width+nx,q=point(next);
   if(obstacles.some(r=>c4SegmentHitsBox(p,q,r)))continue;
   const cost=current.cost+Math.abs(q.x-p.x)+Math.abs(q.y-p.y)+(direction&&direction!==dir?24:0),key=next*3+dir;
   if(cost>=(best.get(key)??Infinity))continue;
   best.set(key,cost);previous.set(key,current.key);push({key,cost});
  }
 }
 if(finish===null)return null;
 const points=[];for(let key=finish;key!==undefined;key=previous.get(key))points.push(point(Math.floor(key/3)));points.reverse();points.unshift(start);points.push(end);
 // Remove collinear waypoints while retaining the original endpoints.
 for(let i=1;i<points.length-1;){const p=points[i-1],q=points[i],r=points[i+1];if((p.x===q.x&&q.x===r.x)||(p.y===q.y&&q.y===r.y))points.splice(i,1);else i++;}
 // Curved boundaries can place a valid port slightly inside the conservative
 // bounding box. Only its outward lead may leave its own box (port tolerance 2).
 if(points.slice(1).some((p,i)=>boxes.some(r=>!(i===0&&r===a.owner)&&!(i===points.length-2&&r===b.owner)&&c4SegmentHitsBox(points[i],p,r))))return null;
 const segments=points.slice(1).map((p,i)=>({p,q:points[i],length:Math.hypot(p.x-points[i].x,p.y-points[i].y)})).sort((a,b)=>Number((b.p.y===b.q.y)===horizontal)-Number((a.p.y===a.q.y)===horizontal)||b.length-a.length);
 // Prefer another position on the long outer channel over a short shared
 // endpoint segment, where a later relation could run through the caption.
 const slots=segments.flatMap(({p,q,length})=>[0.5,0.3,0.7].map(t=>({x:p.x*t+q.x*(1-t)+ox,y:p.y*t+q.y*(1-t)+oy,length})));
 const position=slots.find(p=>![...boxes,...reserved].some(b=>overlaps({x:p.x-label.width/2,y:p.y-label.height/2,width:label.width,height:label.height},b)));
 if(!position)return null;
 return{points,label:position,d:points.map((p,i)=>`${i?'L':'M'} ${p.x},${p.y}`).join(' ')};
}

export function c4SelfLoop(point,boxes,label,reserved=[]){
 if(!finitePoint(point)||!boxes.every(finiteBox))return null;
 const outward=port(point,boxes,1,1);if(!outward)return null;
 const nx=(outward.x-point.x)/2,ny=(outward.y-point.y)/2,tx=-ny,ty=nx;
 const width=Math.max(0,label.width),height=Math.max(0,label.height),lane=Math.max(0,Number(label.lane)||0),ox=Number(label.offsetX)||0,oy=Number(label.offsetY)||0;
 if(![width,height,lane,ox,oy].every(Number.isFinite))return null;
 for(let attempt=0;attempt<12;attempt++){
  const radius=Math.max(100,((nx?width:height)+40)/0.75)+(lane+attempt)*((nx?width:height)+24)/0.75;
  const spread=Math.max(75,(nx?height:width)+28)+(lane+attempt)*32;
  // Try both sides of neighbouring captions before enlarging the loop into
  // another node. The tangent offset keeps both endpoints on the original port.
  for(const shift of [0,-1,1,-2,2].map(n=>n*((nx?height:width)+40))){
  const bend=shift/0.75;
  const c1={x:point.x+nx*radius+tx*(bend-spread),y:point.y+ny*radius+ty*(bend-spread)},c2={x:point.x+nx*radius+tx*(bend+spread),y:point.y+ny*radius+ty*(bend+spread)};
  const position={x:point.x+nx*radius*0.75+tx*shift+ox,y:point.y+ny*radius*0.75+ty*shift+oy};
  if([...boxes,...reserved].some(b=>overlaps({x:position.x-width/2,y:position.y-height/2,width,height},b)))continue;
  const points=[point];for(let i=1;i<=100;i++){const t=i/100,u=1-t;points.push({x:(u*u*u+t*t*t)*point.x+3*u*u*t*c1.x+3*u*t*t*c2.x,y:(u*u*u+t*t*t)*point.y+3*u*u*t*c1.y+3*u*t*t*c2.y});}
  if(points.slice(1).some((p,i)=>boxes.some(b=>c4SegmentHitsBox(points[i],p,b))))continue;
  return{points,label:position,d:`M ${point.x},${point.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${point.x},${point.y}`};
  }
 }
 return null;
}

function boundsIn(group,element){
 try{
  const b=element.getBBox(),m=group.getScreenCTM().inverse().multiply(element.getScreenCTM());
  const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  return{x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
 }catch{return null;}
}

function nodeParts(node){
 const parts=[...node.querySelectorAll('.basic:not(g),.basic > rect,.basic > circle,.basic > path')];
 return parts.length?parts:[node];
}

function selfPort(group,node,point){
 if(!node||!['c4-person','c4-external_person'].some(name=>node.classList.contains(name)))return point;
 // Upstream places a person's zero-length self-edge at the neck, inside the
 // head. Attach it to the outer body boundary instead of drawing through it.
 const body=node.querySelector('.basic > rect'),box=body&&boundsIn(group,body);
 if(!finiteBox(box))return point;
 return{x:box.x+box.width,y:box.y+box.height/2};
}

export function c4CaptionPosition(candidates,label,boxes,segments=[]){
 if(![label.width,label.height].every(n=>Number.isFinite(n)&&n>0)||!boxes.every(finiteBox))return null;
 for(const p of candidates){
  if(!finitePoint(p))continue;
  const rect={x:p.x-label.width/2,y:p.y-label.height/2,width:label.width,height:label.height};
  if(boxes.some(b=>overlaps(rect,b))||segments.some(([a,b])=>c4SegmentHitsBox(a,b,rect)))continue;
  return p;
 }
 return null;
}

function separateC4Captions(svg){
 const groups=[...svg.querySelectorAll('[data-c4-relation]')];
 let remainingSamples=50000;
 // Bounded pass: no new text, nodes or relation geometry. Keep explicit label
 // offsets while trying positions on the original curve away from crossings.
 for(const group of groups){
  const edge=group.querySelector(':scope > path,:scope > line'),texts=[...group.querySelectorAll(':scope > text')];
  if(!edge||!texts.length)continue;
  const labels=texts.map(t=>boundsIn(group,t));if(!labels.every(finiteBox))continue;
  const x=Math.min(...labels.map(b=>b.x)),y=Math.min(...labels.map(b=>b.y)),right=Math.max(...labels.map(b=>b.x+b.width)),bottom=Math.max(...labels.map(b=>b.y+b.height));
  const label={width:right-x+6,height:bottom-y+2},center={x:(x+right)/2,y:(y+bottom)/2};
  const boxes=[...svg.querySelectorAll('.c4-shape'),...groups.filter(g=>g!==group).flatMap(g=>[...g.querySelectorAll(':scope > text')])].map(el=>boundsIn(group,el)).filter(finiteBox);
  const segments=[];
  for(const other of groups){
   if(other===group)continue;
   const path=other.querySelector(':scope > path,:scope > line');if(!path)continue;
   const length=path.getTotalLength(),count=Math.max(1,Math.min(256,Math.ceil(length/8))),m=group.getScreenCTM().inverse().multiply(path.getScreenCTM());
   // Keep pathological dense graphs from monopolising the editor. Exhaustion
   // retains remaining labels; never assume uninspected edges are collision-free.
   if(remainingSamples<count+1)return;
   remainingSamples-=count+1;
   let last;
   for(let i=0;i<=count;i++){const q=path.getPointAtLength(length*i/count),p={x:m.a*q.x+m.c*q.y+m.e,y:m.b*q.x+m.d*q.y+m.f};if(last)segments.push([last,p]);last=p;}
  }
  if(c4CaptionPosition([center],label,boxes,segments))continue;
  const length=edge.getTotalLength(),ox=Number(group.dataset.c4OffsetX)||0,oy=Number(group.dataset.c4OffsetY)||0;
  const candidates=[0.35,0.65,0.2,0.8,0.1,0.9].map(t=>{const p=edge.getPointAtLength(length*t);return{x:p.x+ox,y:p.y+oy};});
  const position=c4CaptionPosition(candidates,label,boxes,segments);if(!position)continue;
  for(const item of group.querySelectorAll(':scope > text,:scope > [data-c4-label-background]'))item.setAttribute('transform',`translate(${position.x-center.x} ${position.y-center.y}) ${item.getAttribute('transform')||''}`.trim());
 }
}

export function routeC4AroundNodes(svg){
 const nodes=[...svg.querySelectorAll('.c4-shape')],lanes=new Map();
 for(const group of svg.querySelectorAll('[data-c4-relation]')){
  if(group.hasAttribute('data-c4-routed'))continue;
  const edge=group.querySelector(':scope > line,:scope > path'),texts=[...group.querySelectorAll(':scope > text')];
  if(!edge||!texts.length)continue;
  const boxes=nodes.flatMap(n=>nodeParts(n).map(p=>boundsIn(group,p))),labels=texts.map(t=>boundsIn(group,t));
  if(!boxes.every(finiteBox)||!labels.every(finiteBox))continue;
  const self=group.dataset.c4From&&group.dataset.c4From===group.dataset.c4To;
  const length=edge.getTotalLength();if(!Number.isFinite(length)||length<=0&&!self)continue;
  let start=edge.getPointAtLength(0),end=edge.getPointAtLength(length);
  if(self){const node=nodes.find(n=>n.id===`${svg.id}-${group.dataset.c4From}`);start=selfPort(group,node,start);end=start;}
  let collision=self||labels.some(a=>boxes.some(b=>overlaps(a,b))),last=start;
  for(let i=1,count=Math.min(2000,Math.ceil(length/8));i<=count&&!collision;i++){
   const next=edge.getPointAtLength(length*i/count);collision=boxes.some(b=>c4SegmentHitsBox(last,next,b));last=next;
  }
  if(!collision)continue;
  const x=Math.min(...labels.map(b=>b.x)),y=Math.min(...labels.map(b=>b.y)),right=Math.max(...labels.map(b=>b.x+b.width)),bottom=Math.max(...labels.map(b=>b.y+b.height));
  const pair=JSON.stringify([group.dataset.c4From,group.dataset.c4To].sort()),lane=lanes.get(pair)||0;
  const reserved=[...svg.querySelectorAll('[data-c4-relation] > text')].filter(t=>t.parentElement!==group).map(t=>boundsIn(group,t)).filter(finiteBox);
  const options={width:right-x+6,height:bottom-y+2,offsetX:Number(group.dataset.c4OffsetX)||0,offsetY:Number(group.dataset.c4OffsetY)||0,lane};
  // All lanes for a pair share the widest caption's spacing. Per-caption
  // spacing lets a short later label collapse back into an earlier long one.
  for(const other of svg.querySelectorAll('[data-c4-relation]')){
   if(JSON.stringify([other.dataset.c4From,other.dataset.c4To].sort())!==pair)continue;
   const captions=[...other.querySelectorAll(':scope > text')].map(t=>boundsIn(group,t)).filter(finiteBox);
   if(!captions.length)continue;
   options.channelWidth=Math.max(options.channelWidth||0,Math.max(...captions.map(b=>b.x+b.width))-Math.min(...captions.map(b=>b.x))+6);
   options.channelHeight=Math.max(options.channelHeight||0,Math.max(...captions.map(b=>b.y+b.height))-Math.min(...captions.map(b=>b.y))+2);
  }
  const plan=self?c4SelfLoop(start,boxes,options,reserved):c4ObstacleRoute(start,end,boxes,options,reserved);
  if(!plan)continue;
  const path=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','path');
  for(const attr of edge.attributes)if(!['x1','y1','x2','y2','d'].includes(attr.name))path.setAttribute(attr.name,attr.value);
  path.setAttribute('d',plan.d);path.setAttribute('fill','none');edge.replaceWith(path);
  if(self&&(Math.abs(start.x-Number(group.dataset.c4StartX))>0.1||Math.abs(start.y-Number(group.dataset.c4StartY))>0.1))group.setAttribute('data-c4-port-adjusted','person-self-boundary');
  const dx=plan.label.x-(x+right)/2,dy=plan.label.y-(y+bottom)/2;
  for(const label of group.querySelectorAll(':scope > text,:scope > [data-c4-label-background]'))label.setAttribute('transform',`translate(${dx} ${dy}) ${label.getAttribute('transform')||''}`.trim());
  group.setAttribute('data-c4-routed','true');
  lanes.set(pair,lane+1);
 }
 separateC4Captions(svg);
}
