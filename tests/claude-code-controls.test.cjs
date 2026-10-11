const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../skills/claude-code-subagent/assets/monitor/controls.js'),'utf8');
async function panel(t){
  const dom=new JSDOM('<html lang="en"><div id="native-controls"></div></html>',{url:'http://127.0.0.1:12345/private/#a',runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;w.eval(script);
  return {w,$:s=>w.document.querySelector(s),select:r=>w.dispatchEvent(new w.CustomEvent('native-run',{detail:r}))};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('permission waits can stop; only ended tasks with instructions can resume',async t=>{
  const p=await panel(t);p.select({id:'a',status:'blocked',job_id:'abc',waiting_for:'permission'});
  assert.equal(p.$('#native-stop').disabled,false);assert.equal(p.$('#native-resume').disabled,true);
  assert.match(p.$('#native-detail').textContent,/claude attach abc/);
  p.select({id:'a',status:'completed'});assert.equal(p.$('#native-resume').disabled,true);
  p.$('#native-prompt').value='Continue';p.$('#native-prompt').dispatchEvent(new p.w.Event('input'));
  assert.equal(p.$('#native-resume').disabled,false);
  p.w.document.documentElement.lang='zh-CN';await tick();assert.equal(p.$('#native-stop').textContent,'停止任务');
});
test('pending stop cannot overwrite another selected task',async t=>{
  const p=await panel(t);let finish;const requests=[];
  p.w.fetch=(url,options)=>{requests.push({url,options});return new Promise(resolve=>finish=resolve);};
  p.select({id:'a',status:'running'});p.$('#native-stop').click();assert.equal(p.$('#native-stop').disabled,true);
  p.select({id:'b',status:'completed'});p.w.location.hash='b';
  finish({ok:true,json:async()=>({run:{id:'a',status:'stopped'}})});await tick();
  p.$('#native-prompt').value='Next';p.$('#native-prompt').dispatchEvent(new p.w.Event('input'));p.$('#native-resume').click();
  assert.equal(requests.at(-1).url,'/private/control/b');assert.equal(p.w.location.hash,'#b');
});
test('resume follows returned turn; errors remain visible and never change native state',async t=>{
  const p=await panel(t);p.select({id:'a',status:'stopped'});
  p.$('#native-prompt').value='Next';p.$('#native-prompt').dispatchEvent(new p.w.Event('input'));
  let calls=0;p.w.fetch=async(url,options)=>{calls++;assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).action,'resume');return {ok:false,json:async()=>({error:'Not settled'})};};
  p.$('#native-resume').click();p.$('#native-resume').click();await tick();
  assert.equal(calls,1);assert.match(p.$('#native-detail').textContent,/Not settled/);assert.equal(p.w.location.hash,'#a');
  p.w.fetch=async()=>({ok:true,json:async()=>({run:{id:'new'}})});p.$('#native-resume').click();await tick();
  assert.equal(p.w.location.hash,'#new');assert.equal(p.$('#native-prompt').value,'');
});
