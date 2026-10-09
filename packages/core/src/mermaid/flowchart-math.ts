// Compose grammar/YAML provenance with the pinned shared text renderer's math
// input. This validator is prepared for worker integration; family activation
// additionally requires effective-DB checks and source-owned browser bindings.
import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, reserveMathOccurrences, type MathResourceTotal } from '../math/policy.ts';
import { extractFlowchartLabels, type FlowchartLabelRecord, type FlowchartLabels } from './flowchart-labels.ts';
import { decodeFlowchartMetadata } from './flowchart-metadata.ts';
import { MermaidSourceCoordinates, type LocatedSourceInterval } from './source-coordinates.ts';
import type { ProvenanceText } from './source-provenance.ts';
import { normalizeMermaidSource } from './rules.ts';
import { validateMermaidMathLabel, type MermaidMathExpression, type MermaidMathText } from './math.ts';

export type FlowchartMathExpression = MermaidMathExpression & {
  origins: readonly LocatedSourceInterval[];
  synthetic: boolean;
};
export type FlowchartMathRecord = {
  role: FlowchartLabelRecord['role'] | 'node.metadata';
  semanticValue: string;
  renderedValue: string;
  labelType?: string;
  ownerId?: string;
  edgeIds?: readonly string[];
  edgeIndices?: readonly number[];
  endpoints?: readonly Readonly<{ start: string; end: string }>[];
  active: boolean;
  effectIndex: number;
  renderCopies: number;
  parts: readonly (MermaidMathText | FlowchartMathExpression)[];
};

/**
 * A math-policy failure located to the complete grammar-owned label field.
 * KaTeX does not provide a trustworthy offset within that field, so these
 * intervals deliberately do not claim to pinpoint an individual expression.
 * Escapes and normalization may yield multiple intervals or synthetic text.
 */
export class LocatedFlowchartMathError extends MathPolicyError {
  readonly intervals: readonly LocatedSourceInterval[];
  readonly synthetic: boolean;
  readonly startLine: number | undefined;
  readonly startByte: number | undefined;
  readonly endByte: number | undefined;

  constructor(code: string, message: string, location: {
    intervals: readonly LocatedSourceInterval[]; synthetic: boolean;
  }) {
    super(code, message);
    this.name = 'LocatedFlowchartMathError';
    this.intervals = Object.freeze(location.intervals.map(interval => Object.freeze({ ...interval })));
    this.synthetic = location.synthetic;
    this.startLine = this.intervals[0]?.startLine;
    this.startByte = this.intervals[0]?.startByte;
    this.endByte = this.intervals[0]?.endByte;
  }
}

type Candidate = {
  role: FlowchartMathRecord['role']; semanticValue: string; mappedValue: ProvenanceText;
  labelType?: string; ownerId?: string; edgeIds?: readonly string[]; edgeIndices?: readonly number[];
  endpoints?: readonly Readonly<{ start: string; end: string }>[];
  assignsLabel: boolean; effectIndex: number; active: boolean;
};

/** createText collapses doubled slashes; addHtmlSpan normalizes <br> next. */
export function mapSharedMermaidMathInput(label: ProvenanceText): ProvenanceText {
  return label.replaceRegex(/\\\\/g, () => '\\').replaceRegex(/<\/?br\s*\/?>/gi, () => '\n');
}

/** Pinned common DB: setAccDescription sanitizes, then removes newline indentation. */
function mapAccDescription(label: ProvenanceText): ProvenanceText {
  return label.replaceRegex(/\n\s+/g, () => '\n');
}

/** Pinned FlowDB sanitizeNodeLabelType used for each truthy metadata label. */
function metadataLabelType(value: unknown): string {
  return value === 'markdown' || value === 'string' || value === 'text' ? value : 'markdown';
}

function locatePolicyError(
  error: MathPolicyError, role: FlowchartMathRecord['role'], ownerId: string | undefined,
  mappedValue: ProvenanceText, coordinates: MermaidSourceCoordinates,
): LocatedFlowchartMathError {
  const location = coordinates.locateRange(mappedValue, 0, mappedValue.length);
  const line = location.intervals[0]?.startLine;
  return new LocatedFlowchartMathError(error.code,
    `flowchart ${role}${ownerId ? ` ${ownerId}` : ''}${line ? ` at field line ${line}` : ''}: ${error.message}`,
    location);
}

export async function extractFlowchartMath(
  original: string, initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
  rendered = normalizeMermaidSource(original),
): Promise<{ records: FlowchartMathRecord[]; total: MathResourceTotal }> {
  return validateFlowchartLabelRecords(original, await extractFlowchartLabels(original, rendered), initial);
}

/** Validate grammar-owned records from an independently pinned shared-label grammar. */
export function validateFlowchartLabelRecords(
  original: string, extracted: FlowchartLabels, initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
  decodeMetadata: typeof decodeFlowchartMetadata = decodeFlowchartMetadata,
): { records: FlowchartMathRecord[]; total: MathResourceTotal } {
  const coordinates = new MermaidSourceCoordinates(original);
  const candidates: Candidate[] = extracted.records.map(record => ({ ...record }));
  // Typed metadata can supersede an earlier string even when it cannot be
  // displayed by the upstream renderer. Retain that assignment precedence.
  const assignments: Array<{ ownerId: string; effectIndex: number; candidate?: Candidate; unsupported?: ProvenanceText }> = [];
  for (const candidate of candidates) if (candidate.role.startsWith('node.') && candidate.assignsLabel) {
    assignments.push({ ownerId: candidate.ownerId!, effectIndex: candidate.effectIndex, candidate });
  }
  for (const metadata of extracted.shapeData) {
    let decoded: ReturnType<typeof decodeFlowchartMetadata>;
    try { decoded = decodeMetadata(metadata); }
    catch (error) {
      if (!(error instanceof MathPolicyError)) throw error;
      throw locatePolicyError(error, 'node.metadata', metadata.ownerId, metadata.mappedRawValue, coordinates);
    }
    if (metadata.targetKind !== 'node') continue; // these label fields are not displayed by FlowDB
    if (!decoded.label) continue;
    let candidate: Candidate | undefined;
    if (decoded.label.mappedValue) {
      const document = decoded.value as Record<string, unknown>;
      candidate = { role: 'node.metadata', ownerId: metadata.ownerId,
        semanticValue: decoded.label.mappedValue.text, mappedValue: decoded.label.mappedValue,
        labelType: metadataLabelType(document?.labelType),
        assignsLabel: true, effectIndex: metadata.effectIndex, active: true };
      candidates.push(candidate);
    }
    assignments.push({ ownerId: metadata.ownerId, effectIndex: metadata.effectIndex, candidate,
      unsupported: candidate ? undefined : metadata.mappedRawValue });
  }
  for (const candidate of candidates) if (candidate.role.startsWith('node.')) candidate.active = false;
  const final = new Map<string, (typeof assignments)[number]>();
  for (const assignment of assignments.sort((a, b) => a.effectIndex - b.effectIndex)) final.set(assignment.ownerId, assignment);
  for (const assignment of final.values()) if (assignment.candidate) assignment.candidate.active = true;

  const records: FlowchartMathRecord[] = [];
  let total = initial;
  for (const candidate of candidates.sort((a, b) => a.effectIndex - b.effectIndex)) {
    const mapped = candidate.role === 'accDescr' ? mapAccDescription(candidate.mappedValue)
      : candidate.role === 'accTitle' ? candidate.mappedValue : mapSharedMermaidMathInput(candidate.mappedValue);
    const renderCopies = candidate.role === 'edge' ? Math.max(1, candidate.edgeIds?.length ?? 0) : 1;
    let parts: FlowchartMathRecord['parts'];
    try {
      const validated = validateMermaidMathLabel(mapped.text, total);
      total = validated.total;
      parts = validated.parts.map(part => {
        if (part.kind === 'text') return part;
        for (let copy = 1; copy < renderCopies; copy++) {
          total = reserveMathOccurrences(total, { svgBytes: part.mathmlBytes, elementCount: part.elementCount }, 1);
        }
        const origin = coordinates.locateRange(mapped, part.start, part.end);
        return { ...part, origins: origin.intervals, synthetic: origin.synthetic };
      });
    } catch (error) {
      if (!(error instanceof MathPolicyError)) throw error;
      throw locatePolicyError(error, candidate.role, candidate.ownerId, candidate.mappedValue, coordinates);
    }
    records.push({ role: candidate.role,
      semanticValue: candidate.role === 'accDescr' ? mapped.text : candidate.semanticValue,
      renderedValue: mapped.text, labelType: candidate.labelType,
      ownerId: candidate.ownerId, edgeIds: candidate.edgeIds, edgeIndices: candidate.edgeIndices,
      endpoints: candidate.endpoints,
      active: candidate.active, effectIndex: candidate.effectIndex, renderCopies, parts });
  }
  for (const [ownerId, assignment] of final) if (assignment.unsupported) {
    throw locatePolicyError(new MathPolicyError('E_MATH_INVALID',
      'final metadata label is truthy but has no selected display string'),
    'node.metadata', ownerId, assignment.unsupported, coordinates);
  }
  return { records, total };
}
