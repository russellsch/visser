// Characterize pinned native sequence label geometry before adding an adapter.
// This records defects; successful rendering alone is not an acceptance check.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const bundle = (await build({ stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaid=mermaid;", resolveDir: process.cwd() },
  bundle: true, platform: 'browser', format: 'iife', write: false })).outputFiles[0].text;
const expressions = { fraction: String.raw`\frac{\frac{a}{b}}{\frac{c}{d}}`, overhang: String.raw`\rlap{\rule{20em}{1em}}x`, tall: String.raw`\rule{1em}{10em}` };
const cases = (label) => ({
  actor: `participant A as ${label}\nparticipant B\nA->>B: ordinary`,
  message: `participant A\nparticipant B\nA->>B: ${label}`,
  self: `participant A\nA->>A: ${label}`,
  note: `participant A\nparticipant B\nNote over A,B: ${label}`,
  loop: `participant A\nparticipant B\nloop ${label}\nA->>B: ordinary\nend`,
  branch: `participant A\nparticipant B\nalt ordinary\nA->>B: first\nelse ${label}\nB->>A: second\nend`,
  box: `box ${label}\nparticipant A\nend\nparticipant B\nA->>B: ordinary`,
  title: `title ${label}\nparticipant A\nparticipant B\nA->>B: ordinary`,
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/*', route => route.abort());
  await page.setContent('<!doctype html><main id="out"></main>');
  await page.addScriptTag({ content: bundle });
  for (const [expression, tex] of Object.entries(expressions)) for (const [role, body] of Object.entries(cases(`$$${tex}$$`))) {
    const result = await page.evaluate(async ({ body, role, expression }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, theme: 'base' });
      const rect = element => { const r = element.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom }; };
      const contains = (a,b) => b.left >= a.left-1 && b.top >= a.top-1 && b.right <= a.right+1 && b.bottom <= a.bottom+1;
      try {
        const rendered = await mermaid.render(`seq-${role}-${expression}`, `sequenceDiagram\n${body}`);
        document.querySelector('#out').innerHTML = rendered.svg;
        const svg = document.querySelector('#out svg');
        const formulas = [...svg.querySelectorAll('math')].map(math => {
          const fo = math.closest('foreignObject');
          const ink = [...math.querySelectorAll('*'),math].map(rect).filter(r => r.right>r.left && r.bottom>r.top);
          return { owner:fo?.parentElement?.getAttribute('class'), foreign:fo && rect(fo), inkInForeign:!!fo && ink.every(r=>contains(rect(fo),r)), inkInSvg:ink.every(r=>contains(rect(svg),r)) };
        });
        return { rendered:true, formulas, text:[...svg.querySelectorAll('text')].map(t=>t.textContent).filter(t=>t.includes('$$')) };
      } catch(error) { return {rendered:false,error:String(error)}; }
    }, {body,role,expression});
    assert.equal(result.rendered, true, `${role}/${expression}: ${result.error ?? 'render failed'}`);
    assert.equal(result.formulas.length, role === 'box' || role === 'title' ? 0 : 1, `${role}/${expression}: native role changed; review probe`);
    process.stdout.write(JSON.stringify({expression,role,...result})+'\n');
  }
} finally { await browser.close(); }
