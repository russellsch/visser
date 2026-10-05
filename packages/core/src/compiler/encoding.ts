// Visual encoding of one categorical variable per figure family
// (docs/IMPROVEMENTS.md §2.1, §3.2, §3.3). A figure encodes at most one
// variable in hue. Every hue has a paired cue (a shape, a line pattern, or a
// mark), and the value word stays in the lists, so the figure does not depend
// on colour alone. The tables here are the single source for the SVG and for
// the legend.
import type { EmphasisTone } from '../model/presentation.ts';
import { h, type HNode } from './html.ts';

/** The six category hues of reader.css (§3.1). Blue is the accent, so no category uses it. */
export type Category = 'teal' | 'amber' | 'violet' | 'green' | 'rose' | 'slate';

/**
 * Light-theme values, written as SVG presentation attributes. reader.css
 * overrides them with the theme tokens, so these apply only where the
 * stylesheet does not load (for example, a copied SVG).
 */
export const CATEGORY_HEX: Readonly<Record<Category, { stroke: string; tint: string }>> = {
  teal: { stroke: '#0f766e', tint: '#e6f4f2' },
  amber: { stroke: '#b45309', tint: '#fdf1e1' },
  violet: { stroke: '#6d28d9', tint: '#f0eafb' },
  green: { stroke: '#15803d', tint: '#e7f5ec' },
  rose: { stroke: '#be123c', tint: '#fce8ee' },
  slate: { stroke: '#475569', tint: '#eef1f5' },
};

export const INK_STROKE = '#2f3a4a';
export const NODE_FILL = '#ffffff';
export const DANGER_STROKE = '#b00020';

export type Shape = 'rounded' | 'pill' | 'drum' | 'chamfer';
// `triangle`, `diamond`, and `arrow` are the line ends of a domain relation
// (docs/IMPROVEMENTS.md §5.3): a hollow triangle at `to` (is-a), a filled
// diamond at the owner (has), and an arrowhead at `to`.
// `evidence` is the small page mark of a trace observation: the event is a
// log line, an alert, or a metric reading with a source (§14.6).
// `double` is the second, inner outline of a domain `value` concept (§5.3).
export type Mark = 'check' | 'question' | 'cross' | 'initial' | 'terminal' | 'loop' | 'triangle' | 'diamond' | 'arrow' | 'evidence' | 'double';

/** The cue set for one value of a family's encoded variable. */
export type Cue = {
  word: string; // the value word in the legend and in the lists
  cat?: Category; // hue, shown only when the figure uses 2 or more values
  shape?: Shape;
  dash?: string; // stroke-dasharray of the outline or the line
  noFill?: boolean; // the outline only, no tint
  mark?: Mark;
  danger?: boolean; // the failure stroke (--vs-danger), not a category hue
  swatch: 'box' | 'line' | 'lifeline';
};

/** The style that the SVG renderer applies to one node or edge. */
export type PartStyle = {
  emphasis?: EmphasisTone;
  emphasisWeight?: boolean;
  cat?: Category;
  shape?: Shape;
  dash?: string;
  noFill?: boolean;
  marks?: Mark[];
  danger?: boolean;
  labelHue?: boolean; // the edge label takes the hue too (transform loss)
  className?: string; // extra classes, for example vs-initial and vs-terminal
};

const DASHED = '6 4';
const DOTTED = '2 4';
const DASH_DOT = '10 3 2 3';

// architecture: node `role` (§3.2).
export const ROLE_CUES: Readonly<Record<string, Cue>> = {
  interface: { word: 'interface', cat: 'teal', shape: 'pill', swatch: 'box' },
  process: { word: 'process', cat: 'slate', shape: 'rounded', swatch: 'box' },
  storage: { word: 'storage', cat: 'amber', shape: 'drum', swatch: 'box' },
  external: { word: 'external', cat: 'violet', shape: 'rounded', dash: DASHED, swatch: 'box' },
  decision: { word: 'decision', cat: 'green', shape: 'chamfer', swatch: 'box' },
  concept: { word: 'concept', shape: 'rounded', dash: DOTTED, noFill: true, swatch: 'box' },
};

// architecture: edge `kind` is a line pattern, not a hue (§3.2). A kind that
// is not in this table has a solid line. The legend lists a pattern chip for
// each kind that the figure uses.
export const EDGE_KIND_CUES: Readonly<Record<string, Cue>> = {
  call: { word: 'call', swatch: 'line' },
  'blocking-call': { word: 'blocking-call', swatch: 'line' },
  data: { word: 'data', dash: DASHED, swatch: 'line' },
  control: { word: 'control', dash: DOTTED, swatch: 'line' },
  feedback: { word: 'feedback', mark: 'loop', swatch: 'line' },
  owns: { word: 'owns', swatch: 'line' },
  'depends-on': { word: 'depends-on', swatch: 'line' },
  contains: { word: 'contains', swatch: 'line' },
};

// cause: `basis` of factors and links. The state family uses the same line
// patterns for a transition basis, without the hue (§3.2).
export const BASIS_CUES: Readonly<Record<string, Cue>> = {
  observed: { word: 'observed', swatch: 'line' },
  inferred: { word: 'inferred', cat: 'amber', dash: DASHED, swatch: 'line' },
  hypothesis: { word: 'hypothesis', cat: 'violet', dash: DOTTED, swatch: 'line' },
  stipulated: { word: 'stipulated', cat: 'slate', dash: DASH_DOT, swatch: 'line' },
};
/** A link or factor without a known basis: dotted ink, and no legend chip. */
export const UNSTATED_BASIS_DASH = '1 3';

// plan: task `status` (§3.2). A task without a status is proposed.
export const STATUS_CUES: Readonly<Record<string, Cue>> = {
  complete: { word: 'complete', cat: 'green', mark: 'check', swatch: 'box' },
  ready: { word: 'ready', cat: 'teal', swatch: 'box' },
  blocked: { word: 'blocked', cat: 'amber', dash: DASHED, swatch: 'box' },
  // A dotted outline, so proposed and ready differ without hue (review F-01).
  proposed: { word: 'proposed', cat: 'slate', noFill: true, dash: DOTTED, swatch: 'box' },
  unknown: { word: 'unknown', noFill: true, mark: 'question', swatch: 'box' },
};

// plan: dependency `kind` is a line pattern, not a hue (§3.2). A dependency
// without a kind is finish-start.
export const DEPENDENCY_KIND_CUES: Readonly<Record<string, Cue>> = {
  'finish-start': { word: 'finish-start', swatch: 'line' },
  input: { word: 'input', dash: DASHED, swatch: 'line' },
  decision: { word: 'decision', dash: DOTTED, swatch: 'line' },
};

// trace: event `kind`, failure and wait only. Every other kind is ink (§3.2).
// A failure has a "✕" mark as well as the danger stroke, so it does not
// depend on colour (review F-02).
export const EVENT_CUES: Readonly<Record<string, Cue>> = {
  failure: { word: 'failure', danger: true, mark: 'cross', swatch: 'box' },
  wait: { word: 'wait', cat: 'amber', dash: '5 3', swatch: 'box' },
  // An observation has no hue: its cue is the evidence mark (§14.6).
  observation: { word: 'observation', mark: 'evidence', swatch: 'box' },
};

// domain: concept `category` (§3.2, §5.3). Each hue has a shape cue: thing
// is the plain box (radius 6), actor a pill, event a chamfer, value a double
// outline with no fill, and rule a dotted outline. The double outline stays
// in forced colours, where no fill and the plain box look the same (phase 4
// review D4).
export const CATEGORY_CUES: Readonly<Record<string, Cue>> = {
  thing: { word: 'thing', cat: 'slate', shape: 'rounded', swatch: 'box' },
  actor: { word: 'actor', cat: 'teal', shape: 'pill', swatch: 'box' },
  event: { word: 'event', cat: 'amber', shape: 'chamfer', swatch: 'box' },
  value: { word: 'value', cat: 'green', shape: 'rounded', noFill: true, mark: 'double', swatch: 'box' },
  rule: { word: 'rule', cat: 'violet', shape: 'rounded', dash: DOTTED, swatch: 'box' },
};

// domain: relation `kind` is a line pattern and a line end, not a hue (§5.3).
export const RELATION_KIND_CUES: Readonly<Record<string, Cue>> = {
  'is-a': { word: 'is-a', mark: 'triangle', swatch: 'line' },
  has: { word: 'has', mark: 'diamond', swatch: 'line' },
  uses: { word: 'uses', dash: DASHED, mark: 'arrow', swatch: 'line' },
  produces: { word: 'produces', mark: 'arrow', swatch: 'line' },
  identifies: { word: 'identifies', dash: DOTTED, mark: 'arrow', swatch: 'line' },
};

// transform: the lossy conversion (§3.2 and the decision in §10).
export const LOSS_CUE: Cue = { word: 'loss', cat: 'amber', swatch: 'line' };

// Exclusive trace branches: neutral bands behind the sub-columns, the panel
// colour and the page colour in turn (§3.2). The bands have no hue, so a
// trace encodes one variable in hue: the event kind (review F-03).
export const BRANCH_BANDS: readonly ('panel' | 'bg')[] = ['panel', 'bg'];
export const BAND_FILL: Readonly<Record<'panel' | 'bg', string>> = { panel: '#f5f6f8', bg: '#ffffff' };
export const BAND_STROKE = '#d6d9df';

// Trace connection cues mirror the paths drawn by traceSvg. A message arrow
// points to its destination; it does not assert that the message was received.
export const TRACE_ORDER_CUE: Cue = { word: 'event order', mark: 'arrow', swatch: 'line' };
export const TRACE_MESSAGE_CUE: Cue = { word: 'message destination (not proof of receipt)', dash: '5 3', mark: 'arrow', swatch: 'line' };
export const TRACE_LIFELINE_CUE: Cue = { word: 'actor lifeline', dash: '4 4', swatch: 'lifeline' };

export function traceLineChips(hasOrder: boolean, hasMessage: boolean, hasLifeline: boolean): Chip[] {
  return [
    ...(hasOrder ? [{ cue: TRACE_ORDER_CUE, hue: false }] : []),
    ...(hasMessage ? [{ cue: TRACE_MESSAGE_CUE, hue: false }] : []),
    ...(hasLifeline ? [{ cue: TRACE_LIFELINE_CUE, hue: false }] : []),
  ];
}

/**
 * The hue rule (§2.1): a figure shows hue only when its encoded variable has 2
 * or more distinct values. `values` holds one value per part, in any order.
 */
export function showsHue(values: Iterable<string>): boolean {
  return new Set(values).size >= 2;
}

/** The style for one part: the cue, with the hue removed when the figure shows no hue. */
export function styleFor(cue: Cue | undefined, hue: boolean): PartStyle {
  if (!cue) return {};
  return {
    ...(hue && cue.cat ? { cat: cue.cat } : {}),
    ...(cue.shape ? { shape: cue.shape } : {}),
    ...(cue.dash ? { dash: cue.dash } : {}),
    ...(cue.noFill ? { noFill: true } : {}),
    ...(cue.mark ? { marks: [cue.mark] } : {}),
    ...(cue.danger ? { danger: true } : {}),
  };
}

/** The class list that carries a part's hue: `vs-cat vs-cat-NAME`, plus `vs-nofill`. */
export function catClasses(style: PartStyle): string {
  const out: string[] = [];
  if (style.cat) out.push('vs-cat', `vs-cat-${style.cat}`);
  if (style.cat && style.noFill) out.push('vs-nofill');
  if (style.emphasis) out.push('vs-emphasis', `vs-emphasis-${style.emphasis}`);
  if (style.emphasisWeight) out.push('vs-emphasis-weight');
  return out.join(' ');
}

export function presentationHue(style: PartStyle): Category | undefined {
  return style.cat ?? (style.emphasisWeight ? undefined : style.emphasis);
}

/** Fill and stroke presentation attributes for a node outline. */
export function outlineColours(style: PartStyle): { fill: string; stroke: string } {
  const hue = presentationHue(style);
  const hex = hue ? CATEGORY_HEX[hue] : undefined;
  return {
    fill: hex && !style.noFill ? hex.tint : NODE_FILL,
    stroke: style.danger ? DANGER_STROKE : hex ? hex.stroke : INK_STROKE,
  };
}

const R = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * The outline of a node box, with its shape cue. The main shape has the class
 * `vs-shape`; secondary lines (the drum line, the inner ring) have `vs-mark`.
 * Geometry attributes come first, so the SVG reads the same as before.
 */
export function outline(style: PartStyle, x: number, y: number, w: number, hh: number, strokeWidth = '1.5'): HNode[] {
  const { fill, stroke } = outlineColours(style);
  if (style.emphasis) strokeWidth = '2.5';
  const dash = style.dash;
  const out: HNode[] = [];
  if (style.shape === 'chamfer') {
    const c = Math.min(10, w / 4, hh / 4);
    const d = `M${R(x + c)},${R(y)} L${R(x + w - c)},${R(y)} L${R(x + w)},${R(y + c)} L${R(x + w)},${R(y + hh - c)} L${R(x + w - c)},${R(y + hh)} L${R(x + c)},${R(y + hh)} L${R(x)},${R(y + hh - c)} L${R(x)},${R(y + c)} Z`;
    out.push(h('path', { d, fill, stroke, 'stroke-width': strokeWidth, 'stroke-dasharray': dash, 'stroke-linejoin': 'round', class: 'vs-shape' }));
  } else {
    const rx = style.shape === 'pill' ? '12' : '6';
    out.push(h('rect', { x: R(x), y: R(y), width: R(w), height: R(hh), rx, ry: rx, fill, stroke, 'stroke-width': strokeWidth, 'stroke-dasharray': dash, class: 'vs-shape' }));
  }
  if (style.shape === 'drum') {
    // Storage: a second line near the bottom, as on a drum. layout.ts gives a
    // drum box more bottom padding, so the line does not read as an underline
    // (review F-09).
    const inset = 6;
    out.push(h('path', { d: `M${R(x + inset)},${R(y + hh - 5)} L${R(x + w - inset)},${R(y + hh - 5)}`, fill: 'none', stroke, 'stroke-width': '1', class: 'vs-mark' }));
  }
  if (style.marks?.includes('terminal')) {
    // A terminal state: a second, inner ring.
    out.push(h('rect', { x: R(x + 3), y: R(y + 3), width: R(w - 6), height: R(hh - 6), rx: '4', ry: '4', fill: 'none', stroke, 'stroke-width': '1', class: 'vs-mark' }));
  }
  if (style.marks?.includes('double')) {
    // A domain value: a second outline 3 px inside the first (§5.3).
    out.push(h('rect', { x: R(x + 3), y: R(y + 3), width: R(w - 6), height: R(hh - 6), rx: '3', ry: '3', fill: 'none', stroke, 'stroke-width': '1', class: 'vs-mark vs-mark-double' }));
  }
  if (style.marks?.includes('initial')) {
    // An initial state: a filled dot in the left padding (layout.ts reserves it).
    const cx = x + 11, cy = y + hh / 2, r = 3.5;
    out.push(h('path', { d: `M${R(cx - r)},${R(cy)} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`, fill: stroke, stroke, 'stroke-width': '1', class: 'vs-mark vs-mark-fill' }));
  }
  if (style.marks?.includes('check')) {
    // A complete task: a check mark in the right padding (layout.ts reserves it).
    const rx0 = x + w - 17, ry0 = y + (hh - 7) / 2;
    out.push(h('path', { d: `M${R(rx0)},${R(ry0 + 4)} L${R(rx0 + 3)},${R(ry0 + 7)} L${R(rx0 + 8)},${R(ry0)}`, fill: 'none', stroke, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'vs-mark' }));
  }
  if (style.marks?.includes('question')) {
    // An unknown status: a question mark in the right padding (layout.ts reserves it).
    out.push(h('text', { x: R(x + w - 12), y: R(y + hh / 2 + 5), 'text-anchor': 'middle', 'font-size': 14, fill: stroke, class: 'vs-mark-text', 'aria-hidden': 'true' }, '?'));
  }
  if (style.marks?.includes('evidence')) {
    // An observation: a small page with two text lines in the right padding
    // (the caller reserves it), drawn with strokes, so it needs no font.
    const px = x + w - 17, py = y + hh / 2 - 5;
    out.push(h('path', { d: `M${R(px)},${R(py)} L${R(px + 6)},${R(py)} L${R(px + 9)},${R(py + 3)} L${R(px + 9)},${R(py + 11)} L${R(px)},${R(py + 11)} Z M${R(px + 2)},${R(py + 5)} L${R(px + 7)},${R(py + 5)} M${R(px + 2)},${R(py + 8)} L${R(px + 7)},${R(py + 8)}`, fill: 'none', stroke, 'stroke-width': '1.25', 'stroke-linejoin': 'round', class: 'vs-mark vs-mark-evidence' }));
  }
  if (style.marks?.includes('cross')) {
    // A failure: a "✕" in the right padding (the caller reserves it). It is
    // two strokes, not a glyph, so it does not depend on the font.
    const cx = x + w - 13, cy = y + hh / 2, r = 3.5;
    out.push(h('path', { d: `M${R(cx - r)},${R(cy - r)} L${R(cx + r)},${R(cy + r)} M${R(cx + r)},${R(cy - r)} L${R(cx - r)},${R(cy + r)}`, fill: 'none', stroke, 'stroke-width': '2', 'stroke-linecap': 'round', class: 'vs-mark' }));
  }
  return out;
}

/** A legend chip swatch: a small box or a short line with the cue. A tree entry uses it for its role cue (§14.5). */
export function swatch(cue: Cue, hue: boolean): HNode {
  const style = styleFor(cue, hue);
  const classes = ['vs-swatch', catClasses(style), cue.danger ? 'vs-kind-failure' : ''].filter(Boolean).join(' ');
  const body: Array<HNode | null> = cue.swatch === 'lifeline'
    ? [h('path', { d: 'M18,1 L18,19', fill: 'none', stroke: '#9aa3af', 'stroke-width': '1', 'stroke-dasharray': cue.dash, class: 'vs-line vs-lifeline' })]
    : cue.swatch === 'line'
    ? [
        h('path', { d: 'M2,10 L34,10', fill: 'none', stroke: outlineColours(style).stroke, 'stroke-width': '2', 'stroke-dasharray': cue.dash, class: 'vs-line' }),
        // A feedback edge: the loop ring at the start of the line, as in the figure.
        cue.mark === 'loop' ? h('path', { class: 'vs-edge-mark', d: 'M4,10 a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0 Z', fill: NODE_FILL, stroke: '#444444', 'stroke-width': '1.5' }) : null,
        // Domain relation ends (§5.3), drawn as in the figure.
        cue.mark === 'triangle' ? h('path', { class: 'vs-edge-mark', d: 'M34,10 L25,5.5 L25,14.5 Z', fill: NODE_FILL, stroke: '#444444', 'stroke-width': '1.5' }) : null,
        cue.mark === 'diamond' ? h('path', { class: 'vs-edge-mark vs-edge-mark-fill', d: 'M2,10 L7,6.5 L12,10 L7,13.5 Z', fill: '#444444', stroke: '#444444', 'stroke-width': '1' }) : null,
        cue.mark === 'arrow' ? h('path', { class: 'vs-edge-mark vs-edge-mark-fill', d: 'M34,10 L27,6.5 L27,13.5 Z', fill: '#444444', stroke: '#444444', 'stroke-width': '1' }) : null,
      ]
    : outline(style, 2, 2, 32, 16, cue.danger ? '2' : '1.5');
  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'vs-legend-swatch', viewBox: '0 0 36 20', width: '36', height: '20', focusable: 'false', 'aria-hidden': 'true' },
    h('g', { class: classes }, body));
}

/**
 * One legend chip: a cue, and whether its swatch shows the hue. `key` is the
 * filter token VARIABLE:VALUE of the chip (docs/IMPROVEMENTS.md §14.9).
 */
export type Chip = { cue: Cue; hue: boolean; key?: string };

function usedCues(values: readonly string[], cues: Readonly<Record<string, Cue>>): Array<[string, Cue]> {
  const used = new Set(values);
  return Object.keys(cues).filter((v) => used.has(v)).map((v) => [v, cues[v]!]);
}

/** The filter token of one value of a variable, such as `role:storage` (docs/IMPROVEMENTS.md §14.9). */
export function filterToken(variable: string, value: string): string {
  return `${variable}:${value}`;
}

/**
 * The chips for a figure's hue variable (§3.3): one per value that the figure
 * uses, in the key order of `cues`. There are none for fewer than 2 values,
 * because a figure with one value shows no hue.
 */
export function hueChips(values: readonly string[], cues: Readonly<Record<string, Cue>>, variable?: string): Chip[] {
  if (!showsHue(values)) return [];
  return usedCues(values, cues).map(([value, cue]) => ({ cue, hue: true, ...(variable ? { key: filterToken(variable, value) } : {}) }));
}

/**
 * The chips for a line-pattern variable (§3.2): edge kind, transition basis,
 * or dependency kind. There is one chip per value that the figure uses, but
 * only when one or more of these values has a pattern or a mark. A figure
 * where every line is solid needs no key for its lines (review F-08).
 */
export function patternChips(values: readonly string[], cues: Readonly<Record<string, Cue>>, variable?: string): Chip[] {
  const used = usedCues(values, cues);
  if (!used.some(([, cue]) => cue.dash || cue.mark)) return [];
  return used.map(([value, cue]) => ({ cue, hue: false, ...(variable ? { key: filterToken(variable, value) } : {}) }));
}

/**
 * The legend (§3.3): a static row of chips. Each chip is a swatch with the
 * paired cue and the value word. It returns null when there are no chips. A
 * chip with a `key` carries it in `filterAttr`, so the reader runtime can make
 * the chip a filter (docs/IMPROVEMENTS.md §14.9).
 */
export function legend(chips: readonly Chip[], generatedAttr: string, filterAttr?: string): HNode | null {
  if (chips.length === 0) return null;
  return h('ul', { class: 'vs-legend', 'aria-label': 'Legend', [generatedAttr]: true },
    chips.map(({ cue, hue, key }) => h('li', { class: 'vs-legend-chip', ...(filterAttr && key ? { [filterAttr]: key } : {}) }, swatch(cue, hue), h('span', { class: 'vs-legend-word' }, cue.word))));
}
