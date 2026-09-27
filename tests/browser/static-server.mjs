// A generic static file server that behaves like GitHub Pages for a project
// site (§13.5): files from one directory under a URL prefix, a directory URL
// ending in `/` serves its index.html, and everything else is 404. It sends no
// CSP or other security headers, has no rewrite rules, and no SPA fallback, so
// the exported pages must work with their meta CSP and relative URLs alone.
//
// usage: node tests/browser/static-server.mjs --dir DIR --prefix /explain-demo/ --port 4340
import { createServer } from 'node:http';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0 || args[i + 1] === undefined) throw new Error(`--${name} is required`);
  return args[i + 1];
};
const root = realpathSync(resolve(arg('dir')));
const prefix = arg('prefix');
const port = Number(arg('port'));
if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw new Error('--prefix must start and end with /');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function fileFor(urlPath) {
  if (!urlPath.startsWith(prefix)) return undefined;
  let rel;
  try {
    rel = decodeURIComponent(urlPath.slice(prefix.length));
  } catch {
    return undefined;
  }
  if (rel.includes('\0')) return undefined;
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const candidate = resolve(root, rel);
  if (candidate !== root && !candidate.startsWith(root + sep)) return undefined;
  try {
    const real = realpathSync(candidate);
    if (!real.startsWith(root + sep)) return undefined;
    if (!statSync(real).isFile()) return undefined;
    return real;
  } catch {
    return undefined;
  }
}

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const file = req.method === 'GET' || req.method === 'HEAD' ? fileFor(path) : undefined;
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
    return;
  }
  const body = readFileSync(file);
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`static site ${root} at http://127.0.0.1:${port}${prefix}\n`);
});

