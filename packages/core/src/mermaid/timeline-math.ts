// Source-owned labels for Mermaid 12.0.0's pinned legacy timeline Jison parser.
// Capture its actual field reductions, with lexer ranges enabled on a fresh
// parser instance; no parallel timeline grammar or whole-fence label regex.
import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, type MathResourceTotal } from '../math/policy.ts';
import { validateMermaidMathLabel, type MermaidMathExpression, type MermaidMathText } from './math.ts';
import { normalizeMermaidSource } from './rules.ts';

export type TimelineMathRole = 'title' | 'accTitle' | 'accDescr' | 'section' | 'task' | 'event';
export type TimelineMathExpression = MermaidMathExpression & {
  rawSource: string;
  sourceStart: number; sourceEnd: number; // UTF-16 in original fenced body
  startByte: number; endByte: number; // UTF-8 in original fenced body
  startLine: number;
};
export type TimelineMathRecord = {
  role: TimelineMathRole;
  active: boolean;
  value: string; // effective value passed to the pinned timeline DB
  sourceStart: number; sourceEnd: number;
  startByte: number; endByte: number;
  startLine: number;
  sectionIndex?: number;
  taskIndex?: number;
  eventIndex?: number;
  parts: readonly (MermaidMathText | TimelineMathExpression)[];
};
export type TimelineMathLabels = { records: TimelineMathRecord[]; total: MathResourceTotal };

export class LocatedTimelineMathError extends Error {
  readonly code: string;
  readonly sourceStart: number; readonly sourceEnd: number;
  readonly startByte: number; readonly endByte: number; readonly startLine: number;
  constructor(code: string, message: string, start: number, end: number, startByte: number, endByte: number, line: number) {
    super(message);
    this.name = 'LocatedTimelineMathError';
    this.code = code;
    this.sourceStart = start;
    this.sourceEnd = end;
    this.startByte = startByte;
    this.endByte = endByte;
    this.startLine = line;
  }
}

type LexLoc = { range?: [number, number] };
type JisonLexer = { options: Record<string, unknown> };
type JisonParser = {
  yy: Record<string, unknown>;
  lexer: JisonLexer;
  performAction: (...args: unknown[]) => unknown;
  parse(source: string): unknown;
};
type PinnedTimelineModule = { diagram: { parser: { parser: { Parser: new () => JisonParser; lexer: JisonLexer;
  productions_: unknown; symbols_: Record<string, number> } } } };
type Reduction = { role: TimelineMathRole; value: string; start: number; end: number; sectionIndex?: number; taskIndex?: number; eventIndex?: number };

/** UTF-16 boundaries of normalized text to original UTF-8 and line numbers. */
function normalizeOriginal(source: string): { text: string; bytes: number[]; offsets: number[]; lines: number[] } {
  const bytes: number[] = [];
  const offsets: number[] = [];
  const lines: number[] = [];
  let sourceAt = 0, byteAt = 0, line = 1;
  if (source.startsWith('\uFEFF')) { sourceAt = 1; byteAt = 3; }
  bytes[0] = byteAt; offsets[0] = sourceAt; lines[0] = line;
  let text = '';
  while (sourceAt < source.length) {
    const point = source.codePointAt(sourceAt)!;
    if (point >= 0xd800 && point <= 0xdfff) throw new MathPolicyError('E_MATH_INVALID', 'timeline source contains an invalid surrogate');
    let rawUnits = point > 0xffff ? 2 : 1;
    let width = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    const newline = source[sourceAt] === '\r' || source[sourceAt] === '\n';
    if (source[sourceAt] === '\r' && source[sourceAt + 1] === '\n') { rawUnits = 2; width = 2; }
    const char = newline ? '\n' : String.fromCodePoint(point);
    text += char;
    sourceAt += rawUnits;
    byteAt += width;
    const boundary = text.length;
    bytes[boundary] = byteAt;
    offsets[boundary] = sourceAt;
    lines[boundary] = newline ? ++line : line;
  }
  return { text, bytes, offsets, lines };
}

/** Map the actual Markdoc-dedented parser input back to normalized raw source. */
function renderedToOriginal(raw: string, rendered: string): number[] {
  const rawLines = raw.split('\n');
  const shownLines = rendered.split('\n');
  if (rawLines.length !== shownLines.length) throw new MathPolicyError('E_MATH_INVALID', 'timeline source line count changed before rendering');
  const map: number[] = [];
  let rawAt = 0, shownAt = 0;
  for (let i = 0; i < shownLines.length; i++) {
    const original = rawLines[i]!;
    const shown = shownLines[i]!;
    if (!original.endsWith(shown)) throw new MathPolicyError('E_MATH_INVALID', 'timeline source changed before rendering');
    const prefix = original.length - shown.length;
    if (!/^[ \t]*$/.test(original.slice(0, prefix))) throw new MathPolicyError('E_MATH_INVALID', 'timeline source changed outside fence indentation');
    for (let j = 0; j <= shown.length; j++) map[shownAt + j] = rawAt + prefix + j;
    rawAt += original.length + 1;
    shownAt += shown.length + 1;
  }
  return map;
}

const REDUCTION_ROLE: Readonly<Record<number, TimelineMathRole>> = {
  11: 'title', 12: 'accTitle', 13: 'accDescr', 14: 'accDescr',
  15: 'section', 18: 'task', 19: 'event',
};

/**
 * Validate every authored timeline field, including overwritten metadata.
 * This pinned-module adapter must run in the isolated Mermaid worker. Its
 * `renderedSource` is the LF-normalized fence content actually sent to Mermaid.
 */
export async function extractTimelineMathLabels(
  originalSource: string,
  total: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
  renderedSource: string = normalizeMermaidSource(originalSource),
): Promise<TimelineMathLabels> {
  const normalized = normalizeOriginal(originalSource);
  const rendered = normalizeMermaidSource(renderedSource);
  const toRaw = renderedToOriginal(normalized.text, rendered);
  // `mermaid` exposes its pinned chunk subpath. Keep this import inside the
  // worker path; a release bundler must retain the exact 12.0.0 parser chunk.
  // The literal package subpath lets the release bundler include this parser
  // in the standalone worker; a variable import would require node_modules.
  // @ts-expect-error Mermaid ships no declaration for its pinned internal chunk.
  const module = await import('mermaid/dist/chunks/mermaid.core/timeline-definition-EJHVYXUP.mjs') as PinnedTimelineModule;
  const pinned = module.diagram?.parser?.parser;
  if (typeof pinned?.Parser !== 'function' || !pinned.lexer) throw new MathPolicyError('E_MATH_INVALID', 'pinned timeline parser interface changed');
  const productions = pinned.productions_;
  if (!Array.isArray(productions) ||
      JSON.stringify([11, 12, 13, 14, 15, 18, 19].map(index => productions[index])) !==
        JSON.stringify([[12, 1], [12, 2], [12, 2], [12, 1], [12, 1], [21, 1], [22, 1]]) ||
      JSON.stringify(['title', 'acc_title', 'acc_descr', 'section', 'period', 'event'].map(name => pinned.symbols_?.[name])) !==
        JSON.stringify([14, 15, 17, 20, 23, 24])) {
    throw new MathPolicyError('E_MATH_INVALID', 'pinned timeline reduction contract changed');
  }
  const parser = new pinned.Parser();
  parser.lexer = Object.create(pinned.lexer) as JisonLexer;
  parser.lexer.options = { ...pinned.lexer.options, ranges: true };
  const reductions: Reduction[] = [];
  let effect: string | undefined;
  let sectionIndex = -1, taskIndex = -1, eventIndex = -1;
  parser.yy = {
    setDirection(_direction: string) {},
    getCommonDb: () => ({
      setDiagramTitle(value: string) { effect = value; },
      setAccTitle(value: string) { effect = value; },
      setAccDescription(value: string) { effect = value; },
    }),
    addSection(value: string) { effect = value; sectionIndex++; },
    addTask(value: string) { effect = value; taskIndex++; eventIndex = -1; },
    addEvent(value: string) { effect = value; eventIndex++; },
  };
  const originalAction = parser.performAction;
  parser.performAction = function(this: { $?: unknown }, ...args: unknown[]): unknown {
    const production = args[4] as number;
    const role = REDUCTION_ROLE[production];
    if (!role) return originalAction.apply(this, args);
    const values = args[5] as string[];
    const locations = args[6] as LexLoc[];
    const at = values.length - 1;
    const token = values[at];
    const range = locations[at]?.range;
    effect = undefined;
    const result = originalAction.apply(this, args);
    if (typeof token !== 'string' || !range || !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1]) ||
        range[0] < 0 || range[1] < range[0] || rendered.slice(range[0], range[1]) !== token || typeof effect !== 'string') {
      throw new MathPolicyError('E_MATH_INVALID', 'pinned timeline reduction no longer has exact field text and range');
    }
    if (role === 'event' && taskIndex < 0) throw new MathPolicyError('E_MATH_INVALID', 'timeline event has no task');
    reductions.push({ role, value: effect, start: range[0], end: range[1],
      ...(sectionIndex >= 0 ? { sectionIndex } : {}),
      ...(taskIndex >= 0 && (role === 'task' || role === 'event') ? { taskIndex } : {}),
      ...(role === 'event' ? { eventIndex } : {}) });
    return result;
  };
  parser.parse(rendered);

  const lastMetadata = new Map<TimelineMathRole, number>();
  reductions.forEach((reduction, index) => {
    if (reduction.role === 'title' || reduction.role === 'accTitle' || reduction.role === 'accDescr') lastMetadata.set(reduction.role, index);
  });
  const records: TimelineMathRecord[] = [];
  let nextTotal = total;
  for (const [index, reduction] of reductions.entries()) {
    const rawStart = toRaw[reduction.start];
    const rawEnd = toRaw[reduction.end];
    if (rawStart === undefined || rawEnd === undefined || normalized.bytes[rawStart] === undefined || normalized.bytes[rawEnd] === undefined) {
      throw new MathPolicyError('E_MATH_INVALID', 'timeline reduction cannot map to an original byte boundary');
    }
    const start = normalized.offsets[rawStart]!;
    const end = normalized.offsets[rawEnd]!;
    const line = normalized.lines[rawStart]!;
    let validated: ReturnType<typeof validateMermaidMathLabel>;
    try { validated = validateMermaidMathLabel(reduction.value, nextTotal); }
    catch (error) {
      if (!(error instanceof MathPolicyError)) throw error;
      throw new LocatedTimelineMathError(error.code, error.message, start, end, normalized.bytes[rawStart]!, normalized.bytes[rawEnd]!, line);
    }
    nextTotal = validated.total;
    const token = rendered.slice(reduction.start, reduction.end);
    const matches = [...token.matchAll(/\$\$(.*?)\$\$/g)];
    const mathParts = validated.parts.filter((part): part is MermaidMathExpression => part.kind === 'math');
    if (matches.length !== mathParts.length || (token.match(/\$\$/g)?.length ?? 0) !== mathParts.length * 2) {
      throw new LocatedTimelineMathError('E_MATH_INVALID', `timeline ${reduction.role} math delimiters changed during parsing`, start, end, normalized.bytes[rawStart]!, normalized.bytes[rawEnd]!, line);
    }
    let mathIndex = 0;
    const parts = validated.parts.map(part => {
      if (part.kind !== 'math') return part;
      const match = matches[mathIndex++]!;
      const rawMathStart = toRaw[reduction.start + match.index];
      const rawMathEnd = toRaw[reduction.start + match.index + match[0].length];
      if (rawMathStart === undefined || rawMathEnd === undefined || normalized.text.slice(rawMathStart, rawMathEnd) !== match[0]) {
        throw new LocatedTimelineMathError('E_MATH_INVALID', 'timeline math span changed during source mapping', start, end, normalized.bytes[rawStart]!, normalized.bytes[rawEnd]!, line);
      }
      return { ...part, rawSource: originalSource.slice(normalized.offsets[rawMathStart]!, normalized.offsets[rawMathEnd]!),
        sourceStart: normalized.offsets[rawMathStart]!, sourceEnd: normalized.offsets[rawMathEnd]!,
        startByte: normalized.bytes[rawMathStart]!, endByte: normalized.bytes[rawMathEnd]!, startLine: normalized.lines[rawMathStart]! };
    });
    records.push({ role: reduction.role, active: !lastMetadata.has(reduction.role) || lastMetadata.get(reduction.role) === index,
      value: reduction.value, sourceStart: start, sourceEnd: end,
      startByte: normalized.bytes[rawStart]!, endByte: normalized.bytes[rawEnd]!, startLine: line,
      ...(reduction.sectionIndex !== undefined ? { sectionIndex: reduction.sectionIndex } : {}),
      ...(reduction.taskIndex !== undefined ? { taskIndex: reduction.taskIndex } : {}),
      ...(reduction.eventIndex !== undefined ? { eventIndex: reduction.eventIndex } : {}), parts });
  }
  return { records, total: nextTotal };
}
