// Record whether C4 colours were supplied, rather than inferring intent from
// their value (explicit white or #444 must remain explicit).
export function patchMermaidC4Colors(bundle) {
 const node=/let ([\w$]+)=([\w$]+)\.typeC4Shape\.text,([\w$]+)=\["c4-shape",`c4-\$\{\1\}`\]/gu;
 const boundary=/let ([\w$]+)=([\w$]+)\.append\("g"\),([\w$]+)=([\w$]+)\.bgColor\?\4\.bgColor:"none",([\w$]+)=\4\.borderColor\?\4\.borderColor:"#444444"/gu;
 if([node,boundary].some(pattern=>[...bundle.matchAll(pattern)].length!==1))throw new Error('Mermaid C4 color structure changed: review before packaging.');
 const start=[...bundle.matchAll(boundary)][0].index,end=bundle.indexOf('},"drawBoundary")',start);
 const body=bundle.slice(start,end),font=body.match(/([\w$]+)=([\w$]+)\.fontColor\?\2\.fontColor:"black"/)?.[1];
 if(end<0||!font||body.split('{fill:"#444444"}').length!==4)throw new Error('Mermaid C4 color structure changed: review before packaging.');
 // The upstream boundary fontColor was overwritten by three fixed fills.
 bundle=bundle.slice(0,start)+body.replaceAll('{fill:"#444444"}',`{fill:${font}}`)+bundle.slice(end);
 return bundle.replace(node,(_m,kind,shape,classes)=>`let ${kind}=${shape}.typeC4Shape.text,${classes}=["c4-shape",\`c4-\$\{${kind}\}\`,${shape}.fontColor==null?"c4-auto-color":"c4-explicit-color"]`)
  .replace(boundary,(_m,group,elem,fill,border,stroke)=>`let ${group}=${elem}.append("g").attr("data-c4-boundary",true).attr("data-c4-border-auto",!${border}.borderColor).attr("data-c4-text-auto",!${border}.fontColor),${fill}=${border}.bgColor?${border}.bgColor:"none",${stroke}=${border}.borderColor?${border}.borderColor:"#444444"`);
}
