import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
// @ts-expect-error Checked JavaScript build plugin has no declaration.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

let bundle: string;
test.beforeAll(async () => {
  bundle = (await build({ stdin: { contents: [
    "import mermaid from 'mermaid';",
    "import {stampFlowchartMathLabels} from './packages/runtime/src/mermaid-flowchart-source.ts';",
    'globalThis.FlowchartSourceTest = {mermaid, stampFlowchartMathLabels};',
  ].join('\n'), resolveDir: process.cwd(), sourcefile: 'flowchart-source-test.js' },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  plugins: [mermaidMathPlugin(process.cwd())] })).outputFiles[0]!.text;
});

test('stamps only native inner labels for nodes, edges, and expanded subgraphs', async ({ page }) => {
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const api = (window as any).FlowchartSourceTest;
    api.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
    const source = String.raw`flowchart LR
subgraph g["Group $$s$$"]
 A["Node $$x$$<br/>next $$y$$"] -->|"Edge $$z$$"| B["Other"]
end
g --> C["After"]`;
    const renderId = 'flowchart-owner-ordinary';
    const rendered = await api.mermaid.render(renderId, source);
    document.querySelector('#rendered')!.innerHTML = rendered.svg;
    const svg = document.querySelector('#rendered svg')!;
    const slots = [
      { key: 'node:A', kind: 'node', id: 'A' },
      { key: 'edge:L_A_B_0', kind: 'edge', id: 'L_A_B_0' },
      { key: 'subgraph:g', kind: 'subgraph', id: 'g' },
    ];
    api.stampFlowchartMathLabels(svg, renderId, slots);
    api.stampFlowchartMathLabels(svg, renderId, slots); // idempotent
    return {
      owners: Array.from(svg.querySelectorAll('[data-vs-mermaid-label]')).map(element => ({
        key: element.getAttribute('data-vs-mermaid-label'), tag: element.localName,
        parent: element.parentElement?.getAttribute('class'),
      })),
      formulas: Array.from(svg.querySelectorAll('[data-vs-mermaid-formula]')).map(formula => ({
        tex: formula.getAttribute('data-vs-mermaid-formula'),
        owner: formula.closest('[data-vs-mermaid-label]')?.getAttribute('data-vs-mermaid-label'),
      })),
      pathStamped: svg.querySelectorAll('path[data-vs-mermaid-label]').length,
    };
  });
  expect(result.owners).toHaveLength(3);
  expect(result.owners.every(owner => owner.tag === 'foreignObject')).toBe(true);
  expect(result.owners.map(owner => owner.key).sort()).toEqual(['edge:L_A_B_0', 'node:A', 'subgraph:g']);
  expect(result.owners.map(owner => owner.parent).sort()).toEqual(['cluster-label', 'label', 'label']);
  expect(result.formulas).toEqual([
    { tex: 's', owner: 'subgraph:g' }, { tex: 'z', owner: 'edge:L_A_B_0' },
    { tex: 'x', owner: 'node:A' }, { tex: 'y', owner: 'node:A' },
  ]);
  expect(result.pathStamped).toBe(0);
});

test('stamps each fanout edge by its distinct DB identity and rejects ambiguous owners atomically', async ({ page }) => {
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const api = (window as any).FlowchartSourceTest;
    api.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
    const renderId = 'flowchart-owner-fanout';
    const rendered = await api.mermaid.render(renderId, 'flowchart LR\nA & B -->|"$$x$$"| C & D');
    document.querySelector('#rendered')!.innerHTML = rendered.svg;
    const svg = document.querySelector('#rendered svg')!;
    const ids = ['L_A_C_0', 'L_A_D_0', 'L_B_C_0', 'L_B_D_0'];
    const slots = ids.map(id => ({ key: `edge:${id}`, kind: 'edge', id }));
    const first = Array.from(svg.querySelectorAll('g.node')).find(node => node.id.startsWith(`${renderId}-flowchart-A-`))!;
    const clone = first.cloneNode(true);
    first.parentElement!.append(clone);
    let ambiguous = '';
    try { api.stampFlowchartMathLabels(svg, renderId, [...slots, { key: 'node:A', kind: 'node', id: 'A' }]); }
    catch (error) { ambiguous = String(error); }
    const afterFailure = svg.querySelectorAll('[data-vs-mermaid-label]').length;
    clone.parentNode!.removeChild(clone);
    api.stampFlowchartMathLabels(svg, renderId, slots);
    return { ambiguous, afterFailure,
      labels: Array.from(svg.querySelectorAll('[data-vs-mermaid-label]')).map(label => ({
        key: label.getAttribute('data-vs-mermaid-label'),
        formulas: label.querySelectorAll('[data-vs-mermaid-formula]').length,
      })).sort((a, b) => a.key!.localeCompare(b.key!)) };
  });
  expect(result.ambiguous).toContain('missing or ambiguous');
  expect(result.afterFailure).toBe(0);
  expect(result.labels).toEqual([
    'L_A_C_0', 'L_A_D_0', 'L_B_C_0', 'L_B_D_0',
  ].map(id => ({ key: `edge:${id}`, formulas: 1 })));
});

test('collapsed subgraph owns only its visible title; missing slots fail atomically', async ({ page }) => {
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const api = (window as any).FlowchartSourceTest;
    api.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
    const source = String.raw`flowchart LR
subgraph g["Group $$s$$"]
 A["Hidden $$x$$"] -->|"Inside $$y$$"| B["Other"]
end
g@{view: collapsed}
B -->|"Outside $$z$$"| C`;
    const renderId = 'flowchart-owner-collapsed';
    const rendered = await api.mermaid.render(renderId, source);
    document.querySelector('#rendered')!.innerHTML = rendered.svg;
    const svg = document.querySelector('#rendered svg')!;
    let failure = '';
    try {
      api.stampFlowchartMathLabels(svg, renderId, [
        { key: 'subgraph:g', kind: 'subgraph', id: 'g' },
        { key: 'edge:missing', kind: 'edge', id: 'L_missing_0' },
      ]);
    } catch (error) { failure = String(error); }
    const afterFailure = svg.querySelectorAll('[data-vs-mermaid-label]').length;
    api.stampFlowchartMathLabels(svg, renderId, [
      { key: 'subgraph:g', kind: 'subgraph', id: 'g' },
      { key: 'edge:L_B_C_0', kind: 'edge', id: 'L_B_C_0' },
    ]);
    return { failure, afterFailure,
      collapsedClass: svg.querySelector(`[id="${renderId}-g"]`)?.getAttribute('class'),
      formulas: Array.from(svg.querySelectorAll('[data-vs-mermaid-formula]')).map(formula => ({
        tex: formula.getAttribute('data-vs-mermaid-formula'),
        owner: formula.closest('[data-vs-mermaid-label]')?.getAttribute('data-vs-mermaid-label'),
      })),
    };
  });
  expect(result.failure).toContain('missing or ambiguous');
  expect(result.afterFailure).toBe(0);
  expect(result.collapsedClass).toContain('node');
  expect(result.formulas).toEqual([
    { tex: 'z', owner: 'edge:L_B_C_0' }, { tex: 's', owner: 'subgraph:g' },
  ]);
});

test('checks duplicate keys and uses identity comparison for selector metacharacters', async ({ page }) => {
  await page.setContent('<!doctype html><body><main id="rendered"></main></body>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const api = (window as any).FlowchartSourceTest;
    api.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
    const source = 'flowchart LR\n A.B["$$x$$"] -->|"$$y$$"| C[plain]';
    const renderId = 'flowchart-owner-meta';
    const rendered = await api.mermaid.render(renderId, source);
    document.querySelector('#rendered')!.innerHTML = rendered.svg;
    const svg = document.querySelector('#rendered svg')!;
    const node = Array.from(svg.querySelectorAll('g.node')).find(element => element.id.includes('A.B'));
    const edge = Array.from(svg.querySelectorAll('g[data-id]')).find(element =>
      element.getAttribute('data-id')?.includes('A.B') && element.classList.contains('label'));
    let duplicate = '';
    try {
      api.stampFlowchartMathLabels(svg, renderId, [
        { key: 'same', kind: 'node', id: 'A.B' }, { key: 'same', kind: 'edge', id: edge?.getAttribute('data-id') },
      ]);
    } catch (error) { duplicate = String(error); }
    const afterFailure = svg.querySelectorAll('[data-vs-mermaid-label]').length;
    api.stampFlowchartMathLabels(svg, renderId, [
      { key: 'node:A.B', kind: 'node', id: 'A.B' },
      { key: 'edge:meta', kind: 'edge', id: edge?.getAttribute('data-id') },
    ]);
    return { nodeId: node?.id, edgeId: edge?.getAttribute('data-id'), duplicate, afterFailure,
      owned: Array.from(svg.querySelectorAll('[data-vs-mermaid-label]')).map(element => element.getAttribute('data-vs-mermaid-label')).sort() };
  });
  expect(result.nodeId).toContain('A.B');
  expect(result.edgeId).toContain('A.B');
  expect(result.duplicate).toContain('duplicate');
  expect(result.afterFailure).toBe(0);
  expect(result.owned).toEqual(['edge:meta', 'node:A.B']);
});
