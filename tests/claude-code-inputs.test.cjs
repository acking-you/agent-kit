const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const assets = path.join(__dirname, '../skills/claude-code-subagent/assets/monitor');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function panel(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(assets, 'index.html'), 'utf8'), {
    url:'http://127.0.0.1:12345/private/', runScripts:'outside-only', pretendToBeVisual:true,
  });
  t.after(() => dom.window.close());
  const w=dom.window, streams=[], runs=[
    {id:'first',session_id:'s1',conversation_id:'chain',status:'running',started:2},
    {id:'previous',session_id:'s0',conversation_id:'chain',status:'completed',started:1},
  ];
  w.matchMedia=()=>Object.assign(new w.EventTarget(),{matches:false});
  Object.defineProperty(w.navigator,'languages',{value:['en-US']});
  w.fetch=async()=>({ok:true,json:async()=>runs});
  w.EventSource=class extends w.EventTarget {
    constructor(url){super();this.url=url;streams.push(this);}
    close(){this.closed=true;}
  };
  for(const file of ['preferences.js','vendor/marked.js','vendor/purify.js','markdown.js','app.js'])
    w.eval(fs.readFileSync(path.join(assets,file),'utf8'));
  await tick();
  const $=s=>w.document.querySelector(s);
  return {w,$,streams,runs,
    event(input,run=runs[0],stream=streams.at(-1)){
      stream.dispatchEvent(new w.MessageEvent('snapshot',{data:JSON.stringify({
        run,cards:[],final:null,user_inputs:input,
      })}));
    },
    choice(name,value){
      const input=$('input[name="'+name+'"][value="'+value+'"]');
      input.checked=true;input.dispatchEvent(new w.Event('change'));
    },
    select(id){
      $('#turn').value=id;$('#turn').dispatchEvent(new w.Event('change'));
    },
  };
}
const input=(text='  Actual input\n<script>alert("no")</script>  ',extras={})=>({
  source:'transcript',omitted:0,messages:[{id:'u1',text,truncated:false,attachments:[],...extras}],
});

test('actual input is literal, expandable and copied verbatim without changing output counts',async t=>{
  const p=await panel(t), value=input();
  p.event(value);
  assert.equal(p.$('#user-inputs').hidden,false);
  assert.equal(p.$('.input-message').open,false);
  assert.equal(p.$('.input-text').textContent,value.messages[0].text);
  assert.equal(p.$('.input-text script'),null);
  assert.equal(p.$('#cards').children.length,0);
  assert.equal(p.$('.input-text').tabIndex,0);
  let copied;
  p.w.navigator.clipboard={writeText:async text=>{copied=text;}};
  p.$('.input-message').open=true;await tick();
  p.$('.input-copy').click();await tick();
  assert.equal(copied,value.messages[0].text);
  assert.equal(p.$('.input-copy').textContent,'Copied');
  const original=p.$('.input-message');
  p.event(value);
  assert.equal(p.$('.input-message'),original,'identical snapshots preserve the reading node');
});

test('expansion and selection survive language/theme changes and remain isolated by turn',async t=>{
  const p=await panel(t);
  p.event(input('First turn'));
  p.$('.input-message').open=true;await tick();
  p.$('#follow').checked=false;p.$('#timeline').scrollTop=47;
  p.choice('language','zh');p.choice('theme','dark');await tick();
  assert.equal(p.$('.input-message').open,true);
  assert.equal(p.$('#user-inputs').getAttribute('aria-label'),'用户输入');
  assert.equal(p.$('#timeline').scrollTop,47);
  const old=p.streams.at(-1);
  p.select('previous');
  assert.equal(p.$('#user-inputs').hidden,true,'old input is cleared before the new snapshot');
  p.event(input('Old turn'),p.runs[1]);
  assert.equal(p.$('.input-message').open,false,'same input ID in another turn has independent state');
  p.event(input('LATE OLD STREAM'),p.runs[0],old);
  assert.equal(p.$('.input-text').textContent,'Old turn');
  p.select('first');p.event(input('First turn'));await tick();
  assert.equal(p.$('.input-message').open,true);
});

test('fallback, omission, attachment and truncation limits are explicit in both languages',async t=>{
  const p=await panel(t);
  const value={...input('x'.repeat(60000),{truncated:true,attachments:['image','document']}),source:'brief',omitted:8};
  p.event(value);
  assert.match(p.$('#user-inputs').textContent,/not yet confirmed/);
  assert.match(p.$('#user-inputs').textContent,/60,000 characters/);
  assert.match(p.$('#user-inputs').textContent,/8 earlier messages/);
  assert.match(p.$('#user-inputs').textContent,/Attachment contents are not displayed/);
  assert.equal(p.$('.input-copy').textContent,'Copy shown text');
  p.choice('language','zh');
  assert.equal(p.$('.input-text').textContent,value.messages[0].text);
  assert.equal(p.$('#user-inputs').textContent.includes('input.'),false);
  p.event({source:'unavailable',messages:[],omitted:0});
  assert.equal(p.$('.input-copy'),null);
  assert.ok(p.$('.input-note').textContent);
  p.event(undefined);
  assert.equal(p.$('#user-inputs').hidden,true,'older observers remain compatible');
});

test('clipboard failure keeps selectable text and never copies automatically',async t=>{
  const p=await panel(t);let calls=0;
  p.w.navigator.clipboard={writeText:async()=>{calls++;throw new Error('denied');}};
  p.event(input('Keep this text'));
  assert.equal(calls,0);
  p.$('.input-copy').click();await tick();
  assert.equal(calls,1);
  assert.match(p.$('.input-copy').textContent,/select the text to copy/);
  assert.equal(p.$('.input-text').textContent,'Keep this text');
});
