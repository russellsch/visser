import type {ERRenderMath} from './er-transport.ts';
import type { InfoRenderMath } from './info-transport.ts';
import type { RequirementRenderMath } from './requirement-transport.ts';
import type { RadarRenderMath } from './radar-transport.ts';
import type { SankeyRenderMath } from './sankey-transport.ts';
import type { XYRenderMath } from './xychart-transport.ts';
// Shared contract for Mermaid figures (ARCHITECTURE.md §9.12). The model
// (parse, targets, validation, projection) produces MermaidFigure values; the
// compiler renders them; the runtime maps drawn elements with `renderKey`.
import type { QuadrantRenderMath } from './quadrant-transport.ts';
import type { JourneyRenderMath } from './journey-transport.ts';
import type { StateRenderMath } from './state-transport.ts';
import type { PieMathRecord } from './math-labels.ts';
import type { FlowchartMathRecord } from './flowchart-math.ts';
import type { FlowchartMathSlot } from './flowchart-db.ts';
import type { TimelineMathRecord } from './timeline-math.ts';
import type { SequenceMathRecord } from './sequence-math.ts';
import type { SequenceRenderPlan } from './sequence-render-plan.ts';
import type { KanbanRenderMath } from './kanban-transport.ts';

export type FlowchartRenderMath = { records: FlowchartMathRecord[]; slots: FlowchartMathSlot[]; hiddenKeys?: string[] };

export type TimelineRenderMathRecord = TimelineMathRecord & { renderCopies: number };
export type SequenceRenderMath = SequenceRenderPlan & { records: SequenceMathRecord[] };

/** The fixed browser and parse-worker sequence copy policy. Source directives cannot override it. */
export const SEQUENCE_RENDER_OPTIONS = Object.freeze({ mirrorActors: true, hideUnusedParticipants: false });

export type MermaidDiagramType = 'flowchart' | 'state' | 'sequence' | 'other';

/** How the runtime finds the drawn element for a target or relationship (§9.12 mapping). */
export type RenderKey =
  | `node:${string}` // flowchart node, by original Mermaid name
  | `group:${string}` // flowchart subgraph, by original name
  | `edge:${string}` // flowchart edge, by data-id (e1 or L_A_B_N)
  | `state:${string}` // state, by original name
  | `transition:${number}` // state transition, data-id edgeK
  | `participant:${string}` // sequence participant, by data-id name
  | `message:${number}`; // sequence message, data-id iK (raw getMessages index)

export type MermaidElement = {
  id: string; // mapped target ID (§9.12: lowercase, `.` to `_`)
  name: string; // original Mermaid name
  kind: 'mermaid-node' | 'mermaid-group' | 'mermaid-state' | 'mermaid-participant';
  label: string;
  members?: string[]; // mapped IDs of a subgraph's members
  initial?: true; // a state with a transition from the start marker [*]
  terminal?: true; // a state with a transition to the end marker [*]
  renderKey: RenderKey;
};

export type MermaidRelationship = {
  id: string; // mapped explicit edge ID, or derived FIG~from~to~N
  referenceable: boolean; // true only for an explicit flowchart edge ID
  from: string; // mapped target IDs
  to: string;
  label: string;
  kind: 'mermaid-edge' | 'mermaid-transition' | 'mermaid-message';
  renderKey: RenderKey;
};

export type MermaidFigure = {
  figureId: string; // the `mermaid` tag id
  diagramType: MermaidDiagramType;
  declaredType: string; // first keyword of the source, e.g. `flowchart`, `erDiagram`
  source: string; // the fenced body, LF-normalized
  parsed: boolean; // true for flowchart, state, sequence
  elements: MermaidElement[]; // empty when parsed is false
  relationships: MermaidRelationship[];
  mathLabels?: PieMathRecord[]; // source-owned pie fields validated in the isolated worker
  timelineMathLabels?: TimelineRenderMathRecord[]; // all timeline fields, with verified renderer copy counts
  flowchartMath?: FlowchartRenderMath;
  stateMath?: StateRenderMath;
  journeyMath?: JourneyRenderMath;
  quadrantMath?: QuadrantRenderMath;
  xyMath?: XYRenderMath;
  sankeyMath?: SankeyRenderMath;
  radarMath?: RadarRenderMath;
  requirementMath?: RequirementRenderMath;
  kanbanMath?: KanbanRenderMath;
  erMath?: ERRenderMath;
  infoMath?: InfoRenderMath;
  sequenceMath?: SequenceRenderMath; // all authored fields plus verified renderer copies
  mathBodyStartByte?: number; // original index.md byte offset of the fenced body
};
