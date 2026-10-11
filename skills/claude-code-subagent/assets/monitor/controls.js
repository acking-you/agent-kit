'use strict';
// Native session controls: stop, resume and session details for the selected turn.
// app.js announces the selection with a "native-run" event. A request always targets
// the turn selected when it started, and only one request runs at a time.
(() => {
  const $ = id => document.getElementById(id);
  const WORDS = {
    en: {
      stop: 'Stop task', stopping: 'Stopping…', resume: 'Resume', resuming: 'Resuming…',
      prompt: 'Next instruction', hint: 'Continue this session', shortcut: '⌘/Ctrl + Enter',
      info: 'Session details', intro: 'Runs under Claude Code’s native background supervisor. Closing this panel leaves it running.',
      job: 'Job', session: 'Session', permissions: 'Permissions', tools: 'Tools', effort: 'Effort',
      reported: 'Reported model', notReported: 'Not reported yet', fullAccess: 'Full access',
      attach: 'Attach in a terminal to watch the live session or answer native prompts:',
      copy: 'Copy', copied: 'Copied',
      note: 'Replies appear as Claude saves message blocks, not token by token.',
      blocked: 'Claude is waiting for native input. Attach in a terminal to answer.',
      resumed: 'Claude continued in a new session UUID; the source is recorded. Verify retained context.',
      mismatch: 'Reported model {reported} differs from the requested {model}.',
      otherBusy: 'Another control request is still in progress.',
      failed: 'Request failed',
    },
    zh: {
      stop: '停止任务', stopping: '正在停止…', resume: '恢复', resuming: '正在恢复…',
      prompt: '下一步指令', hint: '继续此会话', shortcut: '⌘/Ctrl + Enter',
      info: '会话详情', intro: '任务由 Claude Code 原生后台监管器运行，关闭面板不会中止任务。',
      job: '任务', session: '会话', permissions: '权限', tools: '工具', effort: '推理强度',
      reported: '报告的模型', notReported: '尚未报告', fullAccess: '完全访问',
      attach: '在终端中连接，可查看实时会话或回答原生提示：',
      copy: '复制', copied: '已复制',
      note: '回复随 Claude 保存消息块更新，并非逐字输出。',
      blocked: 'Claude 正在等待原生输入，请在终端中连接后回答。',
      resumed: 'Claude 已续接到新的会话 UUID，原会话已记录。请核对保留的上下文。',
      mismatch: '报告的模型 {reported} 与请求的 {model} 不一致。',
      otherBusy: '另一个控制请求仍在处理中。',
      failed: '请求失败',
    },
  };
  const STOPPABLE = ['running', 'starting', 'blocked', 'unknown'];
  const RESUMABLE = ['completed', 'stopped', 'failed'];
  const words = () => WORDS[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'];
  const fill = (text, params) => text.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? '');
  const attachCommand = r => r?.job_id ? `claude attach ${r.job_id}` : '';

  function make(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key in node) node[key] = value; else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  }
  function glyph(paths) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'icon');
    for (const [tag, attrs] of paths) {
      const child = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, value);
      svg.append(child);
    }
    return svg;
  }

  let run = null, busy = null, message = null; // busy: {id, action}; message: {id, text}

  // Header actions: contextual stop plus a details toggle.
  const stopLabel = make('span');
  const stop = make('button', {type: 'button', id: 'native-stop', className: 'control-button is-stop'},
    glyph([['rect', {x: 7, y: 7, width: 10, height: 10, rx: 2}]]), stopLabel);
  const infoLabel = make('span', {className: 'control-label'});
  const infoToggle = make('button', {type: 'button', id: 'native-info-toggle', className: 'control-button is-quiet', 'aria-controls': 'native-detail', 'aria-expanded': 'false'},
    glyph([['circle', {cx: 12, cy: 12, r: 8.5}], ['path', {d: 'M12 11v5M12 8h.01'}]]), infoLabel);

  // Session details: identity, permissions and attach guidance.
  const intro = make('p', {className: 'detail-intro'});
  const facts = make('dl', {className: 'detail-facts'});
  const attachText = make('p', {className: 'detail-label'});
  const attachCode = make('code', {id: 'native-attach'});
  const copy = make('button', {type: 'button', className: 'control-button is-quiet is-small'});
  const attachRow = make('div', {className: 'attach-row'}, attachCode, copy);
  const note = make('p', {className: 'detail-note'});
  const detail = make('div', {id: 'native-detail', className: 'native-detail', hidden: true}, intro, facts, attachText, attachRow, note);

  // Notices: native states that need attention, plus control request feedback.
  const status = make('p', {id: 'native-status', className: 'control-status', role: 'status'});
  const notices = make('div', {className: 'notice-list'});

  // Composer: only offered when the selected turn can be resumed.
  const prompt = make('textarea', {id: 'native-prompt', rows: 2, 'aria-describedby': 'native-hint'});
  const resumeLabel = make('span');
  const resume = make('button', {type: 'button', id: 'native-resume', className: 'control-button is-primary'},
    resumeLabel, glyph([['path', {d: 'M5 12h13M13 6.5l5.5 5.5-5.5 5.5'}]]));
  const hint = make('span', {id: 'native-hint', className: 'composer-hint'});
  const composer = make('div', {className: 'composer-box'}, prompt, make('div', {className: 'composer-foot'}, hint, resume));

  $('native-actions').append(stop, infoToggle);
  $('native-info').append(detail);
  $('native-notice').append(status, notices);
  $('native-composer').append(composer);
  const composerSlot = $('native-composer');

  function renderFacts(w) {
    const mode = run?.permission_mode || '';
    const rows = [
      [w.job, run?.job_id || '—'],
      [w.session, run?.session_id || '—'],
      [w.permissions, mode === 'bypassPermissions' ? `${w.fullAccess} · ${mode}` : mode || '—'],
      [w.tools, run?.tools || '—'],
      [w.effort, run?.effort || '—'],
      [w.reported, run?.reported_model || w.notReported],
    ];
    const signature = JSON.stringify(rows);
    if (facts.dataset.signature === signature) return;
    facts.dataset.signature = signature;
    facts.replaceChildren(...rows.map(([label, value]) => make('div', {className: 'detail-fact'}, make('dt', {textContent: label}), make('dd', {textContent: value}))));
  }
  function renderNotices(w) {
    const items = [];
    if (run?.observation_error) items.push({tone: 'danger', text: run.observation_error});
    if (run && (run.waiting_for || run.status === 'blocked')) items.push({tone: 'warn', text: w.blocked, code: attachCommand(run)});
    if (run?.reported_model && run.model && run.reported_model !== run.model) items.push({tone: 'warn', text: fill(w.mismatch, {reported: run.reported_model, model: run.model})});
    if (run?.resume_note) items.push({tone: 'neutral', text: w.resumed});
    const signature = JSON.stringify(items);
    if (notices.dataset.signature === signature) return;
    notices.dataset.signature = signature;
    notices.replaceChildren(...items.map(item => {
      const node = make('p', {className: `notice tone-${item.tone}`, role: item.tone === 'danger' ? 'alert' : ''}, make('span', {className: 'dot'}), make('span', {className: 'notice-text', textContent: item.text}));
      if (!node.getAttribute('role')) node.removeAttribute('role');
      if (item.code) node.append(make('code', {textContent: item.code}));
      return node;
    }));
  }
  function render() {
    const w = words(), mine = !!busy && busy.id === run?.id;
    const canStop = !!run && STOPPABLE.includes(run.status);
    const canResume = !!run && RESUMABLE.includes(run.status);
    stopLabel.textContent = mine && busy.action === 'stop' ? w.stopping : w.stop;
    stop.hidden = !(canStop || (mine && busy.action === 'stop'));
    stop.disabled = !!busy || !canStop;
    infoLabel.textContent = w.info; infoToggle.title = w.info; infoToggle.hidden = !run;
    resumeLabel.textContent = mine && busy.action === 'resume' ? w.resuming : w.resume;
    composerSlot.hidden = !(canResume || (mine && busy.action === 'resume'));
    resume.disabled = !!busy || !canResume || !prompt.value.trim();
    prompt.placeholder = w.prompt; prompt.setAttribute('aria-label', w.prompt);
    hint.textContent = `${w.hint} · ${w.shortcut}`;
    intro.textContent = w.intro; attachText.textContent = w.attach; note.textContent = w.note;
    attachCode.textContent = attachCommand(run);
    attachText.hidden = attachRow.hidden = !run?.job_id;
    if (copy.dataset.state !== 'copied') copy.textContent = w.copy;
    renderFacts(w); renderNotices(w);
    status.textContent = mine ? (busy.action === 'stop' ? w.stopping : w.resuming) : busy ? w.otherBusy : message && message.id === run?.id ? message.text : '';
    status.hidden = !status.textContent;
  }
  async function control(action) {
    if (busy || !run) return;
    const id = run.id, hadFocus = document.activeElement === stop;
    busy = {id, action}; message = null; render();
    try {
      const response = await fetch(location.pathname + 'control/' + id, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, prompt: prompt.value})});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || words().failed);
      if (run?.id === id) {
        if (action === 'resume') { prompt.value = ''; location.hash = data.run.id; }
        else run = data.run;
      }
    } catch (error) { if (run?.id === id) message = {id, text: error.message || words().failed}; }
    finally {
      busy = null; render();
      // The stop button disappears once the turn ends; keep keyboard focus nearby.
      if (hadFocus && stop.hidden && !composerSlot.hidden) prompt.focus();
    }
  }

  stop.addEventListener('click', () => control('stop'));
  resume.addEventListener('click', () => control('resume'));
  prompt.addEventListener('input', render);
  prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (!resume.disabled) control('resume'); }
  });
  infoToggle.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    infoToggle.setAttribute('aria-expanded', String(!detail.hidden));
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(attachCode.textContent); }
    catch (_) { getSelection().selectAllChildren(attachCode); return; }
    copy.dataset.state = 'copied'; copy.textContent = words().copied;
    setTimeout(() => { delete copy.dataset.state; render(); }, 1600);
  });
  window.addEventListener('native-run', event => { if (message && message.id !== event.detail?.id) message = null; run = event.detail; render(); });
  new MutationObserver(render).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  render();
})();
