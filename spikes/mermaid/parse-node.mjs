// Build-time parse probe: can Node (no browser) extract structure from mermaid's own parsers?
import mermaid from 'mermaid';
const samples = {
  flowchart: `flowchart LR
  producer[Producer] -- "put waits while full" --> queue[(Bounded queue)]
  worker[Consumer] e1@-->|get removes one| queue
  queue -.-> done{{Done?}}`,
  state: `stateDiagram-v2
  [*] --> Idle
  Idle --> Connecting : demand / dial
  Connecting --> Open : handshake done
  Open --> Closed : close
  Closed --> [*]`,
  sequence: `sequenceDiagram
  participant P as Producer
  participant Q as Queue
  P->>Q: put(item)
  Q-->>P: waits while full
  Note over P,Q: capacity bound`,
};
const out = {};
for (const [name, text] of Object.entries(samples)) {
  try {
    const ok = await mermaid.parse(text);
    const { mermaidAPI } = mermaid;
    const diagram = await mermaidAPI.getDiagramFromText(text);
    const db = diagram.db;
    if (name === 'flowchart') {
      out[name] = { ok, type: diagram.type, vertices: [...db.getVertices().values()].map((v) => ({ id: v.id, text: v.text, type: v.type })), edges: db.getEdges().map((e) => ({ id: e.id, start: e.start, end: e.end, text: e.text, type: e.type, stroke: e.stroke })) };
    } else if (name === 'state') {
      out[name] = { ok, type: diagram.type, states: [...db.getStates().values()].map((s) => ({ id: s.id, type: s.type, descriptions: s.descriptions })), relations: db.getRelations().map((r) => ({ id1: r.id1, id2: r.id2, description: r.relationTitle })) };
    } else {
      out[name] = { ok, type: diagram.type, actors: [...db.getActors().values()].map((a) => ({ name: a.name, description: a.description, type: a.type })), messages: db.getMessages().map((m) => ({ from: m.from, to: m.to, message: m.message, type: m.type })) };
    }
  } catch (e) {
    out[name] = { error: String(e && e.stack || e).split('\n').slice(0, 4).join(' | ') };
  }
}
console.log(JSON.stringify(out, null, 1));
