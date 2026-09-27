// Synchronous, bounded Mermaid parsing (§9.12). The model is built
// synchronously (loadBundle), so the parse runs in a separate Node process with
// spawnSync, a wall-clock timeout, and a heap limit. Results are cached by
// source digest for the life of the process.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { RawResult } from './parse-worker.ts';
import type { MermaidDiagramType } from './types.ts';

export type ParseRequest = { figureId: string; source: string; type: MermaidDiagramType };
export type ParseOutcome = RawResult | { figureId: string; ok: false; error: string; code: 'E_LIMIT' | 'E_SEMANTIC' };

/** The source-mode worker next to this module; fileURLToPath decodes `%20` and other escapes. */
export function workerPathFor(moduleUrl: string): string {
  return fileURLToPath(new URL('./parse-worker.ts', moduleUrl));
}

let workerPath: string | undefined = (() => {
  try {
    const here = import.meta.url;
    return here ? workerPathFor(here) : undefined;
  } catch {
    return undefined;
  }
})();
let timeoutMs = 30_000;
const HEAP_MB = 512;
const cache = new Map<string, RawResult>();

/** The release sets `<release>/workers/mermaid-parse.cjs`; source mode uses the .ts worker. */
export function setMermaidWorkerPath(path: string): void {
  workerPath = path;
  cache.clear();
}

/** Test seam: shorten the wall-clock limit. */
export function setMermaidParseTimeout(ms: number): void {
  timeoutMs = ms;
}

export function clearMermaidParseCache(): void {
  cache.clear();
}

const keyOf = (r: ParseRequest) => createHash('sha256').update(`${r.type}\n${r.source}`).digest('hex');

/** Parse every request; one worker process for all uncached figures of a document. */
export function parseMermaid(requests: ParseRequest[]): Map<string, ParseOutcome> {
  const out = new Map<string, ParseOutcome>();
  const pending: ParseRequest[] = [];
  for (const request of requests) {
    const cached = cache.get(keyOf(request));
    if (cached) out.set(request.figureId, { ...cached, figureId: request.figureId });
    else pending.push(request);
  }
  if (pending.length === 0) return out;

  const failAll = (code: 'E_LIMIT' | 'E_SEMANTIC', error: string) => {
    for (const r of pending) out.set(r.figureId, { figureId: r.figureId, ok: false, error, code });
  };
  if (!workerPath) {
    failAll('E_SEMANTIC', 'the Mermaid parse worker is not available in this build');
    return out;
  }
  const child = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, workerPath], {
    input: JSON.stringify({ figures: pending }),
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  const timedOut = (child.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT' || child.signal === 'SIGKILL';
  if (timedOut) {
    failAll('E_LIMIT', `Mermaid parsing exceeded ${Math.round(timeoutMs / 1000)} s`);
    return out;
  }
  if (child.status !== 0) {
    const reason = child.status === null ? `signal ${child.signal ?? 'unknown'}` : `exit ${child.status}`;
    const memory = /heap out of memory|allocation failed/i.test(child.stderr ?? '');
    failAll(memory ? 'E_LIMIT' : 'E_SEMANTIC', memory ? `Mermaid parsing exceeded the ${HEAP_MB} MB heap limit` : `the Mermaid parse worker failed (${reason})`);
    return out;
  }
  let parsed: { results: RawResult[] };
  try {
    parsed = JSON.parse(child.stdout) as { results: RawResult[] };
  } catch {
    failAll('E_SEMANTIC', 'the Mermaid parse worker returned invalid output');
    return out;
  }
  const byId = new Map(parsed.results.map((r) => [r.figureId, r]));
  for (const request of pending) {
    const result = byId.get(request.figureId);
    if (!result) {
      out.set(request.figureId, { figureId: request.figureId, ok: false, error: 'no result from the Mermaid parse worker', code: 'E_SEMANTIC' });
      continue;
    }
    cache.set(keyOf(request), result);
    out.set(request.figureId, result);
  }
  return out;
}
