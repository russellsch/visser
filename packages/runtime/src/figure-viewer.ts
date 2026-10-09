// A viewer owns presentation only: figures and canonical details are never cloned.
import { DOM } from '../../core/src/compiler/dom-contract.ts';
import { copyRichContent } from './rich-copy.ts';

type Point = { x: number; y: number };
export type ViewerHooks = {
  closeDetail(): void;
  clearTransient(): void;
  referenceMode(): boolean;
  setReferenceMode(on: boolean): void;
  escape(): boolean;
};
export class FigureViewer {
  dialog: HTMLDialogElement | undefined;
  figure: HTMLElement | undefined;
  private svg: SVGSVGElement | undefined;
  private placeholder: SVGSVGElement | undefined;
  private origin: HTMLElement | SVGElement | undefined;
  private originalBox: string | null = null;
  private box = [0, 0, 1, 1];
  private initial = [0, 0, 1, 1];
  private scroll = [0, 0];
  private articleOffset = 0;
  private homeBox = [0, 0, 1, 1];
  private pointerType = "";
  private viewportScroll = [0, 0];
  private pointers = new Map<number, Point>();
  private moved = false;
  private suppressUntil = 0;
  private previousRef = false;
  private lists: Array<{ node: Element; marker: Comment }> = [];
  private touchEntry = false;
  private remembered = new WeakMap<Element, { cx: number; cy: number; unitsPerPixel: number }>();
  private hooks: ViewerHooks;
  constructor(hooks: ViewerHooks) { this.hooks = hooks; }

  supported(figure: Element): boolean {
    if (innerWidth <= DOM.narrowMaxWidth && (document.documentElement.hasAttribute('data-vs-legacy-mobile') || new URLSearchParams(window.location.search).get('vs-legacy-mobile') === '1')) return false;
    return (figure.matches('.vs-graph, .vs-trace') || figure.getAttribute('data-vs-viewer-ready') === 'true') && !!figure.querySelector('.vs-viewport svg') && typeof HTMLDialogElement !== 'undefined' && 'showModal' in HTMLDialogElement.prototype;
  }
  get mouseInput(): boolean { return this.pointerType === "mouse"; }
  get active(): boolean { return !!this.figure; }
  get guardingEntry(): boolean { return this.touchEntry && !this.active; }
  register(): void {
    for (const figure of Array.from(document.querySelectorAll<HTMLElement>('figure.vs-figure'))) {
      if (!this.supported(figure) || figure.classList.contains('vs-viewer-capable')) continue;
      figure.classList.add('vs-viewer-capable');
      const open = this.control('Explore full diagram', () => this.open(figure, open));
      open.classList.add('vs-viewer-open');
      figure.querySelector('.vs-viewport')?.after(open);
    }
  }
  init(): void {
    this.register();
    document.addEventListener('pointerdown', e => {
      this.pointerType = e.pointerType;
      if (this.active) return;
      this.touchEntry = e.pointerType === 'touch' && innerWidth <= DOM.narrowMaxWidth && !!(e.target instanceof Element && e.target.closest('.vs-viewer-capable .vs-viewport'));
    }, true);
    document.addEventListener('pointercancel', () => { this.touchEntry = false; }, true);
    document.addEventListener('click', e => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (this.active) {
        if (this.dialog?.contains(target) && performance.now() < this.suppressUntil && !target.closest('.vs-viewer-tools, .vs-inspector, #vs-refpanel')) { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      const figure = target.closest<HTMLElement>('.vs-viewer-capable');
      const enter = this.touchEntry || ('pointerType' in e && e.pointerType === 'touch');
      this.touchEntry = false;
      if (!figure || !target.closest('.vs-viewport') || !enter || innerWidth > DOM.narrowMaxWidth || this.hooks.referenceMode() || figure.classList.contains('vs-view-list') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || getSelection()?.toString()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.open(figure, figure.querySelector<HTMLElement>('.vs-viewer-open') ?? figure);
    }, true);
    addEventListener('resize', () => { if (innerWidth > DOM.narrowMaxWidth) this.close(); else this.resizeCanvas(); });
    addEventListener('beforeprint', () => this.close());
  }
  private control(label: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'vs-btn'; b.textContent = label; b.addEventListener('click', action); return b;
  }
  open(figure: HTMLElement, origin: HTMLElement | SVGElement): void {
    if (this.active || !this.supported(figure)) return;
    this.hooks.closeDetail(); this.hooks.clearTransient();
    this.previousRef = this.hooks.referenceMode();
    this.figure = figure; this.origin = origin; this.scroll = [scrollX, scrollY]; this.articleOffset = figure.getBoundingClientRect().top;
    const svg = figure.querySelector<SVGSVGElement>('.vs-viewport svg')!; this.svg = svg;
    this.originalBox = svg.getAttribute('viewBox');
    const b = svg.viewBox.baseVal;
    this.initial = [b.x, b.y, b.width || svg.width.baseVal.value, b.height || svg.height.baseVal.value]; this.box = [...this.initial];
    const viewport = svg.parentElement!; this.viewportScroll = [viewport.scrollLeft, viewport.scrollTop];
    const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    placeholder.setAttribute('width', '100%'); placeholder.setAttribute('height', String(figure.getBoundingClientRect().height)); placeholder.setAttribute('aria-hidden', 'true'); placeholder.classList.add('vs-viewer-placeholder');
    figure.before(placeholder); this.placeholder = placeholder;
    const dialog = document.createElement('dialog'); this.dialog = dialog; dialog.className = 'vs-figure-viewer'; dialog.setAttribute('aria-label', `Explore ${figure.getAttribute(DOM.attr.label) ?? 'diagram'}`);
    const tools = document.createElement('div'); tools.className = 'vs-viewer-tools'; tools.setAttribute(DOM.attr.generated, '');
    const title = document.createElement('strong'); title.className = 'vs-viewer-title';
    const fallbackTitle = figure.getAttribute(DOM.attr.label) ?? 'Diagram';
    title.textContent = fallbackTitle;
    const back = this.control('Back', () => this.close()); back.setAttribute('aria-label', 'Back to article');
    const ref = this.control('Reference mode', () => { this.hooks.setReferenceMode(!this.hooks.referenceMode()); ref.setAttribute('aria-pressed', String(this.hooks.referenceMode())); }); ref.setAttribute('aria-pressed', String(this.previousRef));
    const menu = document.createElement('details'); menu.className = 'vs-viewer-menu';
    const menuLabel = document.createElement('summary'); menuLabel.textContent = 'Tools';
    const actions = document.createElement('div'); actions.className = 'vs-viewer-actions';
    actions.append(this.control('Zoom in', () => this.zoom(0.8)), this.control('Zoom out', () => this.zoom(1.25)), this.control('Reset view', () => { this.box = [...this.homeBox]; this.render(); }), ref);
    menu.append(menuLabel, actions); tools.append(title, back, menu);
    const parts = document.createElement('details'); parts.className = 'vs-viewer-parts';
    const summary = document.createElement('summary'); summary.textContent = 'Diagram text and relationships'; parts.append(summary);
    for (const node of Array.from(figure.querySelectorAll('.vs-lists, .vs-glossary-wrap'))) { const marker = document.createComment('viewer list'); node.before(marker); this.lists.push({node, marker}); parts.append(node); }
    const hint = document.createElement('p'); hint.className = 'vs-viewer-hint'; hint.textContent = 'Pinch to zoom · Drag to pan'; hint.setAttribute(DOM.attr.generated, '');
    figure.classList.add('vs-in-viewer'); dialog.append(tools, hint, figure, parts); document.body.append(dialog);
    const caption = figure.querySelector(':scope > figcaption');
    if (caption?.textContent?.trim()) void copyRichContent(caption, title).catch(() => { title.textContent = fallbackTitle; });
    dialog.addEventListener('cancel', e => { e.preventDefault(); if (!this.hooks.escape()) this.close(); });
    dialog.showModal(); back.focus({preventScroll: true});
    // Start at readable SVG units instead of shrinking an entire wide graph.
    const bounds = svg.getBoundingClientRect();
    this.homeBox = [this.initial[0]!, this.initial[1]!, bounds.width || this.initial[2]!, bounds.height || this.initial[3]!];
    const saved = this.remembered.get(figure);
    this.box = saved ? this.restoreView(saved) : [...this.homeBox];
    this.gestures(svg); this.render();
  }
  private savedView(): { cx: number; cy: number; unitsPerPixel: number } {
    return {cx: this.box[0]! + this.box[2]! / 2, cy: this.box[1]! + this.box[3]! / 2, unitsPerPixel: this.box[2]! / this.homeBox[2]!};
  }
  private restoreView(saved: { cx: number; cy: number; unitsPerPixel: number }): number[] {
    const width = this.homeBox[2]! * saved.unitsPerPixel, height = this.homeBox[3]! * saved.unitsPerPixel;
    return [saved.cx - width / 2, saved.cy - height / 2, width, height];
  }
  private resizeCanvas(): void {
    if (!this.svg) return;
    const saved = this.savedView(), bounds = this.svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.homeBox = [this.initial[0]!, this.initial[1]!, bounds.width, bounds.height];
    this.box = this.restoreView(saved); this.render();
  }
  private render(): void { this.svg?.setAttribute('viewBox', this.box.join(' ')); }
  private zoom(factor: number, x = 0.5, y = 0.5): void {
    const width = this.box[2]! * factor;
    const fitWidth = Math.max(this.initial[2]!, this.initial[3]! * this.box[2]! / this.box[3]!, this.homeBox[2]!);
    if (width < this.homeBox[2]! / 8 || width > fitWidth * 2) return;
    this.box = [this.box[0]! + this.box[2]! * x * (1 - factor), this.box[1]! + this.box[3]! * y * (1 - factor), width, this.box[3]! * factor]; this.render();
  }
  private gestureAbort: AbortController | undefined;
  private gestures(svg: SVGSVGElement): void {
    const abort = new AbortController(); this.gestureAbort = abort; const options = {signal: abort.signal};
    const centre = (points: Point[]) => ({x: points.reduce((n,p)=>n+p.x,0)/points.length, y: points.reduce((n,p)=>n+p.y,0)/points.length});
    svg.addEventListener('pointerdown', e => { if(e.button !== 0) return; if (!this.pointers.size) this.moved = false; this.pointers.set(e.pointerId, {x:e.clientX,y:e.clientY}); if (this.pointers.size > 1) { this.moved = true; this.suppressUntil = performance.now()+500; } }, options);
    svg.addEventListener('pointermove', e => {
      const previous = this.pointers.get(e.pointerId); if (!previous) return;
      const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
      if (!this.moved && this.pointers.size === 1 && Math.hypot(dx,dy) < 6) return;
      const before = [...this.pointers.values()]; this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); const after = [...this.pointers.values()];
      this.moved = true; this.suppressUntil = performance.now()+500; svg.setPointerCapture(e.pointerId); e.preventDefault();
      const rect = svg.getBoundingClientRect(), old = centre(before), now = centre(after);
      const matrix = svg.getScreenCTM();
      const scale = matrix?.a || rect.width / this.box[2]!;
      const anchorX = matrix ? (old.x - matrix.e) / scale : this.box[0]! + (old.x-rect.left)/scale;
      const anchorY = matrix ? (old.y - matrix.f) / scale : this.box[1]! + (old.y-rect.top)/scale;
      if (before.length === 2) { const distance = (p: Point[]) => Math.hypot(p[0]!.x-p[1]!.x,p[0]!.y-p[1]!.y); const d = distance(after); if(d > 0) this.zoom(distance(before)/d, (anchorX-this.box[0]!)/this.box[2]!, (anchorY-this.box[1]!)/this.box[3]!); }
      this.box[0]! -= (now.x-old.x)/scale; this.box[1]! -= (now.y-old.y)/scale; this.render();
    }, options);
    const end = (e: PointerEvent) => { this.pointers.delete(e.pointerId); if(this.moved) this.suppressUntil=performance.now()+500; };
    svg.addEventListener('pointerup', end, options); svg.addEventListener('pointercancel', end, options); svg.addEventListener('lostpointercapture', end, options);
  }
  revealTarget(target: Element | undefined, sheet: HTMLElement): void {
    const fromList = Boolean(target?.closest('.vs-viewer-parts'));
    const id = target?.getAttribute(DOM.attr.target);
    target = id && this.svg ? Array.from(this.svg.querySelectorAll(`[${DOM.attr.target}]`)).find(node => node.getAttribute(DOM.attr.target) === id && !node.closest('[hidden]')) : undefined;
    if (!target || !this.svg || (sheet.classList.contains('vs-sheet-expanded') && !fromList)) return;
    // Following a text-list link may have scrolled the dialog below its canvas.
    // Bring the canvas back, then use drawn geometry without changing zoom.
    if (fromList && this.dialog) {
      const header = this.dialog.querySelector('.vs-viewer-tools')!.getBoundingClientRect();
      this.dialog.scrollTop += this.svg.getBoundingClientRect().top - header.bottom;
    }
    const bounds = target.getBoundingClientRect(), cover = sheet.getBoundingClientRect();
    const scale = this.svg.getScreenCTM()?.a;
    if (scale && fromList) {
      const canvas = this.svg.getBoundingClientRect();
      const header = this.dialog?.querySelector('.vs-viewer-tools')?.getBoundingClientRect();
      const left = canvas.left + 12, right = canvas.right - 12;
      const top = Math.max(canvas.top, header?.bottom ?? canvas.top) + 12;
      const bottom = Math.min(canvas.bottom, cover.top) - 12;
      const offset = (start: number, end: number, low: number, high: number) =>
        end - start > high - low ? (start + end - low - high) / 2 : start < low ? start - low : end > high ? end - high : 0;
      if (right > left && bottom > top) {
        this.box[0]! += offset(bounds.left, bounds.right, left, right) / scale;
        this.box[1]! += offset(bounds.top, bounds.bottom, top, bottom) / scale;
        this.render();
      }
    } else if (scale && bounds.bottom > cover.top && bounds.top < cover.bottom) {
      this.box[1]! += (bounds.bottom - cover.top + 12) / scale;
      this.render();
    }
  }
  close(): void {
    if (!this.figure) return;
    this.remembered.set(this.figure, this.savedView());
    this.hooks.closeDetail(); this.hooks.clearTransient(); this.hooks.setReferenceMode(this.previousRef);
    this.gestureAbort?.abort(); this.pointers.clear();
    if (this.svg) { if (this.originalBox === null) this.svg.removeAttribute('viewBox'); else this.svg.setAttribute('viewBox', this.originalBox); }
    for(const {node,marker} of this.lists) marker.replaceWith(node); this.lists=[];
    this.figure.classList.remove('vs-in-viewer'); this.placeholder?.replaceWith(this.figure);
    const viewport = this.svg?.parentElement; if(viewport) {viewport.scrollLeft=this.viewportScroll[0]!;viewport.scrollTop=this.viewportScroll[1]!;}
    this.dialog?.close(); this.dialog?.remove();
    const restoredY = window.scrollY + this.figure.getBoundingClientRect().top - this.articleOffset;
    this.dialog=undefined; this.figure=undefined; this.svg=undefined;
    window.scrollTo(this.scroll[0]!, restoredY); this.origin?.focus({preventScroll:true}); this.origin=undefined;
  }
}
