// Map validated pie CST byte spans into the comment-free code shown to readers.
// This deliberately never searches for TeX text: repeated formulas are located
// by their original byte coordinates, then checked against the displayed source.
import { MathPolicyError } from '../math/policy.ts';
import { visibleBidi } from '../compiler/html.ts';
import { normalizeMermaidSource, stripMermaidComments } from './rules.ts';
import { createMermaidSourceDisplay } from './math-source-display.ts';
import { assertMermaidSourceTransport } from './parse.ts';
import type { MermaidFigure } from './types.ts';

export type PieMathSourceLabel = { key: string; expressions: Array<{ tex: string; rawSource: string; start: number; end: number }> };
export type PieMathSourceMap = { source: string; labels: PieMathSourceLabel[] };

export type SourceLabel = { key: string; parts: readonly ({ kind: 'text' } | { kind: 'math'; tex: string; rawSource: string; startByte: number; endByte: number })[] };

const decoder = new TextDecoder('utf-8', { fatal: true });
const COMMENT_LINE = /^[ \t]*%%/;

type RawLine = { start: number; contentEnd: number; end: number; content: string };

function invalid(message: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `Mermaid source map: ${message}`);
}

/** One physical line from `start`, retaining original byte coordinates. */
function readLine(bytes: Uint8Array, start: number): RawLine {
  if (start < 0 || start > bytes.length) invalid('body starts outside original document');
  let end = start;
  while (end < bytes.length && bytes[end] !== 0x0a && bytes[end] !== 0x0d) end++;
  const contentEnd = end;
  if (bytes[end] === 0x0d) end += bytes[end + 1] === 0x0a ? 2 : 1;
  else if (bytes[end] === 0x0a) end++;
  try { return { start, contentEnd, end, content: decoder.decode(bytes.subarray(start, contentEnd)) }; }
  catch { return invalid('original body contains invalid UTF-8'); }
}

/**
 * Return exact UTF-16 ranges in `stripMermaidComments(figure.source)` for active
 * title and section math. Byte spans must still match the original document;
 * stale figure metadata or a changed code view fails closed.
 */
export function mapMermaidSourceLabels(figure: Pick<MermaidFigure, 'source' | 'mathBodyStartByte'>, rawDocument: Uint8Array, records: readonly SourceLabel[]): PieMathSourceMap {
  const plainSource = stripMermaidComments(figure.source);
  const source = visibleBidi(plainSource);
  if (!records.length) return { source, labels: [] };
  const base = figure.mathBodyStartByte;
  if (!Number.isSafeInteger(base) || base === undefined || base < 0 || base > rawDocument.length) invalid('missing or invalid body byte offset');

  const shownLines = figure.source.split('\n');
  const physicalCount = shownLines.length - (figure.source.endsWith('\n') ? 1 : 0);
  const rawLines: RawLine[] = [];
  const shownStarts: Array<number | undefined> = [];
  let rawAt = base;
  let shownAt = 0;
  let kept = 0;
  for (let i = 0; i < shownLines.length; i++) {
    const shown = shownLines[i]!;
    const comment = COMMENT_LINE.test(shown);
    if (!comment) {
      shownStarts[i] = shownAt + (kept > 0 ? 1 : 0);
      shownAt = shownStarts[i]! + shown.length;
      kept++;
    }
    if (i >= physicalCount) continue; // final empty element after a terminal newline
    const line = readLine(rawDocument, rawAt);
    const expectedNewline = i < shownLines.length - 1;
    if ((line.end > line.contentEnd) !== expectedNewline) invalid('original and displayed line endings differ');
    const content = i === 0 && line.content.startsWith('\uFEFF') ? line.content.slice(1) : line.content;
    if (!content.endsWith(shown) || !/^[ \t]*$/.test(content.slice(0, content.length - shown.length))) {
      invalid('original fence line does not match displayed dedented line');
    }
    rawLines.push(line);
    rawAt = line.end;
  }
  if (shownAt !== plainSource.length) invalid('comment removal changed source unexpectedly');

  const rangeOf = (startByte: number, endByte: number, rawSource: string): { start: number; end: number } => {
    if (!Number.isSafeInteger(startByte) || !Number.isSafeInteger(endByte) || startByte < 0 || endByte <= startByte) invalid('invalid expression byte range');
    const startAbsolute = base + startByte;
    const endAbsolute = base + endByte;
    const index = rawLines.findIndex(line => startAbsolute >= line.start && endAbsolute <= line.contentEnd);
    if (index < 0 || shownStarts[index] === undefined) invalid('expression is outside a displayed label line');
    const line = rawLines[index]!;
    let before: string;
    let exact: string;
    try {
      before = decoder.decode(rawDocument.subarray(line.start, startAbsolute));
      exact = decoder.decode(rawDocument.subarray(startAbsolute, endAbsolute));
    } catch { return invalid('expression bytes split a UTF-8 character'); }
    if (exact !== rawSource) invalid('expression byte span no longer matches validated source');
    const visible = shownLines[index]!;
    const raw = index === 0 && line.content.startsWith('\uFEFF') ? line.content.slice(1) : line.content;
    const removed = raw.length - visible.length + (index === 0 && line.content.startsWith('\uFEFF') ? 1 : 0);
    const start = shownStarts[index]! + before.length - removed;
    const end = start + normalizeMermaidSource(rawSource).length;
    if (start < shownStarts[index]! || end > shownStarts[index]! + visible.length || plainSource.slice(start, end) !== normalizeMermaidSource(rawSource)) {
      invalid('expression does not match the displayed source');
    }
    const visibleStart = visibleBidi(plainSource.slice(0, start)).length;
    const visibleEnd = visibleStart + visibleBidi(plainSource.slice(start, end)).length;
    if (source.slice(visibleStart, visibleEnd) !== visibleBidi(normalizeMermaidSource(rawSource))) invalid('bidi-visible expression no longer matches code');
    return { start: visibleStart, end: visibleEnd };
  };

  const labels = records.map(record => ({ key: record.key, expressions: record.parts.flatMap(part => {
    if (part.kind !== 'math') return [];
    return [{ tex: part.tex, rawSource: visibleBidi(normalizeMermaidSource(part.rawSource)),
      ...rangeOf(part.startByte, part.endByte, part.rawSource) }];
  }) }));
  return { source, labels };
}

/** Select the effective visible pie occurrences before mapping their source. */
export function pieMathSourceMap(figure: MermaidFigure, rawDocument: Uint8Array): PieMathSourceMap {
  if (figure.mathLabels === undefined) return mapMermaidSourceLabels(figure, rawDocument, []);
  const labels: SourceLabel[] = [];
  let sectionIndex = 0;
  const seenSections = new Set<string>();
  for (const record of figure.mathLabels ?? []) {
    if (record.role === 'section.label') {
      const first = !seenSections.has(record.value);
      seenSections.add(record.value);
      if (record.active !== first) invalid('section duplicate activity differs from first-rendered-label order');
    }
    if (!record.active) continue;
    let key: string;
    if (record.role === 'title') {
      if (record.value === '') continue;
      key = 'title';
    } else if (record.role === 'section.label') key = `section:${sectionIndex++}`;
    else continue;
    labels.push({ key, parts: record.parts });
  }
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertMermaidSourceTransport('pie', figure.source, display.original, figure.mathLabels);
  return mapMermaidSourceLabels(figure, rawDocument, labels);
}

/** Mirror timeline's section-name grouping, including repeated section copies. */
export function timelineMathSourceMap(figure: MermaidFigure, rawDocument: Uint8Array): PieMathSourceMap {
  const records = figure.timelineMathLabels ?? [];
  if (figure.timelineMathLabels === undefined) return mapMermaidSourceLabels(figure, rawDocument, []);
  const sections = records.filter(record => record.role === 'section');
  const labels: SourceLabel[] = [];
  for (const record of records) {
    if (!record.active) continue;
    if (record.role === 'title' && record.value) labels.push({ key: 'title', parts: record.parts });
    if (record.role === 'section') labels.push({ key: `section:${record.sectionIndex}`, parts: record.parts });
    if (record.role !== 'task' && record.role !== 'event') continue;
    const owner = records.find(item => item.role === 'task' && item.taskIndex === record.taskIndex);
    if (!owner) invalid('timeline occurrence has no owning task');
    const name = owner.sectionIndex === undefined ? '' : sections[owner.sectionIndex]?.value;
    const groups = sections.length ? sections.filter(section => section.value === name).map(section => String(section.sectionIndex)) : ['none'];
    for (const group of groups) {
      const key = record.role === 'task' ? `task:${group}:${record.taskIndex}` : `event:${group}:${record.taskIndex}:${record.eventIndex}`;
      labels.push({ key, parts: record.parts });
    }
  }
  const display = createMermaidSourceDisplay(figure, rawDocument);
  assertMermaidSourceTransport('timeline', figure.source, display.original, records);
  return mapMermaidSourceLabels(figure, rawDocument, labels);
}
