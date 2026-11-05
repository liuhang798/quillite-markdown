import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sidebarStartsCollapsed} from '../src/reading-layout.js';
const bootstrap=readFileSync(new URL('../public/startup-layout.js',import.meta.url),'utf8');
test('prepaint bootstrap remembers last state and ignores removed startup policies',()=>{
  for(const mode of [null,'remember','expanded','collapsed','invalid'])for(const last of [null,'false','true']){
    const dataset={};vm.runInNewContext(bootstrap,{document:{documentElement:{dataset}},localStorage:{getItem:key=>key==='sidebarStartup'?mode:last}});
    assert.equal(dataset.startupSidebar==='collapsed',sidebarStartsCollapsed(last));
  }
});
test('blocked storage does not abort parsing or hide the default sidebar',()=>{
  const dataset={};vm.runInNewContext(bootstrap,{document:{documentElement:{dataset}},localStorage:{getItem(){throw Error('denied');}}});
  assert.deepEqual(dataset,{});
});
test('bootstrap is blocking and precedes body without weakening CSP',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('<script src="/startup-layout.js"></script>')<html.indexOf('<body>'));
  assert.ok(html.includes('script-src \'self\';'));
});
