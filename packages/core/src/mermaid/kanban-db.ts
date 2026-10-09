// Replay the state held by Mermaid's pinned Kanban DB.  Inputs have already
// passed through Mermaid's parser, sanitizer, and YAML decoder.
import { isDeepStrictEqual } from 'node:util';
import { MathPolicyError } from '../math/policy.ts';

export type KanbanDbNode = {
  id: string;
  level: number;
  label: unknown;
  width: number;
  padding: number;
  isGroup: false;
  parentId?: string;
  shape?: string;
  icon?: string;
  assigned?: string;
  ticket?: string;
  priority?: unknown;
  cssClasses?: string;
};

export type KanbanDbSnapshot = { nodes: KanbanDbNode[]; sections: KanbanDbNode[]; counter: number };

export type KanbanDbEffect =
  | { kind: 'node'; level: number; id: string; label: string; type: number; metadata?: unknown }
  // Only fields truthy BEFORE sanitation are present. Sanitized empty text
  // still overwrites the previous decoration in the native DB.
  | { kind: 'decoration'; icon?: string; class?: string };

export type KanbanDbOptions = { width: number; padding: number };

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `kanban DB replay: ${message}`);
}

function validateOptions(options: KanbanDbOptions): void {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      typeof options.width !== 'number' || !Number.isFinite(options.width) ||
      typeof options.padding !== 'number' || !Number.isFinite(options.padding)) {
    invalid('options must have finite width and padding');
  }
}

function validateEffect(effect: KanbanDbEffect, index: number): void {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) invalid(`effect ${index} must be an object`);
  if (effect.kind === 'node') {
    if (!Number.isFinite(effect.level) || !Number.isInteger(effect.level)) invalid(`node effect ${index} has an invalid level`);
    if (typeof effect.id !== 'string' || typeof effect.label !== 'string') invalid(`node effect ${index} has non-text id or label`);
    if (!Number.isInteger(effect.type) || effect.type < 0 || effect.type > 6) invalid(`node effect ${index} has an invalid type`);
    return;
  }
  if (effect.kind === 'decoration') {
    if (effect.icon !== undefined && typeof effect.icon !== 'string') invalid(`decoration effect ${index} has a non-text icon`);
    if (effect.class !== undefined && typeof effect.class !== 'string') invalid(`decoration effect ${index} has a non-text class`);
    return;
  }
  invalid(`effect ${index} has an unknown kind`);
}

/**
 * Replay addNode, getSection and decorateNode in their native call order.
 * The returned clone is detached while retaining native object aliases: a
 * section is the same node object in both arrays.
 */
export function replayKanbanDb(effects: readonly KanbanDbEffect[], options: KanbanDbOptions): KanbanDbSnapshot {
  if (!Array.isArray(effects)) invalid('effects must be an array');
  validateOptions(options);

  const nodes: KanbanDbNode[] = [];
  const sections: KanbanDbNode[] = [];
  let counter = 0;
  const nextId = (id: string): string => id || `kbn${counter++}`;
  const getSection = (level: number): KanbanDbNode | null => {
    if (nodes.length === 0) return null;
    const sectionLevel = nodes[0]!.level;
    let lastSection: KanbanDbNode | null = null;
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index]!;
      if (node.level === sectionLevel && !lastSection) lastSection = node;
      if (node.level < sectionLevel) {
        throw new Error(`Items without section detected, found section ("${node.label}")`);
      }
    }
    return level === lastSection?.level ? null : lastSection;
  };

  for (const [index, effect] of effects.entries()) {
    validateEffect(effect, index);
    if (effect.kind === 'decoration') {
      if (effect.icon !== undefined) nodes[nodes.length - 1]!.icon = effect.icon;
      if (effect.class !== undefined) nodes[nodes.length - 1]!.cssClasses = effect.class;
      continue;
    }

    let padding = options.padding;
    if (effect.type === 1 || effect.type === 2 || effect.type === 6) padding *= 2;
    const node: KanbanDbNode = {
      id: nextId(effect.id), level: effect.level, label: effect.label, width: options.width, padding, isGroup: false,
    };
    if (effect.metadata !== undefined) {
      // Deliberately retain native property access/coercion behavior. Metadata
      // is the trusted, decoded YAML document rather than source text.
      const document = effect.metadata as Record<string, unknown>;
      const shape = document.shape;
      if (shape && (shape !== (shape as { toLowerCase(): unknown }).toLowerCase() ||
          (shape as { includes(value: string): boolean }).includes('_'))) {
        throw new Error(`No such shape: ${shape}. Shape names should be lowercase.`);
      }
      if (document?.shape && document.shape === 'kanbanItem') node.shape = document.shape;
      if (document?.label) node.label = document.label;
      if (document?.icon) node.icon = document.icon.toString();
      if (document?.assigned) node.assigned = document.assigned.toString();
      if (document?.ticket) node.ticket = document.ticket.toString();
      if (document?.priority) node.priority = document.priority;
    }
    const section = getSection(effect.level);
    if (section) node.parentId = section.id || `kbn${counter++}`;
    else sections.push(node);
    nodes.push(node);
  }
  return structuredClone({ nodes, sections, counter });
}

export function reconcileKanbanDb(
  effects: readonly KanbanDbEffect[], options: KanbanDbOptions, nativeSnapshot: KanbanDbSnapshot,
): KanbanDbSnapshot {
  const replayed = replayKanbanDb(effects, options);
  if (!isDeepStrictEqual(replayed, nativeSnapshot)) invalid('native nodes, sections or counter differ');
  // Deep equality alone accepts duplicated objects in place of shared section
  // references or YAML aliases. Retain the complete native graph contract.
  const forward = new WeakMap<object, object>(), reverse = new WeakMap<object, object>();
  const pending: [unknown, unknown][] = [[replayed, nativeSnapshot]];
  while (pending.length) {
    const [left, right] = pending.pop()!;
    if (left === null || typeof left !== 'object') continue;
    if (right === null || typeof right !== 'object') invalid('native object graph differs');
    if (forward.has(left) || reverse.has(right)) {
      if (forward.get(left) !== right || reverse.get(right) !== left) invalid('native object aliases differ');
      continue;
    }
    forward.set(left, right); reverse.set(right, left);
    for (const key of Object.keys(left)) pending.push([
      (left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key],
    ]);
  }
  return structuredClone(nativeSnapshot);
}
