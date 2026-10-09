'use strict';
// WorkBuddy agent monitor: read-only observer for long-lived agent runs.
// Replies use sanitized Markdown; tool content remains literal text.

const P = window.WorkBuddyPreferences;
const $ = id => document.getElementById(id);
const base = location.pathname;
let runs = [], selected = location.hash.slice(1), source = null, current = null, filter = 'all';
let cards = new Map(), nodes = new Map(), lastList = '', finalResult = null;
let streamClosed = true;
let streamRevision = '';
let snapshotReceived = false;
let finalOpen = false;
let conn = 'connecting';
let liveActivity = null;
let lang = 'en', languageChoice = 'system', themeChoice = 'system';
const expanded = new Set(), autoOpened = new Set();
const diffCache = new WeakMap();
const storage = P.getStorage(window);
const storageWritable = P.isStorageWritable(storage);
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const narrowQuery = window.matchMedia ? window.matchMedia('(max-width: 899px)') : null;
const filterButtons = [...document.querySelectorAll('[data-filter]')];
const revision = run => JSON.stringify([run.status,run.finished,run.exit_code,run.error]);
const active = status => ['starting', 'running'].includes(status);
const t = (key, params) => P.translate(lang, key, params);
const hasChange = card => card.diff !== undefined && card.diff !== null;

// ---------- DOM helpers ----------
function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
function setText(node, value) { const text = value === undefined || value === null ? '' : String(value); if (node.textContent !== text) node.textContent = text; }
function asText(value) { if (value === undefined || value === null) return ''; return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }

const SVG_NS = 'http://www.w3.org/2000/svg';
const DOC = 'M13.5 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-10z';
const ICONS = {
  panel: [['rect', {x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.5}], ['path', {d: 'M9.5 4.5v15'}]],
  sliders: [['path', {d: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1'}], ['circle', {cx: 15, cy: 7, r: 2}], ['circle', {cx: 9, cy: 12, r: 2}], ['circle', {cx: 17, cy: 17, r: 2}]],
  close: [['path', {d: 'M6.5 6.5l11 11M17.5 6.5l-11 11'}]],
  clock: [['circle', {cx: 12, cy: 12, r: 8.5}], ['path', {d: 'M12 7.5V12l3 2'}]],
  cpu: [['rect', {x: 7, y: 7, width: 10, height: 10, rx: 2}], ['path', {d: 'M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3'}]],
  folder: [['path', {d: 'M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'}]],
  chevronDown: [['path', {d: 'M7 10l5 5 5-5'}]],
  chevronRight: [['path', {d: 'M10 7l5 5-5 5'}]],
  arrowDown: [['path', {d: 'M12 5v14M6.5 13.5L12 19l5.5-5.5'}]],
  pencil: [['path', {d: 'M4.5 19.5l1-4.2L15.8 5a2.1 2.1 0 0 1 3 3L8.7 18.5z'}], ['path', {d: 'M13.8 7l3 3'}]],
  filePlus: [['path', {d: DOC}], ['path', {d: 'M13.5 3.5v5h5M12 11.5v6M9 14.5h6'}]],
  fileText: [['path', {d: DOC}], ['path', {d: 'M13.5 3.5v5h5M9 13h6M9 16.5h4'}]],
  terminal: [['rect', {x: 3.5, y: 4.5, width: 17, height: 15, rx: 2.5}], ['path', {d: 'M7.5 9.5l3 2.5-3 2.5M12.5 15h4'}]],
  search: [['circle', {cx: 11, cy: 11, r: 6}], ['path', {d: 'M19.5 19.5l-4.2-4.2'}]],
  globe: [['circle', {cx: 12, cy: 12, r: 8.5}], ['path', {d: 'M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17'}]],
  list: [['path', {d: 'M9.5 7h10M9.5 12h10M9.5 17h10M5 7h.01M5 12h.01M5 17h.01'}]],
  wrench: [['path', {d: 'M15 4.5a4.5 4.5 0 0 0-4.3 5.8L4.5 16.5v3h3l6.2-6.2A4.5 4.5 0 0 0 19.5 9l-2.7 2.7-2.6-.7-.7-2.6 2.7-2.7a4.5 4.5 0 0 0-1.2-.2z'}]],
  sparkle: [['path', {d: 'M12 4l1.7 4.6a2 2 0 0 0 1.2 1.2l4.6 1.7-4.6 1.7a2 2 0 0 0-1.2 1.2L12 19l-1.7-4.6a2 2 0 0 0-1.2-1.2L4.5 11.5l4.6-1.7a2 2 0 0 0 1.2-1.2z'}]],
  checkCircle: [['circle', {cx: 12, cy: 12, r: 8.5}], ['path', {d: 'M8.5 12.2l2.4 2.4 4.8-4.9'}]],
  xCircle: [['circle', {cx: 12, cy: 12, r: 8.5}], ['path', {d: 'M9.5 9.5l5 5M14.5 9.5l-5 5'}]],
  alert: [['path', {d: 'M10.3 4.6L3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z'}], ['path', {d: 'M12 9.5v4M12 16.8h.01'}]],
  pause: [['circle', {cx: 12, cy: 12, r: 8.5}], ['path', {d: 'M10 9v6M14 9v6'}]],
  hourglass: [['path', {d: 'M7 3.5h10M7 20.5h10M8 3.5v2.3a4 4 0 0 0 1.6 3.2L12 11l2.4-2a4 4 0 0 0 1.6-3.2V3.5M8 20.5v-2.3a4 4 0 0 1 1.6-3.2L12 13l2.4 2a4 4 0 0 1 1.6 3.2v2.3'}]],
  sun: [['circle', {cx: 12, cy: 12, r: 3.8}], ['path', {d: 'M12 3v1.8M12 19.2V21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M3 12h1.8M19.2 12H21M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3'}]],
  moon: [['path', {d: 'M20 13.4A8 8 0 1 1 10.6 4a6.3 6.3 0 0 0 9.4 9.4z'}]],
  monitor: [['rect', {x: 3.5, y: 4.5, width: 17, height: 11.5, rx: 2}], ['path', {d: 'M8.5 19.5h7M12 16v3.5'}]],
  eye: [['path', {d: 'M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z'}], ['circle', {cx: 12, cy: 12, r: 2.6}]],
  pulse: [['path', {d: 'M3.5 12h3.5l2.5-6 5 12 2.5-6h3.5'}]],
  brand: [['rect', {x: 1, y: 1, width: 22, height: 22, rx: 7, class: 'mark-bg'}], ['path', {d: 'M6.5 8.5l2.5 7.5 3-5.5 3 5.5 2.5-7.5', class: 'mark-fg'}]],
};
function icon(name, cls) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', cls ? `icon ${cls}` : 'icon');
  for (const [tag, attrs] of ICONS[name] || ICONS.wrench) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, String(value));
    svg.append(child);
  }
  return svg;
}
function hydrateIcons() { for (const slot of document.querySelectorAll('[data-icon]')) slot.replaceWith(icon(slot.dataset.icon, slot.className)); }

// ---------- Labels ----------
function statusTone(status) {
  if (['starting', 'running', 'queued', 'pending'].includes(status)) return 'active';
  if (['completed', 'succeeded', 'success'].includes(status)) return 'success';
  if (['failed', 'error'].includes(status)) return 'danger';
  if (['interrupted', 'cancelled', 'canceled', 'stopped', 'timeout', 'timed_out'].includes(status)) return 'warn';
  return 'neutral';
}
const statusLabel = status => P.labelFor(lang, 'status', status);
const profileLabel = profile => P.labelFor(lang, 'profile', profile);
function elapsed(run) { if (!run.started) return '—'; const sec = Math.max(0, Math.floor((run.finished || Date.now()/1000) - run.started)); return P.formatDuration(sec, lang); }
function describe(run) { return run.title || [profileLabel(run.profile), run.model].filter(Boolean).join(' · '); }
function baseName(path) { const trimmed = String(path || '').replace(/[\\/]+$/, ''); const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')); return i >= 0 ? trimmed.slice(i + 1) : trimmed; }
function dot(status) { return el('span', `dot tone-${statusTone(status)}`); }

// ---------- Connection / welcome / activity ----------
function activitySummary() {
  const phase = liveActivity?.phase;
  const key = `activity.phase.${phase}`;
  const label = P.MESSAGES[lang][key] ? t(key) : t('activity.live');
  const timestamp = Date.parse(liveActivity?.last_event_at || '');
  const age = Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 1000) : null;
  return {label, detail: age === null ? label : `${label} · ${t('activity.lastEvent', {age: P.formatDuration(age, lang)})}`};
}

const CONNECTION_TONES = {connecting: 'neutral', live: 'success', saved: 'neutral', reconnecting: 'warn', ready: 'success', offline: 'danger'};
function connection(state) { conn = state; renderConnection(); renderWelcome(); renderActivity(); }
function renderConnection() {
  const node = $('connection');
  const cls = `connection tone-${CONNECTION_TONES[conn] || 'neutral'}${conn === 'live' ? ' is-live' : ''}`;
  if (node.className !== cls) node.className = cls;
  const activity = conn === 'live' && current && active(current.status) ? activitySummary() : null;
  setText(node.querySelector('.connection-label'), activity ? activity.label : t(`conn.${conn}`));
  node.title = activity ? activity.detail : t(`conn.${conn}.hint`);
}
function renderWelcome() {
  const offline = conn === 'offline';
  $('welcome-status').className = `welcome-status tone-${offline ? 'danger' : 'active'}`;
  setText($('welcome-status-text'), t(offline ? 'welcome.offline' : 'welcome.waiting'));
}
function renderActivity() {
  const node = $('activity');
  node.hidden = !current;
  if (!current) return;
  const offline = conn === 'offline', live = !offline && active(current.status);
  const detail = live ? activitySummary().detail : '';
  const signature = [lang, offline, live, detail].join('|');
  if (node.dataset.signature === signature) return;
  node.dataset.signature = signature;
  node.className = `activity tone-${offline ? 'danger' : live ? 'active' : 'neutral'}${live ? ' is-live' : ''}`;
  node.replaceChildren(el('span', 'dot'), el('span', '', offline ? t('conn.offline.hint') : live ? detail : t('activity.saved')));
}

// ---------- Session list ----------
function renderList(force) {
  const groups = new Map();
  for (const run of runs) { if (!groups.has(run.session_id)) groups.set(run.session_id, []); groups.get(run.session_id).push(run); }
  const signature = JSON.stringify([lang, selected, [...groups].map(([id, rs]) => [id, rs.map(r => [r.id,r.title,r.status,r.profile,r.model,r.cwd])])]);
  if (!force && signature === lastList) return;
  lastList = signature;
  const nav = $('sessions');
  const focused = nav.contains(document.activeElement) ? document.activeElement.dataset.session : undefined;
  nav.replaceChildren();
  const countLabel = P.plural(lang, 'count.sessions', groups.size);
  for (const badge of [$('run-count'), $('rail-count')]) { setText(badge, groups.size); badge.title = countLabel; }
  if (!groups.size) { nav.append(el('p', 'sessions-empty', t('sessions.empty'))); return; }
  for (const [sessionId, group] of groups) {
    const latest = group[0]; const isActive = group.some(r => r.id === selected);
    const button = el('button', 'session' + (isActive ? ' active' : ''));
    button.type = 'button'; button.dataset.session = sessionId;
    if (isActive) button.setAttribute('aria-current', 'true');
    const title = describe(latest);
    button.title = latest.cwd ? `${title}\n${latest.cwd}` : title;
    const meta = el('span', 'session-meta');
    const project = baseName(latest.cwd);
    if (project) meta.append(el('span', 'session-project', project));
    meta.append(el('span', '', statusLabel(latest.status)), el('span', '', P.plural(lang, 'count.turns', group.length)));
    const body = el('span', 'session-body'); body.append(el('span', 'session-title', title), meta);
    button.append(dot(latest.status), body);
    button.addEventListener('click', () => { select(latest.id); closeRail(); });
    nav.append(button);
    if (focused === sessionId) button.focus();
  }
}

// ---------- Task header ----------
function renderStatus(status) {
  const node = $('status');
  if (!node.firstChild) node.append(el('span', 'dot'), el('span', 'status-text'));
  const cls = `status-pill tone-${statusTone(status)}`;
  if (node.className !== cls) node.className = cls;
  setText(node.lastChild, statusLabel(status));
}
function renderPath(node, path) {
  const value = String(path || '');
  const signature = `${lang}|${value}`;
  if (node.dataset.signature === signature) return;
  node.dataset.signature = signature;
  const trimmed = value.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const dir = i >= 0 ? trimmed.slice(0, i + 1) : '';
  const name = i >= 0 ? trimmed.slice(i + 1) : trimmed;
  node.replaceChildren(el('span', 'path-dir', dir), el('span', 'path-base', name || value));
  node.title = value;
  node.setAttribute('aria-label', t('task.cwd', {path: value}));
}
function renderBanner(run) {
  const box = $('error');
  const show = !!run.error || run.status === 'failed' || run.status === 'interrupted';
  const signature = JSON.stringify([lang, show, run.status, run.error, run.exit_code]);
  if (box.dataset.signature === signature) return;
  box.dataset.signature = signature;
  box.hidden = !show;
  if (!show) { box.replaceChildren(); return; }
  const kind = run.status === 'failed' ? 'failed' : run.status === 'interrupted' ? 'interrupted' : 'error';
  box.className = `banner tone-${kind === 'interrupted' ? 'warn' : 'danger'}`;
  const text = el('div', 'banner-text');
  text.append(el('p', 'banner-title', t(`banner.${kind}`)));
  if (run.exit_code !== undefined && run.exit_code !== null && run.exit_code !== 0) text.append(el('p', 'banner-meta', t('banner.exitCode', {code: run.exit_code})));
  if (run.error) text.append(el('pre', 'banner-detail', String(run.error)));
  box.replaceChildren(icon(kind === 'interrupted' ? 'pause' : 'alert', 'banner-icon'), text);
}
function renderTurns(run) {
  const group = runs.filter(r => r.session_id === run.session_id).reverse();
  const signature = lang + '|' + group.map(r => r.id + (r.resumed ? '*' : '')).join(',');
  if ($('turn').dataset.signature !== signature) {
    $('turn').replaceChildren(...group.map((r,i) => {
      const label = t('turn.option', {n: i + 1, total: group.length}) + (r.resumed ? ` · ${t('turn.resumed')}` : '');
      const option = el('option', '', label); option.value = r.id; return option;
    }));
    $('turn').dataset.signature = signature;
  }
  $('turn').disabled = group.length < 2;
  $('turn').value = run.id;
}
function heading(run) {
  current = run;
  $('welcome').hidden = true; $('workspace').hidden = false;
  const title = describe(run);
  setText($('title'), title); $('title').title = title;
  setText($('profile'), profileLabel(run.profile));
  $('profile').title = run.profile ? t('task.profile', {profile: run.profile}) : '';
  const sessionId = String(run.session_id || '');
  setText($('session-id'), sessionId.slice(0, 8)); $('session-id').title = t('task.sessionId', {id: sessionId});
  setText($('model'), run.model || t('task.noModel')); $('model').title = run.model ? t('task.model', {model: run.model}) : '';
  renderStatus(run.status);
  setText($('duration'), elapsed(run));
  renderPath($('cwd'), run.cwd);
  $('cwd').parentElement.hidden = !run.cwd;
  renderBanner(run);
  renderTurns(run);
  renderActivity();
}

// ---------- Streaming ----------
function select(id) {
  if (source) source.close();
  if (id !== selected) { expanded.clear(); autoOpened.clear(); finalOpen = false; }
  liveActivity = null;
  selected = id; history.replaceState(null,'',`#${id}`); cards.clear(); nodes.clear(); finalResult = null; snapshotReceived = false;
  $('cards').replaceChildren(); $('result').hidden = true; $('waiting').hidden = false;
  const run = runs.find(r => r.id === id); if (!run) return;
  heading(run); renderList(); connection('connecting'); renderWaiting(); applyFilter();
  source = new EventSource(`${base}events/${encodeURIComponent(id)}`);
  streamClosed = false;
  const thisSource = source;
  source.addEventListener('snapshot', event => receive(event, true));
  source.addEventListener('update', event => receive(event, false));
  source.addEventListener('done', () => { thisSource.close(); if (source === thisSource) { streamClosed = true; connection('saved'); } });
  source.onerror = () => { if (source === thisSource) connection('reconnecting'); };
}
function receive(event, reset) {
  const data = JSON.parse(event.data);
  if (data.run.id !== selected) return;
  liveActivity = data.activity || liveActivity;
  connection('live');
  snapshotReceived = true;
  const timeline = $('timeline'), following = $('follow').checked;
  const keepScroll = reset && !following ? timeline.scrollTop : null;
  if (reset) { cards.clear(); nodes.clear(); $('cards').replaceChildren(); }
  heading(data.run);
  streamRevision = revision(data.run);
  const index = runs.findIndex(r => r.id === selected); if (index >= 0) runs[index] = data.run;
  for (const card of data.cards) { if (!['text','tool'].includes(card.kind)) continue; cards.set(card.id, card); renderCard(card); }
  finalResult = data.final; renderResult(); renderList(); applyFilter();
  renderWaiting();
  if (keepScroll !== null) timeline.scrollTop = keepScroll;
  if (following) requestAnimationFrame(() => { timeline.scrollTop = timeline.scrollHeight; });
  else $('jump').hidden = false;
}
function renderWaiting() {
  const node = $('waiting');
  node.hidden = cards.size > 0 || !!finalResult;
  const state = !snapshotReceived ? 'loading' : current && !active(current.status) ? 'ended' : 'waiting';
  node.className = `waiting is-${state}`;
  setText(node.querySelector('.waiting-title'), t(`waiting.${state}.title`));
  setText(node.querySelector('.waiting-body'), t(`waiting.${state}.body`));
}

// ---------- Cards ----------
function renderCard(card) {
  let node = nodes.get(card.id);
  if (!node) { node = el('article','card'); nodes.set(card.id,node); $('cards').append(node); }
  if (card.kind === 'text') renderText(node, card); else renderTool(node, card);
}
function renderText(node, card) {
  if (!node.querySelector('.reply')) {
    const caption = el('div', 'card-caption');
    caption.append(icon('sparkle', 'caption-icon'), el('span', 'caption-label'), el('span', 'caption-status'));
    node.replaceChildren(caption, el('div', 'reply markdown'));
  }
  node.className = 'card text-card' + (card.streaming ? ' streaming' : '');
  setText(node.querySelector('.caption-label'), t('card.assistant'));
  setText(node.querySelector('.caption-status'), card.streaming ? t('card.writing') : '');
  window.WorkBuddyMarkdown.render(node.querySelector('.reply'), card.text || '');
}
function toolIcon(name) {
  const n = String(name || '').toLowerCase();
  if (/edit|replace|patch/.test(n)) return 'pencil';
  if (/write|create/.test(n)) return 'filePlus';
  if (/bash|shell|exec|command|terminal/.test(n)) return 'terminal';
  if (/grep|glob|search|find/.test(n)) return 'search';
  if (/read|view|notebook/.test(n) || n === 'ls') return 'fileText';
  if (/web|fetch|http|url|browse/.test(n)) return 'globe';
  if (/todo|plan|task/.test(n)) return 'list';
  return 'wrench';
}
// One-line hint for tools without a path, e.g. the command of a shell call.
function inputPreview(input) {
  const text = asText(input).trim();
  if (!text) return '';
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object') {
      for (const key of ['command','file_path','path','pattern','query','url','description','prompt']) {
        if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim().split('\n')[0].slice(0, 240);
      }
      return '';
    }
  } catch (_) { /* not JSON: fall through to the raw first line */ }
  return text.split('\n')[0].slice(0, 240);
}
function diffLines(diff, format) {
  let inHunk = false;
  return diff.split('\n').map((text, index) => {
    let kind = 'diff-context';
    if (format !== 'additions' && /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(text)) {
      inHunk = true; kind = 'diff-hunk';
    } else if (format !== 'additions' && !inHunk && index < 2 && /^(--- |\+\+\+ )/.test(text)) kind = 'diff-meta';
    else if (text.startsWith('+')) kind = 'diff-add';
    else if (text.startsWith('-')) kind = 'diff-remove';
    return {text, kind};
  });
}
const IN_FLIGHT = ['', 'preparing', 'running', 'started', 'executing', 'pending', 'queued', 'in_progress'];
function toolStateInfo(card) {
  const state = card.state ? String(card.state) : '';
  const change = hasChange(card);
  if (state === 'succeeded') return {tone: 'success', label: t(change ? 'change.badge.applied' : 'toolState.succeeded')};
  if (state === 'failed') return {tone: 'danger', label: t(change ? 'change.badge.failed' : 'toolState.failed')};
  if (state === 'incomplete') return {tone: 'warn', label: t(change ? 'change.badge.incomplete' : 'toolState.incomplete')};
  if (change) return {tone: 'warn', label: t('change.badge.pending')};
  return {tone: IN_FLIGHT.includes(state) ? 'active' : 'neutral', label: P.labelFor(lang, 'toolState', state || 'running')};
}
let toolSequence = 0;
function buildTool(node, id) {
  const head = el('button', 'tool-head'); head.type = 'button';
  const bodyId = `tool-body-${++toolSequence}`;
  head.setAttribute('aria-controls', bodyId);
  const main = el('span', 'tool-main'); main.append(el('span', 'tool-name'), el('span', 'tool-path'));
  head.append(el('span', 'tool-icon'), main, el('span', 'tool-stats'), el('span', 'tool-state'), icon('chevronRight', 'tool-chevron'));
  head.addEventListener('click', () => {
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    const card = cards.get(id); if (card) renderTool(node, card);
  });
  const change = el('section', 'change'); change.hidden = true;
  const body = el('div', 'tool-body'); body.id = bodyId; body.hidden = true;
  const args = el('section', 'tool-section tool-args'); args.append(el('h3'), el('pre', 'code'));
  const result = el('section', 'tool-section tool-result'); result.append(el('h3'), el('pre', 'code'), el('p', 'tool-placeholder'));
  body.append(args, result);
  node.replaceChildren(head, change, body);
}
function renderTool(node, card) {
  if (!node.querySelector('.tool-head')) buildTool(node, card.id);
  const change = hasChange(card);
  const phase = card.state === 'succeeded' ? 'applied' : card.state === 'failed' ? 'failed' : card.state === 'incomplete' ? 'incomplete' : 'pending';
  if (card.state === 'failed' && !autoOpened.has(card.id)) { autoOpened.add(card.id); expanded.add(card.id); }
  const open = expanded.has(card.id);
  node.className = `card tool-card phase-${phase}${change ? ' has-change' : ''}${open ? ' open' : ''}`;

  const head = node.querySelector('.tool-head');
  head.setAttribute('aria-expanded', String(open));
  head.title = t(open ? 'tool.hide' : 'tool.show');
  const iconName = toolIcon(card.name), iconSlot = node.querySelector('.tool-icon');
  if (iconSlot.dataset.iconName !== iconName) { iconSlot.dataset.iconName = iconName; iconSlot.replaceChildren(icon(iconName)); }
  setText(node.querySelector('.tool-name'), card.name || t('tool.fallbackName'));
  const detail = card.path || inputPreview(card.input);
  const pathNode = node.querySelector('.tool-path');
  setText(pathNode, detail); pathNode.title = detail; pathNode.hidden = !detail;

  const stats = node.querySelector('.tool-stats');
  stats.hidden = !change;
  if (change) {
    const lines = diffLines(String(card.diff), card.diff_format || (card.name === 'Write' ? 'additions' : 'unified'));
    const add = lines.filter(line => line.kind === 'diff-add').length;
    const del = lines.filter(line => line.kind === 'diff-remove').length;
    const signature = `${add}|${del}|${lang}`;
    if (stats.dataset.signature !== signature) {
      stats.dataset.signature = signature;
      stats.replaceChildren(el('span', 'stat-add', `+${add}`), el('span', 'stat-del', `\u2212${del}`));
      stats.title = t('change.stats', {add, del});
    }
  }

  const info = toolStateInfo(card), state = node.querySelector('.tool-state');
  if (!state.firstChild) state.append(el('span', 'dot'), el('span', 'state-label'));
  const stateClass = `tool-state tone-${info.tone}`;
  if (state.className !== stateClass) state.className = stateClass;
  setText(state.lastChild, info.label);

  const section = node.querySelector('.change');
  section.hidden = !change;
  if (change) renderChange(section, String(card.diff), phase, card.diff_format || (card.name === 'Write' ? 'additions' : 'unified'));

  node.querySelector('.tool-body').hidden = !open;
  const [argsHeading, argsPre] = node.querySelector('.tool-args').children;
  setText(argsHeading, t('tool.args'));
  const input = asText(card.input);
  setText(argsPre, input || t('tool.noArgs')); argsPre.classList.toggle('is-empty', !input);
  const [resultHeading, resultPre, placeholder] = node.querySelector('.tool-result').children;
  setText(resultHeading, t('tool.result'));
  const hasResult = card.result !== undefined && card.result !== null;
  resultPre.hidden = !hasResult; placeholder.hidden = hasResult;
  if (hasResult) setText(resultPre, asText(card.result));
  else setText(placeholder, t(phase === 'pending' ? 'tool.awaitingResult' : 'tool.noResult'));
  resultPre.classList.toggle('is-error', card.state === 'failed');
}
const PHASE_TONE = {pending: 'warn', applied: 'success', failed: 'danger', incomplete: 'warn'};
const PHASE_ICON = {pending: 'hourglass', applied: 'checkCircle', failed: 'xCircle', incomplete: 'alert'};
function renderChange(section, diff, phase, format) {
  const cls = `change change-${phase} tone-${PHASE_TONE[phase]}`;
  if (section.className !== cls) section.className = cls;
  const signature = `${lang}|${phase}`;
  if (section.dataset.signature !== signature) {
    section.dataset.signature = signature;
    const head = el('div', 'change-head'), text = el('div', 'change-text');
    text.append(el('p', 'change-title', t(`change.title.${phase}`)), el('p', 'change-desc', t(`change.desc.${phase}`)));
    head.append(icon(PHASE_ICON[phase]), text);
    const old = section.querySelector('.change-head');
    if (old) old.replaceWith(head); else section.prepend(head);
  }
  let pre = section.querySelector('.diff');
  if (!pre) { pre = el('pre', 'diff'); section.append(pre); }
  if (diffCache.get(pre) !== format + diff) {
    diffCache.set(pre, format + diff);
    pre.replaceChildren(...diffLines(diff, format).map(line => el('span', `diff-line ${line.kind}`, line.text)));
  }
}

// ---------- Result ----------
function renderResult() {
  const section = $('result'); section.replaceChildren(); section.hidden = !finalResult;
  if (!finalResult) return;
  const status = current ? current.status : '';
  const subtype = finalResult.subtype ? String(finalResult.subtype) : '';
  let tone = statusTone(status);
  if (tone !== 'danger' && subtype && subtype !== 'success') tone = 'warn';
  if (tone === 'active' || tone === 'neutral') tone = subtype === 'success' ? 'success' : 'neutral';
  section.className = `result tone-${tone}`;
  const titleKey = active(status) ? 'received' : ['completed', 'failed', 'interrupted'].includes(status) ? status : 'finished';
  const head = el('div', 'result-head');
  head.append(icon(tone === 'danger' ? 'xCircle' : tone === 'warn' ? 'alert' : 'checkCircle'), el('h2', '', t(`result.title.${titleKey}`)));
  const facts = el('dl', 'facts');
  const fact = (label, value, raw) => { const item = el('div', 'fact'); const dd = el('dd', '', value); if (raw) dd.title = raw; item.append(el('dt', '', label), dd); facts.append(item); };
  const denials = finalResult.permission_denials;
  fact(t('result.outcome'), P.labelFor(lang, 'subtype', subtype), subtype);
  fact(t('result.turns'), String(Number(finalResult.turns) || 0));
  fact(t('result.denials'), String(Array.isArray(denials) ? denials.length : denials ?? 0));
  if (current) fact(t('result.duration'), elapsed(current));
  fact(t('result.runner'), statusLabel(status), status);
  section.append(head, facts);
  const lastText = [...cards.values()].filter(c => c.kind === 'text').at(-1)?.text;
  if (finalResult.text && finalResult.text !== lastText) {
    const details = el('details', 'final'); details.open = finalOpen;
    details.addEventListener('toggle', () => { finalOpen = details.open; });
    const reply = el('div','markdown final-reply');
    window.WorkBuddyMarkdown.render(reply,finalResult.text);
    details.append(el('summary', '', t('result.finalResponse')), reply); section.append(details);
  }
  const errors = asText(finalResult.errors);
  if (errors && errors !== '[]') { const box = el('div', 'result-errors'); box.append(el('h3', '', t('result.errors')), el('pre', '', errors)); section.append(box); }
}

// ---------- Filters ----------
const matchesFilter = (card, key) => key === 'all' || key === card.kind || (key === 'changes' && hasChange(card));
function applyFilter() {
  const counts = {all: 0, text: 0, tool: 0, changes: 0}; let visible = 0;
  for (const [id,card] of cards) {
    const match = matchesFilter(card, filter); const node = nodes.get(id); if (node) node.hidden = !match;
    if (match) visible++;
    for (const key in counts) if (matchesFilter(card, key)) counts[key]++;
  }
  for (const button of filterButtons) setText(button.querySelector('.seg-count'), cards.size ? counts[button.dataset.filter] : '');
  setText($('event-count'), P.plural(lang, 'count.items', cards.size));
  const empty = $('filter-empty');
  empty.hidden = !(cards.size > 0 && visible === 0);
  if (!empty.hidden) setText(empty, t(`filter.empty.${filter}`));
}

// ---------- Polling ----------
async function refresh() {
  try {
    const response = await fetch(`${base}runs`,{cache:'no-store'}); if (!response.ok) throw new Error('Monitor unavailable');
    runs = await response.json();
    if (conn === 'offline') connection(streamClosed ? (current ? 'saved' : 'ready') : 'reconnecting');
    renderList();
    if (runs.length && !current) select(runs.some(r => r.id === selected) ? selected : runs[0].id);
    if (!runs.length) connection('ready');
    const run = runs.find(r => r.id === selected);
    if (run) { heading(run); if (streamClosed && (active(run.status) || revision(run) !== streamRevision)) select(run.id); }
  } catch (_) { connection('offline'); }
}

// ---------- Session drawer (narrow layouts) ----------
const isNarrow = () => !!(narrowQuery && narrowQuery.matches);
function setRail(open, restoreFocus) {
  const wasOpen = document.body.classList.contains('rail-open');
  const next = !!open && isNarrow();
  document.body.classList.toggle('rail-open', next);
  $('scrim').hidden = !next;
  $('rail-toggle').setAttribute('aria-expanded', String(next));
  $('rail').inert = isNarrow() && !next;
  document.querySelector('.main').inert = next;
  if (next) ($('sessions').querySelector('.session.active') || $('sessions').querySelector('.session') || $('rail-close')).focus();
  else if (wasOpen && restoreFocus) $('rail-toggle').focus();
}
function closeRail() { if (document.body.classList.contains('rail-open')) setRail(false, true); }

// ---------- Preferences ----------
function translateStatic() {
  document.title = t('app.docTitle');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-aria-label]')) node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  for (const node of document.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
}
// Re-render all chrome in place. State (turn, cards, filter, expansion, scroll) is untouched.
function rerenderAll() {
  const timeline = $('timeline'), top = timeline.scrollTop, following = $('follow').checked;
  renderConnection(); renderWelcome(); renderList(true);
  if (current) { heading(current); for (const card of cards.values()) renderCard(card); renderResult(); applyFilter(); renderWaiting(); }
  timeline.scrollTop = following ? timeline.scrollHeight : top;
}
function renderSettingsHints() {
  setText($('language-hint'), languageChoice === 'system' ? t('settings.hint.languageSystem', {value: t(`langName.${lang}`)}) : t('settings.hint.languageFixed'));
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  setText($('theme-hint'), themeChoice === 'system' ? t('settings.hint.themeSystem', {value: t(`option.${theme}`)}) : t('settings.hint.themeFixed'));
  setText($('storage-note'), t(storageWritable ? 'settings.storage' : 'settings.storageUnavailable'));
}
function syncSettingsForm() {
  for (const input of document.querySelectorAll('input[name="language"]')) input.checked = input.value === languageChoice;
  for (const input of document.querySelectorAll('input[name="theme"]')) input.checked = input.value === themeChoice;
  renderSettingsHints();
}
function applyLanguage(force) {
  const next = P.resolveLanguage(languageChoice, navigator);
  const changed = next !== lang;
  lang = next;
  const root = document.documentElement;
  root.lang = P.htmlLang(lang); root.dataset.language = lang;
  if (changed || force) { translateStatic(); rerenderAll(); }
  root.removeAttribute('data-i18n-pending');
  renderSettingsHints();
}
function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = P.resolveTheme(themeChoice, !!(darkQuery && darkQuery.matches));
  root.dataset.themeChoice = themeChoice;
  renderSettingsHints();
}
function onMediaChange(query, handler) { if (!query) return; if (query.addEventListener) query.addEventListener('change', handler); else if (query.addListener) query.addListener(handler); }

// ---------- Wiring ----------
hydrateIcons();
languageChoice = P.readChoice(storage, P.LANGUAGE_KEY, P.LANGUAGE_CHOICES);
themeChoice = P.readChoice(storage, P.THEME_KEY, P.THEME_CHOICES);
applyTheme();
applyLanguage(true);
syncSettingsForm();
setRail(false);

for (const input of document.querySelectorAll('input[name="language"]')) input.addEventListener('change', () => {
  if (!input.checked) return;
  languageChoice = P.normalizeLanguageChoice(input.value);
  P.writeChoice(storage, P.LANGUAGE_KEY, languageChoice, P.LANGUAGE_CHOICES);
  applyLanguage(false);
});
for (const input of document.querySelectorAll('input[name="theme"]')) input.addEventListener('change', () => {
  if (!input.checked) return;
  themeChoice = P.normalizeThemeChoice(input.value);
  P.writeChoice(storage, P.THEME_KEY, themeChoice, P.THEME_CHOICES);
  applyTheme();
});
window.addEventListener('languagechange', () => { if (languageChoice === 'system') applyLanguage(false); });
onMediaChange(darkQuery, () => { if (themeChoice === 'system') applyTheme(); else renderSettingsHints(); });
onMediaChange(narrowQuery, () => setRail(false));
window.addEventListener('storage', event => {
  if (storage && event.storageArea && event.storageArea !== storage) return;
  if (event.key === null || event.key === P.LANGUAGE_KEY) { languageChoice = P.readChoice(storage, P.LANGUAGE_KEY, P.LANGUAGE_CHOICES); applyLanguage(false); }
  if (event.key === null || event.key === P.THEME_KEY) { themeChoice = P.readChoice(storage, P.THEME_KEY, P.THEME_CHOICES); applyTheme(); }
  syncSettingsForm();
});

const settings = $('settings');
$('settings-open').addEventListener('click', () => {
  syncSettingsForm();
  if (typeof settings.showModal === 'function') { if (!settings.open) settings.showModal(); } else settings.setAttribute('open', '');
});
$('settings-close').addEventListener('click', () => { if (typeof settings.close === 'function') settings.close(); else settings.removeAttribute('open'); });
settings.addEventListener('click', event => { if (event.target === settings) settings.close(); });

$('rail-toggle').addEventListener('click', () => setRail(!document.body.classList.contains('rail-open')));
$('rail-close').addEventListener('click', closeRail);
$('scrim').addEventListener('click', closeRail);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('rail-open')) closeRail(); });

$('turn').addEventListener('change', () => select($('turn').value));
for (const button of filterButtons) button.addEventListener('click', () => { filter = button.dataset.filter; for (const b of filterButtons) { b.classList.toggle('selected', b===button); b.setAttribute('aria-pressed',String(b===button)); } applyFilter(); });
$('follow').addEventListener('change', () => { if ($('follow').checked) { $('timeline').scrollTop = $('timeline').scrollHeight; $('jump').hidden = true; } });
$('jump').addEventListener('click', () => { $('follow').checked = true; $('timeline').scrollTop = $('timeline').scrollHeight; $('jump').hidden = true; });
$('timeline').addEventListener('wheel', event => { if (event.deltaY < 0) { $('follow').checked = false; $('jump').hidden = false; } }, {passive:true});
$('timeline').addEventListener('keydown', event => { if (['ArrowUp','PageUp','Home'].includes(event.key)) { $('follow').checked = false; $('jump').hidden = false; } });
window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id !== selected && runs.some(r => r.id === id)) select(id); });
setInterval(refresh,2000); setInterval(() => { if (current) setText($('duration'), elapsed(current)); renderActivity(); renderConnection(); },1000); refresh();
