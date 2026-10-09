// Exercise the complete 1,000-result IPC payload inside a bounded V8 heap.
import { convert } from '../math-rendering/engine.mjs';

const count = 1000;
const texes = Array.from({ length: count }, (_, i) => String.raw`\frac{x_{${i}}+1}{y^{${i + 1}}}`);
const start = performance.now();
try {
  const outputs = texes.map(tex => convert(tex).markup);
  const conversionMs = performance.now() - start;
  process.stdout.write(JSON.stringify({ ok: true, conversionMs, heapUsedBytes: process.memoryUsage().heapUsed, outputs }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, conversionMs: performance.now() - start, error: String(error).slice(0, 500) }));
}
