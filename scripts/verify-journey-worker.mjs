// Compare the actual source worker to the release worker relocated away from
// node_modules. Run after npm run build with the supported Node runtime.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const normalizedOriginal = '\uFEFF  journey\r\n  %% hidden $$never-collected$$\r\n  section 😀 $$section-origin$$\r\n  Work $$task-origin$$: 2: α $$actor-origin$$\r\n';
const normalizedSource = 'journey\n%% hidden $$never-collected$$\nsection 😀 $$section-origin$$\nWork $$task-origin$$: 2: α $$actor-origin$$\n';
const fixtures = [
  {
    name: 'all-roles-and-native-shapes',
    source: 'journey\ntitle <br/> $$title$$\naccTitle: <br/>&dollar;&dollar;accessible-title&dollar;&dollar;\naccDescr {\n <br/> &dollar;&dollar;accessible-description&dollar;&dollar;\n}\nsection $$same-section$$\nTask $$task$$: 2: $$actor$$, $$actor$$\nsection $$same-section$$\nAgain $$again$$: 3: __proto__, constructor\nEmpty: 0: ,\nsection unused\n',
    occurrences: 9,
  },
  { name: 'bom-crlf-comments', source: normalizedSource, originalSource: normalizedOriginal, occurrences: 3 },
  {
    name: 'raw-duplicate-empty-prototype-actors',
    source: 'journey\nBefore: 1: A\nsection same\nOne: 2: A, B, A\nsection same\nTwo: 3: __proto__\nsection Other\nThree: 4: constructor\nsection unused\nEmpty: 0: ,\n',
    occurrences: 0,
  },
  { name: 'malformed-journey', source: 'journey\nsection\n', failure: 'parse' },
  { name: 'recovery-journey', source: 'journey\nsection Recovered\nPlain task: 1: Ada\n', occurrences: 0 },
  { name: 'overwritten-invalid-root', source: 'journey\ntitle $$\\unknownVisserCommand$$\ntitle safe\nTask: 1\n', failure: 'math' },
  { name: 'recovery-flowchart', source: 'flowchart LR\nRecovered[plain]\n', type: 'flowchart', journey: false, occurrences: undefined },
  { name: 'nonfinite-score-with-math', source: 'journey\nTask $$math$$: nope: A\n', failure: 'math' },
  { name: 'nonfinite-score-plain', source: 'journey\nTask plain: nope: A\n', occurrences: 0 },
  { name: 'source-less-decoded-metadata', source: 'journey\naccTitle: <br/>&dollar;&dollar;decoded&dollar;&dollar;\nTask: 1\n', failure: 'math', omitOriginal: true },
];

const figures = fixtures.map((fixture, index) => {
  const journey = fixture.journey ?? true;
  const figure = { figureId: `journey-${index}-${fixture.name}`, source: fixture.source,
    type: fixture.type ?? 'other', journey };
  if (!fixture.omitOriginal && journey) figure.originalSource = fixture.originalSource ?? fixture.source;
  return figure;
});
const input = JSON.stringify({ figures });
const run = (worker, cwd) => JSON.parse(execFileSync(process.execPath, [worker], {
  input, cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
}));
const fail = message => { throw new Error(`Journey worker verification: ${message}`); };
const journey = (result, name) => {
  if (!result?.ok || !result.journeyMath) fail(`${name} has no journey math transport`);
  return result.journeyMath;
};
const success = (result, name) => {
  if (!result?.ok) fail(`${name} did not recover: ${result?.error ?? 'missing result'}`);
  return result;
};
const failure = (result, name, kind) => {
  if (result?.ok) fail(`${name} unexpectedly succeeded`);
  if (kind === 'math' && result?.code !== 'E_MATH') fail(`${name} expected E_MATH, got ${result?.code ?? 'no code'}`);
};

const dir = mkdtempSync(join(tmpdir(), 'visser-journey-worker-'));
try {
  const source = run(join(root, 'packages/core/src/mermaid/parse-worker.ts'), root);
  const relocated = join(dir, 'mermaid-parse.cjs');
  copyFileSync(join(root, 'dist/release/workers/mermaid-parse.cjs'), relocated);
  const bundled = run(relocated, dir);
  if (!isDeepStrictEqual(source, bundled)) fail('source and relocated release results differ');
  if (!Array.isArray(source.results) || source.results.length !== fixtures.length) fail('result count differs from fixtures');

  for (const [index, fixture] of fixtures.entries()) {
    const result = source.results[index];
    if (fixture.failure) failure(result, fixture.name, fixture.failure);
    else success(result, fixture.name);
  }

  const rich = journey(source.results[0], fixtures[0].name);
  if (rich.total?.occurrences !== fixtures[0].occurrences) fail('all-role occurrence cost differs');
  if (!Array.isArray(rich.records) || !Array.isArray(rich.slots) || !rich.snapshot || typeof rich.total !== 'object') {
    fail('all-role transport lacks records, slots, snapshot, or total');
  }
  const roles = new Set(rich.records.map(record => record.role));
  for (const role of ['title', 'accTitle', 'accDescr', 'section', 'task', 'actor']) if (!roles.has(role)) fail(`all-role transport lacks ${role}`);
  for (const [field, tex] of [['title', 'title'], ['accTitle', 'accessible-title'], ['accDescr', 'accessible-description']]) {
    const value = rich.snapshot[field];
    if (typeof value !== 'string' || !value.includes(`$$${tex}$$`) || value.includes('&dollar;')) fail(`sanitized ${field} snapshot differs`);
  }
  if (!rich.snapshot.title.startsWith('<br>') || !rich.snapshot.accDescr.startsWith('<br>')) fail('metadata break sanitization differs');
  if (rich.snapshot.sections.filter(section => section === '$$same-section$$').length !== 2 ||
      !rich.snapshot.actors.includes('__proto__') || !rich.snapshot.actors.includes('constructor')) fail('duplicate section or prototype actor snapshot differs');
  if (!rich.records.some(record => record.role === 'actor' && record.dbValue === '')) fail('empty actor was not retained');

  const normalized = journey(source.results[1], fixtures[1].name);
  if (normalized.total?.occurrences !== fixtures[1].occurrences || normalized.records.some(record => record.renderedValue.includes('never-collected'))) {
    fail('BOM/CRLF/comment normalization differs');
  }
  if (normalized.records.flatMap(record => record.parts).filter(part => part.kind === 'math').some(part => part.synthetic)) {
    fail('BOM/CRLF formula provenance became synthetic');
  }

  const raw = success(source.results[2], fixtures[2].name);
  if (raw.journeyMath !== undefined) fail('plain raw actor fixture unexpectedly has math transport');
  // The nonfinite-math result itself must reject; the successful plain fixture
  // proves nonfinite native scores are preserved absent a math render plan.
  failure(source.results[7], fixtures[7].name, 'math');
  if (success(source.results[8], fixtures[8].name).journeyMath !== undefined) fail('plain nonfinite score unexpectedly created math transport');
  if (source.results[6]?.type !== 'flowchart') fail('other-family recovery did not preserve flowchart result');

  writeFileSync(join(root, 'reports/math/journey-worker-relocated.json'), JSON.stringify({
    equal: true, fixtureCount: fixtures.length, results: source.results,
  }, null, 2) + '\n');
  console.log(`Source and relocated release worker agree on ${fixtures.length} journey fixtures.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
