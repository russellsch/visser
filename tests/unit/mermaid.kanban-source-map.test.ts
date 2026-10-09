import { beforeAll, expect, it } from 'vitest';
import { clearMermaidParseCache, parseMermaid } from '../../packages/core/src/mermaid/parse.ts';
import { kanbanMathSourceMap } from '../../packages/core/src/mermaid/kanban-source-map.ts';
import { reserveKanbanTransportMath, type KanbanRenderMath } from '../../packages/core/src/mermaid/kanban-transport.ts';

const source = String.raw`kanban
%% hidden $$comment$$
col[Header 雪 $$head$$]
  card[Card $$title$$]@{ticket: "$$ticket$$", assigned: "$$assigned$$"}
col[Duplicate $$second$$]
`;
const original = '\uFEFF  ' + source.replaceAll('\n', '\r\n  ');
const bytes = new TextEncoder().encode(original);
let math: KanbanRenderMath;

beforeAll(() => {
  const result: any = parseMermaid([{ figureId: 'kanban-source-map', type: 'other', kanban: true, source, originalSource: original }]).get('kanban-source-map');
  if (!result?.ok || !result.kanbanMath) throw new Error(JSON.stringify(result));
  math = result.kanbanMath;
});

const map = (kanbanMath = math, document = bytes) => kanbanMathSourceMap({ source, mathBodyStartByte: 0, kanbanMath }, document);

it('maps sparse Kanban draws by renderer copy and semantic text role', () => {
  const result = map();
  expect(result).toMatchObject({ format: 'kanban' });
  expect(result.source).not.toContain('hidden');
  const keys = result.labels.map(label => label.key);
  expect(keys.some(key => key.endsWith(':section:label'))).toBe(true);
  expect(keys.some(key => key.endsWith(':item:label'))).toBe(true);
  expect(keys.some(key => key.endsWith(':item:ticket'))).toBe(true);
  expect(keys.some(key => key.endsWith(':item:assigned'))).toBe(true);
  expect(new Set(keys).size).toBe(keys.length);
  // Each duplicate-column display copy is revisited by matching native section
  // IDs; source entries preserve all four distinct renderer copy identities.
  expect(keys.filter(key => key.endsWith(':item:label'))).toHaveLength(4);
  for (const label of result.labels) for (const expression of label.expressions) {
    if ('rawSource' in expression) expect(result.source.slice(expression.start, expression.end)).toBe(expression.rawSource);
  }
});

it('retains exact BOM/CRLF/dedent provenance and rejects detached payload forgeries', () => {
  const result = map();
  expect(result.source).not.toContain('\r');
  for (const record of math.records) for (const part of record.parts) if (part.kind === 'math') {
    for (const origin of part.origins) expect(original.slice(origin.sourceStart, origin.sourceEnd)).toBe(origin.rawSource);
  }
  expect(() => kanbanMathSourceMap({ source, kanbanMath: math }, bytes)).toThrow(/body byte offset/);
  expect(() => map(math, new TextEncoder().encode(original.replace('Card', 'Changed')))).toThrow();

  const forged: any = structuredClone(math);
  const label = forged.records.find((record: any) => record.role === 'label' && record.nodeIndex === 1);
  const ticket = forged.records.find((record: any) => record.role === 'metadata.ticket');
  const labelPart = label.parts.find((part: any) => part.kind === 'math');
  const ticketPart = ticket.parts.find((part: any) => part.kind === 'math');
  const origins = structuredClone(labelPart.origins);
  labelPart.origins = structuredClone(ticketPart.origins);
  ticketPart.origins = origins;
  expect(() => reserveKanbanTransportMath(forged)).not.toThrow();
  expect(() => map(forged)).toThrow(/authenticated source ownership/);
});

it('propagates Kanban math through figures and document budgets', async () => {
  const { buildMermaidFigure } = await import('../../packages/core/src/mermaid/figure.ts');
  const { mermaidMathTotal } = await import('../../packages/core/src/mermaid/index.ts');
  const figure = buildMermaidFigure('kanban', source, 'kanban', 'other', { figureId: 'kanban', ok: true, type: 'other', kanbanMath: math } as any).figure;
  expect(figure.kanbanMath).toBe(math);
  expect(mermaidMathTotal([figure])).toEqual(math.total);
});

it('authenticates a legitimate detached payload after cache reset', () => {
  const clone = structuredClone(math);
  clearMermaidParseCache();
  expect(() => map(clone)).not.toThrow();
});
