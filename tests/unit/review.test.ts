// Editorial review prompts (§15.6, §16.3, §16.4, §18.6a) on the R16 editorial
// fixtures: each known-bad draft gets its prompt, its good pair gets none, and
// the prompts are warnings that start with "review:".
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { reviewDocument } from '../../packages/core/src/review/index.ts';

const root = new URL('../..', import.meta.url).pathname;
const fixtures = join(root, 'tests/fixtures/editorial');
const REVIEW_CODES = ['W_JARGON', 'W_VISUAL_DENSITY', 'W_EVIDENCE_GAP'];

// Expected prompts on each bad draft: code, target, and text the message must name.
const EXPECTED: Record<string, Array<[string, string, string?]>> = {
  'vague-wording': [['W_JARGON', 'p_summary', 'orchestrates, robust, scalable, seamlessly, sophisticated']],
  'undefined-acronym': [['W_JARGON', 'p_one', 'BQW']],
  'architecture-as-order': [['W_VISUAL_DENSITY', 'request_path', 'do not say what the arrow means'], ['W_VISUAL_DENSITY', 'request_path', 'order of events']],
  'dense-figure': [['W_VISUAL_DENSITY', 'all_services', '26 nodes']],
  'all-observed-cause': [['W_EVIDENCE_GAP', 'mechanism', 'every causal link'], ['W_EVIDENCE_GAP', 'cl_1', 'cites no evidence']],
  'chronology-as-causation': [['W_EVIDENCE_GAP', 'cl_1', 'order in time']],
  'hidden-caveat': [['W_EVIDENCE_GAP', 'd_caveat']],
  'uncited-certainty': [['W_EVIDENCE_GAP', 'p_claim']],
};

function review(path: string) {
  const bundle = loadBundle(path);
  expect(bundle.diagnostics.filter((d) => d.severity === 'error'), `${path} must be a valid document`).toEqual([]);
  return reviewDocument(bundle);
}

describe('@R16 editorial review prompts on the editorial fixtures', () => {
  it('@R16 every fixture directory has an expectation, and every expectation has a fixture', () => {
    expect(readdirSync(fixtures).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [name, expected] of Object.entries(EXPECTED)) {
    it(`@R16 ${name}: the bad draft gets its prompts; the good draft gets none`, () => {
      const bad = review(join(fixtures, name, 'bad', 'index.md'));
      for (const [code, target, text] of expected) {
        const hit = bad.some((d) => d.code === code && d.targetId === target && (text === undefined || d.message.includes(text)));
        expect(hit, `${name}: ${code} on ${target}${text ? ` naming "${text}"` : ''}\n${JSON.stringify(bad, null, 2)}`).toBe(true);
      }
      for (const d of bad) {
        expect(d.severity).toBe('warning');
        expect(d.message.startsWith('review: ')).toBe(true);
        expect(REVIEW_CODES).toContain(d.code);
      }
      expect(review(join(fixtures, name, 'good', 'index.md'))).toEqual([]);
    });
  }

  it('@R16 the examples get only the prompts they earn: cache-stampede marks links observed without evidence', () => {
    const examples = join(root, 'examples');
    const found: string[] = [];
    for (const name of readdirSync(examples).sort()) {
      let prompts;
      try {
        prompts = review(join(examples, name, 'index.md'));
      } catch {
        continue; // not a document folder (for example github-pages)
      }
      for (const d of prompts) found.push(`${name}:${d.code}:${d.targetId}`);
    }
    // A precision check: every other example is clean. These six are real
    // gaps in the example (observed with no cited evidence), not false alarms.
    expect(found).toEqual([
      'cache-stampede:W_EVIDENCE_GAP:f_expiry',
      'cache-stampede:W_EVIDENCE_GAP:f_traffic',
      'cache-stampede:W_EVIDENCE_GAP:f_pool',
      'cache-stampede:W_EVIDENCE_GAP:f_timeouts',
      'cache-stampede:W_EVIDENCE_GAP:cl_traffic_and',
      'cache-stampede:W_EVIDENCE_GAP:cl_pool_timeouts',
    ]);
  });
});
