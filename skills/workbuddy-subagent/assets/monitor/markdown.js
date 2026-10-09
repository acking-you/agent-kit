'use strict';

// Replies are untrusted: parse Markdown, then build only a sanitized DOM fragment.
// Raw HTML stays visible as text; images become links rather than network requests.
window.WorkBuddyMarkdown = (() => {
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parser = new marked.Marked({gfm:true, breaks:false, renderer:{
    html({text}) { return escape(text); },
    image({href, text}) { return `<a href="${escape(href)}">${escape(text || href)}</a>`; },
  }});
  const rendered = new WeakMap();
  const options = {
    RETURN_DOM_FRAGMENT:true,
    ALLOWED_TAGS:['p','br','em','strong','del','blockquote','ul','ol','li','pre','code','h1','h2','h3','h4','h5','h6','hr','table','thead','tbody','tr','th','td','a','input'],
    ALLOWED_ATTR:['href','title','class','start','align','type','checked','disabled'],
    ALLOW_DATA_ATTR:false, ALLOW_ARIA_ATTR:false,
  };
  function render(node, value) {
    const text = String(value || '');
    if (rendered.get(node) === text) return;
    // Keep horizontal code/table positions while new tokens arrive.
    const positions = [...node.querySelectorAll('pre,table')].map(el => [el.scrollLeft, el.scrollTop]);
    try {
      const fragment = DOMPurify.sanitize(parser.parse(text), options);
      for (const link of fragment.querySelectorAll('a')) {
        const href = (link.getAttribute('href') || '').trim();
        if (!/^(https?:|mailto:)/i.test(href)) link.removeAttribute('href');
        else { link.setAttribute('target','_blank'); link.setAttribute('rel','noopener noreferrer'); }
      }
      for (const input of fragment.querySelectorAll('input')) { input.type='checkbox'; input.disabled=true; }
      node.replaceChildren(fragment);
      [...node.querySelectorAll('pre,table')].forEach((el,i) => {
        if (positions[i]) [el.scrollLeft,el.scrollTop]=positions[i];
      });
    } catch (_) {
      node.textContent = text;
    }
    rendered.set(node,text);
  }
  return Object.freeze({render});
})();
