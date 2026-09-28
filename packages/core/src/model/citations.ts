// Source order for citation numbers (revision 1.24): sources are numbered by
// their first `cite` in document order, then uncited sources in file order.
// The page, its details appendix, and the text projection all use this order,
// so the order of `source` blocks in the file does not matter.
import type { TargetId, TargetRecord } from '../types.ts';
import type { MNode } from './targets.ts';

function refIds(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

/** Source IDs in citation order. */
export function sourceOrder(ast: MNode, targets: Map<TargetId, TargetRecord>): TargetId[] {
  const sources = [...targets.values()].filter((r) => r.kind === 'source').map((r) => r.id);
  const isSource = new Set(sources);
  const cited: TargetId[] = [];
  const seen = new Set<TargetId>();
  const visit = (node: MNode) => {
    if (node.type === 'tag' && node.tag === 'cite') {
      for (const id of refIds(node.attributes['ref'])) {
        if (isSource.has(id) && !seen.has(id)) {
          seen.add(id);
          cited.push(id);
        }
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(ast);
  return [...cited, ...sources.filter((id) => !seen.has(id))];
}

/**
 * Put the source records of `records` into citation order, keeping every other
 * record in place: the slots that hold sources receive them in `order`.
 */
export function inCitationOrder<T extends { id: TargetId; kind: string }>(records: T[], order: TargetId[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const sources = records.filter((r) => r.kind === 'source').sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  let next = 0;
  return records.map((r) => (r.kind === 'source' ? sources[next++]! : r));
}
