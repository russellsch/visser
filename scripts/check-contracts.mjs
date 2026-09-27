#!/usr/bin/env node
// Contract checks (ARCHITECTURE.md §17.2 test:contracts, §18.8):
//  1. Rerun the independent Python hash implementation and compare it, case by
//     case, with the TypeScript core module on the same vectors.
//  2. Validate tests/traceability.json and confirm every tag of a covered or
//     partial entry appears in a passing testcase of reports/vitest-junit.xml.
// Exit codes follow §15.6: 0 success, 1 mismatch, 2 invalid input, 3 not run.
// Node 24 runs the imported .ts modules directly (type stripping).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  HashError,
  bodySha256,
  buildIdFromInput,
  canonicalJSON,
  normalizeText,
  parseJsonStrictIntegers,
  sha256Hex,
  sourceRevision,
} from '../packages/core/src/model/hash.ts';
import { formatReferenceUri, parseReferenceUri } from '../packages/core/src/references/uri.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = (rel) => root + rel;
let failed = false;

// ---------------------------------------------------------------------------
// 1. Cross-language hash vectors

const vectors = JSON.parse(readFileSync(at('spikes/hash-vectors/vectors.json'), 'utf8')).cases;
const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const SPECIAL = { nan: NaN, infinity: Infinity, undefined: undefined };

function runCase(c) {
  switch (c.op) {
    case 'text':
      return {
        normalizedB64: Buffer.from(normalizeText(fromB64(c.bytesB64)), 'utf8').toString('base64'),
        bodySha256: bodySha256(fromB64(c.bytesB64)),
      };
    case 'cjson': {
      const value = 'special' in c ? SPECIAL[c.special] : parseJsonStrictIntegers(c.json);
      const canonical = canonicalJSON(value);
      return { canonical, sha256: sha256Hex(Buffer.from(canonical, 'utf8')) };
    }
    case 'srcrev': {
      const files = c.files.map((f) => ({ path: f.path, kind: f.kind, content: fromB64(f.contentB64) }));
      const r = sourceRevision(c.docId, files);
      return { canonical: r.canonical, sourceRevision: r.sourceRevision };
    }
    case 'buildid':
      return buildIdFromInput(c.input);
    case 'uri_build':
      return { uri: formatReferenceUri(c.input) };
    case 'uri_parse':
      return { parts: parseReferenceUri(c.uri) };
    default:
      throw new Error(`unknown op ${c.op}`);
  }
}

function tsResult(c) {
  try {
    return { ok: true, ...runCase(c) };
  } catch (e) {
    if (!(e instanceof HashError)) throw e;
    return { ok: false, error: e.reason };
  }
}

let python;
try {
  const out = execFileSync('python3', [at('spikes/hash-vectors/py/run.py')], {
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  python = JSON.parse(out).results;
} catch (e) {
  console.error(`not run: Python hash implementation could not run (${e.message.split('\n')[0]})`);
  process.exit(3);
}

const mismatches = [];
for (const c of vectors) {
  const a = tsResult(c);
  const b = python[c.id];
  if (b === undefined || JSON.stringify(sortDeep(a)) !== JSON.stringify(sortDeep(b))) {
    mismatches.push({ id: c.id, ts: a, py: b });
  }
}
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
}
console.log(`hash vectors: ${vectors.length} cases; TypeScript core vs Python: ${vectors.length - mismatches.length} agree, ${mismatches.length} differ`);
for (const m of mismatches) {
  console.log(`  MISMATCH ${m.id}\n    ts=${JSON.stringify(m.ts)}\n    py=${JSON.stringify(m.py)}`);
}
if (mismatches.length > 0) failed = true;

// ---------------------------------------------------------------------------
// 2. Traceability

const traceability = JSON.parse(readFileSync(at('tests/traceability.json'), 'utf8'));
const shapeErrors = [];
if (traceability.schema !== 'explain-traceability/1') shapeErrors.push('schema must be explain-traceability/1');
if (!Array.isArray(traceability.entries)) shapeErrors.push('entries must be an array');
const ids = new Set();
for (const [i, e] of (traceability.entries ?? []).entries()) {
  const where = `entries[${i}]`;
  if (typeof e.id !== 'string' || !/^(R[0-9]{2}|T[0-9]{2}|[A-Z][A-Z0-9-]+)$/.test(e.id)) shapeErrors.push(`${where}.id`);
  if (ids.has(e.id)) shapeErrors.push(`${where}.id duplicate ${e.id}`);
  ids.add(e.id);
  if (!Number.isInteger(e.phase) || e.phase < 0 || e.phase > 5) shapeErrors.push(`${where}.phase`);
  if (!['covered', 'partial', 'planned'].includes(e.status)) shapeErrors.push(`${where}.status`);
  if (!Array.isArray(e.tags) || e.tags.some((t) => typeof t !== 'string' || !/^@[A-Za-z0-9-]+$/.test(t))) {
    shapeErrors.push(`${where}.tags`);
  }
  if (e.status !== 'planned' && (!Array.isArray(e.tags) || e.tags.length === 0)) {
    shapeErrors.push(`${where} is ${e.status} but has no tags`);
  }
  const allowed = new Set(['id', 'phase', 'status', 'tags', 'note']);
  for (const k of Object.keys(e)) if (!allowed.has(k)) shapeErrors.push(`${where}.${k} is not allowed`);
}
if (shapeErrors.length > 0) {
  console.error(`traceability.json is invalid:\n  ${shapeErrors.join('\n  ')}`);
  process.exit(2);
}

// §5.4: every --json output is validated against its schema before printing.
// A CLI file that prints JSON directly bypasses that check, so the gate fails.
{
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = `${dir}/${name}`;
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
  // cli-util.ts defines printJson, the one place that may print JSON directly.
  const allowed = new Set([at('packages/cli/src/cli-util.ts')]);
  const offenders = walk(at('packages/cli/src')).filter((f) => f.endsWith('.ts') && !allowed.has(f))
    .filter((f) => /process\.stdout\.write\(\s*JSON\.stringify/.test(readFileSync(f, 'utf8')));
  if (offenders.length > 0) {
    console.log(`json outputs: ${offenders.length} file(s) print JSON without schema validation (use printJson):`);
    for (const f of offenders) console.log(`  UNCHECKED ${f}`);
    failed = true;
  } else {
    console.log('json outputs: every CLI --json output goes through printJson');
  }
}

// Reports: Vitest (required) and Playwright (required once any entry needs a
// browser test). A missing report means "not run", never "passed" (§18.8).
const junitPath = at('reports/vitest-junit.xml');
if (!existsSync(junitPath)) {
  console.error('not run: reports/vitest-junit.xml is missing; run the unit tests first');
  process.exit(3);
}
const browserPath = at('reports/playwright-junit.xml');
const browserPresent = existsSync(browserPath);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const cases = [];
const suiteNames = [];
for (const path of [junitPath, ...(browserPresent ? [browserPath] : [])]) {
  const junit = readFileSync(path, 'utf8');
  for (const m of junit.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = m[1];
    const body = m[3] ?? '';
    const name = decode(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? '');
    const classname = decode(/\bclassname="([^"]*)"/.exec(attrs)?.[1] ?? '');
    const passed = !/<(failure|error|skipped)\b/.test(body);
    const failed = /<(failure|error)\b/.test(body);
    cases.push({ text: `${classname} ${name}`, passed, failed });
  }
  suiteNames.push(...[...junit.matchAll(/<testsuite\b[^>]*\bname="([^"]*)"/g)].map((m) => decode(m[1])));
}

const missing = [];
for (const e of traceability.entries) {
  if (e.status === 'planned') continue;
  for (const tag of e.tags) {
    const re = new RegExp(`${tag.replace(/[-]/g, '\\-')}(?![A-Za-z0-9])`);
    const hits = cases.filter((c) => re.test(c.text) || suiteNames.some((s) => re.test(s) && c.text.includes(s)));
    const passing = hits.filter((c) => c.passed);
    if (passing.length === 0) missing.push(`${e.id} ${tag}: ${hits.length === 0 ? 'no testcase in report' : 'no passing testcase'}`);
  }
}
const counts = traceability.entries.reduce((acc, e) => ((acc[e.status] = (acc[e.status] ?? 0) + 1), acc), {});
console.log(`traceability: ${traceability.entries.length} entries (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}); report has ${cases.length} testcases`);
for (const m of missing) console.log(`  UNPROVEN ${m}`);
// §18.8: a gate passes only with zero failures in every report, not merely one
// passing test per tag.
const failures = cases.filter((c) => c.failed);
for (const f of failures) console.log(`  FAILED ${f.text}`);
if (failures.length > 0) failed = true;
if (missing.length > 0 && !browserPresent) {
  console.error('not run: reports/playwright-junit.xml is missing; browser-tagged entries cannot be proven');
  process.exit(3);
}
if (missing.length > 0) failed = true;

process.exit(failed ? 1 : 0);
