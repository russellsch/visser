// Layout inside a worker_threads Worker (the §5.1 "bounded build worker" model).
import { parentPort } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { fixture, layoutDigest } from './lib.mjs';

const a = performance.now();
const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
const b = performance.now();
const elk = new ELK();
const digests = {};
for (const name of ['handoff', 'g40', 'g200']) digests[name] = (await layoutDigest(elk, fixture(name))).digest;
parentPort.postMessage({ workerElkImportMs: +(b - a).toFixed(1), workerLayoutsMs: +(performance.now() - b).toFixed(1), digests });
