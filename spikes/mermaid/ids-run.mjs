// Inspect the ids and data-* attributes Mermaid 12 gives nodes, edges, participants,
// messages, states, and transitions; check stability across renders and reloads.
import { spawn } from 'node:child_process';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
const server = spawn(process.execPath, ['serve.mjs', '4602'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const b = await chromium.launch();
const probe = async (page) => page.evaluate(async () => {
  const out = {};
  const svgs = {};
  for (const name of ['flowchart', 'sequence', 'state']) {
    const text = window.DIAGRAMS[name];
    const a = (await window.mermaid.render(`d-${name}`, text)).svg;
    const c = (await window.mermaid.render(`d-${name}`, text)).svg;
    svgs[name] = a;
    const host = document.createElement('div');
    host.innerHTML = a;
    document.body.append(host);
    const pick = (sel) => [...host.querySelectorAll(sel)].slice(0, 8).map((el) => {
      const attrs = {};
      for (const at of el.attributes) if (at.name === 'id' || at.name === 'class' || at.name.startsWith('data-')) attrs[at.name] = at.value.slice(0, 60);
      return attrs;
    });
    out[name] = {
      deterministicSameId: a === c,
      nodes: pick('g.node, g[data-id], rect.actor, g.actor, text.actor, [data-et]'),
      edges: pick('path.flowchart-link, path[data-edge], path[data-id], g.edgeLabel, .messageLine0, .messageLine1, text.messageText, path.transition'),
    };
  }
  return { out, svgs };
});
const page = await b.newPage();
await page.goto('http://127.0.0.1:4602/inline/');
await page.waitForFunction(() => window.__done === true);
const first = await probe(page);
await page.reload();
await page.waitForFunction(() => window.__done === true);
const second = await probe(page);
for (const name of Object.keys(first.svgs)) first.out[name].identicalAfterReload = first.svgs[name] === second.svgs[name];
console.log(JSON.stringify(first.out, null, 1));
await b.close(); server.kill();
