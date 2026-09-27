// Reader runtime (§10). Enhances the static snapshot: the page stays complete and
// readable without it. No network access, no inline styles, no dependencies.
import { DOM } from '../../core/src/compiler/dom-contract.ts';
import { figureView, VIEW_CLASS } from './views.ts';
import { buildPacketYaml, codePoints, lastCodePoints, normalizeWhitespace, QUOTE_CONTEXT_MAX, QUOTE_EXACT_MAX } from './packet.ts';

const A = DOM.attr;
const HISTORY_MAX = 20;

type Moved = { el: HTMLDetailsElement; placeholder: HTMLTemplateElement; wasOpen: boolean };

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
  const host: HTMLElement = modal ? el('dialog', 'ex-inspector ex-inspector--dialog') : el('aside', 'ex-inspector ex-inspector--aside');
  host.id = modal ? DOM.inspectorDialog : DOM.inspector;
  host.setAttribute('aria-labelledby', 'ex-inspector-title');
  host.setAttribute(A.generated, '');
  if (!modal) host.hidden = true;
  const bar = el('div', 'ex-inspector__bar');
  const title = el('h2', 'ex-inspector__title');
  title.id = 'ex-inspector-title';
  title.tabIndex = -1;
  const back = button('Back', 'ex-btn ex-inspector__back', () => goBack());
  const copy = button('Copy reference', 'ex-btn', () => {
    const id = state.current?.el.getAttribute(A.target);
    if (id) void copyReference(id, false);
  });
  const close = button('Close', 'ex-btn ex-inspector__close', () => closeInspector());
  bar.append(back, title, copy, close);
  const body = el('div', 'ex-inspector__body');
  const status = el('p', 'ex-status');
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
  state.current = { el: detail, placeholder, wasOpen: detail.open };
  detail.open = true;
  inspector.body.replaceChildren(detail);
  inspector.title.textContent = detail.getAttribute(A.label) ?? targetId;
  inspector.back.hidden = state.history.length === 0;
  if (modal) {
    const dialog = inspector.host as HTMLDialogElement;
    if (!dialog.open) dialog.showModal();
  } else {
    inspector.host.hidden = false;
    document.body.classList.add('ex-has-inspector');
  }
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
  document.body.classList.remove('ex-has-inspector');
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
let tooltipTerm: HTMLElement | undefined;
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

function showTooltip(term: HTMLElement): void {
  const defId = term.getAttribute(A.term);
  if (!defId) return;
  const text = definitionText(defId);
  if (!text) return;
  hideTooltip();
  const tip = el('span', 'ex-tooltip', text);
  tip.id = 'ex-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute(A.generated, '');
  tip.addEventListener('mouseenter', () => window.clearTimeout(tooltipTimer));
  tip.addEventListener('mouseleave', () => scheduleHide());
  term.after(tip);
  term.setAttribute('aria-describedby', tip.id);
  tooltip = tip;
  tooltipTerm = term;
}

function hideTooltip(): void {
  window.clearTimeout(tooltipTimer);
  tooltip?.remove();
  tooltipTerm?.removeAttribute('aria-describedby');
  tooltip = undefined;
  tooltipTerm = undefined;
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
  if (panel && !panel.hidden) return panel.querySelector<HTMLElement>('.ex-status') ?? undefined;
  return state.inspector?.host.querySelector<HTMLElement>('.ex-status') ?? undefined;
}

function showFallback(text: string): void {
  const container = (panel && !panel.hidden ? panel : state.inspector?.host) ?? ensurePanel();
  if (container === panel) panel.hidden = false;
  byId(DOM.copyFallback)?.parentElement?.remove();
  const wrap = el('div', 'ex-copy-fallback');
  const label = el('label', 'ex-copy-fallback__label', 'Copying was not allowed. Copy this reference with Ctrl+C or Cmd+C:');
  label.htmlFor = DOM.copyFallback;
  const area = el('textarea', 'ex-copy-fallback__text');
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
  panel = el('div', 'ex-refpanel');
  panel.id = 'ex-refpanel';
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
  highlight([targetId], 'ex-selected');
  const node = canonical(targetId);
  const kind = node?.getAttribute(A.kind) ?? '';
  const label = node?.getAttribute(A.label) ?? targetId;
  const p = ensurePanel();
  p.replaceChildren();
  const heading = el('p', 'ex-refpanel__title');
  heading.append(el('strong', undefined, kind === 'heading' ? 'Heading only (not its section): ' : `${kind || 'Target'}: `), document.createTextNode(label));
  const actions = el('div', 'ex-refpanel__actions');
  const copy = button('Copy reference', 'ex-btn ex-btn--primary', () => void copyReference(targetId, false));
  const withText = button('Copy reference with selected text', 'ex-btn', () => void copyReference(targetId, true));
  withText.disabled = state.lastSelection?.targetId !== targetId;
  actions.append(copy, withText);
  const note = state.crossBlock && withText.disabled
    ? el('p', 'ex-refpanel__note', 'Your selection spans more than one block. Select text within one block to copy it with a reference.')
    : undefined;
  if (node instanceof HTMLDetailsElement) {
    actions.append(button('Open detail', 'ex-btn', () => openInspector(targetId, copy)));
  }
  const chain = ancestorsWithTargets(from.closest(`[${A.target}]`) ?? from);
  const ancestors = [...chain];
  const nodeParent = node?.parentElement?.closest(`[${A.target}]`)?.getAttribute(A.target);
  if (nodeParent && !ancestors.includes(nodeParent)) ancestors.push(nodeParent);
  if (ancestors.length > 1) {
    const selectLabel = el('label', 'ex-refpanel__parent', 'Select: ');
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
  actions.append(button('Close', 'ex-btn', () => closePanel()));
  const status = el('p', 'ex-status');
  status.setAttribute('role', 'status');
  p.append(heading, actions, ...(note ? [note] : []), status);
  p.hidden = false;
  if (focusPanel) copy.focus();
}

function closePanel(): void {
  if (panel) panel.hidden = true;
  state.selected = undefined;
  clearHighlight('ex-selected');
}

function setRefmode(on: boolean): void {
  state.refmode = on;
  document.body.classList.toggle('ex-refmode', on);
  byId(DOM.buttons.refmode)?.setAttribute('aria-pressed', String(on));
  if (!on) closePanel();
}

function isChrome(node: Element): boolean {
  return Boolean(node.closest(`.${DOM.toolbar}, #ex-refpanel, #${DOM.inspector}, #${DOM.inspectorDialog}, .ex-tooltip, .ex-refbtn, .ex-view-bar`));
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
    const toggle = figure.querySelector<HTMLButtonElement>('.ex-view-toggle');
    if (toggle) toggle.setAttribute('aria-pressed', String(view === 'map'));
  }
}

function addViewToggles(): void {
  for (const figure of Array.from(document.querySelectorAll<HTMLElement>(`figure[${A.views}]`))) {
    const bar = el('div', 'ex-view-bar');
    bar.setAttribute(A.generated, '');
    const toggle = button('Show map', 'ex-btn ex-view-toggle', () => {
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
  const blocks = document.querySelectorAll<HTMLElement>(`#${DOM.root} > .ex-block[${A.target}], #${DOM.root} > .ex-figure[${A.target}]`);
  for (const block of Array.from(blocks)) {
    const id = block.getAttribute(A.target)!;
    const label = block.getAttribute(A.label) ?? id;
    const b = el('button', 'ex-refbtn', '#');
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
  let nav = byId('ex-contents');
  if (nav) {
    nav.hidden = !nav.hidden;
    byId(DOM.buttons.contents)?.setAttribute('aria-expanded', String(!nav.hidden));
    return;
  }
  nav = el('nav', 'ex-contents');
  nav.id = 'ex-contents';
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
  let about = byId('ex-about');
  if (about) {
    about.hidden = !about.hidden;
    return;
  }
  const root = byId(DOM.root);
  about = el('section', 'ex-about');
  about.id = 'ex-about';
  about.setAttribute('aria-label', 'About this snapshot');
  about.setAttribute(A.generated, '');
  const list = el('dl');
  for (const [term, value] of [
    ['Document ID', root?.getAttribute(A.doc)],
    ['Source revision', root?.getAttribute(A.rev)],
    ['Build', root?.getAttribute(A.build)],
  ] as const) {
    list.append(el('dt', undefined, term), el('dd', 'ex-mono', value ?? 'unknown'));
  }
  about.append(el('p', undefined, 'This page is an immutable snapshot. Editing the source produces a new revision.'), list);
  root?.prepend(about);
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

  const focusLink = target.closest<HTMLElement>('a.ex-focus');
  if (focusLink) {
    e.preventDefault();
    const ids = (focusLink.getAttribute(A.focus) ?? '').split(/\s+/u).filter(Boolean);
    highlight(ids, 'ex-focused');
    const first = ids[0] ? document.querySelector(`[${A.target}="${CSS.escape(ids[0])}"]`) : null;
    if (first) scrollIntoView(first);
    return;
  }

  const link = target.closest<HTMLElement>(`a.ex-term, a.ex-cite, a[${A.target}], a[${A.interactive}]`);
  if (link && !link.closest(`.${DOM.toolbar}, #ex-refpanel`)) {
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
  clearHighlight('ex-focused');
}

function init(): void {
  const toolbar = document.querySelector<HTMLElement>(`.${DOM.toolbar}`);
  if (toolbar) toolbar.hidden = false;
  document.documentElement.classList.add('ex-js');

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

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('selectionchange', recordSelection);

  for (const term of Array.from(document.querySelectorAll<HTMLElement>('a.ex-term'))) {
    term.addEventListener('mouseenter', () => showTooltip(term));
    term.addEventListener('mouseleave', () => scheduleHide());
    term.addEventListener('focus', () => showTooltip(term));
    term.addEventListener('blur', () => scheduleHide());
  }

  window.addEventListener('hashchange', onHash);
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  onHash();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
