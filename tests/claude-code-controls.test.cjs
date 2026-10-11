const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../skills/claude-code-subagent/assets/monitor/controls.js'),'utf8');
const slots='<div id="native-actions"></div><div id="native-info"></div><div id="native-notice"></div><section id="native-composer" hidden></section>';
async function panel(t){
  const dom=new JSDOM(`<html lang="en"><body>${slots}</body></html>`,{url:'http://127.0.0.1:12345/private/#a',runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;w.eval(script);
  return {w,$:s=>w.document.querySelector(s),select:r=>w.dispatchEvent(new w.CustomEvent('native-run',{detail:r}))};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const type=(p,value)=>{p.$('#native-prompt').value=value;p.$('#native-prompt').dispatchEvent(new p.w.Event('input'));};
test('permission waits can stop; only ended tasks with instructions can resume',async t=>{
  const p=await panel(t);p.select({id:'a',status:'blocked',job_id:'abc',waiting_for:'permission'});
  assert.equal(p.$('#native-stop').disabled,false);assert.equal(p.$('#native-resume').disabled,true);
  assert.match(p.$('#native-detail').textContent,/claude attach abc/);
  assert.match(p.$('#native-notice').textContent,/waiting for native input[\s\S]*claude attach abc/);
  p.select({id:'a',status:'completed'});assert.equal(p.$('#native-resume').disabled,true);
  type(p,'Continue');
  assert.equal(p.$('#native-resume').disabled,false);
  p.w.document.documentElement.lang='zh-CN';await tick();assert.match(p.$('#native-stop').textContent,/停止任务/);
});
test('controls appear only when the selected turn can use them',async t=>{
  const p=await panel(t);p.select({id:'a',status:'running',job_id:'j'});
  assert.equal(p.$('#native-stop').hidden,false);assert.equal(p.$('#native-composer').hidden,true);
  p.select({id:'a',status:'stopped',job_id:'j'});
  assert.equal(p.$('#native-stop').hidden,true);assert.equal(p.$('#native-composer').hidden,false);
  assert.equal(p.$('#native-detail').hidden,true);p.$('#native-info-toggle').click();
  assert.equal(p.$('#native-detail').hidden,false);assert.equal(p.$('#native-info-toggle').getAttribute('aria-expanded'),'true');
  p.select({id:'a',status:'unknown',observation_error:'Native task absent from inventory.'});
  assert.equal(p.$('#native-notice [role="alert"]').textContent,'Native task absent from inventory.');
});
test('pending stop cannot overwrite another selected task',async t=>{
  const p=await panel(t);let finish;const requests=[];
  p.w.fetch=(url,options)=>{requests.push({url,options});return new Promise(resolve=>finish=resolve);};
  p.select({id:'a',status:'running'});p.$('#native-stop').click();assert.equal(p.$('#native-stop').disabled,true);
  p.select({id:'b',status:'completed'});p.w.location.hash='b';
  type(p,'Next');assert.equal(p.$('#native-resume').disabled,true,'global busy gate holds across selections');
  p.$('#native-resume').click();assert.equal(requests.length,1);
  finish({ok:true,json:async()=>({run:{id:'a',status:'stopped'}})});await tick();
  p.$('#native-resume').click();
  assert.equal(requests.at(-1).url,'/private/control/b');assert.equal(p.w.location.hash,'#b');
});
test('resume follows returned turn; errors remain visible and never change native state',async t=>{
  const p=await panel(t);p.select({id:'a',status:'stopped'});
  type(p,'Next');
  let calls=0;p.w.fetch=async(url,options)=>{calls++;assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).action,'resume');return {ok:false,json:async()=>({error:'Not settled'})};};
  p.$('#native-resume').click();p.$('#native-resume').click();await tick();
  assert.equal(calls,1);assert.match(p.$('#native-status').textContent,/Not settled/);assert.equal(p.w.location.hash,'#a');
  p.w.fetch=async()=>({ok:true,json:async()=>({run:{id:'new'}})});p.$('#native-resume').click();await tick();
  assert.equal(p.w.location.hash,'#new');assert.equal(p.$('#native-prompt').value,'');
});
test('the monitor page wires controls into the selected task header and composer',async t=>{
  const assets=path.join(__dirname,'../skills/claude-code-subagent/assets/monitor');
  const dom=new JSDOM(fs.readFileSync(path.join(assets,'index.html'),'utf8'),{url:'http://127.0.0.1:12345/private/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const w=dom.window,$=s=>w.document.querySelector(s);
  w.matchMedia=()=>Object.assign(new w.EventTarget(),{matches:false});
  const run={id:'a'.repeat(24),session_id:'s',job_id:'job1',status:'stopped',model:'m',started:Date.now()/1000,permission_mode:'bypassPermissions',tools:'default'};
  w.fetch=async()=>({ok:true,json:async()=>[run]});w.EventSource=class extends w.EventTarget{close(){}};
  for (const file of ['preferences.js','vendor/marked.js','vendor/purify.js','markdown.js','app.js','controls.js']) w.eval(fs.readFileSync(path.join(assets,file),'utf8'));
  await tick();
  assert.ok($('.task-head #native-actions #native-info-toggle'));
  assert.equal($('#native-composer').hidden,false);assert.ok($('#native-composer #native-prompt'));
  assert.equal($('#native-stop').hidden,true);
  assert.match($('#native-detail').textContent,/Full access · bypassPermissions/);assert.equal($('#native-attach').textContent,'claude attach job1');
});
