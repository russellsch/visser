import { isDeepStrictEqual } from 'node:util';
import { MathPolicyError } from '../math/policy.ts';
import type { RequirementRenderMath } from './requirement-transport.ts';
// Synchronous, bounded Mermaid parsing (§9.12). The model is built
// synchronously (loadBundle), so the parse runs in a separate Node process with
// spawnSync, a wall-clock timeout, and a heap limit. Results are cached by
// source digest for the life of the process.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { RawResult } from './parse-worker.ts';
import type { MermaidDiagramType } from './types.ts';

export type ParseRequest = { figureId: string; source: string; originalSource?: string; type: MermaidDiagramType; pie?: boolean; timeline?: boolean; journey?: boolean; quadrant?: boolean; xy?: boolean; sankey?: boolean; radar?: boolean; requirement?: boolean; er?: boolean; kanban?: boolean; info?: boolean };
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
// Independent of mutable figure/cache objects: only fresh worker output can
// establish this source-bound grammar ownership receipt.
const sourceReceipts = new Map<string, string>();

/** The release sets `<release>/workers/mermaid-parse.cjs`; source mode uses the .ts worker. */
export function setMermaidWorkerPath(path: string): void {
  workerPath = path;
  cache.clear();
  sourceReceipts.clear();
}

/** Test seam: shorten the wall-clock limit. */
export function setMermaidParseTimeout(ms: number): void {
  timeoutMs = ms;
}

export function clearMermaidParseCache(): void {
  cache.clear();
  sourceReceipts.clear();
}

const keyOf = (r: ParseRequest) => createHash('sha256').update(JSON.stringify([r.type, r.pie, r.timeline, r.journey, r.quadrant, r.xy, r.sankey, r.radar, r.requirement, r.er, r.kanban, r.info, r.source, r.originalSource])).digest('hex');

/** Parse every request; one worker process for all uncached figures of a document. */
export function parseMermaid(requests: ParseRequest[]): Map<string, ParseOutcome> {
  const out = new Map<string, ParseOutcome>();
  if (new Set(requests.map(request => request.figureId)).size !== requests.length) {
    for (const request of requests) out.set(request.figureId, {figureId: request.figureId, ok: false, code: 'E_SEMANTIC', error: 'duplicate Mermaid parse request identity'});
    return out;
  }
  const pending: ParseRequest[] = [];
  for (const request of requests) {
    const cached = cache.get(keyOf(request));
    if (cached) out.set(request.figureId, { ...structuredClone(cached), figureId: request.figureId });
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
  const expected = new Map(pending.map(request => [request.figureId, request.type]));
  const responseIds = new Set<string>();
  if (!parsed || !Array.isArray(parsed.results) || parsed.results.length !== pending.length || parsed.results.some(result => {
    if (!result || typeof result.figureId !== 'string' || !expected.has(result.figureId) || responseIds.has(result.figureId) ||
        (result.ok !== true && result.ok !== false) || (result.ok && result.type !== expected.get(result.figureId))) return true;
    responseIds.add(result.figureId); return false;
  })) {
    failAll('E_SEMANTIC', 'the Mermaid parse worker returned mismatched result identities');
    return out;
  }
  const byId = new Map(parsed.results.map((r) => [r.figureId, r]));
  for (const request of pending) {
    const result = byId.get(request.figureId);
    if (!result) {
      out.set(request.figureId, { figureId: request.figureId, ok: false, error: 'no result from the Mermaid parse worker', code: 'E_SEMANTIC' });
      continue;
    }
    if (result.ok) {
      for (const family of SOURCE_FAMILIES) {
        const requested = family === 'flowchart' || family === 'sequence' || family === 'state'
          ? request.type === family : request[family] === true;
        const payload = sourcePayload(result, family);
        if (requested && payload !== undefined) {
          sourceReceipts.set(receiptKey(request, family), JSON.stringify(payload));
        }
      }
    }
    // Results belong to callers; neither top-level deletions nor nested edits
    // may change what a later document receives from the parse cache.
    cache.set(keyOf(request), structuredClone(result));
    out.set(request.figureId, result);
  }
  return out;
}


const SOURCE_FAMILIES = ['flowchart', 'sequence', 'state', 'journey', 'quadrant', 'xy', 'sankey', 'radar', 'requirement', 'kanban', 'er', 'info', 'pie', 'timeline'] as const;
export type MermaidMathSourceFamily = typeof SOURCE_FAMILIES[number];
const receiptKey = (request: ParseRequest, family: MermaidMathSourceFamily) => `${family}:${keyOf(request)}`;

function sourcePayload(result: Extract<RawResult, { ok: true }>, family: MermaidMathSourceFamily): unknown {
  // Pie and timeline figures retain only records. The worker's reconciliation
  // and renderer copy counts are already included in these emitted records.
  if (family === 'pie') return result.pieMath?.records;
  if (family === 'timeline') return result.timelineMath?.records;
  return result[`${family}Math`];
}

/** Authenticate exact field ownership against a trusted isolated parse. */
export function assertMermaidSourceTransport(family: MermaidMathSourceFamily, source: string, originalSource: string, math: unknown): void {
  const native = family === 'flowchart' || family === 'sequence' || family === 'state';
  const request: ParseRequest = {
    figureId: `${family}-source-verification`, type: native ? family : 'other',
    ...(!native ? { [family]: true } : {}), source, originalSource,
  };
  const key = receiptKey(request, family);
  if (!sourceReceipts.has(key)) {
    // A mutable cache entry cannot establish a receipt. Revalidate through the
    // same bounded worker when callers supply a legitimate detached payload.
    cache.delete(keyOf(request));
    parseMermaid([request]);
  }
  const receipt = sourceReceipts.get(key);
  if (receipt === undefined || !isDeepStrictEqual(JSON.parse(receipt), math)) {
    throw new MathPolicyError('E_MATH_INVALID', `Mermaid source map: ${family} transport differs from authenticated source ownership`);
  }
}

/** Compatibility wrapper for the first source-authenticated family. */
export function assertRequirementSourceTransport(source: string, originalSource: string, math: RequirementRenderMath): void {
  assertMermaidSourceTransport('requirement', source, originalSource, math);
}
