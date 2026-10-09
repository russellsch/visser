import {extractAgentflowMath} from './agentflow-math.ts';
// @ts-expect-error checked source loader outside the TS project
import {agentflowContractLoadHook} from '../../../../scripts/mermaid-agentflow-contract.mjs';
import {prepareERNodePlan} from './er-node-plan.ts';
import {erMathTransport,type ERRenderMath} from './er-transport.ts';
// @ts-expect-error checked source loader outside the TS project
import {erLayoutContractLoadHook} from '../../../../scripts/mermaid-er-layout-contract.mjs';
// @ts-expect-error checked source loader outside the TS project
import { erContractLoadHook } from '../../../../scripts/mermaid-er-contract.mjs';
import { installERNodeDb } from './er-node-db.ts';
import {LocatedERMathError} from './er-authored-math.ts';
import { reconcileERNodeState } from './er-node-state.ts';
import { extractInfoMath, LocatedInfoMathError } from './info-math.ts';
import { infoMathTransport, type InfoRenderMath } from './info-transport.ts';
// @ts-expect-error checked source loader outside the TS project
import { kanbanContractLoadHook } from '../../../../scripts/mermaid-kanban-contract.mjs';
import { installKanbanNodeDb } from './kanban-node-db.ts';
import { extractKanbanNodeMath, preflightKanbanNodeMath } from './kanban-node-math.ts';
import { LocatedKanbanMathError } from './kanban-math.ts';
import { kanbanMathTransport, type KanbanRenderMath } from './kanban-transport.ts';
// @ts-expect-error checked source loader outside the TS project
import { requirementContractLoadHook } from '../../../../scripts/mermaid-requirement-contract.mjs';
import { installRequirementNodeDb } from './requirement-node-db.ts';
import { extractRequirementNodeMath } from './requirement-node-math.ts';
import { LocatedRequirementMathError } from './requirement-math.ts';
import { requirementMathTransport, type RequirementRenderMath } from './requirement-transport.ts';
// @ts-expect-error checked source loader outside the TS project
import { radarContractLoadHook } from '../../../../scripts/mermaid-radar-contract.mjs';
import { installRadarNodeDb } from './radar-node-db.ts';
import { extractRadarNodeMath } from './radar-node-math.ts';
import { LocatedRadarMathError } from './radar-math.ts';
import { radarMathTransport,type RadarRenderMath } from './radar-transport.ts';
import * as parserContract from '@mermaid-js/parser';
// @ts-expect-error checked source loader outside the TS project
import { sankeyContractLoadHook } from '../../../../scripts/mermaid-sankey-contract.mjs';
import { installSankeyNodeDb } from './sankey-node-db.ts';
import { extractSankeyNodeMath } from './sankey-node-math.ts';
import { LocatedSankeyMathError } from './sankey-math.ts';
import type { SankeyRenderMath } from './sankey-transport.ts';
// @ts-expect-error checked source loader outside the TS project
import { xyContractLoadHook } from '../../../../scripts/mermaid-xychart-contract.mjs';
import { installXYNodeDb } from './xychart-node-db.ts';
import { extractXYNodeMath } from './xychart-node-math.ts';
import { LocatedXYMathError } from './xychart-math.ts';
import type { XYRenderMath } from './xychart-transport.ts';
// @ts-expect-error checked source loader outside the TS project
import { quadrantSnapshotLoadHook } from '../../../../scripts/mermaid-quadrant-snapshot.mjs';
import { installQuadrantNodeDb } from './quadrant-node-db.ts';
import { extractQuadrantNodeMath } from './quadrant-node-math.ts';
import { LocatedQuadrantMathError } from './quadrant-math.ts';
import type { QuadrantRenderMath } from './quadrant-transport.ts';
// Mermaid parse worker (§9.12). Runs in its own Node process, started with
// spawnSync by parse.ts: reads {figures:[{figureId, source, type}]} as JSON on
// stdin and writes {results:[…]} as JSON on stdout. It extracts structure only.
//
// DOMPurify needs a DOM, which the build does not have. In source mode a resolve
// hook maps `dompurify` to a stub; the release bundle aliases it at build time.
import { registerHooks } from 'node:module';
// @ts-expect-error checked source loader outside the TS project
import { stateObserverLoadHook } from '../../../../scripts/mermaid-state-observer-loader.mjs';
import { installStateNodeDb } from './state-node-db.ts';
import { extractStateNodeMath } from './state-node-math.ts';
import { LocatedStateMathError } from './state-math.ts';
import type { StateRenderMath } from './state-transport.ts';
import { installJourneyNodeDb } from './journey-node-db.ts';
import { extractJourneyNodeMath } from './journey-node-math.ts';
import { LocatedJourneyMathError } from './journey-math.ts';
import type { JourneyRenderMath } from './journey-transport.ts';
import { SEQUENCE_RENDER_OPTIONS, type MermaidDiagramType, type TimelineRenderMathRecord, type FlowchartRenderMath, type SequenceRenderMath } from './types.ts';
import { extractPieMathLabels, LocatedPieMathError, type PieMathLabels, type PieMathRecord } from './math-labels.ts';
import { extractTimelineMathLabels, LocatedTimelineMathError, type TimelineMathLabels, type TimelineMathRecord } from './timeline-math.ts';
import { MathPolicyError } from '../math/policy.ts';
import { extractFlowchartMath, LocatedFlowchartMathError } from './flowchart-math.ts';
import { reconcileFlowchartData } from './flowchart-db.ts';
import { extractSequenceMath, LocatedSequenceMathError } from './sequence-math.ts';
import { LocatedSequenceLabelError } from './sequence-labels.ts';
import { planSequenceRenderCopies } from './sequence-render-plan.ts';
import { installSequenceNodeDb } from './sequence-node-db.ts';
import { checkMermaidSource, declaredTypeOf } from './rules.ts';

export type RawFlowchart = {
  vertices: Array<{ id: string; text: unknown; labelType?: string }>;
  edges: Array<{ id: string; start: string; end: string; text: unknown; userDefinedId: boolean }>;
  subgraphs: Array<{ id: string; title: unknown; nodes: string[] }>;
};
export type RawState = {
  states: Array<{ id: string; type: string; description: string | undefined; composite: boolean }>;
  // From getData().edges: only `edgeN` edges, where N is the drawn edge number
  // (note connectors also take numbers, so the relation index is not enough).
  relations: Array<{ from: string; to: string; title: unknown; edge: number }>;
};
export type RawSequence = {
  actors: Array<{ name: string; description: unknown; type: string }>;
  messages: Array<{ index: number; type: number; from: string | undefined; to: string | undefined; message: unknown }>;
};
export type RawResult =
  | { figureId: string; ok: true; type: MermaidDiagramType; flowchart?: RawFlowchart; state?: RawState; sequence?: RawSequence;
      flowchartMath?: FlowchartRenderMath; sequenceMath?: SequenceRenderMath; stateMath?: StateRenderMath; journeyMath?: JourneyRenderMath; quadrantMath?: QuadrantRenderMath; xyMath?: XYRenderMath; sankeyMath?: SankeyRenderMath; radarMath?: RadarRenderMath; requirementMath?: RequirementRenderMath; erMath?: ERRenderMath; kanbanMath?: KanbanRenderMath; infoMath?: InfoRenderMath;
      pieMath?: PieMathLabels; timelineMath?: Omit<TimelineMathLabels, 'records'> & { records: TimelineRenderMathRecord[] } }
  | { figureId: string; ok: false; error: string; code?: 'E_MATH' | 'E_LIMIT' | 'E_SEMANTIC' | 'E_UNSAFE_CONTENT'; line?: number; startByte?: number; endByte?: number };

type Input = { figures: Array<{ figureId: string; source: string; originalSource?: string; type: MermaidDiagramType; pie?: boolean; timeline?: boolean; journey?: boolean; quadrant?: boolean; xy?: boolean; sankey?: boolean; radar?: boolean; requirement?: boolean; er?: boolean; kanban?: boolean; info?: boolean }> };

function installStub(): void {
  let here: string | undefined;
  try {
    here = import.meta.url;
  } catch {
    here = undefined;
  }
  if (!here) return; // bundled: `dompurify` is aliased at build time
  const stub = new URL('./dompurify-stub.ts', here).href;
  registerHooks({load:quadrantSnapshotLoadHook()});
  registerHooks({load:xyContractLoadHook()});
  registerHooks({load:sankeyContractLoadHook()});
  registerHooks({load:radarContractLoadHook()});
  registerHooks({load:requirementContractLoadHook()});
  registerHooks({load:kanbanContractLoadHook()});
  registerHooks({load:erContractLoadHook()});
  registerHooks({load:erLayoutContractLoadHook()});
  registerHooks({load:agentflowContractLoadHook()});
  registerHooks({
    load: stateObserverLoadHook(new URL('./state-observer.ts', here).href),
    resolve(specifier, context, nextResolve) {
      if (specifier === 'dompurify') return { url: stub, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

type Db = Record<string, (...args: unknown[]) => unknown>;

function checkPieDb(db: Db, records: PieMathRecord[]): void {
  const root = (role: PieMathRecord['role']): string => records.findLast(record => record.role === role)?.value ?? '';
  const actualTitle = db['getDiagramTitle']?.();
  const actualAccTitle = db['getAccTitle']?.();
  const actualAccDescr = db['getAccDescription']?.();
  const actualSections = db['getSections']?.();
  if (typeof actualTitle !== 'string' || typeof actualAccTitle !== 'string' || typeof actualAccDescr !== 'string' || !(actualSections instanceof Map)) {
    throw new MathPolicyError('E_MATH_INVALID', 'pie renderer did not expose expected title, accessibility, and section fields');
  }
  for (const [role, actual] of [['title', actualTitle], ['accTitle', actualAccTitle], ['accDescr', actualAccDescr]] as const) {
    if (root(role) !== actual) throw new MathPolicyError('E_MATH_INVALID', `pie ${role} differs between source parser and renderer`);
  }
  const expected = records.filter(record => record.role === 'section.label' && record.active).map(record => record.value);
  const shown = [...actualSections.keys()];
  if (shown.length !== expected.length || expected.some((value, index) => value !== shown[index])) {
    throw new MathPolicyError('E_MATH_INVALID', 'pie section labels differ between source parser and renderer');
  }
}

/** Compare actual renderer data once; getTasks() mutates its backing array. */
function checkTimelineDb(db: Db, records: TimelineMathRecord[]): TimelineRenderMathRecord[] {
  const common = db['getCommonDb']?.() as Db | undefined;
  const actualTitle = common?.['getDiagramTitle']?.();
  const actualAccTitle = common?.['getAccTitle']?.();
  const actualAccDescr = common?.['getAccDescription']?.();
  const actualSections = db['getSections']?.();
  const actualTasks = db['getTasks']?.(); // exactly once
  if (typeof actualTitle !== 'string' || typeof actualAccTitle !== 'string' || typeof actualAccDescr !== 'string' ||
      !Array.isArray(actualSections) || !Array.isArray(actualTasks) ||
      !actualSections.every(value => typeof value === 'string')) {
    throw new MathPolicyError('E_MATH_INVALID', 'timeline renderer did not expose expected label fields');
  }
  const root = (role: TimelineMathRecord['role']): string => records.findLast(record => record.role === role)?.value ?? '';
  for (const [role, actual] of [['title', actualTitle], ['accTitle', actualAccTitle], ['accDescr', actualAccDescr]] as const) {
    if (root(role) !== actual) throw new MathPolicyError('E_MATH_INVALID', `timeline ${role} differs between source parser and renderer`);
  }
  const sections = records.filter(record => record.role === 'section');
  if (sections.length !== actualSections.length || sections.some((record, index) => record.value !== actualSections[index] || record.sectionIndex !== index)) {
    throw new MathPolicyError('E_MATH_INVALID', 'timeline sections differ between source parser and renderer');
  }
  const tasks = records.filter(record => record.role === 'task');
  const events = records.filter(record => record.role === 'event');
  if (tasks.length !== actualTasks.length) throw new MathPolicyError('E_MATH_INVALID', 'timeline task count differs between source parser and renderer');
  for (const [index, record] of tasks.entries()) {
    const actual = actualTasks[index] as Record<string, unknown> | undefined;
    const actualEvents = actual?.['events'];
    const expectedSection = record.sectionIndex === undefined ? '' : sections[record.sectionIndex]?.value;
    const expectedEvents = events.filter(event => event.taskIndex === index).sort((a, b) => (a.eventIndex ?? 0) - (b.eventIndex ?? 0));
    if (!actual || actual['task'] !== record.value || actual['section'] !== expectedSection || !Array.isArray(actualEvents) ||
        actualEvents.length !== expectedEvents.length || expectedEvents.some((event, eventIndex) =>
          event.eventIndex !== eventIndex || actualEvents[eventIndex] !== event.value)) {
      throw new MathPolicyError('E_MATH_INVALID', `timeline task ${index} or its events differ between source parser and renderer`);
    }
  }
  if (events.some(event => event.taskIndex === undefined || event.taskIndex < 0 || event.taskIndex >= tasks.length)) {
    throw new MathPolicyError('E_MATH_INVALID', 'timeline event does not belong to a renderer task');
  }
  const counts = new Map<string, number>();
  for (const name of actualSections) counts.set(name, (counts.get(name) ?? 0) + 1);
  return records.map(record => ({ ...record, renderCopies: record.role === 'task' || record.role === 'event'
    ? Math.max(1, counts.get((actualTasks[record.taskIndex!] as Record<string, unknown>)['section'] as string) ?? 0) : 1 }));
}

function extract(type: MermaidDiagramType, db: Db): Omit<Extract<RawResult, { ok: true }>, 'figureId' | 'ok' | 'type'> {
  if (type === 'flowchart') {
    const vertices = [...(db['getVertices']!() as Map<string, Record<string, unknown>>).values()];
    if (vertices.some(vertex => vertex['icon'] !== undefined || vertex['img'] !== undefined)) {
      throw new MathPolicyError('E_UNSAFE_CONTENT', 'decoded flowchart icon/img metadata is not allowed');
    }
    const edges = db['getEdges']!() as Array<Record<string, unknown>>;
    const subgraphs = (db['getSubGraphs']?.() ?? []) as Array<Record<string, unknown>>;
    return {
      flowchart: {
        vertices: vertices.map((v) => ({ id: String(v['id']), text: Array.isArray(v['text']) ? v['text'][0] : v['text'], labelType: typeof v['labelType'] === 'string' ? v['labelType'] : undefined })),
        edges: edges.map((e) => ({ id: String(e['id']), start: String(e['start']), end: String(e['end']), text: e['text'], userDefinedId: e['isUserDefinedId'] === true })),
        subgraphs: subgraphs.map((s) => ({ id: String(s['id']), title: s['title'], nodes: (s['nodes'] as unknown[] ?? []).map(String) })),
      },
    };
  }
  if (type === 'state') {
    const states = [...(db['getStates']!() as Map<string, Record<string, unknown>>).values()];
    const edges = ((db['getData']!() as { edges?: Array<Record<string, unknown>> }).edges ?? []);
    return {
      state: {
        states: states.map((s) => ({
          id: String(s['id']),
          type: String(s['type'] ?? 'default'),
          description: Array.isArray(s['descriptions']) && typeof s['descriptions'][0] === 'string' ? s['descriptions'][0] : undefined,
          composite: s['doc'] !== undefined && s['doc'] !== null,
        })),
        relations: edges.flatMap((e) => {
          const m = /^edge(\d+)$/.exec(String(e['id']));
          return m ? [{ from: String(e['start']), to: String(e['end']), title: e['label'], edge: Number(m[1]) }] : [];
        }),
      },
    };
  }
  const actors = [...(db['getActors']!() as Map<string, Record<string, unknown>>).values()];
  const messages = db['getMessages']!() as Array<Record<string, unknown>>;
  return {
    sequence: {
      actors: actors.map((a) => ({ name: String(a['name']), description: a['description'], type: String(a['type'] ?? 'participant') })),
      messages: messages.map((m, index) => ({
        index,
        type: Number(m['type']),
        from: typeof m['from'] === 'string' ? m['from'] : undefined,
        to: typeof m['to'] === 'string' ? m['to'] : undefined,
        message: m['message'],
      })),
    },
  };
}

async function main(): Promise<void> {
  if ((parserContract as unknown as {visserRadarParserContractVersion?:number}).visserRadarParserContractVersion !== 1) throw new MathPolicyError('E_MATH_INVALID','Radar parser contract patch is missing');
  // Mermaid may log; keep stdout for the JSON result only.
  console.log = (...args: unknown[]) => console.error(...args);
  installStub();
  const input = JSON.parse(await readStdin()) as Input;
  const { default: mermaid } = (await import('mermaid')) as unknown as {
    default: { initialize(c: object): void; parse(t: string): Promise<unknown>; mermaidAPI: { getDiagramFromText(t: string): Promise<{ db: Db; text: string; type: string }> } };
  };
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, logLevel: 'fatal', sequence: SEQUENCE_RENDER_OPTIONS });
  await installSequenceNodeDb(input.figures.some(figure => figure.type === 'sequence' && figure.source.includes('<')));
  if (input.figures.some(figure => figure.type === 'state')) await installStateNodeDb();
  if (input.figures.some(figure => figure.journey)) await installJourneyNodeDb();
  if (input.figures.some(figure => figure.requirement)) await installRequirementNodeDb();
  if (input.figures.some(figure => figure.kanban)) await installKanbanNodeDb();
  if (input.figures.some(figure => declaredTypeOf(figure.source) === 'erDiagram')) await installERNodeDb();
  if (input.figures.some(figure => figure.radar)) await installRadarNodeDb();
  if (input.figures.some(figure => figure.sankey)) await installSankeyNodeDb();
  if (input.figures.some(figure => figure.quadrant)) await installQuadrantNodeDb();
  if (input.figures.some(figure => figure.xy)) await installXYNodeDb();
  const results: RawResult[] = [];
  for (const figure of input.figures) {
    try {
      if (figure.er && (declaredTypeOf(figure.source) !== 'erDiagram' || figure.type !== 'other' || figure.pie || figure.timeline || figure.journey || figure.quadrant || figure.xy || figure.sankey || figure.radar || figure.requirement || figure.kanban || figure.info)) throw new MathPolicyError('E_MATH_INVALID','ER request does not match its declared family');
      if (figure.info && (declaredTypeOf(figure.source) !== 'info' || figure.type !== 'other' || figure.pie || figure.timeline || figure.journey || figure.quadrant || figure.xy || figure.sankey || figure.radar || figure.requirement || figure.kanban)) throw new MathPolicyError('E_MATH_INVALID','Info request does not match its declared family');
      if (figure.kanban && (declaredTypeOf(figure.source) !== 'kanban' || figure.type !== 'other' || figure.pie || figure.timeline || figure.journey || figure.quadrant || figure.xy || figure.sankey || figure.radar || figure.requirement)) throw new MathPolicyError('E_MATH_INVALID','Kanban request does not match its declared family');
      if (figure.requirement && (declaredTypeOf(figure.source) !== 'requirementDiagram' || figure.type !== 'other' || figure.pie || figure.timeline || figure.journey || figure.quadrant || figure.xy || figure.sankey || figure.radar)) throw new MathPolicyError('E_MATH_INVALID','Requirement request does not match its declared family');
      if (figure.radar && (!['radar-beta','radar-beta:'].includes(declaredTypeOf(figure.source)) || figure.type !== 'other' || figure.pie || figure.timeline || figure.journey || figure.quadrant || figure.xy || figure.sankey)) throw new MathPolicyError('E_MATH_INVALID','Radar request does not match its declared family');
      if (figure.sankey && (!['sankey','sankey-beta'].includes(declaredTypeOf(figure.source)) || figure.type !== 'other' || figure.pie || figure.timeline || figure.journey || figure.quadrant || figure.xy)) throw new MathPolicyError('E_MATH_INVALID','Sankey request does not match its declared family');
      if (figure.xy && (!['xychart','xychart-beta'].includes(declaredTypeOf(figure.source)) || figure.type !== 'other' || figure.pie || figure.timeline || figure.journey || figure.quadrant)) throw new MathPolicyError('E_MATH_INVALID','XY request does not match its declared family');
      if (figure.quadrant && (declaredTypeOf(figure.source) !== 'quadrantChart' || figure.type !== 'other' || figure.pie || figure.timeline || figure.journey)) throw new MathPolicyError('E_MATH_INVALID','quadrant request does not match its declared family');
      if (figure.journey && (declaredTypeOf(figure.source) !== 'journey' || figure.type !== 'other' || figure.pie || figure.timeline)) {
        throw new MathPolicyError('E_MATH_INVALID', 'journey request does not match its declared family');
      }
      if (figure.type === 'flowchart' || figure.journey || figure.quadrant || figure.xy || figure.sankey || figure.radar || figure.requirement || figure.kanban || figure.info) {
        const issue = checkMermaidSource(figure.source).find(issue => issue.code !== 'E_MATH');
        if (issue) {
          results.push({ figureId: figure.figureId, ok: false, error: issue.message,
            code: issue.code === 'E_UNSAFE_CONTENT' ? 'E_UNSAFE_CONTENT' : issue.code === 'E_LIMIT' ? 'E_LIMIT' : 'E_SEMANTIC', line: issue.line });
          continue;
        }
      }
      if (declaredTypeOf(figure.source) === 'erDiagram') {
        // Structural and unsafe-content checks precede the native parse.
        const issue=checkMermaidSource(figure.source).find(issue=>issue.code!=='E_MATH');
        if(issue) {
          results.push({figureId:figure.figureId,ok:false,error:issue.message,
            code:issue.code==='E_MATH'?'E_MATH':issue.code==='E_UNSAFE_CONTENT'?'E_UNSAFE_CONTENT':issue.code==='E_LIMIT'?'E_LIMIT':'E_SEMANTIC',line:issue.line});
          continue;
        }
      }
      // Collect sequence fields before any native parse can consult external
      // details or merge decoded participant properties.
      const sequenceMath = figure.type === 'sequence'
        ? await extractSequenceMath(figure.originalSource ?? figure.source, undefined, figure.source) : undefined;
      if (figure.kanban) {
        const preflight=await preflightKanbanNodeMath(figure.originalSource ?? figure.source,figure.source);
        if (preflight.total.occurrences && figure.originalSource===undefined) throw new MathPolicyError('E_MATH_INVALID','Kanban math requires original fenced source');
      }
      const infoMath = figure.info ? await extractInfoMath(figure.originalSource ?? figure.source,undefined,figure.source) : undefined;
      if (infoMath?.total.occurrences && figure.originalSource===undefined) throw new MathPolicyError('E_MATH_INVALID','Info math requires original fenced source');
      await mermaid.parse(figure.source); // also registers the diagram type
      // The source collector creates a fresh FlowDB, which clears shared
      // accessibility state. Reconstruct the actual DB after collecting.
      const flowchartMath = figure.type === 'flowchart'
        ? await (declaredTypeOf(figure.source) === 'agentflow-beta' ? extractAgentflowMath : extractFlowchartMath)(figure.originalSource ?? figure.source, undefined, figure.source) : undefined;
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(figure.source);
      if (declaredTypeOf(figure.source) === 'erDiagram') {
        if (diagram.type !== 'er' || figure.type !== 'other' || figure.pie || figure.timeline || figure.journey || figure.quadrant || figure.xy || figure.sankey || figure.radar || figure.requirement || figure.kanban || figure.info) throw new MathPolicyError('E_MATH_INVALID','ER native diagram type differs');
        const original=figure.originalSource ?? figure.source;
        const checked=await reconcileERNodeState(diagram.db,diagram.text,original,figure.source);
        const plan=await prepareERNodePlan(checked,original);
        if(plan.budget.total.occurrences&&figure.originalSource===undefined)throw new MathPolicyError('E_MATH_INVALID','ER math requires original fenced source');
        const erMath=plan.budget.total.occurrences?erMathTransport(plan,checked.completed.htmlLabels):undefined;
        results.push({figureId:figure.figureId,ok:true,type:figure.type,...(erMath?{erMath}:{})});
      } else if (figure.info) {
        if (!infoMath || diagram.type !== 'info' || diagram.text !== infoMath.labels.parserSource) throw new MathPolicyError('E_MATH_INVALID','Info native parser input differs');
        const transport=infoMath.total.occurrences ? infoMathTransport(infoMath) : undefined;
        results.push({figureId:figure.figureId,ok:true,type:figure.type,...(transport ? {infoMath:transport} : {})});
      } else if (figure.pie) {
        // Raw substring checks miss dollars decoded by Mermaid's grammar.
        const pieMath = await extractPieMathLabels(figure.originalSource ?? figure.source, undefined, figure.source);
        if (pieMath.total.occurrences > 0 && figure.originalSource === undefined) {
          throw new MathPolicyError('E_MATH_INVALID', 'pie math requires original fenced source');
        }
        if (pieMath.total.occurrences === 0) {
          results.push({ figureId: figure.figureId, ok: true, type: figure.type });
          continue;
        }
        // Mermaid's pie DB retains the first duplicate section label. Every
        // source occurrence was already validated and budgeted by the adapter.
        const seen = new Set<string>();
        for (const record of pieMath.records) if (record.role === 'section.label') {
          record.active = !seen.has(record.value);
          seen.add(record.value);
        }
        checkPieDb(diagram.db, pieMath.records);
        results.push({ figureId: figure.figureId, ok: true, type: figure.type, pieMath });
      } else if (figure.timeline) {
        const timelineMath = await extractTimelineMathLabels(figure.originalSource ?? figure.source, undefined, figure.source);
        if (timelineMath.total.occurrences > 0 && figure.originalSource === undefined) {
          throw new MathPolicyError('E_MATH_INVALID', 'timeline math requires original fenced source');
        }
        const records = checkTimelineDb(diagram.db, timelineMath.records);
        results.push({ figureId: figure.figureId, ok: true, type: figure.type,
          ...(timelineMath.total.occurrences > 0 ? { timelineMath: { ...timelineMath, records } } : {}) });
      } else if (figure.kanban) {
        const plan=await extractKanbanNodeMath(figure.originalSource ?? figure.source,figure.source,diagram.db,diagram.text);
        const kanbanMath=plan.math.total.occurrences ? kanbanMathTransport(plan.math) : undefined;
        results.push({figureId:figure.figureId,ok:true,type:figure.type,...(kanbanMath ? {kanbanMath} : {})});
      } else if (figure.requirement) {
        const plan = await extractRequirementNodeMath(figure.originalSource ?? figure.source, figure.source, diagram.db, diagram.text);
        if (plan.math.total.occurrences && figure.originalSource === undefined) throw new MathPolicyError('E_MATH_INVALID', 'Requirement math requires original fenced source');
        const requirementMath = plan.math.total.occurrences ? requirementMathTransport(plan.math, plan.snapshot, plan.slots) : undefined;
        results.push({figureId: figure.figureId, ok: true, type: figure.type, ...(requirementMath ? {requirementMath} : {})});
      } else if (figure.radar) {
        const plan=await extractRadarNodeMath(figure.originalSource??figure.source,figure.source,diagram.db);
        if(plan.math.total.occurrences && figure.originalSource===undefined)throw new MathPolicyError('E_MATH_INVALID','Radar math requires original fenced source');
        const radarMath=plan.math.total.occurrences?radarMathTransport(plan.math,plan.snapshot,plan.slots):undefined;
        results.push({figureId:figure.figureId,ok:true,type:figure.type,...(radarMath?{radarMath}:{})});
      } else if (figure.sankey) {
        const sankeyMath=await extractSankeyNodeMath(figure.originalSource??figure.source,figure.source,diagram.db);
        if(sankeyMath && figure.originalSource===undefined)throw new MathPolicyError('E_MATH_INVALID','Sankey math requires original fenced source');
        results.push({figureId:figure.figureId,ok:true,type:figure.type,...(sankeyMath?{sankeyMath}:{})});
      } else if (figure.xy) {
        const xyMath=await extractXYNodeMath(figure.originalSource??figure.source,figure.source,diagram.db);
        if(xyMath && figure.originalSource===undefined)throw new MathPolicyError('E_MATH_INVALID','XY math requires original fenced source');
        results.push({figureId:figure.figureId,ok:true,type:figure.type,...(xyMath?{xyMath}:{})});
      } else if (figure.quadrant) {
        const quadrantMath=await extractQuadrantNodeMath(figure.originalSource??figure.source,figure.source,diagram.db);
        if(quadrantMath && figure.originalSource===undefined)throw new MathPolicyError('E_MATH_INVALID','quadrant math requires original fenced source');
        results.push({figureId:figure.figureId,ok:true,type:figure.type,...(quadrantMath?{quadrantMath}:{})});
      } else if (figure.journey) {
        const journeyMath = await extractJourneyNodeMath(figure.originalSource ?? figure.source,figure.source,diagram.db);
        if (journeyMath && figure.originalSource === undefined) throw new MathPolicyError('E_MATH_INVALID', 'journey math requires original fenced source');
        results.push({figureId:figure.figureId,ok:true,type:figure.type,...(journeyMath ? {journeyMath} : {})});
      } else {
        const extracted = extract(figure.type, diagram.db);
        // Composite states already receive their semantic diagnostic in figure.ts.
        if (figure.type === 'state' && !extracted.state?.states.some(state => state.composite)) {
          const stateMath = await extractStateNodeMath(figure.originalSource ?? figure.source, figure.source, diagram.db);
          if (stateMath) {
            if (figure.originalSource === undefined) throw new MathPolicyError('E_MATH_INVALID', 'state math requires original fenced source');
            extracted.stateMath = stateMath;
          }
        }
        if (flowchartMath && flowchartMath.total.occurrences > 0) {
          const family = declaredTypeOf(figure.source);
          if (family !== 'flowchart' && family !== 'graph' && family !== 'flowchart-elk' && family !== 'swimlane-beta' && family !== 'agentflow-beta') {
            throw new MathPolicyError('E_MATH_INVALID', `Mermaid ${family} math adapter is not implemented; decoded labels cannot be exported yet`);
          }
          if (figure.originalSource === undefined) throw new MathPolicyError('E_MATH_INVALID', 'flowchart math requires original fenced source');
          extracted.flowchartMath = { records: flowchartMath.records,
            ...reconcileFlowchartData(diagram.db, flowchartMath.records) };
        }
        if (sequenceMath && sequenceMath.total.occurrences > 0) {
          if (figure.originalSource === undefined) throw new MathPolicyError('E_MATH_INVALID', 'sequence math requires original fenced source');
          extracted.sequenceMath = { records: sequenceMath.records,
            ...planSequenceRenderCopies(diagram.db, sequenceMath.records, SEQUENCE_RENDER_OPTIONS) };
        }
        results.push({ figureId: figure.figureId, ok: true, type: figure.type, ...extracted });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const located = error instanceof LocatedERMathError || error instanceof LocatedInfoMathError || error instanceof LocatedKanbanMathError || error instanceof LocatedRequirementMathError || error instanceof LocatedRadarMathError || error instanceof LocatedSankeyMathError || error instanceof LocatedXYMathError || error instanceof LocatedQuadrantMathError || error instanceof LocatedJourneyMathError || error instanceof LocatedPieMathError || error instanceof LocatedTimelineMathError ||
        error instanceof LocatedFlowchartMathError || error instanceof LocatedSequenceMathError ||
        error instanceof LocatedSequenceLabelError || error instanceof LocatedStateMathError ? error : undefined;
      const math = error instanceof MathPolicyError || located !== undefined;
      const limited = math && /LIMIT/.test((error as MathPolicyError | LocatedPieMathError).code);
      results.push({ figureId: figure.figureId, ok: false, error: message.split('\n').slice(0, 4).join(' '),
        ...(math ? { code: (error as MathPolicyError).code === 'E_UNSAFE_CONTENT' ? 'E_UNSAFE_CONTENT' : limited ? 'E_LIMIT' : 'E_MATH' } : {}),
        ...(located ? { line: located.startLine, startByte: located.startByte, endByte: located.endByte } : {}) });
    }
  }
  process.stdout.write(JSON.stringify({ results }));
}

main().catch((error: unknown) => {
  process.stderr.write(`mermaid parse worker failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
