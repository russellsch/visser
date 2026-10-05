# Clearer figures implementation validation

Date: 2026-10-04. Baseline: `5729a84001f6b2877b93ebc388538cbd0464ee83`.
Scope: [approved implementation plan](../plans/clearer-figures.md), CF01–CF25, using work-cycle v4.2. Changes are local and uncommitted. Pre-existing design records and SQLite examples were preserved.

## Implemented behavior

- Native graph nodes and edges support restrained `emphasis="teal|violet|amber"`. Semantic colour takes precedence, with weight as the emphasis fallback. Selection and keyboard focus use separate external geometry, preserving causal dashes, arrowheads, terminal rings, and group boundaries.
- Existing architecture groups retain nesting, collapse, proxy identity, and optional useful explanations. Emphasis alone does not create inspection depth. Ordinary selection leaves surrounding labels readable.
- Figures stay in article flow. Routine Map/List and walkthrough bars are removed; authored steps and one document-level Text view remain. Useful desktop figure details open locally and move the canonical detail rather than duplicating it.
- Narrow touch activation opens a full-viewport viewer before selecting a part. The viewer supports pan, pinch, keyboard zoom alternatives, target lists, a detail sheet, references, and return to the article. Selection preserves the view transform. Remembered scale adapts to orientation changes. Mouse input on a narrow hybrid device still opens local details.
- The viewer shows structured decision-changing qualifications and expands authored detail bodies. Parsed Mermaid support starts only after rendering and target binding. Unsupported content keeps its existing accessible presentation.
- Authoring guidance chooses a representation from the reader's question. It uses source-supported groups and permits neutral diagrams. Main claims and qualifications remain outside optional exploration. No visual-feature quota or new subjective lint score was added.

## Acceptance evidence

| Requirements | Evidence |
| --- | --- |
| CF01–02, CF10, CF19–20 | Runtime views, browser coverage/journeys/export/no-JavaScript checks; authored steps retained; document Text view and Markdown projection. |
| CF03–08, CF18 | `compiler.emphasis`, `figure-interactions`, existing family/inspection/projection/reference suites; all twelve native emphasis tags, invalid values, extension-attribute collision, semantic style preservation, nested and collapsed groups. |
| CF09, CF14–18 | Browser depth/domain/journeys and viewer tests; local versus modal hosting, canonical identity, nested history, copied edge reference, denied-clipboard fallback, Escape priority and focus return. |
| CF11–13, CF16–17 | Full Chromium width matrix; real CDP touch sequences for pan/pinch/cancel; unit lifecycle, tall graph, remembered scale, list-target resolution; browser mouse/touch distinction and viewport-change return tests. Physical-device acceptance remains open. |
| CF21–25 | Skill and format-guide tests; fixed [authoring packets, source, exports, and renders](clearer-figures-authoring/README.md); independent main-path task review. No comparative prompt-generation experiment or representative-reader study was performed. |

Penpot study 09 was inspected against the running implementation. The first viewer rendering shrank a wide graph too far; the viewer now starts at readable native units with pan and zoom. Screenshots cover desktop, 320 px, dark mode, forced colours, the viewer, and its qualification sheet. These establish visual fidelity and legibility, not comprehension improvement.

## Independent review and corrections

Two bounded independent implementation reviewers examined core/authoring and runtime behavior. The core review began from tracked patch SHA-256 `98fc49b208c2c4cc2b782313b262a2b40e2be99e5375a83b8eeae01aa372b4f1`; the runtime review began from patch `4de029f71bd12618d939515709f9bee2e2783a2327776c3bc92eb5f00bd90ac6` plus new viewer file `aa4ccb2c70cbfbcd8c2b0100cb15936fc1b860669238c5c3045e718d98abfc52`. Targeted rechecks covered subsequent corrections. Neither reviewer reported an unresolved material implementation finding.

| Finding | Resolution and pressure test |
| --- | --- |
| An extension-owned `emphasis` attribute could acquire native behavior and duplicate projection. | Gate native interpretation by the twelve supported native tags; regression covers an extension using the same attribute name. |
| Density advice could encourage invented groups. | Only collapse a source-supported existing boundary; otherwise split by reader question. Thresholds are unchanged. |
| Authoring evaluation lacked compiled evidence. | Added source, Markdown, theme/narrow renders, and independent answers to fixed reader tasks. Human comprehension remains unevaluated. |
| A proxy callout seemed to lack its own accessible name. | Confirmed it is the existing aria-hidden pointer alias; the route owns keyboard access and its name. Tests cover both the route and alias, and the plan now states this contract. |
| Narrow hybrid mouse input was treated as touch. | Use actual pointer type; browser regression checks local mouse inspection versus touch viewer entry. |
| Returning after viewport changes used stale absolute scroll position. | Restore from the article figure's anchor delta; regression resizes while viewing. |
| Clipboard fallback dismissal could lose focus. | Restore the active reference Copy button; browser denial/Escape test checks it. |
| Selecting a target from the viewer list could pan using HTML row bounds. | Resolve its drawn SVG instance before visibility calculations; unit regression distinguishes the two bounds. |
| A width-only zoom limit could exclude tall graphs. | Fit both dimensions; tall-graph regression verifies full-height reachability. |
| Reopening after orientation change retained an obsolete aspect ratio. | Remember center and scale per viewport pixel, then rebuild the view box for current dimensions; portrait/landscape regression verifies it. |
| Selecting from the mobile text list left the canvas scrolled away and the target offscreen. | Anchor the sheet to the viewport, align the canvas under the tools, and pan to the live SVG target on both axes without changing zoom. Keep the list open for focus restoration; closing preserves the post-reveal transform. Browser regression checks the visible target and transform. |

Integration checks corrected canonical detail history for standalone narrow modals and keyboard focus for bare scrollable viewports. Browser tests now distinguish mouse and touch activation. The final saved-view assertion compares numeric coordinates within floating-point tolerance, while article restoration still requires the exact original viewBox string.

## Verification results

The [source manifest](clearer-figures-source-manifest.sha256) records 48 changed or new implementation, test, and example files. Its SHA-256 is `d6d265c043b1e53dc28839a0edd1cac4394e2a953f7bef258c7e951fb8fa97f3`. Pre-existing untracked design records are excluded. Test reports live under `reports/`.

| Check | Final result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test` | Passed: 89 files, 1,460 tests. |
| `VISSER_BROWSER_TIER=full npm run test:browser` | Passed: 617 tests; 409 intentional project/width/no-JavaScript skips; zero failures. Includes the default tier and exported-site journeys. |
| `npm run build` | Passed; toolkit `2d6a13cb786b5d8c548ee75c12b8118de2911648780e0342967b7596eee56e6c`, matching the tested assets and saved renders. |
| `npm run test:contracts` | Passed: all 95 TypeScript/Python hash vectors agree; 42 traceability entries checked against 2,486 reported test cases. Existing traceability remains 39 covered and 3 partial. |
| `npm run test:offline` | Passed inside `unshare -rn`: isolation, build, exports, serving, and all browser assets. |
| `npm run test:budgets` | Passed all gates. Gzip sizes: reader JavaScript 15,664 / 102,400 bytes; CSS 16,490 / 51,200 bytes. Core skill: 2,484 / <2,500 words. Optional browser timing experiment was not run. |
| `git diff --check` | Passed. |
| Work-cycle `doccheck.py` on 18 changed/new Markdown files | Zero errors; 199 advisory prose/placeholder warnings across the complete checked documents. Requirement tables require manual review; the checker parsed zero standalone requirement records. |

Earlier failing runs are superseded by these results. They exposed implementation issues listed above and outdated test expectations. The final visibility regression uses the figure's stable ID because moving it into the dialog changes document order. Numerical saved-view comparisons allow floating-point roundoff; original article geometry remains an exact-string check.

## Remaining acceptance limits and recovery

- The browser matrix uses Chromium. Physical Safari/iOS testing remains open. Manual acceptance must cover browser-chrome resizing, safe areas, sheet scrolling, and assistive technology before mobile support is fully validated.
- Independent task reconstruction passed on constructed examples. A controlled old/new prompt comparison and representative-reader comprehension study remain unevaluated.
- Package metadata targets Node 24; this host runs Node 25.9.0. Results describe this host, not an additional Node 24 run.
- Rollback uses a retained snapshot with matching toolkit assets. For a viewer-specific regression, `?vs-legacy-mobile=1` or the `data-vs-legacy-mobile` document attribute selects the old narrow presentation. Newly emphasized source must not be rebuilt using an older validator that does not support it.

No commit, push, deployment, or source migration was performed.
