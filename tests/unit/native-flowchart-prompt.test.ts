import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';
import { FLOWCHART_READER_CONTRACT } from '../../packages/core/src/compiler/flowchart-contract.ts';

const dir = mkdtempSync(join(tmpdir(), 'visser-flowchart-prompt-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const frontmatter = `---
format: visser/1
docId: 7d2b9c1e-3f4a-4b5c-8d6e-9f0a1b2c3d4e
title: Prompt acceptance fixture
kind: reference
capturedAt: 2026-10-10T00:00:00Z
visibility: private
---
`;
const toolkit = {
  version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) },
  readerContracts: [FLOWCHART_READER_CONTRACT],
};
const options = { audience: 'private' as const, includeSource: false, layoutFallback: false };

async function compile(body: string) {
  writeFileSync(join(dir, 'index.md'), `${frontmatter}\n${body}`);
  return compileDocument(loadBundle(join(dir, 'index.md')), toolkit, options);
}

function output(result: Awaited<ReturnType<typeof compileDocument>>, suffix: string): string {
  return new TextDecoder().decode(result.files.find((file) => file.path.endsWith(suffix))!.bytes);
}

describe('native flowchart prompt fixtures (P03, P05, P06, P10) @FCprompts', () => {
  it('parses the documented colored-group retry without treating color as the outcome', () => {
    const body = `{% flowchart id="review" title="Review request" question="Can this request proceed?" %}
{% group id="validation" label="Validate" color="teal" /%}
{% group id="correction" label="Correct" color="amber" /%}
{% start id="received" label="Request received" /%}
{% action id="check" label="Check request" group="validation" /%}
{% decision id="valid" label="Request valid?" group="validation" /%}
{% action id="repair" label="Request correction" group="correction" /%}
{% end id="ready" label="Ready" /%}
{% flow id="received_check" from="received" to="check" /%}
{% flow id="check_valid" from="check" to="valid" /%}
{% flow id="valid_ready" from="valid" to="ready" label="Yes" /%}
{% flow id="valid_repair" from="valid" to="repair" label="No" /%}
{% flow id="repair_check" from="repair" to="check" label="Correction received" /%}
{% /flowchart %}`;
    const bundle = loadBundle(writeFixture(body));
    expect(bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });

  it('preserves decoded TeX across prose, display math, equation references, and flow labels', async () => {
    const result = await compile(String.raw`<!-- vs:id p -->
The fraction is $\frac{a}{b}$. Use {% eqref ref="eq_capacity" /%}.

{% equation id="eq_capacity" %}
\frac{a}{b}
{% /equation %}

{% flowchart id="capacity" title="Capacity check" question="Does capacity remain?" %}
{% start id="begin" label="Measure $\\frac{a}{b}$" /%}
{% decision id="under" label="$q < C$?" /%}
{% end id="accept" label="Accept" /%}
{% end id="hold" label="Hold" /%}
{% flow id="begin_under" from="begin" to="under" /%}
{% flow id="under_accept" from="under" to="accept" label="Yes" /%}
{% flow id="under_hold" from="under" to="hold" label="No" /%}
{% /flowchart %}`);
    const html = output(result, '/index.html');
    const markdown = output(result, '/document.md');

    for (const expression of ['$\\frac{a}{b}$', '$q < C$']) expect(html).toContain(expression.replace('<', '&lt;'));
    expect(html).toContain('class="vs-math-source">$$\n\\frac{a}{b}\n$$');
    expect(html).toContain('href="#x-eq_capacity"');
    expect(markdown).toContain('[Equation (1)](#x-eq_capacity)');
    expect(markdown).toContain('<!-- vs:target eq_capacity -->');
    expect(markdown).not.toContain('\\label{');
  });

  it('keeps P10 near-neighbor TeX distinct in parsed source', () => {
    const bundle = loadBundle(writeFixture(String.raw`<!-- vs:id p -->
$-x^2$; $(-x)^2$; $i \le n-1$; $i \le n$; $q = C$; $q \approx C$;
$250\,\mathrm{ms}$; $0.25\,\mathrm{s}$.
`));
    expect(bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(bundle.parsed.math?.map((expression) => expression.tex)).toEqual([
      '-x^2', '(-x)^2', 'i \\le n-1', 'i \\le n', 'q = C', 'q \\approx C',
      '250\\,\\mathrm{ms}', '0.25\\,\\mathrm{s}',
    ]);
  });

  it('keeps a non-math code and currency control free of the math runtime', async () => {
    const result = await compile('<!-- vs:id p -->\nCode: `$x$`. Currency: \\$5.\n');
    const html = output(result, '/index.html');
    expect(result.needsMath).toBe(false);
    expect(html).toContain('<code>$x$</code>');
    expect(html).toContain('Currency: $5.');
    expect(html).not.toContain('data-vs-math-key');
  });
});

function writeFixture(body: string): string {
  const path = join(dir, 'parse.md');
  writeFileSync(path, `${frontmatter}\n${body}`);
  return path;
}
