# Phase 4 review: the `domain` component (review 1)

Reviewer: independent review role. Date: 28 September 2026.

## Scope

Specification: `docs/IMPROVEMENTS.md` §5.1 to §5.6, the `domain` row of
§3.2, §3.1 and §3.3 (forced colours, legend), §13.3 and §13.4 (term to
concept), §14.10, and §6.2 item 3 (`W_MERMAID` for `erDiagram` and
`classDiagram`).

Implementation (uncommitted working tree, the domain parts only):
`packages/core/src/syntax/profile.ts`; `model/{validate,targets,project}.ts`;
`catalogue/index.ts`; `compiler/{compile,encoding,svg,layout,html,dom-contract}.ts`;
`review/{shape,context,index,terms}.ts`; `runtime/src/reader.ts` (the marked
domain block and `addViewToggles`); `runtime/src/reader.css` (the appended
domain block and the rules that it interacts with);
`skills/visual-explain/references/catalogue/domain.md`; `SKILL.md` (step 3
sentence, step 4 row); `docs/ARCHITECTURE.md` §9.2 and §9.13;
`examples/domain-orders/index.md`; `fixtures/positive/family-domain.md`; the
four negative fixtures; `tests/unit/domain.test.ts`;
`tests/browser/domain.spec.ts`. Also read, because the lenses touch them:
`references/catalogue/mermaid.md`, `extensions/svg.ts`. Screenshots: all
eight files in `docs/validation/improvements-1/phase4/`.

Line numbers are as of 09:05 on 28 September. Another agent edited
`compile.ts`, `review/index.ts`, `project.ts`, `validate.ts`, and `svg.ts`
during the review. Function names are given as well.

## Checks run

- `npx vitest run tests/unit/domain.test.ts tests/unit/catalogue.test.ts`,
  once: 55 of 55 passed (2 files). This rebuilt `dist/release` through
  `tests/global-setup.ts` and wrote `reports/vitest-junit.xml`, as the task
  allowed. No transient failure.
- In-memory compiles from source (Node 25 type stripping, output in the
  session scratchpad only, no repository writes): the example and the
  positive fixture, twice each in one process and again in a second process.
  The build hashes are identical (`0de2a1d1…`, `782b880e…`).
- ELK layout sizes from `layoutGraph` for the example and the fixture, RIGHT
  and DOWN. A relation cycle with a self-loop and parallel relations: laid
  out in 67 ms, no diagnostic.
- Model probes with `loadBundle`: retired definition, renamed definition,
  `node.entity` to a concept, `concept.entity` to a node that has an entity,
  `concept.entity` to a concept, empty `attributes`, non-string `attributes`,
  markup in `cardinality`, `auto=false` on an owned definition, a `detail`
  inside a `domain`, an extension `part` with a `definition` attribute, and
  the four negative fixtures.
- Headless Chromium (Playwright core, the repository's installed browser) on
  an in-memory compile of the example, with the current `reader.ts` bundled
  by esbuild into the scratchpad: element boxes at 1440, 1300, 1200, and
  1000 px; the same with the proposed CSS fix; the example compiled with the
  default layout rule; the fixture in light, dark, and forced colours; a
  probe document for the tooltip text, the term click, and the bubble link.
- Text scan of `domain.md` for sentence length and STE flags.

## Findings

| ID | Severity | File:line | What is wrong | Fix |
|---|---|---|---|---|
| D1 | high | `packages/runtime/src/reader.css:861-873` (domain `@media (min-width: 1200px)` block); `packages/runtime/src/reader.ts:690` (`addViewToggles`) | On a wide window the map is at the far left, outside the text column, and "Show as list" is left of the column. Measured at 1440 px: text column x=397 w=645; `.vs-domain-body` x=144 w=1152; view bar x=144; map x=162 w=196; glossary x=382 w=896. At 1200 px the map is at x=42 and the column at x=277. Cause: the body has a fixed width, `min(100vw - 4rem, 72rem)`, not a content width, and the glossary grows (`flex: 1 1 30rem`, up to `56rem`), so the row always fills about 1152 px and the map is the first item at its left edge. `addViewToggles` puts the view bar before the viewport, so it is inside the body; `flex: 0 0 100%` puts it at the body's left edge. It is not the phase 2 viewport rule: `.vs-domain-body > .vs-viewport` (specificity 0,2,0, later in the file) overrides `.vs-figure .vs-viewport` (0,2,0), and the measured viewport has no translation. The body copies the break-out technique on a box that does not shrink to its content. | Replace the block with the CSS in "D1 fix" below, and in `addViewToggles` put the bar before the domain body: `(viewport.closest('.vs-domain-body') ?? viewport).before(bar)`; remove `.vs-domain-body > .vs-view-bar`. Measured with the fix at 1440 px: body x=290 w=860, centred on the column (centre 720 and 719.5); bar at x=397 in the column; map at its natural width; glossary 640 px beside it. At 1200 and 1300 px the row is also centred. |
| D2 | medium | `packages/core/src/compiler/layout.ts:145` (`DOMAIN_MAX_WIDTH = 600`), `:379`; `compile.ts:548`; ARCHITECTURE §9.13 "Rendering"; `tests/unit/domain.test.ts:214` | Any domain map wider than 600 px goes top to bottom. The 4-concept chain in the example is 876×76 left to right and 170×580 top to bottom, so it becomes a 596 px column; the fixture is 963×165 against 353×508. The block (map and glossary) is 648 px tall at 1440 px. With the left-to-right map and the D1 CSS it is 362 px (glossary beside) at 1440 px and 370 px (glossary under) at 1300 and 1200 px. §5.4 asks for "a compact map". The candidate rule "RIGHT when it fits beside a 40ch glossary, else DOWN" does not fix this example: at the 1200 px breakpoint the budget beside a 20rem glossary is 1200 − 64 − 24 − 320 = 792 px, and 876 > 792. | Smallest change: remove `maxWidth` for `domain` and keep the family default (RIGHT up to 1100 px); the D1 wrap puts the glossary under a wide map. Better rule, deterministic: estimate the glossary height G = 40 + 44 × concepts; cost(L) = L.width ≤ 792 ? max(L.height, G) : L.height + 12 + G; keep RIGHT unless it is wider than 1100 or cost(DOWN) < cost(RIGHT). Example: 304 against 580, so RIGHT. Fixture: 481 against 508, so RIGHT. A wide fan-out such as 1050×300 against 500×400 with G = 300 gives DOWN. Update the unit test at 214 and the §9.13 sentence. A 2-column wrap (`elk.layered.wrapping.strategy`) changes the fixed option allowlist (§7.5) and is experimental in ELK; do not use it now. |
| D3 | medium | `skills/visual-explain/references/catalogue/mermaid.md:5, 12-13, 21-25, 75-82`; `skills/visual-explain/references/catalogue/domain.md:5` | `mermaid.md` still gives "an ER diagram, a class diagram" as uses of Mermaid, and its template is an `erDiagram`. That template now gets `W_MERMAID` with "use `domain`" (`review/shape.ts:41-43`). Its "Do not use it when" list and its "Confused with" line do not name `domain`. `domain.md` "Confused with" names `architecture` and a `definition`, not a Mermaid ER or class diagram. §5.6: `domain` "replaces the explanatory use of Mermaid ER and class diagrams"; §6.2 item 3. | `domain.md:5`: add "and a Mermaid `erDiagram` or `classDiagram` (no parts to open)". `mermaid.md`: remove ER and class from "Use it when" (keep pie, mind map, quadrant chart); add "`erDiagram` or `classDiagram`: `domain`;" to the list; add "`domain` (an ER or class diagram)" to "Confused with"; change the template to a `pie` (a `pie` template with a title, a question, and a sentence checks with no errors, probe). Run the catalogue contract test. |
| D4 | medium (needs a spec decision) | `packages/core/src/compiler/encoding.ts:132` (`CATEGORY_CUES.value`); forced-colours block `reader.css:618-624` | The only paired cue of `value` is "no fill". In light mode a `thing` box has the slate tint `#EEF1F5`, and a `value` box is white: a fill contrast of about 1.13:1, so the difference is the stroke hue. In forced colours both boxes are Canvas with a solid CanvasText outline and radius 6; the fixture render shows "Unit price" (value) and "Order" (thing) as the same shape. §3.1: forced colours "keep the shape and pattern cues"; §2.1: colour never alone. §5.3 prescribes "value no fill", so the fault is in the spec. | Give `value` a second cue that forced colours keep, for example a dashed outline (`dash: '6 4'`; no domain category uses dashes). Ask the spec owner to change §3.2 and §5.3, then update `domain.md:53-55`, ARCHITECTURE §9.13, and the `c_price` expectation in `tests/unit/domain.test.ts`. |
| D5 | medium | `packages/core/src/compiler/compile.ts:778-795` (`glossary`), `752-758` (`domainShell`); `reader.css:186, 189` | The glossary replaces the concept list, and it does not show the category word. In the list view, which is the default on a narrow screen, the map and the legend are hidden, so the category is visible only in the inspector title ("Order · thing"). A screen reader also loses the SVG aria-labels ("Customer (actor)") in that view. §3.3: "The text list and the Markdown projection keep the value words". | In the term cell, after the link, add the category as generated muted text, as the node list does: `h('span', { class: 'vs-role', [DOM.attr.generated]: true }, ' (actor)')`. Optionally add the `attributes` line in the same way. |
| D6 | medium | `packages/runtime/src/reader.ts:275-297` (`firstSentence`, `bodyText`), `373-377`; `compiler/compile.ts:1443-1467` (`definitionSentence`); `model/project.ts:17` (`firstSentence`) | The glossary sentence and the tooltip sentence come from different functions with different inputs: the glossary from the Markdoc AST, the tooltip from the DOM `textContent` of the definition's detail. They differ. Probe 1: "A widget is one part of the order handler {% cite %}. It has a stable ID." gives the glossary and the Markdown projection "…handler ." (a space before the period) and the tooltip "…handler [1].". Probe 2: a hard break after the first sentence gives the glossary "A gadget holds one widget." and the tooltip "A gadget holds one widget.It never holds two.", because `<br>` has no text and the regular expression then finds no sentence end followed by a space. §5.3: the concept "inherits the first sentence as its tooltip and its list text". | Compute the sentence once in the build (`definitionSentence`) and emit it on the definition's canonical detail (for example a generated hidden `<p class="vs-summary">` or a `data-vs-summary` attribute). Make `bodyText` read it for a definition. In `definitionSentence` and in `project.ts`, remove the space before punctuation that a dropped `cite` leaves (`.replace(/\s+([.,;:!?])/gu, '$1')`). Add a unit test with a `cite` and a browser test that compares the tooltip with the glossary cell. |
| D7 | low | `packages/core/src/compiler/svg.ts:177-186` (cardinality text) | The cardinality is drawn after the layout, 10 px beside the last segment. ELK reserves no space for it. When two relations end on the same side of one concept, the labels collide. Fixture render: "1..*" (`r_has`) overlaps the dotted `r_price` line and sits next to the "1" of `r_price` at "Invoice line". Cycle probe: "0..1" is drawn on the diamond of another relation. A reader can give a cardinality to the wrong relation. The aria-label and the list are correct. | Give the cardinality to ELK as a second edge label with `org.eclipse.elk.edgeLabels.placement: HEAD`, so the layered algorithm reserves space (a per-label option; check it against the §7.5 option allowlist). Smallest change: put it in the edge label text ("contains · 1..*"). |
| D8 | low | `packages/runtime/src/reader.ts:373-377` (`showTermTooltip`) | The bubble's "Open definition" link opens the definition. A click or a second tap on the term opens the concept (`reader.ts:994-1001`). Probe: the bubble link for `def_gadget` opened `def_gadget`; a click on the `def_widget` term opened `c_widget`. A touch reader who taps the link gets the definition without its relations and "Appears in". §5.4: "A click on it opens the inspector on the concept". | In `showTermTooltip`, read `canonical(defId)?.getAttribute(A.concept)` and pass that ID as `targetId` when its detail exists. Keep the label, or change it to "Open concept". |
| D9 | low | `packages/core/src/model/targets.ts:38` (`REF_ATTRIBUTES`) | `definition` is now a reference attribute on every tag. `extension` and `part` accept open attributes (`validate.ts:119-120, 277`). Probe: `{% part id="lane_config" … definition="done when loaded" %}` gives `E_REF_BROKEN: lane_config refers to unknown target done when loaded`. Before this change the attribute was accepted. | Read `definition` as a reference only on a `concept`: in `referencedIds`, use `node.tag === 'concept' ? [...REF_ATTRIBUTES, 'definition'] : REF_ATTRIBUTES`. Or name `definition` as reserved in the extension guide. |
| D10 | low | `packages/core/src/model/validate.ts:50-52` (`DETAIL_PARENTS` now has `domain`); `compile.ts:538` | A `detail` directly inside a `domain` is drawn as a map node (`v-dm.d_more`) and gets a glossary row with an empty meaning (probe). The node part of this fault already exists for `graph` (probe: `v-g.d_more`); the domain inherits it and adds the empty row. | In `graph()`, for `domain` take `children.filter((c) => c.kind === 'concept')` as the nodes, and leave `detail` out for the other families. Or remove `domain` from `DETAIL_PARENTS`. |
| D11 | low | `skills/visual-explain/references/catalogue/domain.md:28-39, 53-58`; `examples/domain-orders/index.md:50` | The guide says how each category and each relation kind is drawn, not when to choose it. The example shows the result: "Product", a catalogue item with an identity and a price, has `category="value"`, and "Customer uses Order" means "places". | Add one line for each category (thing: a thing with an identity that the system keeps; actor: a person or a system that acts; event: a thing that occurs at one time; value: a quantity or a description with no identity, such as a price; rule: a condition that must be true) and each kind (`is-a`: `from` is a kind of `to`; `has`: `from` owns `to`, and `to` does not exist without it; `uses`: `from` refers to `to` and does not own it; `produces`: `from` makes `to`; `identifies`: `from` names exactly one `to`). Change "Product" to `thing` in the example. |
| D12 | low | `domain.md:46-47, 63-64, 92-94` | STE (§11.2): the sentence at 46-47 has 25 words and holds an instruction (the limit is 20); line 63 uses "when" for a condition ("under it when the window is too narrow"); the `E_REF_BROKEN` sentence has 28 words (the limit is 25). | Split the rule: "The glossary and the hover text show the first sentence of the definition. Write the whole meaning in that sentence." Use "if the window is too narrow". Make the three `E_REF_BROKEN` causes a list. |
| D13 | low | `tests/browser/domain.spec.ts:24-43, 45-51, 53-73`; `tests/unit/domain.test.ts:214-223` | The browser tests check relative positions: beside (`g.x ≥ m.x + m.width` and a vertical overlap) at 1440, below at 1000, and map above glossary at 390 after "Show map". They do not check the position against the text column, so they pass on the D1 layout. Not tested: the row centred on the column, the view bar in the column, the row width not more than the window minus 4rem, tooltip text equal to glossary text for a definition with a `cite` (D6), the target of the bubble link (D8), and Enter on a focused term. The unit test at 214 locks in the top-to-bottom switch that D2 changes. | Add to the 1440 and 1200 tests: `abs((row.x + row.width/2) - (col.x + col.width/2)) ≤ 2`, `bar.x ≥ col.x`, and `row.width ≤ window − 64`, with `row` as the union of the map and glossary boxes and `col` as the box of `#x-claim`. Add the D6 and D8 checks. Change the unit test with D2. |
| D14 | optional | `packages/core/src/compiler/html.ts:42, 56-58` | `marker-start`, like the older `marker-end`, takes any value. Only generated code sets it, and the extension allowlist (`extensions/svg.ts:30`) does not allow either attribute, so there is no injection path now. The lens expected that the allowlist accepts only generated marker IDs; it checks the name only. | Hardening: `VALUE_PATTERNS['marker-start'] = VALUE_PATTERNS['marker-end'] = /^url\(#m-[a-z][a-z0-9_-]{0,63}\.arrow(-[a-z]+)?\)$/`. |
| D15 | optional | `packages/core/src/model/validate.ts:452-465` (the `domain` branch); `compile.ts:727-737` | A `domain` with no concepts compiles with no diagnostic to a 16×16 empty SVG and an empty glossary. A concept without `category` in a figure that shows hue has no legend chip. | Report a prompt below 2 concepts (a domain with one concept is a definition). Optionally a "no category" chip. |

## D1 fix: CSS, tested

Replace the `@media (min-width: 1200px)` block at `reader.css:861-874`:

```css
@media (min-width: 1200px) {
  .vs-domain-body {
    display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-start;
    gap: 0.75rem 1.5rem;
    width: max-content;                 /* as wide as the map and the glossary */
    max-width: calc(100vw - 4rem);      /* and not wider than the window minus 4rem */
    margin-left: 50%; transform: translateX(-50%);   /* centred on the text column */
  }
  .vs-domain-body > .vs-viewport { flex: 0 0 auto; width: max-content; max-width: 100%; margin-left: 0; transform: none; }
  .vs-domain-body > .vs-glossary-wrap { order: 2; flex: 1 1 20rem; min-width: 20rem; max-width: 40rem; margin: 0; }
  .vs-domain-body > .vs-overflow-hint { order: 3; flex: 0 0 100%; }
  .vs-glossary-more { font-size: 0.8125rem; }
  body.vs-has-inspector .vs-domain-body { width: auto; max-width: 100%; margin-left: 0; transform: none; }
}
```

The body's max-content width is the map width, plus the gap, plus the glossary
up to 40rem. So the row is as wide as its content, not more than the window
minus 4rem, and the map keeps its natural width. When the two do not fit on
one line, the glossary wraps under the map and `justify-content: center`
centres each line. The view bar must move out of the body (`reader.ts:690`),
because it must stay in the text column.

Measured (Chromium, the example):

| Window | Layout | Body | Map | Glossary | Block height |
|---|---|---|---|---|---|
| 1440 | now, DOWN | x=144 w=1152 | x=162 | x=382 w=896, beside | 648 |
| 1200 | now, DOWN | x=32 w=1136 | x=42 | x=262 w=896, beside | 648 |
| 1440 | D1 CSS, DOWN | x=290 w=860 | x=290 | x=510 w=640, beside | 596 |
| 1440 | D1 CSS, RIGHT (D2) | x=32 w=1376 | x=32 w=902 | x=958 w=450, beside | 362 |
| 1300 | D1 CSS, RIGHT (D2) | x=32 w=1236 | x=199, centred | x=330 w=640, under | 370 |
| 1200 | D1 CSS, RIGHT (D2) | x=32 w=1136 | x=149, centred | x=280 w=640, under | 370 |

## Conformance, item by item

Conforms (checked in code and by probe):

- One definition, one owner: `validate.ts:466-473` (the `concept` branch) gives `E_SEMANTIC` on the
  second concept. `definition` is required (`validate.ts:110-112`) and must name
  a `definition` block (`expectRef`, `E_REF_BROKEN`). A retired or renamed
  definition gives `E_REF_BROKEN: c_a refers to unknown target def_a`
  (`targets.ts:222-226`), because `definition` is in `REF_ATTRIBUTES`.
- `entity`: a concept's `entity` must name a `node` without its own `entity`
  (`targets.ts:227-235`). `node.entity` to a concept, and `concept.entity` to
  a concept, give `E_REF_BROKEN`, so `concept.entity` and `node.entity`
  cannot form a cycle. The concept inspector lists the node under "Appears
  in" (screenshot `domain-inspector-concept.png`).
- `relation` cycles, a self-loop, and parallel relations: no diagnostic;
  layout in 67 ms.
- Line ends: `is-a` a hollow triangle at `to`; `has` a filled diamond at
  `from` and no arrowhead; `uses` dashed with an arrow; `produces` solid with
  an arrow; `identifies` dotted with an arrow (`encoding.ts:137-143`,
  `svg.ts:111-120, 150-176`; rendered). Cardinality at the `to` end (D7 is
  about collisions only). Markup in `cardinality` is escaped in the SVG text
  and the aria-label.
- Legend: one chip for each category when 2 or more are used, one chip for
  each relation kind used, each with its word.
- Markers in dark mode take `--vs-line` and `--vs-bg`; in forced colours the
  triangle is Canvas with a CanvasText outline, and the diamond and the
  legend chips are CanvasText (`reader.css:855-860, 875-879`; rendered).
- Glossary content: term (the concept's list instance), first sentence,
  "Read more" to the inspector; the term is not linked inside its own
  meaning. Position: beside at 1200 px or more when it fits, under it below
  1200 px, first on a narrow screen with the map behind "Show map"
  (`domain-390.png`). D1 is about where the row sits, not the rule.
- Text projection: the glossary lines, then each relation as "Order has
  Invoice line (1..*): contains", then its body.
- A term whose definition a concept owns opens the concept (probe and
  `domain-term-opens-concept.png`). The concept label is an alias for the
  auto-link and for the review terms (`compile.ts:1769-1788`,
  `review/terms.ts:35-54`).
- `W_JARGON` gives "3 undefined terms; consider a `domain` figure…" when no
  domain exists (`review/index.ts:70-107`). `nativeFor` maps `erDiagram` and
  `classDiagram` to `domain` (`review/shape.ts:41-43`).
- §14.10 sentence: `domain.md:51-53`. `domain.md` has every section that
  `architecture.md` has, and its template checks with no errors (catalogue
  contract test). The SKILL.md step 3 sentence and step 4 row are present and
  follow STE.
- Determinism: identical build hashes in one process and across two.
- `marker-start` IDs cannot collide: the category markers use hue names, and
  the Mermaid render ID `m-FIG` has no `.arrow` suffix.

## Tests (lens 7)

The browser tests check positions, not only visibility, but only relative
to each other (see D13). The unit tests check the right things (markers,
patterns, cardinality, legend words, glossary rows, projection, alias,
concept route, prompts). Their expected values match the spec, except that
the layout test at `domain.test.ts:214` locks in the rule in D2, and the
glossary sentence test uses definitions with no `cite` or break, so it cannot
detect D6.

## Limitations

- Penpot item 7 (phase 4) was not reviewed.
- The full test suite and the browser specs were not run. The browser
  measurements come from my own Chromium script on an in-memory compile,
  with the current `reader.ts` bundled into the session scratchpad, not from
  `tests/browser/domain.spec.ts`.
- Forced colours were emulated in Chromium only. The contrast of the dark
  category tokens was not measured.
- The glossary height estimate in D2 (40 + 44 per row) comes from one
  measurement at 640 px (4 rows, 254 px). Measure 2 or 3 more documents
  before you fix the constants.
- D4 changes a cue that the spec prescribes. The spec owner must decide it.

## Verdict

Changes required. The model, the validation, the relation line ends, the
projection, the prompts, and determinism conform. The wide layout (D1) is
visibly wrong on the default desktop width and must be fixed before the
phase closes, with D2 (compact map), D3 (the Mermaid guide contradicts the
new component), D5 (category word missing from the list view), and D6 (two
different "first sentences"). D4 needs a spec decision. D7 to D13 can go in
the same pass. D14 and D15 are optional.
