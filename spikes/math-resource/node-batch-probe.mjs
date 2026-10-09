// Bound child conversion by 128 MiB V8 heap, 5 s wall time, and 16 MiB IPC buffer.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dirname;
const results = join(here, 'results');
mkdirSync(results, { recursive: true });
const report = { node: process.version, executable: process.execPath, heapLimitMiB: 128,
  timeoutMs: 5000, maxBufferBytes: 16 * 1024 * 1024, runs: [] };
for (let run = 0; run < 3; run++) {
  const start = performance.now();
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', join(here, 'node-batch-child.mjs')],
    { timeout: report.timeoutMs, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: report.maxBufferBytes });
  const outcome = { totalMs: performance.now() - start, status: child.status, signal: child.signal,
    errorCode: child.error?.code, stdoutBytes: Buffer.byteLength(child.stdout ?? ''), stderrTail: (child.stderr ?? '').slice(-800) };
  try {
    const body = JSON.parse(child.stdout);
    outcome.ok = body.ok;
    outcome.conversionMs = body.conversionMs;
    outcome.heapUsedBytes = body.heapUsedBytes;
    if (body.ok) {
      outcome.outputs = body.outputs.length;
      outcome.expandedBytes = body.outputs.reduce((n, markup) => n + Buffer.byteLength(markup), 0);
      outcome.expandedTagCount = body.outputs.reduce((n, markup) => n + (markup.match(/<\/?[A-Za-z][^>]*>/g)?.filter(tag => !tag.startsWith('</')).length ?? 0), 0);
    } else outcome.error = body.error;
  } catch { outcome.ok = false; outcome.error = child.error?.message ?? 'invalid child output'; }
  report.runs.push(outcome);
}
writeFileSync(join(results, 'node-batch.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
