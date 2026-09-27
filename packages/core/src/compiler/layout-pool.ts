// Main-thread side of the layout worker: one worker per graph, terminated on
// timeout. The node/edge caps are the deterministic bound on layout cost; this
// timeout is only a safety net (§2.3).
import { Worker } from 'node:worker_threads';
import type { GraphInput, GraphLayout, LayoutFunction } from './layout.ts';

export class LayoutError extends Error {
  readonly code: 'E_LAYOUT_TIMEOUT' | 'E_LAYOUT_LIMIT';
  constructor(code: 'E_LAYOUT_TIMEOUT' | 'E_LAYOUT_LIMIT', message: string) {
    super(message);
    this.code = code;
  }
}

export const DEFAULT_LAYOUT_TIMEOUT_MS = 60_000;

/** A LayoutFunction that runs each graph in `workerPath` (for example workers/layout.cjs). */
export function workerLayout(workerPath: string, timeoutMs = DEFAULT_LAYOUT_TIMEOUT_MS): LayoutFunction {
  return (graph: GraphInput) =>
    new Promise<GraphLayout>((resolve, reject) => {
      const worker = new Worker(workerPath);
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new LayoutError('E_LAYOUT_TIMEOUT', `layout of ${graph.id} exceeded ${timeoutMs} ms`));
      }, timeoutMs);
      worker.once('message', (message: { layout?: GraphLayout; error?: string }) => {
        clearTimeout(timer);
        void worker.terminate();
        if (message.layout) resolve(message.layout);
        else reject(new Error(`layout of ${graph.id} failed: ${message.error ?? 'unknown error'}`));
      });
      worker.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.postMessage({ graph });
    });
}
