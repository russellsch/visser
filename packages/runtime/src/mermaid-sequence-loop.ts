// Measured source-owned sequence control-structure headers. This module is
// called only from the fingerprinted Mermaid 12 sequence renderer patch.
import { measureMermaidLabel, type MeasuredMermaidLabel } from './mermaid-label.ts';

type Message = { id: string; type: number; message: string; wrap?: boolean; width?: number };
type LoopModel = { title?: string; startx: number; stopx: number; starty: number; stopy: number;
  sectionTitles?: Message[]; sections?: { y: number; height: number }[] };
type Selection = { node(): SVGElement };
type TextObj = { text: string; x: number; y: number };
type Bounds = { bumpVerticalPos(amount: number): void; insert(x1: number, y1: number, x2: number, y2: number): void;
  getVerticalPos(): number; getBounds(): {bounds:{startx?:number;stopx?:number}} };
type Conf = { width: number; wrapPadding: number; boxMargin: number; boxTextMargin: number;
  labelBoxHeight: number; labelBoxWidth: number;
  messageFontFamily?: string; messageFontSize?: string | number; messageFontWeight?: string | number };
type Binding = { svg: SVGSVGElement; message: Message; text: string; key: string;
  raw: MeasuredMermaidLabel; decorated: MeasuredMermaidLabel; selected: MeasuredMermaidLabel;
  placed?: SVGElement; models: Set<LoopModel> };

const START = new Set([10, 12, 15, 19, 27, 30, 32]);
const BRANCH = new Set([13, 20, 28]);
const bindings = new WeakMap<Message, Binding>();
const models = new WeakMap<LoopModel, Binding>();
const reserved = new WeakSet<Message>();

/** Exact pinned LINETYPE values for loop/opt/alt/else/par/and/par_over/critical/option/break. */
export function isSequenceLoopHeader(message: {type?: unknown}): boolean {
  return typeof message.type === 'number' && (START.has(message.type) || BRANCH.has(message.type));
}

export async function prepareSequenceLoops(svg: SVGSVGElement, messages: readonly Message[], conf: Conf): Promise<{
  assertComplete(): void; dispose(success: boolean): void;
}> {
  if (!svg.isConnected) throw new Error('Sequence loop preparation requires an attached SVG');
  const pending: Message[] = [];
  try {
    for (const [index, message] of messages.entries()) {
      if (!isSequenceLoopHeader(message) || typeof message.message !== 'string' || !message.message.includes('$$')) continue;
      if (message.id !== String(index) || reserved.has(message)) throw new Error('Sequence loop has no original message identity');
      reserved.add(message);
      pending.push(message);
    }
    for (const message of pending) {
      const role = BRANCH.has(message.type) ? 'sectionTitle' : 'loopText';
      const options = {
        maxWidth: conf.width - 2*conf.wrapPadding,
        ...(conf.messageFontFamily ? {fontFamily: conf.messageFontFamily} : {}),
        ...(conf.messageFontSize ? {fontSize: typeof conf.messageFontSize === 'number' ? `${conf.messageFontSize}px` : conf.messageFontSize} : {}),
        ...(conf.messageFontWeight ? {fontWeight: String(conf.messageFontWeight)} : {}),
      };
      const raw = await measureMermaidLabel(svg, message.message, role, options);
      const decorated = await measureMermaidLabel(svg, `[${message.message}]`, role, options);
      bindings.set(message, {svg, message, text:message.message, key:`message:${message.id}`,
        raw, decorated, selected:raw, models:new Set()});
    }
  } catch (error) {
    for (const message of pending) { bindings.delete(message); reserved.delete(message); }
    throw error;
  }
  let disposed = false;
  return {
    assertComplete() {
      if (disposed) throw new Error('Sequence loop scope is disposed');
      for (const message of pending) {
        const binding = bindings.get(message);
        if (!binding?.placed || !svg.contains(binding.placed) ||
            binding.placed.getAttribute('data-vs-mermaid-label') !== binding.key) {
          throw new Error('Sequence loop math copy is missing');
        }
      }
    },
    dispose(success: boolean) {
      if (disposed) return;
      disposed = true;
      for (const message of pending) {
        const binding = bindings.get(message);
        if (binding) {
          if (!success) binding.placed?.remove();
          for (const model of binding.models) models.delete(model);
        }
        bindings.delete(message); reserved.delete(message);
      }
    },
  };
}

export function sequenceLoopDimensions(value: Message | LoopModel): Readonly<{width:number;height:number}> | undefined {
  const binding = bindings.get(value as Message) ?? models.get(value as LoopModel);
  const label = binding?.selected;
  return label && {width:label.width,height:label.height};
}

/** Bypass native TeX wrapping; reserve measured height before the next row. */
export function sequenceLoopAdvance(loopWidths: Record<string, {width:number}>, message: Message,
  preMargin: number, postMargin: number, addLoop: (message: Message) => void, bounds: Bounds, conf: Conf): boolean {
  const binding = bindings.get(message);
  if (!binding) return false;
  if (message.message !== binding.text || ![preMargin,postMargin,conf.boxTextMargin,conf.labelBoxHeight].every(Number.isFinite)) {
    throw new Error('Sequence loop source or layout changed before measurement');
  }
  bounds.bumpVerticalPos(preMargin);
  const parentWidth = loopWidths[message.id]?.width;
  binding.selected = parentWidth === undefined ? binding.raw : binding.decorated;
  if (parentWidth !== undefined) {
    if (!Number.isFinite(parentWidth) || parentWidth < 0) throw new Error('Sequence loop width is invalid');
    message.width = Math.max(parentWidth, binding.selected.width + conf.labelBoxWidth + 2*conf.boxTextMargin);
    message.wrap = true;
  }
  addLoop(message);
  bounds.bumpVerticalPos(postMargin + Math.max(binding.selected.height + conf.boxTextMargin, conf.labelBoxHeight));
  return true;
}

/** Attach the opening source message to its native model, never by text. */
export function bindSequenceLoopModel(message: Message, model: LoopModel): LoopModel {
  const binding = bindings.get(message);
  if (binding) {
    if (models.has(model) || model.title !== binding.text) throw new Error('Sequence loop model source changed');
    models.set(model, binding);
    binding.models.add(model);
  }
  return model;
}

/** Expand the completed frame and outer bounds for its widest math header. */
export function reserveSequenceLoopModel(model: LoopModel, bounds: Bounds, conf: Conf): void {
  const header = models.get(model);
  const sections = model.sectionTitles?.map(item => bindings.get(item)).filter((item): item is Binding => Boolean(item)) ?? [];
  if (!header && !sections.length) return;
  // An empty control structure never calls native bounds.insert(), leaving
  // its horizontal sides and bottom undefined. Prefer already measured actor
  // bounds. Actorless sequence diagrams are valid too: use the configured
  // default actor width around the diagram origin, then widen for this label.
  if (![model.startx,model.stopx,model.stopy].every(Number.isFinite)) {
    const actorBounds = bounds.getBounds().bounds;
    if (![model.starty,bounds.getVerticalPos(),conf.width,conf.boxMargin].every(Number.isFinite) ||
        conf.width <= 0 || conf.boxMargin < 0) {
      throw new Error('Sequence loop has no finite default bounds');
    }
    if (![model.startx,model.stopx].every(Number.isFinite)) {
      const hasActorBounds = [actorBounds.startx,actorBounds.stopx].every(Number.isFinite);
      model.startx = hasActorBounds ? actorBounds.startx! - conf.boxMargin : -conf.width/2;
      model.stopx = hasActorBounds ? actorBounds.stopx! + conf.boxMargin : conf.width/2;
    }
    if (!Number.isFinite(model.stopy)) model.stopy = bounds.getVerticalPos() + conf.boxMargin;
  }
  if (![model.startx,model.stopx,model.starty,model.stopy,conf.labelBoxWidth,conf.boxTextMargin].every(Number.isFinite) ||
      model.stopx < model.startx) throw new Error('Sequence loop has invalid completed bounds');
  const width = Math.max(header ? header.selected.width + conf.labelBoxWidth + 2*conf.boxTextMargin : 0,
    ...sections.map(section => section.selected.width + 2*conf.boxTextMargin));
  const delta = Math.max(0, width - (model.stopx-model.startx));
  if (delta) {
    model.startx -= delta/2;
    model.stopx += delta/2;
  }
  bounds.insert(model.startx, model.starty, model.stopx, model.stopy);
}

function place(binding: Binding, selection: Selection, text: TextObj): [] {
  const parent = selection.node();
  if (text.text !== binding.text || binding.placed || (parent !== binding.svg && !binding.svg.contains(parent)) ||
      ![text.x,text.y].every(Number.isFinite)) throw new Error('Sequence loop copy ownership changed');
  const label = binding.selected;
  const placed = label.place(parent, text.x-label.width/2, text.y);
  placed.setAttribute('data-vs-mermaid-label', binding.key);
  binding.placed = placed;
  return [];
}

export function drawSequenceLoopHeader(model: LoopModel, selection: Selection, text: TextObj): [] | undefined {
  const binding = models.get(model);
  return binding ? place(binding,selection,text) : undefined;
}
export function drawSequenceLoopSection(message: Message, selection: Selection, text: TextObj): [] | undefined {
  const binding = bindings.get(message);
  return binding ? place(binding,selection,text) : undefined;
}
