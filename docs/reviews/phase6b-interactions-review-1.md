# Phase 6b review 1: figure interactions (IMPROVEMENTS §14.9, §3.3)

Reviewer: independent review role. Date: 2026-09-28. Scope: the uncommitted
working tree on branch `explain-plan`. The reviewed files are
`packages/core/src/model/{validate,project}.ts`,
`packages/core/src/compiler/{svg,compile,encoding,dom-contract}.ts`,
`packages/core/src/review/index.ts`, and the interaction blocks of
`packages/runtime/src/{reader.ts,reader.css}`. The review also covers
`skills/visser-visual-explain/SKILL.md` step 7, the new bullets in
`catalogue/{architecture,transform,plan}.md`, `tests/fixtures/interactions/index.md`,
`tests/unit/figure-interactions.test.ts`, `tests/browser/interactions.spec.ts`,
and the four screenshots in `docs/validation/improvements-1/phase6b/`. The
steps runtime (`packages/runtime/src/components.ts`, phase 6a) is read only
where it shares `vs-dim` and `vs-near` with this phase.

## Verdict

**Changes requested.** No finding is High. The static-first and determinism
claims hold: the static HTML has every fold box, Fold control, and proxy edge
`hidden`, the no-JS page shows the unfolded map, and two builds in separate
processes are byte-identical. Quantities are escaped everywhere, and filter
tokens come from enums only. Fix these before commit:

- F1: print shows the folded map.
- F2: proxy edges share segments at the fold box.
- F4: the end of a walkthrough removes the filter dims.
- F6 and F7: fold boxes do not take part in dim or near, so focus links and
  steps that point into a folded group show nothing.
- F11: the muted quantity in a lossy conversion label fails the contrast minimum.

F14 needs a recorded decision. The rest are Low.

## Findings

| ID | Severity | File:line | What is wrong | Fix |
|---|---|---|---|---|
| F1 | Medium | `packages/runtime/src/reader.ts:237-248`; `packages/runtime/src/reader.css:674`, `:701-703` | With JavaScript, collapsed groups start folded. Print keeps that state: the fold box prints in an empty area, and the group's nodes, edges, and boundary do not print. `beforePrint` does not unfold the groups, and the print CSS resets nothing for folds. | Add print CSS: `.vs-viewport svg [data-vs-fold], .vs-viewport svg [data-vs-fold-toggle], .vs-viewport svg [data-vs-proxy-for] { display: none !important }` and `.vs-viewport svg a.vs-group[hidden], .vs-viewport svg a.vs-node[hidden], .vs-viewport svg a.vs-edge[hidden]:not([data-vs-proxy-for]) { display: inline !important }`. Add a browser test under print emulation. |
| F2 | Medium | `packages/core/src/compiler/svg.ts:383` | The L join attaches every proxy whose exit point is outside the box extent (±12 px) to one point: the middle of the box side. Proxies on the same side then overlap on one line, and their arrowheads fall on one point. The reader cannot tell which edge enters and which leaves. A hover or click on the shared segment reaches only the top proxy. | Give each proxy its own attach point on each box face: sort the proxies by exit coordinate and spread them over the face length minus the inset. Join with the Z form. Add a unit test that no two proxies visible in one fold state share a segment. |
| F3 | Low | `packages/core/src/compiler/svg.ts:414` | The second outline (`vs-fold-back`, offset +4,+4) is painted after the edges. It covers the last 4 px of each arrowhead that enters the right or the bottom face. | End an incoming proxy 4 px outside the right or bottom face, or paint the back rect at −4,−4. |
| F4 | Medium | `packages/runtime/src/components.ts:73-76` with `packages/runtime/src/reader.ts:823-830` | When a walkthrough goes back to its overview, the steps code removes `vs-dim` from every part. The pressed chips are not applied again, but each chip keeps `aria-pressed="true"`. | Let one owner compute the SVG marks: after the steps code clears, call the figure's filter (export `applyFilter`, or send an event that the reader handles). Or give the filter its own class with the same opacity. |
| F5 | Low | `packages/runtime/src/reader.ts:727-733`, `:766-769` | The hover neighbourhood and the cross-figure highlight remove each other's `vs-near`. (a) `clearEntity` removes the near mark from a part that is adjacent to the focused node. (b) `clearNeighbourhood` removes the entity mark that a focused part in another figure set. | Use a separate class for entity marks (such as `vs-entity-near`, styled like `vs-near`), or compute all marks again from state in one function. |
| F6 | Medium | `packages/runtime/src/reader.ts:719`, `:826`; `packages/runtime/src/components.ts:49-63` | A fold box is a `g` with no `data-vs-target`, so the neighbourhood, filter, and steps code never mark it. With a chip pressed, a step active, or a node hovered, the fold box stays at full opacity and looks like a matched part. A step target inside a folded group gets `vs-near` while it is hidden, so the drawing shows nothing. | Add a `syncFolds(svg)` helper. It gives each visible fold box `vs-near` when a part it hides is near, and `vs-dim` when every part it hides is dim. Call it at the end of `markNeighbourhood`, `clearNeighbourhood`, `applyFilter`, steps `mark()`, and `applyFolds`. |
| F7 | Medium | `packages/runtime/src/reader.ts:1213-1220`, `:435-440` | A prose `focus` link to a part inside a folded group does nothing visible on a wide screen. `highlight` marks the hidden SVG instance and the hidden list instances. `scrollIntoView` targets the hidden SVG node, so the page does not scroll. | Before the highlight, unfold each folded group that hides a focus target, or mark its fold box and scroll to it. |
| F8 | Low | `packages/runtime/src/reader.css:112-115` (precedent at `:414`) | After a mouse click unfolds a group, Chrome draws its user-agent `:focus` ring (auto, 5 px) on the Fold control, although `:focus-visible` is false. The `:focus-visible` rule does not control this ring. Screenshots 2 and 3 show it. | Add `.vs-viewport svg [role="button"]:focus:not(:focus-visible) { outline: none; }`. This was checked through CSSOM: the ring goes after a mouse click, and a keyboard move keeps the 3 px accent ring. |
| F9 | Low | `packages/core/src/compiler/svg.ts:240-241` | The Fold controls are the last elements in the SVG. After a keyboard unfold, the focus moves to the Fold control, so the next Tab leaves the figure. The revealed nodes are reachable only with Shift+Tab. | Emit each Fold control directly after its `a.vs-group`, so the next Tab reaches the revealed parts. Or move focus to the first revealed node. |
| F10 | Low | `packages/core/src/compiler/svg.ts:260-261`, `:421-427` | The Fold control is 40 × 20 px. That is less than the 24 × 24 px of WCAG 2.5.8 and the 44 px narrow-screen rule of this project (`reader.css:721`). It sits on the group link, so the spacing exception does not apply. | Make the control at least 44 × 24 px, or add a larger transparent hit rect. |
| F11 | Medium | `packages/core/src/compiler/svg.ts:98`, `:116`; `packages/core/src/compiler/compile.ts:872` | A figure can show the loss hue (2 or more loss values). In such a figure, a lossy conversion with a `quantity` has its quantity drawn in amber at `fill-opacity` 0.72. In the light theme the contrast is 3.07:1 on the label background, less than the 4.5:1 minimum. The ink case (6.52:1) and the dark theme (6.04:1, 7.97:1) pass. | Mute the quantity with the muted ink colour, not with opacity on the hue: `.vs-figure svg .vs-edge-quantity { fill: var(--vs-muted); fill-opacity: 1 }`, and `CanvasText` in forced colours. |
| F12 | Low | `packages/runtime/src/reader.css:695`; `packages/runtime/src/reader.ts:846-850` | The "Clear" button is taller than a chip. When the first chip is pressed, the legend row grows, and the drawing moves 8 px down (screenshot 2: map top at y 314; screenshot 4: y 322). | Give `.vs-legend-clear .vs-btn` the chip height, or keep its space when it is hidden. |
| F13 | Low | `packages/runtime/src/reader.css:701-703`, `:780` | Print removes the dims but keeps the pressed look of a chip, so the printed legend claims a filter that the drawing does not show. | In print, show `.vs-legend-toggle[aria-pressed="true"]` with the unpressed look. |
| F14 | Medium (a spec deviation that needs a recorded decision) | `packages/runtime/src/reader.ts:900-903` | Stated deviation: a folded group leaves its area empty. The boundary is also hidden. Screenshot 1 shows the fold box in about 260 px of blank space, which looks like a render fault, and the map keeps its full size. §14.9 calls folding "the main tool for a map over 25 nodes". IMPROVEMENTS and REVISIONS do not record the deviation. | Record the deviation in §14.9 or REVISIONS. The smallest visual fix: keep the group boundary while the group is folded (dashed stroke, group label hidden), so the space reads as the place of the group. A compact second layout can be a follow-up. |
| F15 | Low | `packages/runtime/src/reader.css:674`; `packages/core/src/compiler/svg.ts:199`, `:412`, `:424` | Stated deviation: `hidden` plus a CSS rule, not an SVG `display` attribute. Without `reader.css` (a blocked stylesheet, or a copied SVG), the fold boxes are drawn over the groups and the proxies double the routes. With JavaScript but no CSS, folding hides nothing. No product path exports the SVG alone. | Acceptable. Optional hardening: emit `display="none"` and let the runtime toggle the `display` attribute, not `hidden`. |
| F16 | Low | `packages/core/src/model/project.ts:127-131` compared with `:283-289` | Stated deviation: relationship evidence prints as "Evidence: src_load", and part evidence prints as "Evidence: TITLE (ID)". One projection then uses two formats. | Print "TITLE (ID)" in `evidenceLine` for every relationship (this changes the causal-link golden text), or record why the formats differ. |
| F17 | Low (docs) | `skills/visser-visual-explain/references/catalogue/architecture.md:95`, `transform.md:79`, `plan.md:82-88` | The Diagnostics sections do not list `W_EVIDENCE_GAP` for a `quantity` with no `evidence`. | architecture and transform: "- `W_EVIDENCE_GAP` (`check --review`): a `quantity` with no `evidence`. Name the source of the number." plan: "- `W_EVIDENCE_GAP`: a `due` date or a `quantity` with no `evidence`. Name the source." |
| F18 | Low (docs) | `docs/ARCHITECTURE.md:809`, `:811`, `:1661` | ARCHITECTURE has no text for `group collapsed`, for `quantity` and `evidence` on `edge`, `conversion`, and `dependency`, or for the new DOM attributes. The `W_EVIDENCE_GAP` row does not list the quantity rule. | Add the optional attributes to the tag rows with one sentence each. Add "a relationship `quantity` with no `evidence`" to row 1661. Add a §10 paragraph that mirrors `dom-contract.ts:88-104`. |
| F19 | Low (docs) | `skills/visser-visual-explain/references/catalogue/architecture.md:51-55` | The guide says to use `collapsed` on a map above 25 nodes, and the next bullet says `W_VISUAL_DENSITY` fires above 25 nodes. The prompt still fires with collapsed groups (`review/index.ts:187`), so the advice does not clear it. The bullet also does not say that without JavaScript the group shows unfolded, and that the lists always show every part. | Add: "The warning stays. Without JavaScript and in print the group shows unfolded, and the lists show every node." Or count a collapsed group as one node in the density rule. |

### Hypotheses (not confirmed)

- H1. `labelAt` (`svg.ts:395-406`) moves a proxy label with no collision
  check against nodes, other labels, or fold boxes. The label is painted
  under the nodes and the fold boxes, so it can be hidden. Three scratch
  layouts did not put an original label inside a folded group, so the move
  was not observed. This needs a larger fixture.
- H2. A part in another figure can have `vs-dim` (filter) and `vs-near`
  (entity) at the same time. It then shows dimmed with a thick stroke. This
  was seen in the code only; the result was not judged visually.

### Optional suggestions

- A hover or focus on a fold box could run the neighbourhood and the
  cross-figure highlight for the parts it hides. Today the direction from an
  actor to the fold box works, but the direction from the fold box to the
  actor does not.
- A chip's accessible name is the value word ("storage", toggle button). Only
  the Clear button says "filter". Give the chips a group label such as
  "Filter the figure", or an `aria-describedby` hint.
- Test gaps: print, steps with a chip, fold boxes under dim, focus links into
  a folded group, and proxies that share no segment.

## Lens results

### 1. Spec conformance

- **Collapsible groups (§14.9).** `validate.ts:69` adds `collapsed: boolean`
  to `group`. `svg.ts:270-335` emits a fold box with "LABEL · N" and a muted
  count, and a proxy for each fold combination. `reader.ts:942-958` starts
  each group folded, and a click or Enter/Space unfolds it in place. Edges
  attach to the fold box (with the geometry defects F2 and F3). Without
  JavaScript the groups are unfolded (confirmed). Print is not unfolded (F1).
- **Cross-figure highlight.** `compile.ts:1785-1800` emits
  `data-vs-entity`. `reader.ts:757-810` gives `vs-near` to the parts in
  other figures on hover and focus of `a.vs-node` (this includes domain
  concepts and trace events) and `a.vs-lane` (actors). A hidden part is
  marked through its fold box. This conforms. The class conflicts are in F5.
- **Edge quantities.** `validate.ts:52`, `:75`, `:94-96`, and `:114`
  (conversion) add `quantity` and `evidence`. `transition` rejects
  `quantity` (unit test). The label shows "label (q)" with the quantity
  muted (`svg.ts:88-112`), and so do the list (`compile.ts:768`), the
  inspector, and the projection (`project.ts:148-150`).
  `review/index.ts:265-272` gives `W_EVIDENCE_GAP`. This conforms, apart
  from the contrast defect F11. A plan dependency reads "needs the build
  (3 days) (input)": two parentheses, which is acceptable.
- **Filter chips.** `encoding.ts:286-323` and `compile.ts:822-911` put a
  VARIABLE:VALUE token on each chip and each part. `reader.ts:837-876` makes
  each chip a toggle button with `aria-pressed`. Two or more pressed chips
  mean "any of these", and a Clear button appears. This conforms. The
  pattern chips (edge `kind`, `basis`) also filter. That is a benign
  extension of "a chip per value in its legend".
- **§3.3 Legend.** The legend stays static HTML without JavaScript (the @nojs
  test passed). With JavaScript, each chip's content moves into a button, and
  the legend still shows under the interpretation paragraph. For print, see
  F13.

The stated deviations:

- *Example changed in a copy only.* Acceptable. The fixture and the browser
  spec exercise folding. No shipped example has a collapsed group.
- *`hidden` plus a CSS rule.* Acceptable. It is fragile without the
  stylesheet (F15).
- *Only `collapsed=true` groups can fold.* This conforms to §14.9, which
  gives no fold control to other groups. No finding.
- *"Evidence: ID" for edges in the projection.* Inconsistent. Low (F16).
- *A folded group leaves its area empty.* This works against the purpose of
  the feature, and no document records it (F14).

### 2. Determinism and static-first

- The fixture was compiled twice in two separate Node processes from the TS
  sources (no build): `cmp` reported the files identical. The unit test also
  compares two builds in one process.
- In the static HTML, each fold box, Fold control, and proxy carries
  `hidden` (`svg.ts:199`, `:412`, `:424`). The `.vs-viewport svg [hidden]`
  rule is in the static `reader.css`, so it works without JavaScript. The
  `@nojs` test in the browser spec passed: no fold box, Fold control, or proxy
  is visible, and every node and edge is visible.
- Print: with JavaScript, the page prints the folded state (F1). The probe
  sent `beforeprint` and then used print media emulation: the fold box has
  `display: inline`, and `n_api` has `display: none`.

### 3. Proxy geometry

- **An edge that leaves one folded group and enters another.**
  `e_invoice~g_orders~g_billing` runs from the right face of the orders box
  to the top face of the billing box. The unit test checks both ends.
- **An edge inside one folded group.** It gets no proxy: `svg.ts:315` skips
  f = t, and it skips a fold that holds the other end. The edge is in the
  hide list of its group. This was confirmed for `e_save` and for scratch
  edges `e3` and `e2` with nested groups: `e2` gets only the proxy for the
  inner group, which applies while the outer group is unfolded.
- **Nested groups.** `standIn` (`reader.ts:890`) selects the outermost
  folded group that is not hidden, which is correct.
- **Paint order.** Fold boxes and Fold controls are painted last
  (`svg.ts:240-241`). A proxy therefore never draws over the fold box label.
  A proxy label can be hidden under a node or a box (H1).
- **Defects found.** Proxies converge on one attach point (F2), and the back
  outline covers the arrowheads (F3). With a long group label, the Fold
  control does not overlap the group label: ELK sizes the group to the label,
  and a 16 px gap remains.

### 4. Accessibility

- The fold box is `role="button"` with `tabindex="0"`, and its name is
  "Unfold Order service (2 nodes)". The visible text "Order service" is in
  the name. The Fold control's name is "Fold Order service". Enter and Space
  both work, and Space does not scroll the page.
- After a keyboard unfold, focus moves to the Fold control, and
  `:focus-visible` is true. After a keyboard fold, focus moves to the fold
  box. After a mouse click, the ring comes from the user-agent `:focus` rule,
  not from `:focus-visible` (F8). The next Tab leaves the figure (F9). The
  Fold control is too small (F10).
- Each chip is a `<button>` with `aria-pressed` and a visible word, and its
  swatch is `aria-hidden`. Clear is a button after the chips, with the name
  "Clear the filter: TITLE", which contains the visible text. After Clear,
  focus moves to the first chip.
- `vs-dim` is only `opacity: 0.35` (`reader.css:333`). No part leaves the
  accessibility tree. Folding does remove parts (display: none), as intended,
  and the lists keep them.

### 5. Security

A quantity of `40 <b>MB</b>/s & "x"` came out escaped in the SVG label
tspans, the edge `aria-label`, the list `.vs-rel-quantity`, and the inspector
`<dd>` (`h()` escapes text and attributes, and `safeText` handles bidi
controls). The projection is Markdown text, and the quantity has the same
exposure as a label there. `data-vs-filter` values come from the enums
`role`, `kind`, `status`, `basis`, and `category` (`validate.ts:72`, `:76`,
`:92`, `:96`, `:106`, `:130`), or from the fixed words `loss`, `none`, and
`unstated`. The runtime compares tokens through a `Set` and never builds a
selector from them. Group IDs in selectors go through `CSS.escape`.

### 6. Interaction conflicts (`vs-dim` and `vs-near`)

The precedence as the code implements it: a neighbourhood hover replaces
the filter dims. `clearNeighbourhood` removes every mark in the SVG and then
applies the filter again. A step replaces both, and the steps `restore`
applies the step marks again after a `pointerout` or `focusout`. The end of
a walk removes every mark. The entity marks are added and removed without
checking the other owners. The folds change only `hidden`.

| Sequence | Expected | Actual |
|---|---|---|
| Press the "storage" chip, hover `n_api`, fold its group with Space while the pointer stays, leave (the lens example) | The filter dims come back; no neighbourhood marks | As expected. Chromium sends `pointerleave` when the hovered node becomes hidden. No stale class. |
| Press the "external" chip, Next, then Overview | The non-external parts have `vs-dim`; the chip is pressed | No `vs-dim` anywhere; the chip still has `aria-pressed="true"` (F4) |
| Unfold, focus `n_worker`, hover the trace actor `a_provider`, leave | `n_provider` has `vs-near` (adjacent to the focused node) | No class (F5a) |
| Unfold, focus the actor `a_api`, hover the map node `n_store` (no Appears-in), leave | The map node `n_api` has `vs-near` (entity of the focused actor) | No class (F5b) |
| Press the "external" chip with the group folded | The fold box, which hides 4 parts that are not external, dims | The fold box has no class and opacity 1 (F6) |
| Step 1 (targets inside the folded group) | The fold box is near; the other parts dim | `n_api` has `vs-near` and `hidden`; the fold box has opacity 1 (F6) |

### 7. Guides and SKILL.md

The new bullets obey the STE rules in `SKILL.md`: one idea in each sentence,
the active voice, and no instruction longer than 20 words. The SKILL.md
sentence has 19 words. The missing `W_EVIDENCE_GAP` lines are in F17, the
ARCHITECTURE gaps in F18, and the density advice that the warning
contradicts in F19.

### Test expectations

The expected values in the unit and browser tests match the code and the
spec for the cases that they cover. The proxy list, the fold hide lists, the
dim sets for the storage and interface chips, the focus moves, and the @nojs
visibility are all correct. The label check `'create invoice (40req/s)'`
encodes a line wrap, so it breaks when the wrap point moves. The tests do
not cover print, several proxies on one side, fold boxes under the dims, or
interplay with the steps code.

## Checks run

- I read the spec (§2.2, §3.2-3.3, §4.1-4.3, §14.9), the DOM contract
  (`dom-contract.ts:60-104`), `git diff` of the listed files, and the steps
  runtime `components.ts` (09:41 version).
- I compiled with a scratch script that imports the TS sources, with no build
  and no repository writes. Inputs: the fixture (twice, compared with
  `cmp`); a nested fixture (outer and inner collapsed groups, another
  collapsed group, an open group, 7 edges); a long group label; a left-to-right
  layout for the label move; and a transform and plan with quantities that
  contain HTML specials.
- I ran Chromium probes with the Playwright library against scratch copies
  under the scratchpad, served by `dist/release/bin/visser.cjs serve` (built
  09:41). HOME and VISSER_HOME pointed into the scratchpad. The probes covered
  print, the steps with chips, the folds with steps and hover, focus after a
  mouse and a keyboard unfold, the Tab order, a CSSOM test of the focus fix, a
  focus link into a folded group, the conflicts between the entity and
  neighbourhood marks, the lens sequence, and the contrast of the muted
  quantity in both themes.
- `npx playwright test tests/browser/interactions.spec.ts` (once): 16 passed,
  4 skipped (the hover tests on 320 px). The run wrote the `reports/`
  artifacts.
- `npx vitest run tests/unit/figure-interactions.test.ts` (once): 14 passed.
  Its global setup rebuilt `dist/release`.

## Limitations

- Chromium only. Firefox and Safari differ in their `:focus` rings and in the
  boundary events when a hovered element becomes hidden.
- No screen reader run. The accessibility results come from roles, names,
  and computed states.
- Another agent edited `components.ts` during the review; its "overview does
  not clear" fix landed at 09:41. F4 is against that version.
- No forced-colours or narrow-screen visual check of the fold boxes.
- H1 is unconfirmed. It needs a map where the label of an edge that crosses
  a group lies inside the group.
