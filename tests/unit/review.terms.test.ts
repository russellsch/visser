// The term prompts read the `aliases` of a definition and respect `auto=false`
// (docs/IMPROVEMENTS.md §13.6). W_JARGON no longer reports a defined term that
// the author did not tag, because the build links every use (§13.3).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { reviewDocument } from '../../packages/core/src/review/index.ts';
import type { Diagnostic } from '../../packages/core/src/types.ts';

const work = mkdtempSync(join(tmpdir(), 'visser-review-terms-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function review(body: string): Diagnostic[] {
  const dir = mkdtempSync(join(work, 'd-'));
  writeFileSync(join(dir, 'index.md'), [
    '---', 'format: visser/1', 'docId: 4f8ac70c-7e14-4f06-9865-e194f57c7239', 'title: Term prompts', 'kind: reference',
    'capturedAt: 2026-09-27T00:00:00Z', 'visibility: private', '---', '', '<!-- vs:id overview -->', '# Term prompts', '', body,
  ].join('\n'));
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return reviewDocument(bundle);
}

const only = (list: Diagnostic[], code: string) => list.filter((d) => d.code === code);
const para = (id: string, text: string) => `<!-- vs:id ${id} -->\n${text}\n`;
const def = (id: string, term: string, extra = '') => `{% definition id="${id}" term="${term}"${extra} %}\nA ${term} is one thing that the reader must know.\n{% /definition %}\n`;

describe('@R16 term prompts with aliases and auto=false (IMPROVEMENTS.md §13.6)', () => {
  it('W_TERM_UNUSED counts a use of an alias', () => {
    const body = def('def_packet', 'reference packet', ' aliases=["packet"]') + '\n' + para('p', 'The agent sends the packet.');
    expect(only(review(body), 'W_TERM_UNUSED')).toEqual([]);
  });

  it('W_TERM_UNUSED counts only a use that the build links (phase-2 review R3)', () => {
    // A plural is linked only through `aliases`: the prompt says to add one.
    const plural = only(review(def('def_shard', 'shard') + '\n' + para('p', 'The store splits data into shards.')), 'W_TERM_UNUSED');
    expect(plural.map((d) => d.targetId)).toEqual(['def_shard']);
    expect(plural[0]!.message).toContain('the text uses "shards", which the build does not link; add aliases=["shards"]');
    expect(only(review(def('def_shard', 'shard', ' aliases=["shards"]') + '\n' + para('p', 'The store splits data into shards.')), 'W_TERM_UNUSED')).toEqual([]);
    // A heading, inline code, and link text are not linked, so they are not uses.
    const heading = def('def_widget', 'widget') + '\n<!-- vs:id h_w -->\n## The widget\n\n' + para('p', 'It draws `widget` and [a widget](https://example.com/).');
    const unused = only(review(heading), 'W_TERM_UNUSED');
    expect(unused.map((d) => d.targetId)).toEqual(['def_widget']);
    expect(unused[0]!.message).toContain('0 uses on the main path');
    // A part body and a drawn label are linked, so they are uses.
    const figure = def('def_widget', 'widget') + '\n{% graph id="g" mode="architecture" title="Map" question="What calls what?" %}\n'
      + '{% node id="n_a" role="process" label="Widget host" /%}\n{% node id="n_b" role="process" label="B" /%}\n'
      + '{% edge id="e_ab" from="n_a" to="n_b" kind="call" label="calls" /%}\n{% /graph %}\n';
    expect(only(review(figure), 'W_TERM_UNUSED')).toEqual([]);
  });

  it('W_TERM_UNUSED needs a term tag for a definition with auto=false', () => {
    const untagged = def('def_state', 'state', ' auto=false') + '\n' + para('p', 'The state changes.');
    const prompts = only(review(untagged), 'W_TERM_UNUSED');
    expect(prompts.map((d) => d.targetId)).toEqual(['def_state']);
    expect(prompts[0]!.message).toContain('auto=false and 0 {% term %} tags');
    const tagged = def('def_state', 'state', ' auto=false') + '\n' + para('p', 'The {% term ref="def_state" %}state{% /term %} changes.');
    expect(only(review(tagged), 'W_TERM_UNUSED')).toEqual([]);
  });

  it('W_TERM_COLLISION reads aliases, and skips a definition with auto=false', () => {
    const overlap = def('def_a', 'reference packet', ' aliases=["packet"]') + '\n' + def('def_b', 'packet') + '\n' + para('p', 'A reference packet is a packet.');
    const prompts = only(review(overlap), 'W_TERM_COLLISION');
    expect(prompts.map((d) => d.targetId)).toEqual(['def_b']);
    expect(prompts[0]!.message).toContain('set auto=false on one');
    const handTagged = def('def_a', 'reference packet', ' aliases=["packet"]') + '\n' + def('def_b', 'packet', ' auto=false') + '\n'
      + para('p', 'A reference packet is a {% term ref="def_b" %}packet{% /term %}.');
    expect(only(review(handTagged), 'W_TERM_COLLISION')).toEqual([]);
  });

  it('W_JARGON does not report a defined acronym that is never tagged by hand', () => {
    const body = def('def_bqw', 'BQW') + '\n' + para('p_one', 'The BQW grows.') + '\n' + para('p_two', 'A long BQW slows producers.') + '\n' + para('p_three', 'The BQW empties.');
    expect(only(review(body), 'W_JARGON')).toEqual([]);
    const alias = def('def_queue', 'bounded queue wait', ' aliases=["BQW"]') + '\n' + para('p_one', 'The BQW grows.') + '\n' + para('p_two', 'A long BQW slows producers.');
    expect(only(review(alias), 'W_JARGON')).toEqual([]);
  });
});
