// Mermaid 12's shape handlers deliberately omit labels for these symbols,
// including ordinary non-math labels. Keep all authored text validated, but do
// not invent a visible label slot. The browser build pins the handler artifact;
// the registry contract test covers every alias for these handlers.
export const FLOWCHART_NO_LABEL_SHAPES: ReadonlySet<string> = new Set([
  'anchor', 'choice', 'sm-circ', 'start', 'small-circle', 'stateStart',
  'fr-circ', 'stop', 'framed-circle', 'stateEnd',
  'fork', 'join', 'forkJoin', 'hourglass', 'collate',
  'bolt', 'com-link', 'lightning-bolt', 'f-circ', 'junction', 'filled-circle',
  'cross-circ', 'summary', 'crossed-circle',
]);
