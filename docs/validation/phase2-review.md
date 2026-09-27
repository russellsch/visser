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
| 2 | Pipelines longer than the window (the 6-stage transform) still scrolled inside their viewport. | Fixed: a deterministic rule uses a top-to-bottom layout when the left-to-right layout is wider than 1100 px and the other is narrower (`fix-image-pipeline-1440.png`) |
| 3 | On narrow screens, compare cards showed a generated "Details" link before each cell body. | Fixed: the option label in each card is the single link to the cell (`fix-queue-designs-390.png`) |
| 4 | Trace event cards on narrow screens were not grouped by actor. | Fixed: one group per actor, each card with its order layer and `after` links (`fix-order-intake-trace-390.png`) |
| 6 | The trace branch list has no visible heading; only its `aria-label` names it. | Open, minor |
| 5 | Phase 1 defects 3–5 (metadata before title, citation line spacing, map-first mobile view). | Fixed in Phase 2 |

## Fixed during integration

- A deselected quote could reach a later packet (runtime kept the last selection). A regression test now covers it.
- The per-kind test copied only `index.md`, so documents with declared assets could not resolve exact.
- The contract gate passed while browser tests failed; it now requires zero failures.
