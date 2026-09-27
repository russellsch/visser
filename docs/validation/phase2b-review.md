# Phase 2b inspection report (Mermaid)

**Date:** 27 September 2026. **Browser:** Playwright Chromium build 1243, headless (Chromium only, by user decision). **Mermaid:** 12.0.0.

This report is evidence that an agent inspected the screenshots. It is not visual approval: the first baseline approval is a human gate.

## Automated results (Node 24.21.0, real exit codes)

| Check | Result |
|---|---|
| `npm run build` and `npm run typecheck` | exit 0 |
| `npm test` (Vitest) | exit 0; 553 of 553 |
| Full Chromium tier | exit 0; 234 pass, 212 skipped by project design, 0 fail |
| `node scripts/check-contracts.mjs` | exit 0; 95 hash vectors agree; 30 traceability entries; zero failed tests in any report |
| `npm audit` | 0 vulnerabilities (with the `lodash-es` override) |

## Screenshots inspected

`phase2b/mermaid-{flowchart,state,sequence,er}-{1440,390}.png`.

| Observation | Status |
|---|---|
| Flowchart at 1440: subgraph, labelled edges, and the explicit edge render; the wide drawing breaks out of the column; mapped lists and "Show source" follow. | As intended |
| Sequence at 1440: loop, alt/else, note, and autonumber badges render; badges are readable at 14 px. | As intended |
| Sequence: a participant lifeline crossed some message labels ("access token"). | Fixed: a halo behind message text (verified in a zoomed screenshot) |
| State at 390: the list is first, with "Show map" and "Show source". | As intended |
| ER at 390: labels keep their size and the drawing scrolls inside its viewport (figure-level type, §9.12). | As intended |

## Fixed during integration

- Drawn edges carried `aria-label` without a role (axe `aria-prohibited-attr`).
- The scrolling render viewport was not keyboard-focusable at 320 px (axe `scrollable-region-focusable`).
- Autonumber badges rendered at 12 px, below the 14 px oracle.

## Code review (revision 1.13)

Two code reviews found 11 rule bypasses (external links and off-origin requests), a state-transition misalignment with notes, and runtime and test issues. All are fixed; the bypass scripts in `spikes/mermaid/review-c/` now give 0 harmful accepted cases out of 31. Exit check after the fixes: build, typecheck, 614 Vitest tests, 250 browser tests in the full Chromium tier, the contract gate, and `npm audit` all exit 0.

Remaining limitation: Mermaid can place class-diagram cardinality labels under a node box; the example avoids them, and §9.12 advises authors.
