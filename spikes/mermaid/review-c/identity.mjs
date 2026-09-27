import { readFileSync } from 'node:fs';
import { chromium } from '/home/r/Documents/MyStuff/random_ts/visser/node_modules/playwright/index.mjs';
import { resolveMermaidFigures } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/mermaid/index.ts';
import { mermaidConfig } from '/home/r/Documents/MyStuff/random_ts/visser/packages/runtime/src/mermaid.ts';
const lib = readFileSync('/home/r/Documents/MyStuff/random_ts/visser/node_modules/mermaid/dist/mermaid.min.js', 'utf8');
const findDrawnSrc = readFileSync('/home/r/Documents/MyStuff/random_ts/visser/packages/runtime/src/mermaid.ts', 'utf8');
const cases = {
  state_notes: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : start\n  note right of Idle : waits here\n  Busy --> Idle : done\n  note left of Busy : works\n  Busy --> [*]',
  state_choice_fork: 'stateDiagram-v2\n  state pick <<choice>>\n  state split <<fork>>\n  state merge <<join>>\n  [*] --> pick\n  pick --> A : yes\n  pick --> split : no\n  split --> B\n  split --> C\n  B --> merge\n  C --> merge\n  merge --> [*]',
  seq_alias: 'sequenceDiagram\n  participant C as Client\n  actor U as User\n  U->>C: click\n  C->>S: call\n  S-->>C: reply',
  flow_subgraph_edge: 'flowchart LR\n  client --> backend\n  subgraph backend\n    subgraph inner\n      db\n    end\n    api --> db\n  end\n  api e7@--> client',
  flow_case: 'flowchart LR\n  Api --> api',
  flow_edge_id_collides: 'flowchart LR\n  a e1@--> e1',
};
const inputs = Object.entries(cases).map(([figureId, source]) => ({ figureId, source }));
const res = resolveMermaidFigures(inputs);
const b = await chromium.launch();
for (const [name, src] of Object.entries(cases)) {
  const { figure, issues } = res.get(name);
  console.log(`\n## ${name}: issues=${JSON.stringify(issues.map((i) => i.code + ' ' + i.message.slice(0, 70)))}`);
  console.log('  elements:', figure.elements.map((e) => `${e.id}(${e.kind.slice(8)},${e.renderKey},"${e.label}"${e.members ? ',members=' + e.members.join('+') : ''})`).join(' '));
  console.log('  rels:', figure.relationships.map((r) => `${r.id}[${r.renderKey}]${r.from}->${r.to}`).join(' '));
  if (issues.length) continue;
  const p = await b.newPage();
  await p.route('**/*', (r) => r.request().url().endsWith('/m.js') ? r.fulfill({ body: lib, contentType: 'text/javascript' }) : r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="o"></div><script src="/m.js"></script></body>' }));
  await p.goto('http://t.test/');
  const out = await p.evaluate(async ([src, cfg, keys]) => {
    mermaid.initialize(cfg);
    const { svg } = await mermaid.render('m-f-svg', src);
    const o = document.getElementById('o'); o.innerHTML = svg;
    const s = o.querySelector('svg');
    const withAttr = (n, v, extra) => [...s.querySelectorAll(`[${n}]`)].filter((e) => e.getAttribute(n) === v && (!extra || extra(e)));
    const byIdPattern = (prefix) => [...s.querySelectorAll('[id]')].filter((e) => { const id = e.getAttribute('id'); return id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)); });
    const find = (key) => { const i = key.indexOf(':'); const k = key.slice(0, i), v = key.slice(i + 1); const r = 'm-f-svg';
      switch (k) { case 'node': return byIdPattern(`${r}-flowchart-${v}-`); case 'state': return byIdPattern(`${r}-state-${v}-`); case 'group': return [...s.querySelectorAll('[id]')].filter((e) => e.getAttribute('id') === `${r}-${v}`);
        case 'edge': return withAttr('data-id', v); case 'transition': return withAttr('data-id', `edge${v}`); case 'participant': return withAttr('data-id', v, (e) => e.getAttribute('data-et') === 'participant');
        case 'message': return withAttr('data-id', `i${v}`, (e) => e.getAttribute('data-et') === 'message'); } return []; };
    const res = {};
    for (const k of keys) { const d = find(k); res[k] = d.length + ':' + d.map((e) => (e.getAttribute('data-from') || '') + '>' + (e.getAttribute('data-to') || '') + (e.getAttribute('class') || '').slice(0, 25)).slice(0,1).join(''); }
    const edgeIds = [...s.querySelectorAll('[data-id^="edge"]')].map((e) => e.getAttribute('data-id') + '=' + (e.getAttribute('class') || '').replace(/\s+/g, '.').slice(0, 40));
    const allIds = [...s.querySelectorAll('[id]')].map((e) => e.id).filter((x) => /state-|flowchart-/.test(x)).slice(0, 30);
    return { res, edgeIds, allIds };
  }, [src, mermaidConfig(), [...figure.elements.map((e) => e.renderKey), ...figure.relationships.map((r) => r.renderKey)]]);
  console.log('  drawn:', JSON.stringify(out.res));
  console.log('  edges:', out.edgeIds.join(' '));
  if (name.startsWith('state')) console.log('  ids:', out.allIds.join(' '));
  await p.close();
}
await b.close();
