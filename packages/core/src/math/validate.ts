// Typesetting runs in a killable process; a Promise timeout cannot interrupt TeX.
import { execFile, type ExecFileException } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Diagnostic, ParsedSource } from '../types.ts';
import type { convertMath } from './engine.ts';
import { insertedMathCost, MATH_LIMITS, EMPTY_MATH_RESOURCE_TOTAL, reserveMathOccurrences, type MathResourceTotal } from './policy.ts';
import { MATH_PROCESS_LIMITS } from './process-policy.ts';
import { validateMathConversionShape } from './svg-validate.ts';

export type MathConversion = ReturnType<typeof convertMath>;
export type MathRequest = {
  tex: string;
  display: boolean;
  path: string;
  startLine: number;
  targetId?: string;
};
export type MathValidation = { conversions: Map<string, MathConversion>; diagnostics: Diagnostic[] };
export type MathWorkerReply = {
  results: Array<{ key: string; conversion?: MathConversion; error?: string; code?: string }>;
};
export { MATH_PROCESS_LIMITS } from './process-policy.ts';
export const mathKey = (tex: string, display: boolean): string => JSON.stringify([display, tex]);

/** Raw-body/prose occurrences already carry proven source positions. */
export function parsedMathRequests(parsed: ParsedSource): MathRequest[] {
  return (parsed.math ?? []).map(expression => ({ tex: expression.tex, display: expression.kind !== 'inline',
    path: expression.span.path, startLine: expression.span.startLine,
    ...(expression.targetId || expression.enclosingTargetId ? { targetId: expression.targetId ?? expression.enclosingTargetId } : {}) }));
}

let releaseWorkerPath: string | undefined;
/** Bind only to the executing verified release, never to a document-selected path. */
export function setMathWorkerPath(path: string): void { releaseWorkerPath = path; }

export async function validateMath(requests: readonly MathRequest[], options: {
  workerPath?: string;
  timeoutMs?: number;
  initialTotal?: MathResourceTotal;
} = {}): Promise<MathValidation> {
  const conversions = new Map<string, MathConversion>();
  const diagnostics: Diagnostic[] = [];
  const initialTotal = options.initialTotal ?? EMPTY_MATH_RESOURCE_TOTAL;
  try { reserveMathOccurrences(initialTotal, { svgBytes: 0, elementCount: 0 }, 0); }
  catch {
    diagnostics.push({ code: 'E_LIMIT', severity: 'error', message: 'existing math exceeds the document resource budget' });
    return { conversions, diagnostics };
  }
  if (!requests.length) return { conversions, diagnostics };
  const fail = (request: MathRequest, code: string, message: string) => {
    diagnostics.push({ code, severity: 'error', message, path: request.path, startLine: request.startLine,
      ...(request.targetId ? { targetId: request.targetId } : {}) });
  };
  const available = MATH_LIMITS.documentOccurrences - initialTotal.occurrences;
  if (requests.length > available) {
    fail(requests[Math.max(0, available)] ?? requests[0]!, 'E_LIMIT', `math exceeds the document limit of ${MATH_LIMITS.documentOccurrences} occurrences`);
    return { conversions, diagnostics };
  }
  const unique = new Map<string, MathRequest>();
  for (const request of requests) {
    if (Buffer.byteLength(request.tex, 'utf8') > MATH_LIMITS.expressionSourceBytes) fail(request, 'E_LIMIT', `math exceeds the expression limit of ${MATH_LIMITS.expressionSourceBytes} UTF-8 bytes`);
    unique.set(mathKey(request.tex, request.display), request);
  }
  if (diagnostics.length) return { conversions, diagnostics };
  const entries = [...unique];
  const workerInput = JSON.stringify({ expressions: entries.map(([key, request]) => ({ key, tex: request.tex, display: request.display })) });
  if (Buffer.byteLength(workerInput, 'utf8') > MATH_PROCESS_LIMITS.ipcBytes) {
    // The bounded request contains only validated, distinct entries. Attribute
    // rejection to its final contributing source rather than starting a worker.
    fail(entries[entries.length - 1]![1], 'E_LIMIT', `math validation request exceeds the IPC limit of ${MATH_PROCESS_LIMITS.ipcBytes} bytes`);
    return { conversions, diagnostics };
  }
  const workerPath = options.workerPath ?? releaseWorkerPath ?? fileURLToPath(new URL('./validate-worker.ts', import.meta.url));
  const outcome = await new Promise<{ error?: ExecFileException; stdout: string; stderr: string }>((done) => {
    const child = execFile(process.execPath, [`--max-old-space-size=${MATH_PROCESS_LIMITS.heapMiB}`, workerPath], {
      encoding: 'utf8', timeout: options.timeoutMs ?? MATH_PROCESS_LIMITS.timeoutMs,
      killSignal: 'SIGKILL', maxBuffer: MATH_PROCESS_LIMITS.ipcBytes, windowsHide: true,
    }, (error, stdout, stderr) => done({ ...(error ? { error } : {}), stdout, stderr }));
    // Failure to start/early termination is reported by execFile's callback.
    child.stdin?.on('error', () => {});
    child.stdin?.end(workerInput);
  });
  if (outcome.error) {
    const limited = outcome.error.killed || outcome.error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || /heap out of memory|allocation failed/i.test(outcome.stderr);
    for (const request of requests) fail(request, limited ? 'E_LIMIT' : 'E_MATH', limited
      ? 'math validation exceeded its execution, memory, or output limit'
      : 'math validation worker failed');
    return { conversions, diagnostics };
  }
  let reply: MathWorkerReply;
  try {
    reply = JSON.parse(outcome.stdout) as MathWorkerReply;
    if (!Array.isArray(reply.results) || reply.results.length !== unique.size) throw new Error('wrong result count');
    const seen = new Set<string>();
    for (const result of reply.results) {
      if (!result || !unique.has(result.key) || seen.has(result.key)) throw new Error('unknown or duplicate key');
      seen.add(result.key);
      if (result.conversion) {
        if (Object.keys(result).sort().join(',') !== 'conversion,key') throw new Error('ambiguous success result');
        const request = unique.get(result.key)!;
        const c = validateMathConversionShape(result.conversion, request);
        conversions.set(result.key, c);
      } else if (Object.keys(result).sort().join(',') !== 'code,error,key' || typeof result.error !== 'string' || !['E_MATH', 'E_LIMIT'].includes(result.code ?? '')) throw new Error('invalid error result');
    }
  } catch {
    for (const request of requests) fail(request, 'E_MATH', 'math validation worker returned invalid output');
    return { conversions: new Map(), diagnostics };
  }
  const byKey = new Map(reply.results.map(result => [result.key, result]));
  let total = initialTotal;
  for (const request of requests) {
    const result = byKey.get(mathKey(request.tex, request.display))!;
    if (!result.conversion) { fail(request, result.code === 'E_LIMIT' ? 'E_LIMIT' : 'E_MATH', result.error!); continue; }
    try { total = reserveMathOccurrences(total, insertedMathCost(result.conversion), 1); }
    catch {
      fail(request, 'E_LIMIT', 'math exceeds the document output limit (8 MiB or 50000 SVG elements)');
      break;
    }
  }
  return { conversions, diagnostics };
}
