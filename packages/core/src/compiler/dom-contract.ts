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
//     <nav class="ex-toolbar" hidden>             runtime removes `hidden`
//       <button id="ex-btn-contents">Contents</button>
//       <button id="ex-btn-refmode" aria-pressed="false">Reference mode</button>
//       <button id="ex-btn-expand">Expand details</button>
//       <button id="ex-btn-about">About this snapshot</button>
//     </nav>
//     <main id="ex-doc" data-ex-doc=UUID data-ex-rev=SHA data-ex-build=SHA>
//       the first block when it is an h1 (it is the page title, §10.1)
//       <header class="ex-snapshot"> generated h1 (only if no h1 block) + one
//         compact <p class="ex-meta" data-ex-generated> snapshot line </header>
//       remaining canonical top-level blocks, in source order (see CANONICAL below)
//       <section id="ex-appendix" aria-label="Details and evidence">
//         canonical <details> for every inspectable target
//       </section>
//     </main>
//   </body>
//
// CANONICAL element: exactly one per target, with
//   id="x-ID" data-ex-target=ID data-ex-body=SHA data-ex-kind=KIND data-ex-label=LABEL
//   - ordinary top-level block: <div class="ex-block"> wrapping its HTML
//   - component root (graph, trace, annotated): <figure class="ex-figure"
//       data-ex-question=Q aria-describedby="ex-q-ID"> with a visually hidden
//       <p id="ex-q-ID" class="ex-sr">Q</p>
//   - inspectable entity (node, edge, actor, event, annotation, definition,
//       source, detail): <details class="ex-detail"> in #ex-appendix with a
//       <summary> holding the label; body HTML follows.
//
// INSTANCE elements (repeatable views of a target): data-ex-target=ID, unique
//   id="v-FIGURE.ID" (SVG) or "l-FIGURE.ID" (relationship/event list), and
//   href="#x-ID" so they work as plain links without JavaScript. Interactive
//   instances carry data-ex-interactive. Relationship instances also carry
//   data-ex-rel=RELATIONSHIP_ID (edge ID, or EVENT~after~PREREQ for order).
//
// Figures: SVG sits in <div class="ex-viewport" data-ex-viewport> (may scroll
//   horizontally); the element and relationship lists follow inside
//   <div class="ex-lists"> (<ul class="ex-node-list">, <ol class="ex-rel-list">).
//   A figure with a map carries data-ex-views="map list"; on narrow screens the
//   runtime shows the lists by default and adds a "Show map" toggle
//   (.ex-view-toggle, aria-pressed). Without JavaScript both views are present.
//   Ordinal traces show the text "Ordering, not duration." (emitted by the renderer)
//   and each event an "Order layer N" label (longest `after` chain; not time).
//   Compare figures hold a <table class="ex-compare-table"> (instances v-FIG.ID)
//   and narrow-screen cards <div class="ex-compare-cards"> (instances l-FIG.ID;
//   option instances inside a criterion card are l-FIG.CRITERION.OPTION).
//   Other instance names: l-FIG.ID for node, actor, branch, and annotation list
//   entries; v-FIG.ANN.LINE for annotation markers in code.
//
// Inline: term  -> <a class="ex-term" href="#x-DEF" data-ex-term=DEF>text</a>
//         cite  -> <a class="ex-cite" href="#x-SRC" data-ex-generated>[source]</a>
//         focus -> <a class="ex-focus" href="#x-FIRST" data-ex-focus="ID ID ...">text</a>
// Generated (non-author) text nodes live inside elements with data-ex-generated,
// and quote extraction skips them (§10.6).
//
// Runtime-created elements: <aside id="ex-inspector"> (wide screens),
//   <dialog id="ex-inspector-dialog"> (narrow screens), <template
//   data-ex-placeholder=ID> left where a moved detail came from, and the copy
//   fallback <textarea id="ex-copy-fallback">.

// Mermaid figures (§9.12):
//   <figure class="ex-figure ex-mermaid" id="x-FIG" data-ex-mermaid=TYPE ...>
//     interpretation, then <div class="ex-viewport" data-ex-viewport id="m-FIG"
//     data-ex-mermaid-render> (the runtime renders here), then
//     <pre class="ex-mermaid-source"><code> source </code></pre> (no-JS/text
//     fallback), then for parsed types the lists with instances that carry
//     data-ex-mermaid-key=RENDER_KEY (see packages/core/src/mermaid/types.ts),
//     then <p class="ex-mermaid-notice" hidden> for render failures.
//   After rendering, the runtime marks drawn elements with data-ex-mermaid-drawn
//   and makes the viewport focusable (tabindex=0, role=region).
//   The page <head> carries <meta name="ex-mermaid" content=SRI_DIGEST> when
//   the page needs the Mermaid asset; the runtime loads ASSETS/mermaid.js with
//   that integrity value only then.

export const DOM = {
  root: 'ex-doc',
  appendix: 'ex-appendix',
  toolbar: 'ex-toolbar',
  inspector: 'ex-inspector',
  inspectorDialog: 'ex-inspector-dialog',
  copyFallback: 'ex-copy-fallback',
  buttons: {
    contents: 'ex-btn-contents',
    refmode: 'ex-btn-refmode',
    expand: 'ex-btn-expand',
    about: 'ex-btn-about',
  },
  attr: {
    doc: 'data-ex-doc',
    rev: 'data-ex-rev',
    build: 'data-ex-build',
    target: 'data-ex-target',
    body: 'data-ex-body',
    kind: 'data-ex-kind',
    label: 'data-ex-label',
    rel: 'data-ex-rel',
    question: 'data-ex-question',
    interactive: 'data-ex-interactive',
    viewport: 'data-ex-viewport',
    generated: 'data-ex-generated',
    term: 'data-ex-term',
    focus: 'data-ex-focus',
    placeholder: 'data-ex-placeholder',
    mermaid: 'data-ex-mermaid',
    mermaidKey: 'data-ex-mermaid-key',
    mermaidRender: 'data-ex-mermaid-render',
    views: 'data-ex-views',
  },
  canonicalId: (id: string) => `x-${id}`,
  mermaidRenderId: (figure: string) => `m-${figure}`,
  mermaidMeta: 'ex-mermaid',
  svgInstanceId: (figure: string, id: string) => `v-${figure}.${id}`,
  listInstanceId: (figure: string, id: string) => `l-${figure}.${id}`,
  // Breakpoint between the desktop <aside> inspector and the narrow <dialog>.
  narrowMaxWidth: 899,
} as const;
