'use strict';
// timeline-lanes build entry (explain-component/1). Reads one component input
// as JSON on stdin and prints one explain-component-output/1 value on stdout.
// Each part is one lane: a labelled bar from `start` to `end` on a shared axis.
// It uses no network, no files, and no other modules.

const LABEL_WIDTH = 170;
const AXIS_WIDTH = 460;
const LANE_HEIGHT = 34;
const TOP = 28;

function fmt(n) {
  return String(Math.round(n * 1000) / 1000);
}

function main(text) {
  const input = JSON.parse(text);
  const unit = typeof input.component.attributes.unit === 'string' ? input.component.attributes.unit : '';
  const lanes = input.parts.map((p) => ({ id: p.id, label: p.label, start: p.attributes.start, end: p.attributes.end }));
  for (const lane of lanes) {
    if (!(lane.end >= lane.start)) throw new Error(`part ${lane.id}: end (${lane.end}) is before start (${lane.start})`);
  }
  const min = Math.min(...lanes.map((l) => l.start));
  const max = Math.max(...lanes.map((l) => l.end));
  const span = max - min || 1;
  const x = (v) => LABEL_WIDTH + ((v - min) / span) * AXIS_WIDTH;
  const width = LABEL_WIDTH + AXIS_WIDTH + 20;
  const height = TOP + lanes.length * LANE_HEIGHT + 10;
  const suffix = unit ? ` ${unit}` : '';

  const axis = {
    tag: 'g',
    children: [
      { tag: 'path', attrs: { d: `M${fmt(x(min))},${TOP - 6} L${fmt(x(max))},${TOP - 6}`, stroke: '#8a94a3', 'stroke-width': 1, fill: 'none' } },
      { tag: 'text', attrs: { x: fmt(x(min)), y: 14, 'font-size': 12, fill: '#3a4250', 'text-anchor': 'start' }, children: [`${fmt(min)}${suffix}`] },
      { tag: 'text', attrs: { x: fmt(x(max)), y: 14, 'font-size': 12, fill: '#3a4250', 'text-anchor': 'end' }, children: [`${fmt(max)}${suffix}`] },
    ],
  };
  const laneNodes = lanes.map((lane, i) => {
    const top = TOP + i * LANE_HEIGHT;
    const barWidth = Math.max(2, x(lane.end) - x(lane.start));
    return {
      tag: 'g',
      target: lane.id,
      children: [
        { tag: 'rect', attrs: { x: 0, y: top, width: fmt(width), height: LANE_HEIGHT - 4, fill: i % 2 === 0 ? '#f5f7fa' : '#ffffff' } },
        { tag: 'text', attrs: { x: 8, y: top + 20, 'font-size': 14, fill: '#1a1a1a' }, children: [lane.label] },
        { tag: 'rect', attrs: { x: fmt(x(lane.start)), y: top + 6, width: fmt(barWidth), height: LANE_HEIGHT - 16, rx: 3, ry: 3, fill: '#4a6fa5', stroke: '#2f3a4a', 'stroke-width': 1 } },
      ],
    };
  });
  const parts = {};
  for (const lane of lanes) parts[lane.id] = { text: `${lane.label}: from ${fmt(lane.start)} to ${fmt(lane.end)}${suffix}` };
  return {
    schema: 'explain-component-output/1',
    svg: { tag: 'svg', attrs: { viewBox: `0 0 ${fmt(width)} ${fmt(height)}`, width: fmt(width), height: fmt(height) }, children: [axis, ...laneNodes] },
    parts,
  };
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  try {
    process.stdout.write(JSON.stringify(main(data)));
  } catch (error) {
    process.stderr.write(`timeline-lanes: ${error.message}\n`);
    process.exitCode = 1;
  }
});
