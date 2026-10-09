import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
// @ts-expect-error Checked JavaScript build plugin has no declaration.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

let bundle: string;
let patchedBundle: string;
test.beforeAll(async () => {
  bundle = (await build({ stdin: { contents: [
    "import katex from 'katex';",
    "import mermaid from 'mermaid';",
    "import {reserveMermaidMathInk} from './packages/runtime/src/mermaid-ink.ts';",
    'globalThis.InkTest = {katex, mermaid, reserveMermaidMathInk};',
  ].join('\n'), resolveDir: process.cwd(), sourcefile: 'mermaid-ink-test.js' },
  bundle: true, platform: 'browser', format: 'iife', write: false })).outputFiles[0]!.text;
  patchedBundle = (await build({ entryPoints: ['packages/runtime/src/mermaid-bundle.ts'],
    bundle: true, platform: 'browser', format: 'iife', minify: true, write: false,
    plugins: [mermaidMathPlugin(process.cwd())] })).outputFiles[0]!.text;
});

test('pinned Mermaid bundle reserves native node and edge math before layout', async ({ page }) => {
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: patchedBundle });
  const result = await page.evaluate(async () => {
    const mermaid = (window as any).mermaid;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
    const source = String.raw`flowchart LR
 A["Node $$\rlap{\rule{20em}{1em}}x$$<br>Second $$\frac{a}{b}$$"] -->|"Edge $$\\frac{a}{b}$$"| B["Other"]`;
    const rendered = await mermaid.render('patched-native-ink', source);
    document.querySelector('#rendered')!.innerHTML = rendered.svg;
    const svg = document.querySelector('#rendered svg')!;
    const labels = Array.from(svg.querySelectorAll('.node foreignObject, .edgeLabel foreignObject')) as SVGForeignObjectElement[];
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const shapes = Array.from(svg.querySelectorAll('.node')).map(node => {
      const shape = node.querySelector(':scope > rect, :scope > path');
      const label = node.querySelector('foreignObject');
      return { id: node.getAttribute('id'), shape: shape && rect(shape), label: label && rect(label),
        formulas: node.querySelectorAll('math').length };
    });
    const mathLabels = labels.filter(label => label.querySelector('math')).map(label => {
      const box = label.firstElementChild!.getBoundingClientRect();
      const ink = Array.from(label.querySelectorAll('math, math *')).map(element => element.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
      return { width: box.width, height: box.height, math: label.querySelectorAll('math').length,
        tex: Array.from(label.querySelectorAll('math')).map(formula => formula.getAttribute('data-vs-mermaid-formula')),
        box: rect(label),
        contained: ink.every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1 &&
          rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1) };
    });
    return { shapes, mathLabels };
  });
  const contains = (outer: {left:number;right:number;top:number;bottom:number}, inner: typeof outer) =>
    inner.left >= outer.left - 1 && inner.right <= outer.right + 1 &&
    inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
  const overlap = (a: {left:number;right:number;top:number;bottom:number}, b: typeof a) =>
    a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  expect(result.mathLabels).toHaveLength(2);
  expect(result.mathLabels.map(label => label.math).sort()).toEqual([1, 2]);
  expect(result.mathLabels.find(label => label.math === 2)!.tex).toEqual([
    String.raw`\rlap{\rule{20em}{1em}}x`, String.raw`\frac{a}{b}`,
  ]);
  expect(result.mathLabels.find(label => label.math === 1)!.tex).toEqual([String.raw`\frac{a}{b}`]);
  expect(result.mathLabels.every(label => label.width > 0 && label.height > 0 && label.contained)).toBe(true);
  expect(result.shapes).toHaveLength(2);
  for (const node of result.shapes) {
    expect(node.shape, `node ${node.id} has a shape`).toBeTruthy();
    expect(node.label, `node ${node.id} has a label`).toBeTruthy();
    expect(contains(node.shape!, node.label!), `node ${node.id} contains its label`).toBe(true);
  }
  expect(result.shapes.some(node => node.formulas === 2)).toBe(true);
  expect(overlap(result.shapes[0]!.shape!, result.shapes[1]!.shape!), 'neighboring node shapes separate').toBe(false);
  const edgeLabel = result.mathLabels.find(label => label.math === 1)!.box;
  expect(result.shapes.every(node => !overlap(node.shape!, edgeLabel)), 'edge label clears both node shapes').toBe(true);
});

test('pinned Mermaid cluster headers reserve ordinary and Markdown math ink', async ({ page }) => {
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: patchedBundle });
  for (const mode of ['ordinary', 'markdown'] as const) {
    const result = await page.evaluate(async mode => {
      const mermaid = (window as any).mermaid;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
      const title = mode === 'markdown'
        ? '["`Cluster $$\\rlap{\\rule{20em}{1em}}x$$`"]'
        : '["Cluster $$\\rlap{\\rule{20em}{1em}}x$$"]';
      const source = 'flowchart TB\n subgraph G' + title + '\n  A["Child one"] --> B["Child two"]\n end\n G --> C["After"]';
      const rendered = await mermaid.render('cluster-ink-' + mode, source);
      document.querySelector('#rendered')!.innerHTML = rendered.svg;
      const svg = document.querySelector('#rendered svg')!;
      const cluster = svg.querySelector('g.cluster')!;
      const shape = cluster.querySelector(':scope > rect, :scope > path')!;
      const label = cluster.querySelector('.cluster-label foreignObject')!;
      const rect = (element: Element) => {
        const b = element.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      };
      const ink = Array.from(label.querySelectorAll('math, math *')).map(rect)
        .filter(b => b.right > b.left && b.bottom > b.top);
      const children = Array.from(svg.querySelectorAll('g.node'))
        .filter(node => (node.textContent ?? '').includes('Child')).map(rect);
      return { viewport: rect(svg), shape: rect(shape), label: rect(label), ink, children,
        math: label.querySelectorAll('math').length, labelText: label.textContent ?? '' };
    }, mode);
    const contains = (outer: typeof result.shape, inner: typeof result.shape) =>
      inner.left >= outer.left - 1 && inner.right <= outer.right + 1 &&
      inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
    expect(result.math, `${mode} cluster has MathML`).toBe(1);
    expect(result.labelText).toContain('Cluster');
    expect(contains(result.shape, result.label), `${mode} header inside cluster shape`).toBe(true);
    expect(contains(result.viewport, result.label), `${mode} header inside viewBox`).toBe(true);
    expect(result.ink.length).toBeGreaterThan(0);
    expect(result.ink.every(box => contains(result.label, box)), `${mode} ink inside reserved header`).toBe(true);
    expect(result.children).toHaveLength(2);
    expect(result.children.every(child => child.top >= result.label.bottom + 1), `${mode} children clear header`).toBe(true);
  }
});

test('accepts the actual native flowchart createText foreignObject', async ({ page }) => {
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const api = (window as any).InkTest;
    api.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
    const source = String.raw`flowchart LR
 A["Node $$\rlap{\rule{20em}{1em}}x$$"] -->|"Edge $$\frac{a}{b}$$"| B["Other"]`;
    const rendered = await api.mermaid.render('native-ink', source);
    document.querySelector('#rendered')!.innerHTML = rendered.svg;
    const svg = document.querySelector('#rendered svg')!;
    const labels = Array.from(svg.querySelectorAll('.node foreignObject, .edgeLabel foreignObject')) as SVGForeignObjectElement[];
    return labels.filter(label => label.querySelector('math')).map(label => {
      const beforeText = label.textContent;
      const result = api.reserveMermaidMathInk(label);
      const box = label.firstElementChild!.getBoundingClientRect();
      const ink = Array.from(label.querySelectorAll('math, math *')).map(element => element.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
      return { result, preserved: label.textContent === beforeText,
        contained: ink.every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1 &&
          rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1) };
    });
  });
  expect(result).toHaveLength(2);
  expect(result.every(label => label.result.changed && label.preserved && label.contained)).toBe(true);
});

test('native MathML ink is reserved before Mermaid reads the first div bounds', async ({ page }) => {
  await page.setContent('<!doctype html><body><svg id="root" width="800" height="400" viewBox="0 0 400 200"></svg></body>');
  await page.addScriptTag({ content: bundle });
  for (const tex of [String.raw`\frac{a}{b}`, String.raw`\frac{\frac{a}{b}}{\frac{c}{d}}`,
    String.raw`\rlap{\rule{20em}{1em}}x`, String.raw`\smash{\frac{\frac{a}{b}}{\frac{c}{d}}}`]) {
    const result = await page.evaluate((tex) => {
      const api = (window as any).InkTest;
      const doc = document;
      const svg = doc.querySelector('#root')!;
      const foreign = doc.createElementNS('http://www.w3.org/2000/svg', 'foreignObject') as SVGForeignObjectElement;
      foreign.setAttribute('x', '20'); foreign.setAttribute('y', '20');
      foreign.setAttribute('width', '200'); foreign.setAttribute('height', '200');
      foreign.setAttribute('data-source', tex);
      const div = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      div.style.cssText = 'display:table-cell;white-space:nowrap;line-height:1.5;max-width:200px;font:16px Arial';
      const span = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      const rendered = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      rendered.style.cssText = 'display:flex;align-items:center;justify-content:center;white-space:nowrap';
      api.katex.render(tex, rendered, { throwOnError: true, displayMode: true, output: 'mathml' });
      span.append(rendered); div.append(span); foreign.append(div); svg.append(foreign);
      const rect = (element: Element) => {
        const r = element.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const before = rect(div);
      const first = api.reserveMermaidMathInk(foreign);
      const after = rect(div);
      const html = foreign.outerHTML;
      const second = api.reserveMermaidMathInk(foreign);
      const ink = Array.from(foreign.querySelectorAll('math, math *')).map(rect)
        .filter(r => r.right > r.left && r.bottom > r.top);
      const response = { before, after, first, second, sameHtml: html === foreign.outerHTML,
        ink, source: foreign.getAttribute('data-source'), math: foreign.querySelectorAll('math').length,
        divWidth: foreign.firstElementChild!.getBoundingClientRect().width,
        foreignWidth: foreign.getBoundingClientRect().width,
        children: foreign.querySelectorAll('math').length };
      foreign.remove();
      return response;
    }, tex);
    expect(result.first.changed).toBe(true);
    expect(result.second).toEqual(result.first);
    expect(result.sameHtml).toBe(true);
    expect(result.math).toBe(1);
    expect(result.children).toBe(1);
    expect(result.source).toBe(tex);
    expect(result.after.right - result.after.left).toBeGreaterThanOrEqual(result.first.width * 2 - 2);
    expect(result.after.bottom - result.after.top).toBeGreaterThanOrEqual(result.first.height * 2 - 2);
    for (const ink of result.ink) {
      expect(ink.left, `${tex} ink left`).toBeGreaterThanOrEqual(result.after.left - 1);
      expect(ink.right, `${tex} ink right`).toBeLessThanOrEqual(result.after.right + 1);
      expect(ink.top, `${tex} ink top`).toBeGreaterThanOrEqual(result.after.top - 1);
      expect(ink.bottom, `${tex} ink bottom`).toBeLessThanOrEqual(result.after.bottom + 1);
    }
  }
});

test('ordinary labels stay byte-for-byte unchanged; unsupported math structure fails closed', async ({ page }) => {
  await page.setContent('<!doctype html><body><svg id="root" width="400" height="200"></svg></body>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(() => {
    const svg = document.querySelector('#root')!;
    const make = (text: string) => {
      const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject') as SVGForeignObjectElement;
      fo.setAttribute('width', '200'); fo.setAttribute('height', '80');
      const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      div.style.cssText = 'display:table-cell;white-space:nowrap';
      const span = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      span.textContent = text; div.append(span); fo.append(div); svg.append(fo);
      return fo;
    };
    const plain = make('plain source');
    const before = plain.outerHTML;
    const bounds = (window as any).InkTest.reserveMermaidMathInk(plain);
    const unchanged = plain.outerHTML === before;
    plain.remove();
    const empty = make('');
    const emptyBefore = empty.outerHTML;
    const emptyBounds = (window as any).InkTest.reserveMermaidMathInk(empty);
    const emptyUnchanged = empty.outerHTML === emptyBefore;
    empty.remove();
    const bad = make('math');
    const math = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'math');
    bad.firstElementChild!.append(math); // second child is not native Mermaid's span
    let error = '';
    try { (window as any).InkTest.reserveMermaidMathInk(bad); }
    catch (cause) { error = String(cause); }
    bad.remove();
    return { bounds, unchanged, emptyBounds, emptyUnchanged, error };
  });
  expect(result.bounds.changed).toBe(false);
  expect(result.unchanged).toBe(true);
  expect(result.emptyBounds.changed).toBe(false);
  expect(result.emptyUnchanged).toBe(true);
  expect(result.error).toContain('Unsupported Mermaid math label content');
});

test('source/MathML mismatch fails without mutation; verified formula tags are stable', async ({ page }) => {
  await page.setContent('<!doctype html><body><svg id="root" width="500" height="250"></svg></body>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(() => {
    const api = (window as any).InkTest;
    const svg = document.querySelector('#root')!;
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject') as SVGForeignObjectElement;
    fo.setAttribute('width', '300'); fo.setAttribute('height', '200');
    const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    div.style.cssText = 'display:table-cell;white-space:nowrap;line-height:1.5;font:16px Arial';
    const span = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
    api.katex.render('x', span, { throwOnError: true, displayMode: true, output: 'mathml' });
    div.append(span); fo.append(div); svg.append(fo);
    const before = fo.outerHTML;
    const messages: string[] = [];
    for (const label of ['$$x$$ $$y$$', '$$y$$']) {
      try { api.reserveMermaidMathInk(fo, label); }
      catch (error) { messages.push(String(error)); }
    }
    const unchanged = fo.outerHTML === before;
    const first = api.reserveMermaidMathInk(fo, '$$x$$');
    const second = api.reserveMermaidMathInk(fo, '$$x$$');
    const tagged = fo.querySelector('math')?.getAttribute('data-vs-mermaid-formula');
    let stale = '';
    fo.querySelector('math')!.setAttribute('data-vs-mermaid-formula', 'y');
    try { api.reserveMermaidMathInk(fo, '$$x$$'); }
    catch (error) { stale = String(error); }
    fo.remove();
    return { messages, unchanged, first, second, tagged, stale };
  });
  expect(result.messages[0]).toContain('count differs');
  expect(result.messages[1]).toContain('TeX differs');
  expect(result.unchanged).toBe(true);
  expect(result.first.changed).toBe(true);
  expect(result.second).toEqual(result.first);
  expect(result.tagged).toBe('x');
  expect(result.stale).toContain('binding changed');
});
