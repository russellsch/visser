// Adapted from Mermaid 12.0.0 src/diagrams/pie/pieRenderer.ts (MIT).
// The pinned Mermaid chunk supplies its own D3/configuration functions. Visser
// measures source-owned labels before placing the legend or sizing the viewBox.
import { measureMermaidLabel, type MeasuredMermaidLabel } from './mermaid-label.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = 40;
const LEGEND_RECT_SIZE = 18;
const LEGEND_SPACING = 4;
const BASE_HEIGHT = 450;
const BASE_WIDTH = BASE_HEIGHT;
const ROW_HEIGHT = LEGEND_RECT_SIZE + LEGEND_SPACING;

type Section = { label: string; value: number };
type ArcDatum = { data: Section };
type PieDb = {
  getConfig(): Record<string, unknown>;
  getSections(): Map<string, number>;
  getShowData(): boolean;
  getDiagramTitle(): string;
};

// This is the boundary to Mermaid's version-pinned, untyped dist chunk. The
// factory receives its existing bindings; it does not load another D3 copy.
export type PieDrawDependencies = {
  arc: () => any;
  d3pie: () => any;
  scaleOrdinal: (range: string[]) => any;
  selectSvgElement: (id: string) => any;
  cleanAndMerge: (base: unknown, override: unknown) => any;
  parseFontSize: (value: unknown) => [number | undefined, ...unknown[]];
  getConfig: () => any;
  configureSvgSize: (svg: any, height: number, width: number, useMaxWidth: boolean) => void;
  log?: { debug(message: string): void };
};

type Row = { key: string; label: string; value: number; measured: MeasuredMermaidLabel; height: number; top: number };

/** Replacement for `diagram.renderer.draw` in the pinned Mermaid pie chunk. */
export function createPieDraw(deps: PieDrawDependencies) {
  return async function draw(text: string, id: string, _version: string, diagObj: { db: PieDb }): Promise<void> {
    deps.log?.debug('rendering pie chart\n' + text);
    const db = diagObj.db;
    const globalConfig = deps.getConfig();
    const pieConfig = deps.cleanAndMerge(db.getConfig(), globalConfig.pie);
    const svg = deps.selectSvgElement(id);
    const svgNode = svg.node() as SVGSVGElement | null;
    if (!svgNode) throw new Error('Mermaid pie SVG is unavailable');
    const group = svg.append('g').attr('transform', `translate(${BASE_WIDTH / 2},${BASE_HEIGHT / 2})`);
    const groupNode = group.node() as SVGElement;
    const theme = globalConfig.themeVariables;
    const parsedStrokeWidth = deps.parseFontSize(theme.pieOuterStrokeWidth)[0];
    const outerStrokeWidth = typeof parsedStrokeWidth === 'number' && Number.isFinite(parsedStrokeWidth) ? parsedStrokeWidth : 2;
    const radius = Math.min(BASE_WIDTH, BASE_HEIGHT) / 2 - MARGIN;
    const hole = pieConfig.donutHole > 0 && pieConfig.donutHole <= 0.9 ? pieConfig.donutHole : 0;
    const arcGenerator = deps.arc().innerRadius(hole * radius).outerRadius(radius);
    const labelArcGenerator = deps.arc().innerRadius(radius * pieConfig.textPosition).outerRadius(radius * pieConfig.textPosition);
    const pie = group.append('g');
    pie.append('circle').attr('cx', 0).attr('cy', 0).attr('r', radius + outerStrokeWidth / 2).attr('class', 'pieOuterCircle');

    const sections = db.getSections();
    const sum = [...sections.values()].reduce((total, value) => total + value, 0);
    const data = [...sections.entries()].map(([label, value]) => ({ label, value }));
    const pieData = data.filter(section => section.value / sum * 100 >= 1);
    const arcs: ArcDatum[] = deps.d3pie().value((section: Section) => section.value).sort(null)(pieData);
    const filteredArcs = arcs.filter(datum => (datum.data.value / sum * 100).toFixed(0) !== '0');
    const colors = Array.from({ length: 12 }, (_unused, index) => theme[`pie${index + 1}`] as string);
    const color = deps.scaleOrdinal(colors).domain([...sections.keys()]);
    pie.selectAll('mySlices').data(filteredArcs).enter().append('path')
      .attr('d', arcGenerator).attr('fill', (datum: ArcDatum) => color(datum.data.label))
      .attr('class', (datum: ArcDatum) => pieConfig.highlightSlice === 'hover' ? 'pieCircle highlightedOnHover'
        : pieConfig.highlightSlice === datum.data.label ? 'pieCircle highlighted' : 'pieCircle');
    pie.selectAll('mySlices').data(filteredArcs).enter().append('text')
      .text((datum: ArcDatum) => `${(datum.data.value / sum * 100).toFixed(0)}%`)
      .attr('transform', (datum: ArcDatum) => `translate(${labelArcGenerator.centroid(datum)})`)
      .style('text-anchor', 'middle').attr('class', 'slice');

    // Mermaid styles legend text through `.legend text`, rather than a text
    // class. A temporary attached SVG with that ancestor gives the shared
    // measurer the exact upstream typography and colour.
    const legendProbe = svgNode.ownerDocument.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    legendProbe.setAttribute('class', 'legend');
    svgNode.append(legendProbe);
    const rows: Row[] = [];
    let title: MeasuredMermaidLabel | undefined;
    try {
      const titleText = db.getDiagramTitle();
      if (titleText) title = await measureMermaidLabel(svgNode, titleText, 'pieTitleText');
      let top = 0;
      for (const section of data) {
        const label = db.getShowData() ? `${section.label} [${section.value}]` : section.label;
        const measured = await measureMermaidLabel(legendProbe, label, '');
        const height = Math.max(ROW_HEIGHT, measured.height + 1);
        rows.push({ ...section, key: `section:${rows.length}`, measured, height, top });
        top += height;
      }
    } finally {
      legendProbe.remove();
    }

    const totalLegendHeight = rows.reduce((total, row) => total + row.height, 0);
    const longestTextWidth = rows.reduce((longest, row) => Math.max(longest, row.measured.width), 0);
    const labelOffset = LEGEND_RECT_SIZE + LEGEND_SPACING;
    const legendPosition = pieConfig.legendPosition;
    let chartAndLegendWidth = BASE_WIDTH + MARGIN;
    let chartAndLegendHeight = BASE_HEIGHT;
    let pieX = 0;
    let pieY = 0;
    let legendX = 0;
    let legendY = 0;
    switch (legendPosition) {
      case 'center':
        legendX = -longestTextWidth / 2 - labelOffset;
        legendY = -totalLegendHeight / 2;
        break;
      case 'top':
        chartAndLegendHeight += totalLegendHeight;
        legendX = -longestTextWidth / 2 - labelOffset;
        legendY = -radius;
        pieY = totalLegendHeight + ROW_HEIGHT;
        break;
      case 'bottom':
        chartAndLegendHeight += totalLegendHeight;
        legendX = -longestTextWidth / 2 - labelOffset;
        legendY = radius + ROW_HEIGHT;
        break;
      case 'left':
        chartAndLegendWidth += labelOffset + longestTextWidth;
        legendX = -radius - labelOffset;
        legendY = -totalLegendHeight / 2;
        pieX = longestTextWidth + labelOffset;
        break;
      case 'right':
      default:
        chartAndLegendWidth += labelOffset + longestTextWidth;
        legendX = 12 * LEGEND_RECT_SIZE;
        legendY = -totalLegendHeight / 2;
        break;
    }
    if (pieX || pieY) pie.attr('transform', `translate(${pieX},${pieY})`);

    // The title's bottom matches Mermaid's original baseline at y=-200.
    // Tall legends can grow above it, so lift the title to retain clearance.
    const titleBottom = Math.min(-(BASE_HEIGHT - 50) / 2, legendY - 15);
    const titleX = title ? -title.width / 2 : 0;
    const titleY = title ? titleBottom - title.height : 0;
    if (title) title.place(groupNode, titleX, titleY).setAttribute('data-vs-mermaid-label', 'title');

    const legend = group.selectAll('.legend').data(rows).enter().append('g').attr('class', 'legend')
      .attr('transform', (row: Row) => `translate(${legendX},${legendY + row.top})`);
    legend.append('rect').attr('width', LEGEND_RECT_SIZE).attr('height', LEGEND_RECT_SIZE)
      .attr('y', (row: Row) => (row.height - LEGEND_RECT_SIZE) / 2)
      .style('fill', (row: Row) => color(row.label)).style('stroke', (row: Row) => color(row.label));
    legend.each(function (this: SVGElement, row: Row) {
      row.measured.place(this, labelOffset, (row.height - row.measured.height) / 2).setAttribute('data-vs-mermaid-label', row.key);
    });

    // Keep Mermaid's original nominal canvas, expanding only for measured
    // content that would otherwise be clipped (including a tall center legend).
    let minX = 0, minY = 0, maxX = chartAndLegendWidth, maxY = chartAndLegendHeight;
    const include = (x: number, y: number, width: number, height: number) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width); maxY = Math.max(maxY, y + height);
    };
    const center = BASE_WIDTH / 2;
    const pieExtent = radius + outerStrokeWidth / 2;
    include(center + pieX - pieExtent, center + pieY - pieExtent, pieExtent * 2, pieExtent * 2);
    if (title) include(center + titleX, center + titleY, title.width, title.height);
    for (const row of rows) {
      include(center + legendX, center + legendY + row.top, labelOffset + row.measured.width, row.height);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    if (![minX, minY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw new Error('Mermaid pie geometry is invalid');
    }
    svg.attr('viewBox', `${minX} ${minY} ${width} ${height}`);
    deps.configureSvgSize(svg, height, width, pieConfig.useMaxWidth);
  };
}
