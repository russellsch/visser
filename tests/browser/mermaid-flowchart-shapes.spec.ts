import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { checkMermaidSource } from '../../packages/core/src/mermaid/rules.ts';
// @ts-expect-error Checked JavaScript build plugin has no declaration.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

// Every documented canonical shortName plus the six lowercase undocumented
// metadata shape names that pass pinned FlowDB's lowercase/underscore gate.
const SHAPES = [
  'rect', 'rounded', 'stadium', 'fr-rect', 'cyl', 'datastore', 'folder', 'bucket', 'console', 'browser',
  'person', 'circle', 'bang', 'cloud', 'diam', 'hex', 'lean-r', 'lean-l', 'trap-b', 'trap-t',
  'dbl-circ', 'text', 'notch-rect', 'lin-rect', 'sm-circ', 'fr-circ', 'fork', 'hourglass',
  'brace', 'brace-r', 'braces', 'bolt', 'doc', 'delay', 'h-cyl', 'lin-cyl', 'curv-trap',
  'div-rect', 'tri', 'win-pane', 'f-circ', 'notch-pent', 'flip-tri', 'sl-rect', 'docs',
  'st-rect', 'bow-rect', 'cross-circ', 'tag-doc', 'tag-rect', 'flag', 'odd', 'lin-doc',
  'state', 'choice', 'note', 'composite', 'icon', 'anchor',
] as const;
// Pinned handlers intentionally discard their authored label or draw no text.
// Authored math remains validated; these paths have no native label to bind
// and are not counted as geometry passes.
const NO_NATIVE_LABEL = new Set([
  'sm-circ', 'fr-circ', 'fork', 'hourglass', 'bolt', 'f-circ', 'cross-circ', 'choice', 'anchor',
]);
const FRACTION = String.raw`\frac{\frac{a}{b}}{\frac{c}{d}}`;
const OVERHANG = String.raw`\rlap{\rule{20em}{1em}}x`;
const LABEL = `$$${FRACTION}$$ $$${OVERHANG}$$`;

let bundle: string;
test.beforeAll(async () => {
  bundle = (await build({ stdin: { contents: [
    "import mermaid from 'mermaid';",
    "import {stampFlowchartMathLabels} from './packages/runtime/src/mermaid-flowchart-source.ts';",
    'globalThis.ShapeTest = {mermaid, stampFlowchartMathLabels};',
  ].join('\n'), resolveDir: process.cwd(), sourcefile: 'flowchart-shapes-test.js' },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  plugins: [mermaidMathPlugin(process.cwd())] })).outputFiles[0]!.text;
});

for (const direction of ['LR', 'TD'] as const) {
  test(`pinned ${direction} flowchart shape math retains source and reserves visible ink`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
    await page.addScriptTag({ content: bundle });
    const encodedLabel = LABEL.replace(/\\/g, '\\\\');
    const sources = SHAPES.map(shape => ({ shape, source: `flowchart ${direction}\nA@{shape: ${shape}, label: "${encodedLabel}"}` }));
    for (const { shape, source } of sources) {
      expect(checkMermaidSource(source), `${shape} passes Visser source rules`).toEqual([]);
    }
    const results = await page.evaluate(async ({sources, noNativeLabel}) => {
      const api = (window as any).ShapeTest;
      api.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true,
        theme: 'base', flowchart: { useMaxWidth: false } });
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
          width: box.width, height: box.height };
      };
      const contains = (outer: ReturnType<typeof rect>, inner: ReturnType<typeof rect>) =>
        inner.left >= outer.left - 1 && inner.right <= outer.right + 1 &&
        inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
      const results: Array<Record<string, unknown>> = [];
      for (const { shape, source } of sources) {
        const renderId = `shape-${shape}-${source.includes('flowchart LR') ? 'lr' : 'td'}`;
        try {
          const rendered = await api.mermaid.render(renderId, source);
          document.querySelector('#rendered')!.innerHTML = rendered.svg;
          const svg = document.querySelector('#rendered svg')!;
          const node = Array.from(svg.querySelectorAll('g')).find(element =>
            element.id.startsWith(`${renderId}-flowchart-A-`))!;
          if (noNativeLabel.includes(shape)) {
            results.push({ shape, noNativeLabel: true, nodeFound: Boolean(node),
              nativeText: node?.textContent?.trim(), mathRoots: node?.querySelectorAll('math').length,
              attestedFormulas: node?.querySelectorAll('[data-vs-mermaid-formula]').length,
              foreignObjects: node?.querySelectorAll('foreignObject').length });
            continue;
          }
          api.stampFlowchartMathLabels(svg, renderId, [{ key: 'node:A', kind: 'node', id: 'A' }]);
          const label = node?.querySelector('foreignObject')!;
          const formulas = Array.from(label?.querySelectorAll('math[data-vs-mermaid-formula]') ?? []);
          const ink = Array.from(label?.querySelectorAll('math, math *') ?? []).map(rect)
            .filter(box => box.width > 0 && box.height > 0);
          const viewBox = svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number) ?? [];
          results.push({ shape, label: label ? rect(label) : null, node: node ? rect(node) : null,
            viewBox, tex: formulas.map(formula => formula.getAttribute('data-vs-mermaid-formula')),
            owned: label?.getAttribute('data-vs-mermaid-label'),
            inkCount: ink.length,
            inkWithinLabel: label ? ink.every(box => contains(rect(label), box)) : false,
            labelWithinNode: label && node ? contains(rect(node), rect(label)) : false,
            labelWithinSvg: label ? contains(rect(svg), rect(label)) : false });
        } catch (error) { results.push({ shape, error: String(error) }); }
      }
      return results;
    }, { sources, noNativeLabel: [...NO_NATIVE_LABEL] });
    const failures: string[] = [];
    for (const result of results) {
      const context = `${direction}/${result.shape}`;
      if (result.error) { failures.push(`${context}: ${result.error}`); continue; }
      if (result.noNativeLabel) {
        if (result.nodeFound !== true || result.nativeText !== '' || result.mathRoots !== 0 ||
            result.attestedFormulas !== 0) {
          failures.push(`${context}: expected the pinned no-label handler to show zero authored text/math, got ${JSON.stringify(result)}`);
        }
        continue;
      }
      if (JSON.stringify(result.tex) !== JSON.stringify([FRACTION, OVERHANG])) failures.push(`${context}: TeX mismatch ${JSON.stringify(result.tex)}`);
      if (result.owned !== 'node:A') failures.push(`${context}: native owner ${String(result.owned)}`);
      const box = result.label as {width:number;height:number} | null;
      if (!box || !(box.width > 0 && box.height > 0)) failures.push(`${context}: missing positive label dimensions`);
      if (!(typeof result.inkCount === 'number' && result.inkCount > 0)) failures.push(`${context}: missing math ink`);
      if (result.inkWithinLabel !== true) failures.push(`${context}: ink escapes reserved label`);
      if (result.labelWithinNode !== true) failures.push(`${context}: label escapes node group`);
      if (result.labelWithinSvg !== true) failures.push(`${context}: label escapes SVG viewBox`);
      const viewBox = result.viewBox as number[];
      if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || !(viewBox[2]! > 0 && viewBox[3]! > 0)) {
        failures.push(`${context}: invalid viewBox ${JSON.stringify(viewBox)}`);
      }
    }
    expect(failures).toEqual([]);
  });
}

test('plain no-label node does not claim the formula of a neighboring math node', async ({ page }) => {
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: bundle });
  const failures = await page.evaluate(async noNativeLabel => {
    const api = (window as any).ShapeTest;
    api.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true,
      theme: 'base', flowchart: { useMaxWidth: false } });
    const failures: string[] = [];
    for (const shape of noNativeLabel) {
      const renderId = `plain-no-label-${shape}`;
      const source = `flowchart LR\nA@{shape: ${shape}, label: "Plain"}\nB["$$x$$"]\nA --> B`;
      try {
        const rendered = await api.mermaid.render(renderId, source);
        document.querySelector('#rendered')!.innerHTML = rendered.svg;
        const svg = document.querySelector('#rendered svg')!;
        api.stampFlowchartMathLabels(svg, renderId, [{ key: 'node:B', kind: 'node', id: 'B' }]);
        const nodeA = Array.from(svg.querySelectorAll('g.node')).find(element =>
          element.id.startsWith(`${renderId}-flowchart-A-`));
        const nodeB = Array.from(svg.querySelectorAll('g.node')).find(element =>
          element.id.startsWith(`${renderId}-flowchart-B-`));
        if (!nodeA || nodeA.textContent?.trim() !== '' || nodeA.querySelector('math') ||
            nodeB?.querySelector('math')?.getAttribute('data-vs-mermaid-formula') !== 'x' ||
            nodeB.querySelector('foreignObject')?.getAttribute('data-vs-mermaid-label') !== 'node:B') {
          failures.push(`${shape}: wrong plain/math native label ownership`);
        }
      } catch (error) { failures.push(`${shape}: ${String(error)}`); }
    }
    return failures;
  }, [...NO_NATIVE_LABEL]);
  expect(failures).toEqual([]);
});
