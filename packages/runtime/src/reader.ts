// Reader runtime (§10). Enhances the static snapshot: the page stays complete and
// readable without it. No network access, no inline styles, no dependencies.
import { DOM } from '../../core/src/compiler/dom-contract.ts';
import { figureView, VIEW_CLASS } from './views.ts';
import { renderMermaidFigures } from './mermaid.ts';
import { buildPacketYaml, codePoints, lastCodePoints, normalizeWhitespace, QUOTE_CONTEXT_MAX, QUOTE_EXACT_MAX } from './packet.ts';

const A = DOM.attr;
const HISTORY_MAX = 20;

type Moved = { el: HTMLDetailsElement; placeholder: HTMLTemplateElement; wasOpen: boolean; wasHidden: boolean };

type Inspector = {
  host: HTMLElement; // <aside> or <dialog>
  body: HTMLElement;
  title: HTMLElement;
  back: HTMLButtonElement;
  modal: boolean;
};

const state = {
  current: undefined as Moved | undefined,
  history: [] as string[],
  origin: undefined as HTMLElement | undefined,
  inspector: undefined as Inspector | undefined,
  refmode: false,
  selected: undefined as string | undefined,
  lastSelection: undefined as { targetId: string; exact: string; prefix: string; suffix: string } | undefined,
  // The last non-empty selection crossed a block boundary (§11.3: v1 asks for one block).
  crossBlock: false,
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

function ensureInspector(modal: boolean): Inspector {
  if (state.inspector && state.inspector.modal === modal) return state.inspector;
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
  const copy = button('Copy reference', 'vs-btn', () => {
    const id = state.current?.el.getAttribute(A.target);
    if (id) void copyReference(id, false);
  });
  const close = button('Close', 'vs-btn vs-inspector__close', () => closeInspector());
  bar.append(back, title, copy, close);
  const body = el('div', 'vs-inspector__body');
  const status = el('p', 'vs-status');
  status.setAttribute('role', 'status');
  host.append(bar, body, status);
  if (modal) {
    const dialog = host as HTMLDialogElement;
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeInspector();
    });
  }
  document.body.append(host);
  state.inspector = { host, body, title, back, modal };
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

function showDetail(targetId: string, push: boolean): boolean {
  const detail = canonical(targetId);
  if (!(detail instanceof HTMLDetailsElement)) return false;
  const modal = isNarrow() && typeof HTMLDialogElement !== 'undefined' && 'showModal' in HTMLDialogElement.prototype;
  const previous = state.current?.el.getAttribute(A.target);
  if (push && previous && previous !== targetId) {
    state.history.push(previous);
    if (state.history.length > HISTORY_MAX) state.history.shift();
  }
  returnCurrent();
  const inspector = ensureInspector(modal);
  const placeholder = document.createElement('template');
  placeholder.setAttribute(A.placeholder, targetId);
  detail.before(placeholder);
  state.current = { el: detail, placeholder, wasOpen: detail.open, wasHidden: detail.hidden };
  detail.open = true;
  detail.hidden = false;
  inspector.body.replaceChildren(detail);
  // F4b: the full title is always in the DOM and in `title` (native tooltip
  // when the 2-line clamp truncates it); the clamp itself is CSS (reader.css).
  const label = detail.getAttribute(A.label) ?? targetId;
  inspector.title.textContent = label;
  inspector.title.title = label;
  inspector.back.hidden = state.history.length === 0;
  if (modal) {
    const dialog = inspector.host as HTMLDialogElement;
    if (!dialog.open) dialog.showModal();
  } else {
    inspector.host.hidden = false;
    document.body.classList.add('vs-has-inspector');
  }
  // Initial focus moves to the title (§10.2), but not with a visible ring for
  // this programmatic move; a reader who Tabs to it later still gets one
  // (reader.css scopes `:focus:not(:focus-visible)` to this element only).
  inspector.title.focus();
  return true;
}

function openInspector(targetId: string, origin: HTMLElement | undefined): boolean {
  if (!(canonical(targetId) instanceof HTMLDetailsElement)) return false;
  if (!state.current) {
    state.history = [];
    state.origin = origin;
  }
  return showDetail(targetId, true);
}

function goBack(): void {
  const previous = state.history.pop();
  if (previous) showDetail(previous, false);
}

function closeInspector(restoreFocus = true): void {
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
  const origin = state.origin;
  state.origin = undefined;
  if (restoreFocus && origin && origin.isConnected) origin.focus();
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
  if (state.current?.el.getAttribute(A.target) === targetId) return;
  openTarget(targetId);
}

function allDetails(): HTMLDetailsElement[] {
  return Array.from(document.querySelectorAll<HTMLDetailsElement>('details'));
}

function toggleExpand(buttonEl: HTMLButtonElement): void {
  closeInspector(false);
  state.expanded = !state.expanded;
  for (const d of allDetails()) d.open = state.expanded;
  buttonEl.setAttribute('aria-pressed', String(state.expanded));
}

function beforePrint(): void {
  closeInspector(false);
  state.printOpened = allDetails().filter((d) => !d.open);
  for (const d of state.printOpened) d.open = true;
}

function afterPrint(): void {
  for (const d of state.printOpened) d.open = false;
  state.printOpened = [];
}

// ---------------------------------------------------------------- definitions

let tooltip: HTMLElement | undefined;
let tooltipOwners: HTMLElement[] = [];
let tooltipTimer: number | undefined;

function firstSentence(text: string): string {
  const clean = normalizeWhitespace(text, true);
  const match = /^(.+?[.!?])(\s|$)/u.exec(clean);
  return match?.[1] ?? clean;
}

function definitionText(defId: string): string {
  const detail = canonical(defId);
  if (!detail) return '';
  const parts: string[] = [];
  for (const child of Array.from(detail.children)) {
    if (child.tagName === 'SUMMARY' || child.hasAttribute(A.generated)) continue;
    parts.push(child.textContent ?? '');
  }
  return firstSentence(parts.join(' '));
}

/** Show one tooltip shared by `owners`, positioned after the last one. */
function showTooltipFor(owners: HTMLElement[], text: string): void {
  if (!text) return;
  hideTooltip();
  const tip = el('span', 'vs-tooltip', text);
  tip.id = 'vs-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute(A.generated, '');
  tip.addEventListener('mouseenter', () => window.clearTimeout(tooltipTimer));
  tip.addEventListener('mouseleave', () => scheduleHide());
  owners[owners.length - 1]?.after(tip);
  for (const owner of owners) owner.setAttribute('aria-describedby', tip.id);
  tooltip = tip;
  tooltipOwners = owners;
}

function showTooltip(term: HTMLElement): void {
  const defId = term.getAttribute(A.term);
  if (!defId) return;
  showTooltipFor([term], definitionText(defId));
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
  showTooltipFor(group, titles.join('; '));
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

function clearHighlight(className: string): void {
  for (const node of Array.from(document.querySelectorAll(`.${className}`))) node.classList.remove(className);
}

function highlight(ids: string[], className: string): void {
  clearHighlight(className);
  for (const id of ids) {
    for (const node of Array.from(document.querySelectorAll(`[${A.target}="${CSS.escape(id)}"]`))) node.classList.add(className);
  }
}

// ---------------------------------------------------------------- reference mode

let panel: HTMLElement | undefined;

/** Text of a DOM range without generated (non-author) text. */
function rangeText(range: Range): string {
  const fragment = range.cloneContents();
  for (const node of Array.from(fragment.querySelectorAll(`[${A.generated}]`))) node.remove();
  return fragment.textContent ?? '';
}

function recordSelection(): void {
  const selection = window.getSelection();
  const clear = () => {
    state.lastSelection = undefined;
    state.crossBlock = false;
  };
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    // In reference mode, clicking a block collapses the text selection before the
    // copy, so keep the quote. Elsewhere a collapsed selection means the reader
    // deselected the text, and an old quote must not reach a later packet.
    if (!state.refmode) clear();
    return;
  }
  const range = selection.getRangeAt(0);
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
  const container = (panel && !panel.hidden ? panel : state.inspector?.host) ?? ensurePanel();
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
  if (panel) return panel;
  panel = el('div', 'vs-refpanel');
  panel.id = 'vs-refpanel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Reference');
  panel.setAttribute(A.generated, '');
  panel.hidden = true;
  document.body.append(panel);
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
  state.selected = targetId;
  highlight([targetId], 'vs-selected');
  const node = canonical(targetId);
  const kind = node?.getAttribute(A.kind) ?? '';
  const label = node?.getAttribute(A.label) ?? targetId;
  const p = ensurePanel();
  p.replaceChildren();
  const heading = el('p', 'vs-refpanel__title');
  heading.append(el('strong', undefined, kind === 'heading' ? 'Heading only (not its section): ' : `${kind || 'Target'}: `), document.createTextNode(label));
  const actions = el('div', 'vs-refpanel__actions');
  const copy = button('Copy reference', 'vs-btn vs-btn--primary', () => void copyReference(targetId, false));
  const withText = button('Copy reference with selected text', 'vs-btn', () => void copyReference(targetId, true));
  withText.disabled = state.lastSelection?.targetId !== targetId;
  actions.append(copy, withText);
  const note = from.closest('[data-vs-mermaid-derived]')
    ? el('p', 'vs-refpanel__note', 'This arrow has no ID of its own; the reference is to the diagram. Give it an edge ID (e1@-->) to reference it.')
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
}

function setRefmode(on: boolean): void {
  state.refmode = on;
  document.body.classList.toggle('vs-refmode', on);
  byId(DOM.buttons.refmode)?.setAttribute('aria-pressed', String(on));
  if (!on) closePanel();
}

function isChrome(node: Element): boolean {
  return Boolean(node.closest(`.${DOM.toolbar}, #vs-refpanel, #${DOM.inspector}, #${DOM.inspectorDialog}, .vs-tooltip, .vs-refbtn, .vs-view-bar`));
}

// ---------------------------------------------------------------- figure views

const mapChosen = new WeakSet<Element>();

function applyViews(): void {
  const narrow = isNarrow();
  for (const figure of Array.from(document.querySelectorAll<HTMLElement>(`figure[${A.views}]`))) {
    const view = figureView(narrow, mapChosen.has(figure));
    for (const cls of Object.values(VIEW_CLASS)) if (cls) figure.classList.remove(cls);
    const cls = VIEW_CLASS[view];
    if (cls) figure.classList.add(cls);
    const toggle = figure.querySelector<HTMLButtonElement>('.vs-view-toggle');
    if (toggle) toggle.setAttribute('aria-pressed', String(view === 'map'));
  }
}

function addViewToggles(): void {
  for (const figure of Array.from(document.querySelectorAll<HTMLElement>(`figure[${A.views}]`))) {
    const bar = el('div', 'vs-view-bar');
    bar.setAttribute(A.generated, '');
    const toggle = button('Show map', 'vs-btn vs-view-toggle', () => {
      if (mapChosen.has(figure)) mapChosen.delete(figure);
      else mapChosen.add(figure);
      applyViews();
    });
    toggle.setAttribute('aria-pressed', 'false');
    const label = figure.getAttribute(A.label);
    if (label) toggle.setAttribute('aria-label', `Show map: ${label}`);
    bar.append(toggle);
    const viewport = figure.querySelector(`[${A.viewport}]`);
    if (viewport) viewport.before(bar);
    else figure.append(bar);
  }
  applyViews();
  window.matchMedia(`(max-width: ${DOM.narrowMaxWidth}px)`).addEventListener('change', applyViews);
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
    const link = el('a', undefined, heading.getAttribute(A.label) ?? id);
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
  // The full captured/revision/build/visibility line moves into the panel; a
  // brief "Snapshot · <visibility>" line stays under the h1 for every reader (F11).
  const meta = document.querySelector<HTMLElement>('header.vs-snapshot > .vs-meta');
  if (meta) about.append(meta);
  root?.prepend(about);
}

// ---------------------------------------------------------------- appendix filter (F3c)

function appendixDetails(): HTMLDetailsElement[] {
  return Array.from(document.querySelectorAll<HTMLDetailsElement>(`#${DOM.appendix} details.vs-detail`));
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
  for (const group of Array.from(document.querySelectorAll<HTMLElement>(`.${DOM.appendixGroup}`))) {
    group.hidden = Array.from(group.querySelectorAll<HTMLDetailsElement>('details.vs-detail')).every((d) => d.hidden);
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

  const focusLink = target.closest<HTMLElement>('a.vs-focus');
  if (focusLink) {
    e.preventDefault();
    const ids = (focusLink.getAttribute(A.focus) ?? '').split(/\s+/u).filter(Boolean);
    highlight(ids, 'vs-focused');
    const first = ids[0] ? document.querySelector(`[${A.target}="${CSS.escape(ids[0])}"]`) : null;
    if (first) scrollIntoView(first);
    return;
  }

  // Drawn Mermaid elements are not links; they carry the target of their list instance (§9.12).
  const link = target.closest<HTMLElement>(`a.vs-term, a.vs-cite, a[${A.target}], a[${A.interactive}], [data-vs-mermaid-drawn]:not([data-vs-mermaid-derived])`);
  if (link && !link.closest(`.${DOM.toolbar}, #vs-refpanel`)) {
    const id = link.getAttribute(A.term) ?? targetIdFromHref(link) ?? link.getAttribute(A.target);
    if (id && canonical(id) instanceof HTMLDetailsElement) {
      e.preventDefault();
      if (state.current) showDetail(id, true);
      else openInspector(id, link);
    }
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  if (tooltip) {
    hideTooltip();
    return;
  }
  if (state.inspector && !state.inspector.modal && !state.inspector.host.hidden) {
    closeInspector();
    return;
  }
  if (panel && !panel.hidden) {
    closePanel();
    return;
  }
  if (state.refmode) setRefmode(false);
  clearHighlight('vs-focused');
}

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
  addViewToggles();
  addAppendixFilter();
  initOverflowHints();

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('selectionchange', recordSelection);

  for (const term of Array.from(document.querySelectorAll<HTMLElement>('a.vs-term'))) {
    term.addEventListener('mouseenter', () => showTooltip(term));
    term.addEventListener('mouseleave', () => scheduleHide());
    term.addEventListener('focus', () => showTooltip(term));
    term.addEventListener('blur', () => scheduleHide());
  }

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
  void renderMermaidFigures();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
