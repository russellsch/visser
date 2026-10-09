// The bar chart of a `measure` figure (docs/IMPROVEMENTS.md §14.4). One
// horizontal bar for each reading, in authored order, from zero. Bars are
// ink; a reading that is not measured has an outline and a hatch, and its
// value text says its status, so the hatch never carries the status alone.
// The axis shows zero and the maximum, and nothing between. Geometry is a
// pure function of the readings, so the figure needs no layout engine.
import { DOM } from './dom-contract.ts';
import { h, type HNode } from './html.ts';
import { depthAction, type InspectionDepth } from '../model/inspection.ts';
import { INK_STROKE, NODE_FILL } from './encoding.ts';
import { LINE_HEIGHT, round3, textWidth, wrapText } from './layout.ts';
import { measureRichSegments, measureRichText, type RichBlock } from './math-text.ts';
import type { MathMetrics } from '../math/engine.ts';

export type MeasureRow = { id: string; label: string; value: number; status: string; text: string;
  /** Authored-field boundaries within the displayed value. */
  textSegments?: string[]; depth?: InspectionDepth };

export type MeasureSvgInput = {
  figureId: string;
  title: string;
  rows: MeasureRow[];
  maxText: string; // the maximum with its unit, for the axis
  /** Authored-field boundaries within the displayed axis maximum. */
  maxTextSegments?: string[];
  /** Validated dimensions, keyed by the shared inline-math conversion key. */
  mathMetrics?: Readonly<Record<string, MathMetrics>>;
  /** Called for each native SVG slot, including values and axis units. */
  onMath?: (key: string, tex: string) => void;
};

const MARGIN = 8;
const LABEL_W = 200; // the label column, right-aligned against the bars
const LABEL_GAP = 12;
const BAR_W = 360; // the length of the longest bar
const BAR_H = 20;
const ROW_GAP = 12;
const VALUE_GAP = 8;
const AXIS_H = 28;
const HATCH = 6;

function n(v: number): string {
  return String(round3(v));
}

function segmentsOf(text: string, segments?: readonly string[]): readonly string[] {
  if (segments && segments.join('') !== text) {
    throw Object.assign(new Error('math label segments do not match displayed label'), { code: 'E_MATH_INVALID' });
  }
  return segments ?? [text];
}

/** Diagonal lines at 45 degrees, `HATCH` px apart, clipped to the box. */
function hatch(x: number, y: number, w: number, hh: number): string {
  const parts: string[] = [];
  for (let c = -hh; c < w; c += HATCH) {
    const t0 = Math.max(0, -c);
    const t1 = Math.min(hh, w - c);
    if (t0 >= t1) continue;
    parts.push(`M${n(x + c + t0)},${n(y + hh - t0)} L${n(x + c + t1)},${n(y + hh - t1)}`);
  }
  return parts.join(' ');
}

function richText(block: RichBlock, x: number, top: number, anchor: 'start' | 'middle' | 'end',
  className: string, onMath: MeasureSvgInput['onMath']): HNode {
  let y = top;
  const lines = block.lines.map((line) => {
    const baseline = y + line.ascent;
    let at = x - (anchor === 'end' ? line.width : anchor === 'middle' ? line.width / 2 : 0);
    const runs = line.runs.map((run) => {
      const position = at;
      at += run.width;
      if (run.kind === 'math') {
        onMath?.(run.key, run.tex);
        return h('svg', { class: 'vs-math-native', 'data-vs-math-native': '', 'data-vs-math-key': run.key,
          x: n(position), y: n(baseline - run.ascent), width: n(run.width), height: n(run.height),
          viewBox: `0 0 ${n(run.width)} ${n(run.height)}`, 'aria-hidden': 'true', focusable: 'false' });
      }
      return h('text', { class: className, x: n(position), y: n(baseline), 'font-size': 14, fill: '#1a1a1a' }, run.text);
    });
    y += line.height;
    return h('g', { class: 'vs-rich-line' }, runs);
  });
  return h('g', { class: 'vs-rich-measure-text' }, lines);
}

export function measureSvg(input: MeasureSvgInput): HNode {
  const { figureId, rows } = input;
  const max = Math.max(0, ...rows.map((r) => r.value));
  const richLabels = rows.map((r) => measureRichText(r.label, LABEL_W - LABEL_GAP, input.mathMetrics, textWidth));
  const richValues = rows.map((r) => measureRichSegments(segmentsOf(r.text, r.textSegments), Number.MAX_SAFE_INTEGER, input.mathMetrics, textWidth));
  const richMax = measureRichSegments(segmentsOf(input.maxText, input.maxTextSegments), Number.MAX_SAFE_INTEGER, input.mathMetrics, textWidth);
  const valueW = Math.max(...rows.map((r, i) => richValues[i]?.width ?? textWidth(r.text)), richMax?.width ?? textWidth(input.maxText)) + VALUE_GAP;
  const labelW = Math.max(LABEL_W, ...richLabels.map((block) => block ? block.width + LABEL_GAP + MARGIN : 0));
  const barX = MARGIN + labelW;
  const labelLines = rows.map((r) => wrapText(r.label, LABEL_W - LABEL_GAP));
  const rowH = labelLines.map((lines, i) => Math.max(BAR_H, richLabels[i]?.height ?? lines.length * LINE_HEIGHT, richValues[i]?.height ?? 0));
  const tops: number[] = [];
  let y = MARGIN;
  for (const hgt of rowH) {
    tops.push(y);
    y += hgt + ROW_GAP;
  }
  const plotBottom = y - ROW_GAP + 6;
  const width = barX + BAR_W + VALUE_GAP + valueW + MARGIN;
  const axisH = richMax ? Math.max(AXIS_H, richMax.height + 16) : AXIS_H;
  const height = plotBottom + axisH + MARGIN;
  const len = (v: number) => (max > 0 ? (v / max) * BAR_W : 0);
  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'vs-measure-svg', viewBox: `0 0 ${n(width)} ${n(height)}`, width: n(width), height: n(height), role: 'group', 'aria-label': input.title, focusable: 'false' },
    // The zero line, and a tick at zero and at the maximum.
    h('path', { class: 'vs-measure-axis', d: `M${n(barX)},${n(MARGIN - 4)} L${n(barX)},${n(plotBottom)} M${n(barX)},${n(plotBottom)} L${n(barX + BAR_W)},${n(plotBottom)} M${n(barX + BAR_W)},${n(plotBottom)} L${n(barX + BAR_W)},${n(plotBottom + 5)} M${n(barX)},${n(plotBottom)} L${n(barX)},${n(plotBottom + 5)}`, fill: 'none', stroke: '#9aa3af', 'stroke-width': '1', 'aria-hidden': 'true' }),
    h('text', { class: 'vs-measure-tick', x: n(barX), y: n(plotBottom + 20), 'text-anchor': 'middle', 'font-size': 14, fill: '#3a4250', 'aria-hidden': 'true' }, '0'),
    richMax
      ? richText(richMax, barX + BAR_W, plotBottom + 8, 'middle', 'vs-measure-tick', input.onMath)
      : h('text', { class: 'vs-measure-tick', x: n(barX + BAR_W), y: n(plotBottom + 20), 'text-anchor': 'middle', 'font-size': 14, fill: '#3a4250', 'aria-hidden': 'true' }, input.maxText),
    rows.map((r, i) => {
      const top = tops[i]!;
      const barY = top + (rowH[i]! - BAR_H) / 2;
      const w = len(r.value);
      const measured = r.status === 'measured';
      const lines = labelLines[i]!;
      const labelTop = top + (rowH[i]! - (richLabels[i]?.height ?? lines.length * LINE_HEIGHT)) / 2;
      const depth = r.depth ?? 'explanation';
      const tag = depth === 'bare' ? 'g' : 'a';
      return h(tag, { class: `vs-measure-row${measured ? '' : ' vs-unmeasured'}`, href: depth === 'bare' ? undefined : `#${DOM.canonicalId(r.id)}`, id: DOM.svgInstanceId(figureId, r.id), [DOM.attr.target]: r.id, [DOM.attr.depth]: depth, [DOM.attr.interactive]: depth === 'bare' ? undefined : true, 'aria-label': depth === 'bare' ? undefined : `${r.label}: ${r.text}; ${depthAction(depth)}` },
        richLabels[i]
          ? richText(richLabels[i]!, barX - LABEL_GAP, labelTop, 'end', 'vs-measure-label', input.onMath)
          : h('text', { class: 'vs-measure-label', x: n(barX - LABEL_GAP), y: n(labelTop), 'text-anchor': 'end', 'font-size': 14, fill: '#1a1a1a' },
              lines.map((line, j) => h('tspan', { x: n(barX - LABEL_GAP), dy: j === 0 ? '1em' : String(LINE_HEIGHT) }, line))),
        measured
          ? h('rect', { class: 'vs-bar', x: n(barX), y: n(barY), width: n(w), height: n(BAR_H), fill: INK_STROKE })
          : [
              h('rect', { class: 'vs-bar-outline', x: n(barX), y: n(barY), width: n(w), height: n(BAR_H), fill: NODE_FILL, stroke: INK_STROKE, 'stroke-width': '1.5' }),
              w > 0 ? h('path', { class: 'vs-bar-hatch', d: hatch(barX, barY, w, BAR_H), fill: 'none', stroke: INK_STROKE, 'stroke-width': '1.25' }) : null,
            ],
        richValues[i]
          ? richText(richValues[i]!, barX + w + VALUE_GAP, top + (rowH[i]! - richValues[i]!.height) / 2,
              'start', 'vs-measure-value', input.onMath)
          : h('text', { class: 'vs-measure-value', x: n(barX + w + VALUE_GAP), y: n(barY + BAR_H / 2 + 5), 'font-size': 14, fill: '#1a1a1a' }, r.text),
        depth === 'bare' ? null : h('text', { class: `vs-depth-cue vs-depth-${depth}`, x: n(width - MARGIN - 10), y: n(barY + BAR_H / 2 + 4), 'font-size': 10, fill: 'currentColor', [DOM.attr.generated]: true, 'aria-hidden': 'true' }, depth === 'evidence' ? '\u258e' : '\u258e\u258e'));
    }));
}
