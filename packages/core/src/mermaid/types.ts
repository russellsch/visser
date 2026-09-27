// Shared contract for Mermaid figures (ARCHITECTURE.md §9.12). The model
// (parse, targets, validation, projection) produces MermaidFigure values; the
// compiler renders them; the runtime maps drawn elements with `renderKey`.

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
};
