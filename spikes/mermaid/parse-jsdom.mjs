// Same probe with a jsdom window installed before mermaid loads (DOMPurify needs one).
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
const t0 = performance.now();
await import('./parse-node.mjs');
console.error(`total ${Math.round(performance.now() - t0)} ms`);
