import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBundle, type LoadedBundle } from '../../packages/core/src/model/bundle.ts';
import { checkLink, compileDocument, CompileError, h, render, textWidth, type CompileResult } from '../../packages/core/src/compiler/index.ts';

const examplePath = new URL('../../examples/bounded-queue/index.md', import.meta.url).pathname;
const TOOLKIT = { version: '0.0.0', sha256: 'e'.repeat(64) };
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };

const bundle = loadBundle(examplePath);
const result = await compileDocument(bundle, TOOLKIT, OPTIONS);
const file = (name: string) => result.files.find((f) => f.path === `${result.directory}/${name}`)!;
const html = new TextDecoder().decode(file('index.html').bytes);

function ids(markup: string): string[] {
  return [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
}

/** A loaded bundle for modified example text (in memory, same folder semantics). */
async function compileText(text: string, toolkit = TOOLKIT): Promise<CompileResult> {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'explain-compile-'));
  writeFileSync(join(dir, 'index.md'), text);
  const b: LoadedBundle = loadBundle(join(dir, 'index.md'));
  return compileDocument(b, toolkit, OPTIONS);
}

describe('static compiler output (§13.1, §10.3) @R14', () => {
  it('writes index.html, document.md, and build.json under d/DOC/REV/BUILD', () => {
    expect(result.directory).toBe(`d/${bundle.docId}/${bundle.sourceRevision}/${result.buildId}`);
    expect(result.files.map((f) => f.path.slice(result.directory.length + 1)).sort()).toEqual(['build.json', 'document.md', 'index.html']);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('gives every target exactly one canonical x-ID element @T12', () => {
    const all = ids(html);
    for (const id of bundle.model.targets.keys()) {
      expect(all.filter((x) => x === `x-${id}`), id).toHaveLength(1);
    }
  });

  it('never repeats an HTML id @T12', () => {
    const all = ids(html);
    expect(all.length).toBe(new Set(all).size);
  });

  it('puts body digest, kind, and label on every canonical element', () => {
    for (const [id, record] of bundle.model.targets) {
      const tag = html.match(new RegExp(`<[a-z]+[^>]*\\sid="x-${id}"[^>]*>`))![0];
      expect(tag).toContain(`data-ex-target="${id}"`);
      expect(tag).toContain(`data-ex-body="${record.bodySha256}"`);
      expect(tag).toContain(`data-ex-kind="${record.kind}"`);
    }
  });

  it('renders every relationship as an SVG or list instance and a list item @R04', () => {
    for (const r of bundle.model.relationships) {
      const instances = [...html.matchAll(new RegExp(`data-ex-rel="${r.id.replace(/[~]/g, '\\~')}"`, 'g'))];
      expect(instances.length, r.id).toBeGreaterThanOrEqual(1);
      expect(html).toContain(`id="l-${r.kind === 'order' ? 'full_queue_trace' : 'handoff'}.${r.id}"`);
    }
    expect(html).toContain('id="v-handoff.enqueue"');
    expect(html).toContain('class="ex-hit"');
  });

  it('marks ordinal traces and generated citation text', () => {
    expect(html).toMatch(/<p class="ex-trace-scale" data-ex-generated="">Ordering, not duration\.<\/p>/);
    // Order layers are partial-order depth, marked generated so quotes skip them.
    expect(html).toContain('<span class="ex-event-layer" data-ex-generated="">Order layer 1 </span>');
    expect(html).toContain('<span class="ex-event-layer" data-ex-generated="">Order layer 4 </span>');
    expect(html).toMatch(/<a class="ex-cite" href="#x-src_queue" title="Illustrative bounded queue" data-ex-generated="">\[1\]<\/a>/);
    expect(html).toContain('class="ex-term" href="#x-def_backpressure" data-ex-term="def_backpressure"');
    expect(html).toContain('data-ex-focus="enqueue event_wait event_remove"');
    expect(html).toMatch(/<svg[^>]*role="group" aria-label="[^"]+"/);
    expect(html).not.toContain('role="img"');
    expect(html).toMatch(/id="v-handoff\.enqueue"[^>]*>(?:(?!<\/a>).)*class="ex-hit"(?:(?!<\/a>).)*put waits while full/s);
    // Defect 3 (phase1-review.md): one compact snapshot line after the title.
    expect(html).toContain('<p class="ex-meta" data-ex-generated="">Snapshot captured ');
    expect(html.indexOf('id="x-overview"')).toBeLessThan(html.indexOf('class="ex-meta"'));
    const listItem = html.slice(html.indexOf('id="l-handoff.enqueue"'));
    expect(listItem.slice(0, listItem.indexOf('</a>'))).toMatch(/<span data-ex-generated=""> \u2192 <\/span>/);
  });

  it('shows the capture-consistent state and the link-only state', () => {
    expect(html).toMatch(/<dt>verification<\/dt><dd>capture-consistent<\/dd>/);
    expect(html).toMatch(/<dt>verification<\/dt><dd>link-only<\/dd>/);
  });

  it('numbers annotated code with original line numbers', () => {
    const fig = html.slice(html.indexOf('id="x-wait_code"'));
    expect(fig).toContain('<span class="ex-ln" data-ex-generated="">14</span>');
    expect(fig).toContain('id="v-wait_code.capacity_loop.14"');
  });

  it('uses no inline style, inline script, or event handler, and has a CSP meta element @R11', () => {
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(html).toContain('<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;self&#39;');
    expect(html).not.toContain('frame-ancestors');
  });

  it('links shared assets with relative URLs only', () => {
    expect(html).toContain(`href="../../../../_explain/assets/${TOOLKIT.sha256}/reader.css"`);
    expect(html).toContain(`src="../../../../_explain/assets/${TOOLKIT.sha256}/reader.js"`);
    expect(html).not.toMatch(/(href|src)="\//);
  });

  it('keeps SVG coordinates to at most three decimals', () => {
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    const numbers = [...svg.matchAll(/-?\d+\.\d+/g)].map((m) => m[0]);
    expect(numbers.length).toBeGreaterThan(0);
    for (const x of numbers) expect(x.split('.')[1]!.length).toBeLessThanOrEqual(3);
  });

  it('uses the first h1 block as the page title', () => {
    expect(html.match(/<h1>/g)).toHaveLength(1);
  });

  it('writes deterministic public build metadata @R18', () => {
    const manifest = JSON.parse(new TextDecoder().decode(file('build.json').bytes));
    expect(manifest).toMatchObject({ schema: 'explain-build/1', docId: bundle.docId, sourceRevision: bundle.sourceRevision, buildId: result.buildId, toolkitSha256: TOOLKIT.sha256 });
    expect(manifest.sourceFiles).toEqual([{ path: 'index.md', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(manifest.outputFiles.map((f: { path: string }) => f.path)).toEqual(['index.html', 'document.md']);
    expect(JSON.stringify(manifest)).not.toContain('/home/');
  });
});

describe('determinism and identity (§7.4, §7.5)', () => {
  it('produces byte-identical files for identical inputs', async () => {
    const again = await compileDocument(loadBundle(examplePath), TOOLKIT, OPTIONS);
    expect(again.files.map((f) => [f.path, Buffer.from(f.bytes).toString('base64')])).toEqual(result.files.map((f) => [f.path, Buffer.from(f.bytes).toString('base64')]));
  });

  it('changes the build ID but not the source revision for another toolkit @T14', async () => {
    const other = await compileDocument(loadBundle(examplePath), { version: '0.0.1', sha256: 'f'.repeat(64) }, OPTIONS);
    expect(other.sourceRevision).toBe(result.sourceRevision);
    expect(other.buildId).not.toBe(result.buildId);
  });
});

describe('build failures', () => {
  const source = readFileSync(examplePath, 'utf8');

  it('fails with E_EVIDENCE_HASH when captured bytes disagree with excerptSha256', async () => {
    const tampered = source.replace('raise ValueError("capacity must be positive")', 'raise ValueError("capacity must be > 0")');
    await expect(compileText(tampered)).rejects.toSatisfy((e: unknown) => e instanceof CompileError && e.diagnostics.some((d) => d.code === 'E_EVIDENCE_HASH'));
  });

  it('rejects links outside the scheme allowlist with E_UNSAFE_CONTENT', async () => {
    const bad = source.replace('makes the producer wait rather than accept unlimited pending work.', 'makes the producer wait. [x](ftp://example.com/file)');
    await expect(compileText(bad)).rejects.toSatisfy((e: unknown) => e instanceof CompileError && e.diagnostics.some((d) => d.code === 'E_UNSAFE_CONTENT'));
  });

  it('never turns a javascript: link into a hyperlink', async () => {
    const bad = source.replace('makes the producer wait rather than accept unlimited pending work.', 'makes the producer wait. [x](javascript:alert(1))');
    const r = await compileText(bad);
    const page = new TextDecoder().decode(r.files.find((f) => f.path.endsWith('index.html'))!.bytes);
    expect(page).not.toMatch(/href="javascript:/i);
  });

  it('shows bidi controls as visible escapes with W_UNSAFE_TEXT', async () => {
    const rlo = source.replace('This is a teaching implementation', 'This is a \u202eteaching implementation');
    const r = await compileText(rlo);
    const page = new TextDecoder().decode(r.files.find((f) => f.path.endsWith('index.html'))!.bytes);
    expect(page).toContain('\u27e8U+202E\u27e9teaching');
    expect(page).not.toContain('\u202e');
    expect(r.diagnostics.map((d) => d.code)).toContain('W_UNSAFE_TEXT');
  });

  it('falls back to the relationship list only when layout fails and fallback is allowed', async () => {
    const failing = async () => {
      throw Object.assign(new Error('boom'), { code: 'E_LAYOUT_TIMEOUT' });
    };
    await expect(compileDocument(loadBundle(examplePath), TOOLKIT, { ...OPTIONS, layout: failing })).rejects.toSatisfy((e: unknown) => e instanceof CompileError && e.diagnostics.some((d) => d.code === 'E_LAYOUT_TIMEOUT'));
    const fallback = await compileDocument(loadBundle(examplePath), TOOLKIT, { ...OPTIONS, layoutFallback: true, layout: failing });
    const page = new TextDecoder().decode(fallback.files.find((f) => f.path.endsWith('index.html'))!.bytes);
    // The graph has no SVG; the trace figure needs no layout engine and stays.
    expect(page).not.toContain('id="v-handoff.enqueue"');
    expect(page).toContain('id="l-handoff.enqueue"');
    expect(page).toContain('id="v-full_queue_trace.');
    expect(fallback.buildId).not.toBe(result.buildId);
  });
});

describe('safe markup primitives (§15.2)', () => {
  it('escapes text and attributes', () => {
    expect(render(h('p', { title: '"<x>\'' }, '<script>&'))).toBe('<p title="&quot;&lt;x&gt;&#39;">&lt;script&gt;&amp;</p>');
  });

  it('rejects disallowed elements, style, and event handlers', () => {
    expect(() => h('script', { src: 'x.js' })).not.toThrow();
    expect(() => h('iframe')).toThrow();
    expect(() => h('div', { style: 'color:red' })).toThrow();
    expect(() => h('div', { onclick: 'x()' })).toThrow();
    expect(() => h('a', { href: 'javascript:alert(1)' })).toThrow();
  });

  it('validates links with the WHATWG URL parser', () => {
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'java\tscript:alert(1)', '\\\\host/x', 'https://user:pw@example.com/', 'data:text/html,x', 'file:///etc/passwd']) {
      expect(checkLink(bad).ok, bad).toBe(false);
    }
    expect(checkLink('https://example.com/a')).toEqual({ ok: true, href: 'https://example.com/a', external: true });
    expect(checkLink('#x-enqueue')).toEqual({ ok: true, href: '#x-enqueue', external: false });
    expect(checkLink('other/page.html')).toMatchObject({ ok: true, external: false });
  });

  it('measures text from the bundled table, not fonts', () => {
    expect(textWidth('Producer')).toBe(textWidth('Producer'));
    expect(textWidth('\u{1F600}')).toBe(14);
  });
});
