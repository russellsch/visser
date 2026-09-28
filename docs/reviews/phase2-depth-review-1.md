# Phase 2 review: depth on click, term auto-link (review 1)

Reviewer: independent review role. Date: 28 September 2026.

## Scope

Specification: `docs/IMPROVEMENTS.md` §2.2, §4.1, §4.2, §4.3, §4.5, §4.6,
§4.7, §13.3, §13.4, §13.5, §13.6. ARCHITECTURE §13.2 (static-first) for the
no-JS lens.

Implementation (uncommitted working tree): `packages/core/src/compiler/autolink.ts`
(new), `compile.ts`, `svg.ts`, `dom-contract.ts`, `packages/core/src/model/validate.ts`,
`packages/core/src/review/terms.ts`, `review/index.ts`,
`packages/runtime/src/reader.ts`, `reader.css`, `views.ts`,
`skills/visual-explain/references/format.md`, `fixtures/positive/term-autolink.md`,
`tests/unit/compiler.autolink.test.ts`, `tests/unit/review.terms.test.ts`,
`tests/browser/depth.spec.ts`, `journeys.spec.ts`, `kinds.spec.ts`, `support.ts`.
Screenshots: `docs/validation/improvements-1/phase2/*.png` (all 12 viewed).

No implementer report exists in `docs/validation/improvements-1/phase2/`, so the
nine deviations come from the task list.

Line numbers are as of 00:30 on 28 September. Another agent was editing
`compile.ts`, `svg.ts`, `encoding.ts`, `layout.ts`, and `reader.css` during this
review, so the `compile.ts` and `svg.ts` numbers can move. Function names are
given as well.

## Findings

| ID | Severity | File:line | What is wrong | Fix |
|---|---|---|---|---|
| R1 | major | `packages/core/src/compiler/compile.ts:757-765` (`compare`, `cellContent`), `compareCellHasDetails` ~1579 | §4.6 is only partly done. A cell with no `value` gets the "›" link whenever it has any body. In `order-intake`, every cell has only a one-sentence body and no value, so all 4 cells still show the link (`order-intake-appendix-1440.png`). The detail that the link opens repeats the sentence that the cell already shows. F8 ("`compare` shows a details link in every cell") is therefore still open on the example that reported it. The "›" also renders on its own line under the text, because it follows the block `div.vs-cell-body`; the spec says "after the text". `compiler.autolink.test.ts:283-303` encodes this reading (`cl_y`, body only, gets the link). | Decide with the spec owner what "a body beyond its value" means for a cell with no value. Proposed reading: the first paragraph of the cell is its value. Show "›" only when the detail holds more than the table shows: a second block, evidence or a `cite`, or a nested `detail`. Keep one table instance for §10.3 by putting `id="v-FIG.CELL"` and `data-vs-target` on `.vs-cell-body` when there is no link. Render the "›" inline, inside the last paragraph or with `display: inline` on the last child. Update the test's expected values. |
| R2 | minor | `compile.ts:1507-1514` (`figureGroup`), `reader.css:343-346` | Without JavaScript, a part with no body and no evidence stays visible (correct for §13.2), but the group title counts only the other rows. On `life-of-a-target-id` without JS, "Parts of 'From source bytes to a reference packet' (0)" opens to 10 rows, "(5)" opens to 13, and "(16)" opens to 24 (probe, JS off). A group marked `vs-appendix-group-bare` shows "(0)" over a full list. | Emit the full row count in the static HTML. Let the runtime rewrite the number to the visible count at init, when it hides the bare rows. Or emit both numbers and show one with `.vs-js`. |
| R3 | minor | `packages/core/src/review/terms.ts:13-16, 58-80`; expectation `tests/unit/review.prose.test.ts:253` | `W_TERM_UNUSED` uses a different match from the build. `termPattern` accepts a plural `s`/`es`, and the main-path text includes headings. The build links neither: a plural needs an alias (§13.3), and a heading is excluded. Reproduced: `shard` used only as "shards", and `widget` used only in a `##` heading, give no prompt, and the built page has 0 term links. The prompt stays silent exactly when the reader gets no hover. | Count a use with the build's `TermMatcher` (`autolink.ts`) over the linkable main-path text: prose, lists, tables, part bodies, and labels, not headings or code. When only a plural matches, say "add `aliases`" in the message. Change the expectation at `review.prose.test.ts:253`. |
| R4 | minor | `packages/runtime/src/reader.ts:353-358` (`showEdgeTooltip`) | The edge bubble's `aria-describedby` goes on the `<text class="vs-edge-label">` child, not on the focusable `<a class="vs-edge">`. With keyboard focus on an edge, the bubble shows but the focused element has no description. Probe on `order-intake` `v-components.e_insert`: active element `aria-describedby=null`, label element `vs-tooltip-text`. | Place the bubble at the label, but set `aria-describedby` on the edge anchor. Pass the anchor as the owner, and pass the label rect separately to `placeTooltip`. |
| R5 | minor | `reader.ts:742-750` (edge loop in `addTermAndEdgeBubbles`); cause in `svg.ts:471` | A trace `after` arrow is `a.vs-edge` with `data-vs-target` set to the *later event* and `data-vs-rel` set to the order relationship. The edge loop reads `bodyText(data-vs-target)`, so hovering or focusing an arrow shows the body of the event it points to. Probe: `v-one_order.ev_reply~after~ev_store` shows "The client learns that the order exists, not that it is paid." §4.7 is about the body of an edge. | Skip `.vs-kind-order` in the loop, or require `data-vs-target === data-vs-rel`. |
| R6 | minor | `reader.ts:679-710` (`markNeighbourhood`, `clearNeighbourhood`, `addNeighbourhoods`) | §4.3 marks the neighbourhood while a node "has keyboard focus". If the pointer enters and leaves another node while a node keeps focus, `pointerleave` clears all marks in the SVG. The focused node then has none. Probe: focus `n_api` (5 `vs-dim`), hover `n_worker`, move away: 0 marks, and focus is still on `n_api`. | In the `pointerleave` handler, call `markNeighbourhood` again if `document.activeElement` is a `.vs-node` in the same SVG. Clear only otherwise. |
| R7 | minor | `compile.ts:1322, 1338, 1349` (`h4` sections); `reader.ts:76` (`h2` title) | In the inspector the heading levels go from `h2` (title) to `h4` (Relationships, Appears in, Evidence). The AX tree shows `["Order store · storage", 2], ["Relationships", 4]`. In the appendix the order is h2, h3, h4, which is correct, but the same element moves into the inspector. | Use `h3` for the sections, and style them the same. The appendix row summary is not a heading, so `h3` stays valid under the group `h3`. Or set `aria-level="3"` while the detail is in the inspector. |
| R8 | minor | `compile.ts:1282-1289` (`labelTermsLine`) | §13.4 (Figures) says: "On a narrow screen the inspector shows the definition under the part." The implementation shows a "Terms: target" line of links at every width, so the reader needs a second click to read the meaning. As a keyboard and no-JS route to a term that is inside an SVG label, the line is a good addition (deviation 5, acceptable). | Under the links, add the first sentence of each definition (the bubble text, from the definition body at build time), at least on narrow screens. Or state the reduced behaviour as a spec deviation. |
| R9 | minor (outside the assigned scope, §13.7) | `skills/visual-explain/SKILL.md:129-132` | The skill still says "A `definition` shows in the appendix, so mark the first use with `term`." This contradicts the §13.3.3 guide text, which `format.md` now carries: "the build links the word. Tag by hand only for a different phrasing." Agents will keep adding redundant tags. | Apply the §13.7 replacement text. |
| R10 | minor | `reader.css:1-6` (header), `docs/ARCHITECTURE.md` §13.2 | The §2.1 principle is now in the `reader.css` header, but the §2.2 principle ("Depth is one click away; the main view carries the path") is written nowhere in the repository. The behaviour follows it. The rule that justifies bare-row hiding and the list toggle is not recorded for later maintainers. | Add the §2.2 wording to the `reader.css` header, and add a sentence to ARCHITECTURE §13.2 that the lists and the appendix stay complete without JS. The Penpot principle is §8 work. |
| S1 | optional | `compile.ts:1436-1446` (`detail`, facts `specifics` after `.vs-detail-text`) | Deviation 6 (a facts list between the body and Relationships) is acceptable. For an architecture node, though, the only fact is `role`, and the title already shows it as the cue word ("Order store · storage", then "role storage", in `order-intake-inspector-1440.png`). That is the repetition that F2 complains about. | Omit a fact whose value equals the cue word. |
| S2 | optional | `reader.css:268-269, 272-278` | `.vs-term-quiet` and SVG `.vs-term` have `cursor: help` and a hover underline without JavaScript. Without JS there is no bubble and no action, so the affordance promises nothing. | Scope these rules to `.vs-js`. |
| S3 | optional (spec-mandated behaviour) | `reader.ts:939-955` | A click on a term inside a node label opens the definition, not the node. For a label that is a whole term, such as "Reference packet" (`v-tf_packet.sg_ref`), only the box padding still opens the part, and on touch a label tap never reaches the part. §13.4 requires the term's own hit area, so this is not a defect. It is a usability risk worth checking with a user. | If it proves confusing: show the bubble on hover, and let a click on the label open the part, where the inspector's "Terms" line (R8) gives the definition. |

### Hypotheses (not verified)

- H1. Without JavaScript in Firefox or Safari, a fragment link to a part (for
  example, the SVG node `<a href="#x-st_exact">`) lands inside a collapsed
  "Parts of" `details`. Chromium opens the ancestor `details` on fragment
  navigation (verified: `groupOpen: true`). Other engines may not, and the
  browser suite is Chromium-only. In print without JS the content does show,
  through `details::details-content` (`reader.css:715`). Mitigation, if
  confirmed: emit the part groups `open` in the static HTML and collapse them
  in `init()`.
- H2. `<summary><h3>…</h3></summary>` is exposed as a heading in the
  Chromium AX tree (verified). Some WebKit/VoiceOver combinations flatten the
  children of a summary. Not tested.

## Spec conformance

| Item | Status | Where | Notes |
|---|---|---|---|
| §2.2 | partly | behaviour: `views.ts:11-19`, `reader.css:171-181, 343-346` | The behaviour follows the principle. The text is not recorded (R10). |
| §4.1 | done | `views.ts:11-19`; `reader.ts:627-670`; `reader.css:176-181, 718-721` | Wide: drawing first, "Show as list", `aria-pressed`, and a name that includes the figure label. Narrow: lists first, "Show map". No JS and print: both views. The lists are hidden with a class, not with `hidden`; the effect is the same. |
| §4.2 | done | `compile.ts` `relationshipSection` ~1302, `appearsInSection` ~1329, `evidenceSection` ~1345, `detail` ~1435; `reader.ts:77-93, 140-147` | The order holds: label · cue, body, Relationships, Appears in, Evidence, then Copy reference last (footer). Appears in covers `entity` only; no `definition` reference attribute exists in the model yet (§5). Facts sit between the body and Relationships (deviation 6, and S1). |
| §4.3 | done | `reader.ts:679-710`; `reader.css:321-322, 722` | Adjacency comes from static `data-vs-edge`/`data-vs-other` items, and opacity is 0.35. One defect: R6. |
| §4.5 | done with JS; partly without JS | `compile.ts` `appendixGroup` ~1496, `figureGroup` ~1507, `detail` ~1435; `reader.ts:207-218, 827-850` | Sources, Definitions, and Details come first and open. There is one collapsed "Parts of 'T' (N)" group per figure, and each row reads "label · cue". A bare row is hidden only with JS (acceptable), but the count is wrong without JS (R2). |
| §4.6 | partly | `compile.ts:757-765` | R1. |
| §4.7 | done | `reader.ts:353-358, 742-750` | The bubble shows the first sentence of the body. R4 and R5. |
| §13.3 | done | `autolink.ts`; `compile.ts` `inlines`/`linkText`/`termLink` ~213-275, `link` ~303, `inlineTag` ~327, `heading` ~360, `linkableDefinitions` ~1561; `svg.ts:52-80` | Prose, lists, tables, the figure question, part bodies, and SVG labels are linked. Headings, code, fences, links, `term`/`cite`/`focus`/`detail-link`, sources, the definition's own body, and `auto=false` are not. `document.md` comes from the AST (`projectText`), so it is unchanged. On `life-of-a-target-id` the main path has 26 hoverable uses (18 links, 8 quiet), not the 31 that the spec expected. The gap is plurals without `aliases` and uses inside headings, as the spec's own rules predict. |
| §13.4 | mostly done | `reader.css:251-316`; `reader.ts:286-345, 712-760, 939-955` | The underline, above/below placement with the arrow, 40ch width, page colours in dark mode (verified: bubble background = body background), forced colours, the tap-then-tap sequence, and SVG terms all work. The narrow-screen definition under the part is only links (R8). The Penpot `ui / term` component is outside this code review. |
| §13.5 | done | `compile.ts` `withTermScope`/`termLink`; `svg.ts:52-80` (`seen`) | One underline per paragraph, list item, table cell, figure question, and SVG label. Later uses are quiet spans, which are hoverable and not in the tab order. |
| §13.6 | done, one defect | `terms.ts`; `review/index.ts` `jargon` | W_JARGON no longer reports a term that is defined but not tagged. W_TERM_UNUSED respects aliases and `auto=false`, but its match differs from the build (R3). W_TERM_COLLISION reads aliases and component/mode names, and skips `auto=false`. |

## The nine deviations

| # | Deviation | Judgement |
|---|---|---|
| 1 | `dom-contract.ts` changed | Acceptable. The contract has to document `data-vs-cue`, `data-vs-figure`, `data-vs-edge`, `data-vs-other`, the group structure, and the quiet term. It is documentation plus the attribute constants only. |
| 2 | Bubble position set through the CSSOM | Acceptable. CSP `style-src 'self'` blocks style attributes in markup, not CSSOM writes. The static HTML still has no `style=` (the `compiler.render.test.ts:105` and `compiler.families.test.ts:64` checks still hold). The placement was verified in the browser. |
| 3 | Compare "›" only for a cell with a body and no value | Finding R1. F8 stays open on `order-intake`. |
| 4 | Bare rows hidden only with JS | Acceptable, and required by §13.2 and by §2.2 ("full content for readers without JavaScript"). Side effect: R2. |
| 5 | Generated "Terms:" line under a part | Acceptable as the keyboard and no-JS route to a term inside an SVG label. It is less than §13.4 asks for (R8). |
| 6 | Facts list between the body and Relationships | Acceptable. §2.2 puts kind, basis, and status "one click away", and the inspector is where they go. Optional S1. |
| 7 | With `auto=false`, a definition counts as used only with a hand tag | Acceptable. With no auto-link, a plain occurrence gives the reader nothing. The message says what to do. |
| 8 | "Open definition" in the bubble is pointer-only | Acceptable. With the keyboard, Enter on the focused term opens the definition (verified: Tab reaches the first term link, the bubble shows, `aria-describedby` is set, Enter opens `#x-def_target` in the aside, and focus goes to the inspector title). `tabindex=-1` and `aria-hidden` keep the transient bubble out of the tab order. |
| 9 | Headings and summaries not linked | Acceptable. §13.3.2 excludes headings. A summary is a disclosure control whose text is the target's label, and a term link inside it would nest two controls. The figure caption is treated as a heading, and the question under it is linked. |

## Lens results

**Static-first and no JS** (headless Chromium, JS off, built `life-of-a-target-id`):
both `.vs-lists` are visible and there is no toggle. Every part row is in the
DOM, 26 of them bare, and all show when their group is opened. The 26 term
links are plain `<a href="#x-def_…">`; a click lands on the definition in
the open Definitions group. SVG-label terms reach their definition through
the "Terms:" line in the part detail. The quiet spans have no link, but the
first use in the same paragraph has one. Defects: R2, and H1 outside
Chromium.

**Security** (release build of a hostile document): the term `<b>x</b>`
renders escaped in prose, in the figure question, in an SVG tspan, and in
the summary. `&lt;script&gt;` in prose stays escaped, and `script` inside it
is linked only as escaped text. `a.b`, `(x)`, `$1`, `a|b`, `[z]`, `c++`, and
`\d` match literally: `axb` and `$11` are not linked. The aliases `amp` and
`lt` do not match inside entities, because the scan runs on raw text before
escaping. Nothing is linked in inline code, fences, link text, link URLs,
`data-vs-label`, `aria-label`, `data-vs-question`, the figcaption, or the
heading. Raw HTML in prose is rejected before this code runs
(`E_UNSAFE_CONTENT`).

**Determinism**: a document with `packet`/`Packet`/`reference packet(s)`,
`target`/`targets`/`target ID(s)`/`TARGET`, mixed case, and hyphen and
apostrophe boundaries was built twice, and `index.html` was byte-identical.
The longest phrase wins, and the first definition in document order owns a
shared phrase. `check --review` reported both overlaps as W_TERM_COLLISION.

**Accessibility**: the keyboard path to a definition works (see deviation 8).
`aria-describedby` exists only while a bubble shows, and `hideTooltip`
removes it. `vs-dim` is opacity only, and Tab moves on and clears it
(depth.spec). "Show as list" has `aria-pressed` and the name "Show as list:
<figure title>". The inspector sections have headings (R7 for the levels).
The compare "›" has `aria-hidden` on the glyph and the name "<option>:
<criterion>, details". Its box is 24×18 px, which passes 2.5.8 only by the
spacing exception. Quiet spans have no tab stop, and the first use in the
same paragraph is reachable. Defects: R4, R6, R7.

**Regression (journeys.spec.ts)**: the 23:36 Playwright report was saved
before this run replaced it. It lists 26 journeys tests, including the
user's four "appendix and inspector (dogfood-3 F3, F4)" tests. The current
file has the same 26 titles. None was removed. Two of the user's tests were
changed to the new DOM (`summary > h3` headings, and the filter now skips
bare rows). `showList` was added before 4 tests that click a list entry on a
wide screen. No copy of the pre-edit test bodies exists, so I cannot rule out
that an assertion was weakened. The present assertions still check Sources
first, then Definitions, and the source origin.

**Performance**: `TermMatcher` compiles one alternation regex and scans each
text run once. Measured with a copy of `autolink.ts`: 0.08 ms for 2,000 words
with 20 definitions (60 phrases), 0.49 ms for 20,000 words, and 3.3 ms for
200 definitions. This is linear in the text, with no quadratic term that
matters. The per-part sections are O(parts × targets) (`appearsInSection`)
and O(parts × relationships) (`relationshipSection`), which is well under a
millisecond at document scale.

## Checks run

- `npx vitest run tests/unit/compiler.autolink.test.ts tests/unit/review.terms.test.ts tests/unit/runtime.views.test.ts tests/unit/compiler.families.test.ts`: 4 files and 27 tests passed (00:21).
- `dist/release` (00:18:31) is newer than the last edit to `reader.ts`
  (00:08:49), so `npx playwright test tests/browser/depth.spec.ts` was run:
  11 passed, and 6 were skipped by design (width-gated), exit 0.
- The expected values in `compiler.autolink.test.ts`, `review.terms.test.ts`,
  and `depth.spec.ts` were read against the spec. They match the spec except
  for the compare case (R1) and `review.prose.test.ts:253` (R3).
- Release CLI builds (`dist/release/bin/visser.cjs build --dev-toolkit dist/release`)
  of copies of the fixture, `life-of-a-target-id`, `order-intake`,
  `bounded-queue`, `mermaid-flowchart`, and hostile, determinism, and
  unused-term documents. The builds went only under the scratchpad.
- Headless Chromium probes (playwright-core, no reporters) over a local HTTP
  server: JS off (lists, bare rows, deep link, print, term link) and JS on
  (Tab to term, Enter, Escape, quiet span, SVG term, node box click, edge
  focus, Expand details, bare deep link, dark bubble, trace arrow bubble,
  neighbourhood with focus, compare link size, Chromium AX tree).
- `check --review` on the determinism and unused-term documents.

## Limitations

- Another agent edited `encoding.ts` during the review (00:22). Its exports
  then no longer matched `compile.ts`, so a direct TypeScript harness failed
  to import the compiler. All builds therefore used `dist/release` (00:18).
  That build is newer than every phase-2 source edit (latest 00:12:33), but it
  can contain part of the phase-1 work in progress.
- journeys, kinds, mermaid, and export specs were not run; the run was not
  authorized. The Mermaid deep-link path was checked with a probe instead.
- Only Chromium was tested. H1 and H2 need Firefox and WebKit, or an AT
  check.
- The Penpot items (§13.4 `ui / term`, the §2.2 principle in Penpot) were
  not reviewed.

## Verdict

Phase 2 is close to done and structurally sound. The auto-link is
deterministic, linear, and escape-safe. It stays out of code, fences,
headings, links, sources, and attributes. The static HTML keeps the lists,
every appendix row, and a plain link from every underlined term to its
definition, so the static-first rule holds. The inspector, the neighbourhood,
the list toggle, and the term look match the spec. Eight of the nine
deviations are acceptable. The one substantive gap is §4.6: under the literal
reading that was chosen, every cell of the `order-intake` compare still has
its details link, so F8 is not fixed where it was reported. That needs a
spec-owner ruling and a small change (R1). The rest are minor: a wrong
no-JS count, a review rule that disagrees with the linker, three runtime
focus and description details, a heading level, and documentation drift. None
of them blocks merging. R1 should be settled before the phase is called
complete.
