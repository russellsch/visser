// The components of docs/IMPROVEMENTS.md §14: `note`, `self-check`,
// `measure`, `tree`, `steps`, observations on a time-scaled trace, and
// `annotated` with `before`. Validation, targets and relationships, the text
// projection, the static rendering, and the review prompts.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadBundle, type LoadedBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { projectText } from '../../packages/core/src/model/project.ts';
import { reviewDocument } from '../../packages/core/src/review/index.ts';
import { DIFF_MAX_LINES, diffPairs, excerptLines, lineDiff } from '../../packages/core/src/model/diff.ts';
import { fenceMarker, plainNumber, withUnit } from '../../packages/core/src/model/project.ts';
import { parseSource } from '../../packages/core/src/syntax/index.ts';
import { normalizedTextSha256 } from '../../packages/core/src/model/hash.ts';
import { PATTERNS } from '../../packages/core/src/catalogue/index.ts';

const TOOLKIT = { version: '0.0.0', sha256: 'e'.repeat(64) };
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };
const FIXTURE = new URL('../../fixtures/positive/family-components.md', import.meta.url).pathname;

const work = mkdtempSync(join(tmpdir(), 'visser-components-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function doc(body: string, kind = 'teaching'): string {
  return [
    '---', 'format: visser/1', 'docId: 3a1f0c2e-8b7d-4e6f-9a5b-141414141414', 'title: Component fixture', `kind: ${kind}`,
    'capturedAt: 2026-09-28T00:00:00Z', 'visibility: private', '---', '', '<!-- vs:id h_top -->', '# Component fixture', '', body, '',
  ].join('\n');
}

/** A captured example source with the hash that `visser capture` writes. */
function source(id: string, lines: string[], language = 'text'): string {
  const body = `${lines.join('\n')}\n`;
  const hash = normalizedTextSha256(new TextEncoder().encode(body));
  return `{% source id="${id}" kind="example" title="Source ${id}" language="${language}" excerptSha256="${hash}" %}\n\`\`\`${language}\n${body}\`\`\`\n{% /source %}\n`;
}

function load(text: string): LoadedBundle {
  const dir = mkdtempSync(join(work, 'b-'));
  writeFileSync(join(dir, 'index.md'), text);
  return loadBundle(join(dir, 'index.md'));
}

const found = (text: string, severity: 'error' | 'warning') => load(text).diagnostics.filter((d) => d.severity === severity && d.code !== 'W_UNDECLARED_FILE').map((d) => d.code);

async function html(text: string): Promise<string> {
  const bundle = load(text);
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const result = await compileDocument(bundle, TOOLKIT, OPTIONS);
  return new TextDecoder().decode(result.files.find((f) => f.path.endsWith('/index.html'))!.bytes);
}

const MAP = (steps: string) => `{% graph id="intake" mode="architecture" title="The API writes to the queue" question="Which component writes a charge request?" %}
The arrow is a data flow.

{% node id="n_api" label="Order API" role="interface" /%}
{% node id="n_queue" label="Charge queue" role="storage" /%}
{% edge id="e_enqueue" from="n_api" to="n_queue" kind="data" label="enqueues charge request" /%}
${steps}
{% /graph %}
`;

describe('validation (IMPROVEMENTS.md §14)', () => {
  it('the positive fixture checks with no diagnostics', () => {
    expect(found(readFileSync(FIXTURE, 'utf8'), 'error')).toEqual([]);
    expect(found(readFileSync(FIXTURE, 'utf8'), 'warning')).toEqual([]);
  });

  it('more than 8 steps is W_VISUAL_DENSITY; 8 is not', () => {
    const steps = (n: number) => `{% steps id="walk" %}\n${Array.from({ length: n }, (_, i) => `{% step id="wk_${i}" label="Step ${i}" targets=["n_api"] %}\nStep ${i} explains the boundary.\n{% /step %}`).join('\n')}\n{% /steps %}`;
    expect(found(doc(MAP(steps(8))), 'warning')).toEqual([]);
    expect(found(doc(MAP(steps(9))), 'warning')).toEqual(['W_VISUAL_DENSITY']);
    expect(found(doc(MAP(steps(9))), 'error')).toEqual([]);
  });

  it('a walkthrough needs two explained steps with non-empty targets', () => {
    const one = `{% steps id="walk" %}\n{% step id="wk_1" label="One" targets=["n_api"] %}\nThe API owns the boundary.\n{% /step %}\n{% /steps %}`;
    expect(found(doc(MAP(one)), 'error')).toEqual(['E_SYNTAX']);

    const invalid = (first: string) => `{% steps id="walk" %}
${first}
{% step id="wk_ok" label="Explained" targets=["n_queue", "e_enqueue"] %}
The queue and edge make the handoff durable.
{% /step %}
{% /steps %}`;
    const noTargets = load(doc(MAP(invalid(`{% step id="wk_no_targets" label="No target" %}
This explanation names no part.
{% /step %}`)))).diagnostics.filter((d) => d.severity === 'error');
    expect(noTargets).toMatchObject([{ code: 'E_SYNTAX', targetId: 'wk_no_targets' }]);

    const wrongTargets = load(doc(MAP(invalid(`{% step id="wk_wrong_targets" label="Wrong target shape" targets=3 %}
This explanation has the wrong target shape.
{% /step %}`)))).diagnostics.filter((d) => d.severity === 'error');
    expect(wrongTargets).toHaveLength(1);
    expect(wrongTargets).toMatchObject([{ code: 'E_SYNTAX', targetId: 'wk_wrong_targets' }]);

    const mixedTargets = load(doc(MAP(invalid(`{% step id="wk_mixed_targets" label="Mixed target shape" targets=["intake", 3] %}
This explanation has a mixed target list.
{% /step %}`)))).diagnostics.filter((d) => d.severity === 'error');
    expect(mixedTargets).toHaveLength(1);
    expect(mixedTargets).toMatchObject([{ code: 'E_SYNTAX', targetId: 'wk_mixed_targets' }]);

    const noBody = load(doc(MAP(invalid('{% step id="wk_empty_body" label="No explanation" targets=["n_api"] /%}')))).diagnostics.filter((d) => d.severity === 'error');
    expect(noBody).toMatchObject([{ code: 'E_SYNTAX', targetId: 'wk_empty_body' }]);

    const citationOnly = `{% step id="wk_citation_only" label="Citation only" targets=["n_api"] %}
_{% cite ref="src_x" /%}_
{% /step %}`;
    const citationErrors = load(doc(`${MAP(invalid(citationOnly))}\n${source('src_x', ['evidence'])}`)).diagnostics.filter((d) => d.severity === 'error');
    expect(citationErrors).toMatchObject([{ code: 'E_SYNTAX', targetId: 'wk_citation_only' }]);

    const citationAndPunctuation = `{% step id="wk_citation_punctuation" label="Citation and punctuation" targets=["n_api"] %}
_{% cite ref="src_x" /%}_. —
{% /step %}`;
    const punctuationErrors = load(doc(`${MAP(invalid(citationAndPunctuation))}\n${source('src_x', ['evidence'])}`)).diagnostics.filter((d) => d.severity === 'error');
    expect(punctuationErrors).toMatchObject([{ code: 'E_SYNTAX', targetId: 'wk_citation_punctuation' }]);

    const duplicate = `{% steps id="walk" %}
{% step id="wk_1" label="One" targets=["n_api", "n_api"] %}
The API owns the boundary.
{% /step %}
{% step id="wk_2" label="Two" targets=["n_queue"] %}
The queue makes work durable.
{% /step %}
{% /steps %}`;
    expect(load(doc(MAP(duplicate))).diagnostics.filter((d) => d.severity === 'error').map((d) => [d.code, d.targetId])).toEqual([
      ['E_SEMANTIC', 'wk_1'],
    ]);

    const valid = `{% steps id="walk" %}
{% step id="wk_1" label="One" targets=["n_api", "e_enqueue"] %}
The API and edge form the write boundary.
{% /step %}
{% step id="wk_2" label="Two" targets=["n_queue"] %}
The queue makes the handoff durable.
{% /step %}
{% /steps %}`;
    expect(found(doc(MAP(valid)), 'error')).toEqual([]);
  });

  it('a step names only parts of its own figure, not the figure itself', () => {
    const other = `{% tree id="code_map" title="Files" question="Where?" %}\nOne.\n\n{% entry id="t_a" path="a" label="A" /%}\n{% /tree %}`;
    const walkthrough = (target: string) => `{% steps id="walk" %}\n{% step id="wk" label="Look" targets=["${target}"] %}\nThis tests the invalid reference.\n{% /step %}\n{% step id="wk_ok" label="Stay here" targets=["n_api", "e_enqueue"] %}\nThese parts form the local boundary.\n{% /step %}\n{% /steps %}`;
    expect(found(doc(MAP(walkthrough('t_a')) + other), 'error')).toEqual(['E_REF_BROKEN']);
    expect(found(doc(MAP(walkthrough('intake'))), 'error')).toEqual(['E_REF_BROKEN']);
  });

  it('more than 40 tree entries is W_VISUAL_DENSITY, counting nested entries', () => {
    const entries = (n: number) => `{% entry id="t_root" path="root" label="Root" %}\n${Array.from({ length: n - 1 }, (_, i) => `{% entry id="t_${i}" path="f${i}" label="File ${i}" /%}`).join('\n')}\n{% /entry %}`;
    const tree = (n: number) => `{% tree id="code_map" title="Files" question="Where?" %}\nMany.\n\n${entries(n)}\n{% /tree %}`;
    expect(found(doc(tree(40)), 'warning')).toEqual([]);
    expect(found(doc(tree(41)), 'warning')).toEqual(['W_VISUAL_DENSITY']);
  });

  it('a diff over 80 lines on one side is W_VISUAL_DENSITY', () => {
    const long = Array.from({ length: 81 }, (_, i) => `line ${i}`);
    const text = (n: number) => doc(`{% annotated id="d" title="Change" question="What changed?" source="src_after" before="src_before" %}\nOne.\n\n{% annotation id="an" label="Here" lines=[1, 1] /%}\n{% /annotated %}\n\n${source('src_before', long.slice(0, n))}\n${source('src_after', ['line 0'])}`);
    expect(found(text(80), 'warning')).toEqual([]);
    expect(found(text(81), 'warning')).toEqual(['W_VISUAL_DENSITY']);
  });

  it('an event may leave out `actor` only in a time trace with no actors', () => {
    const trace = (scale: string) => `{% trace id="log" ${scale} title="Log" question="When?" %}\nOne log.\n\n{% event id="ob" label="Pool full" kind="observation" time=3 evidence=["src_log"] /%}\n{% /trace %}\n\n${source('src_log', ['pool full'])}`;
    expect(found(doc(trace('scale="time" timeUnit="s"')), 'error')).toEqual([]);
    expect(found(doc(trace('scale="ordinal"').replace(' time=3', '').replace('kind="observation"', 'kind="compute"')), 'error')).toEqual(['E_SYNTAX']);
  });

  it('an observation in an ordinal trace is E_SEMANTIC: it needs a time (phase 6a review C7)', () => {
    const trace = `{% trace id="log" title="Log" question="When?" %}\nOne log.\n\n{% actor id="a_pool" label="Pool" /%}\n{% event id="ob" actor="a_pool" label="Pool full" kind="observation" evidence=["src_log"] /%}\n{% /trace %}\n\n${source('src_log', ['pool full'])}`;
    expect(found(doc(trace), 'error')).toEqual(['E_SEMANTIC']);
  });
});

describe('targets and relationships', () => {
  const bundle = load(readFileSync(FIXTURE, 'utf8'));
  const t = (id: string) => bundle.model.targets.get(id)!;

  it('a walkthrough and its steps are targets that render in the figure, not in the appendix', () => {
    expect(t('walk_intake').inspectable).toBe(false);
    expect(t('wk_store').inspectable).toBe(false);
    expect(t('wk_store').ownerComponentId).toBe('intake');
    expect(t('wk_charge').dependencies).toEqual(['n_worker', 'e_take', 'n_queue']);
  });

  it('readings and entries are inspectable parts; the new components emit no relationships', () => {
    expect(t('rd_before').inspectable).toBe(true);
    expect(t('t_handler').inspectable).toBe(true);
    expect(t('t_handler').ownerComponentId).toBe('code_map');
    expect(t('m_wait').inspectable).toBe(false);
    expect(t('ck_store').label).toBe('Which component stores the charge request?');
    expect(bundle.model.relationships.map((r) => r.id)).toEqual(['e_enqueue', 'e_take']);
  });

  it('a causal link may name an observation in `evidence`, and the relationship keeps it', () => {
    const text = doc(`{% trace id="log" scale="time" timeUnit="s" title="Log" question="When?" %}\nOne log.\n\n{% event id="ob_full" label="Pool full" kind="observation" time=3 evidence=["src_log"] /%}\n{% /trace %}\n\n{% graph id="why" mode="cause" title="Why" question="What fills the pool?" %}\nThe mechanism.\n\n{% factor id="f_load" label="Load rises" basis="observed" /%}\n{% factor id="f_pool" label="Pool fills" basis="observed" /%}\n{% causal-link id="cl" from="f_load" to="f_pool" label="holds connections" basis="observed" evidence=["ob_full"] /%}\n{% /graph %}\n\n${source('src_log', ['pool full'])}`);
    const b = load(text);
    expect(b.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(b.model.relationships.find((r) => r.id === 'cl')!.evidenceIds).toEqual(['ob_full']);
    expect(reviewDocument(b).filter((d) => d.targetId === 'cl')).toEqual([]);
  });
});

describe('text projection', () => {
  const text = projectText(load(readFileSync(FIXTURE, 'utf8')).parsed);

  it('a note reads "Limit: …"; a self-check gives the question, then the answer', () => {
    expect(text).toContain('<!-- vs:target nt_limit -->\nLimit: This map shows one region.');
    expect(text).toContain('<!-- vs:target ck_store -->\nSelf-check: Which component stores the charge request?\n\nAnswer: The charge queue stores it. The API only puts it there. [cite: src_handler]');
  });

  it('a walkthrough is a numbered list with its targets; an architecture walkthrough says it is a reading order', () => {
    expect(text).toContain('<!-- vs:target walk_intake -->\nSteps. Reading order, not execution order.');
    expect(text).toContain('<!-- vs:target wk_charge -->\n2. The worker charges later\ntargets: Charge worker (n_worker), takes next request (e_take), Charge queue (n_queue)');
  });

  it('a measure is a table with the unit, the status, and the evidence', () => {
    expect(text).toContain('Unit: ms. Each bar starts at zero.');
    expect(text).toContain('| <!-- vs:target rd_before --> Before | 800 ms | measured | Order handler (src_handler) |');
    expect(text).toContain('| <!-- vs:target rd_after --> After | 120 ms | estimated | Release calendar (src_calendar) |');
  });

  it('a tree is an indented list', () => {
    expect(text).toContain('- <!-- vs:target t_core -->\n  `packages/core`: Parse and render (role: process)\n  - <!-- vs:target t_handler -->\n    `packages/core/src/handler.js`: Order handler (role: interface)\n    Evidence: Order handler (src_handler)');
  });

  it('an event in the implicit lane names no actor', () => {
    expect(text).toContain('<!-- vs:target ob_fill -->\nEvent Pool at 100 percent (observation)\n');
  });

  it('annotated with `before` prints both sources, the diff, and the side of each annotation', () => {
    expect(text).toContain('Before: src_handler\nAfter: src_handler_after');
    expect(text).toContain('```diff\n export function acceptOrder(request) {\n+  if (!request.id) return { status: 400 };\n   queue.put({ orderId: request.id });');
    expect(text).toContain('Annotation The new check (after, lines 2–2)');
    expect(text).toContain('Annotation The old first line (before, lines 2–2)');
  });
});

describe('rendering', () => {
  it('a note has its kind class, role, and eyebrow word; the word is the paired cue of the hue', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    expect(page).toMatch(/<div class="vs-block vs-note vs-note-limit" role="note" aria-label="Limit" id="x-nt_limit"[^>]*><p class="vs-note-kind" data-vs-generated="">Limit<\/p><p>This map/);
  });

  it('a self-check is a native details with the summary "Show answer"', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    expect(page).toMatch(/id="x-ck_store"[\s\S]*?<details class="vs-self-check-answer"><summary data-vs-generated="">Show answer<\/summary><div class="vs-self-check-body"><p>The charge queue stores it\./);
  });

  it('a measure draws bars from zero in proportion; a reading that is not measured is hatched and says so', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    const bar = (id: string) => new RegExp(`id="v-m_wait\\.${id}"[\\s\\S]*?<rect class="(vs-bar|vs-bar-outline)" x="([\\d.]+)" y="[\\d.]+" width="([\\d.]+)"`).exec(page)!;
    expect(bar('rd_before')[1]).toBe('vs-bar');
    expect(bar('rd_after')[1]).toBe('vs-bar-outline');
    expect(Number(bar('rd_after')[3]) / Number(bar('rd_before')[3])).toBeCloseTo(120 / 800, 3);
    expect(page).toMatch(/id="v-m_wait\.rd_after"[^>]*aria-label="After: 120 ms \(estimated\); opens more detail"[\s\S]*?<path class="vs-bar-hatch"/);
    const beforeBar = page.slice(page.indexOf('id="v-m_wait.rd_before"'), page.indexOf('id="v-m_wait.rd_after"'));
    expect(beforeBar).not.toContain('vs-bar-hatch');
    expect(page).toContain('data-vs-views="map list"');
    expect(page).toMatch(/<table class="vs-measure-table">[\s\S]*?id="l-m_wait\.rd_after"[\s\S]*?120 ms<\/td><td data-vs-generated="">estimated<\/td>/);
    // The axis shows zero and the maximum only.
    expect([...page.matchAll(/<text class="vs-measure-tick"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1])).toEqual(['0', '800 ms']);
  });

  it('a tree nests entries in details, open at the top two levels, with the role cue and the evidence mark; no link is in a summary (phase 6a review C4)', async () => {
    const deep = `{% tree id="code_map" title="Files" question="Where?" %}\nThree levels.\n\n{% entry id="t_a" path="a" role="process" label="A" %}\n{% entry id="t_b" path="a/b" role="storage" label="B" %}\n{% entry id="t_c" path="a/b/c" label="C" %}\n{% entry id="t_d" path="a/b/c/d" label="D" evidence=["src_x"] /%}\n{% /entry %}\n{% /entry %}\n{% /entry %}\n{% /tree %}\n\n${source('src_x', ['x'])}`;
    const page = await html(doc(deep));
    expect(page).toMatch(/<li class="vs-tree-item"><div class="vs-tree-line"><span class="vs-tree-entry" id="l-code_map\.t_a"[\s\S]*?<\/div><details class="vs-tree-node vs-tree-open" open><summary class="vs-tree-toggle" data-vs-generated="">1 entry<span class="vs-sr"> in a<\/span><\/summary>/);
    expect(page).toMatch(/<div class="vs-tree-line"><span class="vs-tree-entry"[^>]*id="l-code_map\.t_b"[\s\S]*?<\/div><details class="vs-tree-node vs-tree-open" open><summary class="vs-tree-toggle"/);
    expect(page).toMatch(/<div class="vs-tree-line"><span class="vs-tree-entry"[^>]*id="l-code_map\.t_c"[\s\S]*?<\/div><details class="vs-tree-node"><summary class="vs-tree-toggle"/);
    // No interactive element inside a summary.
    expect(page).not.toMatch(/<summary[^>]*>(?:(?!<\/summary>)[\s\S])*<a /);
    expect(page).toMatch(/id="l-code_map\.t_a"[\s\S]*?<span class="vs-tree-role" data-vs-generated=""><svg [^>]*class="vs-legend-swatch"[\s\S]*?vs-cat-slate[\s\S]*?<\/svg>process<\/span>/);
    expect(page).toMatch(/id="l-code_map\.t_d"[\s\S]*?<span class="vs-tree-evidence" data-vs-generated="">evidence<\/span>/);
    // Evidence is last and collapsed so the inspector leads with useful detail.
    expect(page).toMatch(/<details class="vs-detail vs-kind-entry" id="x-t_d"[^>]*>[\s\S]*?<details class="vs-detail-section vs-detail-evidence"/);
  });

  it('a walkthrough is a numbered list under its figure, with its parts as links', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    const walk = /<section class="vs-steps" id="x-walk_intake"[\s\S]*?<\/section><\/figure>/.exec(page)![0];
    expect(walk).toContain('<p class="vs-steps-note" data-vs-generated="">Reading order, not execution order.</p>');
    expect(walk).toContain('<li class="vs-step" id="x-wk_charge" data-vs-target="wk_charge"');
    expect(walk).toContain('data-vs-step-targets="n_worker e_take n_queue"');
    expect(walk).toMatch(/<a id="l-intake\.wk_charge\.n_worker"[^>]*data-vs-target="n_worker"[^>]*href="#x-n_worker"[^>]*data-vs-interactive=""[^>]*>Charge worker<span class="vs-depth-cue/);
    // A walkthrough in a compare or a trace has no reading-order sentence;
    // a graph of any mode and a domain have it (phase 6a review S1).
    const state = await html(doc(`{% graph id="g" mode="state" title="Two states" question="Which states?" %}\nStates.\n\n{% state id="s_a" label="Open" initial=true /%}\n{% state id="s_b" label="Closed" terminal=true /%}\n{% transition id="t_ab" from="s_a" to="s_b" event="close" label="closes" /%}\n\n{% steps id="walk" %}\n{% step id="wk" label="Start" targets=["s_a"] %}\nOpen is the initial state.\n{% /step %}\n{% step id="wk_end" label="Finish" targets=["s_b", "t_ab"] %}\nThe close transition reaches the terminal state.\n{% /step %}\n{% /steps %}\n{% /graph %}`));
    expect(state).toContain('<p class="vs-steps-note" data-vs-generated="">Reading order, not execution order.</p>');
    const compare = await html(doc(`{% compare id="c" title="Two queues" question="Which one waits?" %}\nFacts.\n\n{% option id="o_a" label="A" /%}\n{% criterion id="cr" label="Wait" /%}\n{% cell id="cl_a" option="o_a" criterion="cr" value="yes" /%}\n\n{% steps id="walk" %}\n{% step id="wk" label="Read the wait" targets=["cl_a"] %}\nThe cell records whether this option waits.\n{% /step %}\n{% step id="wk_context" label="Read the criterion" targets=["o_a", "cr"] %}\nThe option and criterion define what the value compares.\n{% /step %}\n{% /steps %}\n{% /compare %}`));
    expect(compare).toContain('id="x-walk"');
    expect(compare).not.toContain('vs-steps-note');
  });

  it('a time trace with no actors has one implicit lane, and an observation has the evidence mark', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    expect(page).toContain('class="vs-lifeline vs-lane-implicit"');
    expect(page).not.toMatch(/<a class="vs-lane"[^>]*id="v-log\./);
    expect(page).toMatch(/id="v-log\.ob_fill"[^>]*aria-label="Pool at 100 percent \(\[observation\]; at 12 s\); opens sources"[\s\S]*?class="vs-mark vs-mark-evidence"/);
    expect(page).toMatch(/<section class="vs-actor-group" aria-label="Events">[\s\S]*?id="l-log\.ob_fill\.card"/);
  });

  it('annotated with `before` shows both sides with signs, gap rows, and each annotation on its side', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    const before = /<div class="vs-diff-side vs-diff-before">[\s\S]*?<\/pre><\/div>/.exec(page)![0];
    const after = /<div class="vs-diff-side vs-diff-after">[\s\S]*?<\/pre><\/div>/.exec(page)![0];
    expect(before).toContain('<span class="vs-line vs-line-gap" aria-hidden="true">');
    // The sign is aria-hidden; the visually hidden word names the change (phase 6a review S2).
    expect(after).toMatch(/<span class="vs-line vs-line-added[^"]*"[^>]*><span class="vs-ln" data-vs-generated="">2<\/span><span class="vs-diff-sign" data-vs-generated="" aria-hidden="true">\+<\/span><span class="vs-sr vs-diff-sr" data-vs-generated="">added: <\/span><span class="vs-ann-col" data-vs-generated="">/);
    expect(after).toContain('id="v-diff_handler.an_new.2"');
    expect(before).toContain('id="v-diff_handler.an_old.2"');
    expect(page).toContain('0 lines removed (−), 1 line added (+).');
    expect(page).toContain('<span data-vs-generated="">Before, lines 2–2: </span>The old first line');
  });

  it('a removed line is marked on the before side', async () => {
    const page = await html(doc(`{% annotated id="d" title="Change" question="What changed?" source="src_after" before="src_before" %}\nOne.\n\n{% annotation id="an" label="Old wait" lines=[2, 2] side="before" /%}\n{% /annotated %}\n\n${source('src_before', ['a', 'old', 'c'])}\n${source('src_after', ['a', 'new', 'c'])}`));
    expect(page).toMatch(/<div class="vs-diff-side vs-diff-before">[\s\S]*?<span class="vs-line vs-line-removed vs-annotated" data-vs-ann="an"><span class="vs-ln" data-vs-generated="">2<\/span><span class="vs-diff-sign" data-vs-generated="" aria-hidden="true">−<\/span><span class="vs-sr vs-diff-sr" data-vs-generated="">removed: <\/span><span class="vs-ann-col" data-vs-generated=""><span class="vs-annotation-marker"/);
    // Every line has the marker column, so the code starts in one column (phase 6a review S3).
    const side = /<div class="vs-diff-side vs-diff-before">[\s\S]*?<\/pre><\/div>/.exec(page)![0];
    const lines = [...side.matchAll(/<span class="vs-line(?! vs-line-gap)[^"]*"/g)].length;
    expect([...side.matchAll(/<span class="vs-ann-col"/g)].length).toBe(lines);
  });
});

describe('the line diff', () => {
  it('keeps the common lines and pairs removed with added lines', () => {
    const rows = lineDiff(['a', 'b', 'c'], ['a', 'x', 'c', 'd']);
    expect(rows).toEqual([
      { op: 'same', before: 0, after: 0 }, { op: 'removed', before: 1 }, { op: 'added', after: 1 },
      { op: 'same', before: 2, after: 2 }, { op: 'added', after: 3 },
    ]);
    expect(diffPairs(rows)).toEqual([
      { before: 0, after: 0, changed: false }, { before: 1, after: 1, changed: true },
      { before: 2, after: 2, changed: false }, { after: 3, changed: true },
    ]);
  });
});

describe('the line diff: bounds and sharing (phase 6a review C1)', () => {
  it('strips the common prefix and suffix; the rows are the same as with the full table', () => {
    const before = ['p1', 'p2', 'a', 'b', 's1', 's2'];
    const after = ['p1', 'p2', 'x', 'b', 'y', 's1', 's2'];
    expect(lineDiff(before, after)).toEqual([
      { op: 'same', before: 0, after: 0 }, { op: 'same', before: 1, after: 1 },
      { op: 'removed', before: 2 }, { op: 'added', after: 2 }, { op: 'same', before: 3, after: 3 }, { op: 'added', after: 4 },
      { op: 'same', before: 4, after: 5 }, { op: 'same', before: 5, after: 6 },
    ]);
    expect(lineDiff(['a'], ['a'])).toEqual([{ op: 'same', before: 0, after: 0 }]);
    expect(lineDiff([], ['a'])).toEqual([{ op: 'added', after: 0 }]);
    expect(lineDiff(['a', 'a'], ['a'])).toEqual([{ op: 'same', before: 0, after: 0 }, { op: 'removed', before: 1 }]);
  });

  it('refuses a side above the cap; the validator stops such a document with E_LIMIT', () => {
    const lines = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag} ${i}`);
    expect(() => lineDiff(lines(DIFF_MAX_LINES + 1, 'a'), ['b'])).toThrow(RangeError);
    expect(lineDiff(lines(DIFF_MAX_LINES, 'a'), lines(DIFF_MAX_LINES, 'b'))).toHaveLength(2 * DIFF_MAX_LINES);
    const figure = (n: number) => doc(`{% annotated id="d" title="Change" question="What changed?" source="src_after" before="src_before" %}\nOne.\n{% /annotated %}\n\n${source('src_before', lines(n, 'old'))}\n${source('src_after', lines(3, 'new'))}`);
    expect(found(figure(DIFF_MAX_LINES), 'error')).toEqual([]);
    expect(found(figure(DIFF_MAX_LINES), 'warning')).toEqual(['W_VISUAL_DENSITY']);
    expect(found(figure(DIFF_MAX_LINES + 1), 'error')).toEqual(['E_LIMIT']);
  });

  it('the build computes the diff once, and the projection prints the rows that the page shows', async () => {
    const text = readFileSync(FIXTURE, 'utf8');
    const bundle = load(text);
    const result = await compileDocument(bundle, TOOLKIT, OPTIONS);
    const md = new TextDecoder().decode(result.files.find((f) => f.path.endsWith('/document.md'))!.bytes);
    expect(md).toBe(projectText(bundle.parsed, bundle.model.targets));
    // The projection prints the rows it is given, so it never computes them again.
    const parsed = parseSource(new TextEncoder().encode(doc(`{% annotated id="d" title="Change" question="What changed?" source="src_after" before="src_before" %}\nOne.\n{% /annotated %}\n\n${source('src_before', ['a'])}\n${source('src_after', ['b'])}`)), 'index.md');
    const shown = projectText(parsed, undefined, new Map([['d', [{ op: 'removed' as const, before: 0 }, { op: 'added' as const, after: 0 }]]]));
    expect(shown).toContain('```diff\n-a\n+b\n```');
  });

  it('a fence is longer than any backtick run in its content, so an excerpt line never closes it (phase 6a review C5)', () => {
    expect(fenceMarker('plain\n')).toBe('```');
    expect(fenceMarker('```ts\ncode\n```\n')).toBe('````');
    expect(fenceMarker('a ````` b')).toBe('``````');
    const md = ['# Title', '', '```ts', 'const x = 1;', '```'];
    // The document itself fences a Markdown excerpt with four backticks.
    const long = (id: string, lines: string[]) => source(id, lines, 'markdown').replaceAll('```markdown', '````markdown').replace('\n```\n{% /source %}', '\n````\n{% /source %}');
    const bundle = load(doc(`{% annotated id="d" title="Change" question="What changed?" source="src_after" before="src_before" %}\nOne.\n{% /annotated %}\n\n${long('src_before', md)}\n${long('src_after', [...md, 'More.'])}`));
    expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const text = projectText(bundle.parsed);
    expect(text).toContain('````diff\n # Title\n \n ```ts\n const x = 1;\n ```\n+More.\n````');
    // The source fences are longer too, and every ID line after them is outside a fence.
    let open: string | undefined;
    for (const line of text.split('\n')) {
      const fence = /^(`{3,})/.exec(line)?.[1];
      if (fence && (open === undefined || (fence.length >= open.length && line.trim() === fence))) open = open === undefined ? fence : undefined;
      else if (line.startsWith('<!-- vs:target')) expect(open, line).toBeUndefined();
    }
    expect(open).toBeUndefined();
  });
});

describe('phase 6a review fixes', () => {
  it('time traces reject a dependent event before its prerequisite, but allow equal recorded times', async () => {
    const trace = (time: number) => doc(`{% trace id="log" scale="time" timeUnit="ms" title="Log" question="When?" %}\n{% event id="a" label="Start" kind="compute" time=90 duration=20 /%}\n{% event id="b" label="Dependent" kind="compute" time=${time} after=["a"] /%}\n{% /trace %}`);
    const errors = load(trace(5)).diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toMatchObject([{ code: 'E_SEMANTIC', targetId: 'b', message: 'event b: `time` precedes its `after` prerequisite a' }]);
    expect(found(trace(90), 'error')).toEqual([]);
    // `after` orders occurrences, not the completion of the preceding duration.
    expect(found(trace(95), 'error')).toEqual([]);
    const page = await html(trace(90));
    expect(page).toContain('Event times in ms; vertical position shows order layer.');
    expect(page).toContain('>Order layer</text>');
    expect(page).not.toContain('Time scale in ms.');
  });

  it('C6: on a time scale, events in one slot stack in time order', async () => {
    const trace = `{% trace id="log" scale="time" timeUnit="ms" title="Log" question="When?" %}\nTwo lines.\n\n{% event id="ob_late" label="Late line" kind="observation" time=90 evidence=["src_log"] /%}\n{% event id="ob_early" label="Early line" kind="observation" time=5 evidence=["src_log"] /%}\n{% /trace %}\n\n${source('src_log', ['a'])}`;
    const page = await html(doc(trace));
    // The top of the box of an event: the first `y` inside its instance.
    const y = (id: string) => Number(new RegExp(`id="v-log\\.${id}"[^>]*>[\\s\\S]*? y="([\\d.]+)"`).exec(page)![1]);
    expect(y('ob_early')).toBeLessThan(y('ob_late'));
  });

  it('C9: a note needs a body; a self-check needs an answer', () => {
    expect(found(doc('{% note id="nt" kind="limit" %}\n{% /note %}'), 'error')).toEqual(['E_SYNTAX']);
    expect(found(doc('{% note id="nt" kind="limit" /%}'), 'error')).toEqual(['E_SYNTAX']);
    expect(found(doc('{% self-check id="ck" question="What ends the wait?" /%}'), 'error')).toEqual(['E_SYNTAX']);
    expect(found(doc('{% self-check id="ck" question="What ends the wait?" %}\nA take frees a slot.\n{% /self-check %}'), 'error')).toEqual([]);
  });

  it('C10: a step cannot name a detail, which the figure does not draw', () => {
    const map = MAP('{% detail id="dt" label="More" %}\nMore text.\n{% /detail %}\n\n{% steps id="walk" %}\n{% step id="wk" label="Look" targets=["dt"] %}\nThis deliberately names hidden detail.\n{% /step %}\n{% step id="wk_ok" label="Look here" targets=["n_api", "e_enqueue"] %}\nThese drawn parts form the write boundary.\n{% /step %}\n{% /steps %}');
    expect(load(doc(map)).diagnostics.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual(['step wk: `targets` names detail dt, which the figure does not draw; name a drawn part']);
  });

  it('S4: a number prints in plain decimal form, or as the authored display text', async () => {
    expect(plainNumber(1e21)).toBe('1000000000000000000000');
    expect(plainNumber(1.5e22)).toBe('15000000000000000000000');
    expect(plainNumber(1e-7)).toBe('0.0000001');
    expect(plainNumber(-2.5e-8)).toBe('-0.000000025');
    expect(plainNumber(0.5)).toBe('0.5');
    expect(withUnit(1e21, 'req/s')).toBe('1000000000000000000000 req/s');
    expect(withUnit(0.5, 'ms', '0.50')).toBe('0.50 ms');
    const measure = `{% measure id="m" title="Wait" question="How long?" unit="ms" %}\nOne run.\n\n{% reading id="rd" label="Before" value=0.5 display="0.50" valueStatus="measured" evidence=["src_x"] /%}\n{% /measure %}\n\n${source('src_x', ['x'])}`;
    const page = await html(doc(measure));
    expect(page).toContain('<td class="vs-reading-value">0.50 ms</td>');
    expect(page).not.toContain('0.5 ms');
    expect(projectText(load(doc(measure)).parsed)).toContain('| 0.50 ms |');
  });
});

describe('review prompts', () => {
  const codes = (text: string) => reviewDocument(load(text)).map((d) => [d.code, d.targetId]);

  it('W_WALKTHROUGH_VALUE: warns once for a small figure or a part-by-part tour', () => {
    const small = MAP(`{% steps id="walk" %}
{% step id="wk_1" label="Write boundary" targets=["n_api", "e_enqueue"] %}
The API owns the write boundary.
{% /step %}
{% step id="wk_2" label="Durable handoff" targets=["e_enqueue", "n_queue"] %}
The edge and queue make the handoff durable.
{% /step %}
{% /steps %}`);
    expect(codes(doc(small)).filter(([c]) => c === 'W_WALKTHROUGH_VALUE')).toEqual([['W_WALKTHROUGH_VALUE', 'walk']]);

    const map = (steps: string) => `{% graph id="g" mode="architecture" title="Order boundary" question="Where is work durable?" %}
Every arrow names a data dependency.

{% node id="n_client" label="Client" role="external" /%}
{% node id="n_api" label="API" role="interface" /%}
{% node id="n_queue" label="Queue" role="storage" /%}
{% edge id="e_submit" from="n_client" to="n_api" kind="call" label="submits order" /%}
{% edge id="e_enqueue" from="n_api" to="n_queue" kind="data" label="stores request" /%}
${steps}
{% /graph %}`;
    const tour = `{% steps id="walk" %}
{% step id="wk_1" label="Client" targets=["n_client"] %}
The client begins outside the boundary.
{% /step %}
{% step id="wk_2" label="API" targets=["n_api"] %}
The API accepts the request.
{% /step %}
{% step id="wk_3" label="Queue" targets=["n_queue"] %}
The queue stores the request.
{% /step %}
{% /steps %}`;
    expect(codes(doc(map(tour))).filter(([c]) => c === 'W_WALKTHROUGH_VALUE')).toEqual([['W_WALKTHROUGH_VALUE', 'walk']]);

    const explanation = `{% steps id="walk" %}
{% step id="wk_1" label="Contract boundary" targets=["n_client", "e_submit", "n_api"] %}
The client depends only on the API contract.
{% /step %}
{% step id="wk_2" label="Durability boundary" targets=["n_api", "e_enqueue", "n_queue"] %}
The request becomes durable before later work begins.
{% /step %}
{% /steps %}`;
    expect(codes(doc(map(explanation))).filter(([c]) => c === 'W_WALKTHROUGH_VALUE')).toEqual([]);
  });

  it('W_NOTE_DENSITY: in a decision record the assumption notes do not count (phase 6a review C12)', () => {
    const note = (i: number, kind: string) => `{% note id="nt_${i}" kind="${kind}" %}\nOne ${kind}.\n{% /note %}\n`;
    const body = `<!-- vs:id p_short -->\nA short record.\n\n${note(1, 'assumption')}\n${note(2, 'assumption')}\n${note(3, 'assumption')}`;
    expect(codes(doc(body, 'decision')).filter(([c]) => c === 'W_NOTE_DENSITY')).toEqual([]);
    expect(codes(doc(`${body}\n${note(4, 'limit')}\n${note(5, 'warning')}`, 'decision')).filter(([c]) => c === 'W_NOTE_DENSITY')).toEqual([['W_NOTE_DENSITY', 'nt_5']]);
    expect(codes(doc(body, 'reference')).filter(([c]) => c === 'W_NOTE_DENSITY')).toEqual([['W_NOTE_DENSITY', 'nt_2']]);
  });

  it('W_EVIDENCE_GAP: a reading or an observation with no evidence', () => {
    const measure = `{% measure id="m" title="Wait" question="How long?" unit="ms" %}\nOne run.\n\n{% reading id="rd" label="Before" value=800 valueStatus="measured" /%}\n{% /measure %}`;
    expect(codes(doc(measure))).toContainEqual(['W_EVIDENCE_GAP', 'rd']);
    const trace = `{% trace id="log" scale="time" timeUnit="s" title="Log" question="When?" %}\nOne log.\n\n{% event id="ob" label="Pool full" kind="observation" time=3 /%}\n{% /trace %}`;
    expect(codes(doc(trace))).toContainEqual(['W_EVIDENCE_GAP', 'ob']);
    expect(reviewDocument(load(readFileSync(FIXTURE, 'utf8'))).filter((d) => d.code === 'W_EVIDENCE_GAP')).toEqual([]);
  });

  it('W_NOTE_DENSITY: more than one note for each 300 main-path words; one note is always allowed', () => {
    const note = (i: number) => `{% note id="nt_${i}" kind="limit" %}\nOne limit.\n{% /note %}\n`;
    const words = (n: number) => `<!-- vs:id p_long -->\n${Array.from({ length: n }, () => 'word').join(' ')}.\n`;
    expect(codes(doc(`${words(50)}\n${note(1)}`)).filter(([c]) => c === 'W_NOTE_DENSITY')).toEqual([]);
    expect(codes(doc(`${words(50)}\n${note(1)}\n${note(2)}`)).filter(([c]) => c === 'W_NOTE_DENSITY')).toEqual([['W_NOTE_DENSITY', 'nt_2']]);
    expect(codes(doc(`${words(600)}\n${note(1)}\n${note(2)}`)).filter(([c]) => c === 'W_NOTE_DENSITY')).toEqual([]);
  });

  it('W_SELF_CHECK: a self-check outside kind: teaching', () => {
    const check = '{% self-check id="ck" question="What ends the wait?" %}\nA take frees a slot.\n{% /self-check %}';
    expect(codes(doc(check, 'teaching')).filter(([c]) => c === 'W_SELF_CHECK')).toEqual([]);
    expect(codes(doc(check, 'reference')).filter(([c]) => c === 'W_SELF_CHECK')).toEqual([['W_SELF_CHECK', 'ck']]);
  });

  it('W_DETAIL_VALUE: warns once per figure when sources-only drill-downs dominate useful detail', () => {
    const text = doc(`{% compare id="cmp" title="Queues" question="Which queue?" %}
{% option id="opt" label="Bounded" /%}
{% criterion id="c_a" label="Capacity" /%}
{% criterion id="c_b" label="Throughput" /%}
{% criterion id="c_c" label="Failure" /%}
{% cell id="a" option="opt" criterion="c_a" value="100" evidence=["src_x"] /%}
{% cell id="b" option="opt" criterion="c_b" value="40" evidence=["src_x"] /%}
{% cell id="c" option="opt" criterion="c_c" value="waits" %}
Producers block instead of consuming memory without bound.
{% /cell %}
{% /compare %}

${source('src_x', ['limit=100'])}`);
    expect(codes(text).filter(([code]) => code === 'W_DETAIL_VALUE')).toEqual([['W_DETAIL_VALUE', 'cmp']]);
  });
});

describe('catalogue (IMPROVEMENTS.md §14.10)', () => {
  it('the new guides come after `annotated`, and `mermaid` stays last', () => {
    const names = PATTERNS.map((p) => p.name);
    expect(names.slice(names.indexOf('annotated'))).toEqual(['annotated', 'measure', 'tree', 'steps', 'note', 'self-check', 'decision', 'mermaid']);
  });
});
