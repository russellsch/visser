window.__csp = [];
document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '')));
window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
window.runCase = async (text) => {
  const host = document.getElementById('host');
  host.innerHTML = '';
  let err = null, svg = '';
  try { ({ svg } = await window.mermaid.render('c' + Math.random().toString(36).slice(2, 7), text)); host.innerHTML = svg; }
  catch (e) { err = String(e).slice(0, 160); }
  await new Promise((r) => setTimeout(r, 50));
  const cav = getComputedStyle(document.getElementById('caveat'));
  const body = getComputedStyle(document.body);
  const tb = getComputedStyle(document.getElementById('toolbar'));
  const styles = [...host.querySelectorAll('style')].map((s) => s.textContent);
  return {
    err,
    caveat: { display: cav.display, visibility: cav.visibility, color: cav.color, opacity: cav.opacity, fontSize: cav.fontSize },
    body: { display: body.display, background: body.backgroundColor },
    toolbar: { display: tb.display },
    injectedInStyle: styles.some((s) => /caveat|body\s*\{|\*\s*\{|toolbar|html\s*\{/i.test(s)),
    styleSnippet: (styles.join('\n').match(/.{0,60}(caveat|body\s*\{|\*\s*\{|toolbar|display:none|position:\s*fixed).{0,60}/i) || [''])[0],
    fixedEls: [...host.querySelectorAll('*')].filter((el) => getComputedStyle(el).position === 'fixed').length,
    svgAttrStyleSample: (svg.match(/style="[^"]*(fixed|display|content)[^"]*"/i) || [''])[0].slice(0, 120),
    csp: [...window.__csp],
  };
};
window.__ready = true;
