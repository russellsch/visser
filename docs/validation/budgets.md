# Performance budgets (§2.3)

Measured on 27 September 2026 with `VISSER_BUDGET_TIMING=1 npm run test:budgets`. The raw numbers are in `reports/budgets.json`.

Size, count, and limit rows are gates: `npm run test:budgets` exits 1 if one fails. Timing rows are reported only. They are not gates, because shared machine timing is too noisy.

## Hardware and software

| Item | Value |
|---|---|
| CPU | AMD Ryzen 9 9950X 16-Core Processor, 32 logical CPUs |
| Memory | 188 GiB |
| OS | Pop!_OS 24.04 LTS, Linux 6.17.9-76061709-generic |
| Node | v24.21.0 |
| Chromium | 153.0.8010.12 (Playwright 1.63.0) |

This is a fast desktop machine. The spec asks for a "contemporary laptop" for the build time. On a laptop, expect a longer build.

## Reference fixture

`tests/fixtures/budget/generate.mjs` writes the fixture. `scripts/check-budgets.mjs` then runs `visser init`, the generator, and `visser capture file` for each of the 20 excerpts.

| Property | Value |
|---|---|
| Reading words | 5,051. This is the Markdown projection without ID markers, counted before the excerpts are captured. |
| Visuals | 8, one of each family |
| Nodes and edges for each visual | architecture 40/80, trace 4 actors/16 events, state 8/12, transform 7/6, cause 10/12, compare 3 options/12 cells, plan 10/13, Mermaid flowchart 16/17 |
| Excerpts | 20 files, 102,710 bytes in total, kind `example` |
| Source | 145,292 bytes, 304 targets. `check` passes. |
| Photographs | none |

## Gates

| Gate | Measured | Limit | Result |
|---|---|---|---|
| Shared browser JS, `reader.js` gzip -9 | 6,793 bytes (19,778 raw) | 100 KiB | pass |
| Shared CSS, `reader.css` gzip -9 | 3,994 bytes (13,700 raw) | 50 KiB | pass |
| Per-document JS | 0 inline scripts, 0 event-handler attributes, 0 `javascript:` URLs, 0 other JS files; the only `<script src>` is the shared `reader.js` | 0 | pass |
| Release browser assets | `browser/reader.js`, `browser/reader.css`, and `browser/mermaid.js` (the §2.3 exception) | exactly these | pass |
| Pack written by a build | `reader.js`, `reader.css`, `mermaid.js` | browser assets only | pass |
| Core skill, release `SKILL.md` | 1,493 words | under 2,500 | pass |
| 201-node graph | `check` and `build` exit 2 with `E_LAYOUT_LIMIT` | exit 2 | pass |
| 401-edge graph | `check` and `build` exit 2 with `E_LAYOUT_LIMIT` | exit 2 | pass |

`bin/`, `workers/`, `schemas/`, `skills/`, and `LICENSES.txt` are CLI and authoring files. `build`, `serve`, and `export` never serve them, so they are not browser assets.

Other tests cover the limits that this script does not gate:

- The 26-node warning (`W_VISUAL_DENSITY`): `tests/unit/validate.fixtures.test.ts`.
- `E_LIMIT` and `E_LAYOUT_TIMEOUT`: `tests/unit/syntax.characterization.test.ts`, `compiler.layout.test.ts`, `compiler.render.test.ts`, `mermaid.model.test.ts`, and `tests/integration/capture.hostile.test.ts`.

## Reported, not gated

| Measurement | Median of 5 | Budget | Note |
|---|---|---|---|
| `mermaid.js` size | 5,575,485 bytes, 1,608,869 gzip | reported only | |
| Built page | 675,821 bytes, 55,027 gzip | none | `document.md` is 145,390 bytes |
| Offline build of the fixture | 1,295 ms (runs 1,286 to 1,303) | under 3 s | Wall clock of `visser build` from `dist/release`, including Node start. |
| Initial usable page | 635.5 ms (runs 625.4 to 670.4), gzip | under 2 s (target) | Profile: 390x844 mobile, 150 ms latency, 1.6 Mbit/s down, 750 kbit/s up, CPU 4x, cache off |
| First Mermaid figure drawn | 9,433.6 ms (runs 9,403.7 to 9,458.7), gzip | none | Same runs as the initial usable page |
| Inspector after a click | 14.1 ms (5 targets, 5 clicks each) | under 100 ms | 1440x1000, no throttling |

"Usable" means that the main prose has text, the first figure has an SVG, and `reader.js` has run. The time is `performance.now()` in the page, from the start of navigation.

## Findings

- **The initial usable page meets the 2-second target** since `serve` sends text routes with gzip: 635.5 ms. Before gzip it was 3,599 ms, because the 660 KiB page took about 3.3 s at 1.6 Mbit/s; with gzip the page is 55 KiB.
- **The first Mermaid figure takes about 9.4 s** on this profile (31,267 ms before gzip). `mermaid.js` is still 1.6 MB after gzip, which takes about 8 s at 1.6 Mbit/s. The asset loads only on pages that have a Mermaid figure. The text and the build-time element lists are readable before it loads.
- **The build is about 1.2 s** on this machine, well under 3 s. A laptop result is still needed.
- **Finding during this work:** before the Phase 5 change to `check`, `check` exited 0 on a 201-node graph, but `build` failed with `E_LAYOUT_LIMIT`. The gate for `check` in this script now catches that difference.

## Commands

```sh
npm run test:budgets                           # gates only, about 10 s
VISSER_BUDGET_TIMING=1 npm run test:budgets   # gates plus timing, about 3 min of Chromium
```

The timing run uses Playwright with `VISSER_BROWSER_BUDGETS=1`. It writes its own reports (`reports/budgets-playwright.json`), so it does not replace the tier reports that the contract gate reads.
