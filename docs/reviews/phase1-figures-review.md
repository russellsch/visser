# Review: Phase 1 figures (colour, legend, box content, Mermaid theme)

Date: 27 September 2026. Branch `explain-plan`, uncommitted working tree.
Specification: `docs/IMPROVEMENTS.md` §2, §3.1 to §3.6, F8 (trace items), §10
(transform decision). Reviewer: independent, read-only on source.

## Scope

- `packages/core/src/compiler/encoding.ts` (new), `svg.ts`, `compile.ts`,
  `layout.ts`; `packages/runtime/src/reader.css`, `mermaid.ts`.
- `tests/unit/compiler.{families,trace-figure,encoding}.test.ts`,
  `tests/unit/runtime.mermaid.test.ts`.
- All 22 screenshots in `docs/validation/improvements-1/phase1/`, compared with
  `order-intake-architecture.png`, `order-intake-trace.png`, and
  `mermaid-er-wide.png`.

Snapshot: the files were copied at 23:40. The phase 2 agent then changed
`compile.ts` and `svg.ts` (term links, §13). The phase 1 code paths did not
change. `encoding.ts`, `layout.ts`, `reader.css`, and `mermaid.ts` were the same
at the end of the review. Line numbers for `compile.ts` and `svg.ts` are the
23:40 numbers, with the function name as the stable anchor. The phase 2 edits
moved them down by about 23 (svg.ts) and 78 (compile.ts).

## Checks run

1. Read the spec sections, `docs/ARCHITECTURE.md` §7.5, §9.3 to §9.10, and the
   full diff of each file.
2. `npx vitest run` on the four assigned files, twice: 30 of 30 pass. (The
   vitest config writes `reports/vitest-junit.xml`.)
3. Contrast: my own WCAG 2 script, for all 6 hues × light and dark × (stroke on
   `--vs-bg`, stroke on `--vs-panel`, `--vs-fg` on tint), plus the amber label.
4. Greyscale: relative luminance of the pairs that only hue separates.
5. In-memory probes (no repo writes): `traceSvg` with a main-column event
   between two events of one branch; label wrap at the old and new widths for
   every example label; SVG sizes from the HEAD compiler (`git archive` into a
   scratch folder) against the working tree; each example compiled twice under
   `TZ=Pacific/Auckland LANG=tr_TR.UTF-8` and `TZ=UTC LANG=C` (all hashes equal);
   dump of the node, edge, and event `aria-label` values.

Limitations: no browser run, so the forced-colours and greyscale results come
from CSS specificity and computed luminance, not from an emulated render. No
Penpot access, so §3.1 bullet 3, §3.3 last line, and §8 items 1 to 6 are not
checked. No screen reader test. I did not rebuild the screenshots. The
in-memory trace size (824 × 377) is the same as in `order-intake-one_order.png`.

## 1. Spec conformance

| Item | Status | Where | Note |
|---|---|---|---|
| §2.1 accent marks action, one hue variable per figure | partly | `reader.css:1-6`, `encoding.ts:119-134` | Hue shows only with 2 or more values. Trace colours two variables (F-03). Two values have no non-colour cue (F-01, F-02). |
| §3.1 six tokens, light and dark | done | `reader.css:32-37`, `61-66` | Dark tints are 16 % mixes over `--vs-bg`; I confirmed the values. |
| §3.1 contrast (stroke 3, text 4.5) | done | `reader.css:22-31`, `55-59` | All 24 ratios and the amber label (5.02) match my script to 2 decimals. |
| §3.1 text in a tinted box is `--vs-fg` | done | `reader.css` node-label rule (about line 444) | |
| §3.1 rose is not used with failure | done | `encoding.ts` | No family uses rose. |
| §3.1 forced-colours block | partly | `reader.css:71-82`, `487-531` | The comment "no value is lost" is false for plan (F-01). The `vs-nofill` fill escapes the block (F-05). |
| §3.1 Penpot library and tokens | not checked | — | No Penpot access. |
| §3.2 architecture roles | done | `encoding.ts:62-69`, `160-196` | Pill r12, rounded r6, drum line, dashed, chamfer, dotted with no fill. |
| §3.2 architecture edge kind | done | `encoding.ts:72-75`; `svg.ts` `loopMark` | call solid, data dashed, control dotted, feedback ring. No key (F-08). |
| §3.2 trace failure and wait | done | `encoding.ts:104-107`; `svg.ts` `traceSvg` event block (406-414) | Failure: danger, 2 px. Wait: amber, dashed. Other kinds are ink. |
| §3.2 trace branch bands | done | `encoding.ts:113`; `svg.ts` `traceSvg` (309-316) | Slate and amber alternate. See F-03 and F-04. |
| §3.2 state | done | `compile.ts` `encoding` case `state` (567-583) | No hue. Initial dot, terminal inner ring, basis pattern. The basis has no word (F-08). |
| §3.2 cause | done | `encoding.ts:79-86`; `compile.ts` `encoding` case `cause` (538-547) | On factors and links. The word is on the arrow label and in the list. |
| §3.2 plan | done (as written) | `encoding.ts:89-101` | Matches the row. The row gives `ready` no cue except hue (F-01). |
| §3.2 transform, and the §10 decision | done | `compile.ts` `encoding` case `transform` (559-566), `boxLines` (505-512) | Only a lossy conversion takes the hue. "loss:" stays in the label. Location stays as text in the box. |
| §3.2 compare, annotated | done (no change needed) | `reader.css:182` | "Not provided" is muted italic. Markers use the accent. |
| §3.3 legend | done | `encoding.ts:214-221`; `compile.ts` `figureShell` (322-337) | Legend follows the interpretation paragraph. Static `ul`, each chip has a swatch and a word. Not printed in list view (F-06). |
| §3.4 box shows the label only | done | `compile.ts` `graph` (434-442), `boxLines`; trace `meta` (812-815) | "→ Receiver" and the representation stay. A time-scale trace also keeps "at T" (F-13). |
| §3.4 width 150, two lines | done | `layout.ts:91-103` | Some labels now split into a line and a one-word orphan (F-10). |
| §3.4 plan 640 → about 420 px | partly | — | Measured `schema-migration` SVG height: 668 px at HEAD, 614 px now. The 2-line edge labels set the height, not the boxes. |
| §3.5 Mermaid base theme from the tokens | done | `mermaid.ts:17-82`, `264` | `primaryColor`, `primaryBorderColor`, `lineColor`, `fontFamily`, 14 px. The dark screenshot follows the tokens. `pageTokens()` has no test (F-14). |
| §3.6 title as heading, "Figure" in `aria-label` | done | `compile.ts` `figureShell` (327) | `aria-label="Figure: <title>"`, and a test covers it. |
| §3.6 interpretation beside the legend when both are short | missing | — | No markup or CSS (F-12). |
| §3.6 no hand-drawn stroke | done | — | |
| F8 trace headings overlap | done | `svg.ts` `traceSvg` (250-273, 396-406) | Headroom per row, headings wrap, fork label removed. `order-intake-one_order.png` is clean. |
| F8 per-box layer number | done | `svg.ts` `traceSvg` (301-304) | The number is on the axis only. |
| F8 3-line label | partly | `layout.ts:91-103`; `svg.ts:140` | Fixed for graph nodes. "Marks the order payment-failed" is now 2 lines. Trace boxes keep a fixed 150 px, so a long event label still takes 3 lines (F-15). |
| F8 compare "details" link | out of scope | — | §9 puts it in phase 2 (4.6). The link still shows in `order-intake-retry_choice.png`. |

## 2. Colour never alone

Each hue, with its paired cue in the figure and the word in the list:

| Family | Hue | Cue in the figure | Word in the list | Greyscale result |
|---|---|---|---|---|
| architecture | teal, slate, amber, violet, green; concept has no hue | pill, r6, drum line, dashed, chamfer, dotted | `(interface)` etc. | All six can be told apart. Interface and process differ only by corner radius, 12 against 6. |
| trace | wait amber | dashed outline | `[wait]` | OK. |
| trace | failure (danger) | stroke 2 px against 1.5 px | `[failure]` | **Not separable.** Danger against line luminance is 1.03:1 in light and 1.02:1 in dark. The legend chip looks the same as a plain box (F-02). |
| trace | bands slate and amber | branch heading text | branch list | OK. The heading names the band. |
| state | none | dot, inner ring, patterns | `(initial)` etc. | OK. |
| cause | amber, violet, slate | dashed, dotted, dash-dot, plus "(basis)" on the arrow | `(inferred)` etc. | OK. |
| plan | green, teal, amber, slate | check, **none**, dashed, **no fill**, "?" | `status: …` | **ready and proposed are not separable.** Tint against white is 1.13:1. Stroke teal against slate is 1.38:1 in light and 1.00:1 in dark. In forced colours both are a Canvas box with a solid CanvasText stroke (F-01). |
| transform | amber on the lossy arrow | "loss:" in the arrow label | `(loss: …)` | OK. The legend chip is a plain line, and the word "loss" labels it. |

Forced colours (`reader.css:71-82`, `487-531`): shapes, dash arrays, marks, and
the loop ring stay. Failure uses `Mark`. Two gaps remain: `ready` and
`proposed` look the same (F-01), and the `vs-nofill` fill is not forced (F-05).

## 3. Determinism

`encoding.ts` reads only constant tables. `showsHue` uses only the size of a
`Set`. The legend order follows the key order of `ROLE_CUES`, `BASIS_CUES`, and
so on, not the authored order (the ARCH test proves this: storage is authored
before process, but the legend lists process first). The arrow markers in
`svg.ts` follow the `CATEGORY_HEX` key order. Sub-columns follow the authored
order of actors and events. There is no `Date`, `Math.random`, `Intl`, or
`toLocale*`. `R()` rounds to 3 decimals, and `String(-0)` is `"0"`. The
compiled bytes of 6 examples were the same across 2 runs and 2 locale and time
zone settings. `pageTokens()` runs only in the browser, so the artifact does
not depend on it. Result: no finding.

## 4. Accessibility

- The eyebrow survives as `aria-label="Figure: <title>"` on `<figure>`.
  Mermaid figures use their own shell and never had the eyebrow. They have no
  "Figure:" prefix, which is not a regression.
- Each legend chip has a visible word, and its swatch has `aria-hidden`. The
  `ul` has `aria-label="Legend"`.
- The node `aria-label` values keep the words: "Order API (interface)",
  "Add new column (status: complete)", "Hot key expired (observed)",
  "Idle (initial)". Trace events keep them too: "Marks the order paid
  (Charge worker; [state-change]; branch: Charge succeeds)".
- The edge `aria-label` has no kind, basis, or loss word (F-07). This is older
  than phase 1, but phase 1 now encodes these values on the edge in the drawing.

## 5. Screenshots

- No labels overlap, no arrow crosses a box, and no legend lists an unused value
  (checked on all 22).
- The trace is better than the "before" image: headings no longer collide, the
  badges are gone, and the size is 896 × 457 → 824 × 377.
- `bounded-queue-full_queue_trace.png` shows a 3-line event label, "Rechecks
  capacity / and enqueues if / space remains". It had 3 lines at 170 px too
  (F-15).
- `order-intake-components*.png`, `bounded-queue-handoff*.png`: the storage drum
  line sits 3 px under the label and looks like a link underline (F-09).
- `schema-migration-migration*.png`: the check mark almost touches the label in
  "Add new column✓" (F-11).
- `cache-stampede-mechanism.png` has "API requests time / out" and "Client
  retries add / load". `schema-migration` has "Backfill existing / rows". Each
  fit on one line at the old width (F-10).
- Out of scope, older than phase 1: in `bounded-queue-wait_code.png` there is
  no gap between the line number and the code ("1from", "5class").

## 6. Contrast

Recomputed (WCAG 2 relative luminance):

- Light teal `#0f766e`: on `#ffffff` 5.47, on `#f5f6f8` 5.06, `#1d1f23` on tint
  `#e6f4f2` 14.61. This matches the comment.
- Dark amber `#fbbf24`: on `#16181c` 10.65, on `#1f2227` 9.56, `#e6e8eb` on tint
  `#3b331d` 10.20. This matches the comment.
- The other 10 hue rows and the amber edge label (5.02) also match. The dark
  tints are the stated 16 % mix to the digit.

## Findings

| ID | Severity | File:line | What is wrong | Fix |
|---|---|---|---|---|
| F-01 | major | `encoding.ts:91`, `:93`; `reader.css:71` | [confirmed, spec gap] Plan `ready` and `proposed` differ only by hue and tint. In forced colours both render as a Canvas box with a solid CanvasText stroke and no mark, so the comment "no value is lost" is false. In greyscale: tint 1.13:1, stroke 1.38:1 (light), 1.00:1 (dark). This breaks §2.1 "every hue is paired". The §3.2 row gives `ready` no cue, and "no fill" does not survive forced colours. | Give one of the two a pattern or a mark. Smallest change: `proposed: { …, dash: '2 4' }` (a dotted outline, which is not the dashed `blocked`). Update the §3.2 row and the legend test. |
| F-02 | major | `encoding.ts:105`; `svg.ts` `traceSvg` event block (406-414) | [confirmed, spec gap] Trace `failure` has no non-colour cue in the drawing except a 0.5 px wider stroke. Danger against line luminance is 1.03:1. The "[failure]" text left the box (§3.4), and the list is the only cue. Phase 2 (§4.1) hides the list on wide screens. The legend chip looks the same as a plain box in greyscale. | Add a mark, as for plan `unknown`: for example a "!" or "✕" `vs-mark-text` in the right padding, with `marked` padding reserved. Or use a double outline. Add the mark to the legend swatch and to §3.2. |
| F-03 | minor | `encoding.ts:113`; `svg.ts` `traceSvg` (309-316) | [spec conflict] A trace colours two variables, event kind (wait is amber) and branch (slate and amber bands). They share amber, so a wait box can sit in an amber band. §2.1 says at most one variable in hue. The §3.2 trace row asks for the bands, so the spec contradicts itself. | Decision for the spec owner. Either make the bands neutral (`--vs-panel` and `--vs-bg` alternate, with a rule line), or change §2.1 to allow a structural band. |
| F-04 | minor | `svg.ts` `traceSvg` band block (309-316), with the main-column `boxX` (218-223) | [confirmed by probe] A band spans from the first to the last box of a branch sub-column. A main-column (no branch) event of the same actor on a row in between is centred across the lane, so half of it sits inside the band. Probe: band x 86–248, y 115–281 covers event `tick`, x 179–329, y 193–223. The reader then sees `tick` as part of branch A. | Draw one band per run of consecutive rows. Split the band at a row where the lane has a main-column box, or skip bands for a lane that mixes the two. Add the probe as a test. |
| F-05 | minor | `reader.css:465` against `:487-496` | [confirmed specificity; visual effect is a hypothesis] `.vs-figure svg .vs-cat.vs-nofill .vs-shape` (0,4,1) beats the forced-colours rule `.vs-figure svg .vs-cat .vs-shape` (0,3,1). A `proposed` box then keeps `fill: var(--vs-node)` (a hex value) under `forced-color-adjust: none`. If Canvas differs from `--vs-bg`, the CanvasText label can land on a light fill. | Add `.vs-figure svg .vs-cat.vs-nofill .vs-shape` to the selector list of the forced-colours rule at 488-496. |
| F-06 | minor | `reader.css:571`, print block `:601-612` | [confirmed on narrow screens; hypothesis for desktop print] In list view, `(max-width: 899px)` hides the legend. The print block forces `.vs-view-list .vs-viewport` visible but not the legend, so the drawing prints without its key. §3.3 says the legend prints. A print width under 900 px can also trigger `applyViews` (`reader.ts:567`). | In `@media print`, add `.vs-figure.vs-view-list .vs-legend { display: flex !important; }`. |
| F-07 | minor | `svg.ts` `graphSvg` edge `aria` (76); `compile.ts` `edgeLabel` (377-395) | [confirmed, older than phase 1] The edge `aria-label` is "from, label, to" and has no basis, loss, or kind word. Example: "Decoded image, resize to 224 by 224, Resized image" leaves out the loss. Sighted readers now get hue, pattern, and the word, but the SVG text for a screen reader does not. | Pass an `edgeNoteOf` (from `edgeNotes`) into `SvgInput`, and append it to the edge `aria-label`, as nodes do with `noteOf`. |
| F-08 | minor | `compile.ts` `encoding` case `state` (577-581), `edgeLabel` case `state` (382-386); `encoding.ts:72-75` | [confirmed, spec gap] A line pattern with no key in the figure. A state transition with basis `inferred` or `hypothesis` is dashed or dotted, but has no legend, no word on the arrow, and no word in the `aria-label`. Architecture edge kinds (dashed, dotted, ring) are the same. Only the list names them, and phase 2 hides the list on wide screens. | State: append `(basis)` to the arrow when the basis is not `observed`, as cause does. Architecture: add pattern chips to the legend when 2 or more kinds with different patterns are used. |
| F-09 | minor | `encoding.ts:172-176` | [confirmed in screenshots] The drum line at `y + h - 5` in a 34 px box is 3 px under the label, so "Charge queue" and "Order store" look underlined. In this reader, an underline means a link. | Reserve bottom padding for a drum (for example 6 px more height through a `drum` flag in `nodeBox`), or draw the drum as a top arc. |
| F-10 | minor | `layout.ts:98-103` | [confirmed] `nodeBox` takes the narrowest width with at most 2 lines. A label that fits on 1 line at 150 px then splits with a one-word orphan: "API requests time / out", "Client retries add / load", "Backfill existing / rows". Each was 1 line at 160. The boxes get taller, which works against the §3.4 height goal. | Choose the width by (line count, width): try 1 line at widths up to 176 first, then 2 lines at 126 and up. |
| F-11 | minor | `layout.ts:96`; `encoding.ts:188` | [confirmed in screenshot] `MARKED_PAD_X = 22` leaves about 5 px (by the metrics table) between the label and the check. The real font is wider than the table, so in the screenshot "Add new column✓" touches. | Raise `MARKED_PAD_X` to 26, or move the mark to `x + w - 14`. |
| F-12 | minor | `compile.ts` `figureShell` (322-337); `reader.css:479-486` | [missing] §3.6 bullet 2: the interpretation paragraph beside the legend when both are one line. Not implemented and not recorded as deferred. | Wrap the interpretation paragraph and the legend in a flex-wrap row, or record the deferral in IMPROVEMENTS §9. |
| F-13 | minor | `compile.ts` trace `meta` (812-815) | [deviation, documentation] A time-scale trace keeps "at T unit" in the box. §3.4 names only "→ Receiver" and the representation as exceptions. The code comment cites §3.4 for it. The time is not drawn anywhere else, so the code is reasonable. | Add the time to the §3.4 exception list. Do not change the code. |
| F-14 | minor | `mermaid.ts:22-44`; `tests/unit/runtime.mermaid.test.ts` | [suggestion, test gap] `pageTokens()` has no test. `LIGHT_TOKENS` copies the `reader.css` values by hand and can drift from them. | Add a jsdom test that stubs `getComputedStyle`. Add a unit test that checks `LIGHT_TOKENS` against the `:root` values parsed from `reader.css`. |
| F-15 | minor | `svg.ts:140` (`BOX_WIDTH = 150`) | [suggestion, older than phase 1] Trace boxes do not adapt their width, so a long event label still takes 3 lines (`bounded-queue-full_queue_trace.png`). | Choose the trace box width per lane from `NODE_LABEL_WIDTHS`, as `nodeBox` does. |

## Verdict

Phase 1 implements every row of the §3.2 table, the legend, the box-content
rule, the Mermaid base theme, the eyebrow change, and the trace fixes from F8.
The encoding is deterministic, and the contrast figures in `reader.css` are
correct. The screenshots show no overlap, no arrow through a box, and no unused
legend value. The trace is clearly better than the "before" image. There are no
blockers. Two major findings stop phase 1 from meeting its own principle,
"colour never alone": plan `ready` and `proposed` can be told apart only by hue,
also in forced colours, and a trace `failure` in greyscale is only 0.5 px wider
than a plain event. Both gaps come from the §3.2 table, so each needs a short
spec decision and a small change to `encoding.ts`. Fix these two, and the
one-line CSS fixes for forced colours (F-05) and print (F-06), before phase 1
is called complete. The remaining items are minor polish or spec
clarifications.
