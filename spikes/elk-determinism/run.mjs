// Spike 2 driver. Usage: node run.mjs <mode> [args]
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { fixture, generated, layoutDigest, nearBoundary, LAYOUT_OPTIONS } from './lib.mjs';

const t0 = performance.now(); // ms since process start (performance.timeOrigin)
const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
const tLoad = performance.now();
const mode = process.argv[2];

function shuffle(arr, seed) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function shuffled(g, seed) {
  const c = structuredClone(g);
  c.edges = shuffle(c.edges, seed);
  c.children = shuffle(c.children, seed + 1).map(ch => ch.children ? { ...ch, children: shuffle(ch.children, seed + 2) } : ch);
  return c;
}

if (mode === 'once') {
  // Cold single layout in a fresh process; prints timing + digest as JSON.
  const name = process.argv[3];
  const elk = new ELK();
  const tA = performance.now();
  const { digest } = await layoutDigest(elk, fixture(name));
  const tB = performance.now();
  console.log(JSON.stringify({ name, digest, processStartToImportMs: +t0.toFixed(1), elkImportMs: +(tLoad - t0).toFixed(1), firstLayoutMs: +(tB - tA).toFixed(1), totalSinceProcessStartMs: +tB.toFixed(1) }));
} else if (mode === 'inproc') {
  const elk = new ELK();
  const res = {};
  for (const name of ['handoff', 'g40', 'g200']) {
    const g = fixture(name);
    const digests = new Set(); const times = [];
    let sample;
    for (let i = 0; i < 20; i++) {
      const a = performance.now();
      const r = await layoutDigest(elk, g);
      times.push(performance.now() - a);
      digests.add(r.digest); sample = r;
    }
    const nb = nearBoundary(sample.raw);
    times.sort((x, y) => x - y);
    res[name] = { distinctDigests: digests.size, digest: [...digests][0], firstMs: +times.at(-1).toFixed(1), medianMs: +times[10].toFixed(1), minMs: +times[0].toFixed(1), numbers: nb.total, exactHalfUlpBoundary: nb.near, width: sample.rounded.width, height: sample.rounded.height };
  }
  console.log(JSON.stringify(res, null, 1));
} else if (mode === 'worker') {
  // Layout inside a worker_threads Worker; report startup cost + digests.
  const a = performance.now();
  const w = new Worker(fileURLToPath(new URL('./worker.mjs', import.meta.url)));
  const out = await new Promise((res, rej) => { w.once('message', res); w.once('error', rej); });
  const b = performance.now();
  await w.terminate();
  console.log(JSON.stringify({ workerRoundTripMs: +(b - a).toFixed(1), ...out }));
} else if (mode === 'shuffle') {
  const elk = new ELK();
  const out = {};
  for (const name of ['handoff', 'g40', 'g200']) {
    const base = (await layoutDigest(elk, fixture(name))).digest;
    const set = new Set();
    for (let s = 1; s <= 5; s++) set.add((await layoutDigest(elk, shuffled(fixture(name), s * 97))).digest);
    const again = (await layoutDigest(elk, shuffled(fixture(name), 97))).digest === (await layoutDigest(elk, shuffled(fixture(name), 97))).digest;
    out[name] = { authoredDigest: base.slice(0, 12), shuffledDistinct: set.size, anyShuffleEqualsAuthored: set.has(base), sameShuffleStable: again };
  }
  // Also: does the seed matter at all when model order is considered?
  const noOrder = { ...LAYOUT_OPTIONS }; delete noOrder['elk.layered.considerModelOrder.strategy'];
  const s1 = (await layoutDigest(elk, fixture('g40'), noOrder)).digest;
  const s2 = (await layoutDigest(elk, fixture('g40'), { ...noOrder, 'elk.randomSeed': '2' })).digest;
  const s3 = (await layoutDigest(elk, fixture('g40'), { ...LAYOUT_OPTIONS, 'elk.randomSeed': '2' })).digest;
  const base = (await layoutDigest(elk, fixture('g40'))).digest;
  out.seedEffect_g40 = { withoutModelOrder_seed1_vs_seed2_differ: s1 !== s2, withModelOrder_seed1_vs_seed2_differ: base !== s3, modelOrderOptionChangesResult: s1 !== base };
  console.log(JSON.stringify(out, null, 1));
} else if (mode === 'budget') {
  // 8 distinct 40-node/80-edge visuals, sequentially, in this (cold) process.
  const elk = new ELK();
  const graphs = Array.from({ length: 8 }, (_, i) => generated(40, 80, 4, 1000 + i));
  const a = performance.now();
  for (const g of graphs) await layoutDigest(elk, g);
  const b = performance.now();
  for (const g of graphs) await layoutDigest(elk, g);
  const c = performance.now();
  console.log(JSON.stringify({ elkImportMs: +(tLoad - t0).toFixed(1), cold8Ms: +(b - a).toFixed(1), warm8Ms: +(c - b).toFixed(1), processStartToDoneMs: +c.toFixed(1) }));
} else {
  console.error('modes: once <fixture> | inproc | worker | shuffle | budget');
  process.exit(2);
}
