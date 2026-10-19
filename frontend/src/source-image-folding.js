import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { embeddedImageRanges } from './ai-input.js';

export const sourceImagePhrases = {
  'Base64 image': 'Base64 图片',
  'Image data hidden; copying and saving preserve the complete source': '图片数据已省略；复制和保存仍保留完整源码'
};

class ImageDataSummary extends WidgetType {
  constructor(label, hint) { super(); this.label=label; this.hint=hint; }
  eq(other) { return this.label===other.label && this.hint===other.hint; }
  toDOM() {
    const span=document.createElement('span');
    span.className='cm-source-image-summary';span.textContent=this.label;
    span.title=this.hint;span.setAttribute('aria-label',this.label+'. '+this.hint);
    return span;
  }
}

// Display-only replacement: document bytes, clipboard and history remain the
// original data URI. Keep src/alt, image dimensions and surrounding syntax editable.
export function imageDataDecorations(state, from=0, to=state.doc.length) {
  return embeddedImageRanges(state.doc.sliceString(from,to)).filter(item=>item.end-item.start>=256).map(item=>{
    const comma=item.value.indexOf(','), format=item.value.slice(11,item.value.indexOf(';')).toUpperCase();
    const length=item.value.length-comma-1, padding=item.value.endsWith('==')?2:item.value.endsWith('=')?1:0;
    const bytes=Math.floor(length*3/4)-padding;
    const size=bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MiB`:bytes>=1024?`${Math.round(bytes/1024)} KiB`:`${bytes} B`;
    const widget=new ImageDataSummary(`${state.phrase('Base64 image')} · ${format} · ${size}`,state.phrase('Image data hidden; copying and saving preserve the complete source'));
    return Decoration.replace({widget,inclusive:false}).range(from+item.start,from+item.end);
  });
}

export const sourceImageFoldField=StateField.define({
  create(state) { return Decoration.set(imageDataDecorations(state),true); },
  update(value,tr) {
    if(tr.reconfigured) return Decoration.set(imageDataDecorations(tr.state),true);
    if(!tr.docChanged) return value;
    // Rescan only changed logical lines. Unchanged large payloads are mapped,
    // not repeatedly scanned while typing in neighboring paragraphs.
    const lines=[];
    tr.changes.iterChangedRanges((_a,_b,from,to)=>{
      const start=tr.newDoc.lineAt(from).from,end=tr.newDoc.lineAt(to).to,last=lines.at(-1);
      if(last && start<=last.to) last.to=Math.max(last.to,end);
      else lines.push({from:start,to:end});
    });
    return value.map(tr.changes).update({
      filter:(from,to)=>!lines.some(line=>from<=line.to&&to>=line.from),
      add:lines.flatMap(line=>imageDataDecorations(tr.state,line.from,line.to)),sort:true
    });
  },
  provide:field=>EditorView.decorations.from(field)
});
export const sourceImageFolding=[sourceImageFoldField,EditorView.atomicRanges.of(view=>view.state.field(sourceImageFoldField))];
