// Extension SVG output (§14.3, §15.2). An extension never gives markup text: it
// gives an element tree, and this module rebuilds it through the core
// allowlist (html.ts `h`) after stricter checks of its own. Anything outside the
// allowlist refuses the build (E_UNSAFE_CONTENT); nothing is silently dropped.
// Links, IDs, classes, and data attributes come only from the core: a `g` with
// a `target` becomes the part's interactive instance.
import { DOM } from '../compiler/dom-contract.ts';
import { h, type Child, type HNode } from '../compiler/html.ts';
import { HashError } from '../model/hash.ts';
import { depthAction, type InspectionDepth } from '../model/inspection.ts';
import type { SvgNode } from './run.ts';

const MAX_NODES = 10_000;
const MAX_DEPTH = 32;

const NUMBER = /^-?(\d+(\.\d+)?|\.\d+)(e-?\d+)?%?$/;
const COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,30}|rgba?\(\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*(,\s*[0-9.]+\s*)?\))$/;
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.eE+-]*$/;
const POINTS = /^[0-9 ,.eE+-]*$/;
const TRANSFORM = /^((translate|scale|rotate)\(\s*-?[0-9.eE+-]+(\s*[ ,]\s*-?[0-9.eE+-]+){0,2}\s*\)\s*)+$/;
const DASH = /^[0-9 ,.]*$/;

type Check = (value: string) => boolean;
const num: Check = (v) => NUMBER.test(v);
const color: Check = (v) => COLOR.test(v) && !/url/i.test(v);

const ATTRS: Record<string, Record<string, Check>> = {
  svg: { viewBox: (v) => /^-?[0-9.]+ -?[0-9.]+ [0-9.]+ [0-9.]+$/.test(v), width: num, height: num },
  g: { transform: (v) => TRANSFORM.test(v) },
  rect: { x: num, y: num, width: num, height: num, rx: num, ry: num, fill: color, stroke: color, 'stroke-width': num },
  path: { d: (v) => PATH.test(v), fill: color, stroke: color, 'stroke-width': num, 'stroke-dasharray': (v) => DASH.test(v), 'stroke-linecap': (v) => ['butt', 'round', 'square'].includes(v), 'stroke-linejoin': (v) => ['miter', 'round', 'bevel'].includes(v) },
  polygon: { points: (v) => POINTS.test(v), fill: color, stroke: color },
  text: { x: num, y: num, 'text-anchor': (v) => ['start', 'middle', 'end'].includes(v), 'dominant-baseline': (v) => ['auto', 'middle', 'hanging', 'central'].includes(v), fill: color, 'font-size': num },
  tspan: { x: num, y: num, dy: num },
  desc: {},
};
const TEXT_PARENTS = new Set(['text', 'tspan', 'desc']);

function unsafe(message: string): never {
  throw new HashError('E_UNSAFE_CONTENT', 'E_UNSAFE_CONTENT', message);
}

function bad(message: string): never {
  throw new HashError('E_EXTENSION_FAILED', 'E_EXTENSION_FAILED', message);
}

export type SvgContext = {
  extension: string;
  figureId: string;
  title: string;
  parts: ReadonlyMap<string, string>; // part ID -> label
  text: (s: string) => string; // the renderer's safe-text function (bidi controls made visible)
  depthOf?: (id: string) => InspectionDepth;
};

/** Rebuild an extension's SVG tree through the allowlist; each part must appear exactly once. */
export function extensionSvg(root: SvgNode, ctx: SvgContext): HNode {
  let count = 0;
  const seen = new Set<string>();
  const where = `extension ${ctx.extension} (${ctx.figureId})`;

  const attrs = (node: SvgNode): Record<string, string> => {
    const allowed = ATTRS[node.tag];
    if (!allowed) unsafe(`${where}: element <${node.tag}> is not allowed`);
    const out: Record<string, string> = {};
    for (const [name, raw] of Object.entries(node.attrs ?? {})) {
      const check = allowed[name];
      if (!check) unsafe(`${where}: attribute ${name} on <${node.tag}> is not allowed`);
      if (typeof raw === 'number' && !Number.isFinite(raw)) unsafe(`${where}: ${name} on <${node.tag}> is not a finite number`);
      const value = String(raw);
      if (value.length > 4096 || !check(value)) unsafe(`${where}: value of ${name} on <${node.tag}> is not allowed`);
      out[name] = value;
    }
    return out;
  };

  const build = (node: SvgNode, depth: number, parent: string): HNode => {
    if (++count > MAX_NODES) bad(`${where}: more than ${MAX_NODES} SVG elements`);
    if (depth > MAX_DEPTH) bad(`${where}: SVG deeper than ${MAX_DEPTH} levels`);
    if (node.tag === 'svg') unsafe(`${where}: a nested <svg> is not allowed`);
    const children: Child[] = (node.children ?? []).map((c) => {
      if (typeof c === 'string') {
        if (!TEXT_PARENTS.has(node.tag)) unsafe(`${where}: text is allowed only inside <text>, <tspan>, or <desc>, not <${node.tag}>`);
        return ctx.text(c);
      }
      return build(c, depth + 1, node.tag);
    });
    const element = h(node.tag, attrs(node), ...children);
    if (node.target === undefined) return element;
    if (node.tag !== 'g') unsafe(`${where}: only a <g> can carry a target, not <${node.tag}>`);
    if (parent !== 'svg' && parent !== 'g') unsafe(`${where}: a target group must be inside <svg> or <g>`);
    const label = ctx.parts.get(node.target);
    if (label === undefined) bad(`${where}: target ${node.target} is not a part of this component`);
    if (seen.has(node.target)) bad(`${where}: part ${node.target} appears twice in the figure`);
    seen.add(node.target);
    const depthValue = ctx.depthOf?.(node.target) ?? 'explanation';
    return h(depthValue === 'bare' ? 'g' : 'a', { class: 'vs-ext-part', href: depthValue === 'bare' ? undefined : `#${DOM.canonicalId(node.target)}`, id: DOM.svgInstanceId(ctx.figureId, node.target), [DOM.attr.target]: node.target, [DOM.attr.depth]: depthValue, [DOM.attr.interactive]: depthValue === 'bare' ? undefined : true, 'aria-label': depthValue === 'bare' ? undefined : `${label}; ${depthAction(depthValue)}` }, element);
  };

  if (root.tag !== 'svg') bad(`${where}: the output root must be <svg>, not <${root.tag}>`);
  if (root.target !== undefined) unsafe(`${where}: the <svg> root cannot carry a target`);
  const rootAttrs = attrs(root);
  const children = (root.children ?? []).map((c) => {
    if (typeof c === 'string') unsafe(`${where}: text directly inside <svg> is not allowed`);
    return build(c, 1, 'svg');
  });
  for (const id of ctx.parts.keys()) if (!seen.has(id)) bad(`${where}: part ${id} has no target group in the figure`);
  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', ...rootAttrs, role: 'group', 'aria-label': ctx.title, focusable: 'false' }, ...children);
}
