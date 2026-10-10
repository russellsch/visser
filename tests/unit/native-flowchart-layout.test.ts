import { describe, expect, it } from 'vitest';
import { layoutGraph, type GraphInput } from '../../packages/core/src/compiler/layout.ts';
import { graphSvg } from '../../packages/core/src/compiler/svg.ts';
import { render } from '../../packages/core/src/compiler/html.ts';
import { adaptFlowchartLayout, GeometryBudget, FLOWCHART_GEOMETRY_WORK_LIMIT } from '../../packages/core/src/compiler/flowchart-geometry.ts';

const graph: GraphInput = {
  id: 'flow_probe', direction: 'DOWN',
  groups: [{ id: 'phase', label: 'Validate' }],
  nodes: [
    { id: 'start', label: 'Receive', flowKind: 'start' },
    { id: 'choice', label: 'Accepted?', flowKind: 'decision', group: 'phase' },
    { id: 'correct', label: 'Correct', flowKind: 'action', group: 'phase' },
    { id: 'end', label: 'Ready', flowKind: 'end' },
  ],
  edges: [
    { id: 'in', from: 'start', to: 'choice', label: '' },
    { id: 'yes', from: 'choice', to: 'end', label: 'Yes' },
    { id: 'yes_alternative', from: 'choice', to: 'end', label: 'Also yes' },
    { id: 'no', from: 'choice', to: 'correct', label: 'No' },
    { id: 'retry', from: 'correct', to: 'choice', label: 'Again' },
  ],
};

describe('native flowchart layout adapter @FCgeometry', () => {
  it('keeps RIGHT rank order and docks a decision self-loop on the outline', async () => {
    const right: GraphInput = { id: 'right_flow', direction: 'RIGHT', groups: [],
      nodes: [{ id: 'a', label: 'Start', flowKind: 'start' },
        { id: 'b', label: 'Check?', flowKind: 'decision' },
        { id: 'c', label: 'End', flowKind: 'end' }],
      edges: [{ id: 'ab', from: 'a', to: 'b', label: '' },
        { id: 'bc', from: 'b', to: 'c', label: 'Yes' },
        { id: 'retry', from: 'b', to: 'b', label: 'Again' }] };
    const layout = await layoutGraph(right);
    const [a, b, c] = layout.nodes;
    expect(a!.x + a!.width / 2).toBeLessThan(b!.x + b!.width / 2);
    expect(b!.x + b!.width / 2).toBeLessThan(c!.x + c!.width / 2);
    const loop = layout.edges.find((e) => e.id === 'retry')!;
    expect(loop.points).toHaveLength(4);
    for (const p of [loop.points[0]!, loop.points.at(-1)!]) {
      const norm = Math.abs(p.x - b!.x - b!.width / 2) / (b!.width / 2)
        + Math.abs(p.y - b!.y - b!.height / 2) / (b!.height / 2);
      expect(norm).toBeCloseTo(1, 2);
    }
  });

  it('keeps DOWN direction, sizes and docks the diamond, and preserves fold identity', async () => {
    const layout = await layoutGraph(graph);
    const choice = layout.nodes.find((n) => n.id === 'choice')!;
    expect(choice.width).toBeGreaterThan(180);
    expect(choice.height).toBeGreaterThanOrEqual(68);
    for (const rel of graph.edges.filter((e) => e.from === 'choice' || e.to === 'choice')) {
      const edge = layout.edges.find((e) => e.id === rel.id)!;
      const point = rel.to === 'choice' ? edge.points.at(-1)! : edge.points[0]!;
      const norm = Math.abs(point.x - choice.x - choice.width / 2) / (choice.width / 2)
        + Math.abs(point.y - choice.y - choice.height / 2) / (choice.height / 2);
      expect(norm).toBeCloseTo(1, 2);
    }
    for (const rel of graph.edges.filter((e) => e.from === 'start' || e.to === 'end')) {
      const edge = layout.edges.find((e) => e.id === rel.id)!;
      const node = layout.nodes.find((n) => n.id === (rel.from === 'start' ? 'start' : 'end'))!;
      const point = rel.from === 'start' ? edge.points[0]! : edge.points.at(-1)!;
      const radius = node.height / 2;
      const dx = Math.max(0, Math.abs(point.x - node.x - node.width / 2) - (node.width / 2 - radius));
      const dy = Math.max(0, Math.abs(point.y - node.y - node.height / 2));
      expect((dx * dx + dy * dy) / (radius * radius)).toBeCloseTo(1, 2);
    }
    const label = new Map<string, string>([...graph.nodes, ...graph.groups, ...graph.edges].map((x): [string, string] => [x.id, x.label]));
    const rel = new Map(graph.edges.map((e): [string, typeof e] => [e.id, e]));
    const parent = new Map<string, string | undefined>([...graph.nodes.map((n): [string, string | undefined] => [n.id, n.group]), ...graph.groups.map((g): [string, string | undefined] => [g.id, g.parent])]);
    const svg = render(graphSvg({ figureId: graph.id, title: 'Probe', layout, flowchart: true,
      collapsed: ['phase'], initialCollapsed: [], groupColorOf: () => 'teal',
      parentOf: (id) => parent.get(id), labelOf: (id) => label.get(id) ?? id,
      kindOf: (id) => graph.nodes.find((n) => n.id === id)?.flowKind,
      roleOf: () => undefined, relationship: (id) => rel.get(id) }));
    expect(svg).toContain('data-vs-flowchart="true"');
    expect(svg).toContain('class="vs-shape vs-flow-decision"');
    expect(svg).toContain('class="vs-flow-terminal-cue"');
    expect(svg).toContain('vs-flow-group-color-teal');
    expect(svg).toContain('data-vs-fold-initial="false"');
    expect(svg).toContain('data-vs-fold-expand="phase"');
    expect(svg).toContain('data-vs-fold-selection=""');
    expect(svg).toContain('data-vs-proxy-for="yes"');
    expect(svg).toContain('data-vs-proxy-for="yes_alternative"');
  });

  it('charges a hand-counted 73 primitives for two pill endpoints before exceeding the budget',()=>{
    const input:GraphInput={id:'simple',direction:'DOWN',groups:[],nodes:[{id:'s',label:'S',flowKind:'start'},{id:'e',label:'E',flowKind:'end'}],edges:[{id:'se',from:'s',to:'e',label:''}]};
    const fixture={width:100,height:200,groups:[],nodes:[{id:'s',x:0,y:0,width:100,height:50,lines:['S']},{id:'e',x:0,y:150,width:100,height:50,lines:['E']}],edges:[{id:'se',points:[{x:50,y:50},{x:50,y:150}]}]};
    // 2 page dimensions + 2*4 rectangle scalars + 2*2 point scalars
    // + 3 docking/tangent checks + 2*28 binary-search containment checks.
    const exact=new GeometryBudget(73);adaptFlowchartLayout(input,structuredClone(fixture),exact);expect(exact.used).toBe(73);
    expect(()=>adaptFlowchartLayout(input,structuredClone(fixture),new GeometryBudget(72))).toThrow(/work limit/);
  });

  it('enforces the hand-counted 99-unit one-proxy fold budget',()=>{
    // One group, one member, one outside endpoint, one unlabelled vertical flow.
    // Work ledger: boxes/membership 10; combos/chains 8; exit/slots 10;
    // fixed visibility 5; proxy generation/routing/state/compatibility 38;
    // original headers 2; proxy headers/state/docking/visibility 22;
    // final proxy label-state scan 4. Total 99, independent of observed counters.
    const fixture={width:200,height:340,flowchartGeometryWork:FLOWCHART_GEOMETRY_WORK_LIMIT-99,
      groups:[{id:'g',label:'g',x:0,y:0,width:200,height:200}],
      nodes:[{id:'a',x:90,y:100,width:20,height:20,lines:['A']},{id:'b',x:90,y:300,width:20,height:20,lines:['B']}],
      edges:[{id:'ab',points:[{x:100,y:120},{x:100,y:300}]}]};
    const input={figureId:'f',title:'F',layout:fixture,flowchart:true,collapsed:['g'],parentOf:(id:string)=>id==='a'?'g':undefined,labelOf:(id:string)=>id,roleOf:()=>undefined,kindOf:()=>undefined,relationship:(id:string)=>id==='ab'?{id,from:'a',to:'b',label:''}:undefined};
    expect(()=>graphSvg(input)).not.toThrow();
    expect(render(graphSvg(input))).toContain('data-vs-proxy-for="ab"');
    expect(()=>graphSvg({...input,layout:{...fixture,flowchartGeometryWork:fixture.flowchartGeometryWork+1}})).toThrow(/work limit/);
  });

  it('enforces exact geometry work and rejects an unrelated node crossing', async () => {
    const layout = await layoutGraph(graph);
    const observed = new GeometryBudget();
    adaptFlowchartLayout(graph, structuredClone(layout), observed);
    const atLimit = new GeometryBudget(FLOWCHART_GEOMETRY_WORK_LIMIT);
    atLimit.used = FLOWCHART_GEOMETRY_WORK_LIMIT - observed.used;
    expect(() => adaptFlowchartLayout(graph, structuredClone(layout), atLimit)).not.toThrow();
    expect(atLimit.used).toBe(FLOWCHART_GEOMETRY_WORK_LIMIT);
    const over = new GeometryBudget(FLOWCHART_GEOMETRY_WORK_LIMIT);
    over.used = FLOWCHART_GEOMETRY_WORK_LIMIT - observed.used + 1;
    expect(() => adaptFlowchartLayout(graph, structuredClone(layout), over)).toThrowError(/work limit/);

    const crossed = structuredClone(layout);
    const yes = crossed.edges.find((e) => e.id === 'yes')!;
    const [a, b] = [yes.points[0]!, yes.points[1]!];
    crossed.nodes.push({ id: 'obstacle', x: (a.x + b.x) / 2 - 5, y: (a.y + b.y) / 2 - 5,
      width: 10, height: 10, lines: ['obstacle'] });
    try { adaptFlowchartLayout(graph, crossed); throw new Error('expected rejection'); }
    catch (error) { expect(error).toMatchObject({ code: 'E_LAYOUT_LIMIT' }); }
  });

  it('emits separate nested summaries and controls when both groups start expanded', async () => {
    const nested: GraphInput = { ...graph,
      groups: [{ id: 'phase', label: 'Validation phase' }, { id: 'detail', label: 'Check details', parent: 'phase' }],
      nodes: graph.nodes.map((n) => n.group === 'phase' ? { ...n, group: 'detail' } : n),
    };
    const layout = await layoutGraph(nested);
    const labels = new Map<string, string>([...nested.nodes, ...nested.groups, ...nested.edges].map((x): [string, string] => [x.id, x.label]));
    const parents = new Map<string, string | undefined>([...nested.nodes.map((n): [string, string | undefined] => [n.id, n.group]),
      ...nested.groups.map((g): [string, string | undefined] => [g.id, g.parent])]);
    const rels = new Map(nested.edges.map((e): [string, typeof e] => [e.id, e]));
    const svg = render(graphSvg({ figureId: nested.id, title: 'Nested', layout,
      flowchart: true, collapsed: nested.groups.map((g) => g.id), initialCollapsed: [],
      parentOf: (id) => parents.get(id), labelOf: (id) => labels.get(id) ?? id,
      kindOf: (id) => nested.nodes.find((n) => n.id === id)?.flowKind,
      roleOf: () => undefined, relationship: (id) => rels.get(id) }));
    for (const group of ['phase', 'detail']) {
      expect(svg).toContain(`data-vs-fold="${group}"`);
      expect(svg).toContain(`data-vs-fold-expand="${group}"`);
      expect(svg).toContain(`data-vs-fold-toggle="${group}"`);
    }
    expect((svg.match(/data-vs-fold-initial="false"/g) ?? []).length).toBe(4);
    expect(svg).toContain('data-vs-proxy-from="phase"');
    expect(svg).toContain('data-vs-proxy-from="detail"');
  });

  it('rejects a folded proxy route crossing another visible node', async () => {
    const layout = await layoutGraph(graph);
    const labels = new Map<string, string>([...graph.nodes, ...graph.groups, ...graph.edges].map((x): [string, string] => [x.id, x.label]));
    const rels = new Map(graph.edges.map((e): [string, typeof e] => [e.id, e]));
    const parents = new Map<string, string | undefined>([...graph.nodes.map((n): [string, string | undefined] => [n.id, n.group]),
      ...graph.groups.map((g): [string, string | undefined] => [g.id, g.parent])]);
    const input = { figureId: graph.id, title: 'Proxy check', layout, flowchart: true,
      collapsed: ['phase'], initialCollapsed: [] as string[],
      parentOf: (id: string) => parents.get(id), labelOf: (id: string) => labels.get(id) ?? id,
      kindOf: (id: string) => graph.nodes.find((n) => n.id === id)?.flowKind,
      roleOf: () => undefined, relationship: (id: string) => rels.get(id) };
    const svg = graphSvg(input);
    const find = (node: typeof svg): typeof svg | undefined => {
      if (node.attrs.some(([key, value]) => key === 'data-vs-proxy-for' && value === 'yes')) return node;
      for (const child of node.children) if (typeof child !== 'string') {
        const found = find(child); if (found) return found;
      }
      return undefined;
    };
    const proxy = find(svg)!;
    const path = proxy.children.find((child) => typeof child !== 'string' && child.attrs.some(([key, value]) => key === 'class' && value === 'vs-line')) as typeof svg;
    expect(path).toBeTruthy();
    const data = path.attrs.find(([key]) => key === 'd')![1];
    const points = [...data.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((m) => ({ x: Number(m[1]) - 8, y: Number(m[2]) - 8 }));
    const a = points[0]!, b = points[1]!;
    const blocked = structuredClone(layout);
    blocked.nodes.push({ id: 'obstacle', x: (a.x + b.x) / 2 - 5, y: (a.y + b.y) / 2 - 5, width: 10, height: 10, lines: ['Obstacle'] });
    try { graphSvg({ ...input, layout: blocked }); throw new Error('expected rejection'); }
    catch (error) { expect(error).toMatchObject({ code: 'E_LAYOUT_LIMIT' }); }
  });
});
