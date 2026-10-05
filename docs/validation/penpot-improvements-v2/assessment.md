# Visser iteration 02 — design and validation notes

Date: 29 September 2026.
Status: Penpot design iteration completed; application implementation and human evaluation remain separate.

## Artifacts

- [Screenshot gallery](index.html): all 19 boards.
- [Proposal document](../../../improvements.md): stable P01–P10 proposals and concrete iteration decisions.
- [Board and interaction manifest](manifest.json): page, file, board IDs, and stored navigation links.
- [Content checks](content-checks.json): SQLite practice sequence, encoding example, and PNG integrity results.
- [Previous iteration](../penpot-improvements/index.html): retained for comparison.

Penpot page: **Visser — Iteration 02 · See the mechanism**.
Prototype flow: **Visser 02 · See the mechanism**, beginning at board 00.
The page uses native editable text, paths, rectangles, and boards.

## What changed

Observed values now appear in event labels alongside their explanations. Read-view boundaries explain the outcomes without equating a snapshot with a scalar.
Two cases remain visible together. Local explanation states retain the main diagram.
A real 390-pixel design preserves the post-commit contrast.
The quiz separates selection from submission and responds to the explicitly selected reasoning.
Its transaction-reset follow-up preserves the practice value of 60.
A second example follows one code point through UTF-8 and Base64, with optional byte detail.
The walkthrough uses stronger selected edges and readable supporting endpoints.

Board 16 compares design iterations rather than a controlled experiment with equal content.
Its appearance does not establish a comprehension improvement.

## Checks performed

- Programmatic text-boundary checks across all 19 boards found no out-of-board text or pairwise text overlaps.
- All 124 stored interaction records target existing boards; all boards are reachable from the index.
- The page has one named prototype flow. Duplicate automatic flow entries were removed from this new page.
- Exported PNGs passed signature and per-chunk CRC validation.
- Primary screens and interaction variants were visually inspected through rendered exports.
- An independent reader inspected six main screenshots and found no remaining high-impact visual or semantic defect.
- A reported crop in the byte-detail screenshot was rechecked in isolation and retracted as a display artifact.
- A disposable SQLite WAL test returned 100 on first read, 100 after another connection committed 60, and 60 after transaction end.
- Python confirmed that U+00E9 encodes as C3 A9 and Base64 w6k=, and decodes back to the original text.

## Limits

Prototype links were checked as stored Penpot interaction configuration, not clicked through in a browser.
The live Penpot viewer was not available through the exposed browser surface in the preceding design session.
Keyboard operation, screen readers, touch interaction, responsive reflow, dark mode, and print output were not tested.
The mobile boards are independent compositions, not proof of runtime responsiveness.
No human comprehension, retention, speed, or preference trial ran.
Application source code was not changed. Earlier Penpot pages and unrelated repository files were preserved.

## Screenshot QA corrections

The follow-up review inspected the exported compositions and the native Penpot shapes and navigation records.

| ID | Finding | Correction and disposition |
|---|---|---|
| V01 | The first ordering arrowhead was hidden beneath the commit box; B-to-A ordering was absent. | Fixed on 01–02: endpoints terminate at visible boundaries, and both post-commit reads have explicit connectors. |
| V02 | Dashed actor guides ran behind large observed values. | Fixed on 01–02: removed guides that interfered with the result typography. |
| V03 | Opaque edge-label backgrounds cut gaps in the walkthrough paths. | Fixed on 14–15: removed masks and moved the lower label clear of its connector. |
| V04 | Mobile transaction-end navigation opened a desktop-sized board. | Fixed: 10 now opens mobile board 18, which returns to 10. |
| V05 | Index titles did not clearly look actionable; footer links had text-sized targets. | Fixed: action-coloured index titles and 44-pixel-high footer hit regions. |
| V06 | Board 17 had two buttons to the same prediction; board 16 repeated the index action. | Fixed: retained one prediction action and one index action, respectively. |
| V07 | Quiz selection copy exposed prototype implementation details. | Fixed on 06–07: copy now explains how to change the selection before submission. |

Refreshed exports were visually checked for the main mechanism, walkthrough, and new mobile boundary screen.
All 19 boards pass text containment and text-overlap checks. All 119 navigation records resolve; every board is reachable from the index.
Reported cropped headers in some quiz captures were rejected after isolated raster and source inspection showed complete screens.
The masthead has no navigation interaction, so it does not duplicate the mechanism button.
The earlier limitations on browser clicks, accessibility, and human evaluation still apply.

## Compact-layout revision after user feedback

The user rejected giant result numbers and excessive whitespace. All 19 boards were recomposed in place.
The board identities and prototype destinations were preserved; controls were rewired after content replacement.

- Main values changed from 100-pixel standalone numerals to 21–22-pixel event labels.
- Explanatory text now generally uses 17–20 pixels on desktop and 16–19 pixels on mobile.
- The main screen changed from 1440 × 1080 to 1280 × 800.
- The encoding overview changed from 1440 × 1080 to 1280 × 617.
- Mobile screens changed from 390 × 1040 to 390 × 824.
- Paired comparisons no longer repeat their result as a separate large-number block.
- Quiz values and reasons now share a single line.
- Footer spacing was checked after the compaction; action controls retain 44-pixel height.
- Board 16 explicitly shows the old excessive emphasis as a negative example.

Final checks found no text overlaps, out-of-board text, unresolved destinations, unreachable boards, or unwired controls.
The prototype contains 124 interaction records. All 19 exports were refreshed and passed PNG integrity checks.
The revised mechanism, paired comparison, mobile, quiz feedback, and encoding screens were inspected as rendered images.
This revision has not undergone a human comprehension trial or browser interaction test.
