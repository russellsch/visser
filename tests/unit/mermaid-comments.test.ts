// Mermaid `%%` comments never reach generated output (§13.5 export contract,
// revision 1.17). The Phase 4 review found an internal hostname from a Mermaid
// comment in both index.html and document.md. Only output is filtered: the
// source, the target IDs, and every identity hash stay the same.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { checkMermaidSource, stripMermaidComments } from '../../packages/core/src/mermaid/rules.ts';

const SECRET = 'build-07.corp.internal.example';

const FLOW = ['flowchart LR', `%% deployed from ${SECRET}`, '  Producer[Producer] -->|put waits| Queue[(Queue)]', `    %% TODO ask ${SECRET}`, '  Queue e1@--> Worker[Worker]', ''].join('\n');
const FLOW_CLEAN = ['flowchart LR', '  Producer[Producer] -->|put waits| Queue[(Queue)]', '  Queue e1@--> Worker[Worker]', ''].join('\n');
const STATE = ['stateDiagram-v2', `  %% ${SECRET}`, '  [*] --> Idle', '  Idle --> Busy', ''].join('\n');
const ER = ['erDiagram', `%% ${SECRET}`, '  CUSTOMER ||--o{ INVOICE : "is billed by"', ''].join('\n');

const doc = (flow: string) => `---
format: visser/1
docId: 2b6d1c0e-6f2a-4c3e-9b1d-5a7e8f9c0d1e
title: Mermaid comment test
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id overview -->
# Mermaid comment test

{% mermaid id="flow" title="Where the producer waits" question="Where does the producer wait?" %}
The producer waits at the queue.

\`\`\`mermaid
${flow}\`\`\`
{% /mermaid %}

{% mermaid id="life" title="Lifecycle" question="Which states exist?" %}
\`\`\`mermaid
${STATE}\`\`\`
{% /mermaid %}

{% mermaid id="er" title="Billing" question="Who is billed?" %}
\`\`\`mermaid
${ER}\`\`\`
{% /mermaid %}
`;

const TOOLKIT = {
  version: '0.0.0',
  sha256: 'a'.repeat(64),
  assets: { 'reader.js': 'b'.repeat(64), 'reader.css': 'c'.repeat(64), 'mermaid.js': 'd'.repeat(64) },
  integrity: { 'mermaid.js': 'sha384-TESTDIGEST' },
};
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };

function load(flow: string) {
  const dir = mkdtempSync(join(tmpdir(), 'visser-mermaid-comments-'));
  writeFileSync(join(dir, 'index.md'), doc(flow));
  const bundle = loadBundle(join(dir, 'index.md'));
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return bundle;
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('Mermaid comments in generated output (§13.5)', () => {
  it.each([
    'pie\ntitle $$x$$\ntitle Plain\n"A": 1\n',
    'pie\naccTitle: $$x$$\n"A": 1\n',
  ])('does not bind an upstream plain drawing when only hidden fields have math', async pie => {
    const result = await compileDocument(load(pie), TOOLKIT, OPTIONS);
    const html = text(result.files.find(file => file.path.endsWith('index.html'))!.bytes);
    expect(html).not.toContain('data-vs-mermaid-source-map=');
  });
  it('@R20 math source maps preserve locations without disclosing removed comments', async () => {
    const pie = ['pie', `%% ${SECRET}`, 'title Ratio $$x^2$$', '"Rate $$x$$": 1', ''].join('\n');
    const result = await compileDocument(load(pie), TOOLKIT, OPTIONS);
    for (const file of result.files) expect(text(file.bytes), file.path).not.toContain(SECRET);
    const html = text(result.files.find(file => file.path.endsWith('index.html'))!.bytes);
    expect(html).toContain('data-vs-mermaid-source-map=');
  });
  it('@R20 a hostname in a whole-line %% comment appears in no generated file', async () => {
    const bundle = load(FLOW);
    const result = await compileDocument(bundle, TOOLKIT, OPTIONS);
    expect(result.files.map((f) => f.path.split('/').pop())).toEqual(expect.arrayContaining(['index.html', 'document.md', 'build.json']));
    for (const file of result.files) {
      expect(text(file.bytes), file.path).not.toContain(SECRET);
      expect(text(file.bytes), file.path).not.toContain('corp.internal');
    }
    // The figures still carry their source for the runtime and for readers.
    const html = text(result.files.find((f) => f.path.endsWith('index.html'))!.bytes);
    expect(html).toContain('<pre class="vs-mermaid-source"><code class="language-mermaid">flowchart LR\n  Producer[Producer]');
    const md = text(result.files.find((f) => f.path.endsWith('document.md'))!.bytes);
    expect(md).toContain('```mermaid\nflowchart LR\n  Producer[Producer]');
    expect(md).toContain('stateDiagram-v2\n  [*] --> Idle');
  });

  it('@R20 comments change no target ID, element, or render key, and hashes still come from the source', async () => {
    const withComments = load(FLOW);
    const without = load(FLOW_CLEAN);
    const ids = (b: ReturnType<typeof load>) => [...b.model.targets.keys()].sort();
    expect(ids(withComments)).toEqual(ids(without));
    const figure = (b: ReturnType<typeof load>) => (b.model as { mermaid: Map<string, unknown> }).mermaid.get('flow') as { elements: unknown[]; relationships: unknown[]; source: string };
    expect(figure(withComments).elements).toEqual(figure(without).elements);
    expect(figure(withComments).relationships).toEqual(figure(without).relationships);
    // The model keeps the original source; only output is filtered.
    expect(figure(withComments).source).toContain(SECRET);

    // The page states the bodySha256 of each target as computed from the source file.
    const result = await compileDocument(withComments, TOOLKIT, OPTIONS);
    const html = text(result.files.find((f) => f.path.endsWith('index.html'))!.bytes);
    const flow = withComments.model.targets.get('flow')!;
    expect(html).toContain(`data-vs-body="${flow.bodySha256}"`);
    expect(html).toContain(`data-vs-rev="${withComments.sourceRevision}"`);
    // The comment is part of the target span, so its hash differs from the clean source.
    expect(flow.bodySha256).not.toBe(without.model.targets.get('flow')!.bodySha256);
  });

  it('stripMermaidComments removes only whole-line comments', () => {
    expect(stripMermaidComments('flowchart LR\n%% a\n\t %% b\n  A --> B\n%%\n')).toBe('flowchart LR\n  A --> B\n');
    expect(stripMermaidComments('flowchart LR\n  A["a %% b"] --> B\n')).toBe('flowchart LR\n  A["a %% b"] --> B\n');
  });

  it('@R20 a %% inside a line is rejected, because diagram types disagree on its meaning', () => {
    // The state lexer skips the tail as a comment, so it would stay visible in output.
    expect(checkMermaidSource(`stateDiagram-v2\n  [*] --> Idle %% ${SECRET}\n`).map((i) => i.code)).toContain('E_UNSAFE_CONTENT');
    expect(checkMermaidSource(`sequenceDiagram\n  Alice->>Bob: hi %% ${SECRET}\n`).map((i) => i.code)).toContain('E_UNSAFE_CONTENT');
    // Whole-line comments and quoted text are allowed.
    expect(checkMermaidSource(`flowchart LR\n  %% ${SECRET}\n  A["a %% b"] --> B\n`)).toEqual([]);
  });
});
