// W0 disposable baseline probe. Run from the repository root:
// node --experimental-strip-types spikes/native-flowchart/probe.mjs
import { performance } from 'node:perf_hooks';
import ElkModule from 'elkjs/lib/elk.bundled.js';
import { toElkGraph, fromElk, layoutGraph, textWidth } from '../../packages/core/src/compiler/layout.ts';
import { graphSvg } from '../../packages/core/src/compiler/svg.ts';
import { render } from '../../packages/core/src/compiler/html.ts';

const ELK = ElkModule.default ?? ElkModule;
const utf8 = (s) => Buffer.byteLength(s, 'utf8');
const attr = (n, key) => n.attrs.find(([k]) => k === key)?.[1];
function walk(n, visit) {
  if (typeof n === 'string') return;
  visit(n);
  for (const c of n.children) walk(c, visit);
}
const ms = (t) => Math.round((performance.now() - t) * 100) / 100;

async function fixedLayout(graph, direction) {
  const { root, lines, rich } = toElkGraph(graph, direction);
  const out = await new ELK().layout(structuredClone(root));
  return fromElk(graph, out, lines, rich);
}

function fixture(name, depth, arms, crossings, extraParallel = 0, shallowEdge = false) {
  const groups = [], nodes = [], edges = [];
  const add = (id, label, group) => nodes.push({ id, label, ...(group ? { group } : {}) });
  const flow = (id, from, to, label = '') => edges.push({ id, from, to, label });
  for (let arm = 0; arm < arms; arm++) {
    let parent;
    for (let level = 0; level < depth; level++) {
      const id = `g${arm}_${level}`;
      groups.push({ id, label: `Phase ${arm + 1}.${level + 1}`, ...(parent ? { parent } : {}) });
      parent = id;
    }
    add(`n${arm}`, `Process ${arm + 1}`, parent);
  }
  add('start', 'Start');
  add('choice', 'Accepted?');
  add('end', 'End');
  flow('f_start', 'start', 'choice');
  for (let arm = 0; arm < arms; arm++) {
    flow(`f_enter_${arm}`, 'choice', `n${arm}`, arm === 0 ? 'Yes' : `Other ${arm}`);
    flow(`f_exit_${arm}`, `n${arm}`, 'end');
  }
  // Two distinct authored outcomes intentionally share an endpoint.
  flow('f_parallel', 'choice', 'n0', 'Alternative yes');
  for (let i = 0; i < extraParallel; i++) flow(`f_extra_${i}`, 'choice', 'n0', `Parallel ${i}`);
  if (shallowEdge) {
    add('shallow', 'Shallow step', 'g0_0');
    flow('f_shallow', 'choice', 'shallow', 'Shallow outcome');
  }
  for (let i = 0; i < crossings; i++) {
    const from = `n${i % arms}`, to = `n${(i + 1) % arms}`;
    flow(`f_cross_${i}`, from, to, `Retry ${i + 1}`);
  }
  return { id: name, groups, nodes, edges };
}

function countProspective(graph) {
  const parent = new Map([...graph.nodes.map((n) => [n.id, n.group]), ...graph.groups.map((g) => [g.id, g.parent])]);
  const chain = (id) => { const out = []; for (let p = parent.get(id); p; p = parent.get(p)) out.push(p); return out; };
  let raw = 0, valid = 0;
  for (const edge of graph.edges) {
    const fs = ['', ...chain(edge.from)], ts = ['', ...chain(edge.to)];
    raw += fs.length * ts.length - 1;
    for (const f of fs) for (const t of ts) {
      if ((!f && !t) || f === t || (t && chain(edge.from).includes(t)) || (f && chain(edge.to).includes(f))) continue;
      valid++;
    }
  }
  return { raw, valid };
}

function shapeAudit(layout, graph) {
  const node = new Map(layout.nodes.map((n) => [n.id, n]));
  const decision = node.get('choice');
  const label = decision?.lines ?? [];
  // A centered label rectangle inside a diamond needs |dx|/(W/2)+|dy|/(H/2)<=1.
  const inkW = Math.max(0, ...label.map(textWidth));
  const inkH = label.length * 18;
  const paddedW = inkW + 24, paddedH = inkH + 16;
  const diamondRequired = { width: 2 * paddedW, height: 2 * paddedH };
  const diamondFitsExisting = !!decision && paddedW / decision.width + paddedH / decision.height <= 1;
  const docking = graph.edges.filter((e) => e.to === 'choice' || e.from === 'choice').map((e) => {
    const p = layout.edges.find((x) => x.id === e.id)?.points ?? [];
    const at = e.to === 'choice' ? p.at(-1) : p[0];
    if (!at || !decision) return { id: e.id, missing: true };
    const cx = decision.x + decision.width / 2, cy = decision.y + decision.height / 2;
    return { id: e.id, rectangleEdge: Math.min(Math.abs(at.x - decision.x), Math.abs(at.x - decision.x - decision.width), Math.abs(at.y - decision.y), Math.abs(at.y - decision.y - decision.height)) < 0.02,
      diamondNorm: Math.round((Math.abs(at.x - cx) / (decision.width / 2) + Math.abs(at.y - cy) / (decision.height / 2)) * 1000) / 1000 };
  });
  return { existing: decision && { width: decision.width, height: decision.height }, label, diamondRequired, diamondFitsExisting, docking };
}

async function measure(name, depth, arms, crossings, extraParallel = 0, shallowEdge = false) {
  const graph = fixture(name, depth, arms, crossings, extraParallel, shallowEdge);
  const parent = new Map([...graph.nodes.map((n) => [n.id, n.group]), ...graph.groups.map((g) => [g.id, g.parent])]);
  const labels = new Map([...graph.nodes, ...graph.groups, ...graph.edges].map((x) => [x.id, x.label]));
  const rel = new Map(graph.edges.map((e) => [e.id, e]));
  const result = { name, groups: graph.groups.length, depth, nodes: graph.nodes.length, edges: graph.edges.length, prospective: countProspective(graph) };
  const t0 = performance.now();
  const layout = await fixedLayout(graph, 'DOWN');
  result.layoutMs = ms(t0);
  result.layoutBytes = utf8(JSON.stringify(layout));
  result.dimensions = [layout.width, layout.height];
  result.emptyRoutes = layout.edges.filter((e) => e.points.length < 2).map((e) => e.id);
  result.shape = shapeAudit(layout, graph);
  const t1 = performance.now();
  const svg = graphSvg({ figureId: name, title: name, layout, collapsed: graph.groups.map((g) => g.id), parentOf: (id) => parent.get(id),
    labelOf: (id) => labels.get(id) ?? id, roleOf: () => undefined, kindOf: () => undefined,
    relationship: (id) => rel.get(id) });
  result.svgMs = ms(t1);
  const proxyIds = [], proxyByFlow = new Map();
  walk(svg, (n) => {
    const flow = attr(n, 'data-vs-proxy-for');
    if (flow && attr(n, 'data-vs-proxy-from') !== undefined && attr(n, 'data-vs-proxy-to') !== undefined && attr(n, 'id')) {
      proxyIds.push(attr(n, 'id'));
      proxyByFlow.set(flow, (proxyByFlow.get(flow) ?? 0) + 1);
    }
  });
  result.proxies = proxyIds.length;
  result.uniqueProxyIds = new Set(proxyIds).size;
  result.proxyByFlow = Object.fromEntries(proxyByFlow);
  const t2 = performance.now();
  result.svgBytes = utf8(render(svg));
  result.renderMs = ms(t2);
  result.heapMiB = Math.round(process.memoryUsage().heapUsed / 1048576 * 10) / 10;
  return result;
}

const cases = [
  ['retry_parallel', 0, 2, 2],
  ['nested_two', 2, 2, 2],
  ['nested_three', 3, 2, 2],
  ['groups_eight', 2, 4, 4],
  ['groups_twelve', 3, 4, 4],
  ['depth_eight', 8, 2, 2],
  ['under_proxy_cap', 4, 4, 9],
  ['exact_proxy_cap', 4, 4, 9, 1],
  ['one_over_proxy_cap', 4, 4, 9, 1, true],
  ['over_proxy_cap', 4, 4, 10],
  ['stress_sixteen', 4, 4, 12],
];
const output = { node: process.version, baseline: '0db1968', cases: [] };
for (const [name, depth, arms, crossings, extraParallel, shallowEdge] of cases) {
  try { output.cases.push(await measure(name, depth, arms, crossings, extraParallel, shallowEdge)); }
  catch (error) { output.cases.push({ name, depth, arms, crossings, extraParallel, shallowEdge, error: String(error) }); }
}
const retry = fixture('retry_parallel', 0, 2, 2);
const autoT = performance.now();
const auto = await layoutGraph(retry);
output.autoDirection = { ms: ms(autoT), dimensions: [auto.width, auto.height], sameAsFixedDown: JSON.stringify(auto) === JSON.stringify(await fixedLayout(retry, 'DOWN')) };
console.log(JSON.stringify(output, null, 2));
