// Disposable W0 worker target. Parent supplies bounded TeX and enforces timeout/heap.
import { convert } from '../math-rendering/engine.mjs';

const tex = process.argv[2] ?? '';
const start = performance.now();
try {
  const { markup } = convert(tex);
  process.stdout.write(JSON.stringify({ ok: true, ms: performance.now() - start,
    bytes: Buffer.byteLength(markup), nodes: [...markup.matchAll(/<[a-z][^>]*>/gi)].length,
    heapUsed: process.memoryUsage().heapUsed }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, ms: performance.now() - start,
    error: String(error).slice(0, 300), heapUsed: process.memoryUsage().heapUsed }));
}
