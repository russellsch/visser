// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyRichContent } from '../../packages/runtime/src/rich-copy.ts';
import { processMathBatch } from '../../packages/runtime/src/math-worker.ts';
import type { MathWorkRequest, MathWorkResponse } from '../../packages/runtime/src/math-worker.ts';

function setup() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="source"></div><div id="dest"></div></body></html>');
  for (const name of ['Node', 'Element', 'Document', 'Blob'] as const) vi.stubGlobal(name, dom.window[name]);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:math'), revokeObjectURL: vi.fn() });
  return { doc: dom.window.document, source: dom.window.document.getElementById('source')!,
    dest: dom.window.document.getElementById('dest')! };
}

afterEach(() => vi.unstubAllGlobals());

describe('safe rich content copy', () => {
  it('preserves authored math, code, and emphasis without duplicating generated or interactive nodes', async () => {
    const { doc, source, dest } = setup();
    source.setAttribute('data-vs-generated', ''); // A qualifications root may be generated.
    source.innerHTML = '<code>$x$ is literal</code> <em>rate</em> ' +
      '<a href="#x-other" id="link" data-vs-target="other">linked</a> ' +
      '<span class="vs-math" data-vs-math-key="[false,&quot;x&quot;]">' +
      '<span class="vs-math-source">$x$</span><span class="vs-math-visual" data-vs-generated><svg></svg></span>' +
      '<button data-vs-generated>Copy LaTeX</button></span>' +
      '<span data-vs-generated>Generated cue</span><button>Unmarked control</button>';
    await copyRichContent(source, dest);
    expect(dest.querySelector('code')?.textContent).toBe('$x$ is literal');
    expect(dest.querySelector('em')?.textContent).toBe('rate');
    expect(dest.textContent).toContain('linked');
    expect(dest.querySelector('.vs-math-source')?.textContent).toBe('$x$');
    expect(dest.querySelector('.vs-math')?.getAttribute('data-vs-math-key')).toBe('[false,"x"]');
    expect(dest.querySelectorAll('a,button,svg,[id],[data-vs-target],[data-vs-generated]')).toHaveLength(0);
    expect(dest.textContent).not.toMatch(/Copy LaTeX|Generated cue|Unmarked control/);
    expect(doc.getElementById('link')).toBe(source.querySelector('a'));
  });

  it('treats math as atomic when a text limit falls inside its source', async () => {
    const { source, dest } = setup();
    source.innerHTML = 'Start <span class="vs-math" data-vs-math-key="[false,&quot;x&quot;]">' +
      '<span class="vs-math-source">$x$</span></span> tail';
    await copyRichContent(source, dest, { textLimit: 7 });
    expect(dest.textContent).toBe('Start $x$');
    expect(dest.querySelectorAll('.vs-math')).toHaveLength(1);
    await copyRichContent(source, dest, { textLimit: 6 });
    expect(dest.textContent).toBe('Start ');
    expect(dest.querySelector('.vs-math')).toBeNull();
  });

  it('renders copied placeholders through the existing worker boundary when available', async () => {
    const { doc, source, dest } = setup();
    const key = JSON.stringify([false, 'x']);
    const meta = doc.createElement('meta');
    meta.name = 'vs-math-expressions';
    meta.content = JSON.stringify([{ key, tex: 'x', display: false }]);
    doc.head.append(meta);
    source.innerHTML = `<span class="vs-math" data-vs-math-key='${key}'><span class="vs-math-source">$x$</span></span>`;
    vi.stubGlobal('__visserMathWorkerSource', 'worker source');
    vi.stubGlobal('Worker', class {
      onmessage: ((event: MessageEvent<MathWorkResponse>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(_url: string) {}
      postMessage(request: MathWorkRequest) {
        queueMicrotask(() => this.onmessage?.({ data: processMathBatch(request) } as MessageEvent<MathWorkResponse>));
      }
      terminate() {}
    });
    await copyRichContent(source, dest);
    expect(dest.querySelector('.vs-math-source')?.textContent).toBe('$x$');
    expect(dest.querySelector('.vs-math-visual svg')).not.toBeNull();
    expect(dest.querySelector('[data-vs-math-rendered]')).not.toBeNull();
    expect(dest.querySelectorAll('[id],[data-vs-target],a')).toHaveLength(0);
  });
});
