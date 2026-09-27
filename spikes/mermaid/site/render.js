// Render every diagram with the variant's config; record CSP violations and SVGs.
window.__csp = [];
document.addEventListener('securitypolicyviolation', (e) => {
  window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: (e.sample || '').slice(0, 60) });
});
(async () => {
  const variant = document.documentElement.dataset.variant;
  const base = { startOnLoad: false, securityLevel: 'strict', theme: 'default' };
  const extra = variant === 'nohtml' ? { htmlLabels: false, flowchart: { htmlLabels: false } } : {};
  window.mermaid.initialize({ ...base, ...extra });
  window.__svgs = {};
  window.__times = {};
  for (const [name, text] of Object.entries(window.DIAGRAMS)) {
    const t0 = performance.now();
    try {
      const { svg } = await window.mermaid.render(`m-${name}`, text);
      window.__svgs[name] = svg;
      const host = document.getElementById(`host-${name}`);
      if (variant === 'cssom') {
        // Parse in a detached document (no CSP), drop <style>, move style
        // attributes to CSSOM after import, then insert.
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        doc.querySelectorAll('style').forEach((el) => el.remove());
        const styled = [...doc.querySelectorAll('[style]')].map((el) => [el, el.getAttribute('style')]);
        styled.forEach(([el]) => el.removeAttribute('style'));
        const node = document.importNode(doc.documentElement, true);
        const imported = [...node.querySelectorAll('*')];
        const originals = [...doc.documentElement.querySelectorAll('*')];
        const rootStyle = styled.find(([el]) => el === doc.documentElement);
        styled.forEach(([el, css]) => {
          const target = el === doc.documentElement ? node : imported[originals.indexOf(el)];
          if (target) target.style.cssText = css;
        });
        if (rootStyle) node.style.cssText = rootStyle[1];
        host.replaceChildren(node);
      } else {
        host.innerHTML = svg;
      }
    } catch (e) {
      window.__svgs[name] = `ERROR ${e}`;
    }
    window.__times[name] = Math.round(performance.now() - t0);
  }
  window.__done = true;
})();
