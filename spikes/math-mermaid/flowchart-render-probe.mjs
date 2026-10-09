// Read-only evidence probe for the pinned Mermaid flowchart renderer.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const bundle = (await build({ stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaid = mermaid;",
  resolveDir: root, sourcefile: 'flowchart-probe-entry.js' }, bundle: true, platform: 'browser',
  format: 'iife', minify: true, write: false })).outputFiles[0].text;
const source = String.raw`flowchart LR
  subgraph Group ["Cluster $$x$$"]
    A["Node $$\frac{a}{b}$$"]
  end
  A -->|"Edge $$y^2$$"| B["Other"]`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><main id="out"></main>');
  await page.addScriptTag({ content: bundle });
  for (const htmlLabels of [true, false]) {
    const result = await page.evaluate(async ({ source, htmlLabels }) => {
      const mermaid = globalThis.mermaid;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels, theme: 'base' });
      const rendered = await mermaid.render(`flow-${htmlLabels}`, source);
      document.querySelector('#out').innerHTML = rendered.svg;
      const svg = document.querySelector('#out svg');
      return { htmlLabels, viewBox: svg.getAttribute('viewBox'), math: svg.querySelectorAll('math').length,
        nodes: [...svg.querySelectorAll('.node')].map(e => ({ text: e.textContent, math: e.querySelectorAll('math').length })),
        clusters: [...svg.querySelectorAll('.cluster')].map(e => ({ text: e.textContent, math: e.querySelectorAll('math').length })),
        edges: [...svg.querySelectorAll('.edgeLabel')].map(e => ({ text: e.textContent, math: e.querySelectorAll('math').length })),
        titles: [...svg.querySelectorAll('.flowchartTitleText')].map(e => ({ text: e.textContent, math: e.querySelectorAll('math').length })) };
    }, { source, htmlLabels });
    process.stdout.write(JSON.stringify(result) + '\n');
  }
} finally { await browser.close(); }
