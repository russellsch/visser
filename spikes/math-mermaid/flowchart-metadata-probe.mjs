// Characterize typed YAML label values against the actual pinned renderer.
import { build } from 'esbuild';
import { chromium } from 'playwright';
const bundle = (await build({ stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaid=mermaid;", resolveDir: process.cwd() },
  bundle: true, platform: 'browser', format: 'iife', write: false })).outputFiles[0].text;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<main id="out"></main>');
  await page.addScriptTag({ content: bundle });
  const cases = ['true', '12', 'false', '0', 'null', '""', '["$$x$$", "$$y$$"]', '{text: "$$x$$"}', '"\\u0024\\u0024x\\u0024\\u0024"'];
  for (const [index, label] of cases.entries()) {
    const result = await page.evaluate(async ({ label, index }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
      const source = `flowchart LR\nA["Before"]\nA@{ label: ${label} }\n`;
      let value;
      try {
        const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
        value = diagram.db.getVertices().get('A').text;
        const rendered = await mermaid.render(`metadata-${index}`, source);
        document.querySelector('#out').innerHTML = rendered.svg;
        return { value, rendered: true, math: document.querySelectorAll('#out math').length, text: document.querySelector('#out .nodeLabel')?.textContent };
      } catch (error) { return { value, rendered: false, error: String(error) }; }
    }, { label, index });
    process.stdout.write(JSON.stringify({ label, ...result }) + '\n');
  }
} finally { await browser.close(); }
