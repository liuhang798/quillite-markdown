// Preserve ordered interactions only for C4Dynamic. Other C4 types retain the
// upstream relationship replacement semantics. All C4 relations get inert SVG
// metadata for readable captions; only dynamic relations receive extra lanes.
export function patchMermaidC4Dynamic(bundle) {
 const type=bundle.match(/function\(\)\{return ([\w$]+)\},"getC4Type"/u)?.[1];
 const duplicate=/([\w$]+)=([\w$]+)\.find\(([\w$]+)=>\3\.from===([\w$]+)&&\3\.to===([\w$]+)\);if\(\1\?/gu;
 const dynamic=/([\w$]+)==="C4Dynamic"&&\(([\w$]+)\.label\.text=([\w$]+)\+": "\+\2\.label\.text\)/gu;
 const drawing=/let ([\w$]+)=([\w$]+)\.append\("g"\),([\w$]+)=0;for\(let ([\w$]+) of ([\w$]+)\)\{let ([\w$]+)=\4\.textColor\?/gu;
 const kinds='case 17:return 11;case 18:return 15;case 19:return 16;case 20:return 17;case 21:return 18;';
 if(!type||bundle.split(kinds).length!==2||[duplicate,dynamic,drawing].some(pattern=>[...bundle.matchAll(pattern)].length!==1))throw new Error('Mermaid C4 dynamic structure changed: review before packaging.');
 let result=bundle.replace(duplicate,(_m,old,rels,rel,from,to)=>`${old}=${type}!=="C4Dynamic"&&${rels}.find(${rel}=>${rel}.from===${from}&&${rel}.to===${to});if(${old}?`);
 result=result.replace(dynamic,(_m,kind,rel,index)=>`${kind}==="C4Dynamic"&&(${rel}.quilliteDynamic=true,${rel}.label.text=${index}+": "+${rel}.label.text)`);
 // Upstream sets the type only when reducing the complete document, after
 // addRel has run. Set it when lexing the header too, for every C4 kind.
 result=result.replace(kinds,['C4Context','C4Container','C4Component','C4Dynamic','C4Deployment'].map((kind,i)=>`case ${17+i}:return this.yy.setC4Type("${kind}"),${[11,15,16,17,18][i]};`).join(''));
 result=result.replace(drawing,(_m,group,elem,index,rel,rels,color)=>{
  const attrs=[['data-c4-relation','true'],['data-c4-from',`${rel}.from`],['data-c4-to',`${rel}.to`],['data-c4-dynamic-from',`${rel}.quilliteDynamic?${rel}.from:null`],['data-c4-dynamic-to',`${rel}.quilliteDynamic?${rel}.to:null`],['data-c4-start-x',`${rel}.startPoint.x`],['data-c4-start-y',`${rel}.startPoint.y`],['data-c4-end-x',`${rel}.endPoint.x`],['data-c4-end-y',`${rel}.endPoint.y`],['data-c4-offset-x',`parseInt(${rel}.offsetX)||0`],['data-c4-offset-y',`parseInt(${rel}.offsetY)||0`],['data-c4-line-auto',`!${rel}.lineColor`],['data-c4-text-auto',`!${rel}.textColor`]].map(([key,value])=>`.attr("${key}",${value})`).join('');
  return `let quilliteC4Relations=${elem}.append("g"),${index}=0;for(let ${rel} of ${rels}){let ${group}=quilliteC4Relations.append("g")${attrs};let ${color}=${rel}.textColor?`;
 });
 return result;
}
