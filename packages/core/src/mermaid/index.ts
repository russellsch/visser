import {reserveERTransportMath} from './er-transport.ts';
import { reserveInfoTransportMath } from './info-transport.ts';
import { reserveRequirementTransportMath } from './requirement-transport.ts';
import { reserveKanbanTransportMath } from './kanban-transport.ts';
import { reserveRadarTransportMath } from './radar-transport.ts';
import { reserveSankeyTransportMath } from './sankey-transport.ts';
import { reserveXYTransportMath } from './xychart-transport.ts';
// Mermaid figures for the model (§9.12): rules, classification, parse, build.
import { buildMermaidFigure } from './figure.ts';
import { parseMermaid, type ParseRequest } from './parse.ts';
import { checkMermaidSource, declaredTypeOf, diagramTypeOf, normalizeMermaidSource, type MermaidIssue } from './rules.ts';
import type { MermaidFigure } from './types.ts';
import { EMPTY_MATH_RESOURCE_TOTAL, reserveMathOccurrences, type MathResourceTotal } from '../math/policy.ts';
import { reserveQuadrantTransportMath } from './quadrant-transport.ts';
import { reserveJourneyTransportMath } from './journey-transport.ts';
import { reserveStateTransportMath } from './state-transport.ts';
import { reserveSequenceRenderCopies } from './sequence-render-plan.ts';

export { checkMermaidSource, declaredTypeOf, diagramTypeOf, mapMermaidName, cleanLabel, MERMAID_SOURCE_LIMIT, type MermaidIssue } from './rules.ts';
export { setMermaidWorkerPath, setMermaidParseTimeout, clearMermaidParseCache } from './parse.ts';
export { MERMAID_MAX_ELEMENTS, MERMAID_MAX_RELATIONSHIPS } from './figure.ts';
export type * from './types.ts';

export type FigureInput = { figureId: string; source: string; originalSource?: string; mathBodyStartByte?: number };
export type FigureOutput = { figure: MermaidFigure; issues: MermaidIssue[] };

/**
 * Check, parse, and build every Mermaid figure of one document. Figures with
 * rejected content are not parsed; the three parsed types share one worker process.
 */
export function resolveMermaidFigures(inputs: FigureInput[]): Map<string, FigureOutput> {
  const out = new Map<string, FigureOutput>();
  const requests: ParseRequest[] = [];
  const prepared = inputs.map((input) => {
    const source = normalizeMermaidSource(input.source);
    const declaredType = declaredTypeOf(source);
    const diagramType = diagramTypeOf(declaredType);
    const issues = checkMermaidSource(source);
    const pie = declaredType === 'pie';
    const timeline = declaredType === 'timeline';
    const journey = declaredType === 'journey';
    const quadrant = declaredType === 'quadrantChart';
    const requirement = declaredType === 'requirementDiagram';
    const er = declaredType === 'erDiagram';
    const kanban = declaredType === 'kanban';
    const info = declaredType === 'info';
    const radar = declaredType === 'radar-beta' || declaredType === 'radar-beta:';
    const sankey = declaredType === 'sankey' || declaredType === 'sankey-beta';
    const xy = declaredType === 'xychart' || declaredType === 'xychart-beta';
    const blocked = issues.some((i) => i.code === 'E_UNSAFE_CONTENT' || i.code === 'E_LIMIT' || i.code === 'E_MATH');
    if (!blocked && (diagramType !== 'other' || pie || timeline || journey || quadrant || xy || sankey || radar || requirement || kanban || er || info)) requests.push({ figureId: input.figureId, source, type: diagramType,
      ...((pie || timeline || journey || quadrant || xy || sankey || radar || requirement || kanban || er || info || diagramType === 'flowchart' || diagramType === 'sequence' || diagramType === 'state') ? { originalSource: input.originalSource } : {}),
      ...(pie ? { pie: true } : {}), ...(timeline ? { timeline: true } : {}), ...(journey ? { journey: true } : {}), ...(quadrant ? { quadrant: true } : {}), ...(xy ? { xy: true } : {}), ...(sankey ? { sankey: true } : {}), ...(radar ? { radar: true } : {}), ...(requirement ? { requirement: true } : {}), ...(er ? { er: true } : {}), ...(kanban ? { kanban: true } : {}), ...(info ? { info: true } : {}) });
    return { ...input, source, declaredType, diagramType, issues, blocked };
  });
  const parsed = requests.length > 0 ? parseMermaid(requests) : new Map();
  for (const p of prepared) {
    const outcome = parsed.get(p.figureId);
    const issues = [...p.issues];
    let raw;
    if (outcome) {
      if (outcome.ok) raw = outcome;
      else issues.push({ code: outcome.code ?? 'E_SEMANTIC', message: `Mermaid could not parse this diagram: ${outcome.error}`,
        ...(outcome.line !== undefined ? { line: outcome.line } : {}),
        ...(outcome.startByte !== undefined ? { startByte: outcome.startByte } : {}),
        ...(outcome.endByte !== undefined ? { endByte: outcome.endByte } : {}) });
    }
    const built = buildMermaidFigure(p.figureId, p.source, p.declaredType, p.diagramType, p.blocked ? undefined : raw);
    if ((built.figure.mathLabels || built.figure.timelineMathLabels || built.figure.flowchartMath || built.figure.sequenceMath || built.figure.stateMath || built.figure.journeyMath || built.figure.quadrantMath || built.figure.xyMath || built.figure.sankeyMath || built.figure.radarMath || built.figure.requirementMath || built.figure.kanbanMath || built.figure.erMath || built.figure.infoMath) && p.mathBodyStartByte !== undefined) built.figure.mathBodyStartByte = p.mathBodyStartByte;
    out.set(p.figureId, { figure: built.figure, issues: [...issues, ...built.issues] });
  }
  let total = EMPTY_MATH_RESOURCE_TOTAL;
  for (const result of out.values()) {
    if (result.issues.length || (!result.figure.mathLabels && !result.figure.timelineMathLabels && !result.figure.flowchartMath && !result.figure.sequenceMath && !result.figure.stateMath && !result.figure.journeyMath && !result.figure.quadrantMath && !result.figure.xyMath && !result.figure.sankeyMath && !result.figure.radarMath && !result.figure.requirementMath && !result.figure.kanbanMath && !result.figure.erMath && !result.figure.infoMath)) continue;
    try { total = mermaidMathTotal([result.figure], total); }
    catch (error) {
      result.issues.push({ code: 'E_LIMIT', message: error instanceof Error ? error.message : String(error) });
      delete result.figure.mathLabels;
      delete result.figure.timelineMathLabels;
      delete result.figure.flowchartMath;
      delete result.figure.sequenceMath;
      delete result.figure.stateMath;
      delete result.figure.journeyMath;
      delete result.figure.quadrantMath;
      delete result.figure.xyMath;
      delete result.figure.sankeyMath;
      delete result.figure.radarMath;
      delete result.figure.requirementMath;
      delete result.figure.kanbanMath;
      delete result.figure.infoMath;
      delete result.figure.erMath;
    }
  }
  return out;
}

/** Count every authored Mermaid expression and every renderer duplication. */
export function mermaidMathTotal(figures: Iterable<MermaidFigure>, initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL): MathResourceTotal {
  let total = initial;
  for (const figure of figures) {
    for (const record of figure.mathLabels ?? []) for (const part of record.parts) {
      if (part.kind === 'math') total = reserveMathOccurrences(total, { svgBytes: part.mathmlBytes, elementCount: part.elementCount }, 1);
    }
    for (const record of [...figure.timelineMathLabels ?? [], ...figure.flowchartMath?.records ?? []]) for (const part of record.parts) {
      if (part.kind === 'math') total = reserveMathOccurrences(total, { svgBytes: part.mathmlBytes, elementCount: part.elementCount }, record.renderCopies);
    }
    if (figure.requirementMath) total = reserveRequirementTransportMath(figure.requirementMath,total);
    if (figure.erMath) total = reserveERTransportMath(figure.erMath,total);
    if (figure.infoMath) total = reserveInfoTransportMath(figure.infoMath,total);
    if (figure.kanbanMath) total = reserveKanbanTransportMath(figure.kanbanMath,total);
    if (figure.radarMath) total = reserveRadarTransportMath(figure.radarMath,total);
    if (figure.sankeyMath) total = reserveSankeyTransportMath(figure.sankeyMath,total);
    if (figure.xyMath) total = reserveXYTransportMath(figure.xyMath,total);
    if (figure.quadrantMath) total = reserveQuadrantTransportMath(figure.quadrantMath,total);
    if (figure.journeyMath) total = reserveJourneyTransportMath(figure.journeyMath,total);
    if (figure.stateMath) total = reserveStateTransportMath(figure.stateMath,total);
    if (figure.sequenceMath) {
      for (const record of figure.sequenceMath.records) for (const part of record.parts) {
        // Retain every authored occurrence, including overwritten and hidden
        // fields. The copy plan reserves only additional visible copies.
        if (part.kind === 'math') total = reserveMathOccurrences(total, { svgBytes: part.mathmlBytes, elementCount: part.elementCount }, 1);
      }
      total = reserveSequenceRenderCopies(figure.sequenceMath, figure.sequenceMath.records, total);
    }
  }
  return total;
}
