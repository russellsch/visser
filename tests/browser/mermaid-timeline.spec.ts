import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error The checked build plugin has no TypeScript declaration.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const plain = 'timeline LR\n title Plain\n section Plan\n Task\n : Event\n section Ship\n Done';
const cases = [
  { name: 'LR sections', source: String.raw`timeline LR
 title Analysis $$\frac{a+b}{c+d}$$ across all stages
 section Heading $$\rlap{\rule{20em}{1em}}x$$
 Task $$\begin{matrix}a&b\\c&d\end{matrix}$$
 : event $$\frac{\frac{a}{b}}{\frac{c}{d}}$$
 : event $$x^2$$
 section Next $$s$$
 Finish $$y$$`, keys: ['title','section:0','task:0:0','event:0:0:0','event:0:0:1','section:1','task:1:1'] },
  { name: 'TD sections', source: String.raw`timeline TD
 title Vertical $$\frac{a}{b}$$ layout
 section Phase $$\rlap{\rule{20em}{1em}}x$$
 Task $$\begin{matrix}a&b\\c&d\end{matrix}$$
 : event $$\frac{\frac{a}{b}}{\frac{c}{d}}$$
 : event $$x^2$$
 section Next $$s$$
 Finish $$y$$`, keys: ['title','section:0','task:0:0','event:0:0:0','event:0:0:1','section:1','task:1:1'] },
  { name: 'LR no sections', source: String.raw`timeline LR
 title Free $$x$$
 Task $$\frac{a}{b}$$
 : event $$\frac{\frac{a}{b}}{\frac{c}{d}}$$
 Next $$y$$`, keys: ['title','task:none:0','event:none:0:0','task:none:1'] },
  { name: 'TD no sections', source: String.raw`timeline TD
 title Free $$x$$
 Task $$\rlap{\rule{20em}{1em}}x$$
 : event $$\frac{\frac{a}{b}}{\frac{c}{d}}$$
 Next $$y$$`, keys: ['title','task:none:0','event:none:0:0','task:none:1'] },
  { name: 'repeated sections', source: String.raw`timeline LR
 title Repeated $$x$$
 section Same $$s$$
 One $$a$$
 : event $$e$$
 section Same $$s$$
 Two $$b$$`, keys: ['title','section:0','section:1','task:0:0','task:0:1','task:1:0','task:1:1','event:0:0:0','event:1:0:0'] },
] as const;

let bundle: string;
let upstreamBundle: string;
test.beforeAll(async () => {
  const options = { bundle: true, platform: 'browser' as const, format: 'iife' as const, minify: true, write: false as const };
  bundle = (await build({ ...options, entryPoints: [resolve(root, 'packages/runtime/src/mermaid-bundle.ts')],
    plugins: [mermaidMathPlugin(root)] })).outputFiles[0]!.text;
  upstreamBundle = (await build({ ...options, stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaidOriginal = mermaid;",
    resolveDir: root, sourcefile: 'mermaid-original.js' } })).outputFiles[0]!.text;
});

test('timeline math geometry and paint order in both directions', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: bundle });
  await page.addScriptTag({ content: upstreamBundle });
  const config = { startOnLoad: false, securityLevel: 'strict', theme: 'base',
    themeVariables: { fontFamily: 'Arial, sans-serif', fontSize: '14px' }, timeline: { useMaxWidth: false } };
  const parity = await page.evaluate(async ({ source, config }) => {
    const patched = (window as any).mermaid, original = (window as any).mermaidOriginal;
    patched.initialize(config); original.initialize(config);
    const first = await patched.render('plain-patched', source);
    const second = await original.render('plain-original', source);
    const host = document.getElementById('rendered')!;
    const values = (markup: string) => {
      host.innerHTML = markup;
      const svg = host.querySelector('svg')!;
      return { viewBox: svg.getAttribute('viewBox'),
        nodes: Array.from(svg.querySelectorAll('path.node-bkg')).map(node => node.getAttribute('d')),
        text: Array.from(svg.querySelectorAll('.timeline-node text')).map(node => node.textContent),
        foreign: svg.querySelectorAll('foreignObject').length };
    };
    return { patched: values(first.svg), original: values(second.svg) };
  }, { source: plain, config });
  expect(parity.patched).toEqual(parity.original);
  expect(parity.patched.foreign).toBe(0);

  for (const [index, item] of cases.entries()) await test.step(item.name, async () => {
    const result = await page.evaluate(async ({ source, config, id }) => {
      const mermaid = (window as any).mermaid;
      mermaid.initialize(config);
      const rendered = await mermaid.render(id, source);
      const host = document.getElementById('rendered')!;
      host.innerHTML = rendered.svg;
      const svg = host.querySelector('svg')!;
      const rect = (element: Element) => {
        const b = element.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      };
      const labels = Array.from(svg.querySelectorAll('foreignObject[data-vs-mermaid-label]')).map(label => {
        const node = label.closest('.timeline-node')?.querySelector('path.node-bkg, rect');
        return { key: label.getAttribute('data-vs-mermaid-label'), box: rect(label), node: node && rect(node),
          ink: Array.from(label.querySelectorAll('math, math *')).map(rect).filter(b => b.right > b.left && b.bottom > b.top) };
      });
      const wrappers = Array.from(svg.querySelectorAll('.taskWrapper, .eventWrapper, .sectionWrapper')).map(wrapper => ({
        kind: wrapper.getAttribute('class'), box: rect(wrapper),
        key: wrapper.querySelector('[data-vs-mermaid-label]')?.getAttribute('data-vs-mermaid-label') }));
      const lines = Array.from(svg.querySelectorAll('.lineWrapper'));
      return { viewBox: (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number), viewport: rect(svg),
        labels, wrappers, math: svg.querySelectorAll('math').length,
        lines: lines.length, linesBeforeNodes: lines.every(line => {
          const parent = line.parentElement!;
          const firstNode = parent.querySelector('.taskWrapper, .eventWrapper, .sectionWrapper');
          return !firstNode || !!(line.compareDocumentPosition(firstNode) & Node.DOCUMENT_POSITION_FOLLOWING);
        }) };
    }, { source: item.source, config, id: `timeline-math-${index}` });
    expect(result.viewBox).toHaveLength(4);
    expect(result.viewBox.every(Number.isFinite)).toBe(true);
    expect(result.viewBox[2]).toBeGreaterThan(0);
    expect(result.viewBox[3]).toBeGreaterThan(0);
    expect(result.math).toBeGreaterThan(0);
    expect(result.labels.map(label => label.key).sort()).toEqual([...item.keys].sort());
    expect(result.lines).toBeGreaterThan(0);
    expect(result.linesBeforeNodes, 'connectors painted behind nodes').toBe(true);
    for (const label of result.labels) {
      const checks: { inner: typeof label.box; outer: typeof label.box; caption: string }[] = [
        { inner: label.box, outer: result.viewport, caption: 'viewport' },
        ...(label.node ? [{ inner: label.box, outer: label.node, caption: 'node' }] : []),
        ...label.ink.map(ink => ({ inner: ink, outer: label.box, caption: 'math ink' })),
      ];
      for (const { inner, outer, caption } of checks) {
        expect(inner.left, `${item.name} ${label.key} ${caption} left`).toBeGreaterThanOrEqual(outer.left - 1);
        expect(inner.right, `${item.name} ${label.key} ${caption} right`).toBeLessThanOrEqual(outer.right + 1);
        expect(inner.top, `${item.name} ${label.key} ${caption} top`).toBeGreaterThanOrEqual(outer.top - 1);
        expect(inner.bottom, `${item.name} ${label.key} ${caption} bottom`).toBeLessThanOrEqual(outer.bottom + 1);
      }
    }
    const tasks = result.wrappers.filter(wrapper => wrapper.kind === 'taskWrapper');
    const events = result.wrappers.filter(wrapper => wrapper.kind === 'eventWrapper');
    const sections = result.wrappers.filter(wrapper => wrapper.kind === 'sectionWrapper');
    for (const event of events) {
      const key = event.key!.replace(/^event:([^:]+):([^:]+):.+$/, 'task:$1:$2');
      const task = tasks.find(candidate => candidate.key === key)!;
      expect(task).toBeTruthy();
      if (item.name.startsWith('TD')) expect(event.box.left).toBeGreaterThanOrEqual(task.box.right + 5);
      else expect(event.box.top).toBeGreaterThanOrEqual(task.box.bottom + 5);
    }
    for (const [i, first] of events.entries()) for (const second of events.slice(i + 1)) {
      const firstOwner = first.key!.replace(/:\d+$/, '');
      const secondOwner = second.key!.replace(/:\d+$/, '');
      if (firstOwner === secondOwner) {
        expect(second.box.top, `${item.name}: event rows do not overlap`).toBeGreaterThanOrEqual(first.box.bottom + 5);
      }
    }
    for (let i = 1; i < sections.length; i++) {
      const previous = sections[i - 1]!.box, current = sections[i]!.box;
      if (item.name.startsWith('TD')) {
        expect(current.top, `${item.name}: section blocks do not overlap`).toBeGreaterThanOrEqual(previous.bottom + 5);
      } else {
        expect(current.left, `${item.name}: section columns do not overlap`).toBeGreaterThanOrEqual(previous.right + 5);
      }
    }
    if (item.name.startsWith('TD') && sections.length > 1 && events.length) {
      expect(sections[1]!.box.top, 'next TD section clears its event stack')
        .toBeGreaterThanOrEqual(Math.max(...events.filter(event => event.key!.startsWith('event:0:'))
          .map(event => event.box.bottom)) + 5);
    }
    const title = result.labels.find(label => label.key === 'title')!;
    expect(title.box.bottom).toBeLessThanOrEqual(Math.min(...result.wrappers.map(wrapper => wrapper.box.top)) - 1);
  });
  await page.waitForTimeout(100);
  expect(requests).toEqual([]);
});
