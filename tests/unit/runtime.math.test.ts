// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeMath } from '../../packages/runtime/src/math.ts';
import { copyRichContent } from '../../packages/runtime/src/rich-copy.ts';
import { processMathBatch } from '../../packages/runtime/src/math-worker.ts';
import type { MathConversion } from '../../packages/core/src/math/engine.ts';
import { insertedMathCost, MATH_FINGERPRINT_INPUTS, MATH_LIMITS } from '../../packages/core/src/math/policy.ts';
import { convertMath } from '../../packages/core/src/math/engine.ts';
import type { MathWorkRequest, MathWorkResponse } from '../../packages/runtime/src/math-worker.ts';

const encoder = new TextEncoder();
function conversion(tex = 'x', bad = false): MathConversion {
  const attrs: Record<string, string> = { xmlns: 'http://www.w3.org/2000/svg', width: '1ex', height: '1ex',
    role: 'img', focusable: 'false', viewBox: '0 -442 442 442', ...(bad ? { onload: 'alert(1)' } : {}) };
  const svgBytes = encoder.encode(`<svg${Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}></svg>`).length;
  return {
    source: tex, display: false, svg: { tag: 'svg', attrs, children: [] },
    metrics: { widthEm: 0.5, heightEm: 0.5, depthEm: 0, ascentEm: 0.5 },
    svgBytes, elementCount: 1, fingerprintInputs: MATH_FINGERPRINT_INPUTS,
  };
}

type FakeWorkerInstance = {
  onmessage: ((event: MessageEvent<MathWorkResponse>) => void) | null;
  onerror: ((event: Event) => void) | null;
  postMessage(request: MathWorkRequest): void;
  terminate(): void;
};
let requests: MathWorkRequest[];
let workers: FakeWorkerInstance[];
let terminated: number;
let responder: ((request: MathWorkRequest) => MathWorkResponse | undefined);
let doc: Document;

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><body></body>');
  doc = dom.window.document;
  vi.stubGlobal('Document', dom.window.Document);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('Worker', class implements FakeWorkerInstance {
    onmessage: ((event: MessageEvent<MathWorkResponse>) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    constructor(_url: string) { workers.push(this); }
    postMessage(request: MathWorkRequest): void {
      requests.push(request);
      const result = responder(request);
      if (result) queueMicrotask(() => this.onmessage?.({ data: result } as MessageEvent<MathWorkResponse>));
    }
    terminate(): void { terminated++; }
  });
  vi.stubGlobal('Blob', dom.window.Blob);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:math'), revokeObjectURL: vi.fn() });
  requests = [];
  workers = [];
  terminated = 0;
  responder = request => ({ id: request.id, results: request.items.map(item => ({ key: item.key, conversion: conversion(item.tex) })) });
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('browser math foundation', () => {
  it('releases resize observations after transient rich copies are replaced or removed @M11 @M12', async () => {
    const observed = new Set<Element>();
    Object.defineProperty(doc.defaultView!, 'ResizeObserver', { configurable: true, value: class {
      observe(node: Element) { observed.add(node); }
      unobserve(node: Element) { observed.delete(node); }
      disconnect() { observed.clear(); }
    } });
    const key = JSON.stringify([false, 'x']);
    const source = doc.createElement('div');
    source.innerHTML = `<span class="vs-math" data-vs-math-key='${key}'><span class="vs-math-source">$x$</span></span>`;
    const meta = doc.createElement('meta');
    meta.name = 'vs-math-expressions';
    meta.content = JSON.stringify([{ key, tex: 'x', display: false }]);
    doc.head.append(meta);
    vi.stubGlobal('__visserMathWorkerSource', 'worker source');
    const destination = doc.createElement('div');
    doc.body.append(destination);
    for (let i = 0; i < 4; i++) {
      await copyRichContent(source, destination);
      await Promise.resolve();
      expect(observed.size).toBe(1);
      expect([...observed].every(node => node.isConnected)).toBe(true);
    }
    const move = doc.createElement('div');
    doc.body.append(move);
    move.append(destination);
    await Promise.resolve();
    expect(observed.size).toBe(1);
    destination.remove();
    await Promise.resolve();
    expect(observed.size).toBe(0);
    await copyRichContent(source, destination);
    expect(observed.size).toBe(0);
    doc.body.append(destination);
    await Promise.resolve();
    expect(observed.size).toBe(1);
    destination.replaceChildren();
    await Promise.resolve();
    expect(observed.size).toBe(0);
  });
  it('normalizes native dimension spelling before charging inserted attributes @M10 @M11', async () => {
    doc.body.innerHTML = `<svg><svg data-vs-math-native data-vs-math-key="k" width="${'0'.repeat(300)}7" height="7"></svg></svg>`;
    const result = await initializeMath(doc, 'worker source', [{ key: 'k', tex: 'x', display: false }]);
    expect(result).toEqual({ rendered: 1, failed: 0, skipped: 0 });
    const slot = doc.querySelector('[data-vs-math-native]')!;
    expect(slot.firstElementChild?.getAttribute('width')).toBe('7');
    expect(slot.getAttribute('data-vs-math-svg-bytes')).toBe(String(insertedMathCost(conversion()).svgBytes));
  });

  it.each([0, 1])('uses the compiler insertion charge at the document byte boundary (excess=%s) @M11', async excess => {
    const tex = 'x x x x x x x x x x';
    const charge = insertedMathCost(convertMath(tex, false));
    doc.body.innerHTML = `<span data-vs-math-key="previous" data-vs-math-rendered
      data-vs-math-svg-bytes="${MATH_LIMITS.documentSvgBytes - charge.svgBytes + excess}"
      data-vs-math-elements="0"></span><span data-vs-math-key="k"><span class="vs-math-source">source</span></span>`;
    responder = request => processMathBatch(request);
    const result = await initializeMath(doc, 'worker source', [{ key: 'k', tex, display: false }]);
    expect(result.rendered).toBe(excess ? 0 : 1);
    expect(result.failed).toBe(excess ? 1 : 0);
    if (!excess) expect(doc.querySelector('[data-vs-math-key="k"]')?.getAttribute('data-vs-math-svg-bytes')).toBe(String(charge.svgBytes));
    expect(doc.querySelector('.vs-math-source')?.textContent).toBe('source');
  });

  it('converts bounded worker batches and reports individual invalid expressions', () => {
    const result = processMathBatch({ id: 7, items: [
      { key: 'ok', tex: 'x^2', display: false },
      { key: 'bad', tex: '\\notacommand{x}', display: false },
    ] });
    expect(result.id).toBe(7);
    expect(result.results[0]?.conversion?.svg.tag).toBe('svg');
    expect(result.results[1]?.error).toBeTruthy();
  });

  it('accepts the pinned font no-ink path for a TeX text space', () => {
    const result = processMathBatch({ id: 8, items: [
      { key: 'space', tex: '\\left|x\\right| + \\text{cost \\$5}', display: false },
    ] });
    expect(result.results[0]?.error).toBeUndefined();
    expect(result.results[0]?.conversion?.svg.tag).toBe('svg');
  });

  it('inserts an actual converted text-space formula without dropping source', async () => {
    const tex = '\\left|x\\right| + \\text{cost \\$5}';
    doc.body.innerHTML = '<span data-vs-math-key="space"><span class="vs-math-source">source</span></span>';
    responder = request => processMathBatch(request);
    expect(await initializeMath(doc, 'worker source', [{ key: 'space', tex, display: false }])).toEqual({ rendered: 1, failed: 0, skipped: 0 });
    expect(doc.querySelector('path[d=""]')).not.toBeNull();
    expect(doc.querySelector('.vs-math-source')?.textContent).toBe('source');
  });

  it('does not start a worker for a page without explicit placeholders', async () => {
    expect(await initializeMath(doc, 'worker source', [])).toEqual({ rendered: 0, failed: 0, skipped: 0 });
    expect(requests).toEqual([]);
  });

  it('shares one conversion for repeated source, retains source and targets, and is idempotent', async () => {
    doc.body.innerHTML = '<span id="x-a" data-vs-math-key="k"><span class="vs-math-source">$x$</span></span><span data-vs-math-key="k"><span class="vs-math-source">$x$</span></span>';
    const root = doc.getElementById('x-a')!;
    const records = [{ key: 'k', tex: 'x', display: false }] as const;
    expect(await initializeMath(doc, 'worker source', records)).toEqual({ rendered: 2, failed: 0, skipped: 0 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.items).toHaveLength(1);
    expect(doc.querySelectorAll('.vs-math-visual svg')).toHaveLength(2);
    expect(doc.querySelectorAll('.vs-math-source')).toHaveLength(2);
    expect(root.id).toBe('x-a');
    expect(root.textContent).toContain('$x$');
    expect(root.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('svg')?.getAttribute('width')).toBe('0.5em');
    expect(root.querySelector('svg')?.getAttribute('height')).toBe('0.5em');
    expect((root.querySelector('svg') as SVGElement).style.verticalAlign).toBe('0em');
    expect(root.querySelector('[data-vs-math-copy]')?.hasAttribute('data-vs-generated')).toBe(true);
    expect(await initializeMath(doc, 'worker source', records)).toEqual({ rendered: 0, failed: 0, skipped: 2 });
    expect(requests).toHaveLength(1);
  });

  it('copies original TeX through a text API without selecting generated SVG', async () => {
    doc.body.innerHTML = '<span data-vs-math-key="k"><span class="vs-math-source">$x$</span></span>';
    const copy = vi.fn(async (_text: string) => {});
    Object.defineProperty(doc.defaultView!.navigator, 'clipboard', { value: { writeText: copy }, configurable: true });
    await initializeMath(doc, 'worker source', [{ key: 'k', tex: 'x', display: false }]);
    const button = doc.querySelector('[data-vs-math-copy]') as HTMLElement;
    expect(button.getAttribute('aria-label')).toBe('Copy LaTeX source');
    expect(button.querySelector('.vs-math-copy-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(button.textContent).toBe('');
    button.click();
    await Promise.resolve();
    expect(copy).toHaveBeenCalledWith('x');
    expect(button.getAttribute('data-vs-copy-state')).toBe('copied');
    expect(button.getAttribute('title')).toBe('Copied LaTeX');
    expect(button.querySelector('[role="status"]')?.textContent).toBe('Copied LaTeX');
    copy.mockRejectedValueOnce(new Error('Denied'));
    button.click();
    await Promise.resolve();
    expect(button.getAttribute('data-vs-copy-state')).toBe('unavailable');
    expect(button.getAttribute('aria-label')).toBe('Copy unavailable');
    expect(button.querySelector('[role="status"]')?.textContent).toBe('Copy unavailable');
  });

  it('rejects unsafe structured SVG and keeps the source visible', async () => {
    doc.body.innerHTML = '<span data-vs-math-key="k"><span class="vs-math-source">$x$</span></span>';
    responder = request => ({ id: request.id, results: [{ key: 'k', conversion: conversion('x', true) }] });
    expect(await initializeMath(doc, 'worker source', [{ key: 'k', tex: 'x', display: false }])).toEqual({ rendered: 0, failed: 1, skipped: 0 });
    expect(doc.querySelector('svg')).toBeNull();
    expect(doc.querySelector('.vs-math-source')?.textContent).toBe('$x$');
    expect(doc.querySelector('.vs-math-notice')?.textContent).toContain('source remains available');
    expect(doc.querySelector('.vs-math-notice')?.hasAttribute('data-vs-generated')).toBe(true);
  });

  it('fails closed when the worker exceeds its two-second batch deadline', async () => {
    vi.useFakeTimers();
    doc.body.innerHTML = '<span data-vs-math-key="k">$x$</span>';
    responder = () => undefined;
    const task = initializeMath(doc, 'worker source', [{ key: 'k', tex: 'x', display: false }]);
    await vi.advanceTimersByTimeAsync(2001);
    expect(await task).toEqual({ rendered: 0, failed: 1, skipped: 0 });
    expect(terminated).toBeGreaterThan(0);
    expect(doc.querySelector('.vs-math-source')?.textContent).toBe('$x$');
  });

  it('enforces the occurrence budget before starting a worker', async () => {
    doc.body.innerHTML = '<span data-vs-math-key="k">$x$</span>'.repeat(1001);
    expect(await initializeMath(doc, 'worker source', [{ key: 'k', tex: 'x', display: false }])).toEqual({ rendered: 0, failed: 1001, skipped: 0 });
    expect(requests).toEqual([]);
  });

  it('recounts the shared document budget when concurrent roots finish', async () => {
    doc.body.innerHTML = `<span data-vs-math-key="baseline" data-vs-math-rendered
      data-vs-math-svg-bytes="0" data-vs-math-elements="${MATH_LIMITS.documentElements - 1}"></span>
      <div id="first"><span data-vs-math-key="a"><span class="vs-math-source">$x$</span></span></div>
      <div id="second"><span data-vs-math-key="b"><span class="vs-math-source">$y$</span></span></div>`;
    const first = doc.getElementById('first')!;
    const second = doc.getElementById('second')!;
    const results = await Promise.all([
      initializeMath(first, 'worker source', [{ key: 'a', tex: 'x', display: false }]),
      initializeMath(second, 'worker source', [{ key: 'b', tex: 'y', display: false }]),
    ]);
    expect(results.reduce((sum, result) => sum + result.rendered, 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + result.failed, 0)).toBe(1);
    expect(doc.querySelectorAll('#first [data-vs-math-rendered], #second [data-vs-math-rendered]')).toHaveLength(1);
    expect(doc.querySelectorAll('#first .vs-math-source, #second .vs-math-source')).toHaveLength(2);
  });

  it('queues document workers and rescans a root replaced during conversion', async () => {
    doc.body.innerHTML = '<div id="viewer"><span data-vs-math-key="old"><span class="vs-math-source">$x$</span></span></div>';
    const root = doc.getElementById('viewer')!;
    responder = request => request.items[0]?.key === 'old' ? undefined :
      ({ id: request.id, results: request.items.map(item => ({ key: item.key, conversion: conversion(item.tex) })) });
    const first = initializeMath(root, 'worker source', [{ key: 'old', tex: 'x', display: false }]);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    root.innerHTML = '<span data-vs-math-key="new"><span class="vs-math-source">$y$</span></span>';
    const second = initializeMath(root, 'worker source', [{ key: 'new', tex: 'y', display: false }]);
    root.innerHTML = '<span data-vs-math-key="latest"><span class="vs-math-source">$z$</span></span>';
    const third = initializeMath(root, 'worker source', [{ key: 'latest', tex: 'z', display: false }]);
    expect(third).toBe(second);
    expect(requests).toHaveLength(1);
    workers[0]!.onmessage?.({ data: { id: requests[0]!.id, results: [
      { key: 'old', conversion: conversion('x') },
    ] } } as MessageEvent<MathWorkResponse>);
    expect(await first).toEqual({ rendered: 0, failed: 0, skipped: 1 });
    expect(await second).toEqual({ rendered: 1, failed: 0, skipped: 0 });
    expect(requests.map(request => request.items[0]?.key)).toEqual(['old', 'latest']);
    expect(root.querySelectorAll('.vs-math-visual svg')).toHaveLength(1);
    expect(root.querySelector('[data-vs-math-key="old"]')).toBeNull();
    expect(root.querySelector('.vs-math-source')?.textContent).toBe('$z$');
  });

  it('starts only one worker at a time for distinct roots in one document', async () => {
    doc.body.innerHTML = '<div id="a"><span data-vs-math-key="a">$x$</span></div><div id="b"><span data-vs-math-key="b">$y$</span></div>';
    responder = () => undefined;
    const first = initializeMath(doc.getElementById('a')!, 'worker source', [{ key: 'a', tex: 'x', display: false }]);
    const second = initializeMath(doc.getElementById('b')!, 'worker source', [{ key: 'b', tex: 'y', display: false }]);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(workers).toHaveLength(1);
    workers[0]!.onmessage?.({ data: { id: requests[0]!.id, results: [
      { key: 'a', conversion: conversion('x') },
    ] } } as MessageEvent<MathWorkResponse>);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(terminated).toBe(1);
    workers[1]!.onmessage?.({ data: { id: requests[1]!.id, results: [
      { key: 'b', conversion: conversion('y') },
    ] } } as MessageEvent<MathWorkResponse>);
    expect(await Promise.all([first, second])).toEqual([
      { rendered: 1, failed: 0, skipped: 0 },
      { rendered: 1, failed: 0, skipped: 0 },
    ]);
  });

  it('fills measured native SVG slots without changing figure geometry or target ancestors', async () => {
    const items = [
      { key: 'fraction', tex: '\\frac{a}{b}', display: false },
      { key: 'matrix', tex: '\\begin{matrix}a&b\\\\c&d\\end{matrix}', display: false },
    ];
    const measured = processMathBatch({ id: 0, items }).results;
    const size = (index: number) => {
      const metric = measured[index]!.conversion!.metrics;
      return { width: String(Math.ceil(metric.widthEm * 14)), height: String(Math.ceil(metric.heightEm * 14)) };
    };
    const fraction = size(0), matrix = size(1);
    doc.body.innerHTML = `<figure data-vs-math-figure><svg width="300" height="180"><g data-vs-target="graph-node">
      <svg data-vs-math-native data-vs-math-key="fraction" x="11" y="17" width="${fraction.width}" height="${fraction.height}"></svg>
      <svg data-vs-math-native data-vs-math-key="matrix" x="42" y="29" width="${matrix.width}" height="${matrix.height}"></svg>
      </g></svg><ul><li>fraction source</li><li>matrix source</li></ul></figure>`;
    responder = request => processMathBatch(request);
    const figure = doc.querySelector('figure')!;
    expect(figure.hasAttribute('data-vs-math-ready')).toBe(false);
    expect(await initializeMath(doc, 'worker source', items)).toEqual({ rendered: 2, failed: 0, skipped: 0 });
    expect(figure.hasAttribute('data-vs-math-ready')).toBe(true);
    const slots = Array.from(figure.querySelectorAll('[data-vs-math-native]'));
    expect(slots.map(slot => [slot.getAttribute('x'), slot.getAttribute('y'), slot.getAttribute('width'), slot.getAttribute('height')]))
      .toEqual([['11', '17', fraction.width, fraction.height], ['42', '29', matrix.width, matrix.height]]);
    for (const slot of slots) {
      expect(slot.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(slot.closest('[data-vs-target]')?.getAttribute('data-vs-target')).toBe('graph-node');
      expect(slot.children).toHaveLength(1);
      const glyph = slot.firstElementChild!;
      expect(glyph.localName).toBe('svg');
      expect(glyph.getAttribute('x')).toBe('0');
      expect(glyph.getAttribute('y')).toBe('0');
      expect(glyph.getAttribute('width')).toBe(slot.getAttribute('width'));
      expect(glyph.getAttribute('height')).toBe(slot.getAttribute('height'));
      expect(glyph.getAttribute('aria-hidden')).toBe('true');
      expect(glyph.querySelector('[id]')).toBeNull();
      expect(slot.querySelector('span,button,foreignObject')).toBeNull();
    }
    expect(figure.querySelector('ul')?.textContent).toContain('matrix source');
    doc.body.append(figure); // Movement must not duplicate glyphs or IDs.
    expect(await initializeMath(doc, 'worker source', items)).toEqual({ rendered: 0, failed: 0, skipped: 2 });
    expect(slots.every(slot => slot.children.length === 1)).toBe(true);
  });

  it('keeps a native figure hidden until all slots render and leaves its list available on failure', async () => {
    const valid = processMathBatch({ id: 0, items: [{ key: 'ok', tex: 'x', display: false }] }).results[0]!.conversion!;
    const width = Math.ceil(valid.metrics.widthEm * 14), height = Math.ceil(valid.metrics.heightEm * 14);
    doc.body.innerHTML = `<figure data-vs-math-figure><svg><svg data-vs-math-native data-vs-math-key="ok" width="${width}" height="${height}"></svg>
      <svg data-vs-math-native data-vs-math-key="bad" width="${width}" height="${height}"></svg></svg><ul><li>complete source list</li></ul></figure>`;
    responder = request => processMathBatch(request);
    expect(await initializeMath(doc, 'worker source', [
      { key: 'ok', tex: 'x', display: false }, { key: 'bad', tex: '\\notacommand{x}', display: false },
    ])).toEqual({ rendered: 1, failed: 1, skipped: 0 });
    const figure = doc.querySelector('figure')!;
    expect(figure.hasAttribute('data-vs-math-ready')).toBe(false);
    expect(figure.querySelector('ul')?.textContent).toBe('complete source list');
    expect(figure.querySelector('[data-vs-math-key="bad"]')?.children).toHaveLength(0);
    expect(figure.querySelector('span,button,foreignObject')).toBeNull();
  });

  it('refuses an undersized native slot instead of clipping the equation', async () => {
    doc.body.innerHTML = '<figure data-vs-math-figure><svg><svg data-vs-math-native data-vs-math-key="f" width="1" height="1"></svg></svg><ul><li>fraction source</li></ul></figure>';
    responder = request => processMathBatch(request);
    expect(await initializeMath(doc, 'worker source', [{ key: 'f', tex: '\\frac{a}{b}', display: false }]))
      .toEqual({ rendered: 0, failed: 1, skipped: 0 });
    expect(doc.querySelector('[data-vs-math-figure]')?.hasAttribute('data-vs-math-ready')).toBe(false);
    expect(doc.querySelector('[data-vs-math-native]')?.children).toHaveLength(0);
    expect(doc.querySelector('ul')?.textContent).toBe('fraction source');
  });
});
