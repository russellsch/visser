// Run with Node 24. Each case gets a fresh process, 128 MiB V8 heap, and a 5 s deadline.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dirname;
const results = join(here, 'results');
mkdirSync(results, { recursive: true });
const cases = {
  inline: String.raw`x_i`,
  fraction: String.raw`\frac{a}{b}`,
  matrix: String.raw`\begin{matrix}a&b\\c&d\end{matrix}`,
  repeated_25: Array(25).fill(String.raw`\frac{a}{b}`).join('+'),
  repeated_100: Array(100).fill(String.raw`\frac{a}{b}`).join('+'),
  distinct_100: Array.from({ length: 100 }, (_, i) => String.raw`\frac{x_{${i}}+1}{y^{${i + 1}}}`).join('+'),
  wide_1024: Array(512).fill('x').join('+'),
  wide_2048: Array(1024).fill('x').join('+'),
  wide_4096: Array(2048).fill('x').join('+'),
  nested_32: `${String.raw`\sqrt{`.repeat(32)}x${'}'.repeat(32)}`,
  nested_64: `${String.raw`\sqrt{`.repeat(64)}x${'}'.repeat(64)}`,
  nested_128: `${String.raw`\sqrt{`.repeat(128)}x${'}'.repeat(128)}`,
  forbidden_unknown: String.raw`\notACommand{x}`,
};
const report = { node: process.version, executable: process.execPath, heapLimitMiB: 128,
  timeoutMs: 5000, cases: {} };
for (const [name, tex] of Object.entries(cases)) {
  const start = performance.now();
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', join(here, 'node-child.mjs'), tex],
    { timeout: 5000, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  let outcome;
  try { outcome = JSON.parse(child.stdout); } catch { outcome = { ok: false, error: child.error?.code ?? `exit ${child.status}, signal ${child.signal}` }; }
  report.cases[name] = { inputBytes: Buffer.byteLength(tex), totalMs: performance.now() - start,
    status: child.status, signal: child.signal, ...outcome };
}
writeFileSync(join(results, 'node.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.cases, null, 2));
