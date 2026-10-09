// Bundled separately from reader.js and started from a Blob URL by math.ts.
import { convertMath, type MathConversion } from '../../core/src/math/engine.ts';

export type MathWorkItem = { key: string; tex: string; display: boolean };
export type MathWorkRequest = { id: number; items: MathWorkItem[] };
export type MathWorkResult = { key: string; conversion?: MathConversion; error?: string };
export type MathWorkResponse = { id: number; results: MathWorkResult[] };

export function processMathBatch(request: MathWorkRequest): MathWorkResponse {
  if (!Number.isSafeInteger(request?.id) || !Array.isArray(request.items) || request.items.length > 20) {
    throw new Error('Invalid math worker request');
  }
  return {
    id: request.id,
    results: request.items.map(item => {
      if (!item || typeof item.key !== 'string' || typeof item.tex !== 'string' || typeof item.display !== 'boolean') {
        return { key: typeof item?.key === 'string' ? item.key : '', error: 'Invalid math work item' };
      }
      try { return { key: item.key, conversion: convertMath(item.tex, item.display) }; }
      catch (error) { return { key: item.key, error: error instanceof Error ? error.message : 'Math conversion failed' }; }
    }),
  };
}

if (typeof self !== 'undefined' && typeof document === 'undefined' && typeof globalThis.postMessage === 'function') {
  globalThis.addEventListener('message', (event: MessageEvent<MathWorkRequest>) => {
    try { globalThis.postMessage(processMathBatch(event.data)); }
    catch { globalThis.postMessage({ id: event.data?.id, results: [] } satisfies MathWorkResponse); }
  });
}
