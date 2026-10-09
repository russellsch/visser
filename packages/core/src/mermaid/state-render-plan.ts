// Plan the pinned native state's visible label paths without reconstructing
// extraction or recovering source identity from displayed text.
import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, reserveMathOccurrences, type MathResourceTotal } from '../math/policy.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';
import type { Leaf, StateProvenanceResult, Value } from './state-provenance.ts';
import { addStateMathCosts, LocatedStateMathError, mapStateMathInput, maxStateMathCost, type StateMathRecord } from './state-math.ts';
import { validateMermaidMathLabel, type MermaidMathExpression, type MermaidMathText } from './math.ts';

type Native = Record<string, unknown>;
export type StateRenderExpression = MermaidMathExpression & {
  recordIndex: number;
  origins: readonly LocatedSourceInterval[];
  synthetic: boolean;
};
export type StateRenderSlot = Readonly<{
  key: string;
  ownerKind: 'node' | 'edge';
  ownerId: string;
  domId?: string;
  shape: string;
  role: 'label' | 'title' | 'body';
  inputPath: 'labelHelper' | 'createLabel' | 'edge';
  recordIndices: readonly number[];
  semanticValue: string;
  rendererInput: string;
  renderedValue: string;
  parts: readonly (MermaidMathText | StateRenderExpression)[];
}>;
export type StateRenderPlan = Readonly<{
  slots: readonly StateRenderSlot[];
  total: MathResourceTotal;
  recordCosts: ReadonlyMap<number, MathResourceTotal>;
}>;
const NO_LABEL = new Set(['stateStart', 'stateEnd', 'fork', 'join', 'choice']);
const identity = (value: ProvenanceText) => value;
function invalid(message: string): never { throw new MathPolicyError('E_MATH_INVALID', `state render plan: ${message}`); }
function scalar(value: Value | undefined): Leaf {
  if (!value || Array.isArray(value) || !('mapped' in value)) invalid('expected a source-owned scalar label');
  return value;
}
function array(value: Value | undefined): readonly Leaf[] {
  if (!Array.isArray(value)) invalid('expected description rows');
  return value.map(scalar);
}
function name(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) invalid(`missing native ${field}`);
  return value;
}

/** The native decoder restores sentinels, not arbitrary HTML references. */
export function mapStateLabelHelperInput(value: ProvenanceText, sanitize: (value: ProvenanceText) => ProvenanceText): ProvenanceText {
  return sanitize(value.replaceRegex(/ﬂ°°/g, () => '&#').replaceRegex(/ﬂ°/g, () => '&').replaceRegex(/¶ß/g, () => ';'));
}

export function planStateRenderCopies(
  original: string,
  provenance: StateProvenanceResult,
  authored: readonly StateMathRecord[],
  sanitize: (value: ProvenanceText) => ProvenanceText,
  initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
  options: { allowPlainUndefinedShape?: boolean } = {},
): StateRenderPlan {
  const coordinates = new MermaidSourceCoordinates(original);
  const baseline = new Map<number, MathResourceTotal>();
  const records = new Map(authored.map(record => [record.recordIndex, record]));
  for (const record of authored) {
    if (baseline.has(record.recordIndex)) invalid('duplicate authored ledger identity');
    baseline.set(record.recordIndex, addStateMathCosts(EMPTY_MATH_RESOURCE_TOTAL, record.cost));
  }
  const visible = new Map<number, MathResourceTotal>();
  const slots: StateRenderSlot[] = [];
  const keys = new Set<string>();
  let undefinedShape = false;

  const slot = (ownerKind: 'node' | 'edge', owner: Native, role: StateRenderSlot['role'],
    inputPath: StateRenderSlot['inputPath'], leaves: readonly Leaf[], shape: string): void => {
    const ownerId = name(owner.id, 'owner ID');
    const key = JSON.stringify([ownerKind, ownerId, role]);
    if (keys.has(key)) invalid('duplicate visible slot identity');
    keys.add(key);
    if (!leaves.length) return; // an empty native body creates no math
    const prepared = leaves.map(leaf => inputPath === 'labelHelper' ? mapStateLabelHelperInput(leaf.mapped, sanitize) : leaf.mapped);
    const mapped = prepared.map(value => mapStateMathInput(value, 'state.description', identity));
    const expected: StateRenderExpression[] = [];
    let offset = 0;
    for (const [index, value] of mapped.entries()) {
      const leaf = leaves[index]!;
      let checked;
      try { checked = validateMermaidMathLabel(value.text); }
      catch (error) {
        const record = leaf.recordIndices.length === 1 ? records.get(leaf.recordIndices[0]!) : undefined;
        if (error instanceof MathPolicyError && record) throw new LocatedStateMathError(error, record, `${inputPath} ${role}`);
        throw error;
      }
      for (const part of checked.parts) {
        if (part.kind !== 'math') continue;
        if (leaf.recordIndices.length !== 1) invalid('a formula must have exactly one authored record owner');
        const recordIndex = leaf.recordIndices[0]!;
        if (!baseline.has(recordIndex)) invalid('visible formula is missing from authored validation');
        const location = coordinates.locateRange(value, part.start, part.end);
        expected.push({ ...part, start: part.start + offset, end: part.end + offset,
          recordIndex, origins: location.intervals, synthetic: location.synthetic });
        visible.set(recordIndex, reserveMathOccurrences(visible.get(recordIndex) ?? EMPTY_MATH_RESOURCE_TOTAL,
          { svgBytes: part.mathmlBytes, elementCount: part.elementCount }, 1));
      }
      offset += value.length + 1; // synthetic newline separating native body rows
    }
    const join = (values: readonly ProvenanceText[], separator: string): ProvenanceText => {
      const chunks: ProvenanceText[] = [];
      for (const [index, value] of values.entries()) {
        if (index) chunks.push(values[0]!.synthetic(separator));
        chunks.push(value);
      }
      return values[0]!.slice(0, 0).concatAll(chunks);
    };
    const semanticValue = leaves.map(leaf => leaf.mapped.text).join('<br/>');
    const rendererInput = join(prepared, '<br/>');
    const whole = mapStateMathInput(rendererInput, 'state.description', identity);
    const checked = validateMermaidMathLabel(whole.text);
    const actual = checked.parts.filter(part => part.kind === 'math');
    if (actual.length !== expected.length || actual.some((part, index) => {
      const expectedPart = expected[index]!;
      return part.start !== expectedPart.start || part.end !== expectedPart.end || part.source !== expectedPart.source ||
        part.mathmlBytes !== expectedPart.mathmlBytes || part.elementCount !== expectedPart.elementCount;
    })) invalid('joined body math differs from its ordered constituent fields');
    let formula = 0;
    const parts = checked.parts.map(part => part.kind === 'math' ? expected[formula++]! : part);
    slots.push(Object.freeze({ key, ownerKind, ownerId,
      ...(ownerKind === 'node' ? { domId: name(owner.domId, 'DOM ID') } : {}),
      shape, role, inputPath, recordIndices: Object.freeze(leaves.flatMap(leaf => [...leaf.recordIndices])),
      semanticValue, rendererInput: rendererInput.text, renderedValue: whole.text, parts: Object.freeze(parts) }));
  };

  for (const [object, source] of provenance.nodes) {
    const node = object as Native;
    if (!source.identity || node.id !== source.identity.id || node.domId !== source.identity.domId ||
      node.shape !== source.identity.shape || Object.hasOwn(node, 'description') !== source.identity.hasDescription) {
      invalid('native node identity or shape changed after reconciliation');
    }
    if (source.description === undefined && node.description !== undefined) invalid('native node acquired description rows after reconciliation');
    if (node.shape === 'noteGroup') {
      if (!source.structural) invalid('note group lacks structural ownership');
      continue;
    }
    if (scalar(source.label).mapped.text !== node.label) invalid('native node label changed after reconciliation');
    if (source.description !== undefined && JSON.stringify(array(source.description).map(part => part.mapped.text)) !== JSON.stringify(node.description)) {
      invalid('native description rows changed after reconciliation');
    }
    if (node.shape === undefined && options.allowPlainUndefinedShape) { undefinedShape = true; continue; }
    if (typeof node.shape !== 'string') invalid('native node has no renderable shape');
    if (NO_LABEL.has(node.shape)) continue;
    if (node.shape === 'rect' || node.shape === 'note') slot('node', node, 'label', 'labelHelper', [scalar(source.label)], node.shape);
    else if (node.shape === 'rectWithTitle') {
      slot('node', node, 'title', 'createLabel', [scalar(source.label)], node.shape);
      slot('node', node, 'body', 'createLabel', array(source.description), node.shape);
    } else invalid(`unadmitted native label shape ${node.shape}`);
  }
  for (const [object, source] of provenance.edges) {
    const edge = object as Native;
    if (!source.identity || edge.id !== source.identity.id || edge.start !== source.identity.start || edge.end !== source.identity.end) {
      invalid('native edge identity changed after reconciliation');
    }
    const value = scalar(source.label);
    if (!value.recordIndices.length && value.mapped.text === '' && (edge.label === undefined || edge.label === '')) continue;
    if (value.mapped.text !== edge.label) invalid('native edge label changed after reconciliation');
    slot('edge', edge, 'label', 'edge', [value], 'edge');
  }
  const recordCosts = new Map<number, MathResourceTotal>();
  let total = addStateMathCosts(EMPTY_MATH_RESOURCE_TOTAL, initial);
  for (const [index, base] of baseline) {
    const charged = maxStateMathCost(base, visible.get(index) ?? EMPTY_MATH_RESOURCE_TOTAL);
    recordCosts.set(index, charged);
    total = addStateMathCosts(total, charged);
  }
  if (undefinedShape && total.occurrences > initial.occurrences) invalid('native node has no renderable shape');
  return Object.freeze({ slots: Object.freeze(slots), total, recordCosts });
}
