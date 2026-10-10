import assert from 'node:assert/strict';
import { layoutGraph } from '../../packages/core/src/compiler/layout.ts';
import { graphSvg } from '../../packages/core/src/compiler/svg.ts';
import { render } from '../../packages/core/src/compiler/html.ts';

const graph = {
  id: 'flow_check', direction: 'DOWN', groups: [{ id: 'phase', label: 'Validate' }],
  nodes: [
    { id: 'start', label: 'Receive', flowKind: 'start' },
    { id: 'choice', label: 'Accepted?', flowKind: 'decision', group: 'phase' },
    { id: 'correct', label: 'Correct', flowKind: 'action', group: 'phase' },
    { id: 'end', label: 'Ready', flowKind: 'end' },
  ],
  edges: [
    { id: 'in', from: 'start', to: 'choice', label: '' },
    { id: 'yes', from: 'choice', to: 'end', label: 'Yes' },
    { id: 'no', from: 'choice', to: 'correct', label: 'No' },
    { id: 'retry', from: 'correct', to: 'choice', label: 'Again' },
  ],
};
const layout = await layoutGraph(graph);
const choice = layout.nodes.find((n) => n.id === 'choice');
assert(choice && choice.width > 180 && choice.height >= 68);
for (const rel of graph.edges.filter((e) => e.from === 'choice' || e.to === 'choice')) {
  const edge = layout.edges.find((e) => e.id === rel.id);
  const p = rel.to === 'choice' ? edge.points.at(-1) : edge.points[0];
  const norm = Math.abs(p.x - choice.x - choice.width / 2) / (choice.width / 2)
    + Math.abs(p.y - choice.y - choice.height / 2) / (choice.height / 2);
  assert(Math.abs(norm - 1) < 0.01, `${rel.id}: ${norm}`);
}
const labels = new Map([...graph.nodes, ...graph.groups, ...graph.edges].map((x) => [x.id, x.label]));
const rels = new Map(graph.edges.map((e) => [e.id, e]));
const parents = new Map([...graph.nodes.map((n) => [n.id, n.group]), ...graph.groups.map((g) => [g.id, g.parent])]);
const svg = render(graphSvg({ figureId: graph.id, title: 'Flow check', layout, flowchart: true,
  collapsed: ['phase'], initialCollapsed: [], groupColorOf: () => 'teal',
  parentOf: (id) => parents.get(id), labelOf: (id) => labels.get(id) ?? id,
  kindOf: (id) => graph.nodes.find((n) => n.id === id)?.flowKind,
  roleOf: () => undefined, relationship: (id) => rels.get(id) }));
for (const token of ['data-vs-flowchart="true"', 'class="vs-shape vs-flow-decision"',
  'class="vs-flow-terminal-cue"', 'vs-flow-group-color-teal',
  'data-vs-fold-initial="false"', 'data-vs-fold-expand="phase"',
  'data-vs-fold-selection=""', 'data-vs-proxy-for="yes"']) assert(svg.includes(token), token);
console.log(JSON.stringify({ width: layout.width, height: layout.height, choice: [choice.width, choice.height], svgBytes: Buffer.byteLength(svg) }));
