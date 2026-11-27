import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { readingTranslationJob } from './reading-translation-job.js';
import { standaloneTranslationSection } from './reading-translation-plan.js';
import { mathExtensions } from './math-rendering.js';
import { prepareFootnotes } from './markdown-formats.js';
import { renderPreparedFootnotes } from './footnote-rendering.js';

export const rtText = {
  'zh-CN':{
    rtWorkspace:'阅读辅助',rtReadSide:'在右栏阅读译文，原文保持不变。',rtSectionHint:'从正在阅读的位置开始',rtAllHint:'按章节依次翻译',rtPrivacyShort:'确认后才发送正文，可能产生模型费用。',rtPrivacyMore:'发送范围与隐私',
    rtSelectionHint:'立即使用已配置的 AI 服务翻译选中文字，可能产生模型费用。',
    rtTitle:'对照翻译',rtSelection:'翻译选中文字',rtSection:'当前章节',rtAll:'整篇文档',rtSelected:'选中文字',rtIntro:'开篇正文',rtScope:'翻译范围',rtTarget:'译为简体中文',rtProvider:'接收正文的 AI 服务',rtPreparing:'正在本地分析文档…',rtCount:'{n} 个章节 · 待发送约 {chars} 个正文字符',rtConsent:'点击确认后才发送所选范围的正文，可能产生模型费用。代码块、公式和链接地址保留在本地；请自行核对正文中的敏感信息。',rtConfirm:'确认并翻译',rtSetup:'配置 AI 服务',rtNoKey:'尚未配置可用的 AI 服务。',rtUnavailable:'无法读取 AI 配置，请检查设置后重试。',rtLarge:'文档过大或无法分析，请先选中一段文字翻译。',rtEmpty:'这个范围内没有可翻译的正文。',rtProgress:'已完成 {done} / {n} 节',rtCancel:'停止翻译',rtResume:'继续未翻译章节',rtRetry:'仅重试失败章节',rtCopy:'复制译文',rtSave:'另存译文…',rtSaved:'已另存译文，原文件未修改。',rtSaveError:'未能保存。请选择新的 .md 文件名，不覆盖已有文件。',rtCopied:'译文已复制',rtCopyError:'复制失败，请重试。',rtPending:'待翻译',rtRunning:'正在翻译…',rtFailed:'翻译失败，请检查网络和 AI 配置后重试。',rtInvalid:'服务返回的译文不完整，可单独重试本节。',rtChanged:'AI 服务配置已变更，请重新打开「对照翻译」确认。',rtDone:'已完成',rtTip:'原文只读。另存仅创建 Markdown，不复制附件；建议保存在原文同目录。',rtTargetChanged:'原文已切换或更新，请重新选择翻译范围。',rtMarkdown:'Markdown 译文',rtCancelDialog:'取消',rtStopped:'已暂停',rtBusy:'翻译中',rtPrivate:'译文仅在本次对照中保留，关闭前可复制或另存。'
  },
  en:{
    rtWorkspace:'Reading tools',rtReadSide:'Read the translation alongside the unchanged original.',rtSectionHint:'The section you are reading',rtAllHint:'Translate each section in order',rtPrivacyShort:'Text is sent only on confirmation. Model charges may apply.',rtPrivacyMore:'What is sent',
    rtSelectionHint:'Translate only the selection now using your configured AI service. Model charges may apply.',
    rtTitle:'Translate side by side',rtSelection:'Translate selection',rtSection:'Current section',rtAll:'Entire document',rtSelected:'Selected text',rtIntro:'Opening text',rtScope:'Translation scope',rtTarget:'Translate to Simplified Chinese',rtProvider:'AI service receiving your text',rtPreparing:'Analyzing locally…',rtCount:'{n} sections · about {chars} characters to send',rtConsent:'Only the selected prose is sent after confirmation. Model charges may apply. Code blocks, formulas and link destinations stay local. Check the text for sensitive information.',rtConfirm:'Confirm and translate',rtSetup:'Configure AI service',rtNoKey:'No AI service is configured.',rtUnavailable:'Cannot read your AI settings. Check them and try again.',rtLarge:'Document too large or unreadable. Try translating a selection.',rtEmpty:'No translatable prose in this scope.',rtProgress:'{done} / {n} sections complete',rtCancel:'Stop',rtResume:'Continue pending sections',rtRetry:'Retry failed sections only',rtCopy:'Copy translation',rtSave:'Save translation as…',rtSaved:'Translation saved separately. The original is unchanged.',rtSaveError:'Could not save. Choose a new .md filename; existing files are never overwritten.',rtCopied:'Translation copied',rtCopyError:'Copy failed. Please try again.',rtPending:'Pending',rtRunning:'Translating…',rtFailed:'Translation failed. Check the network and AI settings before retrying.',rtInvalid:'The service returned an incomplete translation. Retry this section.',rtChanged:'AI settings changed. Reopen translation and confirm the new destination.',rtDone:'Complete',rtTip:'The original is read-only. Saving creates Markdown only; keep it alongside the original for relative attachments.',rtTargetChanged:'The original changed. Select the translation scope again.',rtMarkdown:'Markdown translation',rtCancelDialog:'Cancel',rtStopped:'Paused',rtBusy:'Translating',rtPrivate:'Results last for this comparison only. Copy or save before closing.'
  }
};
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const btn=(text,fn)=>{const b=el('button',text,'text-button');b.type='button';b.addEventListener('click',fn);return b;};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
// No authored HTML, media, remote fetching or active links in the generated
// pane. Preserve all of them verbatim in the separate Markdown export.
const preview=new Marked({gfm:true,extensions:mathExtensions,renderer:{html:token=>esc(token.text),image:token=>esc(token.text || ''),link(token){return this.parser.parseInline(token.tokens);}}});
function renderSafe(source,label,noteNumbers){
  // Source HTML is already escaped. KaTeX (trust:false) can supply only
  // presentation markup here; no href/src or interactive tags survive.
  const prepared=prepareFootnotes(source.replace(/\r\n?/g,'\n'),noteNumbers,{referenceText:n=>'〔'+n+'〕'});
  // A read-only translation has no active links, including footnote backlinks.
  for(const note of prepared.notes)note.referenceCount=0;
  return DOMPurify.sanitize(renderPreparedFootnotes(prepared,preview,label),{ALLOWED_TAGS:['p','br','hr','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','pre','code','table','thead','tbody','tr','th','td','div','span','svg','path','math','semantics','annotation','mrow','mi','mn','mo','msup','msub','msubsup','mfrac','msqrt','mtext','mtable','mtr','mtd'],ALLOWED_ATTR:['class','style','role','aria-hidden','d','viewBox','width','height','preserveAspectRatio','encoding','value'],ALLOW_DATA_ATTR:false});
}

// Planning stays local and is cancelled when its pane or dialog goes away.
function planSource(source,signal){
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(Error('PLAN_CANCELLED'));return;}
    const worker=new Worker(new URL('./reading-translation-worker.js',import.meta.url),{type:'module'});
    const stop=()=>{worker.terminate();signal.removeEventListener('abort',abort);};
    const abort=()=>{stop();reject(signal.reason);};
    signal.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>{stop();if(data.error)reject(Error('PLAN_FAILED'));else resolve(data.sections);};
    worker.onerror=()=>{stop();reject(Error('PLAN_FAILED'));};
    try{worker.postMessage(source);}catch(err){stop();reject(err);}
  });
}

export function installReadingTranslation({current,comparison,bridge,t,sectionLine,selectionSource,configure,notify}) {
  let preparation=0,activeDialog;
  const pin=settings=>({provider:settings.provider,baseUrl:settings.baseUrl,model:settings.model});
  function openPane(scope){
    const life=new AbortController();
    const article=comparison.beginTranslation(t('rtTitle')+' · '+scope,()=>life.abort());
    return {article,signal:life.signal};
  }
  async function translateSelection(source,owner,same){
    const pane=openPane(t('rtSelected')), status=el('p',t('rtPreparing'));
    status.setAttribute('role','status');pane.article.append(status);
    const live=()=>!pane.signal.aborted && same();
    let settings;
    try{settings=await bridge.getAISettings();}catch{/* Offer configuration inline. */}
    if(!live())return;
    if(!settings?.hasApiKey){
      status.textContent=t(settings?'rtNoKey':'rtUnavailable');
      pane.article.append(btn(t('rtSetup'),configure));return;
    }
    let sections;
    try{sections=await planSource(source,pane.signal);}catch{if(live())status.textContent=t('rtLarge');return;}
    if(!live())return;
    if(!sections.some(s=>s.parts.length)){status.textContent=t('rtEmpty');return;}
    show(sections,owner,same,pin(settings),pane);
  }
  async function open(range=null,atLine=null){
    activeDialog?.close();
    const owner=current();if(!owner)return;
    const same=()=>{const d=current();return d && d.path===owner.path && d.session===owner.session && d.content===owner.content;};
    let source;
    try{source=range?selectionSource(range):owner.content;}catch{notify(t('rtTargetChanged'),'warning');return;}
    if(!source?.trim()){notify(t('rtEmpty'),'warning');return;}
    if(source.length>2_000_000){notify(t('rtLarge'),'warning');return;}
    if(range)return translateSelection(source,owner,same);
    const line=atLine || sectionLine(), seq=++preparation;
    const dialog=el('dialog',null,'rt-dialog');activeDialog=dialog;dialog.setAttribute('aria-label',t('rtTitle'));
    const header=el('header'),heading=el('h2',t('rtTitle')),top=el('div',null,'rt-kicker');
    top.append(el('span',t('rtWorkspace')),el('span',t('rtTarget'),'rt-language'));header.append(top,heading,el('p',t('rtReadSide')));
    const body=el('div',null,'rt-body'),choices=el('fieldset'),legend=el('legend',t('rtScope')),options=el('div',null,'rt-choices');
    choices.append(legend,options);
    let scope='section';
    for(const [value,key,hint] of [['section','rtSection','rtSectionHint'],['all','rtAll','rtAllHint']]){
      const label=el('label'),input=el('input'),caption=el('span');
      input.type='radio';input.name='rt-scope';input.value=value;input.checked=scope===value;
      input.addEventListener('change',()=>{if(input.checked){scope=value;update();}});
      caption.append(el('strong',t(key)),el('small',t(hint)));label.append(input,caption);options.append(label);
    }
    const docName=el('strong'),info=el('p',t('rtPreparing')),summary=el('div',null,'rt-estimate');
    summary.append(docName,info);choices.append(summary);
    const service=el('section',null,'rt-service'),destination=el('strong'),endpoint=el('small');
    service.append(el('span',t('rtProvider')),destination,endpoint);
    const privacy=el('details',null,'rt-disclosure');privacy.append(el('summary',t('rtPrivacyMore')),el('p',t('rtConsent')));
    body.append(choices,service,el('p',t('rtPrivacyShort'),'rt-privacy-short'),privacy);
    info.setAttribute('role','status');
    const actions=el('footer'),cancel=btn(t('rtCancelDialog'),()=>dialog.close()),setup=btn(t('rtSetup'),()=>{dialog.close();configure();}),confirm=btn(t('rtConfirm'),start);
    confirm.classList.add('primary');confirm.disabled=true;setup.hidden=true;
    actions.append(cancel,setup,confirm);dialog.append(header,body,actions);document.body.append(dialog);dialog.showModal();
    let sections=[],settings,selected=[],count=0,closed=false;
    const life=new AbortController();
    dialog.addEventListener('close',()=>{closed=true;life.abort();dialog.remove();if(activeDialog===dialog)activeDialog=null;},{once:true});
    const live=()=>!closed && dialog.open && seq===preparation;
    function update(){
      if(!live() || !sections.length)return;
      const index=sections.findLastIndex(s=>s.line<=line);
      selected=scope==='section'?[sections[Math.max(0,index)]]:sections;
      count=selected.reduce((n,s)=>n+s.parts.reduce((n,p)=>n+p.text.length,0),0);
      docName.textContent=scope==='section'?(selected[0].title || t('rtIntro')):owner.name;
      info.textContent=count?t('rtCount',{n:selected.length,chars:count.toLocaleString()}):t('rtEmpty');
      confirm.disabled=!settings?.hasApiKey || !count;
    }
    planSource(source,life.signal).then(result=>{if(live()){sections=result;update();}},()=>{if(live())info.textContent=t('rtLarge');});
    try{
      settings=await bridge.getAISettings();if(!live())return;
      destination.textContent=settings?.hasApiKey ? [settings.provider,settings.model].filter(Boolean).join(' · ') : t('rtNoKey');
      endpoint.textContent=settings?.hasApiKey ? settings.baseUrl : '';
      setup.hidden=!!settings?.hasApiKey;update();
    }catch{if(live()){destination.textContent=t('rtUnavailable');setup.hidden=false;}}
    function start(){
      if(!live() || confirm.disabled)return;
      if(!same()){dialog.close();notify(t('rtTargetChanged'),'warning');return;}
      const chosen=scope==='section'?[standaloneTranslationSection(sections,sections.indexOf(selected[0]))]:selected;
      dialog.close(); show(chosen,owner,same,pin(settings),openPane(t(scope==='section'?'rtSection':'rtAll')));
    }
  }

  function show(sections,owner,same,pin,{article,signal}){
    let job,ready=false,saving=false;
    // Full-document results are painted a chapter at a time. Share numbers,
    // not other chapters' bodies, so forward references survive that split.
    const noteNumbers=new Map();
    if(sections.length>1)for(const s of sections)for(const n of s.noteDefs || [])noteNumbers.set(n.label,{number:n.number});
    article.replaceChildren();
    const controls=el('div',null,'rt-controls'),progress=el('strong'),toolbar=el('div',null,'rt-toolbar'),blocks=el('div');
    progress.setAttribute('role','status');
    const stop=btn(t('rtCancel'),()=>job.stop()),resume=btn(t('rtResume'),()=>job.run()),retry=btn(t('rtRetry'),()=>job.run('failed'));
    const copy=btn(t('rtCopy'),async()=>{const value=job.result();if(value===null)return;try{await navigator.clipboard.writeText(value);notify(t('rtCopied'));}catch{notify(t('rtCopyError'),'warning');}});
    const save=btn(t('rtSave'),async()=>{const value=job.result();if(value===null || saving || !same())return;saving=true;update();
      try{if(await bridge.saveReadingTranslation(owner.path,value))notify(t('rtSaved'));}catch{notify(t('rtSaveError'),'warning');}
      finally{saving=false;update();}
    });
    controls.append(progress,toolbar,el('small',t('rtTip')+' '+t('rtPrivate')));toolbar.append(stop,resume,retry,copy,save);article.append(controls,blocks);
    const views=sections.map(s=>{const box=el('section',null,'rt-section'),title=el('small',s.title || t('rtIntro')),status=el('p'),body=el('div');box.append(title,status,body);blocks.append(box);return {status,body};});
    let lastDone=-1;
    function update(){
      if(!ready || signal.aborted)return;
      const rows=job.rows;let done=0,failed=false,pending=false;
      rows.forEach((r,i)=>{
        if(r.status==='done')done++;else if(r.status==='failed')failed=true;else if(r.status==='pending')pending=true;
        const v=views[i];if(v.last===r.status)return;
        v.last=r.status;
        v.status.textContent=t(({done:'rtDone',pending:'rtPending',running:'rtRunning',failed:r.reason?.includes('PROVIDER_CHANGED')?'rtChanged':r.reason?.includes('RESULT_INVALID')?'rtInvalid':'rtFailed'})[r.status]);
        if(r.status==='done'){v.status.hidden=true;v.body.innerHTML=renderSafe(r.output,t('footnotes'),noteNumbers);}
      });
      const complete=done===rows.length;
      const text=t('rtProgress',{done,n:rows.length})+(complete?'':' · '+t(job.busy?'rtBusy':'rtStopped'));if(progress.textContent!==text)progress.textContent=text;
      stop.hidden=!job.busy;retry.hidden=job.busy || !failed;resume.hidden=job.busy || !pending;
      if(lastDone!==done){copy.disabled=!complete;lastDone=done;}save.disabled=!complete || saving;
    }
    job=readingTranslationJob(sections,{current:same,send:(id,parts)=>bridge.translateReadingParts({...pin,requestId:id,parts}),cancel:id=>bridge.cancelReadingTranslation(id),changed:update});
    signal.addEventListener('abort',()=>job.dispose(),{once:true});ready=true;update();void job.run();
  }
  return {open};
}
