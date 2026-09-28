// Runtime for the components of docs/IMPROVEMENTS.md §14. The static page is
// complete without it: a walkthrough is a numbered list, a tree is a set of
// native `details`, and a self-check answer is a native `details`.
//
// - Step bar (§14.1): on a wide screen, a `steps` walkthrough gets a bar with
//   "1 of 4 · label", Previous, and Next. The bar starts at an overview that
//   shows every step and marks nothing of its own. At a step, the parts that
//   the step names get `vs-near` and the other parts get `vs-dim` (the
//   classes of the hover neighbourhood, §4.3), and the step text shows beside
//   the bar. The walk only sets the active step in the mark state; marks.ts
//   computes the marks, so the filter chips come back at the overview and a
//   fold box stands for the parts it hides. The arrow keys move between steps
//   when the bar has focus. On a narrow screen the list stays, with no bar.
// - Tree defaults (§14.5): after "Expand details" collapses the page again,
//   the top two levels of each tree open again.
import { DOM } from '../../core/src/compiler/dom-contract.ts';
import { figureMarks, updateMarks, type FigureMarks } from './marks.ts';

const A = DOM.attr;

type Walk = {
  section: HTMLElement;
  figure: HTMLElement;
  marks: FigureMarks;
  steps: HTMLElement[];
  bar: HTMLElement;
  status: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  index: number; // 0: the overview; 1 to steps.length: the active step
};

const walks: Walk[] = [];

function isNarrow(): boolean {
  return window.innerWidth <= DOM.narrowMaxWidth;
}

function stepTargets(step: HTMLElement): Set<string> {
  return new Set((step.getAttribute(A.stepTargets) ?? '').split(/\s+/u).filter(Boolean));
}

function stepLabel(step: HTMLElement): string {
  return step.querySelector('.vs-step-label')?.textContent?.trim() ?? step.getAttribute(A.label) ?? '';
}

/** Set the active step of a walk in the mark state; marks.ts computes the marks. */
function mark(walk: Walk): void {
  const live = walk.index > 0 && walk.section.classList.contains('vs-steps-live');
  walk.marks.step = live ? { targets: stepTargets(walk.steps[walk.index - 1]!), section: walk.section } : undefined;
  updateMarks();
}

function render(walk: Walk): void {
  const n = walk.steps.length;
  walk.steps.forEach((s, i) => s.classList.toggle('vs-step-active', i + 1 === walk.index));
  walk.section.classList.toggle('vs-steps-overview', walk.index === 0);
  walk.status.textContent = walk.index === 0
    ? `${n} step${n === 1 ? '' : 's'}. Select Next to start.`
    : `${walk.index} of ${n} · ${stepLabel(walk.steps[walk.index - 1]!)}`;
  walk.prev.disabled = walk.index === 0;
  walk.next.disabled = walk.index === n;
  walk.prev.textContent = walk.index === 1 ? 'Overview' : 'Previous';
  mark(walk);
}

function go(walk: Walk, delta: number): void {
  const index = Math.min(walk.steps.length, Math.max(0, walk.index + delta));
  if (index === walk.index) return;
  walk.index = index;
  render(walk);
}

/** Wide screens get the bar; narrow screens keep the numbered list. */
function applyWidth(): void {
  const narrow = isNarrow();
  for (const walk of walks) {
    walk.section.classList.toggle('vs-steps-live', !narrow);
    walk.bar.hidden = narrow;
    walk.index = 0;
    render(walk);
  }
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function initSteps(): void {
  for (const section of Array.from(document.querySelectorAll<HTMLElement>('section.vs-steps'))) {
    const figure = section.closest<HTMLElement>('figure.vs-figure');
    const steps = Array.from(section.querySelectorAll<HTMLElement>('li.vs-step'));
    const marks = figureMarks(section);
    if (!figure || !marks || steps.length === 0) continue;
    const bar = document.createElement('div');
    bar.className = 'vs-step-bar';
    bar.setAttribute(A.generated, '');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', `Walkthrough: ${figure.getAttribute(A.label) ?? ''}`);
    const status = document.createElement('p');
    status.className = 'vs-step-status';
    status.setAttribute('aria-live', 'polite');
    const walk: Walk = { section, figure, marks, steps, bar, status, prev: undefined as never, next: undefined as never, index: 0 };
    walk.prev = button('Previous', 'vs-btn vs-step-prev', () => go(walk, -1));
    walk.next = button('Next', 'vs-btn vs-btn--primary vs-step-next', () => go(walk, 1));
    bar.append(status, walk.prev, walk.next);
    bar.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      go(walk, e.key === 'ArrowRight' ? 1 : -1);
      // Keep focus on a button that can still act.
      if (walk.next.disabled && document.activeElement === walk.next) walk.prev.focus();
      if (walk.prev.disabled && document.activeElement === walk.prev) walk.next.focus();
    });
    const heading = section.querySelector('.vs-steps-heading');
    if (heading) heading.after(bar);
    else section.prepend(bar);
    walks.push(walk);
  }
  if (walks.length === 0) return;
  applyWidth();
  window.matchMedia(`(max-width: ${DOM.narrowMaxWidth}px)`).addEventListener('change', applyWidth);
}

function initTreeDefaults(): void {
  const expand = document.getElementById(DOM.buttons.expand);
  if (!expand) return;
  expand.addEventListener('click', () => {
    if (expand.getAttribute('aria-pressed') === 'true') return;
    for (const d of Array.from(document.querySelectorAll<HTMLDetailsElement>('details.vs-tree-open'))) d.open = true;
  });
}

export function initComponents(): void {
  initSteps();
  initTreeDefaults();
}
