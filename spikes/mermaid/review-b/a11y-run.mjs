import { spawn } from 'node:child_process';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
import AxeMod from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/@axe-core/playwright/dist/index.mjs';
const AxeBuilder = AxeMod.default ?? AxeMod.AxeBuilder ?? AxeMod;
const server = spawn(process.execPath, ['serve.mjs', '4705'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const b = await chromium.launch();
const er = 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  CUSTOMER {\n    string id PK\n    string name\n  }';
const cls = 'classDiagram\n  class BoundedQueue {\n    +int capacity\n    +put(item)\n    +get() Item\n  }\n  BoundedQueue <|-- DropQueue\n  BoundedQueue o-- Condition';
for (const [w, label] of [[1440, 'desktop'], [320, 'mobile']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } }); const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4705/');
  await page.waitForFunction(() => window.__ready === true);
  for (const [name, text] of [['er', er], ['class', cls], ['flow', 'flowchart LR\n  producer[Producer] -->|put waits while full| queue[(Bounded queue)] --> worker[Consumer] --> done{{Done?}}']]) {
    const r = await page.evaluate(async (t) => { await window.runCase(t);
      const host = document.getElementById('host'); const svg = host.querySelector('svg');
      const texts = [...svg.querySelectorAll('text, foreignObject span, foreignObject div, foreignObject p')].filter((e) => e.textContent.trim());
      const scale = svg.getBoundingClientRect().width / (svg.viewBox.baseVal?.width || svg.getBoundingClientRect().width);
      const sizes = texts.map((e) => parseFloat(getComputedStyle(e).fontSize) * scale);
      return { svgWidth: Math.round(svg.getBoundingClientRect().width), viewBoxW: svg.viewBox.baseVal?.width, scale: +scale.toFixed(2), minEffectiveFontPx: +Math.min(...sizes).toFixed(1), styleAttr: (svg.getAttribute('style') || '').slice(0, 40), scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
    }, text);
    let axe = null;
    try { const res = await new AxeBuilder({ page }).include('#host').withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze(); axe = res.violations.map((v) => `${v.id}:${v.impact}:${v.nodes.length}`); } catch (e) { axe = 'axe error ' + String(e).slice(0, 80); }
    console.log(label, name, JSON.stringify(r), 'axe', JSON.stringify(axe));
  }
  await ctx.close();
}
await b.close(); server.kill();
