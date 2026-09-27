import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument, MAX_FIGURE_WIDTH } from '../../packages/core/src/compiler/index.ts';

const root = new URL('../..', import.meta.url).pathname;
const toolkit = { version: '0.0.0', sha256: 'a'.repeat(64) };
const options = { audience: 'private' as const, includeSource: false, layoutFallback: false };

async function html(example: string): Promise<string> {
  const result = await compileDocument(loadBundle(`${root}examples/${example}/index.md`), toolkit, options);
  return new TextDecoder().decode(result.files.find((f) => f.path.endsWith('index.html'))!.bytes);
}

const svgWidths = (markup: string) => [...markup.matchAll(/<svg[^>]*viewBox="0 0 ([\d.]+) [\d.]+"/g)].map((m) => Number(m[1]));

describe('phase 2 layout and narrow-view fixes @R06', () => {
  it('lays out a long chain top-to-bottom when left-to-right exceeds MAX_FIGURE_WIDTH', async () => {
    const a = await html('image-pipeline');
    const widths = svgWidths(a);
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBeLessThanOrEqual(MAX_FIGURE_WIDTH);
    expect(await html('image-pipeline')).toBe(a); // the direction rule keeps output deterministic
  });

  it('keeps every example figure within MAX_FIGURE_WIDTH', async () => {
    for (const example of ['bounded-queue', 'cache-stampede', 'connection-lifecycle', 'schema-migration', 'order-intake']) {
      for (const w of svgWidths(await html(example))) expect(w, example).toBeLessThanOrEqual(MAX_FIGURE_WIDTH);
    }
  });

  it('groups narrow-screen trace cards by actor with order, after, and message data', async () => {
    const markup = await html('order-intake');
    const byActor = markup.slice(markup.indexOf('<div class="vs-trace-by-actor"'));
    const groups = [...byActor.matchAll(/<section class="vs-actor-group" aria-label="([^"]*)"/g)].map((m) => m[1]);
    expect(groups.length).toBeGreaterThan(1);
    expect(byActor).toContain('Order layer');
    expect(byActor).toMatch(/data-vs-rel="[a-z0-9_-]+~after~[a-z0-9_-]+"/);
    expect(byActor).toContain('vs-message-to');
    // Instance IDs in the card view never repeat the flat list's IDs.
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
