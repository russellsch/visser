import { runCases } from './harness.mjs';
import { resolveMermaidFigures } from '/home/r/Documents/MyStuff/random_ts/visser/packages/core/src/mermaid/index.ts';
const cases = {
  md_bold: 'flowchart LR\n  a["`**Edge** cache`"] --> b',
  entity_quot: 'flowchart LR\n  a["say #quot;hi#quot; #35; #9829;"] --> b',
  br_label: 'flowchart LR\n  a["two<br>lines"] --> b',
  elk_variant: 'flowchart-elk LR\n  a --> b',
};
const built = resolveMermaidFigures(Object.entries(cases).map(([figureId, source]) => ({ figureId, source })));
for (const r of await runCases(cases)) {
  const f = built.get(r.name);
  console.log(r.name.padEnd(12), 'build:', JSON.stringify(f.figure.elements.map((e) => e.label).slice(0, 1)), 'type:', f.figure.diagramType, f.figure.parsed, '| render:', JSON.stringify(r.labels.slice(0, 1)), 'err:', (r.err || '').slice(0, 40));
}
