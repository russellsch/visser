// Bind generated formula nodes to the compiler's proven source positions.
// DOM attributes are checked once; selection reads only these private bindings.
type Formula = { tex: string; rawSource: string; start: number; end: number; encoded?: true; unrepresentable?: never }
  | { tex: string; unrepresentable: true; rawSource?: never; start?: never; end?: never; encoded?: never };
type Label = { key: string; expressions: Formula[] };
type Binding = { source: Text; label: Element; figure: Element; rawSource: string; start: number; end: number };
const bindings = new WeakMap<Element, Binding>();

export function bindMermaidSource(figure: Element, drawn: SVGElement): void {
  if (!figure.contains(drawn) || drawn.closest('figure') !== figure) throw new Error('Wrong Mermaid figure ownership');
  // A rebind must not retain an older contiguous quote for a formula that
  // has become unrepresentable or fails the new map's validation.
  for (const formula of drawn.querySelectorAll('[data-vs-mermaid-formula]')) bindings.delete(formula);
  const encoded = figure.getAttribute('data-vs-mermaid-source-map');
  if (!encoded) throw new Error('Missing Mermaid math source map');
  const source = figure.querySelector('.vs-mermaid-source code');
  if (!source || source.childNodes.length !== 1 || source.firstChild?.nodeType !== 3) {
    throw new Error('Mermaid source must be one text node');
  }
  const text = source.firstChild as Text;
  const data = JSON.parse(encoded) as { source: string; labels: Label[]; format?: 'flowchart' | 'sequence' | 'state' | 'journey' | 'quadrant' | 'xychart' | 'sankey' | 'radar' | 'requirement' | 'kanban' | 'er' | 'info' };
  if (data.source !== text.data || !Array.isArray(data.labels)) throw new Error('Stale Mermaid source map');
  const labels = new Map<string, Element>();
  for (const label of drawn.querySelectorAll('[data-vs-mermaid-label]')) {
    const key = label.getAttribute('data-vs-mermaid-label')!;
    if (labels.has(key)) throw new Error('Duplicate Mermaid label key');
    labels.set(key, label);
  }
  const pending: Array<[Element, Binding]> = [];
  const seen = new Set<string>();
  let matchedFormulas = 0;
  for (const record of data.labels) {
    if (!record || typeof record.key !== 'string' || seen.has(record.key) || !Array.isArray(record.expressions)) {
      throw new Error('Invalid Mermaid label map');
    }
    seen.add(record.key);
    const label = labels.get(record.key);
    if (!label) throw new Error('Missing Mermaid label');
    const formulas = [...label.querySelectorAll('[data-vs-mermaid-formula]')];
    if (formulas.length !== record.expressions.length) throw new Error('Mermaid formula count differs');
    let previousEnd = -1;
    record.expressions.forEach((expression, index) => {
      const formula = formulas[index]!;
      if (!expression || typeof expression.tex !== 'string' ||
          formula.getAttribute('data-vs-mermaid-formula') !== expression.tex ||
          formula.closest('[data-vs-mermaid-label]') !== label) throw new Error('Invalid Mermaid formula identity');
      matchedFormulas++;
      if (expression.unrepresentable === true) {
        if ((data.format !== 'flowchart' && data.format !== 'sequence' && data.format !== 'state' && data.format !== 'journey' && data.format !== 'quadrant' && data.format !== 'xychart' && data.format !== 'sankey' && data.format !== 'radar' && data.format !== 'requirement' && data.format !== 'kanban' && data.format !== 'er') || expression.rawSource !== undefined || expression.start !== undefined ||
            expression.end !== undefined || expression.encoded !== undefined) throw new Error('Invalid unrepresentable Mermaid source');
        // Keep the rendered formula, but selection must request source mode.
        return;
      }
      if (typeof expression.rawSource !== 'string' ||
          !Number.isSafeInteger(expression.start) || !Number.isSafeInteger(expression.end) ||
          expression.start < 0 || expression.end <= expression.start || expression.end > text.length ||
          expression.start < previousEnd || text.data.slice(expression.start, expression.end) !== expression.rawSource ||
          (expression.encoded !== undefined && (expression.encoded !== true || (data.format !== 'flowchart' && data.format !== 'sequence' && data.format !== 'state' && data.format !== 'journey' && data.format !== 'quadrant' && data.format !== 'xychart' && data.format !== 'sankey' && data.format !== 'radar' && data.format !== 'requirement' && data.format !== 'kanban' && data.format !== 'er'))) ||
          (!expression.encoded && (!expression.rawSource.startsWith('$$') || !expression.rawSource.endsWith('$$')))) {
        throw new Error('Invalid Mermaid formula source binding');
      }
      previousEnd = expression.end;
      pending.push([formula, { source: text, label, figure, rawSource: expression.rawSource, start: expression.start, end: expression.end }]);
    });
  }
  // Every drawn formula must have a source, including unexpected extra labels.
  if(data.format==='er'&&labels.size!==seen.size)throw new Error('ER retained label coverage differs');
  if (drawn.querySelectorAll('[data-vs-mermaid-formula]').length !== matchedFormulas) {
    throw new Error('Unmapped Mermaid formula');
  }
  for (const [formula, binding] of pending) bindings.set(formula, binding);
}

export type MermaidSourceSelection = { kind: 'unchanged' } | { kind: 'source'; range: Range } | { kind: 'unrepresentable' };

/** Normalize only representable selections; never drop ordinary selected text. */
export function mermaidSourceSelection(range: Range): MermaidSourceSelection {
  const element = (node: Node) => node.nodeType === 1 ? node as Element : node.parentElement;
  const start = element(range.startContainer);
  const end = element(range.endContainer);
  const selector = '[data-vs-mermaid-source-map] [data-vs-mermaid-render]';
  const startDrawing = start?.closest(selector);
  const endDrawing = end?.closest(selector);
  const firstElement = start?.closest('[data-vs-mermaid-formula]');
  const lastElement = end?.closest('[data-vs-mermaid-formula]');
  if (!startDrawing && !endDrawing && !firstElement && !lastElement) {
    const doc = range.startContainer.nodeType === 9 ? range.startContainer as Document : range.startContainer.ownerDocument!;
    for (const drawing of doc.querySelectorAll(selector)) {
      if (drawing.querySelector('[data-vs-mermaid-formula]') && range.intersectsNode(drawing)) return { kind: 'unrepresentable' };
    }
    return { kind: 'unchanged' };
  }
  const first = firstElement ? bindings.get(firstElement) : undefined;
  const last = lastElement ? bindings.get(lastElement) : undefined;
  const current = (formula: Element, binding: Binding) => binding.source.isConnected &&
    formula.closest('figure') === binding.figure && binding.source.parentElement?.closest('figure') === binding.figure &&
    formula.closest('[data-vs-mermaid-label]') === binding.label &&
    binding.source.data.slice(binding.start, binding.end) === binding.rawSource;
  if (!first || !last || first.label !== last.label || first.source !== last.source ||
      !current(firstElement!, first) || !current(lastElement!, last) || first.start > last.start) return { kind: 'unrepresentable' };
  // An interval selection may cross a formula whose source is disjoint even
  // when both endpoints have ordinary contiguous origins.
  for (const formula of first.label.querySelectorAll('[data-vs-mermaid-formula]')) {
    if (range.intersectsNode(formula) && !bindings.has(formula)) return { kind: 'unrepresentable' };
  }
  const mapped = first.source.ownerDocument.createRange();
  mapped.setStart(first.source, first.start);
  mapped.setEnd(last.source, last.end);
  return { kind: 'source', range: mapped };
}
