// `npm run test:offline` (R08, §17.7 4b, §18.8): the toolkit builds and serves
// a document with no network. The script re-runs itself inside a new user and
// network namespace (`unshare -rn`), where only loopback exists.
//
// It first proves isolation: a public TCP connection and a DNS lookup must
// both fail. If isolation cannot be proved (no unshare, or the network is
// reachable), it prints "not run" and exits 3; it never passes without proof.
// Then, from dist/release, it runs init, ids assign, check, build, export
// (Markdown, and the site format when that command exists), and serve, and
// fetches the page and its assets over loopback.
//
// Exit codes follow §15.6: 0 success, 1 a step failed, 3 not run.
// The result is also written to reports/offline.json.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { connect } from 'node:net';
import { lookup } from 'node:dns/promises';
import { get } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'dist', 'release', 'bin', 'visser.cjs');
const reportPath = join(root, 'reports', 'offline.json');
const INNER = '--inside-namespace';

function report(result) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify({ schema: 'visser-offline-report/1', ...result }, null, 2) + '\n');
}

function notRun(reason) {
  console.error(`not run: ${reason}`);
  report({ status: 'not-run', reason });
  process.exit(3);
}

// ---------------------------------------------------------------- outer
if (!process.argv.includes(INNER)) {
  if (!existsSync(cli)) notRun('dist/release is missing; run npm run build first');
  const probe = spawnSync('unshare', ['-rn', 'true'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    const why = probe.error?.code ?? (probe.stderr.trim() || `exit ${probe.status}`);
    notRun(`unshare -rn is not available (${why})`);
  }
  // Bring loopback up inside the namespace, then run the checks there.
  const inner = spawnSync('unshare', ['-rn', 'sh', '-c', 'ip link set lo up 2>/dev/null; exec "$0" "$@"', process.execPath, fileURLToPath(import.meta.url), INNER], { stdio: 'inherit' });
  process.exit(inner.status ?? 1);
}

// ---------------------------------------------------------------- inner
function tcpFails(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (failed, detail) => { socket.destroy(); resolve({ failed, detail }); };
    socket.setTimeout(5000, () => done(true, 'timeout'));
    socket.once('connect', () => done(false, 'connected'));
    socket.once('error', (e) => done(true, e.code));
  });
}

async function dnsFails(name) {
  try {
    const answer = await lookup(name);
    return { failed: false, detail: answer.address };
  } catch (e) {
    return { failed: true, detail: e.code };
  }
}

const isolation = {
  'tcp 1.1.1.1:443': await tcpFails('1.1.1.1', 443),
  'tcp 8.8.8.8:53': await tcpFails('8.8.8.8', 53),
  'dns example.com': await dnsFails('example.com'),
};
// Test seam: one more HOST:PORT that must also fail. The test points it at a
// listening local server to prove that a reachable address gives "not run".
const extra = process.env['VISSER_OFFLINE_EXTRA_PROBE'];
if (extra) {
  const [host, port] = [extra.slice(0, extra.lastIndexOf(':')), Number(extra.slice(extra.lastIndexOf(':') + 1))];
  isolation[`tcp ${extra}`] = await tcpFails(host, port);
}
for (const [probe, r] of Object.entries(isolation)) {
  console.log(`isolation: ${probe} -> ${r.detail}`);
  if (!r.failed) notRun(`the network is reachable inside the namespace (${probe} ${r.detail})`);
}

const steps = [];
function fail(step, detail) {
  steps.push({ step, ok: false, detail });
  console.error(`FAIL ${step}: ${detail}`);
  report({ status: 'failed', isolation, steps });
  process.exit(1);
}
function pass(step, detail = '') {
  steps.push({ step, ok: true, ...(detail ? { detail } : {}) });
  console.log(`ok   ${step}${detail ? `: ${detail}` : ''}`);
}

const home = mkdtempSync(join(tmpdir(), 'visser-offline-home-'));
const repo = mkdtempSync(join(tmpdir(), 'visser-offline-repo-'));
mkdirSync(join(repo, '.git'));
const env = { ...process.env, VISSER_HOME: home };
function visser(step, ...args) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env, cwd: repo });
  if (r.status !== 0) fail(step, `exit ${r.status}\n${r.stdout}${r.stderr}`);
  pass(step);
  return r;
}

const bundle = join(repo, 'docs', 'offline');
const doc = join(bundle, 'index.md');
visser('init', 'init', bundle, '--kind', 'teaching', '--title', 'Offline check');
// A Mermaid figure makes the page need mermaid.js too.
appendFileSync(doc, [
  '',
  'The producer waits at the queue.',
  '',
  '{% mermaid id="flow" title="Where the producer waits" question="Where does the producer wait?" %}',
  '```mermaid',
  'flowchart LR',
  '  Producer --> Queue --> Worker',
  '```',
  '{% /mermaid %}',
  '',
].join('\n'));
visser('ids assign', 'ids', 'assign', doc);
visser('check', 'check', doc);
visser('build', 'build', doc);
const markdown = join(repo, 'offline.md');
visser('export markdown', 'export', doc, '--format', 'markdown', '--out', markdown);
if (!readFileSync(markdown, 'utf8').includes('Where the producer waits')) fail('export markdown', 'the projection lacks the figure');

// The site export is Phase 4b work in progress; run it only when it exists.
const site = join(repo, 'site');
const siteRun = spawnSync(process.execPath, [cli, 'export', doc, '--format', 'site', '--out', site], { encoding: 'utf8', env, cwd: repo });
if (siteRun.status === 3 && /E_UNSUPPORTED/.test(siteRun.stdout + siteRun.stderr)) {
  steps.push({ step: 'export site', ok: true, skipped: 'export --format site is not implemented in this build' });
  console.log('skip export site: not implemented in this build');
} else if (siteRun.status !== 0) {
  fail('export site', `exit ${siteRun.status}\n${siteRun.stdout}${siteRun.stderr}`);
} else {
  pass('export site');
}

// Serve on an automatically assigned loopback port and read over HTTP.
function fetch(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

const server = spawn(process.execPath, [cli, 'serve', doc, '--port', '0'], { env, cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });
const pageUrl = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(undefined), 60_000);
  const check = () => {
    const m = /serving (http:\/\/127\.0\.0\.1:\d+\/\S*)/.exec(serverOut);
    if (m) { clearTimeout(timer); resolve(m[1]); }
  };
  server.stdout.on('data', check);
  server.once('exit', () => { clearTimeout(timer); resolve(undefined); });
});
try {
  if (!pageUrl) fail('serve', `no URL printed\n${serverOut}`);
  pass('serve', pageUrl);
  const page = await fetch(pageUrl);
  const html = page.body.toString('utf8');
  if (page.status !== 200 || !html.includes('Offline check')) fail('read page', `status ${page.status}`);
  pass('read page');
  const assets = [...html.matchAll(/(?:src|href)="([^"]*\/(?:reader\.js|reader\.css))"/g)].map((m) => m[1]);
  const urls = {};
  for (const name of ['reader.js', 'reader.css']) {
    const rel = assets.find((a) => a.endsWith(`/${name}`));
    if (!rel) fail(`read ${name}`, 'the page does not reference it');
    urls[name] = new URL(rel, pageUrl).href;
  }
  // The runtime loads mermaid.js from the directory of reader.js, with the SRI
  // digest from <meta name="vs-mermaid"> (§9.12). Check the same bytes.
  const integrity = /<meta name="vs-mermaid" content="(sha384-[^"]+)"/.exec(html)?.[1];
  if (!integrity) fail('read mermaid.js', 'the page has no vs-mermaid integrity meta element');
  urls['mermaid.js'] = new URL('mermaid.js', urls['reader.js']).href;
  for (const [name, url] of Object.entries(urls)) {
    const asset = await fetch(url);
    if (asset.status !== 200 || asset.body.length === 0) fail(`read ${name}`, `status ${asset.status}, ${asset.body.length} bytes`);
    if (name === 'mermaid.js' && `sha384-${createHash('sha384').update(asset.body).digest('base64')}` !== integrity) {
      fail('read mermaid.js', 'the served bytes do not match the page integrity digest');
    }
    pass(`read ${name}`, `${asset.body.length} bytes`);
  }
} finally {
  server.kill('SIGTERM');
}

report({ status: 'passed', isolation, steps });
console.log('offline: passed');
