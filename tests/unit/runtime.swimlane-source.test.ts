// Real renderer/layout coverage lives in tests/fixtures/math/swimlane-browser.mjs.
// @ts-expect-error jsdom has no bundled declarations.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { stampFlowchartMathLabels } from '../../packages/runtime/src/mermaid-flowchart-source.ts';

function drawing(body: string): SVGElement {
  return new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`).window.document.querySelector('svg');
}
function edge(id: string): string {
  return `<g class="label edgeLabel" data-vs-native-edge-id="${id}"><g class="label"><foreignObject /></g></g>`;
}
it('binds exact native edge IDs even when one is a suffix of another', () => {
  const svg = drawing(edge('foo') + edge('bar-foo'));
  stampFlowchartMathLabels(svg, 'render', ['foo', 'bar-foo'].map(id => ({key: `edge:${id}`, kind: 'edge', id})));
  expect([...svg.querySelectorAll('foreignObject')].map(node => node.getAttribute('data-vs-mermaid-label'))).toEqual(['edge:foo', 'edge:bar-foo']);
});
it('rejects duplicate native edge owners before stamping any labels', () => {
  const svg = drawing(edge('foo') + edge('bar-foo') + edge('bar-foo'));
  expect(() => stampFlowchartMathLabels(svg, 'render', ['foo', 'bar-foo'].map(id => ({key: `edge:${id}`, kind: 'edge', id})))).toThrow(/ambiguous/);
  expect(svg.querySelectorAll('[data-vs-mermaid-label]').length).toBe(0);
});
it('binds an exact lane identity and rejects an ambiguous copy', () => {
  const lane = '<g id="lane" class="cluster swimlane"><g class="cluster-label"><foreignObject /></g></g>';
  const slots = [{key:'subgraph:lane', kind:'subgraph' as const, id:'lane'}];
  const svg = drawing(lane);
  stampFlowchartMathLabels(svg, 'render', slots);
  expect(svg.querySelector('foreignObject')?.getAttribute('data-vs-mermaid-label')).toBe('subgraph:lane');
  expect(() => stampFlowchartMathLabels(drawing(lane + lane), 'render', slots)).toThrow(/ambiguous/);
});
