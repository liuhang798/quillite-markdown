import { translatedMarkdown } from './reading-translation-plan.js';

// Only one in-flight batch. On failure stop the queue: no automatic retries
// against a broken endpoint. Completed batches survive a user-initiated retry.
export function readingTranslationJob(sections, {send,cancel,changed,current}) {
  const rows=sections.map(section=>({section,values:[],status:'pending',output:null}));
  let epoch=0, busy=false, request='', disposed=false;
  function stop() {
    epoch++; busy=false;
    const id=request; request='';
    if(id) Promise.resolve(cancel(id)).catch(()=>{});
    for(const row of rows) if(row.status==='running') row.status='pending';
    if(!disposed) changed();
  }
  function dispose(){disposed=true;stop();}
  async function run(mode='pending') {
    if(disposed || busy || !current()) return;
    busy=true;const gen=++epoch;
    const alive=()=>!disposed && epoch===gen && current();
    try {
      for(const row of rows) {
        if(row.status!==mode) continue;
        row.status='running';changed();
        try {
          while(row.values.length<row.section.parts.length) {
            if(!alive())return;
            const parts=[];let size=0;
            for(let i=row.values.length;i<row.section.parts.length && parts.length<32;i++) {
              const s=row.section.parts[i].text;
              if(parts.length && size+s.length>6000)break;
              parts.push(s);size+=s.length;
            }
            request=crypto.randomUUID();
            const result=await send(request,parts);
            if(!alive())return;
            request='';
            if(!Array.isArray(result) || result.length!==parts.length || result.some(s=>typeof s!=='string' || !s.trim() || /[\r\n\0]/.test(s)))throw Error('TRANSLATION_RESULT_INVALID');
            row.values.push(...result);
          }
          row.output=translatedMarkdown(row.section,row.values);row.status='done';
        }catch(err){
          if(!alive())return;
          request='';row.status='failed';row.reason=String(err?.message || err);break;
        }
        changed();
      }
    }finally{
      if(gen===epoch && !disposed){busy=false;request='';changed();}
    }
  }
  return {rows,run,stop,dispose,get busy(){return busy;}, result(){return rows.every(r=>r.status==='done') ? rows.map(r=>r.output).join('') : null;}};
}
