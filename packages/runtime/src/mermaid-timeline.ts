// Math-only adapter for Mermaid 12.0.0's pinned timeline-definition chunk (MIT).
// Plain diagrams are delegated to the original renderer without changing its DOM.
import { measureMermaidLabel, type MeasuredMermaidLabel } from './mermaid-label.ts';

const SVG = 'http://www.w3.org/2000/svg';
const LR_PAD = 20;
const TD_PAD = 5;
type Task = { task: string; section: string; events: string[] };
type Db = {
  getTasks(): Task[]; getSections(): string[]; getDirection(): string;
  getCommonDb(): { getDiagramTitle(): string };
};
type Diagram = { db: Db } & Record<string, unknown>;
type Draw = (text: string, id: string, version: string, diagram: Diagram) => void | Promise<void>;
type Label = { text: string; key: string; measured: MeasuredMermaidLabel };
type Node = { descr: string; width: number; height: number; padding: number; maxHeight: number; type?: string; section?: number };

export type TimelineMathDependencies = {
  original: Draw;
  selectSvgElement(id: string): any;
  getConfig(): any;
  initGraphics(svg: any, id: string): void;
  defaultBkg(group: any, node: Node, section: number, id: string, config: any): void;
  setupGraphViewbox(_unused: undefined, svg: any, padding: number, useMaxWidth: boolean): void;
};

const ownMath = (text: string) => text.includes('$$');
const sectionColor = (index: number, conf: any) => index % (conf?.themeVariables?.THEME_COLOR_LIMIT ?? 12) - 1;
const number = (value: unknown, fallback: number) => {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** Snapshot Mermaid's mutating getTasks exactly once, then dispatch by direction. */
export function createTimelineMathRenderer(deps: TimelineMathDependencies): Draw {
  return async (text, id, version, diagram) => {
    const db = diagram.db;
    const tasks = db.getTasks(); // Upstream appends rawTasks on every call.
    const sections = db.getSections();
    const title = db.getCommonDb().getDiagramTitle();
    const proxy: Db = { ...db, getTasks: () => tasks };
    const snapshot = { ...diagram, db: proxy };
    const groups = sections.length ? sections.map((section, index) => ({
      section, index, key: String(index), tasks: tasks.filter(task => task.section === section),
    })) : [{ section: '', index: 0, key: 'none', tasks }];
    const visibleLabels = [title, ...sections, ...groups.flatMap(group =>
      group.tasks.flatMap(task => [task.task, ...task.events]))];
    if (!visibleLabels.some(ownMath)) {
      return deps.original(text, id, version, snapshot);
    }
    const conf = deps.getConfig();
    const svg = deps.selectSvgElement(id);
    const svgNode = svg.node() as SVGSVGElement | null;
    if (!svgNode || !svgNode.isConnected) throw new Error('Mermaid timeline SVG is unavailable');
    const direction = db.getDirection() === 'TD' ? 'TD' : 'LR';
    const taskColor = (group: (typeof groups)[number], index: number) =>
      sections.length || conf.timeline?.disableMulticolor ? group.index : index;
    const taskKey = (group: (typeof groups)[number], index: number) => `task:${group.key}:${index}`;
    const eventKey = (group: (typeof groups)[number], index: number, event: number) => `event:${group.key}:${index}:${event}`;
    const taskIndex = new Map(tasks.map((task, index) => [task, index]));
    const labels = new Map<string, Label>();
    const measure = async (key: string, value: string, color: number, isTitle = false) => {
      // Mermaid's `.section-N text` selectors require the same ancestor as a
      // real timeline node. The title inherits its upstream 4ex/bold styling.
      const probe = svgNode.ownerDocument.createElementNS(SVG, 'svg') as SVGSVGElement;
      probe.setAttribute('class', isTitle ? 'vs-timeline-title-probe' : `timeline-node section-${sectionColor(color, conf)}`);
      if (isTitle) { probe.style.fontSize = '4ex'; probe.style.fontWeight = 'bold'; }
      svgNode.append(probe);
      try { labels.set(key, { text: value, key, measured: await measureMermaidLabel(probe, value, '') }); }
      finally { probe.remove(); }
    };
    if (title) await measure('title', title, 0, true);
    for (const [index, section] of sections.entries()) await measure(`section:${index}`, section, index);
    for (const group of groups) for (const task of group.tasks) {
      const index = taskIndex.get(task)!;
      const color = taskColor(group, index);
      await measure(taskKey(group, index), task.task, color);
      for (const [eventIndex, event] of task.events.entries()) await measure(eventKey(group, index, eventIndex), event, color);
    }
    const get = (key: string) => {
      const label = labels.get(key);
      if (!label) throw new Error(`Missing measured timeline label ${key}`);
      return label;
    };
    const fontExtra = number(conf.fontSize, 16) * 1.1 * 0.5;
    const height = (label: Label, pad: number, minimum = 0) => Math.max(label.measured.height + fontExtra + pad, minimum);
    const createNode = (key: string, x: number, y: number, contentWidth: number, pad: number,
      minimumHeight: number, color: number, kind: string, isEvent = false) => {
      const label = get(key);
      const outerWidth = contentWidth + 2 * pad;
      const nodeHeight = height(label, pad, minimumHeight);
      const node: Node = { descr: label.text, width: outerWidth, height: nodeHeight,
        padding: pad, maxHeight: minimumHeight, type: kind, section: sectionColor(color, conf) };
      const wrapper = svg.append('g').attr('class', kind === 'task' ? 'taskWrapper' : kind === 'event' ? 'eventWrapper' : 'sectionWrapper')
        .attr('transform', `translate(${x}, ${y})`);
      const nodeGroup = wrapper.append('g').attr('class', `timeline-node section-${node.section}`);
      const bkg = nodeGroup.append('g');
      const textGroup = nodeGroup.append('g');
      deps.defaultBkg(bkg, node, node.section!, id, conf);
      if (conf.look === 'neo') nodeGroup.attr('data-look', 'neo');
      // Upstream centers SVG text after drawNode mutates its width. Center the
      // measured, ink-inclusive box within the same outer rectangle.
      const labelX = (outerWidth - label.measured.width) / 2;
      const labelY = (nodeHeight - label.measured.height) / 2 + (conf.theme?.includes('redux') && isEvent ? 3 : 0);
      label.measured.place(textGroup.node() as SVGElement, labelX, labelY).setAttribute('data-vs-mermaid-label', key);
      return { width: outerWidth, height: nodeHeight };
    };
    const line = (x1: number, y1: number, x2: number, y2: number, dashed = false) => {
      const element = svg.append('g').attr('class', 'lineWrapper').lower().append('line')
        .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
        .attr('stroke-width', dashed ? 2 : 4).attr('stroke', 'black')
        .attr('marker-end', `url(#${id}-arrowhead)`);
      if (dashed) element.attr('stroke-dasharray', '5,5');
    };
    const left = 50 + (conf.timeline?.leftMargin ?? 50);
    const titleLabel = labels.get('title');
    const top = Math.max(50, titleLabel ? titleLabel.measured.height + 35 : 50);
    // Preflight has completed. No Mermaid DOM is mutated until all async label
    // measurements succeed, so source fallback remains intact on failure.
    svg.append('g');
    deps.initGraphics(svg, id);
    let right = left;
    let bottom = top;
    if (direction === 'LR') {
      const column = (group: (typeof groups)[number], task: Task) => {
        const index = taskIndex.get(task)!;
        const widest = Math.max(get(taskKey(group, index)).measured.width,
          ...task.events.map((_event, j) => get(eventKey(group, index, j)).measured.width));
        const content = Math.max(150, widest + 2);
        return { content, step: content + 50 };
      };
      const maxTaskHeight = Math.max(0, ...groups.flatMap(group => group.tasks.map(task =>
        height(get(taskKey(group, taskIndex.get(task)!)), LR_PAD) + 20)));
      const maxSectionHeight = sections.reduce((max, _section, index) => Math.max(max, height(get(`section:${index}`), LR_PAD) + 20), 0);
      let x = left;
      for (const group of groups) {
        const grouped = group.tasks;
        const groupStartX = x;
        const taskColumnsWidth = grouped.reduce((sum, task) => sum + column(group, task).step, 0) || 200;
        const groupWidth = sections.length ? Math.max(taskColumnsWidth, get(`section:${group.index}`).measured.width + 52) : taskColumnsWidth;
        const sectionY = top;
        let taskY = top;
        if (sections.length) {
          const sectionContent = Math.max(150, groupWidth - 50, get(`section:${group.index}`).measured.width + 2);
          const sectionNode = createNode(`section:${group.index}`, x, sectionY, sectionContent, LR_PAD,
            maxSectionHeight, group.index, 'section');
          taskY = sectionY + sectionNode.height + 50;
          right = Math.max(right, x + sectionNode.width);
          bottom = Math.max(bottom, sectionY + sectionNode.height);
        }
        for (const task of grouped) {
          const index = taskIndex.get(task)!;
          const data = column(group, task);
          const color = taskColor(group, index);
          const taskNode = createNode(taskKey(group, index), x, taskY, data.content, LR_PAD, maxTaskHeight, color, 'task');
          let eventY = taskY + taskNode.height + 60;
          for (const [eventIndex] of task.events.entries()) {
            const eventNode = createNode(eventKey(group, index, eventIndex), x, eventY, data.content, LR_PAD, 50, color, 'event', true);
            eventY += eventNode.height + 10;
          }
          if (task.events.length) line(x + taskNode.width / 2, taskY + taskNode.height,
            x + taskNode.width / 2, eventY + 20, true);
          right = Math.max(right, x + taskNode.width);
          bottom = Math.max(bottom, task.events.length ? eventY - 10 : taskY + taskNode.height);
          x += data.step;
        }
        x = groupStartX + groupWidth;
      }
      line(conf.timeline?.leftMargin ?? 50, bottom + 50, Math.max(right + 60, x + 50), bottom + 50);
      right = Math.max(right, x + 50);
      bottom += 50;
    } else {
      const taskContent = Math.max(200, ...groups.flatMap(group => group.tasks.map(task =>
        get(taskKey(group, taskIndex.get(task)!)).measured.width + 2)));
      const eventContent = Math.max(300, ...groups.flatMap(group => group.tasks.flatMap(task => task.events.map((_event, j) =>
        get(eventKey(group, taskIndex.get(task)!, j)).measured.width + 2))));
      const taskOuter = taskContent + TD_PAD * 2;
      const eventOuter = eventContent + TD_PAD * 2;
      const leftWidth = taskOuter + 20;
      const rightWidth = eventOuter + 50;
      const axis = left + leftWidth;
      const sectionContent = Math.max(50, leftWidth + rightWidth - TD_PAD * 2,
        ...sections.map((_section, index) => get(`section:${index}`).measured.width + 2));
      const maxTaskHeight = Math.max(0, ...groups.flatMap(group => group.tasks.map(task =>
        height(get(taskKey(group, taskIndex.get(task)!)), TD_PAD))));
      let y = top;
      for (const group of groups) {
        if (sections.length) {
          const section = createNode(`section:${group.index}`, left, y, sectionContent, TD_PAD, 0, group.index, 'section');
          y += section.height + 20;
          right = Math.max(right, left + section.width);
        }
        for (const task of group.tasks) {
          const index = taskIndex.get(task)!;
          const color = taskColor(group, index);
          const taskX = axis - 20 - taskOuter;
          const taskNode = createNode(taskKey(group, index), taskX, y, taskContent, TD_PAD, maxTaskHeight, color, 'task');
          let eventY = y;
          for (const [j] of task.events.entries()) {
            const eventNode = createNode(eventKey(group, index, j), axis + 50, eventY, eventContent, TD_PAD, 0, color, 'event', true);
            line(axis, eventY + eventNode.height / 2, axis + 50, eventY + eventNode.height / 2, true);
            eventY += eventNode.height + 10;
          }
          right = Math.max(right, axis + 50 + eventOuter);
          y = Math.max(y + taskNode.height, task.events.length ? eventY - 10 : y) + 30;
        }
        if (!group.tasks.length) y += 30;
      }
      bottom = Math.max(bottom, y);
      line(axis, top - 20, axis, bottom + 20);
      bottom += 20;
    }
    if (titleLabel) {
      titleLabel.measured.place(svgNode, Math.max(left, (left + right - titleLabel.measured.width) / 2), 10)
        .setAttribute('data-vs-mermaid-label', 'title');
      right = Math.max(right, left + titleLabel.measured.width);
    }
    if (![right, bottom].every(Number.isFinite) || right <= 0 || bottom <= 0) throw new Error('Invalid Mermaid timeline geometry');
    // The upstream viewBox helper retains Mermaid's max-width and padding
    // behavior; our placed foreignObjects already reserve ink-inclusive boxes.
    deps.setupGraphViewbox(undefined, svg, conf.timeline?.padding ?? 50, conf.timeline?.useMaxWidth ?? false);
  };
}
