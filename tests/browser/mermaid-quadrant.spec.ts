import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error The checked build plugin has no TypeScript declaration.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const plain = 'quadrantChart\ntitle Plain\nx-axis Low --> High\ny-axis Bottom --> Top\nquadrant-1 One\nquadrant-2 Two\nquadrant-3 Three\nquadrant-4 Four\nFirst: [0.2, 0.3]\nSecond: [0.8, 0.7]\n';
const math = String.raw`quadrantChart
title $$\frac{a}{b}$$
x-axis $$x-left$$ --> $$x-right$$
y-axis $$y-bottom$$ --> $$y-top$$
quadrant-1 $$q1$$
quadrant-2 $$q2$$
quadrant-3 $$q3$$
quadrant-4 $$q4$$
"$$\rlap{\rule{8em}{1em}}x$$": [0, 0]
"$$\rule{1em}{10em}$$": [0, 0]
"$$\begin{matrix}a&b\\c&d\end{matrix}$$": [1, 1] radius:20,stroke-width:4px
`;
const keys = ['title', 'quadrant1', 'quadrant2', 'quadrant3', 'quadrant4', 'xLeft', 'xRight', 'yBottom', 'yTop', 'point:0', 'point:1', 'point:2'];

let bundle: string;
let upstream: string;
test.beforeAll(async () => {
  const options = { bundle: true, platform: 'browser' as const, format: 'iife' as const, minify: true, write: false as const };
  bundle = (await build({ ...options, entryPoints: [resolve(root, 'packages/runtime/src/mermaid-bundle.ts')],
    plugins: [mermaidMathPlugin(root)] })).outputFiles[0]!.text;
  upstream = (await build({ ...options, stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaidOriginal = mermaid;",
    resolveDir: root, sourcefile: 'mermaid-quadrant-original.js' } })).outputFiles[0]!.text;
});

const config = { startOnLoad: false, securityLevel: 'strict', theme: 'base', deterministicIds: true,
  themeVariables: { fontFamily: 'Arial, sans-serif', fontSize: '14px' }, quadrantChart: { useMaxWidth: false, chartWidth: 500, chartHeight: 500 } };

test('plain quadrant drawing retains native geometry and content', async ({ page }) => {
  await page.setContent('<!doctype html><main id="rendered"></main>');
  await page.addScriptTag({ content: bundle });
  await page.addScriptTag({ content: upstream });
  const result = await page.evaluate(async ({ source, config }) => {
    const host = document.getElementById('rendered')!;
    const summarize = (svgText: string) => {
      host.innerHTML = svgText; const svg = host.querySelector('svg')!;
      return { viewBox: svg.getAttribute('viewBox'), foreign: svg.querySelectorAll('foreignObject').length,
        points: [...svg.querySelectorAll('circle')].map(node => [node.getAttribute('cx'), node.getAttribute('cy'), node.getAttribute('r')]),
        text: [...svg.querySelectorAll('text')].map(node => node.textContent), staged: svg.querySelectorAll('.vs-quadrant-math').length };
    };
    const patched = (window as any).mermaid, original = (window as any).mermaidOriginal;
    patched.initialize(config); original.initialize(config);
    const patchedSvg = await patched.render('quadrant-plain-patched', source);
    const patchedResult = summarize(patchedSvg.svg);
    const originalSvg = await original.render('quadrant-plain-original', source);
    return { patched: patchedResult, original: summarize(originalSvg.svg) };
  }, { source: plain, config });
  expect(result.patched).toEqual(result.original);
  expect(result.patched.staged).toBe(0);
});

test('quadrant math places every role and keeps rotated axes, point labels, and ink in bounds at narrow and wide widths', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setContent('<!doctype html><main id="rendered"></main>');
  await page.addScriptTag({ content: bundle });
  for (const width of [320, 1440]) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      const result = await page.evaluate(async ({ source, config, id }) => {
        const mermaid = (window as any).mermaid; mermaid.initialize(config);
        document.getElementById('rendered')!.innerHTML = (await mermaid.render(id, source)).svg;
        const svg = document.querySelector<SVGSVGElement>('#rendered svg')!;
        const box = (node: Element) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; };
        const labels = [...svg.querySelectorAll<SVGForeignObjectElement>('foreignObject[data-vs-mermaid-label]')].map(label => ({
          key: label.getAttribute('data-vs-mermaid-label'), box: box(label), text: label.textContent,
          rotated: /rotate\(-90\)/.test(label.parentElement?.getAttribute('transform') ?? ''),
          ink: [...label.querySelectorAll('math, math *')].map(box).filter(rect => rect.right > rect.left && rect.bottom > rect.top),
        }));
        const plot = svg.querySelector<SVGRectElement>('.vs-quadrant-math > rect[fill="none"]')!;
        const plotBox = { x: Number(plot.getAttribute('x')), y: Number(plot.getAttribute('y')), width: Number(plot.getAttribute('width')), height: Number(plot.getAttribute('height')) };
        const points = [...svg.querySelectorAll<SVGCircleElement>('circle[data-vs-quadrant-point]')].map(circle => ({
          index: Number(circle.getAttribute('data-vs-quadrant-point')), x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')),
        })).sort((a, b) => a.index - b.index);
        return { viewBox: (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number), viewport: box(svg), labels, plot: plotBox, points,
          leaders: svg.querySelectorAll('polyline[data-vs-quadrant-leader]').length, math: svg.querySelectorAll('math').length,
          staged: svg.querySelectorAll('.vs-quadrant-math').length };
      }, { source: math, config, id: `quadrant-math-${width}` });
      expect(result.viewBox).toHaveLength(4);
      expect(result.viewBox.every(Number.isFinite)).toBe(true);
      expect(result.viewBox[2]).toBeGreaterThan(0);
      expect(result.viewBox[3]).toBeGreaterThan(0);
      expect(result.staged).toBe(1);
      expect(result.math).toBe(keys.length);
      expect(result.labels.map(label => label.key).sort()).toEqual([...keys].sort());
      expect(result.leaders).toBe(3);
      for (const key of ['yTop', 'yBottom']) expect(result.labels.find(label => label.key === key)?.rotated).toBe(true);
      const contains = (outer: typeof result.viewport, inner: typeof result.viewport) =>
        inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
      for (const label of result.labels) {
        expect(contains(result.viewport, label.box), `${width} ${label.key} stays in SVG`).toBe(true);
        for (const ink of label.ink) expect(contains(label.box, ink), `${width} ${label.key} ink stays in its foreign object`).toBe(true);
      }
      for(const [i,a]of result.labels.entries())for(const b of result.labels.slice(i+1)){
        expect(a.box.right<=b.box.left+1||b.box.right<=a.box.left+1||a.box.bottom<=b.box.top+1||b.box.bottom<=a.box.top+1, `${a.key} and ${b.key} do not overlap`).toBe(true);
      }
      const pointLabels = result.labels.filter(label => label.key?.startsWith('point:'));
      const firstCoincident = pointLabels.find(label => label.key === 'point:1')!.box;
      const secondCoincident = pointLabels.find(label => label.key === 'point:2')!.box;
      expect(secondCoincident.top, `${width} coincident point labels do not overlap`).toBeGreaterThanOrEqual(firstCoincident.bottom + 1);
      const high=result.points[0]!,coincident=result.points[1]!,low=result.points[2]!;
      expect(low).toMatchObject({ index: 2 }); expect(coincident).toMatchObject({ index: 1 }); expect(high).toMatchObject({ index: 0 });
      expect(low.x).toBeCloseTo(result.plot.x, 4); expect(low.y).toBeCloseTo(result.plot.y + result.plot.height, 4);
      expect(coincident.x).toBeCloseTo(low.x, 4); expect(coincident.y).toBeCloseTo(low.y, 4);
      expect(high.x).toBeCloseTo(result.plot.x + result.plot.width, 4); expect(high.y).toBeCloseTo(result.plot.y, 4);
    });
  }
});

test('quadrant axis placement follows the native defaults, side configuration, visibility, and point override', async ({ page }) => {
  await page.setContent('<!doctype html><main id="rendered"></main>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async ({ config }) => {
    const mermaid = (window as any).mermaid;
    const source = String.raw`quadrantChart
x-axis $$left$$ --> $$right$$
y-axis $$bottom$$ --> $$top$$
quadrant-1 $$one$$
`;
    const draw = async (id: string, quadrantChart: Record<string, unknown>, points = '') => {
      mermaid.initialize({ ...config, quadrantChart: { ...config.quadrantChart, ...quadrantChart } });
      const host = document.getElementById('rendered')!;
      host.innerHTML = (await mermaid.render(id, source + points)).svg;
      const svg = host.querySelector<SVGSVGElement>('svg')!;
      const rect = svg.querySelector<SVGRectElement>('.vs-quadrant-math > rect[fill="none"]')!;
      const plotRect=rect.getBoundingClientRect();
      const plot={left:plotRect.left,right:plotRect.right,top:plotRect.top,bottom:plotRect.bottom};
      return { plot, keys: [...svg.querySelectorAll('[data-vs-mermaid-label]')].map(node => node.getAttribute('data-vs-mermaid-label')),
        boxes: Object.fromEntries([...svg.querySelectorAll<SVGForeignObjectElement>('foreignObject[data-vs-mermaid-label]')].map(node => {
          const box = node.getBoundingClientRect(); return [node.getAttribute('data-vs-mermaid-label')!, {left:box.left,right:box.right,top:box.top,bottom:box.bottom}];
        })) };
    };
    return {
      defaults: await draw('quadrant-default-axes', {}),
      right: await draw('quadrant-right-axis', { yAxisPosition: 'right' }),
      hidden: await draw('quadrant-hidden-axes', { showXAxis: false, showYAxis: false }),
      pointed: await draw('quadrant-point-bottom-axis', { xAxisPosition: 'top' }, 'Point: [0.5, 0.5]\n'),
    };
  }, { config });
  expect(result.defaults.boxes.xLeft!.bottom).toBeLessThanOrEqual(result.defaults.plot.top + 1);
  expect(result.defaults.boxes.yBottom!.right).toBeLessThanOrEqual(result.defaults.plot.left + 1);
  expect(result.right.boxes.yBottom!.left).toBeGreaterThanOrEqual(result.right.plot.right - 1);
  expect(result.hidden.keys).toEqual(['quadrant1']);
  expect(result.pointed.boxes.xLeft!.top).toBeGreaterThanOrEqual(result.pointed.plot.bottom - 1);
});

test('quadrant math failure has no staged residue and a later render recovers', async ({ page }) => {
  await page.setContent('<!doctype html><main id="rendered"></main>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async ({ config }) => {
    const mermaid = (window as any).mermaid; mermaid.initialize(config); let failed = false;
    try { await mermaid.render('quadrant-fail', 'quadrantChart\nquadrant-1 "$$\\unknownVisser$$"\n'); } catch { failed = true; }
    const stale = document.querySelectorAll('.vs-quadrant-math').length;
    document.getElementById('rendered')!.innerHTML = (await mermaid.render('quadrant-recovered', 'quadrantChart\nquadrant-1 "$$x$$"\n')).svg;
    return { failed, stale, staged: document.querySelectorAll('#rendered .vs-quadrant-math').length,
      keys: [...document.querySelectorAll('#rendered [data-vs-mermaid-label]')].map(node => node.getAttribute('data-vs-mermaid-label')) };
  }, { config });
  expect(result).toEqual({ failed: true, stale: 0, staged: 1, keys: ['quadrant1'] });
});
