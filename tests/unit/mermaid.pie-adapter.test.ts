// @ts-expect-error jsdom is supplied by the test harness without declarations.
import { JSDOM } from 'jsdom';
import { arc, pie, scaleOrdinal, select } from 'd3';
import { describe, expect, it, vi } from 'vitest';
import { createPieDraw } from '../../packages/runtime/src/mermaid-pie.ts';

const measure = vi.hoisted(() => vi.fn(async (svg: SVGSVGElement, text: string, className: string) => {
  const math = text.includes('$$');
  const width = math ? 90 : text.length * 8;
  const height = math ? 42 : 16;
  return {
    width, height,
    place(parent: SVGElement, x: number, y: number) {
      const foreign = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      foreign.setAttribute('x', String(x)); foreign.setAttribute('y', String(y));
      foreign.setAttribute('width', String(width)); foreign.setAttribute('height', String(height));
      foreign.setAttribute('data-label', text); foreign.setAttribute('data-measure-class', className);
      foreign.textContent = text;
      parent.append(foreign);
      return foreign;
    },
  };
}));
vi.mock('../../packages/runtime/src/mermaid-label.ts', () => ({ measureMermaidLabel: measure }));

function fixture(position: string, title = 'Title', showData = false) {
  const doc = new JSDOM('<!doctype html><body><svg id="pie"></svg></body>').window.document;
  const svg = doc.getElementById('pie') as unknown as SVGSVGElement;
  const sections = new Map([['one', 40], ['$$x^2$$', 60], ['zero', 0]]);
  const configureSvgSize = vi.fn();
  const draw = createPieDraw({
    arc, d3pie: pie, scaleOrdinal,
    selectSvgElement: () => select(svg),
    cleanAndMerge: (base, override) => ({ ...(base as object), ...(override as object) }),
    parseFontSize: () => [2],
    getConfig: () => ({ pie: {}, themeVariables: Object.fromEntries([
      ['pieOuterStrokeWidth', '2px'], ...Array.from({ length: 12 }, (_unused, index) => [`pie${index + 1}`, `#${String(index + 1).padStart(6, '0')}`]),
    ]) }),
    configureSvgSize,
  });
  return {
    svg, sections, configureSvgSize,
    render: () => draw('', 'pie', '', { db: {
      getConfig: () => ({ legendPosition: position, donutHole: 0.5, textPosition: 0.5, useMaxWidth: false, highlightSlice: 'hover' }),
      getSections: () => sections, getShowData: () => showData, getDiagramTitle: () => title,
    } }),
  };
}

function geometry(svg: SVGSVGElement) {
  const values = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
  expect(values).toHaveLength(4);
  expect(values.every(Number.isFinite)).toBe(true);
  expect(values[2]).toBeGreaterThan(0);
  expect(values[3]).toBeGreaterThan(0);
  return values;
}

describe('Mermaid pie math adapter', () => {
  it.each(['center', 'top', 'bottom', 'left', 'right'])('measures every %s legend row before geometry', async position => {
    measure.mockClear();
    const { svg, render, configureSvgSize } = fixture(position);
    await render();
    const rows = Array.from(svg.querySelectorAll('g.legend'));
    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.querySelector('foreignObject')?.getAttribute('data-label'))).toEqual(['one', '$$x^2$$', 'zero']);
    expect(rows.map(row => Number(/,([^)]*)\)/.exec(row.getAttribute('transform') ?? '')?.[1]))).toEqual(
      position === 'bottom' ? [207, 229, 272] :
      position === 'top' ? [-185, -163, -120] : [-43.5, -21.5, 21.5],
    );
    expect(rows[1]?.querySelector('rect')?.getAttribute('y')).toBe('12.5');
    expect(measure.mock.calls.filter(call => call[1] === '$$x^2$$')[0]?.[0].classList.contains('legend')).toBe(true);
    expect(svg.querySelectorAll('path.pieCircle.highlightedOnHover')).toHaveLength(2);
    expect(svg.querySelector('circle.pieOuterCircle')).not.toBeNull();
    expect(svg.querySelector('foreignObject[data-label="Title"]')).not.toBeNull();
    const bounds = geometry(svg);
    expect(configureSvgSize).toHaveBeenCalledWith(expect.anything(), bounds[3], bounds[2], false);
  });

  it('keeps no-math row geometry and shows data values', async () => {
    const { svg, sections, render } = fixture('right', '', true);
    sections.clear(); sections.set('alpha', 1); sections.set('beta', 2);
    await render();
    const rows = Array.from(svg.querySelectorAll('g.legend'));
    expect(rows.map(row => row.querySelector('foreignObject')?.textContent)).toEqual(['alpha [1]', 'beta [2]']);
    expect(rows.map(row => row.getAttribute('transform'))).toEqual(['translate(216,-22)', 'translate(216,0)']);
    expect(svg.querySelector('g > g > circle')?.getAttribute('r')).toBe('186');
    expect(svg.querySelectorAll('path.pieCircle')).toHaveLength(2);
    expect(geometry(svg)[3]).toBe(450);
  });

  it('expands center legend and lifts the title when math rows exceed the nominal chart', async () => {
    const { svg, sections, render } = fixture('center', '$$T$$');
    sections.clear();
    for (let index = 0; index < 12; index++) sections.set(`$$x_${index}$$`, 1);
    await render();
    const bounds = geometry(svg);
    expect(bounds[1]).toBeLessThan(0);
    expect(bounds[3]).toBeGreaterThan(450);
    const title = svg.querySelector('foreignObject[data-label="$$T$$"]')!;
    expect(Number(title.getAttribute('y')) + 42).toBeLessThan(-250);
  });
});
