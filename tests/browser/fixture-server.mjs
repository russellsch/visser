// Serves the DOM-contract fixture with a freshly bundled runtime, until the
// real `explain serve` output is used (see tests/browser/support.ts).
// Usage: node tests/browser/fixture-server.mjs --port 4312
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const portFlag = process.argv.indexOf('--port');
const port = portFlag === -1 ? 4312 : Number(process.argv[portFlag + 1]);

const bundle = await build({
  entryPoints: [join(root, 'packages/runtime/src/reader.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
});
const files = new Map([
  ['/contract.html', { type: 'text/html; charset=utf-8', body: readFileSync(join(here, 'fixtures/contract.html')) }],
  ['/assets/reader.js', { type: 'text/javascript; charset=utf-8', body: Buffer.from(bundle.outputFiles[0].contents) }],
  ['/assets/reader.css', { type: 'text/css; charset=utf-8', body: readFileSync(join(root, 'packages/runtime/src/reader.css')) }],
]);
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'";

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  if (path === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP });
    res.end('<!doctype html><title>Fixture index</title><a href="contract.html">snapshot</a>');
    return;
  }
  const file = files.get(path);
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'content-type': file.type,
    'content-security-policy': CSP,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : file.body);
}).listen(port, '127.0.0.1', () => {
  console.log(`fixture server on http://127.0.0.1:${port}/contract.html`);
});
