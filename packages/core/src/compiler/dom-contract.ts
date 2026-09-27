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
//       <header class="ex-snapshot"> title (if not an h1 block) + snapshot metadata </header>
//       canonical top-level blocks, in source order (see CANONICAL below)
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
//   horizontally); the relationship or event list follows as <ol class="ex-rel-list">.
//   Ordinal traces show the text "Ordering, not duration." (emitted by the renderer).
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
  },
  canonicalId: (id: string) => `x-${id}`,
  svgInstanceId: (figure: string, id: string) => `v-${figure}.${id}`,
  listInstanceId: (figure: string, id: string) => `l-${figure}.${id}`,
  // Breakpoint between the desktop <aside> inspector and the narrow <dialog>.
  narrowMaxWidth: 899,
} as const;
