'use strict';
(() => {
  const host = document.getElementById('native-controls');
  let run = null, busy = false, message = '';
  const words = {
    en: {copy:'Claude continued in a new session UUID; the source is recorded. Verify retained context.',stop:'Stop task',resume:'Resume with instruction',prompt:'Next instruction',attach:'Open native session in a terminal:',stopping:'Stopping…',resuming:'Resuming…',blocked:'Needs input. Attach to answer native permission dialogs.',note:'Replies appear as Claude saves message blocks; this is not a token stream.'},
    zh: {copy:'Claude 已续接到新的会话 UUID，原会话已记录。请核对保留的上下文。',stop:'停止任务',resume:'发送指令并恢复',prompt:'下一步指令',attach:'在终端中打开原生会话：',stopping:'正在停止…',resuming:'正在恢复…',blocked:'等待输入。原生权限对话框需要连接终端处理。',note:'回复随 Claude 保存消息块更新，并非逐字输出。'}
  };
  const stop = document.createElement('button'); stop.type='button';stop.id='native-stop';
  const prompt = document.createElement('textarea');prompt.id='native-prompt';
  const resume = document.createElement('button');resume.type='button';resume.id='native-resume';
  const detail = document.createElement('pre');detail.id='native-detail';detail.setAttribute('role','status');
  host.append(stop,prompt,resume,detail);
  function render() {
    const w=words[document.documentElement.lang.startsWith('zh')?'zh':'en'];
    host.setAttribute('aria-label',w.stop+' / '+w.resume);
    stop.textContent=w.stop;resume.textContent=w.resume;prompt.placeholder=w.prompt;prompt.setAttribute('aria-label',w.prompt);
    stop.disabled=busy||!run||!['running','starting','blocked','unknown'].includes(run.status);
    resume.disabled=busy||!run||!['completed','stopped','failed'].includes(run.status)||!prompt.value.trim();
    detail.textContent=message||(run?.resume_note ? w.copy+'\n' : '')+(run?.waiting_for ? w.blocked+'\n' : '')+w.note+(run?.job_id ? '\n'+w.attach+'\nclaude attach '+run.job_id : '');
  }
  async function control(action) {
    if(busy||!run)return;
    const id=run.id;const w=words[document.documentElement.lang.startsWith('zh')?'zh':'en'];
    busy=true;message=action==='stop'?w.stopping:w.resuming;render();
    try {
      const response=await fetch(location.pathname+'control/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,prompt:prompt.value})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');
      if(run?.id===id){
        message='';if(action==='resume'){prompt.value='';location.hash=data.run.id;}
        else run=data.run;
      }
    } catch(e){if(run?.id===id)message=e.message;}
    finally{busy=false;render();}
  }
  stop.addEventListener('click',()=>control('stop'));resume.addEventListener('click',()=>control('resume'));
  prompt.addEventListener('input',render);
  window.addEventListener('native-run',e=>{if(run?.id!==e.detail?.id)message='';run=e.detail;render();});
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  render();
})();
