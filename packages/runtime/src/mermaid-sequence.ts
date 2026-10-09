// Hooks into the fingerprinted Mermaid sequence artifact. Bindings belong to
// DB actor objects, never label text or a module-global current diagram.
// Actor, message, note, loop and title geometry is implemented. Sequence
// remains guarded until source validation and export integration are complete.
import { isSequenceLoopHeader, prepareSequenceLoops } from './mermaid-sequence-loop.ts';
import { prepareSequenceTitles } from './mermaid-sequence-title.ts';
import { isSequenceArrow, prepareSequenceMessages } from './mermaid-sequence-message.ts';
import { measureMermaidLabel, type MeasuredMermaidLabel } from './mermaid-label.ts';

/** Source classes cannot impersonate reader controls or highlighting state.
 * Called after native coercion/header suffixing, before SVG creation/measurement.
 * The DB and every non-toolkit class token remain unchanged.
 */
export function sequenceActorClasses(classes: string): string {
  return classes.replace(/(^|[\t\n\f\r ])(vs-[^\t\n\f\r ]+)/g, '$1mermaid-authored-$2');
}

type Actor = { box?: {name?: string; wrap?: boolean}; name: string; description: string; type: string; wrap?: boolean };
type NoteMessage = {id: string; type: number; message: string; wrap?: boolean; placement?: number;
  from?: string; to?: string; noteModel?: NoteModel};
type NoteModel = {width: number; startx: number; starty: number; message: string};
type Selection = { node(): SVGElement };
type ActorBinding = {
  svg: SVGSVGElement; key: string; text: string; label: MeasuredMermaidLabel;
  expected: Set<string>; placed: Map<string, SVGElement>;
};
const bindings = new WeakMap<Actor, ActorBinding>();
const reservedActors = new WeakSet<Actor>();
type NoteBinding = {
  svg: SVGSVGElement; key: string; text: string; label: MeasuredMermaidLabel;
  expected: Set<string>; placed: Map<string, SVGElement>;
};
const noteBindings = new WeakMap<NoteMessage, NoteBinding>();
const noteModels = new WeakMap<NoteModel, NoteBinding>();
const reservedNotes = new WeakSet<NoteMessage>();
const types = new Set(['actor', 'participant', 'boundary', 'control', 'entity', 'database', 'collections', 'queue']);

export function sequenceActorDimensions(actor: Actor): Readonly<{width: number; height: number}> | undefined {
  const label = bindings.get(actor)?.label;
  return label && { width: label.width, height: label.height };
}

/** Synchronous placement fixes the native actor handlers' unawaited labels. */
export function sequenceActorDraw(actor: Actor, footer: boolean) {
  const binding = bindings.get(actor);
  if (!binding) return undefined;
  return (text: string, selection: Selection, x: number, y: number, width: number, height: number) => {
    const copy = `${binding.key}:${footer ? 'footer' : 'header'}`;
    const parent = selection.node();
    if (text !== binding.text || !binding.expected.has(copy) || binding.placed.has(copy) ||
        (parent !== binding.svg && !binding.svg.contains(parent))) {
      throw new Error('Sequence actor math ownership changed during rendering');
    }
    const label = binding.label;
    if (![x,y,width,height].every(Number.isFinite) || width < label.width || height < label.height) {
      throw new Error('Sequence actor layout does not reserve its measured label');
    }
    const placed = label.place(parent, x + (width-label.width)/2, y + (height-label.height)/2);
    placed.setAttribute('data-vs-mermaid-label', copy);
    binding.placed.set(copy, placed);
  };
}

export function sequenceNoteDimensions(message: NoteMessage): Readonly<{width: number; height: number}> | undefined {
  const label = noteBindings.get(message)?.label;
  return label && {width: label.width, height: label.height};
}

/** Retain the exact DB message's model after native placement has been chosen. */
export function sequenceNoteModel(message: NoteMessage, model: NoteModel, placement: {LEFTOF: number; RIGHTOF: number; OVER: number},
  conf: {noteMargin: number}): void {
  const binding = noteBindings.get(message);
  if (!binding) return;
  if (noteModels.has(model) || model.message !== binding.text || !Number.isFinite(model.width) ||
      !Number.isFinite(model.startx) || !Number.isFinite(conf.noteMargin) || conf.noteMargin < 0) {
    throw new Error('Sequence note math model ownership changed');
  }
  const width = Math.max(model.width, binding.label.width + 2*conf.noteMargin);
  if (width > model.width) {
    const added = width - model.width;
    if (message.placement === placement.LEFTOF) model.startx -= added;
    else if (message.placement === placement.OVER) model.startx -= added/2;
    else if (message.placement !== placement.RIGHTOF) throw new Error('Sequence note math has unknown placement');
    model.width = width;
  }
  noteModels.set(model, binding);
  noteMargins.set(model, conf.noteMargin);
}

export function sequenceNoteHeight(model: NoteModel): number | undefined {
  return noteModels.get(model)?.label.height;
}

/** A measured note is placed once; native drawKatex/drawText never sees it. */
export function sequenceNoteDraw(model: NoteModel, selection: Selection, textObj: {text: string}): [] | undefined {
  const binding = noteModels.get(model);
  if (!binding) return undefined;
  const parent = selection.node();
  if (textObj.text !== binding.text || model.message !== binding.text || !binding.expected.has(binding.key) ||
      binding.placed.has(binding.key) || (parent !== binding.svg && !binding.svg.contains(parent))) {
    throw new Error('Sequence note math ownership changed during drawing');
  }
  const label = binding.label;
  if (![model.width, model.startx, model.starty].every(Number.isFinite) || model.width < label.width) {
    throw new Error('Sequence note layout does not reserve its measured label');
  }
  const placed = label.place(parent, model.startx + (model.width-label.width)/2, model.starty +
    // The native note rectangle has noteMargin padding on both sides.
    noteMargins.get(model)!);
  placed.setAttribute('data-vs-mermaid-label', binding.key);
  binding.placed.set(binding.key, placed);
  return [];
}

const noteMargins = new WeakMap<NoteModel, number>();

type Db = {
  getActors(): Map<string, Actor>;
  getMessages(): NoteMessage[];
  getBoxes(): {name?: string; wrap?: boolean}[];
  getActorKeys?(): string[];
  getDiagramTitle(): string;
  LINETYPE?: {NOTE: number};
};
type Draw = (source: string, id: string, version: string, diagram: {db: Db}) => Promise<unknown>;
// Config types here describe the pinned external renderer boundary.
type Config = { securityLevel?: string; sequence: {
  width: number; wrapPadding: number; mirrorActors?: boolean; hideUnusedParticipants?: boolean;
  actorFontFamily?: string; actorFontSize?: string | number; actorFontWeight?: string | number;
  labelBoxHeight: number; labelBoxWidth: number;
  actorMargin: number; boxTextMargin: number; boxMargin: number; rightAngles?: boolean;
  messageFontFamily?: string; messageFontSize?: string | number; messageFontWeight?: string | number;
  noteFontFamily?: string; noteFontSize?: string | number; noteFontWeight?: string | number; noteMargin: number;
} };

export function createSequenceDraw(original: Draw, getConfig: () => Config): Draw {
  return async (source, id, version, diagram) => {
    const db = diagram.db;
    const actors = db.getActors();
    const hasMath = (value: unknown) => typeof value === 'string' && value.includes('$$');
    const messages = db.getMessages();
    if (db.LINETYPE && db.LINETYPE.NOTE !== 2) throw new Error('Sequence note type contract changed');
    const noteType = db.LINETYPE?.NOTE ?? 2;
    // Fail closed while the remaining role adapters are being implemented.
    if (messages.filter(message => message.type !== noteType && !isSequenceArrow(message) && !isSequenceLoopHeader(message)).some(message => hasMath(message.message))) {
      throw new Error('Sequence math message type has no renderer');
    }
    const mathActors = [...actors].filter(([,actor]) => hasMath(actor.description));
    const mathNotes = messages.filter(message => message.type === noteType && hasMath(message.message));
    const mathMessages = messages.filter(message => isSequenceArrow(message) && hasMath(message.message));
    const hasLoops = messages.some(message => isSequenceLoopHeader(message) && hasMath(message.message));
    const hasTitles = hasMath(db.getDiagramTitle()) || db.getBoxes().some(box => hasMath(box.name));
    if (!mathActors.length && !mathNotes.length && !mathMessages.length && !hasTitles && !hasLoops) return original(source, id, version, diagram);
    const config = getConfig();
    if (config.securityLevel === 'sandbox') throw new Error('Sequence math requires the host SVG context');
    const svg = document.getElementById(id);
    if (!(svg instanceof SVGSVGElement) || !svg.isConnected) throw new Error('Sequence math SVG is unavailable');
    const conf = config.sequence;
    const used = new Set(messages.flatMap(message => [message.from, message.to]));
    const owned: Actor[] = [];
    const ownedNotes: NoteMessage[] = [];
    let completed = false;
    let loopScope: Awaited<ReturnType<typeof prepareSequenceLoops>> | undefined;
    let titleScope: Awaited<ReturnType<typeof prepareSequenceTitles>> | undefined;
    let messageScope: Awaited<ReturnType<typeof prepareSequenceMessages>> | undefined;
    try {
      // Claim identities before the first asynchronous measurement.
      for (const [,actor] of mathActors) {
        if (reservedActors.has(actor)) throw new Error('Sequence actor is already being rendered');
        reservedActors.add(actor);
        owned.push(actor);
      }
      for (const message of mathNotes) {
        if (reservedNotes.has(message) || !Number.isSafeInteger(Number(message.id)) ||
            message.id !== String(Number(message.id)) ||
            messages[Number(message.id)] !== message || typeof message.message !== 'string') {
          throw new Error('Sequence note has no original DB message identity');
        }
        reservedNotes.add(message);
        ownedNotes.push(message);
      }
      for (const [key,actor] of mathActors) {
        const text = actor.description;
        const visible = !conf.hideUnusedParticipants || used.has(key);
        if (visible && !types.has(actor.type)) throw new Error('Sequence math actor has no renderer');
        const expected = new Set<string>();
        if (visible) {
          expected.add(`actor:${key}:header`);
          if (conf.mirrorActors) expected.add(`actor:${key}:footer`);
        }
        const label = await measureMermaidLabel(svg, text, 'actor', {
          ...(actor.wrap ? {maxWidth: conf.width - 2*conf.wrapPadding} : {}),
          ...(conf.actorFontFamily ? {fontFamily: conf.actorFontFamily} : {}),
          ...(conf.actorFontSize ? {fontSize: typeof conf.actorFontSize === 'number' ? `${conf.actorFontSize}px` : conf.actorFontSize} : {}),
          ...(conf.actorFontWeight ? {fontWeight: String(conf.actorFontWeight)} : {}),
        });
        bindings.set(actor, {svg, key:`actor:${key}`, text, label, expected, placed:new Map()});
      }
      for (const message of mathNotes) {
        const label = await measureMermaidLabel(svg, message.message, 'noteText', {
          ...(message.wrap ? {maxWidth: conf.width - 2*conf.wrapPadding} : {}),
          ...(conf.noteFontFamily ? {fontFamily: conf.noteFontFamily} : {}),
          ...(conf.noteFontSize ? {fontSize: typeof conf.noteFontSize === 'number' ? `${conf.noteFontSize}px` : conf.noteFontSize} : {}),
          ...(conf.noteFontWeight ? {fontWeight: String(conf.noteFontWeight)} : {}),
        });
        const key = `message:${message.id}`;
        noteBindings.set(message, {svg, key, text:message.message, label,
          expected:new Set([key]), placed:new Map()});
      }
      const actorKeys = db.getActorKeys?.() ?? [...actors.keys()];
      titleScope = await prepareSequenceTitles(svg, db.getDiagramTitle(), db.getBoxes(), actors,
        conf.hideUnusedParticipants ? actorKeys.filter(key => used.has(key)) : actorKeys, conf);
      messageScope = await prepareSequenceMessages(svg, messages, conf);
      loopScope = await prepareSequenceLoops(svg, messages, conf);
      const result = await original(source, id, version, diagram);
      messageScope.assertComplete();
      titleScope.assertComplete();
      loopScope.assertComplete();
      for (const actor of owned) {
        const binding = bindings.get(actor)!;
        if (binding.expected.size !== binding.placed.size || [...binding.placed].some(([key,node]) =>
          !svg.contains(node) || node.getAttribute('data-vs-mermaid-label') !== key)) {
          throw new Error('Sequence actor math copies are missing');
        }
      }
      for (const message of ownedNotes) {
        const binding = noteBindings.get(message)!;
        if (binding.expected.size !== binding.placed.size || [...binding.placed].some(([key,node]) =>
          !svg.contains(node) || node.getAttribute('data-vs-mermaid-label') !== key)) {
          throw new Error('Sequence note math copies are missing');
        }
      }
      completed = true;
      return result;
    } finally {
      messageScope?.dispose(completed);
      titleScope?.dispose(completed);
      loopScope?.dispose(completed);
      for (const actor of owned) {
        if (!completed) for (const node of bindings.get(actor)?.placed.values() ?? []) node.remove();
        bindings.delete(actor); reservedActors.delete(actor);
      }
      for (const message of ownedNotes) {
        const binding = noteBindings.get(message);
        if (!completed) for (const node of binding?.placed.values() ?? []) node.remove();
        if (message.noteModel) { noteModels.delete(message.noteModel); noteMargins.delete(message.noteModel); }
        noteBindings.delete(message); reservedNotes.delete(message);
      }
    }
  };
}
