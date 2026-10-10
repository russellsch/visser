/*! visser-flowchart-reader/1 */
// Reader runtime (§10). Enhances the static snapshot: the page stays complete and
// readable without it. No network access, no inline styles, no dependencies.
import { DOM } from '../../core/src/compiler/dom-contract.ts';
import { FigureViewer } from './figure-viewer.ts';
import { copyRichContent } from './rich-copy.ts';
import { figureView } from './views.ts';
import { renderMermaidFigures } from './mermaid.ts';
import { mermaidSourceSelection } from './mermaid-source.ts';
import { initializeMath, type MathExpressionRecord } from './math.ts';
import { buildPacketYaml, codePoints, lastCodePoints, normalizeWhitespace, QUOTE_CONTEXT_MAX, QUOTE_EXACT_MAX } from './packet.ts';
import { figureMarks, markState, registerFigures, updateMarks, words, clearHighlight, highlight, highlightInstances } from './marks.ts';

const A = DOM.attr;
const HISTORY_MAX = 20;

type Moved = { el: HTMLDetailsElement; placeholder: HTMLTemplateElement; wasOpen: boolean; wasHidden: boolean };
type HistoryEntry = { targetId: string; preferredInstanceId?: string; depth?: string };

type Inspector = {
  host: HTMLElement; // <aside> or <dialog>
  body: HTMLElement;
  title: HTMLElement;
  back: HTMLButtonElement;
  locate: HTMLButtonElement;
  modal: boolean;
  owner?: HTMLElement | undefined;
};

const state = {
  current: undefined as Moved | undefined,
  articleAnchor: undefined as {node: Element; top: number; x: number} | undefined,
  history: [] as HistoryEntry[],
  preferredInstanceId: undefined as string | undefined,
  currentDepth: undefined as string | undefined,
  origin: undefined as HTMLElement | SVGElement | undefined,
  inspector: undefined as Inspector | undefined,
  refmode: false,
  selected: undefined as string | undefined,
  lastSelection: undefined as { targetId: string; exact: string; prefix: string; suffix: string } | undefined,
  // The last non-empty selection crossed a block boundary (§11.3: v1 asks for one block).
  crossBlock: false,
  diagramSelection: false,
  expanded: false,
  printOpened: [] as HTMLDetailsElement[],
};

const byId = (id: string) => document.getElementById(id);
const canonical = (targetId: string) => byId(DOM.canonicalId(targetId));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Copy compiler-owned label structure; never reinterpret flattened code text. */
function copyLabel(node: Element | undefined | null, dest: HTMLElement, fallback: string): void {
  const source = node?.querySelector(':scope > summary, :scope > figcaption, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > p');
  if (source?.querySelector('.vs-math[data-vs-math-key]')) void copyRichContent(source, dest);
  else dest.textContent = fallback;
}

function button(label: string, className: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function isNarrow(): boolean {
  return window.innerWidth <= DOM.narrowMaxWidth;
}

function scrollIntoView(node: Element): void {
  node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function targetIdFromHref(link: Element): string | undefined {
  const href = link.getAttribute('href') ?? link.getAttribute('xlink:href') ?? '';
  return href.startsWith('#x-') ? decodeURIComponent(href.slice(3)) : undefined;
}

// ---------------------------------------------------------------- inspector

function ensureInspector(modal: boolean, owner?: HTMLElement): Inspector {
  if (state.inspector && state.inspector.modal === modal && state.inspector.owner === owner) return state.inspector;
  if (state.inspector) state.inspector.host.remove();
  const host: HTMLElement = modal ? el('dialog', 'vs-inspector vs-inspector--dialog') : el('aside', 'vs-inspector vs-inspector--aside');
  host.id = modal ? DOM.inspectorDialog : DOM.inspector;
  host.setAttribute('aria-labelledby', 'vs-inspector-title');
  host.setAttribute(A.generated, '');
  if (!modal) host.hidden = true;
  const bar = el('div', 'vs-inspector__bar');
  const title = el('h2', 'vs-inspector__title');
  title.id = 'vs-inspector-title';
  title.tabIndex = -1;
  const back = button('Back', 'vs-btn vs-inspector__back', () => goBack());
  const close = button('Close', 'vs-btn vs-inspector__close', () => closeInspector());
  bar.append(back, title, close);
  const body = el('div', 'vs-inspector__body');
  // The Copy reference action comes last, after the body and its sections
  // (docs/IMPROVEMENTS.md §4.2).
  const footer = el('div', 'vs-inspector__footer');
  const locate = button('Locate in figure', 'vs-btn', () => locateCurrent());
  const copy = button('Copy reference', 'vs-btn', () => {
    const id = state.current?.el.getAttribute(A.target);
    if (id) void copyReference(id, false);
  });
  footer.append(locate, copy);
  const status = el('p', 'vs-status');
  status.setAttribute('role', 'status');
  host.append(bar, body, footer, status);
  if (modal) {
    const dialog = host as HTMLDialogElement;
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeInspector();
    });
  }
  if (owner) {
    host.classList.remove('vs-inspector--aside');
    host.classList.add(viewer.active ? 'vs-inspector--sheet' : 'vs-inspector--local');
    if (viewer.active) {
      owner.append(host);
      const expand = button('Expand detail', 'vs-btn', () => {
        const expanded = host.classList.toggle('vs-sheet-expanded');
        expand.textContent = expanded ? 'Collapse detail' : 'Expand detail';
        expand.setAttribute('aria-expanded', String(expanded));
      });
      expand.setAttribute('aria-expanded', 'false'); bar.append(expand);
      let sheetStart: number | undefined;
      bar.addEventListener('pointerdown', event => { if (!(event.target instanceof Element && event.target.closest('button'))) sheetStart = event.clientY; });
      bar.addEventListener('pointerup', event => {
        if (sheetStart !== undefined && Math.abs(event.clientY - sheetStart) > 24) {
          const expanded = event.clientY < sheetStart;
          host.classList.toggle('vs-sheet-expanded', expanded);
          expand.setAttribute('aria-expanded', String(expanded)); expand.textContent = expanded ? 'Collapse detail' : 'Expand detail';
        }
        sheetStart = undefined;
      });
      bar.addEventListener('pointercancel', () => { sheetStart = undefined; });
    } else (owner.querySelector('.vs-domain-body') ?? owner.querySelector('.vs-viewport'))?.after(host);
  } else document.body.append(host);
  state.inspector = { host, body, title, back, locate, modal, owner };
  return state.inspector;
}

/** Return the moved detail to its placeholder and restore its open state. */
function returnCurrent(): void {
  const moved = state.current;
  if (!moved) return;
  moved.placeholder.replaceWith(moved.el);
  moved.el.open = moved.wasOpen;
  // F3c: a detail the appendix filter had hidden stays hidden once it comes
  // home, so opening it through a citation elsewhere does not permanently
  // pin it visible against the current filter query.
  moved.el.hidden = moved.wasHidden;
  state.current = undefined;
}

function showDetail(targetId: string, push: boolean, preferredInstanceId?: string, depth?: string, activation?: Element): boolean {
  const detail = canonical(targetId);
  if (!(detail instanceof HTMLDetailsElement)) return false;
  if (detail.hasAttribute('data-vs-flowchart-part')) revealParts([targetId]);
  const instance = activation ?? (preferredInstanceId ? byId(preferredInstanceId) : undefined);
  const nested = !instance || Boolean(instance.closest('.vs-inspector'));
  const activeOwner = state.current && nested ? state.inspector?.owner : undefined;
  const ownFigure = instance && !instance.closest('.vs-inspector') ? instance.closest<HTMLElement>('figure.vs-figure') : activeOwner ? visibleInstances(targetId).map(node => node.closest<HTMLElement>('figure.vs-figure')).find(Boolean) : undefined;
  if (instance && !instance.closest('.vs-inspector') && (instance instanceof HTMLElement || instance instanceof SVGElement)) {
    state.origin = instance;
    if (ownFigure && !viewer.active) state.articleAnchor = {node: instance, top: instance.getBoundingClientRect().top, x: scrollX};
  }
  const continuingModal = state.current && state.inspector?.modal && (nested || !push);
  // Wide article views use the right sidebar. Figure-local detail is only the
  // narrow-screen mouse fallback; the full-screen viewer owns its own sheet.
  const owner = continuingModal ? undefined : viewer.dialog ?? ((isNarrow() && viewer.mouseInput) ? ownFigure ?? activeOwner : undefined);
  const modal = !owner && isNarrow() && typeof HTMLDialogElement !== 'undefined' && 'showModal' in HTMLDialogElement.prototype;
  const previous = state.current?.el.getAttribute(A.target);
  if (push && previous && previous !== targetId) {
    state.history.push({ targetId: previous, preferredInstanceId: state.preferredInstanceId, depth: state.currentDepth });
    if (state.history.length > HISTORY_MAX) state.history.shift();
  }
  returnCurrent();
  // A bubble must not stay over the inspector, and Escape must close the inspector next.
  hideTooltip();
  const inspector = ensureInspector(modal, owner);
  const placeholder = document.createElement('template');
  placeholder.setAttribute(A.placeholder, targetId);
  detail.before(placeholder);
  state.current = { el: detail, placeholder, wasOpen: detail.open, wasHidden: detail.hidden };
  state.preferredInstanceId = preferredInstanceId;
  state.currentDepth = depth ?? detail.getAttribute(A.depth) ?? undefined;
  detail.open = true;
  detail.hidden = false;
  inspector.body.replaceChildren(detail);
  if (viewer.active) {
    const qualifications = el('dl', 'vs-sheet-qualifications');
    qualifications.setAttribute(A.generated, '');
    for (const fact of Array.from(detail.querySelectorAll('[data-vs-fact="loss"], [data-vs-fact="condition"], [data-vs-fact="guard"], [data-vs-fact="basis"]'))) {
      // Text only: never duplicate target IDs, references, or interactive links.
      const value = el(fact.tagName === 'DT' ? 'dt' : 'dd');
      void copyRichContent(fact, value);
      qualifications.append(value);
    }
    if (qualifications.childElementCount) inspector.body.prepend(qualifications);
    // Authored caveats cannot be classified safely: begin expanded for full prose.
    inspector.host.classList.toggle('vs-sheet-expanded', Boolean(detail.querySelector('.vs-detail-text')?.textContent?.trim()));
    const expand = inspector.host.querySelector<HTMLButtonElement>('[aria-expanded]');
    if (expand) { const expanded = inspector.host.classList.contains('vs-sheet-expanded'); expand.setAttribute('aria-expanded', String(expanded)); expand.textContent = expanded ? 'Collapse detail' : 'Expand detail'; }
  }
  // A new target starts at the top of the inspector, also after the reader
  // scrolled another part. Evidence stays collapsed after explanation and
  // context, so opening a target begins with its value-added detail.
  inspector.host.scrollTop = 0;
  // F4b: the full title is always in the DOM and in `title` (native tooltip
  // when the 2-line clamp truncates it); the clamp itself is CSS (reader.css).
  // The title is the label and the paired-cue word, such as "Charge queue ·
  // storage" (docs/IMPROVEMENTS.md §4.2).
  const label = detail.getAttribute(A.label) ?? targetId;
  const cue = detail.getAttribute(A.cue);
  copyLabel(detail, inspector.title, label);
  if (cue) inspector.title.append(el('span', 'vs-inspector__cue', ` \u00b7 ${cue}`));
  const depthText = state.currentDepth === 'explanation' ? 'Explanation' : state.currentDepth === 'context' ? 'Additional context' : state.currentDepth === 'evidence' ? 'Sources' : undefined;
  if (depthText) inspector.title.append(el('span', 'vs-inspector__depth', ` \u00b7 ${depthText}`));
  inspector.title.title = cue ? `${label} \u00b7 ${cue}` : label;
  inspector.back.hidden = state.history.length === 0;
  inspector.back.setAttribute('aria-label', state.history.length > 0
    ? `Back to ${canonical(state.history[state.history.length - 1]!.targetId)?.getAttribute(A.label) ?? state.history[state.history.length - 1]!.targetId}`
    : 'Back');
  inspector.locate.hidden = !hasLocatableInstance(targetId);
  highlightInstances(targetId, 'vs-inspected');
  refreshFlowchartSelection();
  if (modal) {
    const dialog = inspector.host as HTMLDialogElement;
    if (!dialog.open) dialog.showModal();
  } else {
    inspector.host.hidden = false;
    if (!owner) document.body.classList.add('vs-has-inspector');
  }
  // Initial focus moves to the title (§10.2), but not with a visible ring for
  // this programmatic move; a reader who Tabs to it later still gets one
  // (reader.css scopes `:focus:not(:focus-visible)` to this element only).
  inspector.title.focus({preventScroll: viewer.active});
  if (viewer.active) requestAnimationFrame(() => viewer.revealTarget(instance ?? undefined, inspector.host));
  return true;
}

function openInspector(targetId: string, origin: HTMLElement | SVGElement | undefined): boolean {
  if (!(canonical(targetId) instanceof HTMLDetailsElement)) return false;
  if (!state.current) {
    state.history = [];
    state.origin = origin;
  }
  return showDetail(targetId, true, origin?.id || undefined, origin?.getAttribute(A.depth) ?? undefined, origin);
}

function goBack(): void {
  const previous = state.history.pop();
  if (previous) showDetail(previous.targetId, false, previous.preferredInstanceId, previous.depth);
}

function visibleInstances(targetId: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${A.target}="${CSS.escape(targetId)}"]`))
    .filter((node) => node.id !== DOM.canonicalId(targetId) && !node.closest(`#${DOM.inspector}, #${DOM.inspectorDialog}, [hidden], [aria-hidden="true"]`) && node.getClientRects().length > 0);
}

function hasLocatableInstance(targetId: string): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${A.target}="${CSS.escape(targetId)}"]`))
    .some((node) => node.id !== DOM.canonicalId(targetId) && !node.closest(`#${DOM.inspector}, #${DOM.inspectorDialog}`));
}

function locateCurrent(): void {
  const targetId = state.current?.el.getAttribute(A.target);
  if (!targetId) return;
  revealParts([targetId]);
  const candidates = visibleInstances(targetId);
  const preferred = state.preferredInstanceId ? candidates.find((node) => node.id === state.preferredInstanceId) : undefined;
  const chosen = preferred ?? candidates.find((node) => node.matches('a, button, [tabindex]')) ?? candidates[0];
  if (!chosen) return;
  closeInspector(false);
  highlightInstances(targetId, 'vs-inspected');
  scrollIntoView(chosen);
  if (chosen.matches('a, button, [tabindex]')) chosen.focus();
  else {
    const figure = chosen.closest<HTMLElement>('figure');
    if (figure) {
      figure.tabIndex = -1;
      figure.focus();
    }
  }
}

function closeInspector(restoreFocus = true): void {
  // A direct mobile detail tap is one visit; dismiss it back to the article.
  // Internal cleanup and Locate retain the explicit viewer lifecycle.
  if (restoreFocus && viewer.dismissWithDetail) { viewer.close(); return; }
  returnCurrent();
  const inspector = state.inspector;
  if (inspector) {
    if (inspector.modal) {
      const dialog = inspector.host as HTMLDialogElement;
      if (dialog.open) dialog.close();
    } else {
      inspector.host.hidden = true;
    }
    inspector.body.replaceChildren();
  }
  document.body.classList.remove('vs-has-inspector');
  state.history = [];
  state.preferredInstanceId = undefined;
  state.currentDepth = undefined;
  clearHighlight('vs-inspected');
  const origin = state.origin;
  state.origin = undefined;
  const anchor = state.articleAnchor; state.articleAnchor = undefined;
  if (restoreFocus && anchor?.node.isConnected && inspector?.host.classList.contains('vs-inspector--local')) window.scrollTo(anchor.x, window.scrollY + anchor.node.getBoundingClientRect().top - anchor.top);
  refreshFlowchartSelection();
  if (restoreFocus && origin && origin.isConnected) {
    const hiddenOrigin = origin.closest('[hidden], [aria-hidden="true"]');
    const svg = origin.closest('svg[data-vs-flowchart]');
    const id = origin.getAttribute(A.target);
    const summary = hiddenOrigin && svg && id ? Array.from(svg.querySelectorAll<SVGElement>(`[${A.fold}]:not([hidden])`)).find(box => box.getAttribute(A.fold) === id || words(box.getAttribute(A.foldHide)).includes(id)) : undefined;
    const control = summary ? svg?.querySelector<SVGElement>(`[data-vs-fold-expand="${CSS.escape(summary.getAttribute(A.fold)!)}"]:not([hidden])`)
      : hiddenOrigin && svg && id ? svg.querySelector<SVGElement>(`[${A.foldToggle}="${CSS.escape(id)}"]:not([hidden])`) : undefined;
    (control ?? origin).focus({preventScroll:true});
  }
}

// ---------------------------------------------------------------- deep links, expand, print

function openTarget(targetId: string): void {
  const node = canonical(targetId);
  if (!node) return;
  for (let p: Element | null = node; p; p = p.parentElement) {
    if (p instanceof HTMLDetailsElement) p.open = true;
  }
  scrollIntoView(node);
}

function onHash(): void {
  const hash = decodeURIComponent(location.hash);
  if (!hash.startsWith('#x-')) return;
  const targetId = hash.slice(3);
  if (canonical(targetId)?.hasAttribute('data-vs-flowchart-part')) { revealParts([targetId]); openInspector(targetId, undefined); return; }
  if (state.current?.el.getAttribute(A.target) === targetId) return;
  // A part with no body and no evidence has no visible appendix row
  // (docs/IMPROVEMENTS.md §4.5), so a deep link shows it in the inspector.
  if (canonical(targetId)?.classList.contains('vs-detail-bare')) {
    openInspector(targetId, undefined);
    return;
  }
  openTarget(targetId);
}

function allDetails(): HTMLDetailsElement[] {
  return Array.from(document.querySelectorAll<HTMLDetailsElement>('details'));
}

function toggleExpand(buttonEl: HTMLButtonElement): void {
  viewer.close();
  closeInspector(false);
  state.expanded = !state.expanded;
  // The Sources, Definitions, and Details groups stay open when the reader
  // collapses the rest. A self-check answer stays as the reader left it: the
  // reader answers the question first (phase 6a review C11). Print still
  // opens it (beforePrint).
  for (const d of allDetails()) {
    if (d.classList.contains('vs-self-check-answer')) continue;
    d.open = state.expanded || d.classList.contains('vs-appendix-open');
  }
  buttonEl.setAttribute('aria-pressed', String(state.expanded));
}

function beforePrint(): void {
  viewer.close();
  closeInspector(false);
  state.printOpened = allDetails().filter((d) => !d.open);
  for (const d of state.printOpened) d.open = true;
  setAppendixCounts(true);
}

function afterPrint(): void {
  for (const d of state.printOpened) d.open = false;
  state.printOpened = [];
  setAppendixCounts(false);
}

// The row counts of the "Parts of" groups: every row, and the rows that show
// on screen with the runtime. The static HTML counts every row, because
// without JavaScript and in print every row shows (docs/IMPROVEMENTS.md §4.5).
const appendixCounts: Array<{ count: Element; all: number; shown: number }> = [];

function initAppendixCounts(): void {
  for (const group of Array.from(document.querySelectorAll(`.${DOM.appendixGroup}`))) {
    const count = group.querySelector(':scope > summary .vs-appendix-count');
    if (!count) continue;
    const rows = Array.from(group.querySelectorAll(':scope > details.vs-detail'));
    appendixCounts.push({ count, all: rows.length, shown: rows.filter((r) => !r.classList.contains('vs-detail-bare')).length });
  }
  setAppendixCounts(false);
}

function setAppendixCounts(all: boolean): void {
  for (const c of appendixCounts) c.count.textContent = `(${all ? c.all : c.shown})`;
}

// ---------------------------------------------------------------- definitions

let tooltip: HTMLElement | undefined;
let tooltipOwners: Element[] = [];
let tooltipTimer: number | undefined;

function firstSentence(text: string): string {
  const clean = normalizeWhitespace(text, true);
  const match = /^(.+?[.!?])(\s|$)/u.exec(clean);
  return match?.[1] ?? clean;
}

/**
 * The first sentence of a target's authored body. A figure part keeps its
 * body in `.vs-detail-text`; other details keep it in their non-generated
 * children.
 */
function bodyText(targetId: string): string {
  const detail = canonical(targetId);
  if (!detail) return '';
  // A definition carries its first sentence from the build, the same text
  // as its glossary row and its Terms line (phase 4 review D6).
  const summary = detail.getAttribute(A.summary);
  if (summary) return summary;
  const text = detail.querySelector('.vs-detail-text');
  if (text) return firstSentence(sourceText(text));
  const parts: string[] = [];
  for (const child of Array.from(detail.children)) {
    if (child.tagName === 'SUMMARY' || child.hasAttribute(A.generated)) continue;
    parts.push(sourceText(child));
  }
  return firstSentence(parts.join(' '));
}

/** The height of the sticky toolbar, so a bubble above a word never goes under it. */
function toolbarBottom(): number {
  const bar = document.querySelector<HTMLElement>(`.${DOM.toolbar}`);
  return bar && !bar.hidden ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
}

/**
 * Place the bubble above the owner when there is room, else below it, with
 * a 4 px arrow that points at the owner (docs/IMPROVEMENTS.md §13.4). The
 * bubble never covers the line of the owner. The runtime sets the position
 * through the CSSOM; the page has no inline style attribute.
 */
function placeTooltip(tip: HTMLElement, owner: Element): void {
  const rects = Array.from(owner.getClientRects());
  const whole = owner.getBoundingClientRect();
  const first = rects[0] ?? whole;
  const last = rects[rects.length - 1] ?? whole;
  const host = tip.parentElement ?? document.body;
  const origin = host === document.body ? { left: -window.scrollX, top: -window.scrollY } : (() => {
    const r = host.getBoundingClientRect();
    return { left: r.left - host.scrollLeft, top: r.top - host.scrollTop };
  })();
  const gap = 8; // the 4 px arrow and 4 px of space
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const above = first.top - height - gap >= toolbarBottom();
  const anchor = above ? first : last;
  const centre = anchor.left + anchor.width / 2;
  const viewport = document.documentElement.clientWidth;
  const left = Math.min(Math.max(8, centre - width / 2), Math.max(8, viewport - width - 8));
  const top = above ? first.top - height - gap : last.bottom + gap;
  tip.classList.toggle('vs-tooltip--above', above);
  tip.classList.toggle('vs-tooltip--below', !above);
  tip.style.left = `${Math.round(left - origin.left)}px`;
  tip.style.top = `${Math.round(top - origin.top)}px`;
  tip.style.setProperty('--vs-arrow-x', `${Math.round(Math.min(Math.max(centre - left, 10), Math.max(10, width - 10)))}px`);
}

/**
 * Show one bubble shared by `owners`, at `anchor` (by default the last
 * owner). Each owner gets `aria-describedby`, so the focused element has the
 * description even when the bubble points at a child of it. A term bubble
 * has an "Open definition" link. The bubble stays open while the pointer is
 * on it, and Escape closes it (§10.4).
 */
function showTooltipFor(owners: Element[], text: string, open?: { targetId: string; label: string }, anchor?: Element, rich?: Array<{ source: Element; textLimit?: number }>): void {
  if (!text || viewer.guardingEntry) return;
  hideTooltip();
  const tip = el('div', 'vs-tooltip');
  tip.id = 'vs-tooltip';
  tip.setAttribute(A.generated, '');
  const body = el('span', 'vs-tooltip__text', text);
  body.id = 'vs-tooltip-text';
  body.setAttribute('role', 'tooltip');
  tip.append(body);
  const copies: Promise<void>[] = [];
  if (rich?.length) {
    body.replaceChildren();
    rich.forEach(({ source, textLimit }, index) => {
      if (index) body.append('; ');
      const part = el('span'); body.append(part);
      copies.push(copyRichContent(source, part, { textLimit }));
    });
  }
  if (open) {
    // A pointer shortcut only: the keyboard opens the definition with Enter on the term.
    const link = el('a', 'vs-tooltip__open', open.label);
    link.href = `#${DOM.canonicalId(open.targetId)}`;
    link.tabIndex = -1;
    link.setAttribute('aria-hidden', 'true');
    tip.append(' ', link);
  }
  tip.addEventListener('pointerenter', () => window.clearTimeout(tooltipTimer));
  tip.addEventListener('pointerleave', () => scheduleHide());
  const at = anchor ?? owners[owners.length - 1]!;
  // Inside the modal inspector the bubble must be in the dialog, which is in the top layer.
  (at.closest('dialog') ?? document.body).append(tip);
  placeTooltip(tip, at);
  for (const o of owners) o.setAttribute('aria-describedby', body.id);
  tooltip = tip;
  tooltipOwners = owners;
  void Promise.all(copies).then(() => { if (tooltip === tip && tip.isConnected) placeTooltip(tip, at); });
}

/** Match a first-sentence source prefix without interpreting literal code as math. */
function richTooltipBody(targetId: string, text: string): Array<{ source: Element; textLimit: number }> | undefined {
  const detail = canonical(targetId);
  const source = detail?.querySelector('.vs-detail-text') ?? (detail && Array.from(detail.children).find(child => child.tagName !== 'SUMMARY' && !child.hasAttribute(A.generated)));
  if (!source?.querySelector('.vs-math[data-vs-math-key]')) return;
  const raw = sourceText(source);
  const expected = text.replace(/\s/gu, '');
  if (!expected || !raw.replace(/\s/gu, '').startsWith(expected)) return;
  let units = 0, end = 0;
  for (const character of raw) {
    end += character.length;
    if (!/\s/u.test(character)) units += character.length;
    if (units >= expected.length) break;
  }
  return [{ source, textLimit: end }];
}

function showTermTooltip(term: Element): void {
  const defId = term.getAttribute(A.term);
  if (!defId) return;
  // A definition that a domain concept owns: the link opens the concept, as
  // a click on the term does (docs/IMPROVEMENTS.md §5.4, phase 4 review D8).
  const concept = canonical(defId)?.getAttribute(A.concept);
  const open = concept && canonical(concept) instanceof HTMLDetailsElement
    ? { targetId: concept, label: 'Open concept' }
    : { targetId: defId, label: 'Open definition' };
  const text = bodyText(defId);
  showTooltipFor([term], text, open, undefined, richTooltipBody(defId, text));
}

/**
 * An edge in a figure: the first sentence of its body (docs/IMPROVEMENTS.md
 * §4.7). The bubble points at the edge label, and the focusable edge link
 * owns the description.
 */
function showEdgeTooltip(edge: Element): void {
  const id = edge.getAttribute(A.target);
  if (!id) return;
  const text = bodyText(id);
  showTooltipFor([edge], text, undefined, edge.querySelector('.vs-edge-label') ?? edge, richTooltipBody(id, text));
}

/** A run of adjacent `a.vs-cite` elements, separated only by whitespace text (F10). */
function citeGroup(cite: HTMLElement): HTMLElement[] {
  const group = [cite];
  const isWhitespace = (node: ChildNode) => node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim();
  const isCite = (node: ChildNode): node is HTMLElement => node instanceof HTMLElement && node.classList.contains('vs-cite');
  let node: ChildNode | null = cite.previousSibling;
  while (node) {
    if (isWhitespace(node)) { node = node.previousSibling; continue; }
    if (isCite(node)) { group.unshift(node); node = node.previousSibling; continue; }
    break;
  }
  node = cite.nextSibling;
  while (node) {
    if (isWhitespace(node)) { node = node.nextSibling; continue; }
    if (isCite(node)) { group.push(node); node = node.nextSibling; continue; }
    break;
  }
  return group;
}

function showCiteTooltip(cite: HTMLElement): void {
  const group = citeGroup(cite);
  const titles = group.map((c) => c.getAttribute('data-vs-cite-title')).filter((t): t is string => Boolean(t));
  const sources = group.map(c => {
    const id = targetIdFromHref(c);
    return id ? canonical(id)?.querySelector(':scope > summary') : undefined;
  });
  const rich = sources.every((source): source is Element => Boolean(source)) && sources.some(source => source.querySelector('.vs-math'))
    ? sources.map(source => ({ source })) : undefined;
  showTooltipFor(group, titles.join('; '), undefined, undefined, rich);
}

function hideTooltip(): void {
  window.clearTimeout(tooltipTimer);
  tooltip?.remove();
  for (const owner of tooltipOwners) owner.removeAttribute('aria-describedby');
  tooltip = undefined;
  tooltipOwners = [];
}

function scheduleHide(): void {
  window.clearTimeout(tooltipTimer);
  tooltipTimer = window.setTimeout(hideTooltip, 300);
}

// ---------------------------------------------------------------- focus highlights

// ---------------------------------------------------------------- reference mode

let panel: HTMLElement | undefined;
let panelOrigin: HTMLElement | SVGElement | undefined;

/** Expand glyph selections to the complete source-owned expression. */
function mathSourceRange(range: Range): Range {
  const sourceRange = range.cloneRange();
  const renderedMath = (node: Node) => (node instanceof Element ? node : node.parentElement)
    ?.closest('[data-vs-math-rendered]:not([data-vs-math-native])');
  // A selection within glyphs denotes the source-owned expression. Include its
  // adjacent source span before dropping generated SVG and copy controls.
  const first = renderedMath(sourceRange.startContainer);
  const last = renderedMath(sourceRange.endContainer);
  if (first) sourceRange.setStartBefore(first);
  if (last) sourceRange.setEndAfter(last);
  return sourceRange;
}

function sourceText(node: Element): string {
  const range = document.createRange();
  range.selectNodeContents(node);
  return rangeText(range);
}

/** Text of a DOM range without generated (non-author) text. */
function rangeText(range: Range): string {
  const sourceRange = mathSourceRange(range);
  const common = sourceRange.commonAncestorContainer;
  const walker = document.createTreeWalker(common, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = common.nodeType === Node.TEXT_NODE ? [common as Text] : [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  const parts: string[] = [];
  for (const node of nodes) {
    if (!sourceRange.intersectsNode(node)) continue;
    // Inspect the live ancestry: a partial clone of a generated eqref loses
    // its anchor and would otherwise leak its ordinal into the source quote.
    const target = node.parentElement?.closest(`[${A.target}]`);
    let generated = false;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.hasAttribute(A.generated)) { generated = true; break; }
      if (parent === target) break;
    }
    if (generated) continue;
    const start = sourceRange.startContainer === node ? sourceRange.startOffset : 0;
    const end = sourceRange.endContainer === node ? sourceRange.endOffset : node.length;
    parts.push(node.data.slice(start, end));
  }
  return parts.join('');
}

function recordSelection(): void {
  const selection = window.getSelection();
  const clear = () => {
    state.lastSelection = undefined;
    state.crossBlock = false;
    state.diagramSelection = false;
  };
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    // In reference mode, clicking a block collapses the text selection before the
    // copy, so keep the quote. Elsewhere a collapsed selection means the reader
    // deselected the text, and an old quote must not reach a later packet.
    if (!state.refmode) clear();
    return;
  }
  const diagram = mermaidSourceSelection(selection.getRangeAt(0));
  if (diagram.kind === 'unrepresentable') {
    state.lastSelection = undefined;
    state.crossBlock = false;
    state.diagramSelection = true;
    return;
  }
  state.diagramSelection = false;
  const range = mathSourceRange(diagram.kind === 'source' ? diagram.range : selection.getRangeAt(0));
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const owner = start?.closest<HTMLElement>(`[${A.target}]`);
  const targetId = owner?.getAttribute(A.target);
  if (!owner || !targetId) {
    clear();
    return;
  }
  if (!owner.contains(range.endContainer)) {
    // Never quote across blocks, and never silently keep only the first block.
    state.lastSelection = undefined;
    state.crossBlock = true;
    return;
  }
  const exact = rangeText(range);
  if (!normalizeWhitespace(exact, true)) {
    clear();
    return;
  }
  state.crossBlock = false;
  const before = document.createRange();
  before.selectNodeContents(owner);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(owner);
  after.setStart(range.endContainer, range.endOffset);
  state.lastSelection = {
    targetId,
    exact: codePoints(exact, QUOTE_EXACT_MAX * 2),
    prefix: lastCodePoints(rangeText(before), QUOTE_CONTEXT_MAX * 2),
    suffix: codePoints(rangeText(after), QUOTE_CONTEXT_MAX * 2),
  };
}

function packetFor(targetId: string, withQuote: boolean): string | undefined {
  const root = byId(DOM.root);
  const node = canonical(targetId);
  if (!root || !node) return undefined;
  const docId = root.getAttribute(A.doc);
  const rev = root.getAttribute(A.rev);
  const body = node.getAttribute(A.body);
  if (!docId || !rev || !body) return undefined;
  const quote = withQuote && state.lastSelection?.targetId === targetId ? state.lastSelection : undefined;
  const build = root.getAttribute(A.build);
  const label = node.getAttribute(A.label);
  const kind = node.getAttribute(A.kind);
  return buildPacketYaml({
    docId,
    targetId,
    sourceRevision: rev,
    bodySha256: body,
    ...(build ? { viewedBuildId: build } : {}),
    ...(label ? { label } : {}),
    ...(kind ? { kind } : {}),
    ...(quote ? { quote: { exact: quote.exact, prefix: quote.prefix, suffix: quote.suffix } } : {}),
  });
}

function statusElement(): HTMLElement | undefined {
  if (panel && !panel.hidden) return panel.querySelector<HTMLElement>('.vs-status') ?? undefined;
  return state.inspector?.host.querySelector<HTMLElement>('.vs-status') ?? undefined;
}

function showFallback(text: string): void {
  const container = (panel && !panel.hidden ? panel : state.inspector && !state.inspector.host.hidden ? state.inspector.host : undefined) ?? ensurePanel();
  if (container === panel) panel.hidden = false;
  byId(DOM.copyFallback)?.parentElement?.remove();
  const wrap = el('div', 'vs-copy-fallback');
  const label = el('label', 'vs-copy-fallback__label', 'Copying was not allowed. Copy this reference with Ctrl+C or Cmd+C:');
  label.htmlFor = DOM.copyFallback;
  const area = el('textarea', 'vs-copy-fallback__text');
  area.id = DOM.copyFallback;
  area.readOnly = true;
  area.rows = 8;
  area.value = text;
  wrap.append(label, area);
  container.append(wrap);
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
}

async function copyReference(targetId: string, withQuote: boolean): Promise<void> {
  const text = packetFor(targetId, withQuote);
  const status = statusElement();
  if (!text) {
    if (status) status.textContent = 'This element has no reference data.';
    return;
  }
  if (status) status.textContent = '';
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('no clipboard');
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = 'Copied reference to the clipboard.';
  } catch {
    showFallback(text);
  }
}

function ensurePanel(): HTMLElement {
  if (panel) { (viewer.dialog ?? document.body).append(panel); return panel; }
  panel = el('div', 'vs-refpanel');
  panel.id = 'vs-refpanel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Reference');
  panel.setAttribute(A.generated, '');
  panel.hidden = true;
  (viewer.dialog ?? document.body).append(panel);
  return panel;
}

function ancestorsWithTargets(start: Element): string[] {
  const ids: string[] = [];
  for (let p: Element | null = start; p; p = p.parentElement) {
    const id = p.getAttribute(A.target);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function selectTarget(targetId: string, from: Element, focusPanel: boolean): void {
  if (!panel || panel.hidden) panelOrigin = from instanceof HTMLElement || from instanceof SVGElement ? from : undefined;
  state.selected = targetId;
  highlight([targetId], 'vs-selected');
  const node = canonical(targetId);
  const kind = node?.getAttribute(A.kind) ?? '';
  const label = node?.getAttribute(A.label) ?? targetId;
  const p = ensurePanel();
  p.replaceChildren();
  const heading = el('p', 'vs-refpanel__title');
  const richLabel = el('span');
  copyLabel(node, richLabel, label);
  heading.append(el('strong', undefined, kind === 'heading' ? 'Heading only (not its section): ' : `${kind || 'Target'}: `), richLabel);
  const actions = el('div', 'vs-refpanel__actions');
  const copy = button('Copy reference', 'vs-btn vs-btn--primary', () => void copyReference(targetId, false));
  const withText = button('Copy reference with selected text', 'vs-btn', () => void copyReference(targetId, true));
  withText.disabled = state.lastSelection?.targetId !== targetId;
  actions.append(copy, withText);
  const note = from.closest('[data-vs-mermaid-derived]')
    ? el('p', 'vs-refpanel__note', 'This arrow has no ID of its own; the reference is to the diagram. Give it an edge ID (e1@-->) to reference it.')
    : state.diagramSelection && withText.disabled
      ? el('p', 'vs-refpanel__note', 'To copy this selection accurately, show the diagram source and select the text there.')
    : state.crossBlock && withText.disabled
      ? el('p', 'vs-refpanel__note', 'Your selection spans more than one block. Select text within one block to copy it with a reference.')
      : undefined;
  if (node instanceof HTMLDetailsElement) {
    actions.append(button('Open detail', 'vs-btn', () => openInspector(targetId, copy)));
  }
  const chain = ancestorsWithTargets(from.closest(`[${A.target}]`) ?? from);
  const ancestors = [...chain];
  const nodeParent = node?.parentElement?.closest(`[${A.target}]`)?.getAttribute(A.target);
  if (nodeParent && !ancestors.includes(nodeParent)) ancestors.push(nodeParent);
  if (ancestors.length > 1) {
    const selectLabel = el('label', 'vs-refpanel__parent', 'Select: ');
    const select = el('select');
    for (const id of ancestors) {
      const option = el('option', undefined, `${canonical(id)?.getAttribute(A.kind) ?? ''} — ${canonical(id)?.getAttribute(A.label) ?? id}`);
      option.value = id;
      option.selected = id === targetId;
      select.append(option);
    }
    select.addEventListener('change', () => selectTarget(select.value, canonical(select.value) ?? from, false));
    selectLabel.append(select);
    actions.append(selectLabel);
  }
  actions.append(button('Close', 'vs-btn', () => closePanel()));
  const status = el('p', 'vs-status');
  status.setAttribute('role', 'status');
  p.append(heading, actions, ...(note ? [note] : []), status);
  p.hidden = false;
  if (focusPanel) copy.focus();
}

function closePanel(): void {
  if (panel) panel.hidden = true;
  state.selected = undefined;
  clearHighlight('vs-selected');
  panelOrigin?.focus({preventScroll: true}); panelOrigin = undefined;
}

function setRefmode(on: boolean): void {
  state.refmode = on;
  document.body.classList.toggle('vs-refmode', on);
  byId(DOM.buttons.refmode)?.setAttribute('aria-pressed', String(on));
  if (!on) closePanel();
}

function isChrome(node: Element): boolean {
  return Boolean(node.closest(`.${DOM.toolbar}, #vs-refpanel, #${DOM.inspector}, #${DOM.inspectorDialog}, .vs-tooltip, .vs-refbtn, .vs-view-bar, .vs-viewer-tools, .vs-viewer-open`));
}

// ---------------------------------------------------------------- figure views

let textView = false;
function applyViews(): void {
  for (const figure of Array.from(document.querySelectorAll<HTMLElement>(`figure[${A.views}]`))) {
    const view = figureView(isNarrow(), textView, viewer.supported(figure));
    figure.classList.toggle('vs-view-list', view === 'list');
    figure.classList.toggle('vs-view-map', view === 'map');
  }
}
function addViewToggles(): void {
  const toggle = button('Text view', 'vs-btn vs-text-view', () => {
    viewer.close(); closeInspector(false); textView = !textView;
    toggle.setAttribute('aria-pressed', String(textView)); applyViews();
  });
  toggle.setAttribute('aria-pressed', 'false');
  document.querySelector(`.${DOM.toolbar}`)?.append(toggle);
  applyViews();
  window.matchMedia(`(max-width: ${DOM.narrowMaxWidth}px)`).addEventListener('change', applyViews);
}

// ---------------------------------------------------------------- neighbourhood (§4.3)

/**
 * The neighbourhood of a figure node: each adjacent node and edge gets
 * `vs-near`, and each other node and edge gets `vs-dim`. The adjacency comes
 * from the Relationships section of the node's detail in the static HTML,
 * not from the drawing (docs/IMPROVEMENTS.md §4.2, §4.3). The handlers only
 * record the node under the pointer and the node with focus; marks.ts
 * computes the marks. They never move focus. When the pointer leaves, the
 * neighbourhood of the focused node comes back, else the other marks do.
 */
function addNeighbourhoods(): void {
  for (const node of Array.from(document.querySelectorAll(`.vs-viewport svg [${A.target}]`))) {
    const st = figureMarks(node);
    if (!st) continue;
    node.addEventListener('pointerenter', (event) => {
      if ((event as PointerEvent).pointerType === 'touch' || viewer.guardingEntry) return;
      st.hover = node;
      updateMarks();
    });
    node.addEventListener('pointerleave', () => {
      if (st.hover === node) st.hover = undefined;
      updateMarks();
    });
    node.addEventListener('focus', () => {
      if (viewer.guardingEntry) return;
      st.focus = node;
      updateMarks();
    });
    node.addEventListener('blur', () => {
      if (st.focus === node) st.focus = undefined;
      updateMarks();
    });
  }
}

// ---------------------------------------------------------------- figure interactions (§14.9)

const ENTITY_PARTS = `.vs-viewport svg .vs-node[${A.target}], .vs-viewport svg .vs-lane[${A.target}]`;

/**
 * Cross-figure highlight: on hover or focus of a node, an actor, or a
 * concept, each part in another figure that shares its `entity` gets
 * `vs-near`. The parts come from the Appears-in section of the part's detail
 * in the static HTML (data-vs-entity). A part inside a folded group is marked
 * through its fold box (marks.ts).
 */
function addEntityLinks(): void {
  for (const part of Array.from(document.querySelectorAll(ENTITY_PARTS))) {
    const id = part.getAttribute(A.target)!;
    if (!canonical(id)?.querySelector(`[${A.entity}]`)) continue;
    part.addEventListener('pointerenter', (event) => {
      if ((event as PointerEvent).pointerType === 'touch') return;
      markState.entityHover = part;
      updateMarks();
    });
    part.addEventListener('pointerleave', () => {
      if (markState.entityHover === part) markState.entityHover = undefined;
      updateMarks();
    });
    part.addEventListener('focus', () => {
      markState.entityFocus = part;
      updateMarks();
    });
    part.addEventListener('blur', () => {
      if (markState.entityFocus === part) markState.entityFocus = undefined;
      updateMarks();
    });
  }
}

/**
 * Filter chips: each legend chip with a filter token becomes a toggle
 * button. A pressed chip dims each node and edge that has none of the
 * pressed tokens; several pressed chips mean "any of these". A "Clear"
 * button shows while a chip is pressed. The pressed tokens are figure state
 * (marks.ts), so a walkthrough or a hover never loses them. Without
 * JavaScript the legend stays static.
 */
function addFilterChips(): void {
  for (const legend of Array.from(document.querySelectorAll<HTMLElement>('figure .vs-legend'))) {
    const figure = legend.closest('figure');
    const svg = figure?.querySelector('.vs-viewport svg');
    const chips = Array.from(legend.querySelectorAll<HTMLElement>(`:scope > .vs-legend-chip[${A.filter}]`));
    const st = svg ? figureMarks(svg) : undefined;
    if (!figure || !svg || !st || chips.length === 0) continue;
    const pressed = st.pressed;
    const toggles: HTMLButtonElement[] = [];
    const clearItem = el('li', 'vs-legend-clear');
    clearItem.hidden = true;
    legend.classList.add('vs-legend-filterable');
    const update = () => {
      for (const t of toggles) t.setAttribute('aria-pressed', String(pressed.has(t.getAttribute(A.filter) ?? '')));
      clearItem.hidden = pressed.size === 0;
      updateMarks();
    };
    for (const chip of chips) {
      const token = chip.getAttribute(A.filter)!;
      const toggle = button('', 'vs-legend-toggle', () => {
        if (pressed.has(token)) pressed.delete(token);
        else pressed.add(token);
        update();
      });
      toggle.setAttribute(A.filter, token);
      toggle.setAttribute('aria-pressed', 'false');
      toggle.append(...Array.from(chip.childNodes));
      chip.append(toggle);
      toggles.push(toggle);
    }
    const clear = button('Clear', 'vs-btn', () => {
      pressed.clear();
      update();
      toggles[0]?.focus();
    });
    const label = figure.getAttribute(A.label);
    if (label) clear.setAttribute('aria-label', `Clear the filter: ${label}`);
    clearItem.append(clear);
    legend.append(clearItem);
  }
}

/**
 * Collapsible groups: show and hide the parts of one figure drawing for the
 * set of folded groups. The geometry is in the static SVG; this sets and
 * removes `hidden` only. An edge with an end in a folded group shows the
 * proxy route for the groups that stand for its two ends. A folded group
 * keeps its boundary, dashed and with no label, so its area reads as the
 * place of the group (docs/IMPROVEMENTS.md §14.9, phase 6b review F14). The
 * boundary is then out of the tab order and the accessibility tree: the
 * fold box stands for the group.
 */
/** A folded group contains the selected target; it does not become that target. */
function refreshFlowchartSelection(): void {
  const selected = state.current?.el.getAttribute(A.target);
  for (const box of Array.from(document.querySelectorAll('svg[data-vs-flowchart] [data-vs-fold]'))) {
    const contains = selected && !box.hasAttribute('hidden') && words(box.getAttribute(A.foldHide)).includes(selected);
    box.toggleAttribute('data-vs-contains-selection', Boolean(contains));
    const cue = box.querySelector('[data-vs-fold-selection]');
    if (cue) { cue.textContent = contains ? 'Contains selection' : ''; cue.toggleAttribute('hidden', !contains); }
    if (!box.hasAttribute('data-vs-fold-label')) box.setAttribute('data-vs-fold-label', box.getAttribute('aria-label') ?? '');
    const label = box.getAttribute('data-vs-fold-label')!;
    box.setAttribute('aria-label', contains ? `${label}; contains selected ${state.current?.el.getAttribute(A.label) ?? selected}` : label);
  }
}

function applyFolds(svg: Element, folded: ReadonlySet<string>): void {
  const boxes = Array.from(svg.querySelectorAll(`[${A.fold}]`));
  const hideOf = new Map(boxes.map((b) => [b.getAttribute(A.fold)!, words(b.getAttribute(A.foldHide))]));
  const hidden = new Set<string>();
  for (const g of folded) for (const id of hideOf.get(g) ?? []) hidden.add(id);
  // The folded group that stands for a node: the one that no other folded group hides.
  const standIn = (id: string) => [...folded].find((g) => !hidden.has(g) && (hideOf.get(g) ?? []).includes(id)) ?? '';
  const show = (node: Element, on: boolean) => node.toggleAttribute('hidden', !on);
  for (const box of boxes) {
    const g = box.getAttribute(A.fold)!;
    show(box, folded.has(g) && !hidden.has(g));
  }
  for (const expand of Array.from(svg.querySelectorAll('[data-vs-fold-expand]'))) {
    const g = expand.getAttribute('data-vs-fold-expand')!;
    show(expand, folded.has(g) && !hidden.has(g));
  }
  for (const toggle of Array.from(svg.querySelectorAll(`[${A.foldToggle}]`))) {
    const g = toggle.getAttribute(A.foldToggle)!;
    show(toggle, !folded.has(g) && !hidden.has(g));
  }
  for (const part of Array.from(svg.querySelectorAll(`.vs-group[${A.target}]`))) {
    const id = part.getAttribute(A.target)!;
    const boundary = folded.has(id) && !hidden.has(id);
    show(part, !hidden.has(id) && !(svg.hasAttribute('data-vs-flowchart') && boundary));
    part.classList.toggle('vs-folded', boundary);
    if (boundary) {
      part.setAttribute('tabindex', '-1');
      part.setAttribute('aria-hidden', 'true');
    } else {
      part.removeAttribute('tabindex');
      part.removeAttribute('aria-hidden');
    }
  }
  for (const part of Array.from(svg.querySelectorAll(`.vs-node[${A.target}]`))) {
    show(part, !hidden.has(part.getAttribute(A.target)!));
  }
  const proxies = new Map<string, Element[]>();
  for (const proxy of Array.from(svg.querySelectorAll(`[${A.proxyFor}]`))) {
    const id = proxy.getAttribute(A.proxyFor)!;
    proxies.set(id, [...(proxies.get(id) ?? []), proxy]);
  }
  for (const edge of Array.from(svg.querySelectorAll(`.vs-edge[${A.rel}]:not([${A.proxyFor}])`))) {
    const id = edge.getAttribute(A.rel)!;
    const own = proxies.get(id) ?? [];
    const [from, to] = words(own[0]?.getAttribute(A.proxyEnds) ?? null);
    const f = from ? standIn(from) : '';
    const t = to ? standIn(to) : '';
    show(edge, !hidden.has(id) && f === '' && t === '');
    for (const proxy of own) {
      show(proxy, f !== t && proxy.getAttribute(A.proxyFrom) === f && proxy.getAttribute(A.proxyTo) === t);
    }
  }
  updateMarks();
  refreshFlowchartSelection();
}

/** Run `action` on a click, and on Enter or Space: the element is a button (role="button"). */
function onActivate(node: Element, action: () => void): void {
  node.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  });
  node.addEventListener('keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    if (key !== 'Enter' && key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    action();
  });
}

/**
 * Each `group collapsed=true` starts folded. A click on the fold box, or
 * Enter or Space on it, unfolds the group in place, and the focus moves to
 * the group's Fold control; the Fold control folds it again, and the focus
 * moves to the fold box. The text lists do not change.
 */
function addFolds(): void {
  for (const svg of Array.from(document.querySelectorAll('.vs-viewport svg'))) {
    const boxes = Array.from(svg.querySelectorAll<SVGElement>(`[${A.fold}]`));
    const st = figureMarks(svg);
    if (boxes.length === 0 || !st) continue;
    const flowchart = svg.hasAttribute('data-vs-flowchart');
    for (const b of boxes) if (!flowchart || b.getAttribute('data-vs-fold-initial') === 'true') st.folded.add(b.getAttribute(A.fold)!);
    const set = (group: string, fold: boolean) => {
      if (fold) st.folded.add(group);
      else st.folded.delete(group);
      applyFolds(svg, st.folded);
      if (!flowchart && state.current && !visibleInstances(state.current.el.getAttribute(A.target) ?? '').length) closeInspector(false);
      const next = svg.querySelector<SVGElement>(fold ? `[${flowchart ? 'data-vs-fold-expand' : A.fold}="${CSS.escape(group)}"]` : `[${A.foldToggle}="${CSS.escape(group)}"]`);
      if (next && !next.hasAttribute('hidden')) next.focus();
    };
    if (flowchart) {
      for (const expand of Array.from(svg.querySelectorAll('[data-vs-fold-expand]'))) onActivate(expand, () => set(expand.getAttribute('data-vs-fold-expand')!, false));
    } else for (const box of boxes) onActivate(box, () => set(box.getAttribute(A.fold)!, false));
    for (const toggle of Array.from(svg.querySelectorAll(`[${A.foldToggle}]`))) onActivate(toggle, () => set(toggle.getAttribute(A.foldToggle)!, true));
    applyFolds(svg, st.folded);
  }
}

/**
 * Unfold each folded group that hides one of `ids`, with the groups around
 * it, so a link to a part never points at a hidden drawing (docs/
 * IMPROVEMENTS.md §14.9, phase 6b review F7).
 */
function revealParts(ids: readonly string[]): void {
  for (const st of markState.figures.values()) {
    const svg = st.svg;
    if (!svg || st.folded.size === 0) continue;
    let changed = false;
    for (const box of Array.from(svg.querySelectorAll(`[${A.fold}]`))) {
      const g = box.getAttribute(A.fold)!;
      const hides = words(box.getAttribute(A.foldHide));
      if (st.folded.has(g) && ids.some((id) => hides.includes(id))) {
        st.folded.delete(g);
        changed = true;
      }
    }
    if (changed) applyFolds(svg, st.folded);
  }
}

// ---------------------------------------------------------------- terms and edges (§13.4, §4.7)

// The type of the last pointer: a touch shows the bubble first (§13.4).
let lastPointer = 'mouse';
// True when the bubble of the tapped term was open before the tap. The tap
// also focuses the term, and focus shows the bubble, so the click cannot
// read this state itself.
let bubbleBeforeTap = false;

function isTouch(e: MouseEvent): boolean {
  const type = (e as PointerEvent).pointerType;
  return (typeof type === 'string' && type !== '' ? type : e.detail === 0 ? 'keyboard' : lastPointer) === 'touch';
}

function addTermAndEdgeBubbles(): void {
  document.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
    const term = e.target instanceof Element ? e.target.closest('.vs-term') : null;
    bubbleBeforeTap = term !== null && tooltipOwners.includes(term);
  }, true);
  // Terms: a link, a quiet span (a later use in one paragraph), or a tspan in a figure label.
  for (const term of Array.from(document.querySelectorAll(`.vs-term[${A.term}]`))) {
    term.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType !== 'touch') showTermTooltip(term);
    });
    term.addEventListener('pointerleave', () => scheduleHide());
    term.addEventListener('focus', () => showTermTooltip(term));
    term.addEventListener('blur', () => scheduleHide());
  }
  // Edges in a figure: the first sentence of the edge body. A trace order
  // arrow links to its later event, not to itself (its target is not its
  // relationship), so it has no body of its own and gets no bubble.
  for (const edge of Array.from(document.querySelectorAll(`.vs-viewport svg .vs-edge[${A.target}]`))) {
    const id = edge.getAttribute(A.target)!;
    if (edge.getAttribute(A.rel) !== id || !bodyText(id)) continue;
    edge.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType !== 'touch') showEdgeTooltip(edge);
    });
    edge.addEventListener('pointerleave', () => scheduleHide());
    edge.addEventListener('focus', () => showEdgeTooltip(edge));
    edge.addEventListener('blur', () => scheduleHide());
  }
}

function addReferenceButtons(): void {
  const blocks = document.querySelectorAll<HTMLElement>(`#${DOM.root} > .vs-block[${A.target}], #${DOM.root} > .vs-figure[${A.target}]`);
  for (const block of Array.from(blocks)) {
    const id = block.getAttribute(A.target)!;
    const label = block.getAttribute(A.label) ?? id;
    const b = el('button', 'vs-refbtn', '#');
    b.type = 'button';
    b.setAttribute('aria-label', `Reference options for ${label}`);
    b.setAttribute(A.generated, '');
    // Keep the reader's text selection when the button is pressed.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => selectTarget(id, block, true));
    block.prepend(b);
  }
}

// ---------------------------------------------------------------- toolbar extras

function toggleContents(): void {
  let nav = byId('vs-contents');
  if (nav) {
    nav.hidden = !nav.hidden;
    byId(DOM.buttons.contents)?.setAttribute('aria-expanded', String(!nav.hidden));
    return;
  }
  nav = el('nav', 'vs-contents');
  nav.id = 'vs-contents';
  nav.setAttribute('aria-label', 'Contents');
  nav.setAttribute(A.generated, '');
  const list = el('ol');
  for (const heading of Array.from(document.querySelectorAll<HTMLElement>(`[${A.kind}="heading"]`))) {
    const id = heading.getAttribute(A.target);
    if (!id) continue;
    const item = el('li');
    const link = el('a');
    copyLabel(heading, link, heading.getAttribute(A.label) ?? id);
    link.href = `#${DOM.canonicalId(id)}`;
    item.append(link);
    list.append(item);
  }
  nav.append(list);
  byId(DOM.root)?.prepend(nav);
  byId(DOM.buttons.contents)?.setAttribute('aria-expanded', 'true');
}

function toggleAbout(): void {
  let about = byId('vs-about');
  if (about) {
    about.hidden = !about.hidden;
    return;
  }
  const root = byId(DOM.root);
  about = el('section', 'vs-about');
  about.id = 'vs-about';
  about.setAttribute('aria-label', 'About this snapshot');
  about.setAttribute(A.generated, '');
  const list = el('dl');
  for (const [term, value] of [
    ['Document ID', root?.getAttribute(A.doc)],
    ['Source revision', root?.getAttribute(A.rev)],
    ['Build', root?.getAttribute(A.build)],
  ] as const) {
    list.append(el('dt', undefined, term), el('dd', 'vs-mono', value ?? 'unknown'));
  }
  about.append(el('p', undefined, 'This page is an immutable snapshot. Editing the source produces a new revision.'), list);
  const depthKey = document.querySelector<HTMLElement>('.vs-depth-key');
  if (depthKey) about.append(depthKey);
  // The full captured/revision/build/visibility line moves into the panel; a
  // brief "Snapshot · <visibility>" line stays under the h1 for every reader (F11).
  const meta = document.querySelector<HTMLElement>('header.vs-snapshot > .vs-meta');
  if (meta) about.append(meta);
  root?.prepend(about);
}

// ---------------------------------------------------------------- appendix filter (F3c)

/** The appendix rows. A part with no body and no evidence has no visible row (§4.5). */
function appendixDetails(): HTMLDetailsElement[] {
  return Array.from(document.querySelectorAll<HTMLDetailsElement>(`#${DOM.appendix} details.vs-detail:not(.vs-detail-bare)`));
}

/** Hide rows whose summary text does not contain `query`, and any group left empty. */
function applyAppendixFilter(query: string, status: HTMLElement): void {
  const q = query.trim().toLowerCase();
  const rows = appendixDetails();
  let shown = 0;
  for (const row of rows) {
    const match = q === '' || (row.querySelector('summary')?.textContent ?? '').toLowerCase().includes(q);
    row.hidden = !match;
    if (match) shown++;
  }
  for (const group of Array.from(document.querySelectorAll<HTMLDetailsElement>(`.${DOM.appendixGroup}`))) {
    const own = Array.from(group.querySelectorAll<HTMLDetailsElement>('details.vs-detail:not(.vs-detail-bare)'));
    group.hidden = own.every((d) => d.hidden);
    // A query opens a collapsed figure group that has a match, so the match shows.
    if (q !== '' && !group.hidden) group.open = true;
  }
  status.textContent = `${shown} of ${rows.length} shown`;
}

/**
 * A filter box the runtime creates at the top of the appendix (F3c). Without
 * JavaScript there is no box, and every row is present and unhidden, so a
 * no-JS reader always gets the full list.
 */
function addAppendixFilter(): void {
  const appendix = byId(DOM.appendix);
  const heading = appendix?.querySelector('h2');
  if (!appendix || !heading) return;
  const wrap = el('div', 'vs-appendix-filter');
  wrap.setAttribute(A.generated, '');
  const inputId = 'vs-appendix-filter-input';
  const label = el('label', undefined, 'Filter details and evidence');
  label.htmlFor = inputId;
  const input = el('input');
  input.type = 'search';
  input.id = inputId;
  const status = el('p', 'vs-status');
  status.id = 'vs-appendix-filter-status';
  status.setAttribute('role', 'status');
  status.setAttribute(A.generated, '');
  input.addEventListener('input', () => applyAppendixFilter(input.value, status));
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (input.value) {
      input.value = '';
      applyAppendixFilter('', status);
    }
  });
  wrap.append(label, input, status);
  heading.after(wrap);
  applyAppendixFilter('', status);
}

// ---------------------------------------------------------------- figure overflow hint (F5c)

/**
 * Toggle `.vs-overflow-hint[hidden]` for every figure viewport that has one
 * as its next sibling (compile.ts emits the pair together): shown only while
 * the viewport actually overflows, and hidden again once the reader scrolls
 * that viewport to its right end.
 */
function initOverflowHints(): void {
  const pairs: Array<{ viewport: HTMLElement; hint: HTMLElement }> = [];
  for (const viewport of Array.from(document.querySelectorAll<HTMLElement>(`[${A.viewport}]`))) {
    const hint = viewport.nextElementSibling;
    if (!(hint instanceof HTMLElement) || !hint.classList.contains('vs-overflow-hint')) continue;
    pairs.push({ viewport, hint });
    viewport.addEventListener('scroll', () => {
      if (viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1) hint.hidden = true;
    }, { passive: true });
  }
  if (pairs.length === 0) return;
  const check = () => {
    for (const { viewport, hint } of pairs) {
      const overflowing = viewport.scrollWidth > viewport.clientWidth + 1;
      const atEnd = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
      hint.hidden = !overflowing || atEnd;
    }
  };
  requestAnimationFrame(check);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(check);
    for (const { viewport } of pairs) observer.observe(viewport);
  } else {
    window.addEventListener('resize', check);
  }
}

// ---------------------------------------------------------------- events

let flowPointer: { x: number; y: number; moved: boolean } | undefined;
let suppressFlowClick = false;
document.addEventListener('pointerdown', e => {
  suppressFlowClick = false;
  flowPointer = e.target instanceof Element && e.target.closest('svg[data-vs-flowchart]') ? { x: e.clientX, y: e.clientY, moved: false } : undefined;
}, true);
document.addEventListener('pointermove', e => {
  if (flowPointer && Math.hypot(e.clientX - flowPointer.x, e.clientY - flowPointer.y) >= 6) flowPointer.moved = true;
}, true);
document.addEventListener('pointerup', () => { suppressFlowClick = flowPointer?.moved ?? false; flowPointer = undefined; }, true);
document.addEventListener('pointercancel', () => { suppressFlowClick = true; flowPointer = undefined; }, true);
document.addEventListener('click', e => {
  if (suppressFlowClick && e.detail !== 0 && e.target instanceof Element && e.target.closest('svg[data-vs-flowchart]')) {
    e.preventDefault(); e.stopImmediatePropagation(); suppressFlowClick = false;
  }
}, true);

function onClick(e: MouseEvent): void {
  const target = e.target instanceof Element ? e.target : null;
  if (!target || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  if (state.refmode && !isChrome(target)) {
    const owner = target.closest(`[${A.target}]`);
    const id = owner?.getAttribute(A.target);
    if (owner && id) {
      e.preventDefault();
      selectTarget(id, owner, true);
    }
    return;
  }

  // A term: a link, a quiet span, or a tspan in a figure label. A tap shows
  // the bubble first, and a second tap opens the definition; a click, and
  // Enter on a focused term, open the definition (docs/IMPROVEMENTS.md §13.4).
  const term = target.closest(`.vs-term[${A.term}]`);
  if (term && !term.closest(`.${DOM.toolbar}, #vs-refpanel`)) {
    const defId = term.getAttribute(A.term)!;
    if (canonical(defId) instanceof HTMLDetailsElement) {
      e.preventDefault();
      if (isTouch(e) && !bubbleBeforeTap) {
        showTermTooltip(term);
        return;
      }
      hideTooltip();
      const origin = term instanceof HTMLAnchorElement ? term : term.closest<SVGElement>('a') ?? undefined;
      // --- Domain (docs/IMPROVEMENTS.md §5.4): a definition that a concept
      // owns opens the concept, with its relations and where it appears. The
      // bubble above stays the definition's first sentence.
      const concept = canonical(defId)?.getAttribute(A.concept);
      const openId = concept && canonical(concept) instanceof HTMLDetailsElement ? concept : defId;
      // --- end domain
      if (state.current) showDetail(openId, true, origin?.id || undefined, origin?.getAttribute(A.depth) ?? undefined, origin);
      else openInspector(openId, origin);
      return;
    }
  }

  const focusLink = target.closest<HTMLElement>('a.vs-focus');
  if (focusLink) {
    e.preventDefault();
    const ids = (focusLink.getAttribute(A.focus) ?? '').split(/\s+/u).filter(Boolean);
    // A part inside a folded group: the group unfolds first (§14.9).
    revealParts(ids);
    highlight(ids, 'vs-focused');
    const first = ids[0] ? Array.from(document.querySelectorAll(`[${A.target}="${CSS.escape(ids[0])}"]`)).find((x) => x.closest('[hidden]') === null) : undefined;
    if (first) scrollIntoView(first);
    return;
  }

  // Drawn Mermaid elements are not links; they carry the target of their list instance (§9.12).
  // Generated inspector links (a part's Relationships, Appears in, and
  // Evidence sections) and the bubble's "Open definition" link open their
  // target in the inspector as well.
  const link = target.closest<HTMLElement>(`a.vs-cite, a.vs-detail-link, a.vs-inspect-link, a.vs-tooltip__open, a[${A.target}], a[${A.interactive}], [data-vs-mermaid-drawn][${A.interactive}]:not([data-vs-mermaid-derived])`);
  if (link && !link.closest(`.${DOM.toolbar}, #vs-refpanel`)) {
    const id = link.getAttribute(A.term) ?? targetIdFromHref(link) ?? link.getAttribute(A.target);
    if (id && canonical(id) instanceof HTMLDetailsElement) {
      e.preventDefault();
      if (link.classList.contains('vs-tooltip__open')) hideTooltip();
      if (state.current) showDetail(id, true, link.id || undefined, link.getAttribute(A.depth) ?? undefined, link);
      else openInspector(id, link);
    }
  }
}

function dismissLayer(): boolean {
  const fallback = byId(DOM.copyFallback)?.parentElement;
  if (fallback) { fallback.remove(); const origin = panel && !panel.hidden ? panel.querySelector<HTMLElement>('button') : state.inspector?.title; origin?.focus({preventScroll:true}); return true; }
  if (panel && !panel.hidden) { closePanel(); return true; }
  if (tooltip) { hideTooltip(); return true; }
  if (state.current) { closeInspector(); return true; }
  return false;
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  if (dismissLayer()) { e.preventDefault(); return; }
  if (viewer.active) { e.preventDefault(); viewer.close(); return; }
  if (state.refmode) setRefmode(false);
  clearHighlight('vs-focused');
}
const viewer = new FigureViewer({
  closeDetail: () => closeInspector(false),
  clearTransient: () => { hideTooltip(); closePanel(); panel?.remove(); panel = undefined; },
  referenceMode: () => state.refmode,
  setReferenceMode: setRefmode,
  escape: dismissLayer,
});

function init(): void {
  const toolbar = document.querySelector<HTMLElement>(`.${DOM.toolbar}`);
  if (toolbar) toolbar.hidden = false;
  document.documentElement.classList.add('vs-js');

  byId(DOM.buttons.refmode)?.addEventListener('click', () => setRefmode(!state.refmode));
  const expand = byId(DOM.buttons.expand);
  if (expand instanceof HTMLButtonElement) {
    expand.setAttribute('aria-pressed', 'false');
    expand.addEventListener('click', () => toggleExpand(expand));
  }
  byId(DOM.buttons.contents)?.addEventListener('click', toggleContents);
  byId(DOM.buttons.about)?.addEventListener('click', toggleAbout);

  addReferenceButtons();
  viewer.init();
  addViewToggles();
  initAppendixCounts();
  addAppendixFilter();
  initOverflowHints();

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('selectionchange', recordSelection);

  registerFigures();
  addNeighbourhoods();
  addTermAndEdgeBubbles();
  addFolds();
  addFilterChips();
  addEntityLinks();

  for (const cite of Array.from(document.querySelectorAll<HTMLElement>('a.vs-cite'))) {
    cite.addEventListener('mouseenter', () => showCiteTooltip(cite));
    cite.addEventListener('mouseleave', () => scheduleHide());
    cite.addEventListener('focus', () => showCiteTooltip(cite));
    cite.addEventListener('blur', () => scheduleHide());
  }

  window.addEventListener('hashchange', onHash);
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  onHash();
  // Render eagerly, not on visibility, so an early print shows the drawing (§9.12).
  void renderMermaidFigures().then(() => { viewer.register(); applyViews(); registerFigures(); });
  const mathData = document.querySelector<HTMLMetaElement>('meta[name="vs-math-expressions"]');
  const mathWorker = (globalThis as typeof globalThis & { __visserMathWorkerSource?: string }).__visserMathWorkerSource;
  if (mathData && mathWorker) {
    try {
      const expressions = JSON.parse(mathData.content) as MathExpressionRecord[];
      void initializeMath(document, mathWorker, expressions).then(() => { viewer.register(); applyViews(); registerFigures(); });
    } catch { /* Complete source remains visible when the expression table is unavailable. */ }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

/* phase 6a: components */
// The components of docs/IMPROVEMENTS.md §14 (packages/runtime/src/components.ts):
// the step bar of a `steps` walkthrough and the tree defaults. They start
// after init(), so their listeners run after the ones above.
import { initComponents } from './components.ts';

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initComponents);
else initComponents();
/* end phase 6a: components */
