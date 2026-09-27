// Build a MermaidFigure from the worker's raw structure (§9.12): name mapping,
// pseudo-state removal, derived relationship IDs, and render keys.
import type { RawResult } from './parse-worker.ts';
import type { MermaidElement, MermaidFigure, MermaidRelationship, MermaidDiagramType, RenderKey } from './types.ts';
import { cleanLabel, mapMermaidName, type MermaidIssue } from './rules.ts';

/** §2.3 caps per figure (Mermaid's own limit is 500 edges). */
export const MERMAID_MAX_ELEMENTS = 200;
export const MERMAID_MAX_RELATIONSHIPS = 400;

// Sequence records that are messages (arrows); notes, blocks, activations, and
// autonumber are not relationships (§9.12).
const MESSAGE_TYPES = new Set([0, 1, 3, 4, 5, 6, 24, 25, 33, 34, 41, 42, 43, 44, 45, 46, 47, 48, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61]);
const STATE_PSEUDO = new Set(['root_start', 'root_end', '[*]']);

type Built = { figure: MermaidFigure; issues: MermaidIssue[] };

export function buildMermaidFigure(
  figureId: string,
  source: string,
  declaredType: string,
  diagramType: MermaidDiagramType,
  raw: Extract<RawResult, { ok: true }> | undefined,
): Built {
  const issues: MermaidIssue[] = [];
  const figure: MermaidFigure = { figureId, diagramType, declaredType, source, parsed: diagramType !== 'other', elements: [], relationships: [] };
  if (diagramType === 'other' || !raw) return { figure, issues };

  const idOf = new Map<string, string>(); // original name -> mapped ID
  const taken = new Map<string, string>(); // mapped ID -> original name
  const addElement = (name: string, kind: MermaidElement['kind'], label: string, renderKey: RenderKey, members?: string[]) => {
    const id = mapMermaidName(name);
    if (id === undefined) {
      issues.push({ code: 'E_SEMANTIC', message: `Mermaid name \`${name}\` does not map to a valid target ID (after lowercasing and \`.\` to \`_\`, it must match ^[a-z][a-z0-9_-]{0,63}$)` });
      return;
    }
    const other = taken.get(id);
    if (other !== undefined && other !== name) {
      issues.push({ code: 'E_ID_DUPLICATE', message: `Mermaid names \`${other}\` and \`${name}\` both map to target ID \`${id}\`` });
      return;
    }
    taken.set(id, name);
    idOf.set(name, id);
    const element: MermaidElement = { id, name, kind, label, renderKey };
    if (members) element.members = members;
    figure.elements.push(element);
  };

  const occurrences = new Map<string, number>();
  const derivedId = (from: string, to: string) => {
    const key = `${from}~${to}`;
    const n = occurrences.get(key) ?? 0;
    occurrences.set(key, n + 1);
    return `${figureId}~${from}~${to}~${n}`;
  };
  const addRelationship = (fromName: string, toName: string, label: string, kind: MermaidRelationship['kind'], renderKey: RenderKey, explicitId?: string) => {
    const from = idOf.get(fromName);
    const to = idOf.get(toName);
    if (from === undefined || to === undefined) return; // an endpoint was rejected above
    if (explicitId !== undefined) {
      const id = mapMermaidName(explicitId);
      if (id === undefined) {
        issues.push({ code: 'E_SEMANTIC', message: `Mermaid edge ID \`${explicitId}\` does not map to a valid target ID` });
        return;
      }
      if (taken.has(id)) {
        issues.push({ code: 'E_ID_DUPLICATE', message: `Mermaid edge ID \`${explicitId}\` maps to \`${id}\`, which is already used in this figure` });
        return;
      }
      taken.set(id, explicitId);
      figure.relationships.push({ id, referenceable: true, from, to, label, kind, renderKey });
      return;
    }
    figure.relationships.push({ id: derivedId(from, to), referenceable: false, from, to, label, kind, renderKey });
  };

  if (raw.flowchart) {
    const groups = new Map(raw.flowchart.subgraphs.map((s) => [s.id, s]));
    for (const v of raw.flowchart.vertices) {
      if (groups.has(v.id)) continue; // a subgraph is also listed as a vertex
      addElement(v.id, 'mermaid-node', cleanLabel(v.text, v.id), `node:${v.id}`);
    }
    for (const s of raw.flowchart.subgraphs) {
      addElement(s.id, 'mermaid-group', cleanLabel(s.title, s.id), `group:${s.id}`);
    }
    // Members after every element exists, so nested subgraphs resolve.
    for (const element of figure.elements) {
      if (element.kind !== 'mermaid-group') continue;
      const members = groups.get(element.name)!.nodes.map((n) => idOf.get(n)).filter((m): m is string => m !== undefined);
      element.members = members;
    }
    for (const e of raw.flowchart.edges) {
      addRelationship(e.start, e.end, cleanLabel(e.text, ''), 'mermaid-edge', `edge:${e.id}`, e.userDefinedId ? e.id : undefined);
    }
  } else if (raw.state) {
    for (const s of raw.state.states) {
      if (s.composite) {
        issues.push({ code: 'E_SEMANTIC', message: `composite state \`${s.id}\` is not supported in v1 (its inner states are not visible to the build); split it into separate diagrams` });
      }
    }
    if (issues.length === 0) {
      for (const s of raw.state.states) {
        if (STATE_PSEUDO.has(s.id)) continue;
        addElement(s.id, 'mermaid-state', cleanLabel(s.description, s.id), `state:${s.id}`);
      }
      // Transitions keep the renderer's edge number (edgeN from getData()).
      // Start/end marker transitions are not relationships; they mark the
      // state as initial or terminal instead.
      const byName = new Map(figure.elements.map((e) => [e.name, e]));
      for (const r of raw.state.relations) {
        if (STATE_PSEUDO.has(r.from) && !STATE_PSEUDO.has(r.to)) {
          const el = byName.get(r.to);
          if (el) el.initial = true;
          continue;
        }
        if (STATE_PSEUDO.has(r.to) && !STATE_PSEUDO.has(r.from)) {
          const el = byName.get(r.from);
          if (el) el.terminal = true;
          continue;
        }
        if (STATE_PSEUDO.has(r.from) || STATE_PSEUDO.has(r.to)) continue;
        addRelationship(r.from, r.to, cleanLabel(r.title, ''), 'mermaid-transition', `transition:${r.edge}`);
      }
    }
  } else if (raw.sequence) {
    for (const a of raw.sequence.actors) {
      addElement(a.name, 'mermaid-participant', cleanLabel(a.description, a.name), `participant:${a.name}`);
    }
    for (const m of raw.sequence.messages) {
      if (!MESSAGE_TYPES.has(m.type) || m.from === undefined || m.to === undefined) continue;
      addRelationship(m.from, m.to, cleanLabel(m.message, ''), 'mermaid-message', `message:${m.index}`);
    }
  }

  if (figure.elements.length > MERMAID_MAX_ELEMENTS || figure.relationships.length > MERMAID_MAX_RELATIONSHIPS) {
    issues.push({
      code: 'E_LAYOUT_LIMIT',
      message: `Mermaid figure has ${figure.elements.length} elements and ${figure.relationships.length} relationships; the caps are ${MERMAID_MAX_ELEMENTS} and ${MERMAID_MAX_RELATIONSHIPS}`,
    });
  }
  return { figure, issues };
}
