# Pinned Mermaid 12 flowchart math renderer evidence

The reproduced browser probe is `node spikes/math-mermaid/flowchart-render-probe.mjs`.
It builds the installed Mermaid package and renders the same diagram with
`htmlLabels: true` and `false` in Chromium. Results from 2026-10-06:

| Configuration | Node math | Cluster math | Edge math | ViewBox |
| --- | ---: | ---: | ---: | --- |
| HTML labels | 1 | 1 | 1 | `4 4 510.0625 140.46875` |
| SVG text labels | 0 | 0 | 0 | `4 4 563.921875 142.60000610351562` |

With HTML labels Mermaid's existing `createText` invokes KaTeX. With SVG text
labels, it prints the literal `$$...$$`. Neither mode attaches source keys.
The HTML path measures `div.getBoundingClientRect()`, which misses math ink
deliberately excluded from CSS layout (for example `\\rlap` and `\\smash`).

## Pinned call chain and patch boundaries

- `flowDiagram-KWPJA3E3.mjs` (SHA256 `b2d1b7e34df3c25489ca39002fc1ad20e8293ddfd5260562e8b461144be1ed9a`)
  reexports the flowchart definition.
- `chunk-7M6MHVWA.mjs` (SHA256 `d276e4b92a7cc5b39bb1b619648f9fc3eb3993ff288429fcba27c2994c794234`)
  `draw` (lines 1138–1164) obtains `data4Layout = diag.db.getData()`, SVG,
  then calls `render(data4Layout, svg)` and inserts the diagram title afterward.
  `getData` (954–1129) constructs visible nodes/clusters/collapsed groups and
  edges after filtering hidden descendants. This is the point to reconcile
  source-located records and attach deterministic label keys to node/edge data.
- `chunk-3FUC2YCW.mjs` (SHA256 `eb671be62e44b68716a51e6f9c0b611afd39df4feb70389e219c43c82152027c`)
  `createCommonLayoutRenderer` (516–551) orders prepare, measure, layout,
  paint. `insertMeasuredNode` (61–68) sizes nodes from their rendered DOM.
  Dagre's `measureDagreGraph` (239–387 of `dagre-6A5THRUB.mjs`) measures node,
  cluster, and edge labels before routing.
- `chunk-7INBJB4K.mjs` (SHA256 `4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce`)
  `labelHelper` (172–236) is the main shape label path and obtains its box from
  `div.getBoundingClientRect()` or SVG `getBBox()`. `createLabel_default` (576–597)
  is a separate path used for ordinary cluster titles and some special shapes.
- `chunk-Z7XXMR3K.mjs` (SHA256 `0f01726f593265d7b3372fb6ff1e510f6e7cd0452121bb4aee947f6ee703e17a`)
  `insertEdgeLabel` (320–377) measures central edge labels; terminal label
  branches (378–475) use `createLabel_default` and ad hoc widths.
- `chunk-UA2S7LBM.mjs` (SHA256 `8c8483c45402a7d354dc9713f745a67ebd9bcc084a9c237601cac2dbd0458644`)
  `rect` (about 171–258) and `swimlane` (about 41–166) have separate cluster
  title geometry and label creation.
- `chunk-ZIGJFQKS.mjs` (SHA256 `470afb113ad1e7896836dda5ef93d1f3b04ea6652bfc21425640e49f78e07220`)
  `insertTitle` (469–478) is plain SVG text after layout; it never enters
  `createText`.
- `chunk-MBY4JIJT.mjs` (SHA256 `02ab305a27aa89e9f079796e7dd1eca4f952976bad598585c97947c1ce090195`)
  `createText` (803–880) and `addHtmlSpan` (665–706) render and measure the
  shared text. Plain SVG labels bypass KaTeX. The KaTeX recognizer is
  `/\\$\\$(.*?)\\$\\$/g` in `chunk-O7XYJQB3.mjs` (5395), so multiline
  delimiters need separate grammar/validation handling.

## Smallest credible integration

Version-check the exact chunks and anchor replacements to named function
boundaries. Keep the original path for diagrams without active math. On math
diagrams, reconcile source records with `getData`'s *effective* visible labels
after Mermaid's trims, quote removal, sanitization, redefinition, and collapsed
group filtering. Attach keys by node/cluster ID, generated edge ID, and title
before `render`. Stamp `data-vs-mermaid-label` on the label DOM at measurement
time, and use ink-inclusive measured width/height in every box returned to the
layout engine. The common math-only `createText` path can build the label, but
its consumers must read the reserved box rather than `div.getBoundingClientRect`.
The node, edge, cluster, and title branches above each need a checked adapter.

`htmlLabels: false` is a distinct branch: shape labels can be opted into HTML
per node, while edge and cluster code reads global configuration. A math-only
override must be propagated through those call sites without mutating global
Mermaid config during concurrent renders. Math in title needs separate measured
placement and viewBox clearance. Special shape/title and edge terminal paths
need coverage before calling flowchart family support complete. The shared
label helper treats ordinary text literally apart from `<br>`; mixed Mermaid
HTML/Markdown labels need an explicit compatibility decision or a math-only
token adapter that preserves their effective markup semantics.
