// DOM integration tests; jsdom is a development-only dependency.
// npm install --prefix /tmp/workbuddy-ui-tests --ignore-scripts jsdom@26.1.0
// NODE_PATH=/tmp/workbuddy-ui-tests/node_modules node --test tests/workbuddy-ui.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const assets = path.join(__dirname, '../skills/workbuddy-subagent/assets/monitor');

async function panel(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(assets, 'index.html'), 'utf8'), {
    url: 'http://127.0.0.1:12345/private/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window, queries = new Map(), streams = [];
  let languages = ['zh-CN'];
  Object.defineProperty(w.navigator, 'languages', {get: () => languages});
  w.matchMedia = query => {
    if (!queries.has(query)) {
      const target = new w.EventTarget(); target.matches = false; queries.set(query, target);
    }
    return queries.get(query);
  };
  const run = {id:'first', session_id:'session', status:'running', model:'test-model', profile:'design', title:'UI test fixture', started:Date.now()/1000, cwd:'/tmp/test'};
  w.fetch = async () => ({ok:true, json:async () => [run]});
  w.EventSource = class extends w.EventTarget {
    constructor(url) { super(); this.url=url; streams.push(this); }
    close() { this.closed=true; }
  };
  w.eval(fs.readFileSync(path.join(assets,'preferences.js'),'utf8'));
  for (const file of ['vendor/marked.js','vendor/purify.js','markdown.js']) w.eval(fs.readFileSync(path.join(assets,file),'utf8'));
  w.eval(fs.readFileSync(path.join(assets,'app.js'),'utf8'));
  await new Promise(resolve => setImmediate(resolve));
  const $ = selector => w.document.querySelector(selector);
  return {
    w, $, run, streams,
    choice(name, value) { const input=$(`input[name="${name}"][value="${value}"]`); input.checked=true; input.dispatchEvent(new w.Event('change')); },
    systemLanguage(value) { languages=value; w.dispatchEvent(new w.Event('languagechange')); },
    systemDark(value) { const query=queries.get('(prefers-color-scheme: dark)'); query.matches=value; query.dispatchEvent(new w.Event('change')); },
    event(type, data) { streams.at(-1).dispatchEvent(new w.MessageEvent(type,{data:JSON.stringify(data)})); },
  };
}

test('system changes update the loaded panel; manual choices remain fixed', async t => {
  const p=await panel(t), root=p.w.document.documentElement;
  assert.equal(root.lang,'zh-CN'); assert.equal(root.dataset.theme,'light');
  p.systemLanguage(['en-US']); p.systemDark(true);
  assert.equal(root.lang,'en'); assert.equal(root.dataset.theme,'dark');
  p.choice('language','zh'); p.choice('theme','light');
  p.systemLanguage(['en-GB']); p.systemDark(true);
  assert.equal(root.lang,'zh-CN'); assert.equal(root.dataset.theme,'light');
  assert.equal(p.w.localStorage.getItem('workbuddy.monitor.language'),'zh');
  p.choice('language','system'); p.choice('theme','system');
  assert.equal(root.lang,'en'); assert.equal(root.dataset.theme,'dark');
});

test('preference changes preserve selected turn, filter, expansion and scroll', async t => {
  const p=await panel(t);
  const card={id:'tool:c',kind:'tool',name:'Edit',path:'/tmp/test/a',input:{new_string:'hello'},state:'succeeded',result:'Applied',diff:'-old\n+hello'};
  p.event('snapshot',{run:p.run,cards:[card],final:null});
  p.$('#follow').checked=false;
  p.$('.tool-head').click(); p.$('[data-filter="changes"]').click();
  p.$('#timeline').scrollTop=42;
  p.choice('language','en'); p.choice('theme','dark');
  assert.equal(p.w.location.hash,'#first');
  assert.equal(p.$('[data-filter="changes"]').getAttribute('aria-pressed'),'true');
  assert.equal(p.$('.tool-head').getAttribute('aria-expanded'),'true');
  assert.equal(p.$('#timeline').scrollTop,42);
  assert.equal(p.$('#follow').checked,false);
});

test('activity-only events update the phase without inventing reply cards', async t => {
  const p=await panel(t);
  p.event('snapshot',{run:p.run,cards:[],final:null,activity:{phase:'thinking',last_event_at:new Date().toISOString(),events:10}});
  assert.match(p.$('#connection').textContent,/思考/);
  assert.match(p.$('#activity').textContent,/最近活动/);
  assert.equal(p.$('#cards').children.length,0);
  p.choice('language','en');
  assert.match(p.$('#connection').textContent,/Thinking/);
  p.event('update',{run:p.run,cards:[],final:null,activity:{phase:'writing',last_event_at:new Date().toISOString(),events:11}});
  assert.match(p.$('#connection').textContent,/Writing/);
});

test('replayed snapshots do not duplicate cards and finished streams close', async t => {
  const p=await panel(t), snapshot={run:p.run,cards:[{id:'m:text',kind:'text',text:'<script>literal</script>'}],final:null};
  p.event('snapshot',snapshot); p.event('snapshot',snapshot);
  assert.equal(p.$('#cards').children.length,1);
  assert.equal(p.$('.reply').textContent,'<script>literal</script>');
  assert.equal(p.$('.reply script'),null);
  p.event('update',{...snapshot,run:{...p.run,status:'completed'},final:{subtype:'success',turns:1,permission_denials:[]}});
  p.event('done',{});
  assert.equal(p.streams.at(-1).closed,true);
  assert.match(p.$('#status').textContent,/已完成/);
  assert.match(p.$('#connection').textContent,/已保存/);
});

test('interrupted edits remain unconfirmed and errors remain visible', async t => {
  const p=await panel(t);
  p.event('snapshot',{run:{...p.run,status:'interrupted',error:'Runner stopped'},cards:[{id:'tool:c',kind:'tool',name:'Write',state:'incomplete',diff:'+new'}],final:null});
  assert.equal(p.$('#error').hidden,false);
  assert.match(p.$('#error').textContent,/Runner stopped/);
  assert.match(p.$('.change-title').textContent,/尚未确认/);
  assert.equal(p.$('.change-incomplete') !== null,true);
});

test('diff headers never consume CSS variables or increment source lines', async t => {
  const p=await panel(t);
  const cards=[
    {id:'edit',kind:'tool',name:'Edit',state:'succeeded',diff_format:'unified',diff:'--- before\n+++ after\n@@ -1 +1 @@\n---tone: red;\n+--tone: blue;'},
    {id:'write',kind:'tool',name:'Write',state:'succeeded',diff_format:'additions',diff:'+++i;\n+--- before'},
  ];
  p.event('snapshot',{run:p.run,cards,final:null});
  const rows=p.w.document.querySelectorAll('.tool-card');
  assert.equal(rows[0].querySelector('.stat-del').textContent,'−1');
  assert.equal(rows[0].querySelector('.diff-remove').textContent,'---tone: red;');
  assert.equal(rows[1].querySelector('.stat-add').textContent,'+2');
  assert.equal(rows[1].querySelectorAll('.diff-meta').length,0);
});

test('Markdown streams into headings, lists, code, tables and final answers', async t => {
  const p=await panel(t);
  const snapshot={run:p.run,cards:[{id:'m',kind:'text',streaming:true,text:'# Plan\n\n```js\nconst x = 1;'}],final:null};
  p.event('snapshot',snapshot);
  assert.equal(p.$('.reply h1').textContent,'Plan');
  assert.match(p.$('.reply pre code').textContent,/const x = 1;/);
  snapshot.cards[0].text+='\n```\n\n- **First**\n- Second\n\n> Quote\n\n| A | B |\n| - | - |\n| 1 | 2 |';
  snapshot.cards[0].streaming=false;
  snapshot.final={subtype:'success',text:'## Result\n\n**Done**',permission_denials:[]};
  p.event('update',snapshot);
  assert.equal(p.$('.reply ul').children.length,2);
  assert.equal(p.$('.reply strong').textContent,'First');
  assert.equal(p.$('.reply table tbody td').textContent,'1');
  assert.match(p.$('.reply blockquote').textContent,/Quote/);
  assert.equal(p.$('.final-reply h2').textContent,'Result');
  assert.equal(p.$('#cards').children.length,1);
});

test('Markdown cannot execute HTML, load images or navigate dangerous URLs', async t => {
  const p=await panel(t);
  const text='<script>window.attacked=true</script>\n\n<img src="https://example.invalid/pixel" onerror="alert(1)">\n\n[x](javascript:alert%281%29) [data](data:text/html,evil) [file](file:///tmp/private) [safe](https://example.com)\n\n![image](https://example.invalid/image.png)\n\n```html\n<b>literal</b>\n```\n\n- [x] done';
  p.event('snapshot',{run:p.run,cards:[{id:'m',kind:'text',text}],final:null});
  assert.equal(p.$('.reply script,.reply img,.reply iframe,.reply style'),null);
  assert.equal(p.w.attacked,undefined);
  assert.match(p.$('.reply').textContent,/<script>/);
  assert.equal(p.$('.reply pre code').textContent.trim(),'<b>literal</b>');
  const links=[...p.w.document.querySelectorAll('.reply a[href]')];
  assert.equal(links.length,2);
  for (const link of links) { assert.match(link.href,/^https:/); assert.equal(link.rel,'noopener noreferrer'); assert.equal(link.target,'_blank'); }
  assert.equal(p.$('.reply input').disabled,true);
});
