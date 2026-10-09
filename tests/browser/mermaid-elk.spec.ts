import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
// @ts-expect-error build plugin is checked JavaScript.
import { mermaidMathPlugin } from '../../scripts/mermaid-build.mjs';

let bundle: string;
test.beforeAll(async () => {
  bundle = (await build({ stdin: { contents: [
    "import mermaid from 'mermaid';",
    "import {stampFlowchartMathLabels} from './packages/runtime/src/mermaid-flowchart-source.ts';",
    'globalThis.ElkTest = {mermaid, stampFlowchartMathLabels};',
  ].join('\n'), resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'iife',
  write: false, plugins: [mermaidMathPlugin(process.cwd())] })).outputFiles[0]!.text;
});
for (const direction of ['LR', 'TD']) for (const collapsed of [false, true]) {
  test(`ELK ${direction} ${collapsed ? 'collapsed' : 'expanded'} math owns labels and reserves ink`, async ({ page }) => {
    const requests: string[] = [];
    await page.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent('<!doctype html><body><main></main></body>');
    await page.addScriptTag({ content: bundle });
    const result = await page.evaluate(async ({ direction, collapsed }) => {
      const { mermaid, stampFlowchartMathLabels } = (globalThis as any).ElkTest;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
      const source = `flowchart-elk ${direction}\n` + String.raw`subgraph phase["Group $$s$$"]
 A["Rate $$\\rlap{\\rule{20em}{1em}}x$$"] -->|"Flow $$x$$"| B["Other"]
end
B -->|"Outside $$z$$"| C
` + (collapsed ? 'phase@{view: collapsed}\n' : '');
      const { svg } = await mermaid.render('elk-math', source);
      document.querySelector('main')!.innerHTML = svg;
      const drawn = document.querySelector('main svg') as SVGSVGElement;
      const slots = [
        { key: 'subgraph:phase', kind: 'subgraph', id: 'phase' },
        { key: 'node:C', kind: 'node', id: 'C' },
        { key: 'edge:L_B_C_0', kind: 'edge', id: 'L_B_C_0' },
        ...collapsed ? [] : [
          { key: 'node:A', kind: 'node', id: 'A' }, { key: 'node:B', kind: 'node', id: 'B' },
          { key: 'edge:L_A_B_0', kind: 'edge', id: 'L_A_B_0' },
        ],
      ];
      stampFlowchartMathLabels(drawn, 'elk-math', slots);
      const bad: string[] = [];
      const outer = drawn.getBoundingClientRect();
      for (const math of drawn.querySelectorAll('math')) {
        const label = math.closest('foreignObject')!;
        const box = label.getBoundingClientRect();
        if (!label.hasAttribute('data-vs-mermaid-label')) bad.push('unowned');
        if (!math.hasAttribute('data-vs-mermaid-formula')) bad.push('unattested');
        for (const element of [math, ...math.querySelectorAll('*')]) {
          const r = element.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) bad.push('label ink');
          if (r.left < outer.left - 1 || r.right > outer.right + 1 || r.top < outer.top - 1 || r.bottom > outer.bottom + 1) bad.push('viewBox ink');
        }
      }
      return { bad, math: drawn.querySelectorAll('math').length,
        layout: mermaid.mermaidAPI.getConfig().layout,
        labels: [...drawn.querySelectorAll('[data-vs-mermaid-label]')].map(el => el.getAttribute('data-vs-mermaid-label')) };
    }, { direction, collapsed });
    expect(result.layout).toBe('elk');
    expect(result.bad).toEqual([]);
    expect(result.math).toBe(collapsed ? 2 : 4);
    expect(result.labels).toContain('subgraph:phase');
    expect(requests).toEqual([]);
  });
}
