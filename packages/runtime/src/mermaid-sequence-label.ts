// Per-draw label preparation for the sequence adapter. Layout and source-owner
// integration are separate: callers provide grammar/DB-owned keys and the
// effective text once, then use these exact measured nodes for every copy.
import { measureMermaidLabel, type MeasuredMermaidLabel } from './mermaid-label.ts';

export type SequenceLabelInput = Readonly<{
  key: string;
  text: string;
  className: string;
}>;
export type SequencePreparedLabels = Readonly<{
  get(key: string): Readonly<{ width: number; height: number }>;
  place(key: string, copyKey: string, parent: SVGElement, x: number, y: number): SVGElement;
}>;

/** Prepare under the actual diagram's CSS context; never cache across draws. */
export async function prepareSequenceLabels(
  svg: SVGSVGElement, inputs: readonly SequenceLabelInput[],
): Promise<SequencePreparedLabels> {
  if (!svg.isConnected) throw new Error('Sequence label preparation requires an attached diagram');
  const seen = new Set<string>();
  // Validate the whole request before starting asynchronous DOM measurement.
  for (const input of inputs) {
    if (!input || typeof input.key !== 'string' || !input.key || seen.has(input.key) ||
        typeof input.text !== 'string' || typeof input.className !== 'string') {
      throw new Error('Invalid or duplicate sequence label identity');
    }
    seen.add(input.key);
  }
  const snapshot = inputs.map(input => ({ ...input }));
  const labels = new Map<string, MeasuredMermaidLabel>();
  for (const input of snapshot) {
    labels.set(input.key, await measureMermaidLabel(svg, input.text, input.className));
  }
  const copies = new Set<string>();
  const get = (key: string) => {
    const label = labels.get(key);
    if (!label) throw new Error('Unknown sequence label identity');
    return label;
  };
  return Object.freeze({
    get(key: string) {
      const { width, height } = get(key);
      return Object.freeze({ width, height });
    },
    place(key: string, copyKey: string, parent: SVGElement, x: number, y: number) {
      const label = get(key);
      if (typeof copyKey !== 'string' || !copyKey || copies.has(copyKey)) {
        throw new Error('Invalid or duplicate sequence label copy identity');
      }
      if (parent !== svg && !svg.contains(parent)) {
        throw new Error('Sequence label copy belongs to a different diagram');
      }
      const placed = label.place(parent, x, y);
      placed.setAttribute('data-vs-mermaid-label', copyKey);
      copies.add(copyKey);
      return placed;
    },
  });
}
