// Source-owned browser math conversion. The compiler supplies explicit records;
// this module never searches document prose for delimiter pairs.
import { insertedMathCost, MATH_INSERTION_ATTRIBUTE_BYTES, MATH_INSERTION_NUMBER_CHARS, MATH_LIMITS } from '../../core/src/math/policy.ts';
import { validateMathConversionShape } from '../../core/src/math/svg-validate.ts';
import type { MathConversion, MathSvgElement } from '../../core/src/math/engine.ts';
import type { MathWorkItem, MathWorkRequest, MathWorkResponse } from './math-worker.ts';

export type MathExpressionRecord = Readonly<{ key: string; tex: string; display: boolean }>;
export type MathRuntimeStatus = Readonly<{ rendered: number; failed: number; skipped: number }>;
type Root = Document | Element;
type Cost = { occurrences: number; svgBytes: number; elementCount: number };
const SVG_NS = 'http://www.w3.org/2000/svg';
const EMPTY: Cost = { occurrences: 0, svgBytes: 0, elementCount: 0 };
const pending = new WeakMap<Root, Promise<MathRuntimeStatus>>();
type Rescan = { workerSource: string; expressions: readonly MathExpressionRecord[]; task: Promise<MathRuntimeStatus> };
const rescans = new WeakMap<Root, Rescan>();
const documentWork = new WeakMap<Document, Promise<void>>();
const copyRecords = new WeakMap<Root, Map<string, MathExpressionRecord>>();
const listeners = new WeakSet<Root>();
const attrNames = new Set(['xmlns', 'width', 'height', 'role', 'focusable', 'viewBox', 'stroke', 'fill', 'stroke-width', 'transform', 'data-mml-node', 'data-mjx-texclass', 'data-c', 'd', 'x', 'y']);
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const exNumeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?ex$/;
const transform = /^(?:(?:translate|scale|rotate|matrix)\([0-9eE.,+\-\s]+\)\s*)+$/;
const path = /^[MmLlHhVvCcSsQqTtAaZz0-9.eE,+\-\s]+$/;
const utf8 = new TextEncoder();

function validAttribute(tag: string, name: string, value: string): boolean {
  if (!attrNames.has(name) || value.length > MATH_LIMITS.expressionSvgBytes) return false;
  if (name === 'xmlns') return tag === 'svg' && value === SVG_NS;
  if (name === 'role') return tag === 'svg' && value === 'img';
  if (name === 'focusable') return tag === 'svg' && value === 'false';
  if (name === 'width' || name === 'height') return tag === 'svg' ? exNumeric.test(value) : numeric.test(value);
  if (['x', 'y', 'stroke-width'].includes(name)) return numeric.test(value);
  if (name === 'viewBox') return tag === 'svg' && value.trim().split(/[\s,]+/).length === 4 && value.trim().split(/[\s,]+/).every(part => numeric.test(part));
  if (name === 'stroke' || name === 'fill') return value === 'none' || value === 'currentColor';
  if (name === 'transform') return transform.test(value);
  // The pinned font uses an empty no-ink path for a text space.
  if (name === 'd') return tag === 'path' && (value === '' || path.test(value));
  if (name === 'data-c') return /^[0-9A-F]+$/.test(value);
  if (name === 'data-mml-node') return /^[A-Za-z][A-Za-z0-9]*$/.test(value);
  if (name === 'data-mjx-texclass') return /^[A-Z]+$/.test(value);
  return true;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Revalidate the worker's structured output at the insertion boundary. No
// markup parser, innerHTML, URL attribute, style, or generated ID is accepted.
function materialize(node: MathSvgElement, doc: Document, depth: number, cost: { bytes: number; elements: number }): Element {
  if (!node || !['svg', 'g', 'path', 'rect'].includes(node.tag) || depth > 128 || !node.attrs || typeof node.attrs !== 'object' || !Array.isArray(node.children)) {
    throw new Error('Invalid math SVG tree');
  }
  cost.elements++;
  if (cost.elements > MATH_LIMITS.expressionElements) throw new Error('Math SVG element limit exceeded');
  const out = doc.createElementNS(SVG_NS, node.tag);
  let opening = `<${node.tag}`;
  for (const [name, value] of Object.entries(node.attrs)) {
    if (typeof value !== 'string' || !validAttribute(node.tag, name, value)) throw new Error('Unsafe math SVG attribute');
    out.setAttribute(name, value);
    opening += ` ${name}="${xmlEscape(value)}"`;
  }
  cost.bytes += utf8.encode(opening + `></${node.tag}>`).length;
  if (cost.bytes > MATH_LIMITS.expressionSvgBytes) throw new Error('Math SVG byte limit exceeded');
  for (const child of node.children) out.append(materialize(child, doc, depth + 1, cost));
  return out;
}

function checkedSvg(value: unknown, expression: MathExpressionRecord, doc: Document, slot?: Element): { svg: Element; svgBytes: number; elementCount: number } {
  const conversion = validateMathConversionShape(value, expression);
  const { widthEm, heightEm, depthEm, ascentEm } = conversion.metrics ?? {};
  if (![widthEm, heightEm, depthEm, ascentEm].every(value => typeof value === 'number' && Number.isFinite(value)) ||
      widthEm <= 0 || heightEm <= 0 || depthEm < 0 || ascentEm <= 0 || Math.abs(heightEm - depthEm - ascentEm) > 0.001) {
    throw new Error('Invalid math metrics');
  }
  const cost = { bytes: 0, elements: 0 };
  const svg = materialize(conversion.svg, doc, 0, cost);
  if (cost.bytes !== conversion.svgBytes || cost.elements !== conversion.elementCount) throw new Error('Math worker cost mismatch');
  const oldWidth = svg.getAttribute('width');
  const oldHeight = svg.getAttribute('height');
  if (!oldWidth || !oldHeight) throw new Error('Math SVG dimensions missing');
  if (Math.abs(Number(oldWidth.slice(0, -2)) / 2 - widthEm) > 0.0001 ||
      Math.abs(Number(oldHeight.slice(0, -2)) / 2 - heightEm) > 0.0001 ||
      widthEm > 100_000 || heightEm > 100_000 || depthEm > heightEm) {
    throw new Error('Math SVG dimensions disagree with metrics');
  }
  const hadFocusable = svg.hasAttribute('focusable');
  const width = slot ? slot.getAttribute('width') : `${widthEm}em`;
  const height = slot ? slot.getAttribute('height') : `${heightEm}em`;
  if (!width || !height) throw new Error('Math slot dimensions missing');
  if (slot) {
    if (!numeric.test(width) || !numeric.test(height) || Number(width) <= 0 || Number(height) <= 0 ||
        !Number.isFinite(Number(width)) || !Number.isFinite(Number(height)) ||
        Number(width) + 0.5 < widthEm * 14 || Number(height) + 0.5 < heightEm * 14) {
      throw new Error('Math slot is smaller than reserved geometry');
    }
  }
  const insertedWidth = slot ? String(Number(width)) : width;
  const insertedHeight = slot ? String(Number(height)) : height;
  if ([String(Number(width.replace(/em$/, ''))), String(Number(height.replace(/em$/, ''))), String(-depthEm)]
      .some(value => value.length > MATH_INSERTION_NUMBER_CHARS)) throw new Error('Math numeric attribute limit exceeded');
  svg.setAttribute('width', insertedWidth);
  svg.setAttribute('height', insertedHeight);
  if (slot) {
    svg.setAttribute('x', '0');
    svg.setAttribute('y', '0');
    svg.setAttribute('data-vs-generated', '');
  } else {
    // Trusted normalized metrics own prose baseline independent of font ex/em.
    (svg as SVGElement).style.verticalAlign = `${-depthEm}em`;
  }
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  const style = svg.getAttribute('style') ?? '';
  const changedBytes = utf8.encode(insertedWidth).length - utf8.encode(oldWidth).length +
    utf8.encode(insertedHeight).length - utf8.encode(oldHeight).length +
    utf8.encode(`${slot ? ' x="0" y="0" data-vs-generated=""' : ` style="${xmlEscape(style)}"`} aria-hidden="true"${hadFocusable ? '' : ' focusable="false"'}`).length;
  const charged = insertedMathCost(conversion);
  if (changedBytes > MATH_INSERTION_ATTRIBUTE_BYTES || charged.svgBytes > MATH_LIMITS.expressionSvgBytes) {
    throw new Error('Math insertion attribute limit exceeded');
  }
  return { svg, ...charged };
}

function isNative(node: Element): boolean { return node.namespaceURI === SVG_NS && node.hasAttribute('data-vs-math-native'); }

function syncNativeFigures(nodes: readonly Element[]): void {
  const figures = new Set<Element>();
  for (const node of nodes) {
    if (isNative(node)) {
      const figure = node.closest('[data-vs-math-figure]');
      if (figure) figures.add(figure);
    }
  }
  for (const figure of figures) {
    const slots = Array.from(figure.querySelectorAll('[data-vs-math-native][data-vs-math-key]'));
    if (slots.length && slots.every(slot => slot.hasAttribute('data-vs-math-rendered'))) figure.setAttribute('data-vs-math-ready', '');
    else figure.removeAttribute('data-vs-math-ready');
  }
}

function placeholders(root: Root): Element[] {
  const nodes = Array.from(root.querySelectorAll('[data-vs-math-key]'));
  if (root instanceof Element && root.hasAttribute('data-vs-math-key')) nodes.unshift(root);
  return nodes;
}

function owner(root: Root): Document { return root instanceof Document ? root : root.ownerDocument; }

function stillInRoot(root: Root, node: Element): boolean {
  return root === node || root.contains(node);
}

// One document owns one worker at a time, including the time spent inserting
// its batch. Viewer copies queue behind the page rather than spawning in bulk.
async function inDocumentQueue<T>(doc: Document, work: () => Promise<T>): Promise<T> {
  const previous = documentWork.get(doc) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const current = previous.then(() => gate);
  documentWork.set(doc, current);
  await previous;
  try { return await work(); }
  finally {
    release();
    if (documentWork.get(doc) === current) documentWork.delete(doc);
  }
}

function ensureSource(node: Element, expression: MathExpressionRecord): void {
  let source = node.querySelector(':scope > .vs-math-source');
  if (!source) {
    source = owner(node).createElement('span');
    source.className = 'vs-math-source';
    source.textContent = expression.display ? `$$\n${expression.tex}\n$$` : `$${expression.tex}$`;
    node.append(source);
  }
}

function notice(node: Element, message: string): void {
  if (node.namespaceURI === SVG_NS) return; // The figure's full list is its source fallback.
  let target = node.querySelector(':scope > .vs-math-notice');
  if (!target) {
    target = owner(node).createElement('span');
    target.className = 'vs-math-notice';
    target.setAttribute('data-vs-generated', '');
    node.append(target);
  }
  target.textContent = message;
}

const inlineScrollObservers = new WeakMap<Document, ResizeObserver>();
const inlineScrollProxies = new WeakSet<Element>();

function updateInlineScroller(visual: HTMLElement): void {
  const depth = visual.style.getPropertyValue('--vs-math-baseline');
  // An overflow box's baseline is its bottom border. Include a non-overlay
  // scrollbar so the glyph baseline still follows the validated depth metric.
  const scrollbar = Math.max(0, visual.offsetHeight - visual.clientHeight);
  visual.style.verticalAlign = `calc(${depth} - ${scrollbar}px)`;
  if (visual.clientWidth > 0 && visual.scrollWidth > visual.clientWidth) {
    let control = visual.parentElement?.closest('a[href], summary, button:not([disabled]), [tabindex]') ?? null;
    while (control && (control as HTMLElement).tabIndex < 0) {
      control = control.parentElement?.closest('a[href], summary, button:not([disabled]), [tabindex]') ?? null;
    }
    if (control && visual.ownerDocument.activeElement !== visual) {
      const proxy = control;
      // Keep links and disclosure summaries as the single keyboard stop.
      visual.setAttribute('aria-hidden', 'true');
      visual.removeAttribute('tabindex');
      visual.removeAttribute('role');
      visual.removeAttribute('aria-label');
      if (!inlineScrollProxies.has(proxy)) {
        inlineScrollProxies.add(proxy);
        proxy.addEventListener('keydown', event => {
          const key = event as KeyboardEvent;
          if (key.target !== proxy || key.altKey || key.ctrlKey || key.metaKey || !['ArrowLeft', 'ArrowRight'].includes(key.key)) return;
          const candidates = [...proxy.querySelectorAll<HTMLElement>('.vs-math-visual')];
          if (key.key === 'ArrowLeft') candidates.reverse();
          const scroller = candidates.find(item => item.clientWidth > 0 &&
            (key.key === 'ArrowRight' ? item.scrollWidth - item.clientWidth - item.scrollLeft > 0.5 : item.scrollLeft > 0));
          if (!scroller) return;
          key.preventDefault();
          scroller.scrollLeft += (key.key === 'ArrowRight' ? 1 : -1) * scroller.clientWidth / 2;
        });
      }
      return;
    }
    visual.removeAttribute('aria-hidden');
    visual.setAttribute('tabindex', '0');
    visual.setAttribute('role', 'group');
    visual.setAttribute('aria-label', 'Equation; scroll horizontally');
  } else {
    // Do not hide the current focus from assistive technology during resize.
    // Its blur handler removes the temporary stop once focus moves normally.
    if (visual.ownerDocument.activeElement === visual) return;
    visual.setAttribute('aria-hidden', 'true');
    visual.removeAttribute('tabindex');
    visual.removeAttribute('role');
    visual.removeAttribute('aria-label');
  }
}

function installInlineScroller(visual: HTMLElement, svg: SVGElement): void {
  visual.style.setProperty('--vs-math-baseline', svg.style.verticalAlign);
  visual.addEventListener('blur', () => updateInlineScroller(visual));
  updateInlineScroller(visual);
  const doc = visual.ownerDocument;
  const Observer = doc.defaultView?.ResizeObserver;
  if (!Observer) return;
  let observer = inlineScrollObservers.get(doc);
  if (!observer) {
    observer = new Observer(entries => {
      for (const entry of entries) updateInlineScroller(entry.target as HTMLElement);
    });
    inlineScrollObservers.set(doc, observer);
    const Mutation = doc.defaultView?.MutationObserver;
    if (Mutation) {
      const resize = observer;
      new Mutation(records => {
        const visuals = new Set<HTMLElement>();
        for (const record of records) for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeType !== 1) continue;
          const element = node as HTMLElement;
          if (element.matches('.vs-math-visual')) visuals.add(element);
          for (const child of element.querySelectorAll<HTMLElement>('.vs-math-visual')) visuals.add(child);
        }
        for (const item of visuals) {
          if (!item.isConnected) resize.unobserve(item);
          else if (item.style.getPropertyValue('--vs-math-baseline')) {
            updateInlineScroller(item);
            resize.observe(item);
          }
        }
      }).observe(doc, { childList: true, subtree: true });
    }
  }
  if (visual.isConnected) observer.observe(visual);
}

function updateCopyState(button: Element, state: 'ready' | 'copied' | 'unavailable'): void {
  const label = state === 'copied' ? 'Copied LaTeX' : state === 'unavailable' ? 'Copy unavailable' : 'Copy LaTeX source';
  button.setAttribute('data-vs-copy-state', state);
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  const status = button.querySelector('[role="status"]');
  if (status) status.textContent = state === 'ready' ? '' : label;
}

function installCopy(root: Root, records: Map<string, MathExpressionRecord>): void {
  copyRecords.set(root, records);
  if (listeners.has(root)) return;
  listeners.add(root);
  root.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button[data-vs-math-copy]');
    if (!button || !root.contains(button)) return;
    const node = button.closest('[data-vs-math-key]');
    const expression = copyRecords.get(root)?.get(node?.getAttribute('data-vs-math-key') ?? '');
    if (!expression) return;
    event.stopPropagation();
    void (async () => {
      try {
        const clipboard = owner(root).defaultView?.navigator.clipboard;
        if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
        await clipboard.writeText(expression.tex);
        updateCopyState(button, 'copied');
      } catch { updateCopyState(button, 'unavailable'); }
    })();
  });
}

function documentCost(root: Root): Cost {
  const total = { ...EMPTY };
  const doc = owner(root);
  const inDocument = root === doc || doc.contains(root);
  const counted = placeholders(inDocument ? doc : root);
  // Detached viewer fragments are still bounded, and attached viewer copies
  // count against every other math occurrence in the same document.
  if (!inDocument) counted.push(...placeholders(doc));
  for (const node of counted) {
    total.occurrences++;
    if (node.hasAttribute('data-vs-math-rendered')) {
      total.svgBytes += Number(node.getAttribute('data-vs-math-svg-bytes') ?? 0);
      total.elementCount += Number(node.getAttribute('data-vs-math-elements') ?? 0);
    }
  }
  return total;
}

function withinDocumentBudget(cost: Cost): boolean {
  return cost.occurrences <= MATH_LIMITS.documentOccurrences && cost.svgBytes <= MATH_LIMITS.documentSvgBytes && cost.elementCount <= MATH_LIMITS.documentElements;
}

function runBatch(worker: Worker, id: number, items: MathWorkItem[]): Promise<MathWorkResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Math conversion timed out')); }, 2000);
    worker.onmessage = (event: MessageEvent<MathWorkResponse>) => {
      clearTimeout(timer);
      if (event.data?.id !== id || !Array.isArray(event.data.results)) reject(new Error('Invalid math worker response'));
      else resolve(event.data);
    };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Math worker failed')); };
    worker.postMessage({ id, items } satisfies MathWorkRequest);
  });
}

async function initialize(root: Root, workerSource: string, records: readonly MathExpressionRecord[]): Promise<MathRuntimeStatus> {
  const status = { rendered: 0, failed: 0, skipped: 0 };
  const table = new Map(records.map(record => [record.key, record]));
  installCopy(root, table);
  const all = placeholders(root);
  syncNativeFigures(all);
  const fresh = all.filter(node => !node.hasAttribute('data-vs-math-rendered'));
  status.skipped = all.length - fresh.length;
  if (!fresh.length) return status;
  if (!withinDocumentBudget(documentCost(root))) {
    for (const node of fresh) { notice(node, 'Math document limit exceeded; source remains available.'); status.failed++; }
    return status;
  }
  const grouped = new Map<string, Element[]>();
  for (const node of fresh) {
    if (node.namespaceURI === SVG_NS && !isNative(node)) { status.failed++; continue; }
    const key = node.getAttribute('data-vs-math-key') ?? '';
    const expression = table.get(key);
    if (!expression || typeof expression.tex !== 'string' || typeof expression.display !== 'boolean') {
      notice(node, 'Math expression unavailable; source remains available.'); status.failed++; continue;
    }
    if (!isNative(node)) ensureSource(node, expression);
    const group = grouped.get(key) ?? [];
    group.push(node); grouped.set(key, group);
  }
  if (!grouped.size) return status;
  if (!workerSource || typeof Worker === 'undefined' || typeof URL.createObjectURL !== 'function') {
    for (const group of grouped.values()) for (const node of group) { notice(node, 'Math renderer unavailable; source remains available.'); status.failed++; }
    return status;
  }
  let url = '';
  let worker: Worker | undefined;
  try {
    url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    worker = new Worker(url);
    const keys = [...grouped.keys()];
    for (let start = 0; start < keys.length; start += 20) {
      const batchKeys = keys.slice(start, start + 20);
      const items = batchKeys.map(key => ({ key, tex: table.get(key)!.tex, display: table.get(key)!.display }));
      const response = await runBatch(worker, start / 20, items);
      if (response.results.length !== items.length || new Set(response.results.map(result => result.key)).size !== items.length ||
          response.results.some(result => !batchKeys.includes(result.key))) throw new Error('Math worker response did not match request');
      const byKey = new Map(response.results.map(result => [result.key, result]));
      for (const key of batchKeys) {
        const group = grouped.get(key)!;
        const result = byKey.get(key);
        if (!result?.conversion || result.error) {
          for (const node of group) { notice(node, 'Math conversion failed; source remains available.'); status.failed++; }
          continue;
        }
        for (const node of group) {
          try {
            if (!stillInRoot(root, node)) { status.skipped++; continue; }
            const native = isNative(node);
            const rendered = checkedSvg(result.conversion, table.get(key)!, owner(node), native ? node : undefined);
            // Other roots may have completed a worker batch while this one awaited
            // its response. Recount immediately before insertion so their output
            // and this candidate share one document budget.
            const current = documentCost(root);
            const next = { occurrences: current.occurrences, svgBytes: current.svgBytes + rendered.svgBytes, elementCount: current.elementCount + rendered.elementCount };
            if (!withinDocumentBudget(next)) throw new Error('Math document output limit exceeded');
            if (native) {
              node.append(rendered.svg);
            } else {
              const visual = owner(node).createElement('span');
              visual.className = 'vs-math-visual';
              visual.setAttribute('data-vs-generated', '');
              visual.setAttribute('aria-hidden', 'true');
              visual.append(rendered.svg);
              node.append(visual);
              if (!node.classList.contains('vs-math-display')) installInlineScroller(visual, rendered.svg as SVGElement);
              const button = owner(node).createElement('button');
              button.setAttribute('type', 'button');
              button.setAttribute('data-vs-math-copy', '');
              button.setAttribute('data-vs-generated', '');
              const icon = owner(node).createElement('span');
              icon.className = 'vs-math-copy-icon';
              icon.setAttribute('aria-hidden', 'true');
              const status = owner(node).createElement('span');
              status.className = 'vs-math-copy-status';
              status.setAttribute('role', 'status');
              button.append(icon, status);
              updateCopyState(button, 'ready');
              node.append(button);
            }
            node.setAttribute('data-vs-math-svg-bytes', String(rendered.svgBytes));
            node.setAttribute('data-vs-math-elements', String(rendered.elementCount));
            node.setAttribute('data-vs-math-rendered', '');
            if (native) syncNativeFigures([node]);
            status.rendered++;
          } catch {
            notice(node, 'Math conversion could not be inserted; source remains available.'); status.failed++;
          }
        }
      }
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  } catch {
    for (const group of grouped.values()) for (const node of group) {
      if (!node.hasAttribute('data-vs-math-rendered') && !node.querySelector(':scope > .vs-math-notice')) {
        notice(node, 'Math renderer unavailable; source remains available.'); status.failed++;
      }
    }
  } finally {
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
    syncNativeFigures(all);
  }
  return status;
}

/** Convert explicit math placeholders, preserving source, targets, and listeners. */
export function initializeMath(root: Root, workerSource: string, expressions: readonly MathExpressionRecord[]): Promise<MathRuntimeStatus> {
  const active = pending.get(root);
  if (active) {
    const queued = rescans.get(root);
    if (queued) {
      queued.workerSource = workerSource;
      queued.expressions = expressions;
      return queued.task;
    }
    // A caller may have replaced the contents of a persistent viewer root
    // while its previous conversion was pending. Keep only its latest request.
    const rescan: Rescan = { workerSource, expressions, task: undefined as unknown as Promise<MathRuntimeStatus> };
    rescan.task = active.then(() => {
      rescans.delete(root);
      return initializeMath(root, rescan.workerSource, rescan.expressions);
    });
    rescans.set(root, rescan);
    return rescan.task;
  }
  const task = inDocumentQueue(owner(root), () => initialize(root, workerSource, expressions))
    .finally(() => pending.delete(root));
  pending.set(root, task);
  return task;
}
