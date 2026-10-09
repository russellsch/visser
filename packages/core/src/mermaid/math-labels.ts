// Grammar-scoped, source-located math for Mermaid pie diagrams. The caller
// supplies the original fenced body, before Visser's LF normalization, so CST
// offsets can be mapped to original UTF-8 bytes without guessing line shifts.
import { parse, type Pie } from '@mermaid-js/parser';
import { EMPTY_MATH_RESOURCE_TOTAL, MathPolicyError, type MathResourceTotal } from '../math/policy.ts';
import { validateMermaidMathLabel, type MermaidMathExpression, type MermaidMathText } from './math.ts';
import { normalizeMermaidSource } from './rules.ts';

export type PieMathRole = 'title' | 'accTitle' | 'accDescr' | 'section.label';
export type LocatedPieMathExpression = MermaidMathExpression & {
  rawSource: string; // exact original $$...$$, which may differ from the converted value
  sourceStart: number; // UTF-16 offsets in originalSource, inclusive
  sourceEnd: number; // exclusive
  startByte: number; // UTF-8 offsets in originalSource, inclusive
  endByte: number; // exclusive
  startLine: number; // 1-based in originalSource
};
export type PieMathRecord = {
  role: PieMathRole;
  sectionIndex?: number;
  active: boolean; // for root fields, only the last assignment is displayed
  value: string; // the public parser's converted field value
  sourceStart: number; // whole grammar terminal, including keyword or quotes
  sourceEnd: number;
  startByte: number;
  endByte: number;
  startLine: number;
  parts: readonly (MermaidMathText | LocatedPieMathExpression)[];
};
export type PieMathLabels = { records: PieMathRecord[]; total: MathResourceTotal };

export class LocatedPieMathError extends Error {
  readonly code: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly startByte: number;
  readonly endByte: number;
  readonly startLine: number;
  constructor(code: string, message: string, sourceStart: number, sourceEnd: number,
    startByte: number, endByte: number, startLine: number) {
    super(message);
    this.name = 'LocatedPieMathError';
    this.code = code;
    this.sourceStart = sourceStart;
    this.sourceEnd = sourceEnd;
    this.startByte = startByte;
    this.endByte = endByte;
    this.startLine = startLine;
  }
}

type Cst = {
  text: string;
  offset: number;
  end: number;
  hidden: boolean;
  astNode: unknown;
  tokenType?: { name: string };
  grammarSource?: { $container?: { feature?: string } };
  content?: readonly Cst[];
};

function* leaves(node: Cst): Generator<Cst> {
  if (node.content) for (const child of node.content) yield* leaves(child);
  else yield node;
}

function sourceMap(source: string): { byteAt: (offset: number) => number; lineAt: (offset: number) => number } {
  const bytes: Array<number | undefined> = Array(source.length + 1);
  bytes[0] = 0;
  for (let i = 0; i < source.length;) {
    const point = source.codePointAt(i)!;
    const units = point > 0xffff ? 2 : 1;
    if (point >= 0xd800 && point <= 0xdfff) throw new MathPolicyError('E_MATH_INVALID', 'pie source contains an invalid surrogate');
    const width = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    bytes[i + units] = bytes[i]! + width;
    i += units;
  }
  const lines = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lines.push(i + 1);
  return {
    byteAt(offset) {
      const byte = bytes[offset];
      if (byte === undefined) throw new MathPolicyError('E_MATH_INVALID', 'pie CST offset is outside a Unicode boundary');
      return byte;
    },
    lineAt(offset) {
      let lo = 0, hi = lines.length;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >>> 1;
        if (lines[mid]! <= offset) lo = mid;
        else hi = mid;
      }
      return lo + 1;
    },
  };
}

/** Markdoc may remove fence indentation, but must not rewrite label content. */
function sameContentAfterDedent(original: string, rendered: string): boolean {
  const rawLines = normalizeMermaidSource(original).split('\n');
  const shownLines = rendered.split('\n');
  return rawLines.length === shownLines.length && rawLines.every((raw, i) => {
    const shown = shownLines[i]!;
    if (!raw.endsWith(shown)) return false;
    return /^[\t ]*$/.test(raw.slice(0, raw.length - shown.length));
  });
}

/**
 * Validate every authored pie field, even an overwritten duplicate. The caller
 * passes the shared document budget in `total`, and adds the fenced body's
 * absolute byte base to relative spans returned here. `renderedSource` is the
 * actual Markdoc/Visser-normalized body when indentation was removed from a
 * code fence; otherwise the local BOM/CRLF normalization is sufficient.
 *
 * Throws MermaidParseError on grammar errors and MathPolicyError when a label
 * cannot be mapped or its math is invalid. No whole-source regex is used to
 * discover labels: only public Pie AST/CST assignment leaves are inspected.
 */
export async function extractPieMathLabels(
  originalSource: string,
  total: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
  renderedSource: string = normalizeMermaidSource(originalSource),
): Promise<PieMathLabels> {
  const bom = originalSource.startsWith('\uFEFF') ? 1 : 0;
  const parsedSource = originalSource.slice(bom);
  const ast: Pie = await parse('pie', parsedSource);
  const renderedAst: Pie = await parse('pie', renderedSource);
  const cst = ast.$cstNode as Cst | undefined;
  const renderedCst = renderedAst.$cstNode as Cst | undefined;
  if (!cst || !renderedCst) throw new MathPolicyError('E_MATH_INVALID', 'pie parser returned no source CST');
  const map = sourceMap(originalSource);
  if (!sameContentAfterDedent(originalSource, renderedSource)) {
    throw new LocatedPieMathError('E_MATH_INVALID', 'pie rendered source differs from original fence content',
      0, originalSource.length, 0, map.byteAt(originalSource.length), 1);
  }
  const atLeaf = (leaf: Cst, code: string, message: string, value?: string, valueOffset?: number): LocatedPieMathError => {
    let sourceStart = bom + leaf.offset;
    let sourceEnd = bom + leaf.end;
    if (value !== undefined && valueOffset !== undefined) {
      const valueDelimiters = [...value.matchAll(/\$\$/g)];
      const rawDelimiters = [...leaf.text.matchAll(/\$\$/g)];
      const index = valueDelimiters.findIndex(delimiter => delimiter.index === valueOffset);
      if (index >= 0 && valueDelimiters.length === rawDelimiters.length && rawDelimiters[index]) {
        sourceStart = bom + leaf.offset + rawDelimiters[index]!.index;
        sourceEnd = sourceStart + 2;
        if (index % 2 === 0 && rawDelimiters[index + 1]) {
          sourceEnd = bom + leaf.offset + rawDelimiters[index + 1]!.index + 2;
        }
      }
    }
    return new LocatedPieMathError(code, message, sourceStart, sourceEnd,
      map.byteAt(sourceStart), map.byteAt(sourceEnd), map.lineAt(sourceStart));
  };
  const rootRoles = new Set<PieMathRole>(['title', 'accTitle', 'accDescr']);
  const candidates: Array<{ role: PieMathRole; leaf: Cst; sectionIndex?: number }> = [];
  for (const leaf of leaves(cst)) {
    if (leaf.hidden || leaf.astNode !== ast) continue;
    const role = leaf.grammarSource?.$container?.feature as PieMathRole | undefined;
    if (role && rootRoles.has(role) && ['TITLE', 'ACC_TITLE', 'ACC_DESCR'].includes(leaf.tokenType?.name ?? '')) {
      candidates.push({ role, leaf });
    }
  }
  for (const [sectionIndex, section] of ast.sections.entries()) {
    if (section.$type !== 'PieSection' || !section.$cstNode) continue;
    const labels = [...leaves(section.$cstNode as Cst)].filter(leaf => !leaf.hidden && leaf.astNode === section
      && leaf.grammarSource?.$container?.feature === 'label' && leaf.tokenType?.name === 'STRING');
    if (labels.length !== 1) throw new MathPolicyError('E_MATH_INVALID', 'pie section has no unique source label');
    candidates.push({ role: 'section.label', leaf: labels[0]!, sectionIndex });
  }
  candidates.sort((a, b) => a.leaf.offset - b.leaf.offset);
  const renderedRoot = new Map<PieMathRole, Cst[]>();
  for (const leaf of leaves(renderedCst)) {
    if (leaf.hidden || leaf.astNode !== renderedAst) continue;
    const role = leaf.grammarSource?.$container?.feature as PieMathRole | undefined;
    if (role && rootRoles.has(role) && ['TITLE', 'ACC_TITLE', 'ACC_DESCR'].includes(leaf.tokenType?.name ?? '')) {
      const group = renderedRoot.get(role) ?? [];
      group.push(leaf);
      renderedRoot.set(role, group);
    }
  }
  const lastRoot = new Map<PieMathRole, Cst>();
  for (const candidate of candidates) if (candidate.role !== 'section.label') lastRoot.set(candidate.role, candidate.leaf);
  if (renderedAst.sections.length !== ast.sections.length) {
    throw new MathPolicyError('E_MATH_INVALID', 'pie source and rendered source have different sections');
  }
  const seenRoot = new Map<PieMathRole, number>();
  for (const role of rootRoles) if ((renderedRoot.get(role)?.length ?? 0) !== candidates.filter(candidate => candidate.role === role).length) {
    throw new MathPolicyError('E_MATH_INVALID', `pie source and rendered source have different ${role} fields`);
  }

  const records: PieMathRecord[] = [];
  let nextTotal = total;
  for (const { role, leaf, sectionIndex } of candidates) {
    if (parsedSource.slice(leaf.offset, leaf.end) !== leaf.text) {
      throw atLeaf(leaf, 'E_MATH_INVALID', 'pie CST token does not match original source');
    }
    let value: string;
    if (role === 'section.label') value = renderedAst.sections[sectionIndex!]!.label;
    else {
      // The public AST retains only the final assignment. Reparse one grammar
      // terminal to obtain exactly the pinned parser's conversion for each
      // overwritten assignment without duplicating private converter rules.
      const index = seenRoot.get(role) ?? 0;
      seenRoot.set(role, index + 1);
      const renderedLeaf = renderedRoot.get(role)![index]!;
      const one: Pie = await parse('pie', `pie\n${renderedLeaf.text}\n`);
      value = one[role] ?? '';
      if (lastRoot.get(role) === leaf && value !== (renderedAst[role] ?? '')) {
        throw atLeaf(leaf, 'E_MATH_INVALID', `pie ${role} conversion differs from the complete diagram`);
      }
    }
    let validated: ReturnType<typeof validateMermaidMathLabel>;
    try { validated = validateMermaidMathLabel(value, nextTotal); }
    catch (error) {
      if (!(error instanceof MathPolicyError)) throw error;
      const offset = /at UTF-16 offset (\d+)/.exec(error.message)?.[1];
      throw atLeaf(leaf, error.code, error.message, value, offset === undefined ? undefined : Number(offset));
    }
    nextTotal = validated.total;
    const mathParts = validated.parts.filter((part): part is MermaidMathExpression => part.kind === 'math');
    // Match source delimiters only within the CST terminal. Converted fields
    // can normalize whitespace or escapes; occurrence order remains stable.
    const sourceMatches = [...leaf.text.matchAll(/\$\$(.*?)\$\$/g)];
    if (sourceMatches.length !== mathParts.length || (leaf.text.match(/\$\$/g)?.length ?? 0) !== mathParts.length * 2) {
      throw atLeaf(leaf, 'E_MATH_INVALID', `pie ${role} math delimiters changed during parsing`);
    }
    let mathIndex = 0;
    const parts = validated.parts.map(part => {
      if (part.kind !== 'math') return part;
      const match = sourceMatches[mathIndex++]!;
      const sourceStart = bom + leaf.offset + match.index;
      const sourceEnd = sourceStart + match[0].length;
      return { ...part, rawSource: match[0], sourceStart, sourceEnd,
        startByte: map.byteAt(sourceStart), endByte: map.byteAt(sourceEnd), startLine: map.lineAt(sourceStart) };
    });
    const sourceStart = bom + leaf.offset;
    const sourceEnd = bom + leaf.end;
    records.push({ role, ...(sectionIndex !== undefined ? { sectionIndex } : {}), active: role === 'section.label' || lastRoot.get(role) === leaf,
      value, sourceStart, sourceEnd, startByte: map.byteAt(sourceStart), endByte: map.byteAt(sourceEnd), startLine: map.lineAt(sourceStart), parts });
  }
  return { records, total: nextTotal };
}
