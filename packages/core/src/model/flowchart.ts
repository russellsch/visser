import type { TargetId } from '../types.ts';
import type { TargetModel } from './targets.ts';

export type FlowchartNodeKind = 'start' | 'action' | 'decision' | 'end';
export type FlowchartNode = { id: TargetId; label: string; kind: FlowchartNodeKind; group?: TargetId };
export type FlowchartGroup = { id: TargetId; label: string; parent?: TargetId; color: 'neutral' | 'teal' | 'violet' | 'amber'; collapsed: boolean };
export type FlowchartFlow = { id: TargetId; from: TargetId; to: TargetId; label: string };
export type FlowchartModel = {
  id: TargetId;
  title: string;
  question: string;
  direction: 'DOWN' | 'RIGHT';
  nodes: readonly FlowchartNode[];
  groups: readonly FlowchartGroup[];
  flows: readonly FlowchartFlow[];
  initialCollapsed: readonly TargetId[];
};

/**
 * A renderer-facing semantic adapter. Validation owns rejection; this preserves
 * document order and source-owned identifiers for the layout/SVG adapters.
 */
export function flowchartModel(model: TargetModel, flowchartId: TargetId): FlowchartModel | undefined {
  const root = model.nodes.get(flowchartId);
  const record = model.targets.get(flowchartId);
  if (!root || !record || record.kind !== 'flowchart') return undefined;
  const children = [...model.targets.values()].filter((target) => target.parentId === flowchartId);
  const groups = children.filter((target) => target.kind === 'group').map((target) => {
    const node = model.nodes.get(target.id)!;
    const color = node.attributes['color'];
    const palette: FlowchartGroup['color'] = color === 'teal' || color === 'violet' || color === 'amber' ? color : 'neutral';
    return { id: target.id, label: target.label, parent: typeof node.attributes['parent'] === 'string' ? node.attributes['parent'] : undefined,
      color: palette, collapsed: node.attributes['collapsed'] === true };
  });
  const nodes = children.filter((target): target is typeof target & { kind: FlowchartNodeKind } => ['start', 'action', 'decision', 'end'].includes(target.kind)).map((target) => {
    const node = model.nodes.get(target.id)!;
    return { id: target.id, label: target.label, kind: target.kind, group: typeof node.attributes['group'] === 'string' ? node.attributes['group'] : undefined };
  });
  const flows = children.filter((target) => target.kind === 'flow').map((target) => {
    const node = model.nodes.get(target.id)!;
    return { id: target.id, from: String(node.attributes['from']), to: String(node.attributes['to']), label: typeof node.attributes['label'] === 'string' ? node.attributes['label'] : '' };
  });
  return { id: flowchartId, title: typeof root.attributes['title'] === 'string' ? root.attributes['title'] : record.label,
    question: typeof root.attributes['question'] === 'string' ? root.attributes['question'] : '',
    direction: root.attributes['direction'] === 'right' ? 'RIGHT' : 'DOWN', nodes, groups, flows,
    initialCollapsed: groups.filter((group) => group.collapsed).map((group) => group.id) };
}
