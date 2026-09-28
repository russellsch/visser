// The bar chart of a `measure` figure (docs/IMPROVEMENTS.md §14.4). One
// horizontal bar for each reading, in authored order, from zero. Bars are
// ink; a reading that is not measured has an outline and a hatch, and its
// value text says its status, so the hatch never carries the status alone.
// The axis shows zero and the maximum, and nothing between. Geometry is a
// pure function of the readings, so the figure needs no layout engine.
import { DOM } from './dom-contract.ts';
import { h, type HNode } from './html.ts';
import { INK_STROKE, NODE_FILL } from './encoding.ts';
import { LINE_HEIGHT, round3, textWidth, wrapText } from './layout.ts';

export type MeasureRow = { id: string; label: string; value: number; status: string; text: string };

export type MeasureSvgInput = {
  figureId: string;
  title: string;
  rows: MeasureRow[];
  maxText: string; // the maximum with its unit, for the axis
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

export function measureSvg(input: MeasureSvgInput): HNode {
  const { figureId, rows } = input;
  const max = Math.max(0, ...rows.map((r) => r.value));
  const valueW = Math.max(...rows.map((r) => textWidth(r.text)), textWidth(input.maxText)) + VALUE_GAP;
  const barX = MARGIN + LABEL_W;
  const labelLines = rows.map((r) => wrapText(r.label, LABEL_W - LABEL_GAP));
  const rowH = labelLines.map((lines) => Math.max(BAR_H, lines.length * LINE_HEIGHT));
  const tops: number[] = [];
  let y = MARGIN;
  for (const hgt of rowH) {
    tops.push(y);
    y += hgt + ROW_GAP;
  }
  const plotBottom = y - ROW_GAP + 6;
  const width = barX + BAR_W + VALUE_GAP + valueW + MARGIN;
  const height = plotBottom + AXIS_H + MARGIN;
  const len = (v: number) => (max > 0 ? (v / max) * BAR_W : 0);
  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'vs-measure-svg', viewBox: `0 0 ${n(width)} ${n(height)}`, width: n(width), height: n(height), role: 'group', 'aria-label': input.title, focusable: 'false' },
    // The zero line, and a tick at zero and at the maximum.
    h('path', { class: 'vs-measure-axis', d: `M${n(barX)},${n(MARGIN - 4)} L${n(barX)},${n(plotBottom)} M${n(barX)},${n(plotBottom)} L${n(barX + BAR_W)},${n(plotBottom)} M${n(barX + BAR_W)},${n(plotBottom)} L${n(barX + BAR_W)},${n(plotBottom + 5)} M${n(barX)},${n(plotBottom)} L${n(barX)},${n(plotBottom + 5)}`, fill: 'none', stroke: '#9aa3af', 'stroke-width': '1', 'aria-hidden': 'true' }),
    h('text', { class: 'vs-measure-tick', x: n(barX), y: n(plotBottom + 20), 'text-anchor': 'middle', 'font-size': 14, fill: '#3a4250', 'aria-hidden': 'true' }, '0'),
    h('text', { class: 'vs-measure-tick', x: n(barX + BAR_W), y: n(plotBottom + 20), 'text-anchor': 'middle', 'font-size': 14, fill: '#3a4250', 'aria-hidden': 'true' }, input.maxText),
    rows.map((r, i) => {
      const top = tops[i]!;
      const barY = top + (rowH[i]! - BAR_H) / 2;
      const w = len(r.value);
      const measured = r.status === 'measured';
      const lines = labelLines[i]!;
      const labelTop = top + (rowH[i]! - lines.length * LINE_HEIGHT) / 2;
      return h('a', { class: `vs-measure-row${measured ? '' : ' vs-unmeasured'}`, href: `#${DOM.canonicalId(r.id)}`, id: DOM.svgInstanceId(figureId, r.id), [DOM.attr.target]: r.id, [DOM.attr.interactive]: true, 'aria-label': `${r.label}: ${r.text}` },
        h('text', { class: 'vs-measure-label', x: n(barX - LABEL_GAP), y: n(labelTop), 'text-anchor': 'end', 'font-size': 14, fill: '#1a1a1a' },
          lines.map((line, j) => h('tspan', { x: n(barX - LABEL_GAP), dy: j === 0 ? '1em' : String(LINE_HEIGHT) }, line))),
        measured
          ? h('rect', { class: 'vs-bar', x: n(barX), y: n(barY), width: n(w), height: n(BAR_H), fill: INK_STROKE })
          : [
              h('rect', { class: 'vs-bar-outline', x: n(barX), y: n(barY), width: n(w), height: n(BAR_H), fill: NODE_FILL, stroke: INK_STROKE, 'stroke-width': '1.5' }),
              w > 0 ? h('path', { class: 'vs-bar-hatch', d: hatch(barX, barY, w, BAR_H), fill: 'none', stroke: INK_STROKE, 'stroke-width': '1.25' }) : null,
            ],
        h('text', { class: 'vs-measure-value', x: n(barX + w + VALUE_GAP), y: n(barY + BAR_H / 2 + 5), 'font-size': 14, fill: '#1a1a1a' }, r.text));
    }));
}
