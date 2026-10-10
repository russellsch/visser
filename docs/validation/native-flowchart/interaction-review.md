# Flowchart interaction and mobile review

Follow-up to the implementation candidate on 2026-10-10. Scope: compare flowchart behavior with the existing diagram inspector, depth, viewer and reference contracts; repair reproduced inconsistencies; include narrow portrait and landscape touch emulation. The user subsequently required first-tap mobile block details. No commit or push was performed.

## Behavior and corrections

| ID | Finding / trigger | Correction and evidence |
| --- | --- | --- |
| IR01 | Tab after expanding an inner group left the diagram before reaching revealed steps. | Flowchart controls precede nodes in DOM order while remaining above edge hit paths. Browser regression reaches the revealed steps. Existing families retain their ordering. |
| IR02 | A parent authored after a child painted over the child's heading, whitespace and boundary. | Stable parent-before-child group painting with bounded ancestry traversal. Real-coordinate browser regression covers all three child targets. |
| IR03 | Closing details after folding the selected group focused its retained but inaccessible boundary. | Close recognizes aria-hidden ancestors and resolves the group's own visible summary/control. Pointer and keyboard regression verifies Expand receives focus. |
| IR04 | Locate and viewer target lookup could select the aria-hidden retained boundary. | Both shared lookup paths exclude aria-hidden ancestors. Locate regression verifies the visible summary is focused. |
| IR05 | Folded flowchart summaries lacked the shared depth indicator. | Summaries render the same depth meter. Browser regression checks the structural two-bar cue before and after folding. |
| IR06 | Moving nodes after controls initially placed terminal proxy callout keys below nodes. | Callouts paint after nodes; panels, keys and stems are checked against co-visible title/control regions, including Expand while folded. A terminal fallback oracle checks paired keys, stacking and control separation; a deliberate overlap mutation fails. Existing callout tests also pass. |
| IR07 | The existing mobile entry behavior consumed the first block tap without showing details. | Per the user's explicit request, the viewer now opens and lets an interactive target's same click reach the shared detail handler. First tap immediately opens the sheet for flowchart blocks and existing architecture blocks. Background taps enter only the viewer, and drags do not inspect. |

IR01–IR04 were reproduced before their fixes. The later callout correction was pressure-tested against control visibility: a folded group hides its title but retains Expand, so their predicates differ. New and existing tests use the shared inspector rather than a flowchart-specific detail surface.

## Independent review

A Sol review subagent inspected the frozen inputs listed in `reports/flowchart-interactions/review-input.json`, then rechecked the corrections. It found IR02–IR06; the author found IR01 and implemented the user's IR07 change. The final targeted static recheck reported no actionable findings. The reviewer did not execute tests; the parent executed all checks below. The final candidate manifest records production and test hashes separately from the original input snapshot.

## Verification

- Focused flowchart browser matrix: **29 passed**, 36 applicability skips. Desktop 1440×1000, touch-emulated 320×720 and 390×844, landscape 720×390, and no JavaScript.
- Mobile paths cover immediate first-tap block detail, background entry, genuine CDP touch dragging left/right, group folding, shared bottom sheet, hidden-member links, reference-copy fallback, layered dismissal and return to the article without duplicate canonical IDs.
- Landscape tests use the existing Zoom out action to reach off-screen controls. The viewer deliberately opens at readable SVG units rather than fitting every node into a small screen.
- Focused unit suites: **84 passed in 14 files**, including flowchart geometry/oracles, existing diagram callouts and exact math fields.
- Shared browser matrix: **150 passed**, 35 applicability skips. Includes interactions, depth, figure viewer, relocated single-file flowchart and exact math-field suites.
- Supported runtime: Node 24.21.0. TypeScript, build, whitespace and contract checks passed (zero unproven or invalid retained math obligations). Math evidence is refreshed only from exact passing cases for this candidate.

Reports: `reports/flowchart-interactions/browser.json`, `regressions.json`, `regressions-playwright.xml`, and `reports/flowchart/math-unit.xml`. The separate delta manifest is `reports/flowchart-interactions/candidate.json`.

This is browser touch emulation, not a physical-device or screen-reader acceptance claim. The plan's V01–V03 human acceptance remains pending. The earlier full-suite run is historical implementation evidence; it was not rerun or relabeled as a full-suite pass for this interaction delta.

## One-step mobile dismissal follow-up

The user found Close followed by Back cumbersome. Direct touch entry on a part now records a detail visit: Close or Escape exits the sheet and viewer together, restoring the article. Internal cleanup uses `closeInspector(false)` to avoid recursion. Explicit Explore/background entry retains its viewer after detail dismissal; reference-copy overlays still dismiss one layer at a time.

The updated native matrix passed 29 checks (36 applicability skips) at desktop, both portrait sizes, landscape and no-JS. Shared browser regressions passed 150 checks (35 applicability skips); focused unit tests passed 91 checks in 15 files, including the viewer lifecycle. TypeScript and build passed. The exact `flowchart-demo-v2.html` was opened with HTTP(S) blocked and verified for immediate first-tap detail and one-step Close. This supersedes the prior demo; physical-device acceptance remains pending.

A separate Terra static review found no defect in the dismissal path or Escape layering. Its initial coverage concern was resolved by pointing to the retained Close/Escape/reopen regression at lines 243 onward. Contract checks passed with zero unproven or invalid retained math obligations. Final hashes and reports are recorded in `reports/flowchart-interactions/detail-exit-candidate.json`.

## Compact group folding follow-up

User-approved behavior: a folded group replaces its expanded boundary with one compact colored container. It retains the group name, step count, detail depth and selection cue. A 24px Expand icon sits inside it as a separate control. Original flow identities and proxy docking remain intact. Expanding restores the original layout; print restores all hidden boundaries and content. Other diagram families retain their existing folding presentation.

Implementation hides the expanded flowchart boundary, uses separate title/count rows, reserves footer space for Expand and selection, and validates callout collisions against the control's folded-state location. The expanded layout is retained internally; folding does not rearrange the rest of the diagram.

Validation: 30 native browser checks passed (39 applicability skips), 150 shared browser checks passed (35 applicability skips), 91 unit checks passed in 15 files, and TypeScript/build/contracts passed. The actual `compact-group.png` was visually inspected: one group container, no outer boundary, connected incoming/outgoing arrows. Offline mobile smoke verified the exact `flowchart-demo-v3.html`, including immediate details, one-step Close, folding and expansion. Physical-device acceptance remains pending.

The reviewer initially suspected overlap for a short group title, then withdrew it after accounting for the existing 145px minimum from the selection cue. An additional Chromium export measurement for title G confirmed a 60.33px gap between the step count and Expand. This was pressure-tested rather than accepted as a defect.

Final source and artifact hashes are recorded in `reports/flowchart-interactions/compact-candidate.json`; earlier manifests are historical.

Independent Sol review of the compact-group delta finished with no actionable findings after the short-label hypothesis was withdrawn. It statically checked hit order, docking, callout exclusion, nested-fold state and print restoration; dynamic checks and visual inspection were performed by the parent.
