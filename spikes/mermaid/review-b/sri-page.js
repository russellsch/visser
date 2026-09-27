window.loadWith = (integrity) => new Promise((res) => {
  const s = document.createElement('script');
  s.src = '/lazy-mermaid.js'; s.integrity = integrity;
  s.onload = () => res('loaded:' + typeof window.__lazyMark);
  s.onerror = () => res('blocked');
  document.head.append(s);
});
window.__ready2 = true;
