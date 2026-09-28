// Fixes from the second authoring run (docs/validation/dogfood-2.md, Q3–Q11).
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../../packages/cli/src/cli-util.ts';
import { runInit } from '../../packages/cli/src/commands/init.ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { captureGit } from '../../packages/core/src/provenance/index.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { projectText } from '../../packages/core/src/model/project.ts';
import { makeFixture, type Fixture } from './capture.fixtures.ts';

let fx: Fixture;
beforeEach(() => { fx = makeFixture(); });
afterEach(() => fx.cleanup());

const AT = '2026-09-27T00:00:00Z';

async function page(doc: string): Promise<string> {
  const result = await compileDocument(loadBundle(doc), { version: '0.0.0', sha256: 'a'.repeat(64) }, { audience: 'private', includeSource: false, layoutFallback: false, nodeVersion: 'v24.21.0' });
  return new TextDecoder().decode(result.files.find((f) => f.path.endsWith('/index.html'))!.bytes);
}

describe('Q3: citation numbers follow the first citation in reading order', () => {
  it('numbers sources by first use, lists them in that order, and numbers uncited sources last', async () => {
    const repo = fx.repo('r');
    const doc = fx.doc('d', '<!-- vs:id intro -->\nIntro.\n\n<!-- vs:id outro -->\nOutro.\n');
    for (const [id, lines] of [['src_a', '1:1'], ['src_b', '2:2'], ['src_c', '3:3']] as const) {
      captureGit({ repo, file: 'a.txt', lines, doc, id, title: id.toUpperCase(), repositoryLabel: 'app', capturedAt: AT });
    }
    // Cite C first, then A; B is never cited. File order is A, B, C.
    const text = readFileSync(doc, 'utf8').replace('Intro.', 'Intro {% cite ref="src_c" /%}.').replace('Outro.', 'Outro {% cite ref="src_a" /%} {% cite ref="src_c" /%}.');
    writeFileSync(doc, text);
    const html = await page(doc);
    const cites = [...html.matchAll(/class="vs-cite" href="#x-([^"]+)"[^>]*>\[(\d+)\]/g)].map((m) => `${m[1]}=${m[2]}`);
    expect(cites).toEqual(['src_c=1', 'src_a=2', 'src_c=1']);
    // The sources in the details appendix follow the same numbering.
    const appendix = html.slice(html.indexOf('Details and evidence'));
    const pos = (id: string) => appendix.indexOf(`id="x-${id}"`);
    expect(pos('src_c')).toBeGreaterThan(-1);
    expect(pos('src_c')).toBeLessThan(pos('src_a'));
    expect(pos('src_a')).toBeLessThan(pos('src_b'));
    // The text projection lists sources in the same order.
    const bundle = loadBundle(doc);
    const projected = projectText(bundle.parsed, bundle.model.targets);
    const at = (id: string) => projected.indexOf(`<!-- vs:target ${id} -->`);
    expect(at('src_c')).toBeLessThan(at('src_a'));
    expect(at('src_a')).toBeLessThan(at('src_b'));
  });
});

describe('Q11: init --no-lock for a document in the toolkit repository', () => {
  const release = new URL('../../dist/release', import.meta.url).pathname;
  const quiet = async (argv: string[]) => {
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try { return await runInit(parseArgs(argv)); } finally { process.stdout.write = write; }
  };

  it('writes index.md and no lock; without the flag, the lock is written', async () => {
    const root = mkdtempSync(join(tmpdir(), 'visser-init-'));
    expect(await quiet([join(root, 'a'), '--kind', 'teaching', '--title', 'A', '--toolkit-dir', release, '--no-lock'])).toBe(0);
    expect(existsSync(join(root, 'a', 'index.md'))).toBe(true);
    expect(existsSync(join(root, 'a', 'visser.lock.json'))).toBe(false);
    expect(await quiet([join(root, 'b'), '--kind', 'teaching', '--title', 'B', '--toolkit-dir', release])).toBe(0);
    expect(existsSync(join(root, 'b', 'visser.lock.json'))).toBe(true);
  });

  it('--no-lock takes no value', async () => {
    const root = mkdtempSync(join(tmpdir(), 'visser-init-'));
    await expect(quiet([join(root, 'c'), '--no-lock', 'yes', '--kind', 'teaching', '--title', 'C', '--toolkit-dir', release])).rejects.toMatchObject({ code: 'E_USAGE' });
    expect(existsSync(join(root, 'c'))).toBe(false);
  });
});
