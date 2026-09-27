// Mermaid kernel (§9.12). Until the Mermaid model lands, these tests build a
// synthetic bundle: a real document whose `detail` component is rewritten into a
// `mermaid` figure, plus a hand-made MermaidFigure in the model.
import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The Markdown projection belongs to the model; these tests cover the compiler's
// HTML only, so the projection is stubbed.
vi.mock('../../packages/core/src/model/project.ts', () => ({ projectText: () => 'projection stub\n' }));
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument, contentSecurityPolicy } from '../../packages/core/src/compiler/index.ts';
import type { MNode } from '../../packages/core/src/model/targets.ts';
import type { MermaidFigure } from '../../packages/core/src/mermaid/types.ts';
import type { TargetRecord } from '../../packages/core/src/types.ts';

const SOURCE = [
  'flowchart LR',
  '  Producer[Producer] -->|put waits| Queue[(Queue)]',
  '  Queue e1@--> Worker[Worker]',
  '',
].join('\n');

const DOC = `---
format: explain/1
docId: 2b6d1c0e-6f2a-4c3e-9b1d-5a7e8f9c0d1e
title: Mermaid kernel test
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id overview -->
# Mermaid kernel test

{% detail id="flow" label="Where the producer waits" %}
The producer waits at the queue, not at the worker.

\`\`\`mermaid
${SOURCE}\`\`\`
{% /detail %}
`;

const TOOLKIT = {
  version: '0.0.0',
  sha256: 'a'.repeat(64),
  assets: { 'reader.js': 'b'.repeat(64), 'reader.css': 'c'.repeat(64), 'mermaid.js': 'd'.repeat(64) },
  integrity: { 'mermaid.js': 'sha384-TESTDIGEST' },
};
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };

function figure(parsed: boolean): MermaidFigure {
  if (!parsed) {
    return { figureId: 'flow', diagramType: 'other', declaredType: 'erDiagram', source: SOURCE, parsed: false, elements: [], relationships: [] };
  }
  return {
    figureId: 'flow',
    diagramType: 'flowchart',
    declaredType: 'flowchart',
    source: SOURCE,
    parsed: true,
    elements: [
      { id: 'producer', name: 'Producer', kind: 'mermaid-node', label: 'Producer', renderKey: 'node:Producer' },
      { id: 'queue', name: 'Queue', kind: 'mermaid-node', label: 'Queue', renderKey: 'node:Queue' },
      { id: 'worker', name: 'Worker', kind: 'mermaid-node', label: 'Worker', renderKey: 'node:Worker' },
    ],
    relationships: [
      { id: 'flow~producer~queue~0', referenceable: false, from: 'producer', to: 'queue', label: 'put waits', kind: 'mermaid-edge', renderKey: 'edge:L_Producer_Queue_0' },
      { id: 'e1', referenceable: true, from: 'queue', to: 'worker', label: '', kind: 'mermaid-edge', renderKey: 'edge:e1' },
    ],
  };
}

/** A loaded bundle whose `flow` component is a Mermaid figure. */
function mermaidBundle(parsed = true) {
  const dir = mkdtempSync(join(tmpdir(), 'explain-mermaid-'));
  writeFileSync(join(dir, 'index.md'), DOC);
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const node = bundle.model.nodes.get('flow') as MNode;
  node.tag = 'mermaid';
  node.attributes = { id: 'flow', title: 'Where the producer waits', question: 'Where does the producer wait?' };
  const flow = bundle.model.targets.get('flow')!;
  flow.kind = 'mermaid';
  flow.inspectable = false;
  const fig = figure(parsed);
  const add = (id: string, kind: string, label: string) => {
    const record: TargetRecord = { ...flow, id, kind, label, parentId: 'flow', ownerComponentId: 'flow', dependencies: [], plainText: label, inspectable: true };
    delete record.sectionId;
    bundle.model.targets.set(id, record);
  };
  for (const e of fig.elements) add(e.id, e.kind, e.label);
  for (const r of fig.relationships) if (r.referenceable) add(r.id, r.kind, r.label || 'edge');
  (bundle.model as { mermaid?: Map<string, MermaidFigure> }).mermaid = new Map([['flow', fig]]);
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

  it('keeps the Appendix A example output unaffected by the Mermaid kernel', async () => {
    const example = readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url), 'utf8');
    expect(example).not.toContain('mermaid');
  });
});
