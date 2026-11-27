// Private associations, not authored data-* attributes. Static large tables
// keep their inexpensive preview until a specific cell needs an editor.
const targets=new WeakMap(), refs=new WeakMap();
export function decorateTableImage(img,ref,labels){
  if(!ref || !img.closest('td,th') || img.closest('svg,math') || img.dataset.remoteImageBlocked==='true')return;
  const doc=img.ownerDocument,wrap=doc.createElement('span'),tools=doc.createElement('span');
  wrap.className='qm-cell-image';tools.className='qm-cell-image-actions';
  const width=img.getAttribute('width');
  if(/^\d{1,3}%$/.test(width||'')){wrap.style.width=width;img.style.width='100%';}
  img.replaceWith(wrap);wrap.append(img,tools);refs.set(img,ref);
  for(const name of ['view','size']){
    const b=doc.createElement('button');b.type='button';b.textContent=labels[name];
    targets.set(b,{img,name});tools.append(b);
  }
}
export const tableImageAction=node=>targets.get(node);
export const tableImageRef=img=>refs.get(img);
