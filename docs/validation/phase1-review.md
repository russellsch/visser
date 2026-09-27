# Phase 1 inspection report

**Date:** 27 September 2026. **Build:** toolkit `075f7c05…` (development build of the bounded-queue example). **Browser:** Playwright Chromium build 1243, headless.

This report is evidence that an agent inspected the screenshots. It is not visual approval: the first baseline approval is a human gate (`human-gates.md`).

## Automated results

| Check | Result |
|---|---|
| `npm run build` (Node 24.21.0) | Pass; `dist/release` with 12 files |
| `npm run typecheck` | Pass |
| `npm test` (Vitest) | 331 of 331 pass |
| `npm run test:browser` (per-commit tier: chromium-1440, chromium-320, chromium-nojs) | 35 pass, 4 skipped with stated reasons, 0 fail |
| `npm run test:contracts` | 95 of 95 hash vectors agree; 20 traceability entries proven |

Firefox, WebKit, and the other full-matrix projects did not run: their browsers are not installed. They are not passed.

## Screenshots inspected

| File | What it shows |
|---|---|
| `phase1/desktop-1440-top.png` | Top of the page at 1440×1000 |
| `phase1/desktop-1440-graph.png` | Deep link `#x-handoff` at 1440 |
| `phase1/desktop-1440-inspector.png` | Edge `enqueue` open in the side inspector |
| `phase1/mobile-390-top.png` | Top of the page at 390×844 |
| `phase1/mobile-390-graph.png` | Deep link `#x-handoff` at 390 |
| `phase1/mobile-390-inspector.png` | Edge `enqueue` open in the full-width dialog |

## Observed defects

| # | Defect | Status |
|---|---|---|
| 1 | The sticky toolbar covered anchored content, such as a deep-linked figure title. | Fixed: `scroll-padding-top` |
| 2 | At 390 px, each relationship-list number aligned with the last line of its wrapped link. | Fixed: `vertical-align: top` |
| 3 | The five-row snapshot metadata appears before the title, so a reader sees identifiers before the argument (§10.1). | Open, Phase 2 |
| 4 | At 390 px, the citation marker `[1]` takes the 44 px target height and breaks the line spacing of its paragraph. | Open, Phase 2 |
| 5 | At 390 px, the architecture map is wider than the screen and scrolls inside its viewport (permitted by §10.5). §9.3 asks for the relationship list as the default mobile view, with the map as an alternate. | Open, Phase 2 (narrow-screen alternatives) |
