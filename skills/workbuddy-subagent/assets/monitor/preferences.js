/*
 * WorkBuddy monitor preferences and localization helpers.
 *
 * Loaded synchronously in <head> before style.css so the resolved theme and
 * language are applied to <html> before first paint (no theme flash).
 *
 * All resolution helpers are pure and work in Node without a DOM:
 *   const prefs = require('./preferences.js');
 *   prefs.resolveLanguage('system', { languages: ['zh-CN'] }); // 'zh'
 *   prefs.resolveTheme('system', true);                          // 'dark'
 */
(function (factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.WorkBuddyPreferences = api;
    if (typeof document !== 'undefined' && document.documentElement) api.applyEarly(window, document);
  }
})(function () {
  'use strict';

  // Stable storage names. Storage is origin-bound, so a monitor served from a
  // different port has its own copy of these values.
  const LANGUAGE_KEY = 'workbuddy.monitor.language';
  const THEME_KEY = 'workbuddy.monitor.theme';
  const PROBE_KEY = 'workbuddy.monitor.__probe';

  const LANGUAGE_CHOICES = Object.freeze(['system', 'en', 'zh']);
  const THEME_CHOICES = Object.freeze(['system', 'light', 'dark']);
  const SUPPORTED_LANGUAGES = Object.freeze(['en', 'zh']);
  const DEFAULT_LANGUAGE = 'en';

  const MESSAGES = {
    en: {
      'profile.execute': 'Execution',
      'profile.design': 'Design',
      'profile.writing': 'Writing',
      'profile.brainstorm': 'Discussion',
      'toolState.preparing': 'Preparing',
      'toolState.incomplete': 'Incomplete',
      'change.badge.incomplete': 'Unconfirmed',
      'change.title.incomplete': 'Change not confirmed',
      'change.desc.incomplete': 'No successful tool result was recorded. Inspect the file before resuming.',
      'activity.phase.thinking': 'Thinking',
      'activity.phase.writing': 'Writing',
      'activity.phase.tool_input': 'Preparing a tool call',
      'activity.phase.tool_result': 'Processing tool results',
      'activity.phase.waiting': 'Waiting for model output',
      'activity.lastEvent': 'Last event {age} ago',
      'app.docTitle': 'WorkBuddy · Agent monitor',
      'app.subtitle': 'Agent monitor',

      'rail.toggle': 'Show sessions',
      'rail.close': 'Hide sessions',
      'rail.noteTitle': 'Read-only observer',
      'rail.noteBody': 'Watching never controls a task. Tasks keep running when you close this panel.',
      'sessions.heading': 'Sessions',
      'sessions.navLabel': 'WorkBuddy sessions',
      'sessions.empty': 'Sessions appear here once an agent starts.',

      'settings.open': 'Display preferences',
      'settings.title': 'Display preferences',
      'settings.close': 'Close preferences',
      'settings.language': 'Language',
      'settings.theme': 'Theme',
      'settings.hint.languageSystem': 'Following your browser · currently {value}',
      'settings.hint.languageFixed': 'Overrides your browser language',
      'settings.hint.themeSystem': 'Following your system · currently {value}',
      'settings.hint.themeFixed': 'Overrides your system appearance',
      'settings.storage': 'Saved in this browser for this monitor address. A monitor on a different port keeps its own settings.',
      'settings.storageUnavailable': 'Browser storage is unavailable, so these choices apply to this page only.',
      'option.system': 'System',
      'option.light': 'Light',
      'option.dark': 'Dark',
      'langName.en': 'English',
      'langName.zh': 'Simplified Chinese',

      'conn.connecting': 'Connecting',
      'conn.connecting.hint': 'Connecting to the monitor stream…',
      'conn.live': 'Live',
      'conn.live.hint': 'Receiving updates as they happen.',
      'conn.saved': 'Saved',
      'conn.saved.hint': 'The available transcript is saved. Check the run status for completion.',
      'conn.reconnecting': 'Reconnecting…',
      'conn.reconnecting.hint': 'The stream was interrupted. Trying to reconnect…',
      'conn.ready': 'Ready',
      'conn.ready.hint': 'Connected to the monitor. No runs yet.',
      'conn.offline': 'Offline',
      'conn.offline.hint': 'The monitor is offline. Restart it, then reopen this panel.',

      'welcome.title': 'Nothing to observe yet',
      'welcome.body': 'Start a WorkBuddy subagent with the skill. Its replies, tool activity and file changes will appear here as they happen.',
      'welcome.step1': 'Replies stream in as the agent writes them',
      'welcome.step2': 'Tool calls open to show their arguments and results',
      'welcome.step3': 'File edits are previewed and marked pending until applied',
      'welcome.waiting': 'Waiting for the first run…',
      'welcome.offline': 'The monitor is offline. Restart it, then reopen this panel.',

      'task.sessionId': 'Session ID: {id}',
      'task.profile': 'Profile: {profile}',
      'task.model': 'Model: {model}',
      'task.noModel': 'Model not reported',
      'task.elapsed': 'Elapsed time',
      'task.cwd': 'Working directory: {path}',
      'turn.aria': 'Session turn',
      'turn.option': 'Turn {n} of {total}',
      'turn.resumed': 'resumed',

      'banner.failed': 'This run failed',
      'banner.interrupted': 'This run was interrupted',
      'banner.error': 'The runner reported an error',
      'banner.exitCode': 'Exit code {code}',

      'filter.group': 'Filter activity',
      'filter.all': 'All',
      'filter.text': 'Replies',
      'filter.tool': 'Tools',
      'filter.changes': 'Changes',
      'filter.empty.all': 'Nothing to show yet.',
      'filter.empty.text': 'No replies in this turn yet.',
      'filter.empty.tool': 'No tool calls in this turn yet.',
      'filter.empty.changes': 'No file changes in this turn yet.',
      'follow.label': 'Follow',
      'follow.aria': 'Follow new output',
      'jump': 'Jump to latest',
      'timeline.aria': 'Live activity timeline',

      'card.assistant': 'Assistant',
      'card.writing': 'Writing…',
      'tool.fallbackName': 'Tool',
      'tool.show': 'Show arguments and result',
      'tool.hide': 'Hide arguments and result',
      'tool.args': 'Arguments',
      'tool.result': 'Result',
      'tool.noArgs': 'No arguments',
      'tool.awaitingResult': 'Waiting for the tool to return…',
      'tool.noResult': 'No result was recorded.',
      'toolState.running': 'Running',
      'toolState.started': 'Running',
      'toolState.executing': 'Running',
      'toolState.pending': 'Pending',
      'toolState.queued': 'Queued',
      'toolState.in_progress': 'In progress',
      'toolState.succeeded': 'Done',
      'toolState.failed': 'Failed',
      'toolState.unknown': 'Unknown',

      'change.badge.pending': 'Pending',
      'change.badge.applied': 'Applied',
      'change.badge.failed': 'Not applied',
      'change.title.pending': 'Proposed change',
      'change.desc.pending': 'Not applied yet. Waiting for the tool to finish.',
      'change.title.applied': 'Change applied',
      'change.desc.applied': 'The tool reported success.',
      'change.title.failed': 'Change not applied',
      'change.desc.failed': 'The tool failed. The file may not contain this change.',
      'change.stats': '{add} lines added, {del} lines removed',

      'status.starting': 'Starting',
      'status.running': 'Running',
      'status.completed': 'Completed',
      'status.succeeded': 'Succeeded',
      'status.failed': 'Failed',
      'status.interrupted': 'Interrupted',
      'status.cancelled': 'Cancelled',
      'status.canceled': 'Cancelled',
      'status.stopped': 'Stopped',
      'status.queued': 'Queued',
      'status.pending': 'Pending',
      'status.timeout': 'Timed out',
      'status.timed_out': 'Timed out',
      'status.unknown': 'Unknown',

      'profile.default': 'Default',
      'profile.general': 'General',
      'profile.coder': 'Coder',
      'profile.code': 'Coder',
      'profile.explore': 'Explorer',
      'profile.explorer': 'Explorer',
      'profile.plan': 'Planner',
      'profile.planner': 'Planner',
      'profile.review': 'Reviewer',
      'profile.reviewer': 'Reviewer',
      'profile.research': 'Researcher',
      'profile.researcher': 'Researcher',
      'profile.readonly': 'Read-only',
      'profile.read-only': 'Read-only',
      'profile.read_only': 'Read-only',
      'profile.writer': 'Writer',
      'profile.test': 'Tester',
      'profile.tester': 'Tester',
      'profile.task': 'Task',
      'profile.unknown': 'Task',

      'subtype.success': 'Success',
      'subtype.error_max_turns': 'Stopped at the turn limit',
      'subtype.error_during_execution': 'Error during execution',
      'subtype.error_max_budget_usd': 'Stopped at the budget limit',
      'subtype.unknown': 'Unknown',

      'result.title.completed': 'Run complete',
      'result.title.failed': 'Run failed',
      'result.title.interrupted': 'Run interrupted',
      'result.title.received': 'Result received',
      'result.title.finished': 'Run finished',
      'result.outcome': 'Outcome',
      'result.turns': 'Turns',
      'result.denials': 'Permission denials',
      'result.duration': 'Duration',
      'result.runner': 'Runner status',
      'result.finalResponse': 'Final response',
      'result.errors': 'Reported errors',

      'waiting.loading.title': 'Loading activity…',
      'waiting.loading.body': 'Fetching this turn from the monitor.',
      'waiting.waiting.title': 'Waiting for the first public event',
      'waiting.waiting.body': 'The agent may be starting or thinking.',
      'waiting.ended.title': 'No public output',
      'waiting.ended.body': 'This run ended before any public output was recorded.',

      'activity.live': 'Observing live activity',
      'activity.saved': 'Saved transcript · read only',

      'count.items': { one: '{n} item', other: '{n} items' },
      'count.turns': { one: '{n} turn', other: '{n} turns' },
      'count.sessions': { one: '{n} session', other: '{n} sessions' },

      'duration.s': '{s}s',
      'duration.ms': '{m}m {s}s',
      'duration.hm': '{h}h {m}m',
    },

    zh: {
      'profile.execute': '执行',
      'profile.design': '设计',
      'profile.writing': '写作',
      'profile.brainstorm': '方案讨论',
      'toolState.preparing': '准备中',
      'toolState.incomplete': '未完成',
      'change.badge.incomplete': '未确认',
      'change.title.incomplete': '改动尚未确认',
      'change.desc.incomplete': '未记录到成功的工具结果，继续任务前请检查文件。',
      'activity.phase.thinking': '思考中',
      'activity.phase.writing': '正在输出',
      'activity.phase.tool_input': '正在准备工具调用',
      'activity.phase.tool_result': '正在处理工具结果',
      'activity.phase.waiting': '等待模型输出',
      'activity.lastEvent': '最近活动：{age}前',
      'app.docTitle': 'WorkBuddy · 智能体监控',
      'app.subtitle': '智能体监控',

      'rail.toggle': '显示会话列表',
      'rail.close': '隐藏会话列表',
      'rail.noteTitle': '只读观察',
      'rail.noteBody': '观察不会控制任务。关闭此面板后，任务仍会继续运行。',
      'sessions.heading': '会话',
      'sessions.navLabel': 'WorkBuddy 会话',
      'sessions.empty': '智能体启动后，会话会显示在这里。',

      'settings.open': '显示偏好设置',
      'settings.title': '显示偏好',
      'settings.close': '关闭偏好设置',
      'settings.language': '语言',
      'settings.theme': '主题',
      'settings.hint.languageSystem': '跟随浏览器 · 当前为{value}',
      'settings.hint.languageFixed': '不跟随浏览器语言',
      'settings.hint.themeSystem': '跟随系统 · 当前为{value}',
      'settings.hint.themeFixed': '不跟随系统外观',
      'settings.storage': '设置保存在此浏览器中，仅对当前监控地址生效；其他端口上的监控会单独保存设置。',
      'settings.storageUnavailable': '浏览器存储不可用，这些设置仅对当前页面有效。',
      'option.system': '跟随系统',
      'option.light': '浅色',
      'option.dark': '深色',
      'langName.en': '英语',
      'langName.zh': '简体中文',

      'conn.connecting': '正在连接',
      'conn.connecting.hint': '正在连接监控数据流…',
      'conn.live': '实时',
      'conn.live.hint': '正在实时接收更新。',
      'conn.saved': '已保存',
      'conn.saved.hint': '已有记录已保存，任务是否完成以运行状态为准。',
      'conn.reconnecting': '正在重连…',
      'conn.reconnecting.hint': '数据流已中断，正在尝试重新连接…',
      'conn.ready': '就绪',
      'conn.ready.hint': '已连接到监控服务，暂无任务。',
      'conn.offline': '离线',
      'conn.offline.hint': '监控服务已离线。请重启服务，然后重新打开此面板。',

      'welcome.title': '暂无可观察的内容',
      'welcome.body': '使用技能启动一个 WorkBuddy 子智能体后，它的回复、工具活动和文件改动会实时显示在这里。',
      'welcome.step1': '智能体输出回复时实时呈现',
      'welcome.step2': '展开工具调用即可查看参数与结果',
      'welcome.step3': '文件改动提供预览，应用前标记为待应用',
      'welcome.waiting': '正在等待第一个任务…',
      'welcome.offline': '监控服务已离线。请重启服务，然后重新打开此面板。',

      'task.sessionId': '会话 ID：{id}',
      'task.profile': '配置：{profile}',
      'task.model': '模型：{model}',
      'task.noModel': '未报告模型',
      'task.elapsed': '已用时间',
      'task.cwd': '工作目录：{path}',
      'turn.aria': '会话轮次',
      'turn.option': '第 {n} 轮（共 {total} 轮）',
      'turn.resumed': '续接',

      'banner.failed': '此任务运行失败',
      'banner.interrupted': '此任务已中断',
      'banner.error': '运行器报告了错误',
      'banner.exitCode': '退出码 {code}',

      'filter.group': '筛选活动',
      'filter.all': '全部',
      'filter.text': '回复',
      'filter.tool': '工具',
      'filter.changes': '改动',
      'filter.empty.all': '暂无内容。',
      'filter.empty.text': '本轮暂无回复。',
      'filter.empty.tool': '本轮暂无工具调用。',
      'filter.empty.changes': '本轮暂无文件改动。',
      'follow.label': '跟随',
      'follow.aria': '自动跟随最新输出',
      'jump': '跳到最新',
      'timeline.aria': '实时活动时间线',

      'card.assistant': '助手',
      'card.writing': '正在输出…',
      'tool.fallbackName': '工具',
      'tool.show': '显示参数和结果',
      'tool.hide': '隐藏参数和结果',
      'tool.args': '参数',
      'tool.result': '结果',
      'tool.noArgs': '无参数',
      'tool.awaitingResult': '正在等待工具返回…',
      'tool.noResult': '未记录结果。',
      'toolState.running': '运行中',
      'toolState.started': '运行中',
      'toolState.executing': '运行中',
      'toolState.pending': '等待中',
      'toolState.queued': '排队中',
      'toolState.in_progress': '进行中',
      'toolState.succeeded': '完成',
      'toolState.failed': '失败',
      'toolState.unknown': '未知',

      'change.badge.pending': '待应用',
      'change.badge.applied': '已应用',
      'change.badge.failed': '未应用',
      'change.title.pending': '拟议改动',
      'change.desc.pending': '尚未应用，正在等待工具执行完成。',
      'change.title.applied': '改动已应用',
      'change.desc.applied': '工具报告执行成功。',
      'change.title.failed': '改动未应用',
      'change.desc.failed': '工具执行失败，文件中可能不包含此改动。',
      'change.stats': '新增 {add} 行，删除 {del} 行',

      'status.starting': '启动中',
      'status.running': '运行中',
      'status.completed': '已完成',
      'status.succeeded': '成功',
      'status.failed': '失败',
      'status.interrupted': '已中断',
      'status.cancelled': '已取消',
      'status.canceled': '已取消',
      'status.stopped': '已停止',
      'status.queued': '排队中',
      'status.pending': '等待中',
      'status.timeout': '已超时',
      'status.timed_out': '已超时',
      'status.unknown': '未知',

      'profile.default': '默认',
      'profile.general': '通用',
      'profile.coder': '编码',
      'profile.code': '编码',
      'profile.explore': '探索',
      'profile.explorer': '探索',
      'profile.plan': '规划',
      'profile.planner': '规划',
      'profile.review': '审查',
      'profile.reviewer': '审查',
      'profile.research': '调研',
      'profile.researcher': '调研',
      'profile.readonly': '只读',
      'profile.read-only': '只读',
      'profile.read_only': '只读',
      'profile.writer': '写作',
      'profile.test': '测试',
      'profile.tester': '测试',
      'profile.task': '任务',
      'profile.unknown': '任务',

      'subtype.success': '成功',
      'subtype.error_max_turns': '已达轮数上限',
      'subtype.error_during_execution': '执行期间出错',
      'subtype.error_max_budget_usd': '已达预算上限',
      'subtype.unknown': '未知',

      'result.title.completed': '运行完成',
      'result.title.failed': '运行失败',
      'result.title.interrupted': '运行已中断',
      'result.title.received': '已收到结果',
      'result.title.finished': '运行结束',
      'result.outcome': '执行结果',
      'result.turns': '轮数',
      'result.denials': '权限拒绝',
      'result.duration': '用时',
      'result.runner': '运行器状态',
      'result.finalResponse': '最终回复',
      'result.errors': '报告的错误',

      'waiting.loading.title': '正在加载活动…',
      'waiting.loading.body': '正在从监控服务获取本轮内容。',
      'waiting.waiting.title': '正在等待第一条公开事件',
      'waiting.waiting.body': '智能体可能正在启动或思考。',
      'waiting.ended.title': '没有公开输出',
      'waiting.ended.body': '此任务在记录任何公开输出之前就已结束。',

      'activity.live': '正在观察实时活动',
      'activity.saved': '已保存的记录 · 只读',

      'count.items': { other: '{n} 项' },
      'count.turns': { other: '{n} 轮' },
      'count.sessions': { other: '{n} 个会话' },

      'duration.s': '{s} 秒',
      'duration.ms': '{m} 分 {s} 秒',
      'duration.hm': '{h} 小时 {m} 分',
    },
  };

  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function normalizeChoice(value, allowed) {
    return typeof value === 'string' && allowed.includes(value) ? value : 'system';
  }
  const normalizeLanguageChoice = value => normalizeChoice(value, LANGUAGE_CHOICES);
  const normalizeThemeChoice = value => normalizeChoice(value, THEME_CHOICES);

  /** Map a BCP 47 tag ("zh-CN", "en_US", "ZH-Hant") to a supported language by its primary subtag. */
  function matchLanguageTag(tag) {
    if (typeof tag !== 'string') return null;
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_LANGUAGES.includes(primary) ? primary : null;
  }

  /**
   * Resolve the system language from a navigator-like object
   * ({ languages, language }), an array of tags, or a single tag.
   * The first supported tag wins; otherwise English.
   */
  function detectSystemLanguage(source) {
    let tags = [];
    if (Array.isArray(source)) tags = source.slice();
    else if (typeof source === 'string') tags = [source];
    else if (source && typeof source === 'object') {
      try {
        if (source.languages && typeof source.languages.length === 'number') tags = Array.from(source.languages);
        if (source.language) tags.push(source.language);
      } catch (_) { tags = []; }
    }
    for (const tag of tags) {
      const match = matchLanguageTag(tag);
      if (match) return match;
    }
    return DEFAULT_LANGUAGE;
  }

  function resolveLanguage(choice, navigatorLike) {
    const normalized = normalizeLanguageChoice(choice);
    return normalized === 'system' ? detectSystemLanguage(navigatorLike) : normalized;
  }

  function resolveTheme(choice, systemPrefersDark) {
    const normalized = normalizeThemeChoice(choice);
    if (normalized !== 'system') return normalized;
    return systemPrefersDark ? 'dark' : 'light';
  }

  function htmlLang(language) {
    return language === 'zh' ? 'zh-CN' : 'en';
  }

  /** Return window.localStorage, or null when it is missing or access throws. */
  function getStorage(win) {
    try {
      const storage = win && win.localStorage;
      return storage && typeof storage.getItem === 'function' ? storage : null;
    } catch (_) {
      return null;
    }
  }

  function isStorageWritable(storage) {
    if (!storage) return false;
    try {
      storage.setItem(PROBE_KEY, '1');
      storage.removeItem(PROBE_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Read a stored choice; anything invalid or unreadable falls back to 'system'. */
  function readChoice(storage, key, allowed) {
    if (!storage) return 'system';
    try {
      return normalizeChoice(storage.getItem(key), allowed);
    } catch (_) {
      return 'system';
    }
  }

  /** Persist a choice. Returns false when storage is unavailable or rejects the write. */
  function writeChoice(storage, key, value, allowed) {
    if (!storage) return false;
    try {
      storage.setItem(key, normalizeChoice(value, allowed));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadPreferences(storage) {
    return {
      language: readChoice(storage, LANGUAGE_KEY, LANGUAGE_CHOICES),
      theme: readChoice(storage, THEME_KEY, THEME_CHOICES),
    };
  }

  function systemPrefersDark(win) {
    try {
      return !!(win && win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (_) {
      return false;
    }
  }

  function interpolate(template, params) {
    return String(template).replace(/\{(\w+)\}/g, (match, name) =>
      params && params[name] !== undefined && params[name] !== null ? String(params[name]) : match);
  }

  function lookup(language, key) {
    const table = has(MESSAGES, language) ? MESSAGES[language] : MESSAGES[DEFAULT_LANGUAGE];
    if (has(table, key)) return table[key];
    if (has(MESSAGES[DEFAULT_LANGUAGE], key)) return MESSAGES[DEFAULT_LANGUAGE][key];
    return undefined;
  }

  function translate(language, key, params) {
    let message = lookup(language, key);
    if (message === undefined) return key;
    if (typeof message === 'object') message = message.other;
    return interpolate(message, params);
  }

  function plural(language, key, count) {
    const n = Number(count) || 0;
    const message = lookup(language, key);
    if (message === undefined) return String(n);
    if (typeof message === 'string') return interpolate(message, { n });
    const form = language === 'en' && n === 1 && message.one ? message.one : message.other;
    return interpolate(form, { n });
  }

  /** Readable fallback for unknown server enum values: "error_max_turns" -> "Error max turns". */
  function humanize(code) {
    const text = String(code).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  /** Localized label for a server enum (group: status, profile, toolState, subtype). */
  function labelFor(language, group, code) {
    if (code === undefined || code === null || code === '') return translate(language, `${group}.unknown`);
    const key = `${group}.${String(code).toLowerCase()}`;
    if (lookup(language, key) !== undefined) return translate(language, key);
    return humanize(code) || translate(language, `${group}.unknown`);
  }

  function formatDuration(totalSeconds, language) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return translate(language, 'duration.hm', { h, m });
    if (m) return translate(language, 'duration.ms', { m, s });
    return translate(language, 'duration.s', { s });
  }

  /**
   * Apply stored/system preferences to <html> as early as possible.
   * Sets data-theme, data-theme-choice, data-language and lang. When the
   * language is not English, data-i18n-pending hides static English chrome
   * until app.js translates it (style.css reveals it after a timeout anyway).
   */
  function applyEarly(win, doc) {
    try {
      const prefs = loadPreferences(getStorage(win));
      const language = resolveLanguage(prefs.language, win.navigator);
      const theme = resolveTheme(prefs.theme, systemPrefersDark(win));
      const root = doc.documentElement;
      root.setAttribute('data-theme', theme);
      root.setAttribute('data-theme-choice', prefs.theme);
      root.setAttribute('data-language', language);
      root.setAttribute('lang', htmlLang(language));
      if (language !== DEFAULT_LANGUAGE) root.setAttribute('data-i18n-pending', '');
      return { language, theme, prefs };
    } catch (_) {
      return null;
    }
  }

  return Object.freeze({
    LANGUAGE_KEY,
    THEME_KEY,
    LANGUAGE_CHOICES,
    THEME_CHOICES,
    SUPPORTED_LANGUAGES,
    MESSAGES,
    normalizeChoice,
    normalizeLanguageChoice,
    normalizeThemeChoice,
    matchLanguageTag,
    detectSystemLanguage,
    resolveLanguage,
    resolveTheme,
    htmlLang,
    getStorage,
    isStorageWritable,
    readChoice,
    writeChoice,
    loadPreferences,
    systemPrefersDark,
    translate,
    plural,
    humanize,
    labelFor,
    formatDuration,
    applyEarly,
  });
});
