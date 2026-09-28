// `npm run test:budgets` (§2.3, §17.8, §18.8): build the reference fixture from
// dist/release and check the size, count, and limit budgets. These are gates:
// any failure exits 1. Timing (build time, initial usable page, interaction
// latency) is reported only, never a gate, and runs only with
// VISSER_BUDGET_TIMING=1 because it takes a few minutes of Chromium time.
//
// Gates:
// - Shared browser JavaScript: browser/reader.js at most 100 KiB gzip.
// - Shared CSS: browser/reader.css at most 50 KiB gzip.
// - Per-document JavaScript: none. A built page has no inline script, no
//   event-handler attribute, no javascript: URL, and its only <script src> is
//   the shared reader.js of the toolkit pack. mermaid.js is not a page script:
//   reader.js loads it from the same pack, with SRI, on Mermaid pages only.
// - First-release browser asset files: the files under browser/ in
//   release.json are exactly reader.js and reader.css, plus mermaid.js as the
//   §2.3 exception. bin/, workers/, schemas/, skills/, and LICENSES.txt are
//   CLI and authoring files; `build`, `serve`, and `export` never serve them.
//   The pack that a build writes holds only those browser files.
// - Core skill size: skills/visser-visual-explain/SKILL.md in the release under 2,500 words.
// - Graph limits: a 201-node graph and a 401-edge graph fail both `check` and
//   `build` with E_LAYOUT_LIMIT (exit 2). The 26-node warning is covered by
//   tests/unit/validate.fixtures.test.ts; the other §2.3 build safety limits
//   (E_LIMIT, E_LAYOUT_TIMEOUT) by tests/unit/syntax.characterization.test.ts,
//   compiler.layout.test.ts, compiler.render.test.ts, mermaid.model.test.ts,
//   and tests/integration/capture.hostile.test.ts.
// - The reference fixture itself: `check` passes, 8 visuals of 8 families, at
//   most 40 nodes and 80 edges in any one, 20 excerpts, and about 5,000 words.
//
// The Mermaid asset size is measured and reported, not gated.
//
// Test seam: VISSER_BUDGET_LIMITS='{"readerJsGzip":1000}' lowers a limit, so
// a test can prove that a gate fails. Results go to reports/budgets.json, or
// to VISSER_BUDGET_REPORT (the tests use a temporary file).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus, platform, release as osRelease, tmpdir, totalmem } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { EXCERPT_COUNT, generateFixture } from '../tests/fixtures/budget/generate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(root, 'dist', 'release');
const cli = join(release, 'bin', 'visser.cjs');
const reportPath = process.env.VISSER_BUDGET_REPORT ?? join(root, 'reports', 'budgets.json');
const timing = process.env.VISSER_BUDGET_TIMING === '1';
const RUNS = 5;

const LIMITS = {
  readerJsGzip: 100 * 1024,
  readerCssGzip: 50 * 1024,
  skillWords: 2500,
  fixtureMaxNodes: 40,
  fixtureMaxEdges: 80,
  fixtureWordsMin: 4500,
  fixtureWordsMax: 5500,
  ...JSON.parse(process.env.VISSER_BUDGET_LIMITS ?? '{}'),
};

if (!existsSync(cli)) {
  console.error('not run: dist/release is missing; run npm run build first');
  process.exit(3);
}

const gates = [];
const reported = {};
function gate(name, ok, measured, limit, note) {
  gates.push({ name, ok, measured, limit, ...(note ? { note } : {}) });
}

function visser(args, opts = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', ...opts });
  return r;
}
function must(args, opts) {
  const r = visser(args, opts);
  if (r.status !== 0) {
    console.error(`visser ${args.join(' ')} exited ${r.status}\n${r.stdout}${r.stderr}`);
    process.exit(1);
  }
  return r;
}
const gz = (path) => gzipSync(readFileSync(path), { level: 9 }).length;
const words = (text) => text.split(/\s+/).filter(Boolean).length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

// 1. The reference fixture.
const work = mkdtempSync(join(tmpdir(), 'visser-budget-'));
const repo = join(work, 'repo');
mkdirSync(join(repo, '.git'), { recursive: true });
const docDir = join(repo, 'docs', 'reference');
must(['init', docDir, '--kind', 'architecture', '--title', 'Budget reference fixture']);
const doc = join(docDir, 'index.md');
const docId = /^docId: (\S+)$/m.exec(readFileSync(doc, 'utf8'))[1];
const excerpts = generateFixture(docDir, docId);

const projection = must(['export', doc, '--format', 'markdown']).stdout;
const readingWords = words(projection.split('\n').filter((l) => !l.startsWith('<!-- vs:target')).join('\n'));
let excerptBytes = 0;
excerpts.forEach((file, i) => {
  excerptBytes += statSync(file).size;
  const id = `src_${String(i + 1).padStart(2, '0')}`;
  must(['capture', 'file', '--from', file, '--kind', 'example', '--doc', doc, '--id', id, '--title', `Excerpt ${i + 1}`, '--language', 'python', '--captured-at', '2026-09-27T00:00:00Z']);
});
const check = visser(['check', doc, '--json']);
const checkJson = JSON.parse(check.stdout);

const source = readFileSync(doc, 'utf8');
const figures = [...source.matchAll(/\{% (graph|trace|transform|compare|mermaid) id="([^"]+)"(?: mode="([a-z]+)")?[^%]*%\}([\s\S]*?)\{% \/\1 %\}/g)].map((m) => {
  const body = m[4];
  const count = (tags) => tags.reduce((n, t) => n + (body.match(new RegExp(`\\{% ${t} `, 'g'))?.length ?? 0), 0);
  let nodes = count(['node', 'state', 'factor', 'task', 'actor', 'stage', 'option']);
  let edges = count(['edge', 'transition', 'causal-link', 'dependency', 'event', 'conversion', 'cell']);
  if (m[1] === 'mermaid') {
    nodes = new Set([...body.matchAll(/\b(S\d+)\[/g)].map((x) => x[1])).size;
    edges = (body.match(/-->/g) ?? []).length;
  }
  return { id: m[2], family: m[3] ? `${m[1]}:${m[3]}` : m[1], nodes, edges };
});
const families = new Set(figures.map((f) => f.family));
const maxNodes = Math.max(...figures.map((f) => f.nodes));
const maxEdges = Math.max(...figures.map((f) => f.edges));
reported.fixture = { readingWords, visuals: figures, excerpts: EXCERPT_COUNT, excerptBytes, targetCount: checkJson.targetCount, sourceBytes: Buffer.byteLength(source) };

gate('fixture: check passes', check.status === 0 && checkJson.ok, `exit ${check.status}`, 'exit 0');
gate('fixture: 8 visuals of 8 families', figures.length === 8 && families.size === 8, `${figures.length} visuals, ${families.size} families`, '8 and 8');
gate('fixture: nodes per visual', maxNodes <= LIMITS.fixtureMaxNodes, maxNodes, LIMITS.fixtureMaxNodes);
gate('fixture: edges per visual', maxEdges <= LIMITS.fixtureMaxEdges, maxEdges, LIMITS.fixtureMaxEdges);
gate('fixture: reading words', readingWords >= LIMITS.fixtureWordsMin && readingWords <= LIMITS.fixtureWordsMax, readingWords, `${LIMITS.fixtureWordsMin}-${LIMITS.fixtureWordsMax}`);
gate('fixture: 20 excerpts, about 100 KiB', EXCERPT_COUNT === 20 && Math.abs(excerptBytes - 100 * 1024) <= 10 * 1024, `${EXCERPT_COUNT} files, ${excerptBytes} bytes`, '20 files, 90-110 KiB');

// 2. Build once and inspect the output.
const out = join(work, 'out');
const buildStart = process.hrtime.bigint();
must(['build', doc, '--out', out]);
const firstBuildMs = Number(process.hrtime.bigint() - buildStart) / 1e6;
const outFiles = listFiles(out).map((f) => relative(out, f).split('\\').join('/'));
const page = outFiles.find((f) => f.startsWith('d/') && f.endsWith('/index.html'));
const html = readFileSync(join(out, page), 'utf8');

// Shared assets.
const readerJs = gz(join(release, 'browser', 'reader.js'));
const readerCss = gz(join(release, 'browser', 'reader.css'));
const mermaidBytes = statSync(join(release, 'browser', 'mermaid.js')).size;
reported.assets = { readerJsBytes: statSync(join(release, 'browser', 'reader.js')).size, readerJsGzip: readerJs, readerCssBytes: statSync(join(release, 'browser', 'reader.css')).size, readerCssGzip: readerCss, mermaidBytes, mermaidGzip: gz(join(release, 'browser', 'mermaid.js')) };
reported.page = { htmlBytes: Buffer.byteLength(html), htmlGzip: gzipSync(html, { level: 9 }).length, documentMdBytes: statSync(join(out, page.replace(/index\.html$/, 'document.md'))).size };
gate('shared browser JS (reader.js, gzip -9)', readerJs <= LIMITS.readerJsGzip, readerJs, LIMITS.readerJsGzip);
gate('shared CSS (reader.css, gzip -9)', readerCss <= LIMITS.readerCssGzip, readerCss, LIMITS.readerCssGzip);

// Per-document JavaScript.
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const srcs = scripts.map((m) => /\bsrc="([^"]*)"/.exec(m[1])?.[1]);
const inline = scripts.filter((m, i) => srcs[i] === undefined || m[2].trim() !== '');
const handlers = html.match(/<[^>]+\s on[a-z]+\s*=/gi) ?? [];
const jsUrls = html.match(/(?:href|src)\s*=\s*"\s*javascript:/gi) ?? [];
const docJsFiles = outFiles.filter((f) => /\.(m?js|cjs)$/.test(f) && !/^_visser\/assets\/[0-9a-f]{64}\/(reader|mermaid)\.js$/.test(f));
const badSrcs = srcs.filter((s) => s !== undefined && !/^(\.\.\/)+_visser\/assets\/[0-9a-f]{64}\/reader\.js$/.test(s));
gate('per-document JS: none', inline.length === 0 && handlers.length === 0 && jsUrls.length === 0 && docJsFiles.length === 0 && badSrcs.length === 0,
  `${inline.length} inline, ${handlers.length} handlers, ${jsUrls.length} javascript: URLs, ${docJsFiles.length} other JS files, ${badSrcs.length} other script sources`, '0');

// First-release browser asset files.
const manifest = JSON.parse(readFileSync(join(release, 'release.json'), 'utf8'));
const browserFiles = manifest.files.map((f) => f.path).filter((p) => p.startsWith('browser/')).sort();
const packFiles = outFiles.filter((f) => f.startsWith('_visser/')).map((f) => f.replace(/^_visser\/assets\/[0-9a-f]{64}\//, '')).sort();
gate('release browser assets: reader.js + reader.css (+ mermaid.js exception)', JSON.stringify(browserFiles) === JSON.stringify(['browser/mermaid.js', 'browser/reader.css', 'browser/reader.js']), browserFiles.join(', '), 'browser/{reader.js,reader.css,mermaid.js}');
gate('built pack: browser assets only', packFiles.every((f) => ['reader.js', 'reader.css', 'mermaid.js'].includes(f)), packFiles.join(', '), 'reader.js, reader.css, mermaid.js');

// Core skill size.
const skillWords = words(readFileSync(join(release, 'skills', 'visser-visual-explain', 'SKILL.md'), 'utf8'));
gate('core skill words (release SKILL.md)', skillWords < LIMITS.skillWords, skillWords, `< ${LIMITS.skillWords}`);

// Graph limits through the CLI.
function bigGraph(nodes, edges) {
  const dir = join(work, `big-${nodes}-${edges}`);
  mkdirSync(dir);
  const ns = Array.from({ length: nodes }, (_, i) => `{% node id="n${i}" label="N${i}" role="process" /%}`).join('\n');
  const es = Array.from({ length: edges }, (_, i) => `{% edge id="e${i}" from="n0" to="n1" kind="call" label="calls ${i}" /%}`).join('\n');
  writeFileSync(join(dir, 'index.md'), `---\nformat: visser/1\ndocId: 9c0c5e2a-9999-4a99-8a99-999999999999\ntitle: T\nkind: teaching\ncapturedAt: 2026-09-27T00:00:00Z\nvisibility: private\n---\n\n{% graph id="big" mode="architecture" title="T" question="Q?" %}\nI.\n\n${ns}\n${es}\n{% /graph %}\n`);
  const c = visser(['check', join(dir, 'index.md'), '--json']);
  const b = visser(['build', join(dir, 'index.md'), '--out', join(dir, 'out'), '--dev-toolkit', release, '--json']);
  // `build --json` reports E_BUILD in its JSON and the underlying codes on stderr.
  const codes = (r) => [...new Set(`${r.stdout}${r.stderr}`.match(/\bE_[A-Z_]+/g) ?? [])];
  return { check: { status: c.status, codes: codes(c) }, build: { status: b.status, codes: codes(b) } };
}
for (const [label, g] of [['201 nodes', bigGraph(201, 1)], ['401 edges', bigGraph(2, 401)]]) {
  for (const cmd of ['check', 'build']) {
    const r = g[cmd];
    gate(`graph limit: ${label} fails ${cmd} with E_LAYOUT_LIMIT`, r.status === 2 && r.codes.includes('E_LAYOUT_LIMIT'), `exit ${r.status} ${r.codes.join(',')}`, 'exit 2 E_LAYOUT_LIMIT');
  }
}

// 3. Timing (reported only).
reported.firstBuildMs = Math.round(firstBuildMs);
if (timing) {
  const builds = [];
  for (let i = 0; i < RUNS; i++) {
    const dest = join(work, `out-${i}`);
    const t = process.hrtime.bigint();
    must(['build', doc, '--out', dest]);
    builds.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  reported.buildMs = { runs: builds.map(Math.round), median: Math.round(median(builds)), note: 'wall clock of `visser build` from dist/release, including Node start; no network is used' };

  const server = spawn(process.execPath, [cli, 'serve', doc, '--port', '0'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverOut = '';
  server.stdout.on('data', (d) => { serverOut += d; });
  server.stderr.on('data', (d) => { serverOut += d; });
  const url = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), 60_000);
    server.stdout.on('data', () => {
      const m = /serving (http:\/\/127\.0\.0\.1:\d+\/\S*)/.exec(serverOut);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    server.once('exit', () => { clearTimeout(timer); resolve(undefined); });
  });
  try {
    if (!url) throw new Error(`serve printed no URL\n${serverOut}`);
    const resultPath = join(work, 'browser-timing.json');
    const pw = spawnSync(process.execPath, [join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config', join(root, 'playwright.config.ts')], {
      cwd: root, encoding: 'utf8', timeout: 900_000,
      env: { ...process.env, VISSER_BROWSER_BUDGETS: '1', VISSER_BUDGET_URL: url, VISSER_BUDGET_RESULT: resultPath, VISSER_BUDGET_RUNS: String(RUNS) },
    });
    if (pw.status !== 0 || !existsSync(resultPath)) {
      reported.browser = { error: `playwright exited ${pw.status}`, output: `${pw.stdout}${pw.stderr}`.slice(-4000) };
    } else {
      reported.browser = JSON.parse(readFileSync(resultPath, 'utf8'));
    }
  } finally {
    server.kill('SIGTERM');
  }
}

const cpuModel = /model name\s*:\s*(.+)/.exec(existsSync('/proc/cpuinfo') ? readFileSync('/proc/cpuinfo', 'utf8') : '')?.[1] ?? cpus()[0]?.model;
const hardware = { cpu: cpuModel, logicalCpus: cpus().length, memoryGiB: Math.round(totalmem() / 2 ** 30), os: `${platform()} ${osRelease()}`, node: process.version };
const ok = gates.every((g) => g.ok);
const result = { schema: 'visser-budgets-report/1', ok, measuredAt: new Date().toISOString(), hardware, limits: LIMITS, gates, reported, timing: timing ? 'run' : 'not run (set VISSER_BUDGET_TIMING=1)' };
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
rmSync(work, { recursive: true, force: true });

console.log('gate                                                         measured / limit');
for (const g of gates) console.log(`${g.ok ? 'ok  ' : 'FAIL'} ${g.name.padEnd(56)} ${g.measured} / ${g.limit}`);
console.log(`reported: mermaid.js ${reported.assets.mermaidBytes} bytes (${reported.assets.mermaidGzip} gzip), not gated`);
console.log(`reported: page ${reported.page.htmlBytes} bytes (${reported.page.htmlGzip} gzip)`);
console.log(`reported: first build ${reported.firstBuildMs} ms`);
if (reported.buildMs) console.log(`reported: build median ${reported.buildMs.median} ms over ${RUNS} runs`);
if (reported.browser?.initialUsable) console.log(`reported: initial usable page median ${reported.browser.initialUsable.median} ms (throttled mobile)`);
if (reported.browser?.inspectorLatency) console.log(`reported: inspector latency median ${reported.browser.inspectorLatency.median} ms`);
if (reported.browser?.error) console.log(`reported: browser timing failed: ${reported.browser.error}`);
console.log(`timing: ${result.timing}; report: ${relative(root, reportPath)}`);
process.exit(ok ? 0 : 1);
