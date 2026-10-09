import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error The build helper is a checked JavaScript module without declarations.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const positions = ['center', 'top', 'bottom', 'left', 'right'] as const;
const plain = `pie showData
  title Plain pie title
  "Alpha" : 40
  "Beta" : 35
  "Gamma" : 25`;
const math = String.raw`pie showData
  title Long analysis of $$\frac{a+b+c}{d+e}$$ across all groups
  "Alpha" : 40
  "$$\\frac{a}{b}$$" : 35
  "$$\\begin{matrix}a&b\\\\c&d\\end{matrix}$$" : 25`;
const extreme = String.raw`pie showData
  title Tall $$\smash{\frac{\frac{a}{b}}{\frac{c}{d}}}$$ title
  "$$\\rlap{\\rule{20em}{1em}}x$$" : 50
  "$$\\smash{\\frac{\\frac{a}{b}}{\\frac{c}{d}}}$$" : 50`;

let bundle: string;
let upstreamBundle: string;
test.beforeAll(async () => {
  const options = { bundle: true, platform: 'browser' as const, format: 'iife' as const, minify: true, write: false as const };
  const result = await build({ ...options, entryPoints: [resolve(root, 'packages/runtime/src/mermaid-bundle.ts')],
    plugins: [mermaidMathPlugin(root)] });
  bundle = result.outputFiles[0]!.text;
  const upstream = await build({ ...options, stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaidOriginal = mermaid;",
    resolveDir: root, sourcefile: 'mermaid-original.js' } });
  upstreamBundle = upstream.outputFiles[0]!.text;
});

test('patched Mermaid pie measures plain and math labels across all legend positions and themes', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: bundle });
  await page.addScriptTag({ content: upstreamBundle });
  for (const dark of [false, true]) for (const position of positions) for (const mode of ['plain', 'math', 'extreme'] as const) {
    await test.step(`${dark ? 'dark' : 'light'} ${position} ${mode}`, async () => {
      const result = await page.evaluate(async ({ source, position, dark, id }) => {
        const mermaid = (window as any).mermaid;
        const config = { startOnLoad: false, securityLevel: 'strict', theme: 'base',
          themeVariables: {
            darkMode: dark, background: dark ? '#1d1f23' : '#ffffff',
            primaryTextColor: dark ? '#f1f2f4' : '#1d1f23',
            pieLegendTextColor: dark ? '#f1f2f4' : '#1d1f23',
            pieTitleTextColor: dark ? '#f1f2f4' : '#1d1f23',
            pieSectionTextColor: dark ? '#ffffff' : '#1d1f23',
            fontFamily: 'Arial, sans-serif', fontSize: '14px',
          },
          pie: { legendPosition: position, useMaxWidth: false },
        };
        mermaid.initialize(config);
        const rendered = await mermaid.render(id, source);
        const host = document.getElementById('rendered')!;
        host.innerHTML = rendered.svg;
        const svg = host.querySelector('svg')!;
        const viewport = svg.getBoundingClientRect();
        const viewBox = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
        const rows = Array.from(svg.querySelectorAll('g.legend'));
        const rowBoxes = rows.map(row => {
          const box = row.getBoundingClientRect();
          const label = row.querySelector('foreignObject div, text')!;
          const computed = getComputedStyle(label);
          return { left: box.left, top: box.top, right: box.right, bottom: box.bottom,
            text: row.textContent ?? '', math: row.querySelectorAll('math').length,
            fill: label instanceof SVGElement ? computed.fill : computed.color,
            transform: row.getAttribute('transform') ?? '' };
        });
        const title = svg.querySelector('foreignObject.pieTitleText, text.pieTitleText');
        const titleBox = title?.getBoundingClientRect();
        const labelBoxes = Array.from(svg.querySelectorAll('foreignObject, g.legend > text, text.pieTitleText')).map(label => {
          const box = label.getBoundingClientRect();
          return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        });
        const inkBoxes = Array.from(svg.querySelectorAll('foreignObject')).flatMap((label, index) => {
          const outer = label.getBoundingClientRect();
          return Array.from(label.querySelectorAll('math, math *')).map(ink => {
            const box = ink.getBoundingClientRect();
            return { index, outer: { left: outer.left, top: outer.top, right: outer.right, bottom: outer.bottom },
              left: box.left, top: box.top, right: box.right, bottom: box.bottom };
          }).filter(box => box.right > box.left && box.bottom > box.top);
        });
        const pieGroup = svg.querySelector('g > g');
        const original = (window as any).mermaidOriginal;
        let upstream: { viewBox: string; paths: string[]; rows: string[]; title: string } | undefined;
        if (source.includes('Plain pie title')) {
          original.initialize(config);
          const baseline = await original.render(id + '-upstream', source);
          host.innerHTML = baseline.svg;
          const originalSvg = host.querySelector('svg')!;
          upstream = { viewBox: originalSvg.getAttribute('viewBox') ?? '',
            paths: Array.from(originalSvg.querySelectorAll('path.pieCircle')).map(path => path.getAttribute('d') ?? ''),
            rows: Array.from(originalSvg.querySelectorAll('g.legend')).map(row => row.getAttribute('transform') ?? ''),
            title: originalSvg.querySelector('.pieTitleText')?.textContent ?? '' };
        }
        return { viewBox, viewport: { left: viewport.left, top: viewport.top, right: viewport.right, bottom: viewport.bottom },
          rowBoxes, labelBoxes, inkBoxes, upstream,
          current: { viewBox: svg.getAttribute('viewBox') ?? '',
            paths: Array.from(svg.querySelectorAll('path.pieCircle')).map(path => path.getAttribute('d') ?? ''),
            rows: rows.map(row => row.getAttribute('transform') ?? ''), title: title?.textContent ?? '' },
          titleBox: titleBox && { left: titleBox.left, top: titleBox.top, right: titleBox.right, bottom: titleBox.bottom },
          math: svg.querySelectorAll('math').length, fractions: svg.querySelectorAll('mfrac').length,
          matrices: svg.querySelectorAll('mtable').length, arcCount: svg.querySelectorAll('path.pieCircle').length,
          circleCount: svg.querySelectorAll('circle.pieOuterCircle').length, pieTransform: pieGroup?.getAttribute('transform') ?? '',
        };
      }, { source: mode === 'plain' ? plain : mode === 'math' ? math : extreme, position, dark,
        id: `pie-${dark ? 'dark' : 'light'}-${position}-${mode}` });
      expect(result.viewBox, 'finite viewBox').toHaveLength(4);
      expect(result.viewBox.every(Number.isFinite), 'finite viewBox values').toBe(true);
      expect(result.viewBox[2], 'positive viewBox width').toBeGreaterThan(0);
      expect(result.viewBox[3], 'positive viewBox height').toBeGreaterThan(0);
      expect(result.rowBoxes, 'all section rows').toHaveLength(mode === 'extreme' ? 2 : 3);
      expect(result.rowBoxes.every(row => row.fill === (dark ? 'rgb(241, 242, 244)' : 'rgb(29, 31, 35)')),
        'legend typography uses the selected theme').toBe(true);
      expect(result.arcCount, 'all nonzero arcs').toBe(mode === 'extreme' ? 2 : 3);
      expect(result.circleCount, 'donut outer circle').toBe(1);
      expect(result.rowBoxes.every(row => /\[\d+\]/.test(row.text)), 'showData labels').toBe(true);
      for (const box of result.labelBoxes) {
        expect(box.left, 'label left inside viewBox').toBeGreaterThanOrEqual(result.viewport.left - 1);
        expect(box.top, 'label top inside viewBox').toBeGreaterThanOrEqual(result.viewport.top - 1);
        expect(box.right, 'label right inside viewBox').toBeLessThanOrEqual(result.viewport.right + 1);
        expect(box.bottom, 'label bottom inside viewBox').toBeLessThanOrEqual(result.viewport.bottom + 1);
      }
      for (const ink of result.inkBoxes) {
        expect(ink.left, 'math ink inside reserved label left').toBeGreaterThanOrEqual(ink.outer.left - 1);
        expect(ink.top, 'math ink inside reserved label top').toBeGreaterThanOrEqual(ink.outer.top - 1);
        expect(ink.right, 'math ink inside reserved label right').toBeLessThanOrEqual(ink.outer.right + 1);
        expect(ink.bottom, 'math ink inside reserved label bottom').toBeLessThanOrEqual(ink.outer.bottom + 1);
        expect(ink.left, 'math ink inside viewBox left').toBeGreaterThanOrEqual(result.viewport.left - 1);
        expect(ink.top, 'math ink inside viewBox top').toBeGreaterThanOrEqual(result.viewport.top - 1);
        expect(ink.right, 'math ink inside viewBox right').toBeLessThanOrEqual(result.viewport.right + 1);
        expect(ink.bottom, 'math ink inside viewBox bottom').toBeLessThanOrEqual(result.viewport.bottom + 1);
      }
      for (let index = 1; index < result.rowBoxes.length; index++) {
        expect(result.rowBoxes[index]!.top, 'legend rows do not overlap')
          .toBeGreaterThanOrEqual(result.rowBoxes[index - 1]!.bottom - 1);
      }
      expect(result.titleBox, 'title is rendered').toBeTruthy();
      expect(result.titleBox!.bottom, 'title clears legend').toBeLessThanOrEqual(result.rowBoxes[0]!.top - 1);
      if (mode === 'math') {
        expect(result.math, 'title and both math legend labels').toBeGreaterThanOrEqual(3);
        expect(result.fractions).toBeGreaterThanOrEqual(2);
        expect(result.matrices).toBe(1);
      } else if (mode === 'extreme') {
        expect(result.math).toBeGreaterThanOrEqual(3);
        expect(result.inkBoxes.length, 'the overhanging TeX descendants were measured').toBeGreaterThan(0);
      } else {
        expect(result.math).toBe(0);
        expect(result.labelBoxes.filter(box => box.right > box.left)).toHaveLength(4);
        expect(result.current).toEqual(result.upstream);
      }
    });
  }
  await page.waitForTimeout(100);
  expect(requests, 'standalone patched bundle made no HTTP requests').toEqual([]);
});
