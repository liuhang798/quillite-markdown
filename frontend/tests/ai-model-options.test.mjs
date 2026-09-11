import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { aiModelOptions } from '../src/ai-model-options.js';
import { deleteAIModelCache, readAIModelCache, writeAIModelCache } from '../src/ai-model-cache.js';

const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('const aiProviderConfigs ='), source.indexOf('async function setDefaultAIProvider()'));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function harness() {
  const element = () => ({ value: '', textContent: '', disabled: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, replaceChildren(...options) { this.options = options; }, focus() {} });
  const els = new Proxy({}, { get(obj, key) { return obj[key] ||= element(); } });
  const stored = new Map();
  const localStorage = { getItem:key=>stored.get(key)??null, setItem:(key,value)=>stored.set(key,value) };
  const context = vm.createContext({ els, aiModelOptions, currentAISettings: { provider:'deepseek', hasApiKey:false }, aiSettingsEditingKey:false, aiModelsLoading:false, aiModelsByProvider:new Map(), aiSettingsLoadRequest:0, aiModelLoadRequest:0, aiModelAutoLoadTimer:0,
    pendingAIRewriteSelection:null,pendingAIRewriteAction:'',pendingAIDocumentReview:false,resumeAIDocumentReviewAfterSettings:false,
    window:{quilliteMarkdown:{}}, document:{createElement:element,body:{classList:element().classList}}, localStorage, readAIModelCache, writeAIModelCache, deleteAIModelCache, $:()=>element(), t:key=>key, aiErrorMessage:error=>error.message, requestAnimationFrame() {}, setTimeout, clearTimeout });
  vm.runInContext(functions, context);
  context.renderAIProvider('deepseek');
  return context;
}

test('built-in DeepSeek candidates are separate from successful API results', () => {
  assert.deepEqual(aiModelOptions('deepseek', [], '', 'deepseek-v4-flash'), ['deepseek-v4-flash','deepseek-v4-pro']);
  assert.deepEqual(aiModelOptions('deepseek', ['deepseek-v4-pro'], 'deepseek-v4-pro', 'deepseek-v4-flash'), ['deepseek-v4-pro']);
  assert.deepEqual(aiModelOptions('qwen', [' qwen-plus ', 'qwen-max', 'qwen-plus', null], 'qwen-plus', 'qwen-plus'), ['qwen-plus','qwen-max']);
  assert.deepEqual(aiModelOptions('bailian', [], '', 'deepseek-v4-flash'), ['deepseek-v4-flash','deepseek-v4-pro']);
  assert.deepEqual(aiModelOptions('siliconflow', [], '', 'deepseek-ai/DeepSeek-V4-Flash'), ['deepseek-ai/DeepSeek-V4-Flash','Pro/deepseek-ai/DeepSeek-V4']);
  assert.deepEqual(aiModelOptions('custom', [], '', ''), []);
});

test('missing key exposes candidates without fetching or leaving selector disabled', async () => {
  const c=harness(); c.els.aiModel.disabled=true;
  c.window.quilliteMarkdown.discoverAIModels=()=>{throw new Error('must not fetch');};
  await c.loadAIModels();
  assert.equal(c.els.aiModel.options.length,2);
  assert.equal(c.els.aiModel.disabled,false);
  assert.equal(c.els.aiModelState.textContent,'aiModelKeyRequired');
});

test('refresh failures and empty lists preserve last successful models', async () => {
  const c=harness(); c.currentAISettings.hasApiKey=true;
  c.window.quilliteMarkdown.discoverAIModels=async()=>['deepseek-v4-flash','deepseek-v4-pro','deepseek-custom'];
  await c.loadAIModels();
  for (const fetch of [async()=>{throw new Error('offline');},async()=>[]]) {
    c.window.quilliteMarkdown.discoverAIModels=fetch;
    await c.loadAIModels();
    assert.equal(c.els.aiModel.options.length,3);
    assert.match(c.els.aiModelState.textContent,/aiModelCacheUsed/);
    assert.equal(c.els.aiModel.disabled,false);
  }
});

test('late model response cannot overwrite another provider or strand disabled control', async () => {
  const c=harness(), pending=deferred(); c.currentAISettings.hasApiKey=true;
  c.window.quilliteMarkdown.discoverAIModels=()=>pending.promise;
  c.window.quilliteMarkdown.getAIProviderSettings=async provider=>({provider,hasApiKey:false,model:'glm-4.7-flash'});
  const loading=c.loadAIModels();
  c.els.aiProvider.value='zhipu'; await c.changeAIProvider();
  pending.resolve(['deepseek-custom']); await loading;
  assert.equal(c.els.aiProvider.value,'zhipu');
  assert.equal(c.els.aiModel.value,'glm-4.7-flash');
  assert.equal(c.els.aiModel.disabled,false);
});

test('out-of-order credential lookup and closed dialog ignore stale results', async () => {
  const c=harness(), old=deferred();
  c.window.quilliteMarkdown.getAIProviderSettings=provider=>provider==='zhipu'?old.promise:Promise.resolve({provider,hasApiKey:false,model:'qwen-plus'});
  c.els.aiProvider.value='zhipu'; const first=c.changeAIProvider();
  c.els.aiProvider.value='qwen'; await c.changeAIProvider();
  old.resolve({provider:'zhipu',hasApiKey:true}); await first;
  assert.equal(c.els.aiProvider.value,'qwen');
  assert.equal(c.currentAISettings.provider,'qwen');
  const pending=deferred(); c.currentAISettings.hasApiKey=true;
  c.window.quilliteMarkdown.discoverAIModels=()=>pending.promise;
  const loading=c.loadAIModels(); c.closeAISettings();
  pending.resolve(['qwen-secret-test']); await loading;
  assert.equal(c.aiModelsByProvider.has('qwen'),false);
});

test('AI selects neutralize WebKit skin and refresh is not inside its model label', () => {
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(css,/\.ai-settings-form select \{[^}]*-webkit-appearance: none;[^}]*appearance: none;[^}]*height: 44px;/s);
  assert.match(html,/<label for="aiModel"[^>]*>模型<\/label><button id="refreshAIModels"/);
  assert.match(html,/id="aiModel" aria-describedby="aiModelState"/);
  assert.match(html,/value="bailian"[\s\S]*value="siliconflow"[\s\S]*value="openrouter"[\s\S]*value="custom"/);
  assert.match(html,/id="aiBaseURLField"[\s\S]*id="aiCustomModel"[^>]*list="aiCustomModelOptions"/);
  assert.ok(html.indexOf('id="aiAPIKeyField"') < html.indexOf('id="aiModelSelectField"'));
  assert.ok(html.indexOf('id="aiAPIKeyField"') < html.indexOf('id="aiCustomModelField"'));
});

test('custom compatible provider uses its editable endpoint and model control', () => {
  const c=harness();
  c.currentAISettings={provider:'custom',baseUrl:'https://gateway.example.com/v1',model:'vendor/chat-model',hasApiKey:true};
  c.renderAIProvider('custom','vendor/chat-model');
  assert.equal(c.els.aiProvider.value,'custom');
  assert.equal(c.els.aiBaseURL.value,'https://gateway.example.com/v1');
  assert.equal(c.selectedAIModel(),'vendor/chat-model');
  assert.equal(c.activeAIModelControl(),c.els.aiCustomModel);
});

test('custom compatible provider does not invent a default model', () => {
  const c=harness();
  c.currentAISettings={provider:'custom',baseUrl:'https://gateway.example.com/v1',model:'',hasApiKey:false};
  c.renderAIProvider('custom','');
  assert.equal(c.els.aiCustomModel.value,'');
  assert.equal(c.selectedAIModel(),'');
  assert.equal(c.els.aiProviderModel.textContent,'aiModelNotSelected');
});

test('draft endpoint and key load model choices without selecting one', async () => {
  const c=harness();
  c.currentAISettings={provider:'custom',baseUrl:'https://gateway.example.com/v1',model:'',hasApiKey:false};
  c.renderAIProvider('custom','');
  c.els.aiAPIKey.value='unsaved-draft-key';
  let received;
  c.window.quilliteMarkdown.discoverAIModels=async input => {
    received={...input};
    return ['vendor/chat-model','vendor/reasoning-model'];
  };
  await c.loadAIModels();
  assert.deepEqual(received,{provider:'custom',baseUrl:'https://gateway.example.com/v1',apiKey:'unsaved-draft-key'});
  assert.deepEqual(c.els.aiCustomModelOptions.options.map(option=>option.value),['vendor/chat-model','vendor/reasoning-model']);
  assert.equal(c.els.aiCustomModel.value,'');
  assert.equal(c.els.aiCustomModelState.textContent,'aiModelLoaded');
});

test('legacy OpenAI placeholder is not shown for an Alibaba compatible endpoint', () => {
  const c=harness();
  c.currentAISettings={provider:'custom',baseUrl:'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',model:'gpt-4o-mini',hasApiKey:true};
  c.renderAIProvider('custom','gpt-4o-mini');
  assert.equal(c.els.aiCustomModel.value,'');
  assert.equal(c.els.aiProviderModel.textContent,'aiModelNotSelected');
});
