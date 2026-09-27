// Mermaid kernel (§9.12), compiled from real documents through loadBundle and
// the real Mermaid model (no projection stub, no synthetic figures).
import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { CompileError, compileDocument, contentSecurityPolicy } from '../../packages/core/src/compiler/index.ts';

const SOURCE = [
  'flowchart LR',
  '  Producer[Producer] -->|put waits| Queue[(Queue)]',
  '  Queue e1@--> Worker[Worker]',
  '',
].join('\n');
const ER_SOURCE = ['erDiagram', '  CUSTOMER ||--o{ INVOICE : "is billed by"', ''].join('\n');

const doc = (source: string) => `---
format: explain/1
docId: 2b6d1c0e-6f2a-4c3e-9b1d-5a7e8f9c0d1e
title: Mermaid kernel test
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id overview -->
# Mermaid kernel test

{% mermaid id="flow" title="Where the producer waits" question="Where does the producer wait?" %}
The producer waits at the queue, not at the worker.

\`\`\`mermaid
${source}\`\`\`
{% /mermaid %}
`;

const TOOLKIT = {
  version: '0.0.0',
  sha256: 'a'.repeat(64),
  assets: { 'reader.js': 'b'.repeat(64), 'reader.css': 'c'.repeat(64), 'mermaid.js': 'd'.repeat(64) },
  integrity: { 'mermaid.js': 'sha384-TESTDIGEST' },
};
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };

/** A loaded bundle of a real Mermaid document; `parsed` false uses a figure-level ER diagram. */
function mermaidBundle(parsed = true) {
  const dir = mkdtempSync(join(tmpdir(), 'explain-mermaid-'));
  writeFileSync(join(dir, 'index.md'), doc(parsed ? SOURCE : ER_SOURCE));
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return bundle;
}

// The renderer escapes ' as &#39; in attribute values; decode it for readable assertions.
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes).replaceAll('&#39;', "'");

const page = async (parsed = true) => {
  const result = await compileDocument(mermaidBundle(parsed), TOOLKIT, OPTIONS);
  const html = decode(result.files.find((f) => f.path.endsWith('index.html'))!.bytes);
  return { result, html };
};

describe('Mermaid kernel (§9.12)', () => {
  it('emits the static figure: viewport, escaped source, lists with render keys, and a hidden notice', async () => {
    const { html } = await page();
    expect(html).toContain('data-ex-mermaid="flowchart"');
    expect(html).toContain('<div class="ex-viewport" id="m-flow" data-ex-viewport="" data-ex-mermaid-render=""></div>');
    expect(html).toContain('<pre class="ex-mermaid-source"><code class="language-mermaid">flowchart LR');
    expect(html).toContain('Producer[Producer] --&gt;|put waits| Queue');
    expect(html).toMatch(/id="l-flow\.producer"[^>]*data-ex-target="producer"[^>]*data-ex-mermaid-key="node:Producer"/);
    // A derived relationship is not referenceable: its instance targets the figure.
    expect(html).toMatch(/id="l-flow\.flow~producer~queue~0"[^>]*data-ex-target="flow"[^>]*data-ex-rel="flow~producer~queue~0"[^>]*data-ex-mermaid-key="edge:L_Producer_Queue_0"/);
    // An explicit edge ID is a relationship target.
    expect(html).toMatch(/id="l-flow\.e1"[^>]*data-ex-target="e1"[^>]*data-ex-rel="e1"/);
    expect(html).toContain('<p class="ex-mermaid-notice" role="status" hidden data-ex-generated=""></p>');
    expect(html).toContain('data-ex-views="map list"');
    expect(html).toContain('<figcaption id="ex-t-flow">');
  });

  it('gives every Mermaid element a canonical detail in the appendix', async () => {
    const { html } = await page();
    for (const id of ['producer', 'queue', 'worker', 'e1']) {
      expect(html).toMatch(new RegExp(`<details class="ex-detail ex-kind-mermaid-[a-z]+" id="x-${id}" data-ex-target="${id}"`));
    }
    expect(html).toContain('In diagram <a href="#x-flow">');
  });

  it('marks figure-level types as not individually inspectable and emits no lists', async () => {
    const { html } = await page(false);
    expect(html).toContain('data-ex-mermaid="other"');
    expect(html).toContain('class="ex-mermaid-note"');
    expect(html).not.toContain('data-ex-mermaid-key');
    expect(html).not.toContain('data-ex-views');
  });

  it('uses the Mermaid-page CSP and the SRI meta only on pages with a Mermaid figure', async () => {
    const { html, result } = await page();
    expect(html).toContain(`content="${contentSecurityPolicy({ mermaid: true, delivery: 'meta' })}"`);
    expect(html).toContain("style-src 'self' 'unsafe-inline'");
    expect(html).toContain('<meta name="ex-mermaid" content="sha384-TESTDIGEST">');
    expect(result.needsMermaid).toBe(true);
    expect(result.manifest.assets.map((a) => a.path)).toContain('mermaid.js');

    const plain = await compileDocument(loadBundle(new URL('../../examples/bounded-queue/index.md', import.meta.url).pathname), TOOLKIT, OPTIONS);
    const plainHtml = decode(plain.files.find((f) => f.path.endsWith('index.html'))!.bytes);
    expect(plain.needsMermaid).toBe(false);
    expect(plainHtml).not.toContain('unsafe-inline');
    expect(plainHtml).not.toContain('name="ex-mermaid"');
    expect(plain.manifest.assets.map((a) => a.path)).not.toContain('mermaid.js');
  });

  it('keeps frame-ancestors in the header form only, and changes only style-src for Mermaid pages', () => {
    const strict = contentSecurityPolicy({ mermaid: false, delivery: 'header' });
    const mermaid = contentSecurityPolicy({ mermaid: true, delivery: 'header' });
    expect(strict).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy({ mermaid: true, delivery: 'meta' })).not.toContain('frame-ancestors');
    expect(mermaid.replace("style-src 'self' 'unsafe-inline'", "style-src 'self'")).toBe(strict);
    expect(mermaid).toContain("script-src 'self'");
    expect(mermaid).not.toContain('unsafe-eval');
  });

  it('is deterministic and has no duplicate HTML ids', async () => {
    const a = await page();
    const b = await page();
    expect(a.html).toBe(b.html);
    const ids = [...a.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(a.html).not.toMatch(/\sstyle=/);
    expect(a.html).not.toMatch(/<script>/);
  });

  it('refuses to build a Mermaid page without an integrity digest (fail closed)', async () => {
    const { integrity: _omit, ...withoutIntegrity } = TOOLKIT;
    await expect(compileDocument(mermaidBundle(), withoutIntegrity, OPTIONS)).rejects.toBeInstanceOf(CompileError);
  });

  it('projects the real Mermaid figure into document.md', async () => {
    const { result } = await page();
    const md = new TextDecoder().decode(result.files.find((f) => f.path.endsWith('document.md'))!.bytes);
    expect(md).toContain('<!-- ex:target producer -->');
    expect(md).toContain('flowchart LR');
  });

  it('keeps the Appendix A example output unaffected by the Mermaid kernel', async () => {
    const example = readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url), 'utf8');
    expect(example).not.toContain('mermaid');
  });
});
