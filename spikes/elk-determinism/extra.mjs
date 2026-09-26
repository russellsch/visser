// Extra probes: raw (unrounded) stability, fractional share, option cost at the 200/400 cap.
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import ELK from 'elkjs/lib/elk.bundled.js';
import { fixture, layoutDigest, canonical, LAYOUT_OPTIONS } from './lib.mjs';
const elk = new ELK();
const out = {};
for (const name of ['handoff', 'g40']) {
  const r = await layoutDigest(elk, fixture(name));
  let total = 0, frac = 0, beyond3 = 0;
  const walk = v => { if (typeof v === 'number') { total++; if (!Number.isInteger(v)) frac++; if (Math.abs(v * 1000 - Math.round(v * 1000)) > 1e-9) beyond3++; } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(r.raw);
  out[name] = { rawDigest: createHash('sha256').update(canonical(r.raw)).digest('hex').slice(0, 12), numbers: total, nonInteger: frac, moreThan3Decimals: beyond3 };
}
const variants = {
  default: LAYOUT_OPTIONS,
  thoroughness1: { ...LAYOUT_OPTIONS, 'elk.layered.thoroughness': '1' },
  separateChildren: { ...LAYOUT_OPTIONS, 'elk.hierarchyHandling': 'SEPARATE_CHILDREN' },
  noModelOrder: Object.fromEntries(Object.entries(LAYOUT_OPTIONS).filter(([k]) => !k.includes('considerModelOrder'))),
  networkSimplexOff: { ...LAYOUT_OPTIONS, 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF' },
};
out.g200_option_cost = {};
for (const [k, o] of Object.entries(variants)) {
  const a = performance.now();
  const r = await layoutDigest(elk, fixture('g200'), o);
  const r2 = await layoutDigest(elk, fixture('g200'), o);
  out.g200_option_cost[k] = { ms: +(performance.now() - a).toFixed(0) / 2, stable: r.digest === r2.digest };
}
const a = performance.now(); await layoutDigest(elk, fixture('g40'), variants.separateChildren);
out.g40_separateChildrenMs = +(performance.now() - a).toFixed(1);
console.log(JSON.stringify(out, null, 1));
