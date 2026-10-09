const test = require('node:test');
const assert = require('node:assert/strict');
const prefs = require(process.env.WORKBUDDY_TEST_PREFERENCES || '../skills/workbuddy-subagent/assets/monitor/preferences.js');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key)};
}

test('system language respects the first supported browser preference', () => {
  for (const [languages,expected] of [[['zh-CN','en-US'],'zh'],[['en-GB','zh-TW'],'en'],[['fr-FR','zh-Hans'],'zh'],[['ja-JP'],'en'],[[],'en']]) {
    assert.equal(prefs.resolveLanguage('system',{languages}),expected);
  }
  assert.equal(prefs.resolveLanguage('system',{language:'zh-TW'}),'zh');
});

test('manual language and theme override system preferences', () => {
  assert.equal(prefs.resolveLanguage('en',{languages:['zh-CN']}),'en');
  assert.equal(prefs.resolveLanguage('zh',{languages:['en-US']}),'zh');
  assert.equal(prefs.resolveTheme('light',true),'light');
  assert.equal(prefs.resolveTheme('dark',false),'dark');
  assert.equal(prefs.resolveTheme('system',true),'dark');
  assert.equal(prefs.resolveTheme('system',false),'light');
});

test('invalid or missing persisted preferences safely follow the system', () => {
  for (const value of [null,'','invalid','auto',{},42]) {
    const store=storage({[prefs.LANGUAGE_KEY]:value,[prefs.THEME_KEY]:value});
    assert.deepEqual(prefs.loadPreferences(store),{language:'system',theme:'system'});
  }
});

test('unavailable browser storage does not prevent rendering', () => {
  const win={get localStorage(){throw new Error('Disabled');}};
  assert.equal(prefs.getStorage(win),null);
  const broken={getItem(){throw new Error('Disabled');},setItem(){throw new Error('Disabled');}};
  assert.deepEqual(prefs.loadPreferences(broken),{language:'system',theme:'system'});
  assert.equal(prefs.writeChoice(broken,prefs.THEME_KEY,'dark',prefs.THEME_CHOICES),false);
});

test('manual preferences round-trip through browser storage', () => {
  const store=storage();
  assert.equal(prefs.writeChoice(store,prefs.LANGUAGE_KEY,'zh',prefs.LANGUAGE_CHOICES),true);
  assert.equal(prefs.writeChoice(store,prefs.THEME_KEY,'light',prefs.THEME_CHOICES),true);
  assert.deepEqual(prefs.loadPreferences(store),{language:'zh',theme:'light'});
});

test('early bootstrap applies language and theme before the UI paints', () => {
  const attrs={};const doc={documentElement:{setAttribute:(key,value)=>{attrs[key]=value;}}};
  const win={localStorage:storage(),navigator:{languages:['zh-CN']},matchMedia:()=>({matches:true})};
  prefs.applyEarly(win,doc);
  assert.equal(attrs.lang,'zh-CN');assert.equal(attrs['data-theme'],'dark');assert.equal(attrs['data-theme-choice'],'system');
  win.localStorage=storage({[prefs.LANGUAGE_KEY]:'en',[prefs.THEME_KEY]:'light'});
  prefs.applyEarly(win,doc);
  assert.equal(attrs.lang,'en');assert.equal(attrs['data-theme'],'light');
});

test('English and Chinese translations cover the same UI concepts', () => {
  assert.deepEqual(Object.keys(prefs.MESSAGES.en).sort(),Object.keys(prefs.MESSAGES.zh).sort());
  for (const key of Object.keys(prefs.MESSAGES.en)) {
    assert.notEqual(prefs.translate('zh',key),key);
  }
});

test('all actual runner profiles and tool states have Chinese labels', () => {
  for (const [group,codes] of Object.entries({profile:['review','execute','design','writing','brainstorm'],toolState:['preparing','running','succeeded','failed','incomplete'],status:['starting','running','completed','failed','interrupted']})) {
    for (const code of codes) assert.match(prefs.labelFor('zh',group,code),/[\u3400-\u9fff]/,`${group}.${code}`);
  }
});

test('counts and elapsed durations localize without changing user text', () => {
  assert.equal(prefs.plural('en','count.turns',1),'1 turn');
  assert.equal(prefs.plural('en','count.turns',2),'2 turns');
  assert.match(prefs.plural('zh','count.turns',2),/2/);
  assert.notEqual(prefs.formatDuration(65,'zh'),prefs.formatDuration(65,'en'));
});
