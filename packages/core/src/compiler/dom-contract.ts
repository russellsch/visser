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
//         <div class="vs-appendix-group"><h3>Sources</h3> ... </div>,
//         one group each for Sources (kind source), Definitions, Details
//         (authored detail blocks), then one "Figure: TITLE" group per figure
//         holding that figure's owned parts, in figure document order. A group
//         with no rows is not emitted (F3). Each group holds the canonical
//         <details> for its targets.
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
//       source, detail): <details class="vs-detail"> in #vs-appendix with a
//       <summary> holding the label; body HTML follows.
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
//   A figure with a map carries data-vs-views="map list"; on narrow screens the
//   runtime shows the lists by default and adds a "Show map" toggle
//   (.vs-view-toggle, aria-pressed). Without JavaScript both views are present.
//   Ordinal traces show the text "Ordering, not duration." (emitted by the renderer)
//   and each event an "Order layer N" label (longest `after` chain; not time).
//   Compare figures hold a <table class="vs-compare-table"> (instances v-FIG.ID)
//   and narrow-screen cards <div class="vs-compare-cards"> (instances l-FIG.ID;
//   option instances inside a criterion card are l-FIG.CRITERION.OPTION).
//   Other instance names: l-FIG.ID for node, actor, branch, and annotation list
//   entries; v-FIG.ANN.LINE for annotation markers in code.
//
// Inline: term  -> <a class="vs-term" href="#x-DEF" data-vs-term=DEF>text</a>
//         cite  -> <a class="vs-cite" href="#x-SRC" data-vs-generated>[source]</a>
//         focus -> <a class="vs-focus" href="#x-FIRST" data-vs-focus="ID ID ...">text</a>
// Generated (non-author) text nodes live inside elements with data-vs-generated,
// and quote extraction skips them (§10.6).
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
//   that integrity value only then.

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
    viewport: 'data-vs-viewport',
    generated: 'data-vs-generated',
    term: 'data-vs-term',
    focus: 'data-vs-focus',
    placeholder: 'data-vs-placeholder',
    mermaid: 'data-vs-mermaid',
    mermaidKey: 'data-vs-mermaid-key',
    mermaidRender: 'data-vs-mermaid-render',
    views: 'data-vs-views',
  },
  canonicalId: (id: string) => `x-${id}`,
  mermaidRenderId: (figure: string) => `m-${figure}`,
  mermaidMeta: 'vs-mermaid',
  svgInstanceId: (figure: string, id: string) => `v-${figure}.${id}`,
  listInstanceId: (figure: string, id: string) => `l-${figure}.${id}`,
  // Breakpoint between the desktop <aside> inspector and the narrow <dialog>.
  narrowMaxWidth: 899,
} as const;
