'use strict';
const $ = id => document.getElementById(id);
const base = location.pathname;
let runs = [], selected = location.hash.slice(1), source = null, current = null, filter = 'all';
let cards = new Map(), nodes = new Map(), lastList = '', finalResult = null;
let streamClosed = true;
let streamRevision = '';
const revision = run => JSON.stringify([run.status,run.finished,run.exit_code,run.error]);
const active = status => ['starting', 'running'].includes(status);
function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
function connection(text, cls = '') { $('connection').textContent = text; $('connection').className = `connection ${cls}`; }
function elapsed(run) { const sec = Math.max(0, Math.floor((run.finished || Date.now()/1000) - run.started)); return sec < 60 ? `${sec}s` : `${Math.floor(sec/60)}m ${sec%60}s`; }
function describe(run) { return run.title || `${run.profile} · ${run.model}`; }
function renderList() {
  const groups = new Map();
  for (const run of runs) { if (!groups.has(run.session_id)) groups.set(run.session_id, []); groups.get(run.session_id).push(run); }
  const signature = JSON.stringify([...groups].map(([id, rs]) => [id, rs.map(r => [r.id,r.title,r.status]), selected]));
  if (signature === lastList) return;
  lastList = signature; $('sessions').replaceChildren(); $('run-count').textContent = groups.size;
  for (const group of groups.values()) {
    const latest = group[0]; const button = el('button', 'session' + (group.some(r => r.id === selected) ? ' active' : ''));
    button.append(el('span','session-title',describe(latest)));
    const meta = el('span','session-meta'); meta.append(el('span',`dot ${latest.status}`),document.createTextNode(`${latest.status} · ${group.length} ${group.length===1?'turn':'turns'}`)); button.append(meta);
    button.addEventListener('click', () => select(latest.id)); $('sessions').append(button);
  }
}
function heading(run) {
  current = run;
  $('welcome').hidden = true; $('workspace').hidden = false;
  $('title').textContent = describe(run); $('profile').textContent = `${run.profile || 'Task'} / ${run.session_id.slice(0,8)}`;
  $('model').textContent = run.model; $('status').textContent = run.status; $('status').className = `badge ${run.status}`;
  $('duration').textContent = elapsed(run); $('cwd').textContent = run.cwd; $('cwd').title = run.cwd;
  $('error').hidden = !run.error; $('error').textContent = run.error || '';
  const group = runs.filter(r => r.session_id === run.session_id).reverse();
  const signature = group.map(r => r.id).join(',');
  if ($('turn').dataset.signature !== signature) {
    $('turn').replaceChildren(...group.map((r,i) => { const option = el('option','',`${i+1}${r.resumed?' · resumed':''}`); option.value = r.id; return option; }));
    $('turn').dataset.signature = signature;
  }
  $('turn').value = run.id;
  $('activity').textContent = active(run.status) ? 'Observing live activity' : 'Saved transcript · read only';
}
function select(id) {
  if (source) source.close();
  selected = id; history.replaceState(null,'',`#${id}`); cards.clear(); nodes.clear(); finalResult = null; $('cards').replaceChildren(); $('result').hidden = true; $('waiting').hidden = false;
  const run = runs.find(r => r.id === id); if (!run) return;
  heading(run); renderList(); connection('Connecting');
  source = new EventSource(`${base}events/${encodeURIComponent(id)}`);
  streamClosed = false;
  const thisSource = source;
  source.addEventListener('snapshot', event => receive(event, true));
  source.addEventListener('update', event => receive(event, false));
  source.addEventListener('done', () => { thisSource.close(); if (source === thisSource) { streamClosed = true; connection('Saved', 'live'); } });
  source.onerror = () => { if (source === thisSource) connection('Reconnecting…', 'warn'); };
}
function receive(event, reset) {
  const data = JSON.parse(event.data);
  if (data.run.id !== selected) return;
  connection('Live', 'live');
  if (reset) { cards.clear(); nodes.clear(); $('cards').replaceChildren(); }
  heading(data.run);
  streamRevision = revision(data.run);
  const index = runs.findIndex(r => r.id === selected); if (index >= 0) runs[index] = data.run;
  for (const card of data.cards) { if (!['text','tool'].includes(card.kind)) continue; cards.set(card.id, card); renderCard(card); }
  finalResult = data.final; renderResult(); renderList(); applyFilter();
  $('waiting').hidden = cards.size > 0 || !!finalResult;
  if (!active(data.run.status) && !cards.size && !finalResult) $('waiting').textContent = 'This run ended before any public output was recorded.';
  else $('waiting').textContent = 'Waiting for the first public event. The agent may be starting or thinking.';
  $('event-count').textContent = `${cards.size} ${cards.size===1?'item':'items'}`;
  if ($('follow').checked) requestAnimationFrame(() => { $('timeline').scrollTop = $('timeline').scrollHeight; });
  else $('jump').hidden = false;
}
function renderCard(card) {
  let node = nodes.get(card.id);
  if (!node) { node = el('article','card'); nodes.set(card.id,node); $('cards').append(node); }
  if (card.kind === 'text') {
    if (!node.firstChild) node.append(el('div','card-caption','Assistant'),el('div','reply'));
    node.className = 'card' + (card.streaming ? ' streaming' : ''); node.querySelector('.reply').textContent = card.text || '';
  } else {
    if (!node.firstChild) {
      const details = el('details','tool'); const summary = el('summary'); summary.append(el('span','tool-name'),el('span','tool-path'),el('span','tool-state'));
      details.append(summary,el('div','tool-body')); node.append(details);
    }
    const details = node.firstChild;
    node.querySelector('.tool-name').textContent = card.name || 'Tool'; node.querySelector('.tool-path').textContent = card.path || '';
    const state = node.querySelector('.tool-state'); state.textContent = card.state || ''; state.className = `tool-state ${card.state==='failed'?'failed':card.state==='succeeded'?'completed':'running'}`;
    if (card.state === 'failed') details.open = true;
    const body = node.querySelector('.tool-body'); body.replaceChildren();
    if (card.diff !== undefined) {
      body.append(el('h3','',`Change preview · ${card.state==='succeeded'?'tool reported success':card.state==='failed'?'tool failed':'pending execution'}`));
      const diff = el('pre'); for (const line of card.diff.split('\n')) diff.append(el('span',`diff-line ${line.startsWith('+++')||line.startsWith('---')?'diff-meta':line.startsWith('+')?'diff-add':line.startsWith('-')?'diff-remove':'diff-meta'}`,line)); body.append(diff);
    }
    body.append(el('h3','','Arguments'),el('pre','',card.input || ''));
    if (card.result !== undefined) body.append(el('h3','','Tool result'),el('pre','',card.result));
  }
}
function renderResult() {
  const section = $('result'); section.replaceChildren(); section.hidden = !finalResult;
  if (!finalResult) return;
  section.append(el('span','',`CLI result: ${finalResult.subtype || 'unknown'} · ${finalResult.turns || 0} turns · ${finalResult.permission_denials} permission denials. Runner status: ${current.status}.`));
  const lastText = [...cards.values()].filter(c => c.kind === 'text').at(-1)?.text;
  if (finalResult.text && finalResult.text !== lastText) { const details = el('details'); details.append(el('summary','','Final response'),el('pre','',finalResult.text)); section.append(details); }
  if (finalResult.errors && finalResult.errors !== '[]') section.append(el('pre','',finalResult.errors));
}
function applyFilter() { for (const [id,card] of cards) nodes.get(id).hidden = !(filter === 'all' || filter === card.kind || (filter === 'changes' && card.diff !== undefined)); }
async function refresh() {
  try {
    const response = await fetch(`${base}runs`,{cache:'no-store'}); if (!response.ok) throw new Error('Monitor unavailable');
    runs = await response.json(); renderList();
    if (runs.length && !current) select(runs.some(r => r.id === selected) ? selected : runs[0].id);
    if (!runs.length) connection('Ready','live');
    const run = runs.find(r => r.id === selected);
    if (run) { heading(run); if (streamClosed && (active(run.status) || revision(run) !== streamRevision)) select(run.id); }
  } catch (_) { connection('Monitor offline · restart and reopen', 'warn'); }
}
$('turn').addEventListener('change', () => select($('turn').value));
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => { filter = button.dataset.filter; for (const b of document.querySelectorAll('[data-filter]')) { b.classList.toggle('selected', b===button); b.setAttribute('aria-pressed',String(b===button)); } applyFilter(); });
$('follow').addEventListener('change', () => { if ($('follow').checked) { $('timeline').scrollTop = $('timeline').scrollHeight; $('jump').hidden = true; } });
$('jump').addEventListener('click', () => { $('follow').checked = true; $('timeline').scrollTop = $('timeline').scrollHeight; $('jump').hidden = true; });
$('timeline').addEventListener('wheel', event => { if (event.deltaY < 0) { $('follow').checked = false; $('jump').hidden = false; } }, {passive:true});
$('timeline').addEventListener('keydown', event => { if (['ArrowUp','PageUp','Home'].includes(event.key)) { $('follow').checked = false; $('jump').hidden = false; } });
window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id !== selected && runs.some(r => r.id === id)) select(id); });
setInterval(refresh,2000); setInterval(() => { if (current) $('duration').textContent = elapsed(current); },1000); refresh();
