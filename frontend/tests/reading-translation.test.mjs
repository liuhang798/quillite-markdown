import test from 'node:test';
import assert from 'node:assert/strict';
import {translationPlan,translatedMarkdown,standaloneTranslationSection} from '../src/reading-translation-plan.js';
import {marked,Marked} from 'marked';
import {mathExtensions} from '../src/math-rendering.js';
import {readingTranslationJob} from '../src/reading-translation-job.js';
import {prepareFootnotes} from '../src/markdown-formats.js';
import {renderPreparedFootnotes} from '../src/footnote-rendering.js';
import {scanMarkdownFormulas} from '../src/formula-editing.js';

test('translation refuses an incomplete formula scan rather than treating it as zero formulas',()=>{
  assert.throws(()=>scanMarkdownFormulas('A $formula$ here.',{maxTokens:1,strict:true}),/FORMULA_SCAN_BUDGET/);
  assert.deepEqual(scanMarkdownFormulas('A $formula$ here.',{maxTokens:1}),[]);
  assert.throws(()=>translationPlan('>'.repeat(129)+' A $formula$ here.'),/FORMULA_SCAN_BUDGET/);
});

test('full translation preview keeps shared note numbers when the reference and definition render apart',()=>{
  const sections=translationPlan('# One\n\nRead[^a] then[^b].\n\n# Two\n\n[^b]: Second note\n\n# Three\n\n[^a]: First note');
  const inherited=new Map(sections.flatMap(s=>(s.noteDefs || []).map(n=>[n.label,{number:n.number}])));
  const body=prepareFootnotes(sections[0].raw,inherited,{referenceText:n=>'〔'+n+'〕'});
  assert.match(body.markdown,/Read〔1〕 then〔2〕/);
  const note=prepareFootnotes(sections[1].raw,inherited);
  assert.equal(note.notes[0].number,2);
  assert.match(renderPreparedFootnotes(note,new Marked(),'Footnotes'),/<li id="fn-2" value="2">/);
});

test('copied footnotes keep their own external reference links and images but not unused declarations',()=>{
  const source='# One\n\nRead this[^n].\n\n# Two\n\n[^n]: See [doc][manual].\n    ![picture][fig]\n\n# Three\n\n[fig]: ./chart.png\n[manual]: ./book.md\n[unused]: ./draft.md';
  const sections=translationPlan(source),s=standaloneTranslationSection(sections,0);
  const out=translatedMarkdown(s,s.parts.map(p=>p.text));
  const html=renderPreparedFootnotes(prepareFootnotes(out),new Marked(),'Footnotes');
  assert.match(html,/src="\.\/chart.png"/);assert.match(html,/href="\.\/book.md"/);assert.doesNotMatch(out,/draft\.md/);
});

test('outgoing requests omit every adjacent formula and URL-bearing TeX without dropping following prose',async()=>{
  const md=new Marked({extensions:mathExtensions});
  for(const formula of ['$alpha$$beta$',String.raw`$x + \text{www.example.com}$`,String.raw`$x=\text{https://example.org}$`]){
    const source='Cost $10 before '+formula+' after the calculation.';
    const sent=[],j=readingTranslationJob(translationPlan(source),{current:()=>true,changed(){},cancel(){},send:async(_,p)=>{sent.push(...p);return p.map(s=>'译'+s);}});
    await j.run();assert.deepEqual(sent,['Cost $10 before','after the calculation.']);
    assert.equal((md.parse(source).match(/data-math-source=/g)||[]).length,formula.includes('beta')?2:1);
    assert.ok(j.result().includes(formula));
  }
});

test('standalone chapter includes exactly its footnotes, unchanged, without expanding AI scope',async()=>{
  for(const eol of ['\n','\r\n']){
    const source=['# Chapter','','Read this[^n] and again[^n]. Ignore \x60[^fake]\x60.','','[^n]: local shadow','','# End','','[^n]: Local-only technical note','    second line with $alpha$$beta$.','','    third line','[^fake]: private unused note'].join(eol);
    const sections=translationPlan(source),s=standaloneTranslationSection(sections,0),sent=[];
    const j=readingTranslationJob([s],{current:()=>true,changed(){},cancel(){},send:async(_,p)=>{sent.push(...p);return p.map(x=>'译'+x);}});
    await j.run();const out=j.result(), parsed=prepareFootnotes(out.replaceAll('\r\n','\n'));
    assert.equal(parsed.notes.length,1);assert.equal(parsed.notes[0].referenceCount,2);
    assert.equal(parsed.notes[0].text,'Local-only technical note\nsecond line with $alpha$$beta$.\n\nthird line');
    assert.doesNotMatch(out,/private unused note/);assert.doesNotMatch(sent.join(' '),/technical note|second line|third line|private unused note/);
    if(eol==='\r\n')assert.doesNotMatch(out,/\r(?!\n)|(?<!\r)\n/);
    assert.equal(sections.map(s=>s.raw).join(''),source);
  }
});

test('translate prose only, retain exact technical markup, line endings and offsets',()=>{
  const src=['---','private: YAMLSECRET','---','# First','','Run **our tool** with \x60npm SECRET\x60. See [the guide](https://local/SECRET).','','> Paragraph with $SECRET_i$ and \\(SECRET\\).','','~~~js','# SECRET','~~~','','## Second','','| Field | Meaning |','| --- | --- |','| Name | user@example.com |','','<svg viewBox="0 0 10 10">','','# SECRET','</svg>','','Afterwards.'].join('\r\n');
  const sections=translationPlan(src), parts=sections.flatMap(s=>s.parts.map(p=>p.text));
  assert.equal(sections.map(s=>s.raw).join(''),src);
  assert.deepEqual(sections.map(s=>s.title),['','First','Second']);
  assert.ok(parts.includes('our tool') && parts.includes('Meaning') && parts.includes('Afterwards.'),parts.join('|'));
  assert.doesNotMatch(parts.join('|'),/SECRET|https:|example\.com|\x60|\$\$|<svg/);
  assert.equal(sections.map(s=>translatedMarkdown(s,s.parts.map(p=>p.text))).join(''),src);
  const translated=sections.map(s=>translatedMarkdown(s,s.parts.map(()=>'译文'))).join('');
  for(const protectedText of ['\x60npm SECRET\x60','https://local/SECRET','$SECRET_i$','\\(SECRET\\)','user@example.com','| --- | --- |','\r\n','# SECRET','private: YAMLSECRET'])assert.ok(translated.includes(protectedText),protectedText);
});
test('model cannot introduce active Markdown or raw HTML',()=>{
  const sec=translationPlan('hello')[0];
  assert.equal(translatedMarkdown(sec,['<img> [x](y)']), '&lt;img&gt; \\[x\\]\\(y\\)');
  assert.throws(()=>translatedMarkdown(sec,['multi\nline']));
});

test('actual outgoing batches keep currency prose but omit inline and block math',async()=>{
  const source='It costs $10 and the calculation is $E = mc^2$ today.\n\nPay \\$20 or $30 for $x_i$ and \\(v=5\\). A number $2x$ too.\n\n$$\nBLOCK_LATEX\n$$';
  const sent=[];
  const job=readingTranslationJob(translationPlan(source),{current:()=>true,changed:()=>{},cancel:()=>{},send:async(_,parts)=>{sent.push(...parts);return parts;}});
  await job.run();
  assert.match(sent.join(' '),/It costs \$10 and the calculation is/);
  assert.doesNotMatch(sent.join(' '),/mc\^2|x_i|v=5|2x|BLOCK_LATEX/);
  assert.equal(job.result(),source);
  const html=new Marked({extensions:mathExtensions}).parse(source);
  assert.ok(html.includes('data-math-source="E%20%3D%20mc%5E2"'));
});

test('standalone chapter copies only required definitions without contacting the model',async()=>{
  const source=['# First','','[pre]: ./first.pdf','','# Middle','','See [doc][PRE], [photo][], ![photo] and [![x][alt]][pre].','','[pre]: ./shadow.md','','# Last','','> [photo]:','>   <./my image.png> "title"','[alt]: ./linked.png','[unused]: ./private.md'].join('\r\n');
  const sections=translationPlan(source),section=standaloneTranslationSection(sections,1),sent=[];
  const job=readingTranslationJob([section],{current:()=>true,changed:()=>{},cancel:()=>{},send:async(_,p)=>{sent.push(...p);return p.map(t=>'译'+t);}});
  await job.run();const out=job.result(),html=marked(out);
  assert.match(html,/href="\.\/first\.pdf"/);assert.match(html,/src="\.\/my%20image\.png"[^>]*title="title"/);assert.match(html,/src="\.\/linked\.png"/);
  assert.doesNotMatch(out,/private\.md|# Last|# First|(?<!\r)\n/);
  assert.doesNotMatch(sent.join(' '),/\.pdf|\.png|\.md|title/);
  assert.equal(sections.map(s=>translatedMarkdown(s,s.parts.map(p=>p.text))).join(''),source);
});
test('failed chapter retries only remaining batches, then resumes untouched chapters',async()=>{
  const sections=translationPlan('# first\n\na\n\n# second\n\n'+Array.from({length:66},(_,i)=>'text '+i).join('\n\n')+'\n\n# third\n\nend');
  const calls=[];let fail=true;
  const job=readingTranslationJob(sections,{current:()=>true,changed:()=>{},cancel:()=>{},send:async(id,p)=>{calls.push(p[0]);if(fail && calls.length===3)throw Error('failed');return p.map(s=>'译'+s);}});
  await job.run();assert.deepEqual(job.rows.map(r=>r.status),['done','failed','pending']);assert.equal(job.result(),null);
  fail=false;await job.run('failed');assert.deepEqual(job.rows.map(r=>r.status),['done','done','pending']);
  await job.run();assert.ok(job.result().includes('译end'));
  assert.equal(calls.filter(x=>x==='first').length,1);assert.equal(calls.filter(x=>x==='second').length,1);
});

test('chapter reference definitions survive YAML at the start and an open fence at the end',()=>{
  const src='---\nname: original\n---\n\nSee [file].\n\n# Source\n\n[file]: ./asset.md\n\n# Tail\n\nSee [file].\n\n~~~js\nunfinished';
  for(const newline of ['\n','\r\n']){
    const sections=translationPlan(src.replaceAll('\n',newline));
    for(const index of [0,2]){
      const s=standaloneTranslationSection(sections,index),out=translatedMarkdown(s,s.parts.map(p=>p.text));
      assert.match(marked(out),/href="\.\/asset\.md"/);
      if(index===0)assert.ok(out.startsWith(['---','name: original','---',''].join(newline)));
      else assert.ok(out.endsWith(['~~~js','unfinished'].join(newline)));
      if(newline==='\r\n')assert.doesNotMatch(out,/\r(?!\n)|(?<!\r)\n/);
    }
  }
});
test('stop ignores stale completion and does not dispatch next chapter',async()=>{
  let finish, id, cancelled;
  const job=readingTranslationJob(translationPlan('# One\n\n# Two'),{current:()=>true,changed:()=>{},send:(req)=>{id=req;return new Promise(r=>finish=r);},cancel:req=>cancelled=req});
  const run=job.run();job.stop();assert.equal(cancelled,id);finish(['late']);await run;
  assert.deepEqual(job.rows.map(r=>r.status),['pending','pending']);assert.equal(job.result(),null);
});
