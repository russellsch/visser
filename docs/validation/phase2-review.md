# Phase 2 inspection report

**Date:** 27 September 2026. **Browser:** Playwright Chromium build 1243, headless. Browser scope is Chromium only, by user decision.

This report is evidence that an agent inspected the screenshots. It is not visual approval: the first baseline approval is a human gate (`human-gates.md`).

## Automated results (Node 24.21.0)

| Check | Result |
|---|---|
| `npm run build` and `npm run typecheck` | Pass |
| `npm test` (Vitest) | 434 of 434 pass |
| Per-commit browser tier (chromium-1440, chromium-320, chromium-nojs) | 94 pass, 39 skipped by project design, 0 fail |
| Full Chromium tier (adds 1024, 390, reduced motion) | 167 pass, 149 skipped by project design, 0 fail |
| `npm run test:contracts` | 95 of 95 hash vectors agree; 30 traceability entries proven; zero failed tests in any report |

## Examples

Every example passes `explain check` with no diagnostics: `bounded-queue` (architecture, trace, annotated), `connection-lifecycle` (state), `image-pipeline` (transform), `cache-stampede` (cause), `queue-designs` (compare), `schema-migration` (plan), `order-intake` (cross-domain), and `deadline-retry` (prose-first, with the only standalone figure).

## Screenshots inspected

`phase2/<example>-1440.png` and `phase2/<example>-390.png` for `connection-lifecycle`, `image-pipeline`, `cache-stampede`, `queue-designs`, `schema-migration`, and `deadline-retry`. They show the first figure of each example (the timeline figure for `deadline-retry`), at 1440 after the breakout fix.

## Observed defects

| # | Defect | Status |
|---|---|---|
| 1 | At 1440, wide figures were clipped at the text-column edge (the cause graph and the transform pipeline), with no scroll cue. | Fixed: wide figures break out of the column, centred, up to the window width |
| 2 | Pipelines longer than the window (the 6-stage transform) still scroll inside their viewport. This is permitted by §10.5; a layout direction better suited to long chains is layout tuning. | Open |
| 3 | On narrow screens, compare cards show a generated "Details" link before each cell body, which adds clutter. | Open |
| 4 | Trace event cards on narrow screens are not regrouped by actor (§9.4 asks for cards grouped by actor or order layer; they are labelled by order layer). | Open |
| 5 | Phase 1 defects 3–5 (metadata before title, citation line spacing, map-first mobile view). | Fixed in Phase 2 |

## Fixed during integration

- A deselected quote could reach a later packet (runtime kept the last selection). A regression test now covers it.
- The per-kind test copied only `index.md`, so documents with declared assets could not resolve exact.
- The contract gate passed while browser tests failed; it now requires zero failures.
