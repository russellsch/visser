// worker_threads entry for bounded graph layout (§5.1, §7.2). The release build
// bundles this file to workers/layout.cjs; `workerLayout` in layout-pool.ts
// starts it. Messages: in {graph: GraphInput}; out {layout} or {error}.
import { parentPort } from 'node:worker_threads';
import { layoutGraph, type GraphInput } from './layout.ts';

if (parentPort) {
  const port = parentPort;
  port.on('message', (message: { graph: GraphInput }) => {
    layoutGraph(message.graph).then(
      (layout) => port.postMessage({ layout }),
      (error: unknown) => port.postMessage({ error: String((error as Error)?.message ?? error) }),
    );
  });
}
