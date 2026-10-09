// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { select } from 'd3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimelineMathRenderer } from '../../packages/runtime/src/mermaid-timeline.ts';

const measure = vi.hoisted(() => vi.fn(async (_svg: SVGSVGElement, text = '') => {
  const width = text.includes('WIDE') ? 500 : text.includes('$$') ? 90 : text.length * 8;
  const height = text.includes('TALL') ? 110 : text.includes('$$') ? 42 : 16;
  return {
    width, height,
    place(parent: SVGElement, x: number, y: number) {
      const element = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      for (const [name, value] of Object.entries({ x, y, width, height })) element.setAttribute(name, String(value));
      element.setAttribute('data-text', text);
      parent.append(element);
      return element;
    },
  };
}));
vi.mock('../../packages/runtime/src/mermaid-label.ts', () => ({ measureMermaidLabel: measure }));

type Task = { task: string; section: string; events: string[] };
function fixture(direction: string, sections: string[], tasks: Task[], title = '') {
  const document = new JSDOM('<!doctype html><body><svg id="timeline"></svg></body>').window.document;
  const svg = document.querySelector('svg') as unknown as SVGSVGElement;
  const getTasks = vi.fn(() => tasks);
  const original = vi.fn((_text: string, _id: string, _version: string, diagram: any) => {
    expect(diagram.db.getTasks()).toBe(tasks);
  });
  const setupGraphViewbox = vi.fn();
  let number = 0;
  const draw = createTimelineMathRenderer({
    original,
    selectSvgElement: () => select(svg),
    getConfig: () => ({ fontSize: '16px', themeVariables: { THEME_COLOR_LIMIT: 12 }, timeline: {} }),
    initGraphics: (selection, id) => { selection.append('defs').append('marker').attr('id', `${id}-arrowhead`); },
    defaultBkg: (group, node) => {
      group.append('rect').attr('id', `node-${number++}`).attr('width', node.width).attr('height', node.height);
    },
    setupGraphViewbox,
  });
  const db = { getTasks, getSections: () => sections, getDirection: () => direction,
    getCommonDb: () => ({ getDiagramTitle: () => title }) };
  return { svg, getTasks, original, setupGraphViewbox,
    render: () => draw('', 'timeline', '', { db }) };
}

function node(svg: SVGSVGElement, key: string) {
  const label = svg.querySelector(`[data-vs-mermaid-label="${key}"]`) as SVGElement | null;
  expect(label).not.toBeNull();
  const wrapper = label!.closest('.taskWrapper, .eventWrapper, .sectionWrapper') as SVGElement;
  const transform = wrapper.getAttribute('transform') ?? '';
  const match = /translate\(([-.\d]+), ([-.\d]+)\)/.exec(transform);
  expect(match).not.toBeNull();
  const rect = wrapper.querySelector('rect')!;
  return { x: Number(match![1]), y: Number(match![2]),
    width: Number(rect.getAttribute('width')), height: Number(rect.getAttribute('height')) };
}

beforeEach(() => measure.mockClear());

describe('Mermaid timeline math adapter', () => {
  it('paints connectors behind node backgrounds and labels in both orientations', async () => {
    for (const direction of ['LR', 'TD']) {
      const test = fixture(direction, ['A $$s$$'], [{ task: '$$x$$', section: 'A $$s$$', events: ['$$y$$'] }]);
      await test.render();
      const children = [...test.svg.children];
      const firstNode = children.findIndex(child => child.matches('.taskWrapper, .eventWrapper, .sectionWrapper'));
      const lines = children.filter(child => child.matches('.lineWrapper'));
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every(line => children.indexOf(line) < firstNode)).toBe(true);
    }
  });
  it('delegates no-math diagrams and calls the mutating task getter once', async () => {
    const test = fixture('LR', ['A'], [{ task: 'One', section: 'A', events: ['Two'] }]);
    await test.render();
    expect(test.original).toHaveBeenCalledOnce();
    expect(test.getTasks).toHaveBeenCalledOnce();
    expect(measure).not.toHaveBeenCalled();
    expect(test.setupGraphViewbox).not.toHaveBeenCalled();
  });

  it('keeps the upstream renderer for math in a task omitted by section filtering', async () => {
    const test = fixture('LR', ['A'], [{ task: '$$x$$', section: 'B', events: [] }]);
    await test.render();
    expect(test.original).toHaveBeenCalledOnce();
    expect(test.getTasks).toHaveBeenCalledOnce();
    expect(measure).not.toHaveBeenCalled();
  });

  it('sizes LR columns before routing, stacks tall events after task bottoms, and keys repeated sections', async () => {
    const test = fixture('LR', ['Same', 'Same'], [
      { task: '$$WIDE$$', section: 'Same', events: ['$$TALL$$', '$$x$$'] },
      { task: 'Next', section: 'Same', events: [] },
    ], '$$Title$$');
    await test.render();
    expect(test.original).not.toHaveBeenCalled();
    expect(test.getTasks).toHaveBeenCalledOnce();
    const first = node(test.svg, 'task:0:0');
    const next = node(test.svg, 'task:0:1');
    const event0 = node(test.svg, 'event:0:0:0');
    const event1 = node(test.svg, 'event:0:0:1');
    const repeated = node(test.svg, 'task:1:0');
    expect(first.width).toBeGreaterThanOrEqual(540);
    expect(next.x).toBeGreaterThanOrEqual(first.x + first.width + 10);
    expect(event0.y).toBeGreaterThan(first.y + first.height);
    expect(event1.y).toBeGreaterThanOrEqual(event0.y + event0.height + 10);
    expect(repeated.x).toBeGreaterThan(next.x + next.width);
    expect(node(test.svg, 'section:0').width).toBeGreaterThan(first.width);
    expect(test.svg.querySelector('[data-vs-mermaid-label="title"]')).not.toBeNull();
    expect(test.setupGraphViewbox).toHaveBeenCalledOnce();
  });

  it('widens TD sides and starts the next section below its last tall event block', async () => {
    const test = fixture('TD', ['A', 'B'], [
      { task: '$$WIDE$$', section: 'A', events: ['$$TALL$$', '$$x$$'] },
      { task: '$$y$$', section: 'B', events: [] },
    ]);
    await test.render();
    const task = node(test.svg, 'task:0:0');
    const event = node(test.svg, 'event:0:0:1');
    const nextSection = node(test.svg, 'section:1');
    expect(task.width).toBeGreaterThanOrEqual(510);
    expect(event.x).toBeGreaterThan(task.x + task.width);
    expect(nextSection.y).toBeGreaterThanOrEqual(event.y + event.height + 30);
    expect(node(test.svg, 'task:1:1').y).toBeGreaterThan(nextSection.y + nextSection.height);
    expect(test.svg.querySelectorAll('line[stroke-dasharray="5,5"]')).toHaveLength(2);
    expect(test.getTasks).toHaveBeenCalledOnce();
  });

  it('reserves an LR group column wide enough for a math section heading', async () => {
    const test = fixture('LR', ['$$WIDE$$', 'B'], [
      { task: 'a', section: '$$WIDE$$', events: [] },
      { task: 'b', section: 'B', events: [] },
    ]);
    await test.render();
    const section = node(test.svg, 'section:0');
    const next = node(test.svg, 'section:1');
    expect(next.x).toBeGreaterThanOrEqual(section.x + section.width + 10);
    expect(test.getTasks).toHaveBeenCalledOnce();
  });
});
