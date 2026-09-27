import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.DOMParser = dom.window.DOMParser;
const { default: mermaid } = await import('mermaid');
const api = mermaid.mermaidAPI;
const G = async (t) => { await mermaid.parse(t); return api.getDiagramFromText(t); };
const fc = async (t) => { const d = await G(t); const db = d.db;
  return { vertices: [...db.getVertices().values()].map(v => v.id), edges: db.getEdges().map(e => e.id), subgraphs: (db.getSubGraphs?.() ?? []).map(s => ({ id: s.id, nodes: s.nodes })), classes: [...(db.getClasses?.()?.keys?.() ?? [])] }; };
const out = {};
// 1. Leakage across two parses, and same node name in two diagrams.
out.leak1 = await fc(`flowchart LR\n a --> api`);
out.leak2 = await fc(`flowchart LR\n c --> api`);
// 2. Subgraph + classDef + style + uppercase/dotted IDs.
out.sub = await fc(`flowchart LR\n subgraph backend [Backend]\n  api[API] --> DB[(Db)]\n end\n classDef hot fill:#f00\n class api hot\n style DB fill:#0f0\n client --> backend\n n.x --> y-z`);
// 3. State composites, notes, aliases, choice.
{ const d = await G(`stateDiagram-v2\n [*] --> Active\n state Active {\n  [*] --> Running\n  Running --> Paused : pause\n }\n state "Long name" as s1\n Active --> s1\n state pick <<choice>>\n s1 --> pick\n note right of s1 : a note`);
  out.state = { states: [...d.db.getStates().values()].map(s => `${s.id}:${s.type}`), relations: d.db.getRelations().map(r => `${r.id1}->${r.id2}`) }; }
// 4. Sequence notes/loops/autonumber: are notes in getMessages, and what types?
{ const d = await G(`sequenceDiagram\n autonumber\n actor U as User\n participant api as API\n U->>api: POST\n Note over U,api: note text\n loop retry\n  api-->>U: 503\n end\n alt ok\n  api->>U: 200\n else fail\n  api->>U: 500\n end`);
  out.seq = { actors: [...d.db.getActors().values()].map(a => `${a.name}:${a.type}`), messages: d.db.getMessages().map(m => `${m.type}:${m.from ?? ''}>${m.to ?? ''}:${String(m.message ?? '').slice(0,12)}`) }; }
console.log(JSON.stringify(out, null, 1));
