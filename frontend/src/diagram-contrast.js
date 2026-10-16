// Only reason about opaque computed sRGB colours. Gradients, transparency and
// unknown colour spaces need actual backdrop information, not a guessed fill.
export function opaqueDiagramRGB(value) {
 const match=String(value).trim().match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
 if(!match||match[4]!==undefined&&Number(match[4])!==1)return null;
 const channels=match.slice(1,4).map(Number);
 return channels.every(n=>Number.isFinite(n)&&n>=0&&n<=255)?channels:null;
}
export function diagramContrastRatio(a,b) {
 const luminance=rgb=>rgb.map(n=>{n/=255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[0.2126,0.7152,0.0722][i],0);
 const left=luminance(a),right=luminance(b);return (Math.max(left,right)+0.05)/(Math.min(left,right)+0.05);
}
export function automaticDiagramForeground(fill,foreground) {
 const background=opaqueDiagramRGB(fill),text=opaqueDiagramRGB(foreground);
 if(!background||!text||diagramContrastRatio(background,text)>=4.5)return null;
 return diagramContrastRatio(background,[0,0,0])>=diagramContrastRatio(background,[255,255,255])?'#000000':'#FFFFFF';
}

export function normalizeFlowchartNodeContrast(svg) {
 for(const node of svg.querySelectorAll('g.node')) {
  const shape=node.querySelector('.label-container'),label=node.querySelector('g.label');
  // Mermaid materializes style/classDef fills on the shape and explicit text
  // colours on the label group/text. Do not recolour default themed nodes.
  if(!shape?.style.fill||!label)continue;
  const text=[...label.querySelectorAll('text,tspan')];if(!text.length)continue;
  const hasForeground=element=>!!(element.style.fill||element.style.color||element.hasAttribute('fill')||element.hasAttribute('color'));
  if(hasForeground(node)||hasForeground(label)||[...label.querySelectorAll('*')].some(hasForeground))continue;
  let opaque=Number(getComputedStyle(shape).fillOpacity)===1;
  for(let ancestor=shape;ancestor&&ancestor!==svg;ancestor=ancestor.parentElement)if(Number(getComputedStyle(ancestor).opacity)!==1)opaque=false;
  if([label,...label.querySelectorAll('*')].some(element=>Number(getComputedStyle(element).opacity)!==1))opaque=false;
  if(!opaque)continue;
  const fill=getComputedStyle(shape).fill;
  // Different inherited text paints are not a single automatic foreground.
  const foregrounds=new Set(text.map(element=>getComputedStyle(element).fill));
  if(foregrounds.size!==1)continue;
  const color=automaticDiagramForeground(fill,[...foregrounds][0]);if(!color)continue;
  for(const element of text)element.style.setProperty('fill',color,'important');
 }
}
