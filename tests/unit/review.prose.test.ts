// The prose, shape, and term review prompts (IMPROVEMENTS.md §6.2, §11.3,
// §12.4, §13.6): each prompt fires on a small bad document and stays quiet on
// its good pair. Every prompt is a warning that starts with "review:", and its
// message gives the measured value and the budget. The prose guide
// (references/prose.md) is a contract too: each `visser-invalid W_CODE`
// snippet gets its prompt, and each `visser-valid` snippet gets none.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { reviewDocument } from '../../packages/core/src/review/index.ts';
import type { Diagnostic } from '../../packages/core/src/types.ts';

const root = new URL('../..', import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), 'visser-review-prose-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

type Options = { kind?: string; reader?: string[] };

function source(body: string, opts: Options = {}): string {
  return [
    '---',
    'format: visser/1',
    'docId: 4f8ac70c-7e14-4f06-9865-e194f57c7239',
    'title: Review prompt fixture',
    `kind: ${opts.kind ?? 'reference'}`,
    'capturedAt: 2026-09-27T00:00:00Z',
    ...(opts.reader ?? []),
    'visibility: private',
    '---',
    '',
    '<!-- vs:id overview -->',
    '# Review prompt fixture',
    '',
    body,
  ].join('\n');
}

function review(body: string, opts: Options = {}): Diagnostic[] {
  const dir = mkdtempSync(join(work, 'd-'));
  writeFileSync(join(dir, 'index.md'), source(body, opts));
  const bundle = loadBundle(join(dir, 'index.md'));
  const errors = bundle.diagnostics.filter((d) => d.severity === 'error');
  expect(errors, JSON.stringify(errors)).toEqual([]);
  const prompts = reviewDocument(bundle);
  for (const d of prompts) {
    expect(d.severity).toBe('warning');
    expect(d.message.startsWith('review: ')).toBe(true);
  }
  return prompts;
}

const only = (prompts: Diagnostic[], code: string) => prompts.filter((d) => d.code === code);
const para = (id: string, text: string) => `<!-- vs:id ${id} -->\n${text}\n`;
const filler = (n: number, word = 'alpha') => Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ');
/** `n` words as short sentences of 10 words each. */
const prose = (n: number) => {
  const out: string[] = [];
  for (let i = 0; i < n; i += 10) out.push(`${filler(Math.min(10, n - i), `w${i}x`)}.`);
  return out.join(' ');
};
const figure = (id: string) =>
  `{% graph id="${id}" mode="state" title="States of one job" question="Which moves are allowed?" %}\n` +
  `{% state id="${id}_a" label="Queued" initial=true /%}\n{% state id="${id}_b" label="Done" terminal=true /%}\n` +
  `{% transition id="${id}_t" from="${id}_a" to="${id}_b" event="finish" label="finishes" /%}\n{% /graph %}\n`;

describe('@R16 prose prompts (IMPROVEMENTS.md §11.3)', () => {
  it('W_SENTENCE_LENGTH: a sentence over 25 words in prose or a part body, with the count and the limit', () => {
    const long = `${filler(29)} end.`;
    const prompts = only(review(para('p_long', long) + '\n' + para('p_short', 'The worker takes one item. It writes the result.')), 'W_SENTENCE_LENGTH');
    expect(prompts.map((d) => d.targetId)).toEqual(['p_long']);
    expect(prompts[0]!.message).toContain('30 words');
    expect(prompts[0]!.message).toContain('the limit is 25');
    const body = `{% graph id="g" mode="architecture" title="Parts" question="Which part stores?" %}\n{% node id="n_a" label="Store" role="storage" %}\n${long}\n{% /node %}\n{% /graph %}\n`;
    expect(only(review(body), 'W_SENTENCE_LENGTH').map((d) => d.targetId)).toEqual(['n_a']);
    expect(only(review(para('p_ok', `${filler(24)} end.`)), 'W_SENTENCE_LENGTH')).toEqual([]);
  });

  it('W_PASSIVE: a form of "be" and a past participle, with an allow-list and quotes excluded', () => {
    const prompts = only(review(para('p_bad', 'The charge is retried by the worker. The file was written later.')), 'W_PASSIVE');
    expect(prompts.map((d) => d.targetId)).toEqual(['p_bad']);
    expect(prompts[0]!.message).toContain('2 passive phrases');
    expect(prompts[0]!.message).toContain('"is retried"');
    expect(prompts[0]!.message).toContain('the budget is 0');
    const good = para('p_active', 'The worker retries the charge.') + '\n' + para('p_allowed', 'The order is stored in one table. The key is based on the order ID.') +
      '\n' + para('p_adjective', 'The body is unchanged.') + '\n' + para('p_quote', 'The log says "the charge is retried" at each attempt.');
    expect(only(review(good), 'W_PASSIVE')).toEqual([]);
  });

  it('W_PASSIVE probes (skill-prompts-review-1 F2, F19): a hyphenated adjective, a stative word, and a state name are not passive', () => {
    expect(only(review(para('p_hyphen', 'The cache file is read-only. The feature is built-in.')), 'W_PASSIVE')).toEqual([]);
    expect(only(review(para('p_stative', 'The retry is enabled. The queue is bounded, and the result is cached.')), 'W_PASSIVE')).toEqual([]);
    const retired = `{% graph id="life" mode="state" title="States of one target" question="Which moves does the system allow?" %}\n` +
      `{% state id="s_live" label="Live" initial=true /%}\n{% state id="s_retired" label="Retired" terminal=true /%}\n` +
      `{% transition id="t_retire" from="s_live" to="s_retired" event="retire" label="retires" /%}\n{% /graph %}\n`;
    expect(only(review(retired + '\n' + para('p_state', 'When a target is retired, its ID stays reserved.')), 'W_PASSIVE')).toEqual([]);
    // Without the state, the same sentence still gets the prompt; a participle with no hyphen still does too.
    expect(only(review(para('p_state', 'When a target is retired, its ID stays reserved.')), 'W_PASSIVE')).toHaveLength(1);
    const read = only(review(para('p_read', 'The file is read by the worker.')), 'W_PASSIVE');
    expect(read).toHaveLength(1);
    expect(read[0]!.message).toContain('"is read"');
  });

  it('W_CONTRACTION: an apostrophe contraction in prose or a label; a possessive is not one', () => {
    const prompts = only(review(para('p_bad', "The worker doesn't wait, and it's fast.")), 'W_CONTRACTION');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.message).toContain("2 contractions (doesn't, it's)");
    expect(prompts[0]!.message).toContain('the budget is 0');
    const label = `{% graph id="g" mode="architecture" title="Parts" question="Which part waits?" %}\n{% node id="n_a" label="Can't wait" role="process" /%}\n{% /graph %}\n`;
    expect(only(review(label), 'W_CONTRACTION').map((d) => d.targetId)).toEqual(['n_a']);
    expect(only(review(para('p_ok', "The worker's queue holds the packet's owner.")), 'W_CONTRACTION')).toEqual([]);
  });

  it('W_VAGUE_QUANTITY: "some", "several", "many", "a few", "various"; a compound such as one-to-many is not one', () => {
    const prompts = only(review(para('p_bad', 'Several workers take many items.')), 'W_VAGUE_QUANTITY');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.message).toContain('2 vague quantities (several, many)');
    expect(prompts[0]!.message).toContain('the budget is 0');
    expect(only(review(para('p_ok', 'Four workers take items. The relation is one-to-many.')), 'W_VAGUE_QUANTITY')).toEqual([]);
  });

  it('W_VAGUE_QUANTITY probes (skill-prompts-review-1 F3): "how many" asks for a number, and "as many X as Y" compares', () => {
    expect(only(review(para('h_many', '## How many reads reach the database')), 'W_VAGUE_QUANTITY')).toEqual([]);
    expect(only(review(para('p_as', 'The pool starts as many workers as the machine has cores.')), 'W_VAGUE_QUANTITY')).toEqual([]);
    expect(only(review(para('p_many', 'The pool starts many workers.')), 'W_VAGUE_QUANTITY')).toHaveLength(1);
  });

  it('W_SYNONYM: a part with an entity and a different label', () => {
    const map = `{% graph id="g" mode="architecture" title="Parts" question="Which part answers?" %}\n{% node id="n_api" label="Order API" role="interface" /%}\n{% /graph %}\n`;
    const trace = (label: string) =>
      `{% trace id="t" title="One order" question="When does the API reply?" %}\n{% actor id="a_api" ${label}entity="n_api" /%}\n` +
      `{% event id="ev" actor="a_api" label="Replies" kind="return" /%}\n{% /trace %}\n`;
    const prompts = only(review(map + '\n' + trace('label="Front end" ')), 'W_SYNONYM');
    expect(prompts.map((d) => d.targetId)).toEqual(['a_api']);
    expect(prompts[0]!.message).toContain('"Order API"');
    expect(prompts[0]!.message).toContain('2 labels for one entity, and the budget is 1');
    expect(only(review(map + '\n' + trace('label="Order API" ')), 'W_SYNONYM')).toEqual([]);
    expect(only(review(map + '\n' + trace('')), 'W_SYNONYM')).toEqual([]);
  });
});

describe('@R16 shape prompts (IMPROVEMENTS.md §12.4, §6.2)', () => {
  const must = ['reader:', '  mustUnderstand: [where the wait happens, what ends the wait]'];

  it('W_READER: no mustUnderstand in a teaching, architecture, or root-cause document', () => {
    for (const kind of ['teaching', 'architecture', 'root-cause']) {
      const prompts = only(review(para('p', 'The worker takes one item.'), { kind }), 'W_READER');
      expect(prompts, kind).toHaveLength(1);
      expect(prompts[0]!.message).toContain('0 items');
      expect(prompts[0]!.message).toContain('2 to 5');
      expect(prompts[0]!.startLine).toBe(1);
    }
    expect(only(review(para('p', 'The worker takes one item.'), { kind: 'teaching', reader: ['reader:', '  mustUnderstand: []'] }), 'W_READER')).toHaveLength(1);
    expect(only(review(para('p', 'The worker takes one item.'), { kind: 'teaching', reader: must }), 'W_READER')).toEqual([]);
    expect(only(review(para('p', 'The worker takes one item.'), { kind: 'plan' }), 'W_READER')).toEqual([]);
  });

  it('W_LENGTH: main-path words over the budget for the kind; details and part bodies are free', () => {
    const over = para('p_long', prose(700));
    const prompts = only(review(over, { kind: 'plan' }), 'W_LENGTH');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.message).toMatch(/the main path has 7\d\d words; the budget for a plan document is 600/);
    expect(only(review(over, { kind: 'reference' }), 'W_LENGTH')).toEqual([]);
    expect(only(review(over, { kind: 'teaching', reader: must }), 'W_LENGTH')).toEqual([]);
    const inDetail = para('p_short', 'The worker takes one item.') + `\n{% detail id="d_depth" label="More depth" %}\n${prose(700)}\n{% /detail %}\n`;
    expect(only(review(inDetail, { kind: 'plan' }), 'W_LENGTH')).toEqual([]);
  });

  it('W_FIGURE_COUNT: figures over the budget for the kind', () => {
    const three = [figure('fa'), figure('fb'), figure('fc')].join('\n');
    const prompts = only(review(three, { kind: 'plan' }), 'W_FIGURE_COUNT');
    expect(prompts.map((d) => d.targetId)).toEqual(['fc']);
    expect(prompts[0]!.message).toContain('3 figures; the budget for a plan document is 2');
    expect(only(review([figure('fa'), figure('fb')].join('\n'), { kind: 'plan' }), 'W_FIGURE_COUNT')).toEqual([]);
  });

  it('W_LATE_FIGURE: more than 120 main-path words before the first figure', () => {
    const prompts = only(review(para('p_lead', prose(130)) + '\n' + figure('fa')), 'W_LATE_FIGURE');
    expect(prompts.map((d) => d.targetId)).toEqual(['fa']);
    expect(prompts[0]!.message).toMatch(/1\d\d main-path words come before the first figure, fa; the budget is 120/);
    expect(only(review(para('p_lead', prose(90)) + '\n' + figure('fa')), 'W_LATE_FIGURE')).toEqual([]);
    expect(only(review(para('p_lead', prose(200))), 'W_LATE_FIGURE')).toEqual([]);
  });

  it('W_LABEL_LENGTH: a node label over 4 words or an edge label over 5', () => {
    const graph = (node: string, edge: string) =>
      `{% graph id="g" mode="architecture" title="Parts" question="Which part stores?" %}\n{% node id="n_a" label="${node}" role="process" /%}\n` +
      `{% node id="n_b" label="Store" role="storage" /%}\n{% edge id="e_ab" from="n_a" to="n_b" kind="call" label="${edge}" /%}\n{% /graph %}\n`;
    const prompts = only(review(graph('The one charge worker process', 'writes the order row to disk')), 'W_LABEL_LENGTH');
    expect(prompts.map((d) => d.targetId)).toEqual(['g']);
    expect(prompts[0]!.message).toContain('n_a (5 words, limit 4)');
    expect(prompts[0]!.message).toContain('e_ab (6 words, limit 5)');
    expect(only(review(graph('The charge worker process', 'writes the order to disk')), 'W_LABEL_LENGTH')).toEqual([]);
  });

  it('W_DUPLICATE: an 8-word run in a part body and in a paragraph', () => {
    const body = 'The insert and the enqueue share one transaction in this design.';
    const graph = `{% graph id="g" mode="architecture" title="Parts" question="Which part stores?" %}\n{% node id="n_a" label="Store" role="storage" %}\n${body}\n{% /node %}\n{% /graph %}\n`;
    const prompts = only(review(graph + '\n' + para('p_copy', 'Note: the insert and the enqueue share one transaction in this design.')), 'W_DUPLICATE');
    expect(prompts.map((d) => d.targetId)).toEqual(['p_copy']);
    expect(prompts[0]!.message).toContain('repeats 11 words of the body of n_a');
    expect(prompts[0]!.message).toContain('the limit is 7');
    expect(only(review(graph + '\n' + para('p_ok', 'The insert and the enqueue share one commit.')), 'W_DUPLICATE')).toEqual([]);
  });

  it('W_DUPLICATE probe (skill-prompts-review-1 F5): two different lists of code spans are not a copy', () => {
    const flags = ['--a', '--b', '--c', '--d', '--e', '--f', '--g', '--h'].map((f) => `\`${f}\``).join(', ');
    const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts', 'h.ts'].map((f) => `\`${f}\``).join(', ');
    const graph = `{% graph id="g" mode="architecture" title="Parts" question="Which service reads flags?" %}\n{% node id="n_cli" label="CLI" role="process" %}\nThe CLI reads ${flags}.\n{% /node %}\n{% /graph %}\n`;
    expect(only(review(graph + '\n' + para('p_files', `The build reads ${files}.`)), 'W_DUPLICATE')).toEqual([]);
  });

  it('W_HEADING: an h2 under 3 words; an h3 is free; a reference document may use topic headings (F20)', () => {
    const body = para('h_topic', '## Overview') + '\n' + para('h_answer', '## Where an ID comes from') + '\n' + para('h_small', '### Limits');
    const prompts = only(review(body, { kind: 'plan' }), 'W_HEADING');
    expect(prompts.map((d) => d.targetId)).toEqual(['h_topic']);
    expect(prompts[0]!.message).toContain('has 1 word; the minimum is 3');
    expect(only(review(para('h_commands', '## Commands'), { kind: 'reference' }), 'W_HEADING')).toEqual([]);
  });

  it('W_MERMAID: one prompt per Mermaid figure, naming the native component by the first line of the fence', () => {
    const mermaid = (id: string, fence: string) => `{% mermaid id="${id}" title="A figure" question="What does it show?" %}\n\`\`\`mermaid\n${fence}\n\`\`\`\n{% /mermaid %}\n`;
    const cases: Array<[string, string]> = [
      ['flowchart LR\n  a_node[A] -->|calls| b_node[B]', '`architecture`'],
      ['sequenceDiagram\n  participant Alice\n  participant Bob\n  Alice->>Bob: hello', '`trace`'],
      ['stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy', '`state`'],
      // An ER or a class diagram is a `domain` (IMPROVEMENTS.md §5.6, §6.2).
      ['erDiagram\n  INVOICE ||--|{ LINE : contains', '`domain`'],
      ['classDiagram\n  class Queue', '`domain`'],
      // A Gantt chart is a `plan`; each task names the source of its `due` date in `evidence` (IMPROVEMENTS.md §4.4).
      ['gantt\n  title Plan\n  section One\n  Task A :a1, 2026-01-01, 3d', '`plan`, with the source of each `due` date in `evidence`'],
      ['pie\n  "Yes" : 3\n  "No" : 1', 'no native component'],
    ];
    for (const [fence, names] of cases) {
      const prompts = only(review(mermaid('fig', fence)), 'W_MERMAID');
      expect(prompts.map((d) => d.targetId), fence).toEqual(['fig']);
      expect(prompts[0]!.message, fence).toContain(names);
      expect(prompts[0]!.message).toContain('1 Mermaid figure, and the budget is 0');
    }
    expect(only(review(figure('fa')), 'W_MERMAID')).toEqual([]);
  });
});

describe('@R16 term prompts (IMPROVEMENTS.md §13.6, §11.3)', () => {
  const def = (id: string, term: string) => `{% definition id="${id}" term="${term}" %}\nA ${term} is one thing that the reader must know.\n{% /definition %}\n`;

  it('W_TERM_UNUSED: a definition whose term the main path never uses', () => {
    const prompts = only(review(def('def_wait', 'backpressure') + '\n' + para('p', 'The worker takes one item.')), 'W_TERM_UNUSED');
    expect(prompts.map((d) => d.targetId)).toEqual(['def_wait']);
    expect(prompts[0]!.message).toContain('0 uses on the main path; the minimum is 1');
    expect(only(review(def('def_wait', 'backpressure') + '\n' + para('p', 'The queue applies backpressure to producers.')), 'W_TERM_UNUSED')).toEqual([]);
    expect(only(review(def('def_wait', 'backpressure') + '\n' + para('p', 'The {% term ref="def_wait" %}push back{% /term %} slows producers.')), 'W_TERM_UNUSED')).toEqual([]);
    // The build links a plural only through `aliases` (§13.3), so a plural use alone is not a use (phase-2 review R3).
    const plural = only(review(def('def_target', 'target') + '\n' + para('p', 'Each of the targets has an ID.')), 'W_TERM_UNUSED');
    expect(plural.map((d) => d.targetId)).toEqual(['def_target']);
    expect(plural[0]!.message).toContain('add aliases=["targets"]');
    const onlyInDetail = def('def_wait', 'backpressure') + '\n' + para('p', 'The worker takes one item.') + '\n{% detail id="d_x" label="More" %}\nThe queue applies backpressure.\n{% /detail %}\n';
    expect(only(review(onlyInDetail), 'W_TERM_UNUSED')).toHaveLength(1);
  });

  it('W_TERM_COLLISION: two definitions of one term, or a term that names a component the document uses', () => {
    const twice = def('def_a', 'target') + '\n' + def('def_b', 'Targets') + '\n' + para('p', 'A target has an ID.');
    const prompts = only(review(twice), 'W_TERM_COLLISION');
    expect(prompts.map((d) => d.targetId)).toEqual(['def_b']);
    expect(prompts[0]!.message).toContain('2 definitions share one term, and the budget is 1');
    const component = def('def_state', 'state') + '\n' + para('p', 'A state is one step.') + '\n' + figure('fa');
    const hit = only(review(component), 'W_TERM_COLLISION');
    expect(hit.map((d) => d.targetId)).toEqual(['def_state']);
    expect(hit[0]!.message).toContain('`state`');
    expect(only(review(def('def_a', 'target') + '\n' + def('def_b', 'packet') + '\n' + para('p', 'A target is in a packet.')), 'W_TERM_COLLISION')).toEqual([]);
  });

  it('W_JARGON: an acronym used 2 or more times, or a reader.new term used 2 or more times, with no definition', () => {
    const prompts = only(review(para('p_one', 'The BQW grows.') + '\n' + para('p_two', 'A long BQW slows producers.')), 'W_JARGON');
    expect(prompts.map((d) => d.targetId)).toEqual(['p_one']);
    expect(prompts[0]!.message).toContain('BQW appears 2 times');
    expect(prompts[0]!.message).toContain('the budget is 1 use without a definition');
    expect(only(review(para('p_one', 'The BQW grows.')), 'W_JARGON')).toEqual([]);
    const reader = ['reader:', '  new: [spill file]'];
    const newTerm = only(review(para('p_one', 'The spill file grows.') + '\n' + para('p_two', 'Each spill file holds rows.'), { reader }), 'W_JARGON');
    expect(newTerm.map((d) => d.targetId)).toEqual(['p_one']);
    expect(newTerm[0]!.message).toContain('"spill file" is in reader.new and appears 2 times');
    const defined = def('def_spill', 'spill file') + '\n' + para('p_one', 'The spill file grows.') + '\n' + para('p_two', 'Each spill file holds rows.');
    expect(only(review(defined, { reader }), 'W_JARGON')).toEqual([]);
  });
});

describe('@R16 prose guide snippets (references/prose.md)', () => {
  const guide = readFileSync(join(root, 'skills/visser-visual-explain/references/prose.md'), 'utf8');
  const snippets: Array<{ line: number; info: string[]; body: string }> = [];
  const lines = guide.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^(`{3,})(.*)$/.exec(lines[i]!);
    if (!open) continue;
    const close = lines.findIndex((l, j) => j > i && l === open[1]);
    snippets.push({ line: i + 1, info: open[2]!.trim().split(/\s+/), body: lines.slice(i + 1, close).join('\n') + '\n' });
    i = close;
  }

  it('has a valid and an invalid snippet for each of the 10 rules', () => {
    const sections = guide.split(/^## \d+\. /m).slice(1);
    expect(sections).toHaveLength(10);
    for (const section of sections) {
      expect(section, section.slice(0, 40)).toContain('```markdown visser-valid');
      expect(section, section.slice(0, 40)).toMatch(/```markdown (visser-invalid W_[A-Z_]+|ste-invalid)/);
    }
  });

  for (const s of snippets) {
    const kind = s.info[1];
    if (kind === 'visser-valid') {
      it(`line ${s.line}: a valid snippet gets no review prompt`, () => {
        expect(review(s.body).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
      });
    } else if (kind === 'visser-invalid') {
      it(`line ${s.line}: an invalid snippet gets ${s.info[2]}`, () => {
        expect(review(s.body).map((d) => d.code)).toContain(s.info[2]);
      });
    } else if (kind === 'ste-invalid') {
      it(`line ${s.line}: an ste-invalid snippet is a valid document`, () => {
        review(s.body);
      });
    }
  }
});

describe('@R16 the examples and the authored explanations with the new prompts', () => {
  it('each example and explanation still checks, and gets only warnings from --review', () => {
    const docs = [
      ...readdirSync(join(root, 'examples')).map((n) => join(root, 'examples', n, 'index.md')),
      ...readdirSync(join(root, 'docs/explanations')).map((n) => join(root, 'docs/explanations', n, 'index.md')),
    ];
    let reviewed = 0;
    for (const path of docs) {
      let bundle;
      try {
        bundle = loadBundle(path);
      } catch {
        continue; // not a document folder (for example github-pages)
      }
      expect(bundle.diagnostics.filter((d) => d.severity === 'error'), path).toEqual([]);
      for (const d of reviewDocument(bundle)) expect(d.severity).toBe('warning');
      reviewed++;
    }
    expect(reviewed).toBeGreaterThanOrEqual(10);
  });

  // The prose and shape prompts that each example gets (skill-prompts-review-1, F17):
  // a new false positive, or a lost true positive, changes this table. The
  // term and evidence prompts (index.ts, terms.ts) are pinned in review.test.ts
  // and in the term tests above.
  const PINNED: Record<string, Record<string, number>> = {
    'bounded-queue': { W_LABEL_LENGTH: 2, W_PASSIVE: 2 },
    'cache-stampede': { W_LABEL_LENGTH: 1, W_PASSIVE: 1, W_VAGUE_QUANTITY: 1 },
    'connection-lifecycle': { W_PASSIVE: 1 },
    // The before-and-after figure of revision 1.27 comes early, so deadline-retry has no W_LATE_FIGURE.
    'deadline-retry': { W_VAGUE_QUANTITY: 1 },
    'domain-orders': {},
    'image-pipeline': { W_SENTENCE_LENGTH: 1 },
    'mermaid-class': { W_MERMAID: 1 },
    'mermaid-er': { W_MERMAID: 1, W_PASSIVE: 2, W_SENTENCE_LENGTH: 1 },
    'mermaid-flowchart': { W_MERMAID: 1, W_PASSIVE: 1, W_SENTENCE_LENGTH: 1 },
    'mermaid-sequence': { W_MERMAID: 1, W_PASSIVE: 1, W_SENTENCE_LENGTH: 1, W_VAGUE_QUANTITY: 1 },
    'mermaid-state': { W_MERMAID: 1, W_PASSIVE: 4 },
    'order-intake': { W_LABEL_LENGTH: 1, W_PASSIVE: 2 },
    'queue-designs': {},
    'schema-migration': { W_LABEL_LENGTH: 1, W_PASSIVE: 2 },
  };
  const PROSE_AND_SHAPE = new Set(['W_SENTENCE_LENGTH', 'W_PASSIVE', 'W_CONTRACTION', 'W_VAGUE_QUANTITY', 'W_SYNONYM', 'W_READER', 'W_LENGTH',
    'W_FIGURE_COUNT', 'W_LATE_FIGURE', 'W_LABEL_LENGTH', 'W_DUPLICATE', 'W_HEADING', 'W_MERMAID']);

  it('each example gets exactly its pinned prose and shape prompts', () => {
    const found: Record<string, Record<string, number>> = {};
    for (const name of readdirSync(join(root, 'examples')).sort()) {
      let bundle;
      try {
        bundle = loadBundle(join(root, 'examples', name, 'index.md'));
      } catch {
        continue; // not a document folder (for example github-pages)
      }
      const counts: Record<string, number> = {};
      for (const d of reviewDocument(bundle)) if (PROSE_AND_SHAPE.has(d.code)) counts[d.code] = (counts[d.code] ?? 0) + 1;
      found[name] = counts;
    }
    expect(found).toEqual(PINNED);
  });

  it('each Mermaid example gets exactly one W_MERMAID prompt', () => {
    for (const name of readdirSync(join(root, 'examples')).filter((n) => n.startsWith('mermaid-'))) {
      const prompts = reviewDocument(loadBundle(join(root, 'examples', name, 'index.md')));
      expect(only(prompts, 'W_MERMAID'), name).toHaveLength(1);
    }
  });
});
