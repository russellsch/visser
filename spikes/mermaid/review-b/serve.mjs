// Page with the §9.12 Mermaid-page CSP, a caveat outside the diagram, and a host.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<p id="caveat">CAVEAT: this design loses data on crash.</p>
<nav id="toolbar"><button>Real toolbar</button></nav>
<div id="host"></div>
<script src="/mermaid.min.js"></script><script src="/attack.js"></script></body></html>`;
createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': CSP }); return res.end(page); }
  try {
    const f = p === '/mermaid.min.js' ? '../site/mermaid.min.js' : '.' + p;
    const body = readFileSync(new URL(f, import.meta.url));
    res.writeHead(200, { 'content-type': 'text/javascript', 'content-security-policy': CSP }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(Number(process.argv[2] ?? 4700), '127.0.0.1');
