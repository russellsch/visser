import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/compile.ts';

const dir = mkdtempSync(join(tmpdir(), 'visser-math-compile-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const frontmatter = readFileSync(new URL('../../examples/bounded-queue/index.md', import.meta.url), 'utf8').split('---')[1];
const toolkit = { version: '0.0.0', sha256: 'a'.repeat(64), assets: { 'math.js': 'b'.repeat(64) } };
async function compile(body: string) {
  writeFileSync(join(dir, 'index.md'), `---${frontmatter}---\n\n${body}`);
  return compileDocument(loadBundle(join(dir, 'index.md')), toolkit, { audience: 'private', includeSource: false, layoutFallback: false });
}

describe('math compiler source and validation @M03 @M05 @M06 @M07', () => {
  it('emits readable source, stable equation anchors and forward reference numbers', async () => {
    const result = await compile('<!-- vs:id p -->\nUse $x^2$ and {% eqref ref="eq_energy" /%}.\n\n{% equation id="eq_energy" %}\nE = mc^2\n{% /equation %}\n');
    const html = new TextDecoder().decode(result.files.find(f => f.path.endsWith('/index.html'))!.bytes);
    expect(result.needsMath).toBe(true);
    expect(html).toContain('class="vs-math-source">$x^2$');
    expect(html).toMatch(/href="#x-eq_energy"[^>]*>Equation \(1\)<\/a>/);
    expect(html.match(/id="x-eq_energy"/g)).toHaveLength(1);
    expect(html).toContain('class="vs-math-source">$$\nE = mc^2\n$$');
    const markdown = new TextDecoder().decode(result.files.find(f => f.path.endsWith('/document.md'))!.bytes);
    expect(markdown).toContain('[Equation (1)](#x-eq_energy)');
    expect(markdown).toContain('<!-- vs:target eq_energy -->\nEquation (1)\n```latex\nE = mc^2\n```');
    expect(html).toContain('worker-src blob:');
    expect(html).toContain('/math.js" defer integrity="sha256-');
    expect(html).toContain('name="vs-math-expressions"');
    expect(result.manifest.assets.map(a => a.path)).toContain('math.js');
  });
  it('rejects unsupported math before returning output', async () => {
    await expect(compile('<!-- vs:id p -->\n$\\unknownVisserCommand{x}$\n')).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'E_MATH', path: 'index.md', targetId: 'p' })],
    });
  });
  it('keeps nonmath documents free of math assets and worker CSP', async () => {
    const result = await compile('<!-- vs:id p -->\nOrdinary prose and `$x$` code.\n');
    const html = new TextDecoder().decode(result.files.find(f => f.path.endsWith('/index.html'))!.bytes);
    expect(result.needsMath).toBe(false);
    expect(html).not.toContain('worker-src');
    expect(result.manifest.assets.map(a => a.path)).not.toContain('math.js');
  });
  it('typesets decoded detail labels and questions while leaving code literal', async () => {
    const result = await compile('<!-- vs:id heading -->\n# Literal `$x$`\n\n{% detail id="detail_math" label="Value $x_i$" %}\nA description with `$code$`.\n{% /detail %}\n\n{% self-check id="quiz" question="Is $x<y>z$ true?" %}\nCheck the two comparisons.\n{% /self-check %}\n');
    const html = new TextDecoder().decode(result.files.find(f => f.path.endsWith('/index.html'))!.bytes);
    expect(html).toContain('class="vs-math-source">$x_i$');
    expect(html).toContain('class="vs-math-source">$x&lt;y&gt;z$');
    expect(html).toContain('<code>$x$</code>');
    expect(html).toContain('<code>$code$</code>');
    expect(html).not.toContain('class="vs-math-source">$code$');
    expect(html).not.toContain('[object Object]');
  });
  it('reserves native graph math and exposes its text view before rendering', async () => {
    const result = await compile(String.raw`{% graph id="g" mode="architecture" title="Ratios" question="What changes?" %}
{% node id="n" role="process" label="Rate $\\frac{a}{b}$" /%}
{% /graph %}
`);
    const html = new TextDecoder().decode(result.files.find(f => f.path.endsWith('/index.html'))!.bytes);
    expect(html).toContain('data-vs-math-figure');
    expect(html).toContain('data-vs-math-native');
    expect(html).toContain('class="vs-math-source">$\\frac{a}{b}$');
    expect(html).toContain('class="vs-lists"');
    expect(html).not.toContain('data-vs-math-ready');
  });
  it('does not pair dollar delimiters across reading display and unit fields', async () => {
    const result = await compile(`{% measure id="m" title="Costs" question="How much?" unit="kg$" %}
{% reading id="r" label="Cost" value=5 valueStatus="measured" display="$5" /%}
{% /measure %}
`);
    const html = new TextDecoder().decode(result.files.find(f => f.path.endsWith('/index.html'))!.bytes);
    expect(result.needsMath).toBe(false);
    expect(html).toContain('$5 kg$');
    expect(html).not.toContain('data-vs-math-key');
  });

});
