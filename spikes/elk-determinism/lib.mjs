// Spike 2 helpers: text metrics, fixtures, ELK layout, canonical digest.
import { createHash } from 'node:crypto';

// --- Text metrics: nominal 14px sans advance widths (approximate, fixed table) ---
const W = {};
const set = (chars, w) => { for (const c of chars) W[c] = w; };
set('iljI.,:;!|\'', 3.9);
set('ftr()[]{}-" ', 4.7);
set('abcdeghknopqsuvxyz0123456789_?$', 7.8);
set('ABCDEFGHKLNOPRSTUVXYZJ', 9.3);
set('mwMW@%', 11.7);
const FALLBACK = 14.0; // any character not in the table (non-ASCII, emoji)
export const LINE_HEIGHT = 18;

export function textWidth(s) {
  let w = 0;
  for (const c of s) w += W[c] ?? FALLBACK;
  return Math.round(w * 1000) / 1000;
}

export function wrap(text, maxWidth) {
  const lines = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const cand = cur ? cur + ' ' + word : word;
    if (cur && textWidth(cand) > maxWidth) { lines.push(cur); cur = word; } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function box(text, maxWidth, padX, padY) {
  const lines = wrap(text, maxWidth);
  const w = Math.max(...lines.map(textWidth));
  return { width: Math.ceil(w + 2 * padX), height: lines.length * LINE_HEIGHT + 2 * padY };
}

// --- Deterministic PRNG for generated fixtures (mulberry32) ---
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['queue', 'producer', 'worker', 'cache', 'index', 'shard', 'router', 'ledger',
  'waits when full', 'reads', 'writes batch', 'notifies', 'owns', 'depends on', 'calls',
  'emits events', 'retries on failure', 'blocks until space', 'Überprüfung', 'naïve path'];

function node(id, label) {
  const b = box(label, 160, 12, 8);
  return { id, width: b.width, height: b.height, labels: [{ text: label, ...box(label, 160, 0, 0) }] };
}
function edge(id, from, to, label) {
  const b = box(label, 120, 2, 1);
  return { id, sources: [from], targets: [to], labels: [{ id: id + '_l', text: label, width: b.width, height: b.height }] };
}

export function handoff() {
  return {
    id: 'handoff',
    children: [node('producer', 'Producer'), node('queue', 'Bounded queue'), node('worker', 'Consumer')],
    edges: [
      edge('enqueue', 'producer', 'queue', 'put waits while full'),
      edge('dequeue', 'worker', 'queue', 'get removes one item; waits while empty'),
    ],
  };
}

export function generated(nNodes, nEdges, nGroups, seed) {
  const r = rng(seed);
  const groups = [];
  for (let g = 0; g < nGroups; g++) groups.push({ id: 'g' + g, labels: [{ text: 'Group ' + g, width: 60, height: 18 }], children: [] });
  const ids = [];
  for (let i = 0; i < nNodes; i++) {
    const label = WORDS[Math.floor(r() * WORDS.length)] + ' ' + i;
    const n = node('n' + i, label);
    ids.push(n.id);
    if (nGroups) groups[i % nGroups].children.push(n);
  }
  const edges = [];
  for (let e = 0; e < nEdges; e++) {
    const a = Math.floor(r() * nNodes);
    let b = Math.floor(r() * nNodes);
    if (b === a) b = (a + 1) % nNodes;
    edges.push(edge('e' + e, ids[a], ids[b], WORDS[Math.floor(r() * WORDS.length)]));
  }
  return { id: 'gen' + nNodes, children: nGroups ? groups : ids.map((id, i) => node(id, 'node ' + i)), edges };
}

export const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.randomSeed': '1',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'false',
  'elk.layered.thoroughness': '7',
  'elk.edgeLabels.placement': 'CENTER',
  'elk.layered.spacing.nodeNodeBetweenLayers': '40',
  'elk.spacing.nodeNode': '24',
  'elk.spacing.edgeLabel': '4',
};

export function fixture(name) {
  if (name === 'handoff') return handoff();
  if (name === 'g40') return generated(40, 80, 4, 42);
  if (name === 'g200') return generated(200, 400, 8, 7);
  throw new Error('unknown fixture ' + name);
}

// Round every number to 3 decimals, keep structure; drop ELK-internal noise keys.
function round(v) {
  if (typeof v === 'number') {
    const r = Math.round(v * 1000) / 1000;
    return Object.is(r, -0) ? 0 : r;
  }
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) { if (k === '$H') continue; o[k] = round(v[k]); }
    return o;
  }
  return v;
}

export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    // code-point key order (spec §7.4), not default UTF-16 sort
    const keys = Object.keys(v).sort((a, b) => {
      const A = [...a].map(c => c.codePointAt(0)), B = [...b].map(c => c.codePointAt(0));
      for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return A[i] - B[i];
      return A.length - B.length;
    });
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('non-finite');
  return JSON.stringify(v);
}

export async function layoutDigest(elk, graph, options = LAYOUT_OPTIONS) {
  const out = await elk.layout(structuredClone({ ...graph, layoutOptions: options }));
  const rounded = round(out);
  const text = canonical(rounded);
  return { digest: createHash('sha256').update(text).digest('hex'), rounded, raw: out };
}

// Count coordinates whose 3-decimal rounding sits near a .0005 boundary (fragility).
export function nearBoundary(v, acc = { total: 0, near: 0 }) {
  if (typeof v === 'number') {
    acc.total++;
    const frac = Math.abs(v * 1000 - Math.trunc(v * 1000));
    if (Math.abs(frac - 0.5) < 1e-6) acc.near++;
  } else if (Array.isArray(v)) v.forEach(x => nearBoundary(x, acc));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) nearBoundary(v[k], acc);
  return acc;
}
