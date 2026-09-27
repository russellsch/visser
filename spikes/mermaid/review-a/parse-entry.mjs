import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.DOMParser = dom.window.DOMParser;
const { default: mermaid } = await import('mermaid');
const t = 'flowchart LR\n a --> b';
await mermaid.parse(t);
const d = await mermaid.mermaidAPI.getDiagramFromText(t);
console.log(JSON.stringify([...d.db.getVertices().keys()]));
