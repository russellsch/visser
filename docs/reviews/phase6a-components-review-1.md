# Phase 6a review: the §14 components (review 1)

Reviewer: independent review role. Date: 28 September 2026.

## Scope

Specification: `docs/IMPROVEMENTS.md` §14.1 to §14.8, §14.10, and §14.11,
with §3.1 to §3.3, §4.3, §12.3, and §14.9 where the lenses touch them.

Implementation (uncommitted working tree): `packages/core/src/model/{diff,validate,targets,project}.ts`;
`compiler/{measure-svg,compile,encoding,svg,dom-contract,html}.ts`;
`review/{components,index,context}.ts`; `syntax/profile.ts`;
`catalogue/index.ts`; `runtime/src/components.ts` and the `phase 6a`
blocks of `reader.ts` and `reader.css` (with the neighbourhood, filter, and
fold code that they interact with); `schemas/visser-catalogue-1.schema.json`;
the guides `measure`, `tree`, `steps`, `note`, `self-check`, `decision`,
`trace`, `annotated`; `SKILL.md`; `docs/ARCHITECTURE.md` §9.14 to §9.18;
`fixtures/positive/family-components.md`; the 22 negative fixtures;
`tests/unit/components.test.ts`; `tests/browser/components.spec.ts`; the
five changed examples and `docs/explanations/how-visser-works/index.md`.
Screenshots: every file in `docs/validation/improvements-1/phase6a/` at
1440 light, the 390 images, the steps overview and mid-walk (light and
dark), and the diff view (light and dark).

Another agent edited `reader.ts` (09:54), `reader.css` (09:53),
`compile.ts`, and `bundle.ts` (09:56) during the review. Line numbers are as
of about 10:05. Function names are given as well.

## Checks run

- `npx vitest run tests/unit/components.test.ts`, once: 28 of 28 passed. It
  rebuilt `dist/release` through the global setup and wrote
  `reports/vitest-junit.xml`, as the task allowed.
- `npx playwright test tests/browser/components.spec.ts`, once, with
  `dist/release` newer than the last `reader.ts` edit at that time: 6 passed,
  2 skipped (project filters). It wrote `test-results/`.
- In-memory probes from source (Node 25 type stripping; bundles and output
  in the session scratchpad only): free text with markup and quotes in
  `path`, `label`, `unit`, `title`, `question`; a before-and-after of a
  Markdown file whose excerpt holds a fence; observations out of time order;
  an observation in an ordinal trace; an empty note and an empty self-check;
  `steps` inside a `measure`; a step that names a `detail`; zero, tiny, and
  huge readings; the six new guide templates through `check` and `--review`;
  the four changed examples and `how-visser-works` through `--review`; the
  fixture compiled twice, and again under `LC_ALL=de_DE.UTF-8` (identical
  hashes).
- `lineDiff` time and memory at 80, 1,000, 3,000, 5,000, 8,000, and 12,000
  lines on each side.
- Headless Chromium (the repository's `playwright-core`) on in-memory
  compiles with `dist/release/browser/reader.{js,css}` (built 09:58):
  a probe map with a `collapsed=true` group, a legend with filter chips, a
  two-step walkthrough, a self-check, and a three-level tree. Sequences:
  Next and Previous over a fold; chip, then step, then overview; step, then
  hover, then leave; Expand details twice; Tab through the tree. axe-core
  (`wcag2a`, `wcag2aa`, `best-practice`) on the positive fixture with and
  without the runtime. Print media emulation with and without JavaScript.
- A text scan of the six new guides for sentence length, passives, and
  "-ing" forms; a manual read of the `SKILL.md` diff against HEAD and §12.3.

## Findings

| ID | Severity | File:line | What is wrong | Fix |
|---|---|---|---|---|
| C1 | Medium (confirmed) | `model/diff.ts:22-31`; `validate.ts:580`; called twice, `compile.ts` `diffView` and `project.ts:438` `diffFence` | `lineDiff` builds a full (n+1)×(m+1) table of JS numbers, and nothing caps the input: 80 lines is a warning only, and a document may hold 10 MB. Measured: 5,000×5,000 lines take 144 ms but 411 MB of heap; 12,000×12,000 with a 1 GB heap ends in `FATAL ERROR ... JavaScript heap out of memory` (exit 134). With the default heap here (4.5 GB) the crash comes near 23,000 lines each side, and the build computes the diff twice. The result is a process crash, not a diagnostic. The time is not the problem; the memory is. | Add a hard `E_LIMIT` in `validate.ts` next to `DIFF_WARN_LINES` (for example 2,000 lines on a side, or n×m above 4×10⁶). In `lineDiff`, strip the common prefix and suffix first and keep the table in `Uint32Array` rows, or use Myers with a bound on D. Compute the rows once and share them between the page and the projection. |
| C2 | Medium (confirmed in Chromium) | `runtime/src/components.ts:66-82` `mark`; `reader.ts:835` `applyFilter` | The step marks and the filter chips both own `vs-dim`. Probe: press the "external" chip (five parts dim), press Next, then Previous back to the overview: every `vs-dim` is removed, and the chip still has `aria-pressed="true"`. The filter is off while its chip says on. The other way, a chip pressed during a step re-dims by filter only, so a step target can carry `vs-near` and `vs-dim` together. The hover fix (restore on `pointerout`) works: step, hover, leave gives the step marks back. | Give one owner the precedence: step marks win while a step is active, and the filter comes back at the overview. In `mark`, when `active` is undefined, re-run the figure's filter (export `applyFilter`, or dispatch an event that `reader.ts` handles). In the chip `update`, re-mark an active walk after `applyFilter`. Add both sequences to `components.spec.ts`. |
| C3 | Medium (confirmed in Chromium) | `runtime/src/components.ts:50-64` `markable`; fold box in `svg.ts` (`g.vs-fold`, no `data-vs-target`) | `markable` takes `svg a[data-vs-target]` only, so a fold box never gets a mark. Probe with `collapsed=true`: at a step about parts outside the group, every part dims except the fold box, which stays at opacity 1 as if it were a target. At a step whose target is inside the folded group, nothing visible gets `vs-near`; the hidden node gets it. `markEntity` in `reader.ts:783` already handles this case through `data-vs-fold-hide`. | In `markable`, add each visible `[data-vs-fold]` with the IDs in `data-vs-fold-hide` plus the group ID, as `markEntity` does. Optionally unfold the group when a step names a hidden part. |
| C4 | Medium (confirmed, axe) | `compile.ts:549-559` `tree` | An entry with children puts its link (`a.vs-tree-entry`) inside `<summary>`. axe-core reports `nested-interactive` (serious, WCAG 4.1.2) on `.vs-tree-node > .vs-tree-line`, with and without the runtime. Tab stops go summary, link, summary, link. The accessibility gate (`journeys.spec.ts:337`) runs on `bounded-queue` only, which has no tree, so it does not catch this; `components.spec.ts` has no tree test. | Keep the link outside `<summary>`: for example `<li><div class="vs-tree-line">link, role, evidence</div><details open><summary>3 entries</summary><ul>…</ul></details></li>`. Add a tree page and an axe run to `components.spec.ts`. |
| C5 | Medium (confirmed) | `project.ts:438-445` `diffFence`; the same defect exists before this phase at `project.ts:80` (`case 'fence'`) | The projection always opens a three-backtick fence. A diff of a Markdown file whose excerpt holds a line of three backticks prints that context line with one leading space, and a closing fence may be indented up to 3 spaces. Probe: the context line (a space, then three backticks) closes the diff fence early, and the closing three backticks then open a new fence that swallows the following `vs:target` ID lines of `document.md`. | One helper that picks a fence of max(3, longest backtick run in the content + 1) backticks, used by `diffFence` and by the source fence. Add a projection test with a fenced Markdown excerpt. |
| C6 | Low (confirmed) | `svg.ts:560-585` (slot stacking); trace block of `validate.ts` | In a `scale="time"` trace, events in one order layer stack in authored order, not by `time`. Observations have no `after`, so all of them sit in layer 1, and the axis reads "Order layer 1". Probe: an observation at `time=90` authored before one at `time=5` is drawn above it (y 61 against y 131). For "what was seen, and when?" (§14.6) the drawing then reads in the wrong order. | In a time-scaled trace, sort the events of one slot by `time` (stable). Or report a prompt when authored order and `time` disagree in one lane. Say it in `trace.md`. |
| C7 | Low (confirmed) | `validate.ts:106` (event `kind` enum) | §14.6 adds `kind="observation"` to `trace scale="time"`. An observation in an ordinal trace, with no `time`, passes with no diagnostic. | `E_SEMANTIC` for an observation in an ordinal trace, or state in `trace.md` that an observation needs `scale="time"`. |
| C8 | Low (spec gap; confirm intent) | `validate.ts:84` (`factor` has no `evidence`), `validate.ts:179` (`cite` names a `source` only); `review/index.ts:242-245` | §14.6: "The link between a factor and the log line that supports it then exists in the data." Only a `causal-link` can name an observation. An observed `factor` cannot, so `W_EVIDENCE_GAP` "marked observed but cites no evidence" stays on the factors of `cache-stampede` although an observation could support them. | Add `evidence` (a source or an observation event) to `factor`, and let the observed-factor prompt count it. |
| C9 | Low (confirmed) | `validate.ts:138-139` | A `note` with no body and a `self-check` with no answer pass `check` and `--review`. The page shows a bare "Warning" eyebrow, or a "Show answer" that opens nothing. | `E_SYNTAX`: a note needs a body; a self-check needs an answer. |
| C10 | Low (confirmed) | `validate.ts:643` (step `targets`) | A step can name a `detail` inside the figure. No diagnostic; the detail is not drawn, so at that step every part dims and nothing is marked. | Reject a target whose tag is `detail` (and any other tag with no drawn or listed instance) with `E_REF_BROKEN`. |
| C11 | Low (judgement) | `reader.ts:229` `toggleExpand` | "Expand details" opens every `details`, so it shows every self-check answer. A reader who opens the depth first sees each answer before the question, and a self-check is retrieval practice. Print must keep opening them (it does, with and without JavaScript). | Skip `details.vs-self-check-answer` in `toggleExpand`, keep `beforePrint` as it is, and update the test `Expand details opens every detail` (`journeys.spec.ts:325`). |
| C12 | Low (confirmed) | `review/components.ts:201-208`; `decision.md:40` and its Diagnostics | `decision.md` requires one `note kind="assumption"` for each assumption. `W_NOTE_DENSITY` allows max(1, floor(words/300)) notes, so a 700-word record (the budget) with three assumptions gets the prompt, and the guide then says to keep them. | In a `kind: decision` document, count only `limit` and `warning` notes; or tell the guide to list the assumptions in one note. |
| C13 | Low (confirmed) | `decision.md:69`; `self-check.md:60-62`; `steps.md:73-75` | Templates break their own rules. The decision template gives `W_PASSIVE` ("is lost"), and its **Chosen because** has no citation, though rule 4 asks for one. The self-check answer and the step body have no citation, though both guides say "with citations". | "and the service loses no order at a peak"; add a `cite` with a captured example source, as `measure.md` does. |
| C14 | Low (design) | `model/bundle.ts:50-55` (added 09:56, during this review); `tests/unit/bundle.undeclared-file.test.ts:42-60` | The fix for `W_UNDECLARED_FILE` exempts any folder named `example-sources/` at a bundle root. That puts a reserved name into the public bundle format for every author, and ARCHITECTURE §15.4 and the diagnostics table do not state it. The warning was correct: the files are copies of the inline excerpts (checked for `accept-order.ts`), and no target declares them. A public export does not refuse the bundle either way: `export.ts` stops only on errors (line 87), and `--include-source` copies declared files only. | Revert the exemption. Move the capture inputs out of the bundle roots (for example `examples/_capture/<example>/`), or delete them, because the fence and `excerptSha256` are the record. If the name stays, document it in §15.4 and the diagnostics table. |
| C15 | Low (confirmed, print emulation) | `reader.css:990` and the print block at 1035 | With JavaScript on a wide screen, `.vs-steps-live > .vs-steps-heading { display: none }` has no print override, and the bar is hidden in print. The printed walkthrough is a bare numbered list with no "Walkthrough in N steps" heading. Without JavaScript the heading prints. | Add `.vs-steps-live > .vs-steps-heading { display: block !important; }` to the print block. |
| C16 | Nit (STE) | `decision.md:36-39`; `measure.md:46`; `decision.md:9`; `steps.md:55-57`; `decision.md` template "Behavior"; `SKILL.md:109, 112` | One 41-word sentence joined by a semicolon (rule 4). Passives "is hatched" and "the choice is made". A 26-word description. "Behavior" against "behaviour" in `SKILL.md`. Two table rows ask in the first person ("do I", "did we") where the rest name the reader. `steps.md` uses both "walk" and "walkthrough". | Split rule 4 into two sentences. "The page hatches a reading that is not `measured`." "The team made the choice." Use one spelling and one word. |
| S1 | Optional | `compile.ts:452`, `project.ts` `case 'steps'` | The sentence "Reading order, not execution order." shows only in an architecture map. That matches §14.1. A `plan` or `state` walkthrough also reads as a schedule or a run. | Consider the sentence for every graph mode and `domain`. |
| S2 | Optional | `compile.ts:1394` | The diff sign has `aria-label` on a `<span>` with no role. Assistive technology ignores it and reads "−" or "+". | Use visually hidden text ("removed", "added") instead. |
| S3 | Optional (before this phase) | `compile.ts` `codeLines` and `diffView` | The annotation marker ● shifts the code on its line by one column. The diff screenshot shows it: before line 11 `if` sits one column right of line 13 `attempt`; after line 5 `start` sits right of line 6 `delay`. In Python the indent carries meaning. | Reserve a fixed-width marker column on every line. |
| S4 | Optional | `project.ts` `withUnit` | `String(value)` drops trailing zeros ("0.50" prints "0.5") and prints large values as "1e+21 req/s". Locale does not affect it (confirmed). | Accept a string `display` for the value, or keep the authored literal. |

## Judgement of the stated deviations

| Deviation | Judgement |
|---|---|
| The step bar starts at an overview (step 0) | Accept. The page loads undimmed, the static reading holds, and the status says "Select Next to start". Previous at step 1 reads "Overview". |
| One `steps` for each figure (`E_SEMANTIC`) | Accept. It follows from §14.11 ("two `steps`, one in each"). Fixture present. |
| `steps` only in `graph`, `trace`, `transform`, `compare`, `annotated`, `domain` (not `measure`, `tree`, `mermaid`, `extension`) | Accept. §14.1 says "any figure", but those four have no drawn parts to mark, and ARCHITECTURE §9.14 and `steps.md` state the list. |
| `reading.valueStatus` required | Accept. It serves the §14.4 misleading example better than a default. |
| `value` of 0 or more (`E_SEMANTIC`) | Accept. A bar starts at zero. |
| `actor` optional only in a `scale="time"` trace with no actors | Accept. It matches §14.6; both negative fixtures exist. |
| `W_NOTE_DENSITY` allows max(1, floor(words/300)) | Accept, with C12 for decision records. |
| "Chosen because" and "Revisit when" as bold lead-ins, not headings | Accept. A 2-word h2 would get `W_HEADING`, and §12.2 idea I rejects topic headings. |
| Tree with no legend | Accept. Each entry prints its role word next to the swatch, so a legend adds nothing (§3.3). |
| `measure` above 12 readings is `E_LIMIT`, not a prompt | Accept. §14.4 says "up to 12". |
| `SKILL.md` at 2,495 words | Accept. All ten §12.3 changes are present. The five safety sentences are present (shim only, never install, never trust, never publish, stop on `E_TOOLKIT_*`). What left SKILL.md is in `operations.md` (lock, `--dev-toolkit`, "never publish it", `doctor`, `--part template` and `--part schema`) and `handoff.md` (`--acknowledge-body-change`, the report after an edit). I compared with HEAD (1,644 words) and §12.3; I could not see the uncommitted state before the trim. |

## Misuse guards (lens 2)

| Guard | Diagnostic | Test |
|---|---|---|
| `steps` above 8 | `W_VISUAL_DENSITY` (validator) | unit, 8 and 9 |
| "Reading order, not execution order." | architecture only, per §14.1 | unit (HTML, text), browser |
| Three note kinds only | `E_SYNTAX` enum | `note-kind-tip.md` |
| Self-check outside `teaching` | `W_SELF_CHECK` | unit |
| Four task shapes | guide only; no machine check is possible | none |
| Measure: 12 readings, one unit, evidence, one series | `E_LIMIT`; `unit` on the figure; `W_EVIDENCE_GAP`; one `value` for each reading | `measure-thirteen-readings.md`, `measure-no-unit.md`, unit |
| Tree above 40 entries | `W_VISUAL_DENSITY`, nested entries counted | unit, 40 and 41 |
| Diff above 80 lines on a side | `W_VISUAL_DENSITY` | unit, 80 and 81 (no hard cap: C1) |

## Other results

- Static first: without JavaScript, the steps list, the self-check and tree
  `details`, the measure table, and the stacked diff below 900 px all show.
  Print shows the self-check answer with and without JavaScript (Chromium).
- Determinism: `lineDiff` and `diffPairs` are pure, and ties put the removed
  line first. Bar widths use `round3` and `String`, with no locale call.
- Escaping: `path`, `label`, `unit`, `title`, and `question` with markup and
  quotes are escaped in text and in `aria-label`. `measure-svg.ts` writes only
  numbers from `n()`, constant colours, and IDs; it uses no attribute that
  has a value pattern in `html.ts`. Diff lines go through `safeText`.
- Colour never alone: the note word, the hatch and "(estimated)", the tree
  swatch with its word, the observation page mark, and the diff signs are
  present. The forced-colours rules cover the note, the measure, the marks,
  and the diff tints (the tint tokens map to `Canvas`). I read the CSS; I did
  not render forced colours.
- Text projection of the built examples: the measure table in
  `cache-stampede` and the `diff` fence in `deadline-retry` carry the
  content without the drawing.

## Limitations

- The browser probes used `dist/release/browser` as built at 09:58. The
  other agent changed `reader.ts`, `reader.css`, and `compile.ts` during the
  review.
- No real screen reader. C4 rests on axe and the tab order.
- Print was checked by media emulation, which does not fire `beforeprint`.
  Firefox and Safari were not tested.

## Verdict

Changes required. The components match §14 closely, and the stated deviations
are sound. Fix C1 to C5 before this phase is committed: C1 can crash a build,
C2 and C3 leave a figure in a wrong state after ordinary clicks, C4 fails the
project's own axe bar on any page with a nested tree, and C5 can corrupt
`document.md`. C6 to C16 can follow in a later change.
