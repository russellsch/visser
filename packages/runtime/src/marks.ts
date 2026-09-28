// One owner for the `vs-near` and `vs-dim` marks of every figure (phase 6a
// review C2, C3; phase 6b review F4, F5, F6). Each behaviour that marks parts
// only changes the state below and calls `updateMarks()`; that function
// computes every mark again from the state. No behaviour adds or removes a
// mark class itself, so one behaviour never clears the marks of another.
//
// The precedence, for the SVG parts of one figure:
//   1. the neighbourhood of the node under the pointer, else of the node with
//      keyboard focus (docs/IMPROVEMENTS.md §4.3);
//   2. else the parts of the active step of a walkthrough (§14.1);
//   3. else the pressed filter chips (§14.9).
// The parts of a walkthrough that are not SVG (compare cells, glossary rows,
// and code lines) take the step marks while a step is active. On top of these,
// the cross-figure highlight (§14.9) gives `vs-near` to the parts in other
// figures that share the entity of the hovered or focused part. A fold box
// takes the state of the parts that it hides: `vs-near` when one of them is
// near, `vs-dim` when each of them that has a mark is dim. A hidden part has
// no mark.
import { DOM } from '../../core/src/compiler/dom-contract.ts';

const A = DOM.attr;

export type FigureMarks = {
  figure: HTMLElement;
  svg: Element | null;
  /** The node under the pointer. */
  hover?: Element | undefined;
  /** The node with keyboard focus. */
  focus?: Element | undefined;
  /** The target IDs of the active step, and the `steps` section that owns them. */
  step?: { targets: ReadonlySet<string>; section: HTMLElement } | undefined;
  /** The pressed filter tokens. */
  readonly pressed: Set<string>;
  /** The folded groups. */
  readonly folded: Set<string>;
};

/** The state of every mark on the page. */
export const markState = {
  figures: new Map<Element, FigureMarks>(),
  /** The node, actor, or concept under the pointer, for the cross-figure highlight. */
  entityHover: undefined as Element | undefined,
  /** The node, actor, or concept with keyboard focus, for the cross-figure highlight. */
  entityFocus: undefined as Element | undefined,
};

/** The mark state of the figure that holds `node`, created on first use. */
export function figureMarks(node: Element): FigureMarks | undefined {
  const figure = node.closest<HTMLElement>('figure.vs-figure');
  if (!figure) return undefined;
  let st = markState.figures.get(figure);
  if (!st) {
    st = { figure, svg: figure.querySelector('.vs-viewport svg'), pressed: new Set(), folded: new Set() };
    markState.figures.set(figure, st);
  }
  return st;
}

export function words(text: string | null): string[] {
  return (text ?? '').split(/\s+/u).filter(Boolean);
}

const canonical = (id: string) => document.getElementById(DOM.canonicalId(id));
const isHidden = (el: Element) => el.closest('[hidden]') !== null;

type Mark = 'near' | 'dim';

/**
 * The parts that a walkthrough marks, each with the target IDs it stands
 * for: the SVG instances of the figure, the cells of a compare table, the
 * rows of a domain glossary, and the code lines of an annotated figure (a
 * line stands for the annotations that cover it).
 */
function stepParts(st: FigureMarks, section: HTMLElement): Array<{ el: Element; ids: string[] }> {
  const out: Array<{ el: Element; ids: string[] }> = [];
  const own = (el: Element) => !section.contains(el);
  for (const el of Array.from(st.figure.querySelectorAll(`.vs-viewport svg a[${A.target}]`))) {
    if (own(el)) out.push({ el, ids: [el.getAttribute(A.target) ?? '', el.getAttribute(A.rel) ?? ''].filter(Boolean) });
  }
  for (const cell of Array.from(st.figure.querySelectorAll('.vs-compare-table td, .vs-compare-table th, .vs-glossary tbody tr'))) {
    const ids = Array.from(cell.querySelectorAll(`[${A.target}]`)).map((x) => x.getAttribute(A.target) ?? '');
    if (ids.length > 0) out.push({ el: cell, ids });
  }
  for (const line of Array.from(st.figure.querySelectorAll('.vs-viewport .vs-code .vs-line:not(.vs-line-gap)'))) {
    out.push({ el: line, ids: words(line.getAttribute(A.ann)) });
  }
  return out;
}

/** The neighbourhood of a node: its ID, its adjacent parts, and its relationships, from the static HTML (§4.2, §4.3). */
function neighbourhood(node: Element): { self: Element; near: Set<string>; edges: Set<string> } {
  const id = node.getAttribute(A.target) ?? '';
  const near = new Set<string>([id]);
  const edges = new Set<string>();
  for (const item of Array.from(canonical(id)?.querySelectorAll(`[${A.edge}]`) ?? [])) {
    edges.add(item.getAttribute(A.edge) ?? '');
    near.add(item.getAttribute(A.other) ?? '');
  }
  return { self: node, near, edges };
}

/** The parts in other figures that share the entity of the hovered or focused part (§14.9). */
function entityParts(): { source: Element; ids: Set<string> } | undefined {
  const source = markState.entityHover ?? markState.entityFocus;
  const id = source?.getAttribute(A.target);
  if (!source || !id) return undefined;
  const ids = new Set<string>();
  for (const item of Array.from(canonical(id)?.querySelectorAll(`[${A.entity}]`) ?? [])) ids.add(item.getAttribute(A.entity) ?? '');
  return { source, ids };
}

/** The marks of one figure, before the fold boxes take the state of the parts they hide. */
function figureMarkMap(st: FigureMarks, entity: ReturnType<typeof entityParts>): Map<Element, Mark> {
  const out = new Map<Element, Mark>();
  // The parts that the active behaviour judged, with a mark or with none.
  const judged = new Set<Element>();
  const svg = st.svg;
  const svgParts = svg ? Array.from(svg.querySelectorAll('.vs-node, .vs-edge')).filter((p) => p.hasAttribute(A.target)) : [];
  const source = st.hover ?? (st.focus && svg?.contains(st.focus) ? st.focus : undefined);
  if (st.step) {
    // Parts that are not SVG keep the step marks under a hover (§14.1).
    for (const { el, ids } of stepParts(st, st.step.section)) {
      if (source && svg?.contains(el)) continue;
      judged.add(el);
      out.set(el, ids.some((x) => st.step!.targets.has(x)) ? 'near' : 'dim');
    }
  }
  if (source) {
    const { self, near, edges } = neighbourhood(source);
    for (const part of svgParts) {
      judged.add(part);
      const adjacent = part.classList.contains('vs-edge') ? edges.has(part.getAttribute(A.rel) ?? '') : near.has(part.getAttribute(A.target) ?? '');
      if (!adjacent) out.set(part, 'dim');
      else if (part !== self) out.set(part, 'near');
    }
  } else if (!st.step && st.pressed.size > 0) {
    for (const part of svgParts) {
      judged.add(part);
      if (!words(part.getAttribute(A.filter)).some((t) => st.pressed.has(t))) out.set(part, 'dim');
    }
  }
  // The cross-figure highlight adds `vs-near` in the other figures; it wins over a dim.
  if (entity && svg && entity.source.closest('figure') !== st.figure) {
    for (const part of Array.from(svg.querySelectorAll(`[${A.target}]:not([${A.proxyFor}])`))) {
      if (!entity.ids.has(part.getAttribute(A.target) ?? '')) continue;
      judged.add(part);
      out.set(part, 'near');
    }
  }
  // A fold box takes the state of the parts that it hides (§14.9): near
  // when one of them is near, dim when each judged one is dim. A proxy edge
  // is not a part that the box hides.
  if (svg) {
    const byId = new Map<string, Array<Mark | 'none'>>();
    for (const el of judged) {
      if (!svg.contains(el) || el.hasAttribute(A.proxyFor)) continue;
      for (const id of new Set([el.getAttribute(A.target), el.getAttribute(A.rel)])) {
        if (id) byId.set(id, [...(byId.get(id) ?? []), out.get(el) ?? 'none']);
      }
    }
    for (const box of Array.from(svg.querySelectorAll(`[${A.fold}]`))) {
      const hides = [box.getAttribute(A.fold) ?? '', ...words(box.getAttribute(A.foldHide))];
      const found = hides.flatMap((id) => byId.get(id) ?? []);
      if (found.includes('near')) out.set(box, 'near');
      else if (found.length > 0 && found.every((m) => m === 'dim')) out.set(box, 'dim');
    }
  }
  return out;
}

/** Every element that can hold a mark in a figure. */
function markable(st: FigureMarks): Element[] {
  const out = st.svg ? Array.from(st.svg.querySelectorAll(`a[${A.target}], [${A.fold}]`)) : [];
  out.push(...Array.from(st.figure.querySelectorAll('.vs-compare-table td, .vs-compare-table th, .vs-glossary tbody tr, .vs-viewport .vs-code .vs-line')));
  return out;
}

/** Compute every `vs-near` and `vs-dim` mark on the page again from `markState`. */
export function updateMarks(): void {
  const entity = entityParts();
  for (const st of markState.figures.values()) {
    const marks = figureMarkMap(st, entity);
    st.figure.classList.toggle('vs-walking', st.step !== undefined);
    for (const el of markable(st)) {
      const mark = isHidden(el) ? undefined : marks.get(el);
      el.classList.toggle('vs-near', mark === 'near');
      el.classList.toggle('vs-dim', mark === 'dim');
    }
  }
}

/** Register every figure with a drawing, so the cross-figure highlight reaches it. */
export function registerFigures(): void {
  for (const svg of Array.from(document.querySelectorAll('figure.vs-figure .vs-viewport svg'))) figureMarks(svg);
}
