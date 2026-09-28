// Figure rules in reader.css that a compiled page does not show: forced
// colours and print (docs/reviews/phase1-figures-review.md F-05, F-06).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../packages/runtime/src/reader.css', import.meta.url), 'utf8');

/** The body of each `@media QUERY { ... }` block, found by brace depth. */
function mediaBlocks(query: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(`@media ${query}`, from);
    if (at < 0) return out;
    const open = css.indexOf('{', at);
    let depth = 0;
    let i = open;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) break;
    }
    out.push(css.slice(open + 1, i));
    from = i;
  }
}

/** The selector list of each rule whose declarations contain `declaration`. */
function selectorsWith(block: string, declaration: RegExp): string[] {
  return [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => declaration.test(m[2]!)).flatMap((m) => m[1]!.split(',').map((x) => x.trim()));
}

describe('reader.css figure rules', () => {
  it('forced colours: a box with no fill also gets the Canvas fill, so its label stays readable (F-05)', () => {
    const selectors = mediaBlocks('(forced-colors: active)').flatMap((b) => selectorsWith(b, /fill:\s*Canvas;/));
    expect(selectors).toContain('.vs-figure svg .vs-cat.vs-nofill .vs-shape');
    // The rule is as specific as the rule outside the block that it must replace.
    expect(css).toContain('.vs-figure svg .vs-cat.vs-nofill .vs-shape { fill: var(--vs-node); }');
  });

  it('forced colours: the failure mark keeps the Mark colour, as the failure outline does (F-02)', () => {
    const selectors = mediaBlocks('(forced-colors: active)').flatMap((b) => selectorsWith(b, /stroke:\s*Mark;/));
    expect(selectors).toEqual(expect.arrayContaining(['.vs-figure svg .vs-kind-failure .vs-shape', '.vs-viewport svg .vs-kind-failure .vs-mark']));
  });

  it('print: the legend prints in list view, with the drawing (F-06)', () => {
    const selectors = mediaBlocks('print').flatMap((b) => selectorsWith(b, /display:\s*flex\s*!important/));
    expect(selectors).toContain('.vs-figure.vs-view-list .vs-legend');
  });

  it('trace: only the "at T" line is muted, not the receiver line', () => {
    expect(css).toContain('.vs-viewport svg .vs-trace-time { fill-opacity: 0.72; }');
    expect(css).not.toMatch(/\.vs-trace-meta\s*\{[^}]*fill-opacity/);
  });

  it('trace bands are neutral: the panel or page colour, with a rule line, and no hue (F-03)', () => {
    expect(css).toMatch(/\.vs-figure svg \.vs-trace-band \{ fill: var\(--vs-band-fill\); stroke: var\(--vs-rule\); \}/);
    expect(css).toContain('.vs-band-panel { --vs-band-fill: var(--vs-panel); }');
    expect(css).toContain('.vs-band-bg { --vs-band-fill: var(--vs-bg); }');
  });
});
