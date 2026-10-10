// Restricted authoring profile constants (ARCHITECTURE.md §2.3, §6.3–6.6, §9).

/** A whole-line ID marker (§6.3). Group 1 is the target ID. */
export const MARKER_LINE = /^[ ]{0,3}<!-- vs:id ([a-z][a-z0-9_-]{0,63}) -->[ ]*$/;

/** Target ID grammar (§6.3). */
export const TARGET_ID = /^[a-z][a-z0-9_-]{0,63}$/;

/** Inline-only primitive tags; they belong to their prose block (§6.5, §6.6). */
export const INLINE_TAGS: ReadonlySet<string> = new Set(['term', 'cite', 'focus', 'detail-link', 'eqref']);

/** Block tags: primitives (§6.6) and every catalogue family and child tag (§9). */
export const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'detail', 'definition', 'source', 'equation',
  'graph', 'group', 'node', 'edge', 'state', 'transition', 'factor', 'causal-link', 'task', 'dependency',
  'flowchart', 'start', 'action', 'decision', 'end', 'flow',
  'trace', 'actor', 'event', 'branch',
  'transform', 'stage', 'conversion',
  'compare', 'option', 'criterion', 'cell',
  'annotated', 'annotation',
  'domain', 'concept', 'relation',
  // Components of docs/IMPROVEMENTS.md §14: a note, a self-check, a measure
  // with its readings, a tree with its entries, and a steps walkthrough.
  'note', 'self-check', 'measure', 'reading', 'tree', 'entry', 'steps', 'step',
  'mermaid',
  // A trusted extension component and its parts (§14).
  'extension', 'part',
]);

/** Markdoc tags that evaluate or include content; rejected as unsafe (§6.5, R11). */
export const DYNAMIC_TAGS: ReadonlySet<string> = new Set(['if', 'else', 'partial', 'slot']);

/** §2.3 build safety limits enforced by the parser adapter. */
export const LIMITS = {
  sourceBytes: 10 * 1024 * 1024,
  lineBytes: 64 * 1024,
  literalDepth: 8,
  arrayLength: 1024,
  stringBytes: 16 * 1024,
  targets: 20_000,
} as const;

/** Ordinary blocks that take an ID marker (§6.4). `hr` is not addressable. */
export const ADDRESSABLE_BLOCKS: ReadonlySet<string> = new Set(['heading', 'paragraph', 'list', 'table', 'blockquote', 'fence', 'math_display']);

/** Direct tag bodies whose authored block prose has a canonical reader host. */
export const EQUATION_PARENTS: ReadonlySet<string> = new Set(['detail', 'definition', 'source', 'note', 'self-check', 'step', 'flowchart', 'group', 'start', 'action', 'decision', 'end', 'flow']);

/** Decoded tag string fields rendered as authored text; ID/URL/code fields stay literal. */
export const MATH_TEXT_ATTRIBUTES: ReadonlySet<string> = new Set([
  'title', 'question', 'label', 'term', 'event', 'guard', 'action',
  'condition', 'output', 'acceptance', 'risk', 'loss', 'quantity',
  'representation', 'shape', 'units', 'location', 'ownership', 'value',
  'display', 'cardinality', 'owner', 'unit', 'timeUnit', 'attributes',
]);
