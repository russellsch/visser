// Time build-time parsing of crafted inputs, one per child process with a wall-clock cap.
import { spawnSync } from 'node:child_process';
const cases = {
  big5k: () => 'flowchart LR\n' + Array.from({ length: 5000 }, (_, i) => `  n${i}[N${i}] --> n${i + 1}[N${i + 1}]`).join('\n'),
  longLabel1MB: () => 'flowchart LR\n  a["' + 'x'.repeat(1_000_000) + '"] --> b[B]',
  nestedSubgraph300: () => 'flowchart LR\n' + Array.from({ length: 300 }, (_, i) => `subgraph s${i}`).join('\n') + '\n a --> b\n' + 'end\n'.repeat(300),
  manyEdgesDense: () => 'flowchart LR\n' + Array.from({ length: 150 }, (_, i) => Array.from({ length: 150 }, (_, j) => `  a${i} --> b${j}`).join('\n')).join('\n'),
  unterminatedString: () => 'flowchart LR\n  a["' + 'ab'.repeat(200000) + '\n --> b',
  seq5k: () => 'sequenceDiagram\n' + Array.from({ length: 5000 }, (_, i) => `  A->>B: m${i}`).join('\n'),
  stateDeep: () => 'stateDiagram-v2\n' + Array.from({ length: 200 }, (_, i) => `state s${i} {`).join('\n') + '\n [*] --> x\n' + '}\n'.repeat(200),
  regexBait: () => 'flowchart LR\n  a' + '-'.repeat(50000) + '>b',
  jsdomScript: () => 'flowchart LR\n  a["<script>globalThis.__pwned=1</script><img src=x onerror=globalThis.__pwned=2>"] --> b[B]',
};
const runner = `
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.DOMParser = dom.window.DOMParser;
const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
const text = await new Promise((r) => { let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => r(s)); });
const t0 = performance.now();
let ok = true, err = '';
try { const d = await mermaid.mermaidAPI.getDiagramFromText(text); const db = d.db; const v = db.getVertices?.(); ok = true; err = v ? 'vertices=' + (v.size ?? Object.keys(v).length) : ''; } catch (e) { ok = false; err = String(e).slice(0, 60); }
const ms = Math.round(performance.now() - t0);
console.log(JSON.stringify({ ok, ms, err, pwned: globalThis.__pwned ?? dom.window.__pwned ?? null, rssMB: Math.round(process.memoryUsage().rss / 1e6) }));
process.exit(0);
`;
for (const [name, make] of Object.entries(cases)) {
  const input = make();
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', runner], { cwd: new URL('..', import.meta.url).pathname, input, encoding: 'utf8', timeout: 30000, maxBuffer: 1e7 });
  const wall = Date.now() - t0;
  console.log(name.padEnd(20), `${(input.length / 1024).toFixed(0)}KiB`.padStart(8), r.signal ? `KILLED ${r.signal} after ${wall}ms` : (r.stdout.trim() || r.stderr.trim().slice(0, 120)));
}
