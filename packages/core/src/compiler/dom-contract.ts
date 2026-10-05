// DOM contract between the static renderer (compiler) and the reader runtime
// (§10.2, §10.3, §10.6, §18.8). Both sides import these names; change them only
// together.
//
// Page structure (all content is present without JavaScript):
//
//   <html lang="en">
//   <head> CSP meta, <link rel=stylesheet href=ASSETS/reader.css>,
//          <script src=ASSETS/reader.js defer> </head>
//   <body>
//     <nav class="vs-toolbar" hidden>             runtime removes `hidden`
//       <button id="vs-btn-contents">Contents</button>
//       <button id="vs-btn-refmode" aria-pressed="false">Reference mode</button>
//       <button id="vs-btn-expand">Expand details</button>
//       <button id="vs-btn-about">About this snapshot</button>
//     </nav>
//     <main id="vs-doc" data-vs-doc=UUID data-vs-rev=SHA data-vs-build=SHA>
//       the first block when it is an h1 (it is the page title, §10.1)
//       <header class="vs-snapshot"> generated h1 (only if no h1 block),
//         a permanent <p class="vs-snapshot-brief"> "Snapshot · VISIBILITY" line,
//         and the full compact <p class="vs-meta" data-vs-generated> snapshot
//         line, which the runtime moves into the "About this snapshot" panel
//         and CSS hides in place once JavaScript runs (F11) </header>
//       remaining canonical top-level blocks, in source order (see CANONICAL below)
//       <section id="vs-appendix" aria-label="Details and evidence">
//         runtime-created filter box (search input + live region), then
//         <details class="vs-appendix-group vs-appendix-open" open>
//         <summary><h3>Sources</h3></summary> ... </details>,
//         one open group each for Sources (kind source), Definitions, Details
//         (authored detail blocks), then one collapsed group per figure,
//         <details class="vs-appendix-group vs-appendix-parts"
//         data-vs-figure=FIG> with the summary "Parts of 'TITLE' (N)", holding
//         that figure's owned parts, in figure document order (IMPROVEMENTS
//         §4.5). A group with no rows is not emitted (F3). Each group holds
//         the canonical <details> for its targets. A part with no body and no
//         evidence has the class vs-detail-bare: it is hidden on screen when
//         the runtime runs, and the inspector still shows it; N counts the
//         other rows. A figure group with no such rows also has the class
//         vs-appendix-group-bare.
//       </section>
//     </main>
//   </body>
//
// CANONICAL element: exactly one per target, with
//   id="x-ID" data-vs-target=ID data-vs-body=SHA data-vs-kind=KIND data-vs-label=LABEL
//   - ordinary top-level block: <div class="vs-block"> wrapping its HTML
//   - component root (graph, trace, annotated): <figure class="vs-figure"
//       data-vs-question=Q aria-describedby="vs-q-ID"> with a visually hidden
//       <p id="vs-q-ID" class="vs-sr">Q</p>
//   - inspectable entity (node, edge, actor, event, annotation, definition,
//       source, detail): <details class="vs-detail" data-vs-cue=WORD> in
//       #vs-appendix with a <summary> holding the label (and, for a figure
//       part, " · WORD", the paired-cue word); body HTML follows. A figure
//       part's body is in <div class="vs-detail-text">, then generated
//       sections: Relationships (<li data-vs-edge=RELATIONSHIP
//       data-vs-other=OTHER_PART> per relationship), Appears in, and Evidence
//       (IMPROVEMENTS §4.2). The runtime reads the neighbourhood of a part
//       from these items (§4.3).
//
// INSTANCE elements (repeatable views of a target): data-vs-target=ID, unique
//   id="v-FIGURE.ID" (SVG) or "l-FIGURE.ID" (relationship/event list), and
//   href="#x-ID" so they work as plain links without JavaScript. Interactive
//   instances carry data-vs-interactive. Relationship instances also carry
//   data-vs-rel=RELATIONSHIP_ID (edge ID, or EVENT~after~PREREQ for order).
//
// Figures: SVG sits in <div class="vs-viewport" data-vs-viewport> (may scroll
//   horizontally); the element and relationship lists follow inside
//   <div class="vs-lists"> (<ul class="vs-node-list">, <ol class="vs-rel-list">).
//   A figure with a map carries data-vs-views="map list". Document-level Text
//   view exposes the existing lists in place. Compatible narrow touch diagrams
//   open in a viewer on first activation, then select useful parts on later taps.
//   Unsupported renderers retain list fallback. No routine per-figure toggle.
//   Without JavaScript and in print both views are present.
//   Ordinal traces show the text "Ordering, not duration." (emitted by the renderer)
//   and each event an "Order layer N" label (longest `after` chain; not time).
//   Compare figures hold a <table class="vs-compare-table"> (instances v-FIG.ID)
//   and narrow-screen cards <div class="vs-compare-cards"> (instances l-FIG.ID;
//   option instances inside a criterion card are l-FIG.CRITERION.OPTION).
//   Other instance names: l-FIG.ID for node, actor, branch, and annotation list
//   entries; v-FIG.ANN.LINE for annotation markers in code.
//   Domain figures (IMPROVEMENTS §5.4) wrap the viewport and a glossary in
//   <div class="vs-domain-body">: <table class="vs-glossary"> has one row per
//   concept; the term link is the concept's list instance (l-FIG.ID), then
//   the first sentence of its definition, then a "Read more" inspector link.
//   The .vs-lists element holds only the relation list.
//
// Figure interactions (IMPROVEMENTS §14.9), all present in the static HTML:
//   - Appears in: each item of a part's Appears-in section carries
//     data-vs-entity=OTHER_PART, a part in any figure that shares the part's
//     `entity`. On hover or focus of a node, actor, or concept, the runtime
//     marks the SVG instances of those parts in other figures with vs-near.
//   - Filter chips: a legend chip carries data-vs-filter=VARIABLE:VALUE, and
//     each SVG node and edge carries data-vs-filter with its own tokens. With
//     JavaScript each chip is a toggle button (aria-pressed); a pressed chip
//     dims (vs-dim) each node and edge that has none of the pressed tokens.
//   - Collapsible groups: for each `group collapsed=true`, the SVG holds a
//     fold box <g class="vs-fold" data-vs-fold=GROUP data-vs-fold-hide="IDS"
//     role="button" hidden> (IDS: the nodes, groups, and edges inside the
//     group), a Fold control <g class="vs-fold-toggle"
//     data-vs-fold-toggle=GROUP role="button" hidden>, and, for each edge
//     with one end inside the group, proxy edges <a class="vs-edge"
//     data-vs-proxy-for=EDGE data-vs-proxy-from=GROUP|"" data-vs-proxy-to=GROUP|""
//     data-vs-proxy-ends="FROM TO" hidden> with the id v-FIG.EDGE~FROM~TO
//     ("-" for no group). The fold box and the Fold control follow their
//     group's <a class="vs-group"> in the SVG. The geometry is the compiler's;
//     the runtime sets and removes `hidden`, and a folded group keeps its
//     boundary with the class vs-folded (dashed, no label, tabindex=-1,
//     aria-hidden). Without JavaScript and in print the groups are unfolded.
//     The runtime computes vs-near and vs-dim from one state (marks.ts); a
//     fold box takes the state of the parts that it hides.
//
// Inline: term  -> <a class="vs-term" href="#x-DEF" data-vs-term=DEF>text</a>
//         (also for each use of a defined term that the build links, IMPROVEMENTS
//         §13.3; a later use in one paragraph is <span class="vs-term
//         vs-term-quiet" data-vs-term=DEF>, and a use in an SVG label is
//         <tspan class="vs-term" data-vs-term=DEF>)
//         A definition that a domain concept owns carries data-vs-concept=CONCEPT
//         on its canonical <details>; a click on its term, and the bubble's
//         link, open the concept in the inspector (IMPROVEMENTS §5.4).
//         Each definition's canonical <details> carries data-vs-summary, the
//         first sentence of its body as plain text. The build computes it
//         once; the glossary, the Terms section, and the term bubble show it.
//         cite  -> <a class="vs-cite" href="#x-SRC" data-vs-generated>[source]</a>
//         focus -> <a class="vs-focus" href="#x-FIRST" data-vs-focus="ID ID ...">text</a>
// Generated (non-author) text nodes live inside elements with data-vs-generated,
// and quote extraction skips them (§10.6).
//
// Components of IMPROVEMENTS §14 (all complete without JavaScript):
//   note:       <div class="vs-block vs-note vs-note-KIND" role="note"> canonical,
//               a generated <p class="vs-note-kind"> eyebrow ("Limit"), the body.
//   self-check: <div class="vs-block vs-self-check"> canonical, the question in
//               <p class="vs-self-check-question">, the answer in
//               <details class="vs-self-check-answer"> with <summary>Show answer.
//   measure:    <figure class="vs-figure vs-measure" data-vs-views="map list">:
//               an SVG bar chart in the viewport (one <a class="vs-measure-row">
//               instance v-FIG.READING each; a bar that is not measured has
//               the class vs-unmeasured and a hatch), and
//               <table class="vs-measure-table"> in .vs-lists (instances l-FIG.READING).
//   tree:       <figure class="vs-figure vs-tree"> with <ul class="vs-tree-list">;
//               each entry is <a class="vs-tree-entry"> (instance l-FIG.ENTRY)
//               in <div class="vs-tree-line">; the children of an entry follow
//               the line in <details class="vs-tree-node">, open at the top two
//               levels (class vs-tree-open), whose generated
//               <summary class="vs-tree-toggle"> reads "N entries". No link is
//               inside a summary.
//   steps:      <section class="vs-steps"> canonical for the `steps` target, at
//               the end of its figure, with <ol class="vs-step-list">; each
//               <li class="vs-step"> is canonical for its step and carries
//               data-vs-step-targets. Its part links are instances
//               l-FIG.STEP.PART. In a graph of any mode and in a domain, a
//               generated <p class="vs-steps-note"> reads "Reading order, not
//               execution order." The runtime adds <div class="vs-step-bar"> on
//               wide screens, the class vs-steps-live, and vs-near and vs-dim
//               on the figure's parts.
//   annotated with `before`: <div class="vs-diff"> with two
//               <div class="vs-diff-side vs-diff-before|after"> blocks; a
//               changed line has the class vs-line-removed or vs-line-added, a
//               "−" or "+" sign (aria-hidden), and the visually hidden word
//               "removed:" or "added:"; a gap row is <span class="vs-line vs-line-gap">.
//               Each line of an annotated excerpt has a marker column
//               <span class="vs-ann-col"> that holds its annotation markers.
//
// Runtime-created elements: <aside id="vs-inspector"> (wide screens),
//   <dialog id="vs-inspector-dialog"> (narrow screens), <template
//   data-vs-placeholder=ID> left where a moved detail came from, and the copy
//   fallback <textarea id="vs-copy-fallback">.

// Mermaid figures (§9.12):
//   <figure class="vs-figure vs-mermaid" id="x-FIG" data-vs-mermaid=TYPE ...>
//     interpretation, then <div class="vs-viewport" data-vs-viewport id="m-FIG"
//     data-vs-mermaid-render> (the runtime renders here), then
//     <pre class="vs-mermaid-source"><code> source </code></pre> (no-JS/text
//     fallback), then for parsed types the lists with instances that carry
//     data-vs-mermaid-key=RENDER_KEY (see packages/core/src/mermaid/types.ts),
//     then <p class="vs-mermaid-notice" hidden> for render failures.
//   After rendering, the runtime marks drawn elements with data-vs-mermaid-drawn
//   and makes the viewport focusable (tabindex=0, role=region).
//   The page <head> carries <meta name="vs-mermaid" content=SRI_DIGEST> when
//   the page needs the Mermaid asset; the runtime loads ASSETS/mermaid.js with
//   that integrity value only then. A standalone export also carries
//   <meta name="vs-mermaid-source" content=DATA_URL>.

export const DOM = {
  root: 'vs-doc',
  appendix: 'vs-appendix',
  appendixGroup: 'vs-appendix-group',
  toolbar: 'vs-toolbar',
  inspector: 'vs-inspector',
  inspectorDialog: 'vs-inspector-dialog',
  copyFallback: 'vs-copy-fallback',
  buttons: {
    contents: 'vs-btn-contents',
    refmode: 'vs-btn-refmode',
    expand: 'vs-btn-expand',
    about: 'vs-btn-about',
  },
  attr: {
    doc: 'data-vs-doc',
    rev: 'data-vs-rev',
    build: 'data-vs-build',
    target: 'data-vs-target',
    body: 'data-vs-body',
    kind: 'data-vs-kind',
    label: 'data-vs-label',
    rel: 'data-vs-rel',
    question: 'data-vs-question',
    interactive: 'data-vs-interactive',
    // The inspector delta of a canonical target or repeated instance. A
    // renderer may give two instances of one target different depths because
    // their visible payload differs.
    depth: 'data-vs-depth',
    // Presentation cue, independent of semantic categories and inspection depth.
    emphasis: 'data-vs-emphasis',
    // Structured decision-changing qualification in canonical detail facts.
    fact: 'data-vs-fact',
    viewport: 'data-vs-viewport',
    generated: 'data-vs-generated',
    term: 'data-vs-term',
    focus: 'data-vs-focus',
    placeholder: 'data-vs-placeholder',
    mermaid: 'data-vs-mermaid',
    mermaidKey: 'data-vs-mermaid-key',
    mermaidRender: 'data-vs-mermaid-render',
    views: 'data-vs-views',
    cue: 'data-vs-cue',
    figure: 'data-vs-figure',
    edge: 'data-vs-edge',
    other: 'data-vs-other',
    // On the canonical detail of a definition that a domain concept owns:
    // the concept ID. A term link then opens the concept (IMPROVEMENTS §5.4).
    concept: 'data-vs-concept',
    // On the canonical detail of a definition: the first sentence of its
    // body, the text of its term bubble (IMPROVEMENTS §5.3, §13.4).
    summary: 'data-vs-summary',
    // Components of IMPROVEMENTS §14: the parts that a `step` names (space-
    // separated target IDs, on its <li>), and the annotations that cover a
    // code line (on its <span class="vs-line">).
    stepTargets: 'data-vs-step-targets',
    ann: 'data-vs-ann',
    // Figure interactions (IMPROVEMENTS §14.9); see "Figure interactions" above.
    entity: 'data-vs-entity',
    filter: 'data-vs-filter',
    fold: 'data-vs-fold',
    foldHide: 'data-vs-fold-hide',
    foldToggle: 'data-vs-fold-toggle',
    proxyFor: 'data-vs-proxy-for',
    proxyFrom: 'data-vs-proxy-from',
    proxyTo: 'data-vs-proxy-to',
    proxyEnds: 'data-vs-proxy-ends',
  },
  canonicalId: (id: string) => `x-${id}`,
  mermaidRenderId: (figure: string) => `m-${figure}`,
  mermaidMeta: 'vs-mermaid',
  mermaidSourceMeta: 'vs-mermaid-source',
  svgInstanceId: (figure: string, id: string) => `v-${figure}.${id}`,
  listInstanceId: (figure: string, id: string) => `l-${figure}.${id}`,
  // Breakpoint between the desktop <aside> inspector and the narrow <dialog>.
  narrowMaxWidth: 899,
} as const;
