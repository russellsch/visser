// Mermaid figures for the model (§9.12): rules, classification, parse, build.
import { buildMermaidFigure } from './figure.ts';
import { parseMermaid, type ParseRequest } from './parse.ts';
import { checkMermaidSource, declaredTypeOf, diagramTypeOf, normalizeMermaidSource, type MermaidIssue } from './rules.ts';
import type { MermaidFigure } from './types.ts';

export { checkMermaidSource, declaredTypeOf, diagramTypeOf, mapMermaidName, cleanLabel, MERMAID_SOURCE_LIMIT, type MermaidIssue } from './rules.ts';
export { setMermaidWorkerPath, setMermaidParseTimeout, clearMermaidParseCache } from './parse.ts';
export { MERMAID_MAX_ELEMENTS, MERMAID_MAX_RELATIONSHIPS } from './figure.ts';
export type * from './types.ts';

export type FigureInput = { figureId: string; source: string };
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
    const blocked = issues.some((i) => i.code === 'E_UNSAFE_CONTENT' || i.code === 'E_LIMIT');
    if (!blocked && diagramType !== 'other') requests.push({ figureId: input.figureId, source, type: diagramType });
    return { ...input, source, declaredType, diagramType, issues, blocked };
  });
  const parsed = requests.length > 0 ? parseMermaid(requests) : new Map();
  for (const p of prepared) {
    const outcome = parsed.get(p.figureId);
    const issues = [...p.issues];
    let raw;
    if (outcome) {
      if (outcome.ok) raw = outcome;
      else issues.push({ code: 'code' in outcome ? outcome.code : 'E_SEMANTIC', message: `Mermaid could not parse this diagram: ${outcome.error}` });
    }
    const built = buildMermaidFigure(p.figureId, p.source, p.declaredType, p.diagramType, p.blocked ? undefined : raw);
    out.set(p.figureId, { figure: built.figure, issues: [...issues, ...built.issues] });
  }
  return out;
}
