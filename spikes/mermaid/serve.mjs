// Tiny static server. The first path segment selects the CSP variant.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const STRICT = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'none'; connect-src 'none'";
const CSP = {
  strict: STRICT,
  nohtml: STRICT,
  external: STRICT,
  cssom: STRICT,
  inline: STRICT.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"),
};
const page = (variant) => `<!doctype html><html lang="en" data-variant="${variant}"><head><meta charset="utf-8"><title>${variant}</title>${variant === 'external' || variant === 'cssom' ? `<link rel="stylesheet" href="/${variant}/mermaid-generated.css">` : ''}</head><body>
${['flowchart', 'sequence', 'state', 'er', 'class'].map((n) => `<h2>${n}</h2><div id="host-${n}"></div>`).join('\n')}
<script src="/${variant}/mermaid.min.js"></script><script src="/${variant}/diagrams.js"></script><script src="/${variant}/render.js"></script></body></html>`;
const port = Number(process.argv[2] ?? 4600);
createServer((req, res) => {
  const [, first, ...rest] = req.url.split('?')[0].split('/');
  const variant = CSP[first] ? first : undefined;
  const file = variant ? rest.join('/') : [first, ...rest].join('/');
  const csp = CSP[variant ?? 'strict'];
  if (variant && file === '') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp });
    return res.end(page(variant));
  }
  try {
    const body = readFileSync(new URL(`./site/${file}`, import.meta.url));
    res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/plain', 'content-security-policy': csp });
    res.end(body);
  } catch {
    res.writeHead(404); res.end();
  }
}).listen(port, '127.0.0.1');
