# Phase 3 review: `evidence` on parts and `due` on tasks (review 1)

Reviewer: independent review role. Date: 28 September 2026.

## Scope

Specification: `docs/IMPROVEMENTS.md` §4.4 (both parts), §7 (the `annotated`
sentence), §10 (the rows "`evidence` attribute, or `cite` in the body?" and
"Dates on a plan?"). ARCHITECTURE §7.4, §7.5, §7.6, §8.1, §8.5, §9.2.

Implementation (uncommitted working tree, phase 3 parts only):
`packages/core/src/model/validate.ts`, `targets.ts`, `project.ts`;
`packages/core/src/compiler/compile.ts` (`ownEvidenceIds`, `evidenceIds`,
`evidenceSection`, `detail`, `boxLines`, `nodeNotes`, `DETAIL_FACTS`),
`svg.ts` (`textLines`), `html.ts` (`tspan` allowlist);
`packages/core/src/review/index.ts` (the two new `W_EVIDENCE_GAP` cases),
`review/shape.ts` (`W_MERMAID` for `gantt`); `skills/visual-explain/SKILL.md`
step 7; `references/catalogue/{architecture,trace,state,transform,plan,annotated,mermaid}.md`;
`fixtures/positive/family-part-evidence.md`;
`fixtures/negative/E_REF_BROKEN/semantic/node-evidence-not-source.md`;
`fixtures/negative/E_SYNTAX/semantic/task-due-not-iso-date.md`;
`tests/unit/part-evidence.test.ts`; `tests/browser/depth.spec.ts` (the §4.4
test); `examples/order-intake/index.md`; `docs/ARCHITECTURE.md` §9 edits.
Screenshots: `docs/validation/improvements-1/phase3/*.png` (all 5 viewed).

Line numbers are as of 08:40 on 28 September. Other agents edited
`compile.ts`, `validate.ts`, `review/index.ts`, `reader.ts`, and `reader.css`
during this review, and the numbers moved between reads. Function names are
given as well.

## Findings

| ID | Severity | File:line | What is wrong | Fix |
|---|---|---|---|---|
| P1 | major | `packages/core/src/compiler/compile.ts:1513-1530` (`evidenceSection`), used first by `detail` at 1616-1628 | A part's `evidence` can name a `link-only` source. The check gives no error and no prompt. The inspector then opens with an "Evidence" section that has no excerpt, only the origin host and the source title as a link. Nothing says that the source has no captured text. Probe: `node … evidence=["src_link"]` with a `kind="web" availability="link-only"` source gives `<h4>Evidence</h4><div class="vs-evidence-item"><p class="vs-source-origin">example.com</p><p class="vs-evidence-open"><a …>Ticket</a></p></div>`. ARCHITECTURE §8.1 says that a link-only source is "displayed explicitly, and cannot count as self-contained supporting evidence". §4.4 promises "the excerpt first". The source's own appendix row has the notice (`sourceDetail`, `compile.ts:1337`), but the inspector section that phase 3 moves to the top does not. | Allow `link-only` in `evidence`: `cite` and `causal-link` `evidence` already accept it, and the source of a date is often a ticket URL. Do not make it `E_SEMANTIC`, because `annotated` needs lines and `evidence` does not. In `evidenceSection`, when `captured` is undefined, emit the same `p.vs-link-only` text that `sourceDetail` uses: "No captured excerpt; this origin link is not self-contained evidence." Add a unit test with a link-only source on a node. |
| P2 | minor | `packages/core/src/review/index.ts:265-280` (root-cause count), `254-261` (`due`) | Both new `W_EVIDENCE_GAP` cases count a link-only source as evidence. In a `root-cause` document, an event whose only `evidence` is link-only is not in the count (probe: 0 prompts). This is the same gap as the existing `observed` rule, but the root-cause count exists to find parts that the reader cannot check. | In the root-cause count, count a part as bare when every ID in `evidenceIdsOf` names a `link-only` source, and say so in the message ("… or only link-only sources"). Keep the `due` rule as it is: a link-only source names where the date comes from. |
| P3 | minor | `packages/core/src/model/project.ts:244-245` (`childBlock`); expectation `tests/unit/part-evidence.test.ts:171-179` | The Markdown export now uses `Evidence:` for two different values. A part with `evidence` gets one `Evidence: TITLE` line for each source. A relationship keeps `Evidence: ID, ID`. An `event` with `to` is both a part and a relationship, so in one trace the export can mix the forms. Probe: `ev_a` (with `evidence`) gives `Evidence: Queue code` and `Evidence: Worker code`; `ev_b` (cite only) gives `Evidence: src_b`. The part lines do not carry the source ID. Two sources with the same title give two identical lines (`Evidence: Handler` twice), and the reader cannot tell which source block is meant. ARCHITECTURE §7.6 requires that tests compare "evidence references … between IR and exported text". A title is not a reference. The order is stable: authored order, with duplicates removed. The existing export tests still pass because no example that they read has part `evidence`. | Print the title and the ID, as the `after:` lines already do (P9 convention): `Evidence: Order API handler (src_accept_order)`. Change the expected values at `part-evidence.test.ts:172`. Add one sentence on the part `Evidence` line to ARCHITECTURE §7.6. |
| P4 | minor | `tests/unit/part-evidence.test.ts:149-180` (input at 158, assertion at 179); `116-123` | The §9.2 union test and the projection test use a document that the validator rejects: `{% edge … evidence=["src_a"] /%}`. `edge` has no `evidence` attribute (`validate.ts:44-48`), so the document gives `E_SYNTAX: edge e_take: unknown attribute \`evidence\`` (probe). The test calls `projectText` and `evidenceIdsOf` without an error check. The assertion `expect(md).toContain('Evidence: src_a')`, commented "a relationship keeps its ID line", passes only on invalid input. Separately, the test at 116 is named "not an attribute of a factor or an actor" but tests the actor only. | Replace the edge's attribute with `Takes next. {% cite ref="src_a" /%}` in the edge body, or use a `causal-link`. Add `expect(errors(text)).toEqual([])` in the `describe`. Add a factor case at 116, or rename the test. |
| P5 | minor | `packages/core/src/review/shape.ts:44-45`; `skills/visual-explain/references/catalogue/mermaid.md:25`; `docs/REVISIONS.md` 1.25 entry | The `W_MERMAID` prompt for a `gantt` says "use `plan` with a cited `due` date on each task". The mermaid guide says the same. The one-rule-each decision (§10) makes "cite" mean a `cite` tag in the body. An agent that follows the prompt and adds a body `cite` still gets `W_EVIDENCE_GAP`: `part-evidence.test.ts` (`t_c`) asserts exactly this. One word, two meanings. | Say "`plan`, with the source of each `due` date in `evidence`" in `shape.ts`, `mermaid.md`, and REVISIONS. Change the expected value at `tests/unit/review.prose.test.ts:231-232`, which quotes the current text. |
| P6 | minor | `skills/visual-explain/references/catalogue/plan.md:47-49`; the same sentence in `state.md:47`, `transform.md:45`, `trace.md:54` | The rule sentence "`evidence` says this part is this code" does not fit parts that are not code. In `plan.md`, line 47 gives this meaning, and line 49 gives another: "the source that sets the date". A release calendar is not "this task is this code". A `stage` is a representation of a value, and a `state` is a condition. The spec text in §4.4 has the same wording, so the guides copy it. | Keep the SKILL.md wording for code parts. In `plan.md`, write: "`evidence` names the source that shows this task, such as the source of its `due` date. A `cite` supports one sentence in the body." For `state` and `stage`, use "the source that shows this part". Ask the spec owner to align §4.4. |
| P7 | minor | `skills/visual-explain/references/catalogue/*.md` (no example); `packages/core/src/model/validate.ts:180` (`typeText`) | No guide and no SKILL.md text shows the attribute form `evidence=["src_x"]`. An agent that writes `evidence="src_x"`, like `source="src_x"` on `annotated`, gets `E_SYNTAX: node n_a: \`evidence\` must be ids` (probe). The word "ids" is an internal type name. Phase 3 changed `typeText` for `date` only. | In each guide bullet, write the form: "`evidence=["src_handler"]` names `source` targets". In `typeText`, map `ids` to "a list of IDs, such as [\"src_a\"]". |
| P8 | minor | `packages/core/src/model/validate.ts:14` (`ISO_DATE`), 173 | The pattern rejects `2026-13-01`, `2026-00-10`, and `2026-10-00`, but accepts `2026-02-30`, `2026-02-31`, and `2026-04-31` (probe). This does not matter for security or byte determinism: the date is only printed as text, never parsed, sorted, or measured. It matters for correctness: the diagnostic says "must be an ISO 8601 date", and these dates are not calendar dates. A typo such as `2026-02-30` goes to the page with no diagnostic. | After the pattern, check the day against the month length, with the Gregorian leap-year rule. Do not use `Date` parsing, which depends on the engine. Add `"2026-02-30"` to the rejected list at `part-evidence.test.ts:133`. |
| P9 | minor | `examples/order-intake/index.md:140`, `152` | The two illustrative excerpts disagree. `acceptOrder` queues `{ orderId: order.id }` only, but `chargeNext` charges `request.amount`, which that row does not have. The example is labelled illustrative (`kind="example"`), but a reader who opens both nodes sees code that cannot work. The evidence is otherwise plausible for its node: `n_api` validates, stores, queues, and replies 202; `n_worker` takes, charges with the order ID as the key, and records the result. | Recapture `src_accept_order` with `visser capture file --kind example --recapture` from a file that queues `{ orderId: order.id, amount: order.amount }`. Do not edit the excerpt by hand. |
| P10 | nit | `skills/visual-explain/references/catalogue/annotated.md:17-18` | The §7 sentence is present word for word, but it is a bullet under "Do not use it when", and it starts with "Use …". It also says "on a node", while `evidence` goes on 5 part tags, and SKILL.md says "on a part". | Under "Do not use it when": "One excerpt explains one part. Put `evidence` on that part." Under "Use it when": "Two or more spots in one excerpt each need words." |
| P11 | nit | `packages/core/src/compiler/compile.ts:1377-1385` (`ownEvidenceIds`), 1616 | The Evidence-first order applies to every tag with an `evidence` attribute, so a `causal-link` now also shows its Evidence section before its body (probe: section offsets 329 < 716). §4.4 and the ARCHITECTURE §9.2 edit name 5 tags only. The export treats a `causal-link` as a relationship (`Evidence: IDs`). | Make a decision. Either test `PART_EVIDENCE_TAGS.has(tagName)` before `evidenceFirst`, or add `causal-link` to the ARCHITECTURE §9.2 sentence. |
| S1 | suggestion | `packages/core/src/compiler/html.ts:47`, `svg.ts:87,99` | The allowlist checks attribute names, not values. `h('tspan', {'fill-opacity': 'url(x)'})`, `'1;expression'`, and `'0.5 '` all render (probe). This is not a defect today. The only producer is the constant `MUTED_OPACITY = '0.72'`, values are attribute-escaped (`"` becomes `&quot;`), and `fill-opacity` does not accept `url()` or script. `fill` and `stroke` have the same name-only rule. | Optional hardening: in `h`, check `fill-opacity` (and other numeric presentation attributes) against `^(0|1|0?\.[0-9]+)$`, and throw `UnsafeMarkupError` otherwise. |

## Conformance by item

| Item | Where | Result |
|---|---|---|
| §4.4: optional `evidence` array on `node`, `event`, `state`, `stage`, `task` | `validate.ts:32, 41, 49, 61, 72, 79` | Conforms. `actor` rejects it (tested). A factor is not tested (P4). |
| §4.4: `check` gives `E_REF_BROKEN` for the IDs | unknown ID: `targets.ts:37` (`REF_ATTRIBUTES`) and 219-225; wrong kind: `validate.ts:336-339` | Conforms. Both negative fixtures give exactly their code. |
| §4.4: a click opens the inspector with the excerpt first | `compile.ts` `detail` 1616-1628; `reader.ts` scroll reset; `depth.spec.ts:174` | Conforms for captured sources (screenshots `order-intake-inspector-n_api.png`, `…n_worker.png`). Not for link-only sources (P1). |
| §4.4: `W_EVIDENCE_GAP` counts parts with no evidence in a root-cause document | `review/index.ts:265-280` | Conforms. One prompt for each figure, at most 5 IDs named. Factors are not counted, because they have no `evidence` attribute. Link-only sources count as evidence (P2). |
| §4.4: `cite` stays; the guides state one rule for each | 5 guides; `SKILL.md:141-142` | Present. Wording problems in P5, P6, P10. |
| §4.4: the inspector lists `evidence` first, then cited sources | `compile.ts` `evidenceIds` 1391-1405 | Conforms (tested: `src_b, src_a, src_c`). |
| §4.4 / §9.2: `evidenceIds` is the sorted, deduplicated union | `targets.ts:265-279` (`evidenceIdsOf`); relationships at 239-258 | Conforms. `Set` then `sort()`. IDs are ASCII, so UTF-16 order is code-point order. Every relationship kind uses it; `order` relationships stay empty. |
| §4.4: `due` (ISO 8601) on `task` | `validate.ts:14, 61, 173` | Partly: impossible dates pass (P8). |
| §4.4: `due` with no `evidence` gives `W_EVIDENCE_GAP` | `review/index.ts:254-261` | Conforms. `evidence=[]` also prompts (probe). |
| §4.4: the date is text under the label, never a bar | `compile.ts` `boxLines` 628, `nodeNotes` 446, `DETAIL_FACTS` 1738; `svg.ts:99` | Conforms. Box, list, inspector, and export all show it (`fixture-plan-due*.png`). |
| §4.4: replaces the Mermaid Gantt use | `shape.ts:44-45` | Conforms. Wording in P5. |
| §7: the `annotated` sentence | `annotated.md:17-18` | Present, word for word. Placement in P10. |
| §10: "Both, with one rule for each" | guides, SKILL.md | Conforms, with P5 and P6. |
| §10: "`due` on `task`, cited, drawn as text" | as above | Conforms. |
| ARCHITECTURE §9 edits | §9.2, §9.3, §9.4, §9.5, §9.6, §9.9, diagnostics table | Match the code. §7.6 has no text for the part `Evidence` line (P3). |

## Lens results with no finding

- Evidence integrity: a part's `evidence` cannot name a captured source that
  has no `excerptSha256` or a wrong one. Both give `E_EVIDENCE_HASH` in `check`
  (probe: "captured source src_a has no excerptSha256", "captured content
  does not match excerptSha256").
- Hashing (§7.4) and determinism (§7.5): `evidence` is an attribute in the
  part's open tag, so adding it changes the `bodySha256` of the part and of its
  figure, and the `sourceRevision`. This follows the rule "reformatting a
  block changes its body digest but not its identity". The span rules do not
  change. The hash vectors test bytes, not attribute meaning, so they need no
  new case: `scripts/check-contracts.mjs` reports 95 of 95 vectors equal
  between TypeScript and Python. No test stores hashes of `order-intake`
  targets. The export of `order-intake` is the same in two runs.
- Order-intake sources: `check` passes (38 targets, exit 0), so each
  `excerptSha256` matches its body. The attribute order (`id kind title
  language excerptSha256`, no `capturedAt` for `example`) and the position at
  the end of the file match what `captureFile` and `writeSource` write. This
  is consistent with `visser capture`, but it does not prove that capture made
  the blocks.
- Catalogue tables: a copy of the `tests/unit/catalogue.test.ts` logic (run
  with Node, not Vitest) finds that each changed guide lists exactly the
  `TAG_SPECS` attributes, stays under 600 words, and has a template with no
  errors. `domain.md` did not exist yet (concurrent work), so that guide was
  skipped.

## Observations that are not findings

- The phase 3 screenshots show excerpt line numbers against the code with no
  gap, in the text colour ("1//", "2export", "6}"). `reader.css:438` now has a
  `.vs-code .vs-ln` rule with `margin-right: 1.5ch` and the muted colour.
  Hypothesis: the screenshots were made before that rule. Make the screenshots
  again after the next build and confirm.
- The Vitest `globalSetup` (`tests/global-setup.ts:18`) runs
  `scripts/build.mjs`. The command in the task therefore rebuilt
  `dist/release` at 08:26, although the task said not to build. It also
  overwrote `reports/vitest-junit.xml`. A later full run by another agent
  (08:34) replaced that report.

## Checks run

- `git diff` on each file in scope, and a full read of the new files.
- `npx vitest run tests/unit/part-evidence.test.ts tests/unit/review.prose.test.ts tests/unit/compiler.families.test.ts`:
  3 files, 68 tests passed. It ran once, with no transient failure.
- `visser check --review` through a scratch wrapper for `main()` from
  `packages/cli/src/main.ts`, not the built release, on: `order-intake` (ok, 3
  prompts, none `W_EVIDENCE_GAP`), the positive fixture (0 prompts), and both
  negative fixtures (`E_REF_BROKEN` and `E_SYNTAX`, exit 2).
- Node scripts in the scratch folder that import the core modules: the `h`
  allowlist with bad `fill-opacity` values; `ISO_DATE` on 11 inputs; link-only
  `evidence` (check, review, inspector HTML); an `event` with `to`, `evidence`,
  and `cite` (export and relationships); a string `evidence`; an empty
  `evidence` with `due`; the root-cause count with factors and a link-only
  source; two sources with one title; a missing and a wrong hash; Evidence
  first on a `causal-link`; export determinism of `order-intake`; the
  catalogue table logic; the fixture test logic for the 3 new fixtures.
- `node scripts/check-contracts.mjs` (read-only): hash vectors 95/95. The
  current report (another agent's run) has failures only in the catalogue,
  `family-domain.md`, `skill.test.ts`, and ustar tests, which belong to the
  concurrent `domain` work. `part-evidence.test.ts` (19),
  `projection.test.ts` (5), and `review.test.ts` pass in that report.
- Viewed the 5 screenshots in `docs/validation/improvements-1/phase3/`.

## Limitations

- No browser test was run, and I did not build. The browser test for §4.4
  (`depth.spec.ts:174`) was read, not run.
- No other Vitest file was run, because each Vitest run rebuilds the release.
  The catalogue and fixture checks were copied into Node scripts instead.
- The STE check of the guide sentences is manual.
- Whether `link-only` should be allowed in `evidence` (P1, P2) is a decision
  for the spec owner. The fix proposed here keeps it allowed and makes it
  visible.

## Verdict

Phase 3 does what §4.4, §7, and §10 ask, for the normal case. `evidence` is
accepted on exactly the 5 part tags, and the IDs are checked. The §9.2 union
is sorted, deduplicated, and shared with the relationships. The inspector puts
the excerpt first, and the browser test and screenshots confirm this at
900 px. `due` is text under the label, in the list, in the inspector, and in
the export, and it prompts when it has no `evidence`. Hashing and determinism
are not affected. The `order-intake` hashes match their bodies. There is one
major finding. The Evidence section that phase 3 moves to the top does not say
when a source is link-only, and §8.1 requires that it does (P1, a one-line
fix). The export uses `Evidence:` for titles in one place and IDs in another,
so part evidence cannot be traced by ID (P3). One test passes only on input
that the validator rejects (P4). The remaining findings are wording and
consistency problems: "cited" against `cite`, "this part is this code" for a
task, a missing syntax example, and an impossible date that the pattern
accepts. I recommend fixing P1, P3, and P4 before the phase is closed. P5 to
P9 can go in the same change. P10, P11, and S1 are optional.
