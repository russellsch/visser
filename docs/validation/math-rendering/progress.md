# Math implementation progress

Status: active; W1 integrated, W2/W4 foundations integrated, W3 graph/trace/measure geometry integrated; coverage closure and W5/W6 remain open. Implementation authorized by the user on 2026-10-05.
Goal: implement the [plan](../../plans/math-rendering.md) and satisfy C01–C08 with evidence.
Baseline: `2f6bc5c8f30363ab50392cb3bc736dfdc6808c66`. Existing unrelated untracked plans remain untouched.

## Current work and ownership

- Parent owns integration; all three review/implementation agents are idle at this checkpoint.
- W1 syntax/model, W2 engine/worker, W3 native geometry and most native text surfaces, and W4 runtime foundations are integrated.
- W5 has activated pie, timeline, flowchart/graph/ELK, sequence and state adapters with grammar extraction, layout, source binding and installed evidence. The remaining detector families and full applicability/shape coverage remain open.
- W6 guide examples and human acceptance checklist are prepared; complete COV traceability, final browser matrix/clean-machine checks and human acceptance remain open.

The root core dependency now pins markdown-it 12.3.2 for the proven public tokenizer adapter.
W0 parser gate passed. Other W0 gates remain open until the decisions and scope are recorded.
Human mathematical/visual/accessibility acceptance remains required later; no human gate has passed.

## Executed checks

- Host default Node is 25.9.0. Probes use `/opt/codex-desktop/resources/cua_node/bin/node`, version 24.21.0.
- Installed isolated MathJax 4.1.3 and mathjax-tex font 4.1.3 under the renderer spike, with lifecycle scripts disabled.
- Node conversion passed fractions, scripts, matrices, aligned equations, integrals, and blackboard bold.
- Unknown command, `href`, `def`, `newcommand`, and `unicode` were rejected by the base+AMS configuration.
- Unsupported Unicode can generate SVG text dependent on browser fonts. The production adapter must reject this output for deterministic native metrics.
- Playwright requires sandbox escalation on this host; the authorized offline benchmark ran with HTTP(S) requests blocked.
- The first MathJax bundle accidentally retained unused NewCM default-font data. A build alias removed it; the second benchmark is the current candidate.
- Browser conversion passed all 27 benchmark runs across MathJax, KaTeX, and pre-rendered SVG controls, with no attempted HTTP(S) requests.

## Current renderer evidence

Current raw MathJax browser bundle: 1,811,939 bytes. KaTeX JavaScript: 272,537 bytes; CSS with all WOFF2 fonts: 367,928 bytes.
Standalone data-URL encoding raises MathJax's fixed file cost to about 2.42 MB in this probe.
The sparse and 100-equation pre-rendered controls are smaller than either runtime option here.
This evidence does not support a claim that browser rendering always produces smaller files.
MathJax remains a candidate because it supplies deterministic SVG metrics usable by native graph layout.
Engine selection, initial resource policy and blob-worker cancellation route are recorded in [decisions.md](decisions.md).
Native geometry, full surface coverage, final budgets and Mermaid scope remain release gates.

## New gate evidence and sequencing

- Parser adapter matches AST shape for 19 positive and 139 negative fixtures with fence normalization.
- Existing syntax characterization/fixture regression suites passed 92 tests under Node 24.
- The first regression attempt was blocked by sandbox child-process permissions; an authorized escalated rerun passed.
- The resource probe proved a cancellable blob worker under `file://`; data-URL worker startup failed at the required bundle size.
- The geometry probe found and fixed MathJax's automatic multi-SVG inline splitting; `linebreaks.inline=false` now enforces one equation SVG.
- Native SVG probes preserve dimensions and ink containment for scripts, fractions, matrices, integrals, and aligned equations at 14px.
- Mermaid native math works only on some family fields. Pie and timeline need math-aware per-family layout adapters.
- A scope question about phasing unsupported Mermaid families is pending with the user. Full coverage remains the requirement until changed.
- Independent parser foundation work proceeds without enabling incomplete runtime behavior; the plan records this sequencing amendment.

Scripts: `spikes/math-rendering/probe.mjs` and `spikes/math-rendering/benchmark.mjs`.
Machine results/screenshots: `spikes/math-rendering/reports/` (generated, ignored by Git).
No final correctness baseline, complete offline release test, or feature completion is claimed.

## Integrated evidence (2026-10-05)

- W1 syntax/model/projection: 252 tests across ten selected suites passed; separate guarded replacement regression passed. Math byte spans, source-order equation registry, references, table projection, and nested ID retention are covered by these selected tests.
- Independent parser review found valid Markdoc whitespace bypass and quote/list prefix leakage in raw math; author fixes and regression tests are present, independent recheck pending.
- Selected engine, worker, compiler and browser-unit suites passed 33 tests. Later runtime changes passed 9 focused tests including normalized baseline and literal dollar/text-space rendering.
- `scripts/verify-math.mjs` exercised the installed-release CLI and relocated single HTML in Chromium 153 with network interception. All 14 corpus expressions plus a numbered equation rendered; source remained with JavaScript disabled; reference destination/number and print-source visibility checks passed. Screenshots, narrow-paper PDFs and JSON are in `reports/math/`. This is a smoke run, not all V01–V08 acceptance or a human-approved baseline.
- Independent worker protocol review found that a malformed successful-looking SVG reply could pass `check`. Shared structural validation is being added; the regression must pass before this finding is closed.
- Actual conditional browser math asset measured 1,839,749 raw bytes / 673,724 gzip bytes before the latest small fixes. Selected budget is 2 MiB raw / 768 KiB gzip, with the existing reader budgets unchanged. Updated budget suite has not yet run.
- No commit, push, publish, human acceptance, or final full-suite pass is claimed.

## Integrated checkpoint (2026-10-06)

- Independent W3 review found a cross-field delimiter join in measure values and a tall-math proxy callout overlap. Both corrected with focused regressions. Measure display/unit, inspector array fields and SVG axis strings preserve authored field boundaries.
- Graph/trace/measure mixed math now reserves geometry before drawing. Failed native rendering keeps the drawing hidden and its complete source list visible.
- Shared SVG validation rejects inconsistent geometry and finite extreme dimensions; mixed success/error IPC replies reject atomically. Focused validator suite: 8/8. Engine/shared policy tests and limits are recorded in decisions.md.
- Expanded installed-release smoke checks passed in Chromium 153 with HTTP(S) blocked for rendered, JavaScript-disabled and forced-worker-failure modes. Fourteen corpus expressions, a numbered equation and graph/trace/measure labels are included. Every distinct printed expression has a visible source occurrence; responsive duplicate cards may intentionally be hidden. Reports/screenshots/PDFs: reports/math/. Narrow print page 1 was visually inspected for readable source and margins; this is not human baseline acceptance.
- The browser copy-reference check selects rendered glyphs and asserts exact original TeX, prefix and suffix. It exposed duplicated equation context, fixed by normalizing the selected range before computing context. The corrected installed-release check passed.
- Budget suite passed: conditional math asset 1,841,828 bytes raw / 674,461 gzip, reader JS 20,679 gzip, CSS 16,800 gzip. No-math built pack excludes math.js. Timing option was not run.
- Full npm test ran 1,561 tests, initially 7 failures. Two catalogue guide word-count failures were reproduced at HEAD in a temporary git archive (architecture 711, trace 780; limit 600). The CLI review test was introduced by markdown-it's builtin punycode warning; release bundling now aliases pinned userland punycode. Three math-specific stale test expectations were corrected without weakening production validation; focused runtime/integration 16/16 pass. A no-math note projection spacing regression is being corrected. A clean full-suite rerun remains pending.
- Mermaid full coverage remains required. A label validator alone does not satisfy W5: source-located family grammar extraction and pre-layout adapters for plain-text renderer paths remain missing.
- COV ledger, final candidate-wide independent review, final release acceptance and human gates remain open. No commit or publication has occurred.

## Verified prose/native milestone checkpoint (2026-10-06)

Candidate toolkit: `15fdf56a6adcb539753e5f51b40127e4c792bb8fc98ace85ba3dfeb5c6c53be2`.
Math policy fingerprint: `cd88d0110e242e196e85093026a7d343d1c09fc72a4abc133a7d5d2b29cf4590`.
Source/corpus/standalone digests and browser version are in `reports/math/standalone.json`.

- Latest full `npm test`: **1,590 passed / 1,592 total**, exactly two baseline catalogue word-count failures. Full output and JUnit retained at `reports/math/full-suite.log` and `reports/math/full-suite-junit.xml` (focused runs may overwrite the root JUnit but not these copies).
- `scripts/verify-math.mjs`: all three modes pass with 61 initial math occurrences. No HTTP(S) attempts, no sibling file requests, no page errors or CSP violations. The test covers rich definition/citation tooltips, source inspector title, code immunity, no duplicate IDs, glyph selection with exact source/prefix/suffix, partial generated eqref exclusion, ArrowRight local scrolling, and wrapped unbroken print source. `reports/math/fixture.md` retains the input; standalone HTML, three screenshots, three PDFs and JSON retain output. Print pages 1 and 4 were inspected by the agent; human acceptance remains open.
- Final milestone asset budgets pass: math.js 1,841,828 raw / 674,461 gzip bytes; reader.js 22,115 gzip; CSS 16,800 gzip. Timing variant not run.
- Independent runtime findings corrected: live document budget rechecked before each insertion; conversion serialized per document; persistent roots receive a coalesced rescan with latest records after replacement. Fifteen runtime tests passed, followed by the standalone interaction run.
- Glossary/Terms first sentences now use AST-typed text/code/math runs rather than reparsing flattened source. Regressions cover code and escaped dollar text both with and without identical real expressions elsewhere. Typecheck and 86 focused tests passed before the final full run.
- `detail.summary` and `cite.note` preserve their existing unused/literal behavior; they no longer create math occurrences. Extension part fields with those names remain math-aware because they are displayed. Coverage notes record the applicability decision.
- Authoring guide snippets pass (60 cases). Math human-gate rows are prepared in `docs/validation/human-gates.md`; none is passed. Implementation findings are tracked in `docs/reviews/math-rendering-implementation.md`.

Next work: W5 grammar-aware Mermaid field extraction and pre-layout renderer adapters; replace the temporary fail-closed guard only for independently verified field paths. Full coverage remains the requirement while the earlier optional scope question is unanswered. Then finish per-field COV evidence/traceability, release/browser/clean-machine acceptance, candidate-wide independent reviews and required human gates. The goal remains active. No command or agent is running at this checkpoint; no commit or publication occurred.

## Verified pie integration checkpoint (2026-10-06)

Candidate toolkit: `28604ce2ef470cde5c61ee6fad998476b5737975a0a2798f863e5b750e337695`.
Math policy fingerprint remains `cd88d0110e242e196e85093026a7d343d1c09fc72a4abc133a7d5d2b29cf4590`.
Full-suite output/JUnit: `reports/math/pie-full-suite.log` and `reports/math/pie-full-suite-junit.xml`.

- Pie now has a grammar-aware source adapter using pinned parser AST/CST assignments. Original BOM/CRLF/Unicode byte spans and fence dedent are retained. All authored expressions are validated, including overwritten labels; effective labels are cross-checked against Mermaid's DB in the isolated parse worker.
- The browser Mermaid artifact is now built from pinned ESM with an exact-hash, exactly-once pie renderer patch. Plain pies use upstream draw. Math-bearing pies measure title/legend content, including descendant overhang from `rlap`/`smash`, before layout. Other families remain unfinished; [mermaid-coverage.md](mermaid-coverage.md) records all 37 detector IDs and the next adapter boundaries.
- Source extraction and runtime/layout received bounded independent Sol/Astra reviews. Four material findings were fixed and independently rechecked: unmeasured ink, plain-chart spacing changes, silently skipped patches, and escaped-dollar validation bypass. The remaining valid-but-escaped delimiter case fails closed; literal `$$` is required.
- Root verification: **188 focused tests passed**; **three Chromium tests passed**, including 30 pie renders across five legend positions and light/dark themes. Patch tests fail on missing/modified upstream chunks. Prose and Mermaid validation share occurrence/output budgets.
- Full `npm test`: **1,611 passed / 1,613 total**, only the same two baseline catalogue word-count failures (architecture 711, trace 780, limit 600). No new full-suite failure.
- `scripts/verify-math.mjs` passes on the installed release, including three visible pie formulas alongside the 61 existing initial math occurrences. Rendered, JavaScript-disabled, MathJax-worker-failure, and unavailable-MathML modes pass. No HTTP(S) attempts or sibling file requests. The print run exposed a hidden Mermaid source; math-bearing Mermaid figures now print wrapped source and the rerun passes. Human visual/print acceptance remains open.
- Budgets pass: math.js 1,841,828 raw / 674,461 gzip; reader.js 22,156 gzip; CSS 16,816 gzip. Mermaid.js is 5,289,510 raw / 1,511,008 gzip (reported, not gated). No-math packs omit math.js. Timing variant not run.
- Typecheck and `git diff --check` pass. No commit or publication. No agent or command is running at this checkpoint.

Next work remains W5: source adapters and pre-layout integration for all remaining applicable Mermaid families, plus source-owned selection/reference behavior for Mermaid math. Then complete COV field evidence/traceability, full browser/release/clean-machine acceptance, candidate-wide independent review, and human gates. Pie is a verified implementation slice, not completion of W5/W6 or the active goal.

## Verified pie reference checkpoint (2026-10-06, latest)

Candidate toolkit: `5c0e982a2c2066925ea84d49102dcb70a20f191e2cb054a3c8b9ff570afaaa97`.
The math policy fingerprint is unchanged. `reports/math/standalone.json` binds the current source, corpus and HTML to this candidate; `reports/math/pie-reference.yaml` retains the copied packet.

- Compiler source maps transform original byte spans through fence dedent, CRLF/BOM normalization, comment removal and visible bidi escaping. Active title/section keys preserve duplicate-label and overwritten-title semantics. Comment privacy and empty titles have regressions.
- Runtime binding checks formula identity/order, exact source spelling and figure ownership before storing private bindings. Source mutation and moved nodes invalidate selection mapping. A selected glyph maps to its whole authored formula; two formula endpoints in one label map to the corresponding contiguous source range. Mixed text or cross-label selections clear stale quotes and show source-selection guidance.
- Independent Sol testing found the cross-figure ownership bug; Astra review found inactive-field binding, outside endpoints crossing a drawing, and bidi-offset mismatch. All were corrected and independently rechecked. Findings and dispositions are in `docs/reviews/math-rendering-implementation.md`.
- Focused verification: 47 tests passed together, then the comment/compiler suite passed 7 tests including two new inactive-field cases (49 distinct focused cases). Typecheck and diff check pass. Three Chromium tests passed, including 30 pie renders; geometry and upstream no-math parity remain intact.
- Installed-release standalone checks pass all four modes. The rendered case verifies the exact doubled-backslash source, prefix/suffix and stale-quote clearing. `visser refs resolve` reports `exact` with `quoteFound: true` for the copied equation packet. There are no HTTP(S), sibling-file, CSP or page-error regressions in the recorded modes.
- The previous full suite remains the latest full-suite evidence (1,611 passed, two known baseline failures); it predates this selection slice. A final candidate-wide rerun remains part of W6.
- Current size/count budgets pass: reader.js 23,144 gzip bytes, CSS 16,816 gzip, math.js 1,841,828 raw / 674,461 gzip. Mermaid.js is 5,289,675 raw / 1,511,061 gzip (reported, not gated). Timing mode was not run. No command or agent remains running at this checkpoint.

Next: continue W5 family adapters from the ledger in `mermaid-coverage.md`, retaining the full 37-family applicability audit. Then complete COV/W6 release verification and human gates. The goal remains active. No commit or publication occurred.

## Timeline integration checkpoint (2026-10-06)

Candidate toolkit `d0ef9587d40df56d037fa551da09983ddb7b21ec119b11e5614e72e4b2898fa9` builds successfully. Timeline parser imports are literal and included in the standalone worker; installed CLI check/export succeeds from a temporary repository outside the workspace.

- Pinned Jison reductions retain original field spans and validate all authored math. Worker cross-checks effective labels against Mermaid's DB and charges repeated section task/event copies to the shared budget.
- Both LR and TD adapters premeasure visible labels. Plain diagrams retain original dispatch. The mutating task getter is called once and cached. Section-qualified occurrence keys map repeated drawings to their original source bytes.
- Focused tests: 23 passed across parser, worker integration, adapter, source-map and build guards; subsequent paint-order and timeline-artifact regressions passed with their suites (9 tests; 25 distinct cases across these runs). Typecheck passed before final test additions; final rerun underway.
- Installed-release offline smoke passes with four timeline MathML formulas alongside prior coverage, including JavaScript-disabled and worker-failure modes. Evidence: `reports/math/timeline-standalone.log` and current `reports/math/standalone.json`. Human visual/print acceptance remains open.
- Independent bounded review found connector paint-order interference; corrected and independently rechecked. Browser geometry tests are in progress in `/root/math_render_review` at this checkpoint. Full suite has not been rerun for this slice.

This checkpoint does not close W5/W6, field coverage or the active goal. Remaining family adapters and candidate-wide verification are still required. No commit or publication occurred.

Timeline checkpoint verification completed: final typecheck passes. Chromium test `mermaid-timeline.spec.ts` passed (1/1), covering five math cases plus untouched upstream plain parity: LR/TD with sections, LR/TD without sections, repeated sections, node/ink/viewBox containment, task/event separation, title clearance, connector paint order and no HTTP requests. Size/count budgets pass; Mermaid is 5,295,205 raw / 1,513,124 gzip bytes (reported, not gated), reader/CSS/math budgets unchanged; timing variant not run. Final diff check passed. No agent implementation work remains running for this slice.

## Flowchart foundations and requirement traceability (2026-10-06)

The preceding timeline turn made verified implementation progress. This turn adds the next flowchart foundation without declaring family coverage complete.

- Added immutable source provenance and mapped flowchart preprocessing. Copies, replacements, deleted islands and synthetic parser suffixes retain distinct original UTF-16 origins. Tests compare both parser-input stages against the actual pinned Mermaid API/parser; original BOM/CRLF/Unicode/dedent and comment/style transformations retain their locations.
- A bounded independent review found a call-argument overflow for a valid-size many-line fence. Iterable concatenation fixes it; the exact 64,000-blank-line regression passes and the reviewer independently closed the finding.
- Focused provenance/preprocessing tests: 15/15 pass, retained in `reports/math/flowchart-provenance-junit.xml`. Final typecheck and diff check pass. These helpers are prepared for the flowchart collector, not yet wired into worker extraction; its math guard remains in place. YAML scalar decoding, effective-label cross-checks, renderer normalization and layout integration are still required.
- Added M01–M15 to `tests/traceability.json`, all marked partial with explicit remaining obligations. Existing test names now carry the applicable requirement tags. The changed tagged suites pass 61 tests; engine/security/installed-release suites pass another 42.
- Added a dedicated Chromium M04 regression using compiler-produced display markup and the real runtime/CSS. At 320px, long math scrolls with ArrowRight without overflowing the page; source remains exact and rendered width is unchanged at 1024px. Test passes (1/1). Full browser matrix and human readability acceptance remain open.
- Full suite refreshed after timeline integration and requirement tagging: 1,645 passed / 1,647 total. Only the previously reproduced catalogue word-count failures remain (architecture 711, trace 780, both limit 600). Log: `reports/math/traceability-full-suite.log`. This full run predates the new flowchart foundation tests; the latter have separate focused evidence. Do not treat the current global JUnit file, overwritten by focused runs, as the retained full-suite report.
- Flowchart parser/renderer inventories are recorded in `mermaid-coverage.md` and `spikes/math-mermaid/flowchart-render-probe.md`; the probe confirms native HTML-label math and the separate SVG-text fallback path. No commit or publication occurred.

Next: integrate grammar-owned flowchart labels (including YAML scalar provenance, overwritten values and multi-edge copies), then connect measured math labels to every applicable prelayout node/edge/cluster path and source references. Remaining families, COV closure, W6 candidate-wide checks and human gates are still open. The full goal remains active. No command or agent remains running at this checkpoint.

## Flowchart grammar, YAML and native ink checkpoint (2026-10-06)

Candidate `4da98d7e93870ebd149399e172b5f1499108ee4c98487a61beaa6a41705b992b` passed 265 Mermaid unit tests, eight Chromium tests (display scrolling, five native-ink tests, pie and timeline), and installed standalone checks in all existing modes. Retained logs are `reports/math/flowchart-foundations-{build,unit,browser,standalone}.log`, with unit/browser JUnit files alongside them. This candidate predates the subsequent decoded-property and metadata-composition fixes below; it is not final-candidate evidence.

- Grammar-owned flowchart records now retain actual assignment order, edge fanout, overwritten labels, accessibility fields and metadata token provenance. Typed YAML label selection follows upstream semantics, including selecting only the first array item.
- A hash-pinned instrumented copy of Mermaid's YAML decoder retains scalar origins through escapes, folds, aliases and mapping selection. Build regeneration and license handling are explicit. Exact UTF-8 conversion rejects split Unicode scalars and preserves disjoint origins.
- The composed validator applies shared-renderer slash/break normalization, validates authored expressions and reserves fanout copies. It is not yet connected to effective DB checks or compiler/runtime source bindings.
- A pinned shared text-renderer patch reserves native MathML ink before layout. Browser checks include overhang, scaling, node and cluster containment, multiline labels, edge clearance and plain-label parity. This does not establish coverage of every flowchart shape or renderer path.
- Independent review found and closed native-source import failure, quadratic scalar provenance expansion, decoded prohibited metadata keys, and quadratic metadata token concatenation. The last two fixes passed 34 focused tests across collector, decoder, composed validation and installed-worker guard suites. An initially invalid alias test was corrected to valid YAML; no production behavior was weakened.

Flowchart export remains guarded. Effective DB reconciliation, structured diagnostics, source-owned browser bindings and complete geometry coverage remain required before activation. All remaining Mermaid families, COV closure, W6 final-candidate checks and human acceptance gates remain open. The goal stays active; no commit or publication occurred. Follow-up DB analysis and structured diagnostic work are running at this checkpoint.

Reviewed-fix verification: toolkit `9094e92f2b4c166949548505de1029e23d2eb780953380082ec4437fbdc48f8a` passes all 272 Mermaid unit tests across 22 files (`reports/math/flowchart-reviewed-unit.log` and `flowchart-reviewed-unit-junit.xml`), installed standalone checks (`flowchart-reviewed-standalone.log`), and size/count budgets (`flowchart-reviewed-budgets.log`). Mermaid.js is 5,299,318 raw / 1,515,064 gzip bytes; this asset is reported, not gated. Timing mode was not run. The initial quoted-glob test invocation matched no files; the reported passing run used the expanded file list. The sandboxed budget invocation could not launch export; the authorized subprocess-capable rerun passed. The eight Chromium geometry tests above predate these parser-only fixes. Diff check passes. Structured diagnostic work is still separate and not covered by this candidate evidence.

Structured diagnostic follow-up: `LocatedFlowchartMathError` now retains immutable original intervals, a synthetic-origin flag, and primary line/byte coordinates. Locations identify the complete mapped field; they do not invent an expression offset from an error message. Metadata policy failures, expression policy failures and edge fanout limits are covered. The owning worker ran seven focused tests, typecheck and diff check successfully. Independent review is pending at this checkpoint. These helper-only changes are not wired into export yet.

Read-only effective-DB review identified four further activation obligations (recorded in `mermaid-coverage.md`): accessibility indentation normalization, explicit rejection of final non-string metadata selections, duplicate subgraph identity, and visible-slot derivation after collapse. Browser entity decoding/sanitization must also agree with validated formula inputs. Next implementation should close these cases and integrate worker reconciliation before enabling flowchart source bindings. Full feature completion remains unclaimed.

Diagnostic review completed with no material finding; independent probes confirmed folded-YAML disjoint intervals and alias-definition coordinates. No agent or command remains running at this checkpoint. The active goal continues with the effective-DB obligations above. No commit, push or publication occurred.

## Flowchart effective-DB integration (2026-10-06)

The previous turn made verified progress. This turn adds actual worker reconciliation and closes the accessibility/typed-label/visible-slot mismatches identified at the last checkpoint.

- `flowchart-db.ts` compares effective node labels/types, edge fanout identities/endpoints, ordered subgraph labels and accessibility values against Mermaid's DB. Visible label slots come from its layout data after collapse. Duplicate subgraph identities fail for math-bearing diagrams.
- Worker collection precedes reconstruction of the actual DB because a fresh collector clears shared accessibility state. Structured field diagnostics cross the worker boundary. Parsed math still reaches the temporary export guard until layout/source binding is complete.
- Plain compatibility is retained: math-only identity checks do not reject plain duplicate subgraphs; ignored explicit/style statements on existing edges do not invent vertices. Authored ignored strings remain validated.
- The integrated run passed 312 tests across 26 Mermaid/compiler/runtime/server suites before the last compatibility additions. The reviewed explicit/style-edge fixes pass 18 collector/DB tests, and an earlier four-suite composed/guard run passed 39 tests. Logs: `reports/math/flowchart-db-integrated.log`, `flowchart-db-fixes.log`, `flowchart-db-compatibility.log`. Final combined rerun remains pending after browser attestation work.
- Installed standalone verification passed after worker integration (`flowchart-db-standalone.log`); the final browser-attestation build will require its own evidence. Native TeX attestation is now being added to the pinned shared-text hook. Full flowchart activation and all later completion gates remain open.

Final verification for this slice: toolkit `a473f10416525fb9329186ce8800d6400a37ca3d8d218db52b6209427b4fba15` passes installed standalone checks in all recorded modes (`flowchart-db-final-standalone.log`), typecheck, diff check and size/count budgets (`flowchart-db-final-budgets.log`). Mermaid.js is 5,300,301 raw / 1,515,362 gzip bytes (reported, not gated). Timing mode was not run. The full suite reports **1,762 passed / 1,764 total**: only the two previously reproduced catalogue word-count failures remain (architecture 711, trace 780, limit 600). Full output and JUnit are retained as `flowchart-db-full-suite.log` and `flowchart-db-full-suite-junit.xml` under `reports/math/`.

The native-ink browser suite passed **12/12** across Chromium 320px and 1440px. Independent review closed the worker compatibility findings and found no material issue in the DB reconciler or native TeX attestation. The instrumented YAML decoder is now bundled in the installed parse worker, with its MIT notice verified in the generated LICENSES.txt.

Next implementation: serialize reconciled flowchart records/visible slots through the model, stamp unique node/edge/cluster label ownership after native render, and bind attested formulas to mapped source. Extend source mapping for encoded and disjoint YAML origins without claiming a contiguous source selection when none exists. The existing pie/timeline binder currently requires literal `$$` boundaries and one physical source line; that constraint must be handled explicitly for flowchart metadata. Keep export guarded until these paths and all required shape/layout cases pass. Remaining Mermaid-family audit/adapters, COV/W6 closure and human gates remain open. No agent or command remains running. No commit, push or publication occurred; the goal remains active.

## Flowchart source-bound export checkpoint (2026-10-06)

The preceding turn made verified implementation progress. Normal `flowchart` and `graph` math now pass through the worker/model/compiler/runtime instead of the temporary family guard. `flowchart-elk` remains explicitly guarded, including YAML-encoded delimiters; the broader Mermaid requirement is unchanged.

- Serialized records retain exact original origins, effective labels and resource counts. Visible slots come from renderer reconciliation; plain flowcharts retain prior acceptance. The original fenced-body decoder now preserves BOM bytes.
- `flowchart-source-map.ts` maps verified UTF-8 provenance into displayed comment-free code, including CRLF, dedent and visible bidi spelling. Exact encoded spans preserve authored escape spelling. Disjoint, synthetic or nonmonotonic origins stay rendered but require source selection; no contiguous quote is invented.
- Native node/edge/cluster owners are resolved by renderer identity and direct label structure, never equal text. All ownership checks complete before stamping. The binder verifies actual attested TeX and formula counts, accepts encoded spans only under the flowchart map contract, and clears stale bindings on rebind. Selections crossing an unrepresentable formula fail safely even when their endpoints are individually representable.
- Collapsed groups carry exact hidden target keys from the same layout snapshot. This fixes narrow-screen viewer readiness without ignoring unexpected missing targets. Independent review closed this issue and the encoded-ELK activation bypass; no material finding remains in the bounded source/ownership review.
- Installed single-file verification renders expanded and collapsed flowcharts offline, verifies exact YAML-encoded quote copying and `refs resolve` (`exact`, `quoteFound: true`), and checks JavaScript-disabled, worker-failure and unavailable-MathML modes. An encoded-only figure proves fallback detection does not depend on raw dollar substrings. The authoring guide documents implemented behavior and remaining families.

Final toolkit: `182d264bfe5aa6b3375a3a06b8d6d0a4e289f46c70e3c49aac7583b5759e9144`.

Evidence:

- Full suite: **1,773 passed / 1,775 total**; only the previously reproduced catalogue word-count failures remain (architecture 711, trace 780, limit 600). Retained output/JUnit: `reports/math/flowchart-binding-full-suite.log` and `flowchart-binding-full-suite-junit.xml`. This run predates the final guide wording; the guide and final focused paths subsequently pass 92 tests (`flowchart-binding-final-unit.log` / `flowchart-binding-final-unit-junit.xml`).
- Combined Mermaid/source-binding suites: 319 tests across 26 files (`flowchart-binding-integrated.log` / `flowchart-binding-integrated-junit.xml`). Native flowchart ownership browser suite: eight tests across Chromium 320px/1440px, including fanout, expanded/collapsed groups and atomic failures.
- Installed final standalone checks pass (`flowchart-binding-final-standalone.log`, `standalone.json`, `flowchart-reference.yaml`). The initial collapsed visibility failure is retained in the task history; it was diagnosed on the actual narrow exported page and the rerun passed.
- Typecheck and diff check pass. Size/count budgets pass (`flowchart-binding-budgets.log`): reader.js 23,925 gzip, CSS 16,816 gzip, Mermaid.js 5,300,301 raw / 1,515,362 gzip (reported, not gated). Timing mode was not run.

Next: finish the flowchart shape/layout coverage inventory and ELK path, then continue remaining family adapters from the 37-detector ledger. Complete COV/W6 candidate-wide validation and human gates afterward. This checkpoint enables verified normal-flowchart functionality; it does not close W5/W6 or C01–C08. No agent or command remains running. No commit, push or publication occurred. The goal remains active.

## ELK and shape applicability checkpoint (2026-10-06)

`flowchart-elk` now uses the validated flowchart extraction, DB reconciliation, ink reservation and source binding path. Literal and YAML-encoded-only math pass worker integration. The pinned ELK dynamic loader is bundled into the single browser artifact. Eight browser tests pass across LR/TD, expanded/collapsed groups and Chromium 320/1440; they check actual ELK configuration, formula ownership, ink containment and no HTTP requests (`reports/math/elk-browser.log`).

The shape inventory covers 53 canonical names and six admissible lowercase undocumented names. Fifty text-bearing shapes pass strict math attestation, source ownership and geometry checks across both orientations and viewports; nine intentionally label-less shapes are asserted to omit native text/math. A classifier omits their visible label slots while retaining authored validation, budgets and node references. A pinned shape-artifact hash and full no-label-handler alias contract guard upgrades. The `icon` shape now resolves its distinct native group class using the same exact ID and unique direct-label requirements. See `flowchart-shapes.md` for scope and remaining presentation limits. Independent review found no remaining material defect in these bounded changes.

Checks at this checkpoint:

- Focused DB/build/guard suites: 21 passed (`elk-shapes-unit.log`); combined Mermaid/source/format-guide suites: 369 passed across 26 files (`elk-shapes-integrated.log`, `elk-shapes-integrated-junit.xml`).
- Shape browser matrix: 6 passed, covering 200 text-bearing shape/orientation/viewport combinations plus nine no-label handlers. Retained reports: `flowchart-shapes-browser.json` and `flowchart-shapes-browser-junit.xml`; browser candidate `d221112e28b5603c78aa944659b53e0a7673b86549af051987306a5a940a2194`.
- Final installed standalone checks pass, including a mixed fork/math flowchart, collapsed ELK, encoded-only ELK, offline relocation, JavaScript-disabled and unavailable-MathML cases (`elk-shapes-final-standalone.log`, `standalone.json`). Final rebuilt toolkit: `9713baf7ff8491537a258f88f3abe3642023ed77e16634b4d85b2278352a32d0`. The final rebuild incorporates the updated format guide.
- Typecheck passes (`elk-shapes-typecheck.log`). No candidate-wide full-suite or human acceptance claim is made here; the prior two catalogue word-count failures remain unresolved.

Continue with remaining Mermaid family adapters, beginning with the sequence evidence in `mermaid-coverage.md`, then close candidate-wide W6/C01–C08 requirements. The full 37-detector obligation, remaining shape applicability/presentation decisions, and human gates remain open. No commit, push or publication occurred. The goal remains active.

Size/count budgets pass (`reports/math/elk-shapes-budgets.log`): reader 23,936 gzip bytes, CSS 16,816, math JS 674,461, and reported Mermaid JS 1,515,362. Timing mode was not run. The initial sandboxed export could not start its required subprocess; the approved rerun passed. Diff check passes. No agent or command remains running at this checkpoint.

## Sequence foundation in progress (2026-10-06)

The previous goal turn made verified implementation progress on ELK/shape integration. This turn advances sequence support without activating an incomplete renderer. A standards-mode, network-denied Chromium probe covers 24 native role/expression cases and confirms geometry defects plus literal-only box/title output; results and the independent adapter design are in `sequence-geometry.md` and `reports/math/sequence-native-geometry.jsonl`.

A per-draw label preparation primitive now measures under the attached diagram CSS, snapshots input before asynchronous work, keeps measured DOM private and assigns explicit copy identities. Independent review found no material issue. Browser checks pass at 320/1440 (`sequence-label-browser.log`, matching JSON/JUnit); typecheck passes (`sequence-foundation-typecheck.log`). The initial test-only quirks-mode error was corrected by using a standards-mode fixture. The native probe was rerun in standards mode and retained the same defect counts.

The helper source SHA-256 is `118709340ad2dd1ca5314ccf2f4cbe772844759e445a5020f1e88108c323b81e`; its browser test is `2a5934e8379b3b330c0b6baaaa8ffd4eb589a626143d27b500300f341051117f`; the probe is `41a9a3499796b863edd7aa28a039f4099e09c265d35df820fb0e672e136b6abc`. These are helper-only additions, not a new accepted release candidate.

At this interim checkpoint the syntax agent is finishing `sequence-labels.ts` and its tests, while the independent reviewer inspects its parser/DB/provenance contract. Metadata decoding, effective-DB reconciliation, source maps, role/lifecycle copy accounting and actual sequence layout remain required. The export guard stays active. Full W5/W6 and C01–C08 remain open; no commit or publication occurred.

The final helper browser rerun additionally contains a 10em tall rule and passes both viewport projects. Parser collector implementation and independent review remain live at this checkpoint; no renderer activation is implied.

## Sequence parsing and validation checkpoint (2026-10-06)

The prior turn made verified progress with source-collector implementation and measured-label browser evidence. This turn completed and independently reviewed the ordinary sequence collector, composed its output with LaTeX policy/source-coordinate validation, and added a separately reviewed participant YAML alias decoder. The collector preserves overwritten records, trimmed/wrap-prefixed fields and original byte spans; the composed validator does not collapse sequence backslashes. Invalid or over-budget expressions report the authored field location. The decoder preserves typed truthy values without flowchart's array-first coercion. It is not yet connected to collector metadata reductions.

Review found and closed a multiline accessibility normalization mismatch. Actual browser DB comparisons additionally found and closed the `Canvas` box-color/title-boundary defect. The final combined browser suite covers all 42 standard/legacy system colors, repeated actor assignments, branches, ordinary/color boxes and root accessibility/title fields, plus measured-label font/overhang/tall/copy checks.

Verification: 24 unit tests pass across the collector, composed validator and metadata decoder (`reports/math/sequence-foundation-unit.log` and matching JUnit). Ten combined Chromium tests pass at 320/1440 (`sequence-foundation-browser.log`, JSON and JUnit). Typecheck passes (`sequence-final-typecheck.log`), as does diff check. Exact helper/test hashes are retained in `reports/math/sequence-foundation-snapshot.json`. No complete sequence export, full-suite, release-candidate or human acceptance claim is made.

Next integrate participant metadata with declaration precedence and validation of overwritten aliases, reconcile effective DB fields/copies, and wire source maps and the sequence renderer geometry adapter. Properties/details still require their own applicability/field handling. Sequence export remains guarded. W5/W6, the full Mermaid family ledger and final human gates remain open. No agent or command remains running at this checkpoint. No commit, push or publication occurred; the goal remains active.

## Sequence metadata and logical DB integration checkpoint (2026-10-06)

The preceding goal turn made verified progress on sequence foundations. YAML participant aliases are now integrated with pinned declaration precedence, including explicit descriptions equal to actor IDs, suppressed/overwritten aliases, encoded delimiters, YAML anchors and typed supersession. Every authored string alias remains available to the composed validator. Final unsupported typed aliases produce immutable source-located diagnostics; cyclic values cannot trigger unbounded serialization.

New `sequence-db.ts` reconciles semantic actor/box/message/title slots before renderer mutation. It checks effective label strings, actor type/wrap/box identity, box wrap/fill, message indices/IDs/endpoints/type/placement/wrap/activation/connection fields, duplicate/missing owners and root fields. These logical slots do not yet imply visible copies. Independent reviews found and closed missing typed-error locations and unchecked box wrapping; subsequent cyclic-alias review found no remaining material issue.

Final checks: 32 unit tests pass across collector, metadata decoder and composed validator (`reports/math/sequence-reconcile-final-unit.log`, matching JUnit). Twelve Chromium tests pass at 320/1440 for actual browser DB reconciliation, metadata precedence, mutation rejection and measured-label geometry (`sequence-reconcile-final-browser.log`, JSON and JUnit). Typecheck and diff check pass (`sequence-reconcile-final-typecheck.log`). Helper/test SHA-256 values are retained in `sequence-reconcile-snapshot.json`. No new release-wide acceptance claim is made: the sequence worker/export guard is still active.

Next build the render-copy plan and resource accounting using actual filtered actor runs (one box may produce multiple copies), then implement source maps and the sequence layout adapter. Native properties/details require field handling. Remaining Mermaid families, W5/W6 and human gates remain open. No agent or command remains running; no commit, push or publication occurred. The full goal remains active.

## Sequence copy budget and source-map checkpoint (2026-10-06)

The prior goal turn completed verified metadata and logical-DB integration. The new render-copy planner accounts for actor headers/optional footers, unused-participant filtering, lifecycle message indices, repeated box runs, empty boxes and empty effective titles. It reserves only additional rendered copies beyond the already charged authored occurrences; hidden and overwritten source remains charged. Visible unsupported actor types fail explicitly after independent review exposed the absent native draw path.

Sequence source maps now assign distinct copy keys while preserving each semantic owner's original byte-backed LaTeX spelling. Encoded YAML keeps its exact escapes; disjoint folded origins remain unrepresentable for direct glyph copying. The previously reviewed flowchart display-mapping code is shared without changing its owner checks. Runtime source binding now accepts the sequence format under the same encoded/unrepresentable and atomic-validation rules. Sequence worker/export activation is still pending.

Final combined tests pass: 72 tests across seven collector/metadata/math/copy/source/flowchart/runtime suites (`reports/math/sequence-copy-source-final-unit.log`, matching JUnit). Typecheck and diff check pass (`sequence-copy-source-final-typecheck.log`). Installed single-file offline and failure-mode checks pass after the shared production refactor (`sequence-source-standalone.log`, toolkit `134bda852670f18a47dcdc00ac532a50088d6a5d07f0058a18e24f3f789b1f7f`). The later actor-type gate affects only the unactivated sequence helper; its tests are included in the final 72. Exact source/test hashes are in `sequence-copy-source-snapshot.json`.

Next implement the sequence renderer's measured layout/drawing adapter and native source-copy attestations, then integrate the isolated worker/model/compiler/runtime path and installed sequence fixtures. Properties/details field handling and the rest of the Mermaid family ledger remain required. W5/W6 and final human gates remain open. No agent or command remains running; no commit, push or publication occurred. The full goal remains active.

## Sequence actor rendering checkpoint (2026-10-06)

The previous turn completed copy budgeting and source maps. This turn implements an actual actor layout/drawing slice in the pinned sequence renderer. All eight actor types use attached-SVG measurements and synchronous prepared-DOM drawing, preserving complete header/footer copies. Math actor dimensions reserve tall and overhanging expressions before native layout; wrapping keeps each formula intact. DB actor-object bindings prevent text-based ownership inference and are released on failed renders. Plain sequence geometry remains equivalent to the unpatched renderer.

Independent review found no material issue in the bounded actor adapter. Separate review exposed a shared-label wrapping defect: an overhanging formula could overlap subsequent prose even when the whole label fit its foreignObject. Per-formula ink reservation now precedes prose layout, including the existing unwrapped path. Independent Chromium probes of right/left overhang and tall smashed formulas closed this finding. Hidden unsupported actor types now match the copy planner: hidden unused actors have no copies; visible unsupported types reject.

Checks on this checkpoint: 12 sequence/preparation browser tests pass at 320/1440 (`reports/math/sequence-actor-render-browser.log`); 14 shared-label browser tests pass (`sequence-actor-label-ink.json`); four pie/timeline consumer browser tests pass (`sequence-actor-consumers.json`). Six build fingerprint unit tests pass (`sequence-actor-build-unit.log`). Typecheck, fresh release build and diff check pass. Installed offline single-file math export, JavaScript-disabled, MathML-unavailable and worker-failure checks pass (`sequence-actor-standalone.log`, `sequence-actor-standalone.json`). Exact implementation/test hashes are in `sequence-actor-snapshot.json`. These focused checks do not constitute a full-suite or accepted release-candidate run.

Next implement measured layout and drawing for messages/self-messages, notes, loop/branch headers, boxes and title; then integrate the existing source maps, copy budgets and DB reconciliation through worker/model/compiler/runtime activation. Properties/details field handling and the remaining Mermaid detector families remain required. Sequence export stays guarded; W5/W6 and C01–C08 remain open. No commit, push or publication occurred. The goal remains active.

## Sequence note/message rendering checkpoint (2026-10-06)

The prior turn made verified progress on actor drawing and formula footprints. This turn adds measured notes and arrow messages while retaining native arrow routing. Notes cover left/right/single/spanning placements with padding and vertical bounds based on measured DOM. Messages carry original DB identity into derived models, finalize atomic-wrap variants after actor spacing, reserve an explicit gap above arrows and self-arrow extents, and reserve bounds again after lifecycle endpoint changes. Math errors escape native error swallowing. Copy completion and cleanup reject omissions and remove partial math on failed draws.

Independent note review included offline probes of nested/repeated notes and found no material issue. Independent message source/patch review found no material issue. Root browser matrices verify common arrow spellings, forward/reverse/self directions, wrapping, tall/overhanging math, native plain parity, activation, create/destroy, autonumber, plain loop containers and classic/neo/right-angle interactions. A failure-injection test verifies rollback and subsequent reuse after partial or omitted message copies.

Final focused evidence: 20 Chromium tests pass at 320/1440 (`reports/math/sequence-message-note-browser.log`); 26 unit checks pass across build fingerprints, copy plans and source maps (`sequence-message-note-unit.log`, matching JUnit). Typecheck, fresh release build, diff check and installed offline single-file/fallback verification pass. Commands/config, exact source hashes and evidence references are retained in `sequence-message-note-snapshot.json` and `sequence-message-note-browser.config.mts`; standalone results are archived as `sequence-message-note-standalone.json`. This is not a full-suite or accepted release-candidate run.

Next implement math in loop/branch headers, box titles and diagram titles; audit the newer top/bottom/reversed/central-connection arrow spellings; and integrate worker/model/compiler/source binding and existing copy budgets. Properties/details applicability and the remaining detector families remain required. Sequence export remains guarded. W5/W6 and C01–C08 remain open. All work in this checkpoint is local; no commit, push or publication occurred, and the goal remains active.

## Sequence loop, box and title rendering checkpoint (2026-10-06)

The measured renderer now covers loop/branch headers, box titles and diagram titles. Original message identities own loop and branch labels; measured bounds include empty and nested frames. Box copies follow filtered actor runs and snapshot each native run's geometry. Diagram titles expand both viewBox dimensions instead of relying on native fixed-height allowance. The browser matrix now enumerates all 26 native arrow spellings, including central connections and self/reversed directions.

Independent box/title review found no material issue. Independent loop review found that actorless empty math loops lacked native actor bounds. A deterministic initial frame around measured ink now handles that case; independent recheck of empty, nested and overhanging actorless loops closed the finding. Plain geometry and failed-render cleanup remain covered.

Focused checks pass: 36 Chromium tests at 320/1440, 26 unit tests, typecheck, fresh release build, diff check and installed single-file offline/fallback verification. Evidence and exact file hashes are in `reports/math/sequence-title-loop-snapshot.json`; the installed smoke checks currently activated families, not guarded sequence export. This is not a full-suite or release-candidate acceptance run.

Sequence worker/model/compiler/source binding and resource integration remain required before lifting the export guard. Properties have no text labels; decoded icon/class/non-label content needs validation. Details obtains external DOM content and must not bypass fenced-source provenance or existing link restrictions. Remaining detector families and human gates remain open. The full goal is active; no commit, push or publication occurred.

### Activation audit follow-up

Independent pipeline inspection found a contract mismatch: copy planning includes ordinary labels, but only math labels have measured DOM ownership markers. `sequenceMathSourceMap` now validates every planned owner/copy and emits binding rows only for math-bearing copies. A mixed plain-title/box/actors/messages regression passes, as do existing runtime binding checks (18 tests across two suites; `reports/math/sequence-binding-unit.log`). Independent review found the correction sound.

The same audit reproduced a worker blocker: native `parseBoxData` references `window.CSS`/`Option`, unavailable in the isolated Node worker. A plain sequence box fails with `window is not defined`; a no-box diagram succeeds. Activation needs a controlled pinned box-parser compatibility path, checked against real browser color/title semantics. The already tested collector color classifier is a candidate for extraction/reuse; no worker shim has been installed yet.

Next wire sequence extraction before actual DB reconstruction, explicit effective copy flags (native defaults mirrorActors=true, hideUnusedParticipants=false), located errors, model transport, body offsets, authored-plus-extra-copy resources, compiler source maps and installed fixtures. Keep the guard until this complete path passes. Properties/details remains a separate policy/provenance task; the audit below records the sanitizer hazard so it is not lost.

## Sequence compiler and installed-export checkpoint (2026-10-06)

The prior turn made progress by correcting mixed plain/math source maps and identifying the Node box-parser dependency. Sequence math now travels through worker extraction/reconciliation/copy planning, figure models, original body offsets, resource aggregation and compiler source maps. A shared fixed configuration explicitly matches mirrored actors and unused-participant visibility in worker and browser. Resource totals retain all authored occurrences and add only extra rendered copies. Located errors survive worker transport. The public raw-`$$` sequence guard remains; encoded YAML actor formulas now exercise the actual integrated path.

The worker uses a wrapped pinned diagram DB getter to replace its browser-dependent color query with a shared restricted-profile box classifier. It installs no browser globals. Real-browser comparison covers named/system colors, legacy RGB variants, invalid CSS treated as title text and wrap directives. Independent review found that color parity did not establish title-sanitizer parity: native HTML parsing can normalize breaks and decode entities. Temporary explicit gates now reject `<` in box titles and diagram/accessibility setters before the identity worker sanitizer can mask browser changes. Independent probes confirmed overwritten and multiline accessibility values cannot bypass the gate; ordinary multiline text still works. These are temporary incomplete-feature gates, not the final supported syntax.

The installed standalone fixture now includes an encoded sequence actor formula, ordinary actors/messages and a plain colored box. Both mirrored formula copies render offline and produce exact original encoded-source reference packets that resolve against the document. JavaScript-disabled, worker-failure, MathML-unavailable and print-source checks pass. The initial verifier failure was an incorrect expectation that the static hidden notice element did not exist; checking visibility fixed the assertion without changing rendering.

Evidence: 12 box/DB browser checks, 67 focused unit checks, and 367 Mermaid regression checks pass. Typecheck, fresh build, installed standalone verification and diff check pass. `reports/math/sequence-pipeline-snapshot.json` records exact files and evidence; `sequence-pipeline-standalone.json` archives the installed result. Independent transport review found no remaining material issue within the temporary profile. The implementation agent became unavailable after writing its files; root inspected the files, completed tests and integrated the corrections.

Next implement source-mapped native HTML normalization for box/title/accessibility fields and finish participant properties/details classification. Then remove the raw sequence guard and test all roles through installed export. Do not treat encoded-actor success as full sequence completion. Remaining Mermaid families, W5/W6 and human gates remain open. No commit, push or publication occurred. No job remains running at this checkpoint; the full goal remains active.

## Sequence native sanitizer checkpoint (2026-10-06)

The worker and source collector now use pinned DOMPurify with a private JSDOM instance for box, diagram-title and accessibility normalization. Browser globals are not installed; scripts, resource loading and network APIs are disabled. The relocatable worker bundle embeds the required stylesheet and disables the unused synchronous XHR worker using fingerprinted build substitutions. Direct pinned dependencies and license generation are integrated. Temporary `<` rejection gates are removed.

Provenance tracing covers text, character references and line breaks, attested against the real sanitizer output on each pass. Complex HTML remains governed by native sanitization but receives synthetic provenance instead of invented source spans. Original field intervals still locate math errors, including overwritten assignments. Independent helper, packaging and pipeline reviews found no remaining material issue within this bounded normalization contract. A separate follow-up is investigating semantic LaTeX comparisons after HTML serialization; native-output parity alone does not close that requirement.

Checks pass: 40 focused unit checks, 375 Mermaid regression checks, 16 Chromium checks at 320/1440, typecheck, release build, installed offline/fallback verification and asset budgets. The browser sanitizer matrix compares 22 native DB inputs at each viewport; DB-only cases are not all valid fenced grammar. Installed verification includes sanitized title/accessibility fields and mirrored encoded actor formulas. Budget timing mode was not run. Exact source hashes and evidence are archived in `reports/math/sequence-sanitize-snapshot.json`. These checks do not establish full-suite or release-candidate acceptance.

Raw sequence equations remain guarded pending properties/details classification, semantic text validation and installed all-role coverage. Remaining detector families, W5/W6 and C01–C08 remain open. No commit, push or publication occurred; the full goal remains active.

## Sequence LaTeX comparison correction (2026-10-06)

Independent probing confirmed a sanitizer/rendering mismatch: native HTML serialization changed `$$x < y$$` into `$$x &lt; y$$`, which KaTeX rejected. A shared adapter transform now reverses one layer of the four HTML text-serialization entities (`amp`, `lt`, `gt`, `nbsp`) inside existing equations in title, box and accessibility fields. It preserves DB strings for reconciliation, leaves surrounding prose unchanged, never discovers delimiters through entity decoding and applies the existing full math policy afterward. The four entities receive this meaning inside equations even when native sanitization takes its no-HTML fast path.

Literal comparison signs now retain exact source provenance through the attested sanitizer trace. Core validation and initial/repeated runtime title/box measurement use the same transformation. Independent review found quadratic copying with repeated entities; assembling original-offset chunks once fixed it. Independent timing dropped 6,000 references from approximately 2.38 seconds to 13 ms, with 16,000 references around 24 ms. Those timings are diagnostic evidence, not a new product performance budget. The reviewer confirmed exact entity provenance and no further finding.

Final checks: 379 Mermaid regression tests, two Chromium title-matrix tests at 320/1440 (four formulas, both wrap settings and two box margins per test), typecheck, release build, installed standalone/fallback checks and diff check pass. The installed smoke remains the encoded-actor fixture; it is not all-role sequence acceptance. Exact files and reports are in `reports/math/sequence-text-snapshot.json`. No jobs remain running at this checkpoint.

Next: properties/details classification and source-located diagnostics before raw sequence activation; then installed all-role coverage. Properties must inspect the actual sanitizer output and every decoded JSON string, including overwritten keys/values. A read-only investigation proposed an inert-data subset, but that proposal is not an accepted compatibility policy: class assignment restrictions must be justified against the existing profile rather than silently narrowing supported syntax. Details reads external DOM and can merge links, so must remain excluded without a source-backed authorized mechanism. Remaining families and completion gates stay open; the full goal remains active.

## Sequence participant properties and class boundary (2026-10-06)

The prior turn made verified progress on sanitizer/math serialization. This turn replaces the temporary properties/details rejection with native property semantics and explicit security diagnostics. Properties retain sanitizer-before-JSON parsing, duplicate precedence, enumerable shallow merges, primitive/array behavior and malformed-JSON no-op. Properties are machine data, not label fields: inert `$$` strings are neither parsed as equations nor counted as math. This corrects earlier proposed all-string math validation; it follows the plan's machine-data exclusion rather than narrowing label coverage.

Effective root `icon` and `__proto__` keys are rejected before merging. A duplicate-preserving JSON string provenance scanner locates decoded unsafe keys, including JSON escapes and sanitizer-induced keys; complex sanitizer output retains an authored-field diagnostic fallback. Nested inert icon data and constructor/prototype strings remain accepted. `details` is explicitly rejected as external DOM/link input. Sequence collection now precedes native parsing, so details cannot access the DOM before validation. Actor properties have an exact typed identity for worker/browser reconciliation, including non-finite numbers, named array properties and deep data without recursive traversal. Independent review found JSON serialization conflated Infinity with null; the typed iterative encoding and mutation regression closed that finding.

Authored property classes can otherwise impersonate toolkit CSS and JavaScript state. The fingerprinted renderer now namespaces whitespace-delimited authored `vs-*` tokens at all five native property-derived assignments, after native coercion/header/footer suffixing and before SVG creation. Ordinary classes and raw DB values are unchanged; later genuine toolkit highlighting remains intact. The pinned stylesheet is checked not to use the reserved namespace. Independent review found no material issue in this boundary. Browser checks cover participant, collections, queue and database, plain/math, both copies, string/array/numeric coercion, real reader CSS, cloned SVG and actual target/highlight helpers. Other families' class boundaries remain part of the overall coverage/security audit; this result is sequence-specific.

Final evidence: 394 Mermaid regression tests, 44 integrated Chromium tests at 320/1440, typecheck, fresh release build, installed single-file offline/source-copy/fallback checks and diff check pass. Installed verification includes inert properties and reserved classes on the encoded mirrored actor and confirms both actor shapes stay visible. The first browser parity failure was an incorrect test seed: native actors begin with properties `{}`, not undefined. Initial class tests also used incorrect YAML spacing and target-key syntax; fixing those fixtures produced the documented native behavior. `reports/math/sequence-properties-snapshot.json` records exact files and evidence.

Next remove the raw sequence equation guard and verify every role through installed export, including references/fallback and resource limits. Properties/details classification and the sequence class collision are no longer activation blockers. The public raw guard is still present; this checkpoint does not claim full sequence acceptance or close remaining Mermaid families, W5/W6 or C01–C08. No commit, push or publication occurred. No jobs remain running; the full goal is active.

## Raw sequence math activation (2026-10-06)

The previous turn completed participant metadata semantics and class isolation. Raw `$$...$$` sequence equations are now enabled in public validation. A public bundle/compiler test covers every label role, including accessibility fields, title, box, participants, messages, notes and control/branch headers. Independent activation audit found no uncovered native text role or additional code-level blocker within the existing sequence profile.

Installed standalone verification renders 17 bound MathML expressions covering all visible roles at 320 and 1440 pixels with network access denied. Every distinct expression is selected and copied to an exact authored-source reference that resolves through the installed CLI; the existing encoded actor test separately checks header and footer copies. JavaScript-disabled, worker-failure, unavailable-MathML and print-source paths pass. Accessibility fields remain validated accessible text, not extra visible MathML copies. The updated author guide documents sequence syntax, machine-data properties and reserved class isolation.

Final checks: 395 Mermaid regression tests across 36 files, typecheck, packaged build, installed all-role checks and diff check pass. Asset budgets pass (Mermaid informational 5,319,425 bytes / 1,521,657 gzip); timing mode was not run. Budget evidence precedes guide-only packaging and uses identical browser assets. A verifier-only viewport variable error initially stopped the final MathML-absence check after other cases passed; correcting its scope and rerunning the complete verifier produced the final passing record. Exact source hashes and evidence are in `reports/math/sequence-activation-snapshot.json`. This is sequence activation evidence, not a final full-suite/C01–C08 acceptance claim.

Next implement state-diagram source extraction, reconciliation and binding, using the inventory in `state-geometry.md`; retain current composite/concurrent exclusions. Other Mermaid detector families, complete shape/applicability coverage, W5/W6, final independent candidate review and human acceptance remain open. No commit, push or publication occurred; no job remains running. The full goal remains active.

Budget process note: session handle `58822` continued returning a nonterminal watcher state after the script wrote its passing report and reached its explicit exit. A host-level process inventory found no matching budget command or shell remaining. No replacement job was started; treat the process as absent rather than rerunning from the stale watcher alone.

## State grammar and native extraction foundation (2026-10-06)

The prior checkpoint activated sequence math. This checkpoint adds a state grammar collector and fingerprinted native extraction observers without enabling state math in the public pipeline. Raw records retain exact source intervals and parser-object identities, including overwritten assignments, description arrays, note-only states and relation endpoints. A shared Node/esbuild transform observes native branch decisions, candidate/retained-node identity and per-pass note sanitization; it does not duplicate the extraction algorithm.

Independent review caught note whitespace handling, missing structural IDs and non-native divider counters. Root also identified note-only implicit labels, bracket/case suffixes and composite alias whitespace. These are fixed and rechecked. The reviewer retracted an endpoint-identity-loss finding after confirming that the native relation keeps the same state1/state2 objects. The observer review identified missing candidate ownership and note mutation boundaries; both hooks are now present, with no remaining material finding within this foundation.

Checks pass: 26 state/unit checks across five files, four Chromium checks at 320/1440, TypeScript and diff check. Six native fixtures per viewport have identical DB, layout-label and visible formula results with observation enabled or disabled. A fresh Node process and a relocated bundle produce identical native ownership events across repeated extraction. Exact files and evidence are archived in `reports/math/state-foundation-snapshot.json`. The unit harness also rebuilt the existing release; no new installed-export or full-suite acceptance is claimed. Initial characterization failures came from test harness setup (missing observed bundle assignment and an annotation query inconsistent with the existing MathML marker); final complete runs pass.

Next: connect the collector's object identities to observer events, apply attested sanitizer provenance to effective labels, validate all authored math, plan exact visible copies, and integrate worker/compiler/runtime source binding. Then audit state classes and shape geometry, and run installed standalone/fallback verification before removing its raw guard. Production observer installation remains pending. Composite/concurrent exclusions remain unchanged. Other detector families, W5/W6, final candidate review and C01–C08 remain open. No commit, push or publication occurred; no job remains running at this checkpoint. The full goal remains active.

## State effective provenance checkpoint (2026-10-06)

The previous goal turn made verified progress on the state collector and observer. This turn connects those objects to an effective provenance consumer and adds scoped real Node sanitization. Exact native events determine ordered description arrays, retained node/edge ownership, per-pass note normalization and implicit-label promotion. Matching text is not used to select source identity. Raw authored records remain separate from effective layout slots.

Source-mode and relocated bundled Node execution agree on fields and source spans across repeated extraction. Two Chromium tests at 320/1440 cover four fixtures each: decoded note HTML and pseudo states, identical equations at distinct title/body locations, the pinned renderer's note-only undefined-shape failure, and a blank alias that displays its ID. The last case exposed missing alias-ID provenance; the collector now retains it. Review also replaced description text filtering with exact ordered records and restricted generated ID fallback. Independent recheck reports no remaining material finding in this bounded consumer/Node-sanitizer scope; a proposed note-only promotion defect was withdrawn after actual rendering disproved a default-shape assumption.

Final checks: 32 focused unit checks across five files, two browser tests, TypeScript and diff check pass. Unit setup rebuilt the current release; no installed-export, whole-suite or budget acceptance is claimed for this checkpoint. Initial integration failures exposed note connector direction/ownership and an inline-note fixture whose semicolons ended the native token; the final probe uses the native multiline note form. One collector expectation incorrectly trimmed raw alias owner IDs/colon text; corrected expectations preserve the independently verified native contract. Exact artifacts and hashes: `reports/math/state-provenance-snapshot.json`.

Next implement state math validation (all explicit authored occurrences plus promoted implicit labels), common accessibility normalization, exact title/body/edge/note copy planning and budget accounting, then wire production observer/sanitizer installation and worker/compiler/runtime source maps. State math remains publicly guarded. Resolve the note-only native-error/fallback behavior explicitly during integration; do not silently assign a default shape. Existing composite/concurrent exclusions and the full remaining Mermaid/W5/W6/C01–C08 scope remain unchanged. No commit, push or publication occurred, and no job remains running. The full goal remains active.

## State authored math and rendered-copy planning (2026-10-06)

The previous checkpoint established native ownership and sanitizer provenance. State math now has an authored ledger covering every explicit label occurrence, including overwritten descriptions, notes, transitions and accessibility assignments, plus implicit IDs promoted by native label use. Per-record sanitizer variants retain exact ownership and source origins. The ledger validates each variant and charges its componentwise maximum resource cost. The copy planner separately models plain boxes/notes through native labelHelper decoding and sanitation, title/body boxes through createLabel, and edges through their direct text path. Body rows retain ordered ownership across synthetic line-break joins. The final charge is the per-record maximum of authored cost and visible-copy cost, so a surviving formula is not charged twice while repeated copies remain reserved.

Independent review found that retained native object identity and shape could change after reconciliation. Frozen node ID/DOM ID/shape/description-presence and edge ID/endpoints now accompany provenance; the planner verifies those snapshots before shape filtering or empty-edge omission. Mutation regressions exercise the reported bypasses. The reviewer rechecked the fix and found no remaining material issue in this scope.

The browser adapter now reverses one layer of HTML text serialization (`amp`, `lt`, `gt`, `nbsp`) only inside existing state equations. The pinned state renderer registers its actual SVG for the awaited layout operation; a private WeakSet scopes the shared text hook to that SVG and cleanup runs in finally. Authored classes/attributes cannot enable this transformation in another family. Native slash collapse precedes the hook; native line-break normalization precedes formula-only restoration. A separate independent review found no material issue in scoping, async cleanup or patch anchoring. This normalization is in the production browser bundle; state observation, compiler transport and state activation remain pending.

Final checks pass: 32 focused unit tests, 439 Mermaid regression tests across 44 files, 32 Chromium tests across state provenance/characterization and shared labels/ink at 320/1440, typecheck, production build and diff check. Seven state fixtures compare planned formula multisets to actual MathML, including title/body/note/edge comparisons, path-specific sentinel decoding, identical formulas, repeated extraction and blank-alias fallback. Native source and relocated bundled Node extraction produce equal plans. The note-only undefined-shape fixture is an expected native error, not successful rendering. An initial comparison fixture used an invalid bare TeX ampersand and was corrected to a valid comparison; no product behavior was relaxed. The regenerated state-characterization reports supersede their earlier mutable report copies. Exact files/evidence: `reports/math/state-math-plan-snapshot.json`.

Next reconcile common accessibility getters, wire production worker observation/sanitation and state math transport, implement exact DOM/source bindings and class isolation, and verify geometry/installed offline/fallback behavior before lifting the state guard. No state activation, installed state acceptance, whole-suite, clean-machine, final budget or C01–C08 completion is claimed. Other detector families and W5/W6 remain in scope. No commit, push or publication occurred. All jobs are finished at this checkpoint; the full goal remains active.

## State production worker connection (2026-10-06)

The prior turn made verified progress on the authored ledger, rendered-copy plan and browser normalization. The production parse worker now installs the pinned state observer through its source loader and release bundler, and supplies the real private sanitizer for state DB methods. Native Mermaid parsing remains authoritative. After saving its layout and accessibility results, a fresh StateDB replays collector-owned accessibility assignments and extracts the collector's exact root objects. Deep equality checks nodes, edges and direction against the native parse. Accessibility getters are compared with both saved native values and final normalized assignments. A second observed extraction models the browser's pre-layout pass; observers are disposed in finally.

`state-accessibility.ts` preserves native source-order setter behavior and final getter normalization. `state-transport.ts` carries only serializable authored records, exact visible slots, per-record costs, total cost and final accessibility ownership; grammar objects, Maps and provenance instances stay inside the worker. Original fenced source is mandatory when any effective state equation is discovered. Compiler/model/source-map consumers are not wired yet, so this transport is currently an internal worker result and the public raw state guard remains in force. Encoded state math without original source is rejected rather than silently exported.

Math discovery reuses the strict planner's actual input paths. Its production-only option defers only the known native undefined-shape case until all admitted slots and authored records are checked: a completely plain note-only diagram retains existing parse behavior and eventual native rendering failure, while any equation elsewhere—including one introduced by labelHelper sentinel decoding—makes preparation fail with the concrete shape error. Other ownership/applicability failures are not ignored. Composite states retain their existing semantic rejection downstream; this connection does not attempt nested ownership or change that profile.

Independent review found no material issue in native/collector reconciliation, deferred plain compatibility, observer installation or transport. Its live worker probe verified failure isolation across sequential figures. A second read-only audit confirmed current two-extraction validation retains all relevant sanitizer variants: descriptions and transitions repeat immutable raw inputs; note history supplies the first-pass output, and the ledger validates raw plus second-pass output. The consumer does not promise arbitrary multi-epoch historical retention; new upstream text mutations require a re-audit under the pinned artifact contract.

Final evidence: 449 Mermaid regression tests across 46 files, typecheck, production build and diff check pass. Six worker integration tests cover all label paths and accessibility, Unicode/CRLF source intervals, encoded/sentinel math, overwritten invalid math, both state declarations, repeated direction statements, blank aliases, undefined-shape compatibility, composite semantic input and original-source requirements. `node scripts/verify-state-worker.mjs` confirms exact JSON equality between the actual source worker and the released worker copied alone to a fresh directory away from node_modules for seven fixtures, including a failure followed by a successful figure. Early fixture failures came from assuming HTML references always decode and forgetting that unquoted state descriptions stop at semicolons; final fixtures use native HTML and quoted-field paths. The superseded failed focused log is retained; the final integrated regression supersedes it. Exact hashes/results: `reports/math/state-worker-snapshot.json`.

Next wire StateRenderMath into the figure model and checked resource totals, produce exact compiler source maps, and stamp/attest the browser's state DOM owners for source selection/copy. Then complete class isolation, geometry, installed offline/fallback verification and state activation. Remaining families, W5/W6, whole-suite/clean-machine/final budgets and C01–C08 remain open. No commit, push or publication occurred. No jobs remain running at this checkpoint; the full goal is active.

## State source maps and browser source binding (2026-10-06)

The previous turn made verified progress on production worker extraction. StateRenderMath now survives the figure model, and document resource accounting revalidates transported authored/visible record charges instead of trusting a reported total. Duplicate/missing charge owners, stale slot text, missing formula owners and inconsistent totals fail. Compiler support emits the shared original-source map and formula-bearing native state slot identities. The public raw state guard and current original-source admission remain unchanged; this checkpoint is not public state activation.

`state-source-map.ts` validates admitted shape/path/role combinations, ordered rendered text and authored formula identities before mapping through the shared original-byte/displayed-code machinery. Equal equations in title and body keep separate source positions. Encoded, synthetic and discontiguous origins use the same explicit handling as flowchart/sequence. Runtime source binding now admits the state format while retaining exact source text/range checks.

`mermaid-state-source.ts` stamps native foreignObjects using exact prefixed DOM IDs for nodes/notes and exact edge data IDs. Title/body selection uses the first/second direct foreignObject, including plain siblings. It checks unique owners, native child structure, expected MathML TeX/counts and unclaimed equations before mutating attributes, with rollback on write failure. The existing pre-layout ink reservation remains responsible for geometry. Independent design and implementation reviews found no material ownership/accounting/isolation issue in this bounded scope; they did not perform an activation review.

Final checks: 488 relevant unit/regression tests across 51 files, typecheck, production build and diff check pass. The focused source/transport/runtime set has 25 passing tests. Two Chromium tests at 320/1440 exercise nine native state fixtures, now building a state source map, stamping real generated SVG, binding source and selecting each MathML equation back to its authored text. Coverage includes identical title/body equations, plain-title/math-body, math-title/plain-body, self-edges, notes, encoded sentinel math and comparison characters. The undefined-shape fixture remains an expected native/planner failure. Unit tests additionally check Unicode/BOM/CRLF/dedent/comment mapping, stale/duplicate owners, missing source bytes and atomic rejection. Compiler code is built and typechecked, but public installed state export and reference CLI round-trips remain pending activation. Exact files/evidence: `reports/math/state-source-snapshot.json`.

Next isolate reserved authored classes, finish state geometry/print and installed all-role/offline/fallback/source-reference verification, then activate state with a public compiler regression. Remaining detector families, W5/W6, whole-suite/clean-machine/final budgets and C01–C08 remain open. No commit, push or publication occurred. The full goal stays active.

## State effective class isolation and ink geometry (2026-10-06)

The previous turn made verified progress on compiler/source binding. This turn implements reserved-class isolation in the pinned state DB, consistently in source worker, release worker and browser. Initial read-only advice and the first raw-regex review were insufficient: literal Mermaid sentinels can become reserved `vs-*` tokens only after final SVG entity decoding. The replacement `state-classes.ts` builds a source-mapped effective attribute value (serialization escaping, native sentinel restoration, then one HTML-attribute decode), inserts `mermaid-authored-` at original reserved-token starts, and verifies the result. Ordinary class bytes remain unchanged and the same helper normalizes class-definition/assignment keys. Shared HTML provenance decoding now accepts an explicit mode; existing sanitizer tracing remains unchanged in legacy mode.

The earlier claim about standalone shorthand was also corrected: parser success does not establish effective class application. Final browser fixtures use actual explicit `class A ...` assignments. They cover literal classes, decimal/hex sentinel hyphens and encoded whitespace, plain/math states, ordinary-class retention, reader CSS visibility, real target attachment/highlighting and cloned SVG. No new source restriction was introduced. Raw `#45;` Mermaid codes remain excluded by the pre-existing profile; admitted literal sentinel forms are isolated.

Independent review explicitly superseded its earlier raw-regex no-bypass result and found no remaining material issue in the replacement helper. The reviewer reported a 512-case read-only ASCII-reference probe through serialization, sentinel restoration, DOMPurify and insertion, with no surviving reserved token and idempotent results. Root's separate browser and unit checks provide the stored automated evidence. The exact reviewed hashes are recorded in the implementation review.

State geometry probes now verify fractions, 10em tall rules and 20em overhangs across title/body, plain box, note and edge labels at 320/1440. All nonempty MathML ink fits its foreignObject and the SVG viewBox, and title/body formulas do not overlap. An early test guessed the native node counter; final checks obtain the native DB DOM identity and require the title/body owner and both formulas to exist. These are bounded geometry checks, not whole-state print/installed acceptance.

Final evidence: 491 regression tests across 52 files; 13 focused class/observer/sanitizer tests; six Chromium tests covering class isolation, geometry and the existing nine-fixture source-selection matrix; typecheck, production build, source/relocated release worker equality for eight fixtures, asset budgets and diff check all pass. Timing budget mode was not run. The relocated-worker report now includes encoded authored classes and supersedes its previous seven-fixture mutable report. Exact files/results: `reports/math/state-classes-snapshot.json`.

Next complete public state compiler activation with installed all-role export, reference CLI round-trips, print and offline/fallback checks. Keep the raw state guard until those activation requirements are met. Other detector families, W5/W6, whole-suite/clean-machine/final candidate reviews and C01–C08 remain open. No commit, push or publication occurred. All jobs and bounded reviews are finished at this checkpoint; the full goal stays active.


## State public activation and installed acceptance (2026-10-06)

Both `stateDiagram` and `stateDiagram-v2` now admit math through the public compiler. The source guard admits only these audited declarations, and the parser request forwards original fenced source for state provenance. The guide and detector ledger describe the supported non-composite profile. No existing composite or interaction restriction was relaxed.

The public compiler regression loads authored Markdown and verifies both declarations, eight authored equations (six visible and two accessibility), all visible label paths, encoded delimiter source, original source maps and slot identities. Its initial fixture omitted the required mock toolkit integrity digest; that setup was corrected to match existing compiler tests. An attempted restricted test run could not spawn the global-setup subprocess; the final authorized regression run supersedes it and passes 493 tests across 53 files.

The freshly built installed CLI exports one relocated HTML file. Chromium at 320/1440 renders six unique state formulas spanning title, body, scalar box, note, transition and sentinel-decoded label. Every formula produces an exact authored quote and an installed `refs resolve` result of `exact` with `quoteFound: true`. Effective sentinel-encoded reserved classes are isolated. The shared verifier passes no-JavaScript source, print-source and unavailable-MathML fallback checks, with no HTTP requests, sibling-file requests, CSP errors or browser errors. Its separate general worker-failure scenario is not a forced Mermaid-renderer failure and is not claimed as such.

Independent read-only activation review found no material integration issue. Build, typecheck, release asset/resource budgets and diff check pass. Budget timing mode was not run. The final toolkit digest is `0d8a9a08cf9bcb17d5d41230d4577c68bf9a80e29bd7d616db5a8ed3fb7cb700`. Exact commands, source hashes and copied installed report are recorded in `reports/math/state-activation-snapshot.json`.

Next continue the remaining families in `mermaid-coverage.md`, then close per-field coverage, whole-suite/browser/clean-machine checks, final candidate reviews and human gates C04/C05. W5/W6 and C01–C08 remain open; this state slice does not complete the full goal. No jobs or bounded reviews remain running at this checkpoint. No commit, push or publication occurred.


## Journey authored-source foundation (2026-10-06)

The previous turn completed verified state activation. Journey work now has a pinned grammar collector with exact original provenance for titles, accessibility fields, sections, tasks and actor occurrences. The collector preserves overwritten declarations, task-to-section identities, repeated actors and the complete task data token. It follows native colon/comma splitting without treating scores or ignored suffixes as equations. This is an internal foundation, not public journey activation; the existing math guard remains.

Independent native lifecycle audit found no shared math renderer, fixed geometry across every visible role, destructive repeated `getTasks()` reads, and ordinary-object actor maps. These findings determine the remaining adapter work and are recorded in `journey-geometry.md`. Native DB parity tests deliberately call `getTasks()` exactly once and retain prototype-like actor names; they do not claim browser rendering correctness.

Six focused collector tests and 36 adjacent collector regressions pass (42 total, four files), as do typecheck and diff check. A TypeScript callback-narrowing error was corrected using a typed effect reader before final verification. Independent collector review found no material issue. Exact source/test/evidence hashes: `reports/math/journey-labels-snapshot.json`.

Next implement journey validation with native metadata sanitation, effective DB reconciliation, canonical visible ownership and rendered-copy budgets; then the measured browser adapter, compiler source binding and installed acceptance. Remaining families and W5/W6/C01–C08 remain open. No jobs or reviews remain running. No commit, push or publication occurred; the full goal stays active.


## Journey validation and native snapshot ownership (2026-10-06)

The previous turn completed verified journey source extraction. `journey-math.ts` now validates all authored fields, including overwritten roots, unused sections and repeated actors, against the incoming document resource budget. Metadata uses the real private strict sanitizer and common setter normalization; raw task/section/actor fields preserve native entity and backslash spelling. Each formula carries original provenance, and errors retain the authored owning field's intervals.

`journey-db.ts` reconciles a supplied single native DB snapshot without invoking any destructive native getters. It compares every task, section, sorted actor and final metadata value, then assigns source-owned visible slots. Shared legends use the first authored occurrence of the exact native actor identity; merged contiguous section runs use their first task's section record. All other authored occurrences remain validated. Distinct visible record ownership is enforced, so current rendered MathML is bounded by the authored budget; tooltip/accessibility copies remain plain text. Prototype-like actor names survive Map-based ownership, but this does not yet fix the native browser actor objects.

Independent review found that the earlier task/section normalization advice had assumed the wrong default branch. Native journey defaults to foreignObject text that retains literal break tags; only its SVG fallback splits them. Final validation retains newline barriers while primary display retains literal task/section break tags, actor spaces and metadata-only formula entity restoration. Both paths validate against the same incoming total, with cost equality and display-derived source spans. The adviser acknowledged the earlier error and the reviewer verified the correction. The forthcoming measured renderer must disable generic break-tag splitting for literal task/section/title text.

Final evidence: 41 journey/shared sanitizer/math regression tests across seven files, typecheck and diff check pass. Native DB oracle tests use an independently initialized real DOMPurify factory in isolated JSDOM and exactly one task read. An additional identical-label fixture rejects forged shared source ownership even when task strings are equal. Early fixture/setup failures were corrected; final results supersede them. Exact hashes and commands: `reports/math/journey-validation-snapshot.json`.

Next integrate the production native snapshot/sanitizer lifecycle and implement the measured journey browser adapter, source binding and installed acceptance. Journey remains publicly guarded until that work passes. Remaining Mermaid families and W5/W6/C01–C08 remain open. All jobs and reviews are finished; no commit, push or publication occurred. The full goal remains active.


## Journey isolated worker and transport (2026-10-06)

The previous turn completed verified journey validation and native snapshot ownership. The internal parser worker now installs a synchronous native journey sanitizer scope, validates family/source admission, captures exactly one task snapshot and reconciles source-owned math. The cache key includes the journey flag. JSON-only transport includes validated records, canonical slots, native snapshot and checked totals; incomplete/duplicate slots, stale display text and changed charges fail.

Both native parse calls reset the singleton, and only the second DB is read. Its task/actor/section/metadata values are cloned before asynchronous collector work. No sanitizer replacement crosses an await. Effective math requires original source. Nonfinite task scores cannot form a math layout plan because JSON/SVG cannot represent them; plain native parsing is preserved. The public index and raw journey guard remain unchanged pending rendering and compiler integration.

Independent review found no material issue in the worker lifecycle or transport. Six focused integration tests pass, the combined Mermaid regression passes 515 tests across 57 files, and typecheck/diff check pass. Test setup builds the production release. Source and actual released worker outputs match on ten explicit fixtures with the release worker copied alone away from node_modules. Early integration assertions assumed the wrong existing flowchart result property and unsupported unflagged `other` behavior; corrected tests now exercise actual cache separation. Relocated fixture authoring was adjusted to admitted break markup and entity-bearing accessibility fields before execution. Exact evidence: `reports/math/journey-worker-snapshot.json`.

Next implement the measured journey browser renderer with explicit primary-text behavior, actor maps, canonical source bindings and resource checks, then connect the compiler/model and perform installed single-file acceptance before activation. Other Mermaid families and W5/W6/C01–C08 remain open. All jobs and bounded reviews are finished. No commit, push or publication occurred; the full goal remains active.


## Journey measured browser layout (2026-10-06)

The previous turn completed verified internal worker transport. The browser bundle now patches the fingerprinted journey renderer with a measured math path. Plain diagrams receive the captured one-read task/actor arrays through the upstream renderer. The math path premeasures title, actor legend, section and task labels, expands columns/rows coherently, preserves duplicate actor markers and native score differences, checks full bounds, and stamps canonical label keys. The shared label helper now supports literal break-tag text without changing its default behavior for existing families.

Independent review found numeric actor enumeration differs from sorted DB order. The corrected legend uses safe native-equivalent integer-key ordering while retaining sorted source keys and color assignments. Prototype-like actors remain visible in the math path through Map lookups. Review verified this correction with no remaining material finding. Probe cleanup, staged drawing rollback and original SVG-attribute restoration are tested directly.

Final checks: 26 Chromium tests at 320/1440, 30 focused unit tests, typecheck, production build, budgets and diff check pass. Browser evidence includes plain upstream parity, all visible math roles, matrices/tall/overhanging ink, literal breaks, duplicate and prototype/numeric actors, score spacing outside 0–5, shape/label bounds, row separation, recovery and injected post-draw failure. An initial numeric test asserted reversed Y order; final evidence uses the intended explicit legend ordering. Final toolkit digest: `1d618d7aff627aa015bca26764d6c2d20d889c3745a045a84181d625c2f73061`. Timing budgets were not run. Exact hashes/commands: `reports/math/journey-render-snapshot.json`.

Next carry JourneyRenderMath through the model/compiler/document budgets, bind canonical browser label keys to authored source maps and complete installed standalone/reference/print/fallback checks before public activation. Remaining families, W5/W6 and C01–C08 remain open. All jobs and bounded reviews are finished; no commit, push or publication occurred. The full goal stays active.

## Journey public source integration and activation (2026-10-06)

Completed the journey model/compiler pass-through, source-map construction, runtime source format and document resource accounting. Canonical slot ownership survives duplicate formulas, repeated actors and merged equal headings; original-byte checks cover normalization and reject stale inputs. Public journey parsing and raw math are enabled. Authoring guidance and installed-release fixture now include journey.

Validation: 506 tests across 56 Mermaid/compiler/runtime source files pass; typecheck, build and diff checks pass. Installed relocated single-file verification passes rendered 320/1440, source/no-JS, ordinary math-worker failure, print and MathML-unavailable modes. Title/section/task/actor selections resolve to exact source through the installed CLI. No network or sibling-file requests occurred. The budget report passes every gate (`ok:true`); timing was not run, and the npm wrapper was interrupted after it remained open despite printing the final passing report. Independent static review has no unresolved material finding; its initially claimed missing renderer hook was retracted after inspecting build-time injection. Exact hashes: `reports/math/journey-source-snapshot.json`.

Next address the remaining Mermaid family adapters and complete W5/W6 and C01–C08 candidate checks. This milestone does not complete the full math goal or human acceptance. All commands and bounded agents are finished; no commit, push or publication occurred. Full goal remains active.

## Quadrant source ownership and validation foundation (2026-10-06)

Previous turn classified as progress: journey public activation and installed standalone acceptance completed. This turn added the pinned quadrant grammar collector, per-field authored math validation and shared text normalization. All label roles have exact source records; overwritten fields and duplicate points remain charged. Synthetic axis arrows retain generated provenance. Classes/styles and coordinates remain separate machine fields.

Eleven focused tests pass, including all roles, source normalization, parser isolation/recovery, native sanitation/encoded origins, matrices, invalid overwritten equations, document limits, and actual native DB final fields/reversed point order. Typecheck/diff checks pass. Independent static collector and math reviews found no material issue. A fixture violating the existing class style profile was corrected without changing production admission. Snapshot: `reports/math/quadrant-foundation-snapshot.json`; design/native evidence: `quadrant-geometry.md`.

Next implement the fingerprinted detached native quadrant snapshot export, source/worker parity and semantic reconciliation. Then implement measured title/rotated axes/captions/point collision layout, source binding and installed acceptance before public activation. Quadrant raw math stays guarded; remaining families and W5/W6/C01–C08 remain open. All commands and bounded reviews finished; no commit, push or publication occurred. Full goal remains active.

## Quadrant native state reconciliation (2026-10-06)

Previous turn was progress: source collection and authored math validation were implemented and verified. This turn adds a fingerprinted detached native snapshot export with shared source-loader/esbuild transforms, plus reconciliation of source-owned records against actual builder state. Candidate point slots use reversed authored indices; final fields and class definitions preserve native overwrite semantics. Invalid normalized coordinates are rejected, including a tested native lexer edge case (`0a2`).

Fifteen focused tests across five files pass, including real native DB reconciliation, mutation/forgery rejection, recovery, source/relocated bundle snapshot equivalence and unpatched native layout-data parity. Typecheck and diff check pass. Independent static reviews have no unresolved material findings. Evidence hashes/commands: `reports/math/quadrant-snapshot-evidence.json`. Browser SVG parity is not yet tested for this patch; production build/worker wiring remains pending.

Next integrate source/bundled worker snapshot loading, synchronous sanitation, validated transport and actual visible-slot attestation. Then complete measured quadrant renderer, compiler/source mapping and installed acceptance before removing the raw guard. Remaining families/W5/W6/C01–C08 remain open. All commands and reviews are finished; no commit/push/publication occurred. Full goal remains active.

## Quadrant internal worker integration (2026-10-06)

Previous turn was progress: native snapshot and reconciliation foundations were added. This turn wires the fingerprinted snapshot into source/release workers, synchronous native sanitation, internal request/cache flags, visible native-output attestation and checked JSON transport. Exact source provenance and all authored charges survive transport. Public quadrant activation remains gated.

Final 508 tests across 60 Mermaid files pass. Nine explicit fixtures match between actual source and relocated release workers, including all roles, encoded math, normalization, invalid overwritten math, nonnumeric point math failure/plain preservation, original-source requirement, classes and cross-family recovery. Typecheck/diff check pass. Independent review's hidden-record validation finding is resolved and regression tested. Exact hashes: `reports/math/quadrant-worker-snapshot.json`; parity report: `reports/math/quadrant-worker-relocated.json`.

Next implement measured quadrant browser layout, point-label collision handling, native plain parity and transactional failure recovery, then compiler/source/reference integration and installed acceptance. Other families and W5/W6/C01–C08 remain open. Full goal stays active; no commit, push or publication occurred.

## Quadrant measured browser layout (2026-10-06)

Previous turn was progress: internal quadrant worker and transport passed integration/relocation checks. This turn adds measured pure layout and a fingerprinted browser renderer. It preserves affine point coordinates/native order, uses separate measured point-label columns and leaders, reserves rotated-axis/caption/title ink and marker clearance, and restores SVG state after drawing failures. Native plain drawing remains the fallback path for diagrams without visible math.

Independent review's axis-config finding is resolved and re-reviewed. Final verification: 10 Chromium cases at 320/1440 pass, 32 focused unit cases pass, and typecheck/production build/asset budgets/diff checks pass. Timing budgets not run. Browser tests verify native plain parity, all roles, tall/overhanging/matrix formulas, pairwise label separation, boundary/coincident points, axis variants and rollback. Initial test assumptions about point order and local rotated boxes were corrected against native behavior and actual transformed geometry. Exact snapshot: `reports/math/quadrant-render-snapshot.json`.

Next implement quadrant figure/compiler/document-budget pass-through and source bindings, then installed single-file/reference/fallback/print checks before public activation. Other family adapters and W5/W6/C01–C08 remain open. All commands/reviews are finished. No commit, push or publication occurred; full goal remains active.

## Quadrant public activation and installed acceptance (2026-10-06)

Previous turn was progress: measured browser geometry/recovery were implemented and verified. This turn completes quadrant figure/compiler/accounting integration, exact source mapping, runtime binding and public activation. Author guidance describes native quoting, normalized coordinates, side-column point labels and source ownership.

Final 531 tests across 63 files pass, plus typecheck/diff checks. Installed acceptance passes against the final rebuilt toolkit: 11 visible quadrant formula references resolve through the CLI, 320/1440 rendering succeeds, source/print/MathML fallback checks pass, and no network/sibling-file requests occur. Independent static review found no material issue. Budget report passes every gate with timing not run; its lingering command handle was interrupted only after printing the completed passing report. Exact evidence: `reports/math/quadrant-source-snapshot.json`.

Next address remaining Mermaid adapters and then complete W5/W6/C01–C08 candidate and human gates. Quadrant activation does not narrow or complete the full goal. No commit/push/publication occurred; full goal remains active.

The next family selected for implementation is XY chart. Bounded native-source reconnaissance is saved in `xychart-notes.md`; it identifies public semantic snapshots and native measurement/drawable hooks, plus declaration-history and point/legend-label pitfalls. All bounded agents and test commands are now finished.

## XY chart source ownership and authored validation (2026-10-06)

Previous turn completed quadrant public activation and installed acceptance. This turn adds the pinned XY grammar collector and authored math validator without activating XY rendering. Ordered callback history retains axis mutations before plot insertion; source ownership survives ignored whitespace, duplicate text, overwritten fields and ignored/truncated datum labels. Math validation preserves exact original spans and charges every authored equation.

Final focused verification: 12 tests across three files pass, including independent native callback and native database sanitation comparisons; typecheck and diff checks pass. Independent static review found no material collector/math defect. An initial native fixture failed because it used a worker-only dependency adapter without the worker loader; the corrected fixture initializes the real native dependency independently. Evidence: `reports/math/xychart-authored-snapshot.json`. Full native artifact fingerprint enforcement remains required before activation; current collector pins grammar reductions.

Next implement XY detached native state capture and reconciliation by declaration history, then measured layout/visible identity, worker/transport/source integration and installed single-file acceptance. Other Mermaid families and W5/W6/C01–C08 remain open. No commit, push or publication occurred; the full implementation goal remains active.

Final independent test review identified missing native singleton DB cleanup in the differential fixture. The parse/snapshot/assertion block now clears the DB in `finally`; the reviewer verified the fix with no remaining finding. The final focused test run includes that correction.

## XY native state reconciliation (2026-10-06)

The preceding goal turn made verified progress on authored source/math collection. This turn adds detached native state capture, ordered semantic replay, exact native comparison and source-owned candidate slots. It preserves axis declaration history, auto ranges, truncation, missing band values, duplicate category owners, palette behavior and separate pre-draw title state. A full-artifact contract transform now has source-hook and relocated isolated-bundle parity evidence; production worker/browser integration is still pending.

All 23 tests across five XY files pass, with typecheck/diff checks. Independent design/implementation/contract review has no unresolved material finding. Duplicate categories retain separate native label identities; later measured rendering must handle coincident positions. Initial contract test setup lacked Node's DOMPurify dependency adapter and was corrected; real sanitation is independently covered. Exact evidence: `reports/math/xychart-db-snapshot.json`.

Next integrate XY contract loading, synchronous sanitation and baseline/snapshot capture into the worker, then measured rendering, actual visible slots, transport/source bindings and installed standalone acceptance. Other Mermaid adapters and W5/W6/C01–C08 remain open. No commit/push/publication occurred. The full implementation goal remains active.

## XY internal worker integration (2026-10-06)

The previous goal turn made verified progress on native state replay and dependency-contract checking. This turn wires the exact native contract into source/release workers, synchronous private sanitation and final-parse state capture. An internal XY request/cache mode now returns lossless numeric snapshots, complete authored records, ordered effects and source-owned candidates. Transport revalidates equations/costs and exact replay; public XY activation remains gated on measured rendering and actual visible ownership.

Final 560 tests across 70 files pass. Seventeen fixtures match the actual source and relocated release workers. Typecheck, diff and asset/reference budgets pass; timing was not run. Independent finding XY-T1 about malformed tuple normalization was fixed, regression tested and re-reviewed. Initial test expectations for error wording and the unadapted request path were corrected against actual behavior. Evidence and exact candidate hashes: `reports/math/xychart-worker-snapshot.json`.

Next implement measured XY browser geometry, visibility and failure recovery, then compiler/source binding and installed standalone acceptance. Remaining families and W5/W6/C01–C08 stay open. All test/review processes have finished. No commit, push or publication occurred; the full implementation goal remains active.

## XY measured browser layout (2026-10-06)

The preceding goal turn completed internal XY worker/transport integration. This turn adds a pinned browser adapter and measured layout around native XY plots. It preserves scales and duplicate source identities while allocating measured title, rotated category, axis, point and legend space. Generated values respect inside/outside configuration, with an explicit outside fallback for values that cannot fit or collide. Native plain rendering delegates unchanged.

Independent review found incomplete miter bounds and ignored bar-label configuration. Both were fixed and re-reviewed; the follow-up duplicate-category inside-label collision was also fixed. The final browser suite passes 14 cases at 320/1440, including the orientation/rotation/reserved-space matrix, tall/overhanging formulas, native plain parity, exact owner keys and anchors, hidden fields, zero-padding miter reserves, bar-label placement, and failure/rollback/recovery. The initial failed cleanup expectation conflated caller-owned Mermaid error output with adapter stages; tests now distinguish them and separately verify exact adapter rollback. A fixture's default legend padding was removed to make the miter regression meaningful.

Final focused units pass 45 cases across nine files. Typecheck, production build through unit global setup, release asset/reference budgets and diff checks pass; timing budgets were not run. Exact hashes/checks are recorded in `reports/math/xychart-render-snapshot.json`.

Next attest actual visible XY slots and wire figure/compiler accounting and source/reference bindings. Then complete installed standalone/fallback/print acceptance before removing the public XY guard. Remaining families and W5/W6/C01–C08 remain open. No commit, push or publication occurred; the full implementation goal remains active.

## XY public activation and installed acceptance (2026-10-06)

The previous goal turn made verified progress on measured XY browser geometry. This turn completes effective visibility capture, checked visible slots, figure/compiler document accounting, source/reference bindings and public activation for `xychart`/`xychart-beta`. Empty source maps remain present for hidden authored math, preventing unexpected rendered formulas from escaping source validation. Author guidance documents measured label placement, native truncation and readable fallback.

Final integrated units pass 570 tests across 71 files; typecheck and diff checks pass. Installed release acceptance passes all 11 XY visible formula references through CLI resolution, rendering at 320/1440, no-JavaScript and MathML-unavailable source fallbacks, and print-source visibility. No network or sibling-file requests occur. Encoded provenance is separately unit-tested; the installed reference corpus uses literal formulas. Print evidence does not claim visual chart geometry approval. Independent review has no remaining material finding. Initial fixture errors around native truncation/entity sanitation were corrected against source/native evidence without weakening authored budgeting.

Exact candidate hashes, commands and budget results are recorded in `reports/math/xychart-source-snapshot.json`. Other Mermaid families, full candidate verification, and W5/W6/C01–C08 human gates remain open. No commit, push or publication occurred; the full implementation goal remains active.

## Sankey source ownership and authored validation (2026-10-06)

The previous goal turn completed XY public activation and installed acceptance. This turn begins Sankey with a pinned grammar collector, mapped CSV/generic preprocessing, per-occurrence authored math validation and native parser/sanitizer comparisons. Repeated endpoint records retain distinct origins and all-authored charges before native sanitized-name merging. Node identity, native graph layout, generated values and outlined-label behavior are documented in `sankey-notes.md` for the next integration stage.

All 14 focused tests pass, plus typecheck and diff checks. Independent review found an omitted generic style/classDef semicolon deletion inside quoted CSV; it is fixed and covered through Mermaid's actual parse entry point. Initial fixture errors about native indentation were corrected without changing the accepted grammar. Exact evidence is recorded in `reports/math/sankey-authored-snapshot.json`.

Next implement exact native DB reconciliation and full-artifact contract enforcement, then worker transport, measured layout/visible ownership and compiler/source bindings with installed acceptance. Public Sankey math remains guarded. Other families and W5/W6/C01–C08 remain open. No commit, push or publication occurred; the full goal remains active.

## Sankey native graph reconciliation (2026-10-06)

The preceding goal turn made verified progress on Sankey source collection and authored validation. This turn adds detached native graph capture, strict ordered replay, first sanitized-name ownership, and full-artifact source/bundle contracts. It preserves parallel links, separate authored records, display-equivalent but natively distinct IDs, empty sanitized names and exact numeric state. Public Sankey math remains guarded.

All 20 tests across five Sankey files pass. Source-hook and relocated isolated-bundle snapshots match the unpatched native graph; real sanitation is independently exercised. Typecheck and diff checks pass. Independent review found no production defect; its two coverage requests were implemented and re-reviewed. Native empty-field grammar assumptions in one fixture were corrected against parser evidence. Exact results/hashes: `reports/math/sankey-db-snapshot.json`.

Next wire the pinned contract and synchronous native sanitizer into source/release workers, capture state before awaiting source extraction, and validate lossless transport. Then implement measured rendering/visible slots, compiler/source references and installed single-file acceptance. Other families and W5/W6/C01–C08 remain open. All test/review commands are finished; no commit, push or publication occurred. Full goal remains active.

## Sankey internal worker integration (2026-10-06)

The preceding goal turn verified Sankey native graph replay and isolated dependency contracts. This turn wires the contract into source/release workers, adds synchronous private sanitation and final-parse snapshot capture, and validates lossless transport with all-authored accounting and exact graph ownership. Internal family/cache flags and located error handling are implemented; public activation remains gated.

Integrated verification passes 595 tests across 78 files. Four focused integration tests pass after additional cache-isolation and regenerated-cost forgery assertions. Nineteen fixtures match source and relocated release workers with recorded digests. Typecheck, diff and asset/reference budgets pass; timing checks were not run. Independent review found no blocking issue. Exact evidence: `reports/math/sankey-worker-snapshot.json`.

Next implement measured Sankey rendering and actual visible ownership while preserving native D3 rectangles, cubic flows, generated values and label-style semantics. Then add compiler/source binding and installed offline/reference/fallback acceptance before public activation. Other families and W5/W6/C01–C08 remain open. All commands/reviews are finished; no commit, push or publication occurred. Full goal remains active.

## Sankey measured layout precursors (2026-10-06)

Implemented pure outside-label packing, distinct leader tracks, conservative serialized cubic ink bounds and a pinned browser capture transform. Ten focused tests across three files and typecheck pass. Independent review identified a shared-track ambiguity; the implementation and regression now use separate tracks, and follow-up review confirms the finding resolved. Evidence: `reports/math/sankey-layout-snapshot.json`.

Next implement the browser adapter using these helpers, wire the capture transform, and test native geometry/gradients, literal generated values, outlined-label backdrop, invalid geometry and transactional cleanup. Then complete visible ownership, compiler/source bindings and installed offline acceptance. Public Sankey math remains guarded; other families and W5/W6/C01–C08 remain open. No commit, push or publication occurred. The full goal remains active.

## Sankey browser renderer (2026-10-06)

The previous goal turn completed verified layout/capture precursors. This turn connects them to a measured browser adapter and exact-artifact build transform. Native nodes, cubic flows, styles and complete gradients are retained with translation; labels receive measured outside lanes, literal value lines and an outlined-style backdrop. Invalid geometry rejects, temporary rendering is hidden, and failures restore the root and preserve DB state.

Fourteen browser cases pass across Chromium 320/1440, covering native geometry/gradient parity, all alignments, labels/values, stroke overrides, zero flows and transactional cleanup/recovery. The broader unit run passes 601 tests across 79 files. Typecheck, build, diff and asset/reference budgets pass; timing was not run. Independent review found and resolved Sankey-G2 (native sizing replaced hidden-stage styles), and requested stronger tests were included in the final browser pass. Evidence: `reports/math/sankey-render-snapshot.json`.

Next add actual visible slots and original-source binding through compiler/runtime, then installed standalone/offline/reference/fallback acceptance before removing the public Sankey guard. Other families and W5/W6/C01–C08 remain open. No commit, push or publication occurred; the full goal remains active.

## Sankey public source/export integration (2026-10-06)

The preceding goal turn verified the browser renderer. This turn wires Sankey and its beta alias through public parsing, figures, document budgets, original-source maps and runtime binding, and removes the temporary family guard. Every authored occurrence remains charged; every rendered node selects its first sanitized-name owner. Generated values and outlined backdrops introduce no formula copy. Authoring documentation is updated.

The broad suite passes 601 tests across79 files, followed by29 focused checks after alias and encoded-binding coverage. Installed relocated single-file acceptance passes at320/1440 with four Sankey references, including exact encoded-delimiter source, denied network, JavaScript/MathML fallback and print-source visibility. Typecheck, build, diff and asset/reference budgets pass; timing was not run. Independent review found no blocking issue. Evidence: `reports/math/sankey-source-snapshot.json`.

Next continue the remaining Mermaid coverage ledger and then complete W5/W6 and C01–C08 against a final integrated candidate. These broader requirements and human acceptance remain open. All commands/reviews are terminal. No commit, push or publication occurred; the full goal remains active.

## Radar native-state foundation (2026-10-06)

The previous goal turn completed verified Sankey source/export integration. This turn inventories Radar grammar/native semantics and implements detached DB capture, exact ordered replay and full-native-artifact source/bundle contracts. Source, unpatched native and relocated bundle states agree. Five focused tests, typecheck and diff checks pass. Independent review found and resolved Radar-R1 (metadata spreading could override replayed state); regression and re-review are complete. Evidence: `reports/math/radar-foundation-snapshot.json` and `radar-notes.md`.

Next implement Radar grammar/CST provenance, all-authored validation and common metadata sanitation before worker integration, visible ownership, measured rendering and compiler/export acceptance. Public Radar math remains guarded. The separately imported parser grammar still needs an enforced production contract. Remaining families and W5/W6/C01–C08 remain open. All commands/reviews are terminal; no commit, push or publication occurred. Full goal remains active.

## Radar authored source and native ownership (2026-10-06)

The preceding goal turn verified Radar native-state replay. This turn adds grammar-owned CST collection with original provenance, all-authored math validation, native common-field sanitation, literal axis/curve handling and source-owned visible slots reconciled with actual native state. Overwritten/hidden text remains validated and charged; duplicates remain separate; empty final metadata and native skipped-curve legends retain their semantics.

All 16 Radar tests across five files pass, with typecheck and diff checks. Independent collector/validation and ownership reviews found no blocking finding. Evidence: `reports/math/radar-source-snapshot.json`. Next enforce the imported parser contract and add worker transport/isolation, then measured rendering and compiler/export acceptance. Public Radar math remains guarded. Other families and W5/W6/C01–C08 remain open. All commands/reviews are terminal; no commit, push or publication occurred. Full goal remains active.

## Radar parser contract and worker bootstrap (2026-10-06)

The previous turn verified Radar authored source and native ownership. This turn enforces the separate parser dependency contract across its dispatcher, grammar/converters, service wiring and lazy loader, in both source and release workers. Review exposed static ESM load timing (Radar-P1); the corrected bootstrap entry dynamically loads the worker implementation and requires the patched parser marker. Previously cached unpatched entries and dependencies fail closed.

622 integrated tests across 85 files pass, followed by five focused contract tests covering additional partial-cache cases. Nineteen source/relocated worker fixtures agree. Typecheck, build and diff checks pass; independent follow-up confirms P1 resolved. Evidence: `reports/math/radar-parser-snapshot.json`. The initial pre-fix bootstrap check is superseded by these results.

Next add Radar request/transport integration and private native DB lifecycle handling, then measured rendering, compiler/source binding and installed acceptance. Public Radar math remains guarded. Other families and W5/W6/C01–C08 remain open. No commit, push or publication occurred; the full goal remains active.

## Radar native lifecycle and detached collection (2026-10-06)

Implemented private common-metadata sanitation and capture after a completed native asynchronous parse. Capture detaches the exact installed DB before source collection awaits. Fresh clear authorization is consumed for every parse attempt, including failures; an in-flight clear cannot authorize a successor. Independent review found and resolved Radar-R2, which previously permitted stale common metadata through reused clear state, plus its rejected-attempt capture edge.

The integrated Radar suite passes 22 tests across seven files, including actual Mermaid API parsing and isolated lifecycle regressions. Typecheck and diff checks pass. Independent follow-up accepts the lifecycle/helper scope. Evidence: `reports/math/radar-lifecycle-snapshot.json`.

Next implement serializable Radar transport with numeric and ownership validation, request/cache flags and source/release worker integration. Then add measured rendering, compiler/source bindings and installed acceptance. Public Radar math is still guarded. Remaining families and W5/W6/C01–C08 are open. No commit, push or publication occurred; the full goal remains active.

## Radar internal worker integration (2026-10-06)

Added serializable Radar transport with canonical numeric values, all-authored formula revalidation, native state replay and exact label ownership checks. Source and release workers now install the native contract and private lifecycle handling, isolate request/cache modes, require original source for math and preserve located errors. Independent review found and resolved Radar-T1: the family guard now accepts the attached-colon header admitted by native grammar.

The integrated suite passes 631 tests across 88 files; fourteen source/relocated release worker fixtures agree. Typecheck, build, diff and asset/reference budget checks pass; timing was not run. Independent follow-up accepts this internal scope. Evidence: `reports/math/radar-worker-snapshot.json`.

Next implement measured Radar rendering, then compiler/source bindings and installed standalone acceptance. Public Radar math remains guarded; other families and W5/W6/C01–C08 remain open. No commit, push or publication occurred. The full goal remains active.

## Radar measured browser rendering (2026-10-06)

The previous goal turn completed verified internal worker integration. This turn adds a measured Radar renderer that preserves native polar geometry and curve indices, packs axis labels with separate leader tracks, reserves complete curve/stroke ink and gives legend/title labels measured space. The browser build enforces the native capture and parser artifact contracts. Failure paths restore the caller root and preserve native DB state.

Ten browser cases pass across Chromium 1440/320, including native parity, both graticules, thick strokes, skipped/degenerate curves, label containment, invalid geometry and transactional cleanup. The integrated suite passes 638 tests across 90 files. Typecheck, build, diff and asset/reference budget checks pass; timing was not run; independent review accepts the renderer milestone. Evidence: `reports/math/radar-render-snapshot.json`.

Next implement public Radar source/compiler bindings and installed standalone/reference/fallback acceptance. Public Radar math remains guarded. Remaining families and W5/W6/C01–C08 are still open; no commit, push or publication occurred. The full goal remains active.

## Radar public source/export integration (2026-10-06)

The previous goal turn verified measured Radar rendering. This turn connects native header forms, document budgets and exact visible source ownership through public compilation/runtime binding, updates authoring guidance, and removes the temporary Radar raw-math guard. Independent review found and resolved Radar-S1: empty source maps remain present to attest zero rendered formulas for hidden/overwritten/accessibility-only math.

649 tests across 92 files pass. Installed relocated single-file acceptance passes at 320/1440 with four exact Radar references, encoded-title and duplicate-axis coverage, denied network, readable fallbacks and printed source. Typecheck, build, diff and asset/reference budgets pass; timing was not run. Independent review accepts the public bindings. Evidence: `reports/math/radar-public-snapshot.json`.

Next continue the remaining Mermaid coverage ledger, then verify W5/W6 and C01–C08 against a final integrated candidate. Human gates remain open. All commands/reviews are terminal; no commit, push or publication occurred. The full goal remains active.

## Requirement native-state foundation (2026-10-06)

The preceding goal turn completed verified public Radar integration. This turn inventories Requirement authored/rendered fields and implements exact native parsed-state capture/replay plus a full-artifact contract for source and isolated bundles. Replay preserves first declarations, separate pending buffers, ordered class/style mutations and native clear behavior. Independent review found no material parity defect within the trusted fresh-DB effect boundary.

Six tests across two files, typecheck and diff checks pass. Source-hook and relocated bundle results match unmodified native parsing. Evidence: `reports/math/requirement-foundation-snapshot.json` and [Requirement notes](requirement-notes.md).

Next implement grammar-owned authored collection, sanitation and original provenance before worker integration, measured row ownership, class isolation and public source/export acceptance. Public Requirement math remains guarded. Other families and W5/W6/C01–C08 remain open; all commands/reviews are terminal. No commit, push or publication occurred. The full goal remains active.

## Requirement grammar-owned collection (2026-10-06)

The previous goal turn verified native Requirement state replay. This turn adds constructor-free grammar collection for all authored body/accessibility fields, retaining overwritten occurrences and exact original provenance. Native body reductions apply setters in reverse source order; records now preserve authored order with remapped references while effects preserve native order. Repeated body fields therefore retain first-authored native behavior. The collector attests callback methods, order, arguments and primitive ranges. Independent review found no concrete coverage or attribution defect in this scope.

29 tests across six files pass, including native DB parity, duplicates, inline classes, relationships, exact source bytes and shared metadata isolation. Typecheck and diff checks pass. Initial test fixtures used unsupported syntax and were corrected against native probes; empty quoted body strings are explicitly rejected. Evidence: `reports/math/requirement-collector-snapshot.json`.

Next implement sanitation, all-occurrence math validation/charging and effective row ownership before isolated worker transport and measured rendering. Public Requirement math remains guarded. Other Mermaid families and W5/W6/C01–C08 remain open; all commands and reviews are terminal. No commit, push or publication occurred. The full goal remains active.

## Requirement math validation and row ownership (2026-10-06)

The preceding goal turn verified grammar-owned source collection. This turn validates all authored fields before and after native sanitation, retaining hidden invalid equations and their costs. It normalizes the complete prefixed row with synthetic prefixes, keeps literal body DB values separate, and selects surviving row owners only after exact native DB replay. Standard TeX matrix row separators are preserved for the planned prelayout hook; native backslash collapse is intentionally bypassed in that contract.

46 tests across nine files pass. These include sanitation-erased formulas, entity-created delimiters, same-row identical equations at distinct spans, hidden duplicate/repeated invalid values, correctly escaped matrix notation, CRLF source bytes, normalized common metadata and native owner parity. Typecheck and diff checks pass. Independent review found no blocking defect; its edge-case conditions are covered. Evidence: `reports/math/requirement-math-snapshot.json`.

Next implement isolated native Requirement parsing, serializable validated transport and worker/build integration, then measured row rendering, namespace isolation and public source/export acceptance. Public Requirement math remains guarded. Other Mermaid families and W5/W6/C01–C08 remain open. All commands/reviews are terminal; no commit, push or publication occurred. The full goal remains active.

## Requirement native parse-completion lifecycle (2026-10-06)

The previous turn verified math validation and surviving row ownership. This turn authenticates snapshots inside the synchronous Requirement parser wrapper, before Mermaid's normal API await can expose shared common metadata to another DB construction. Fresh native clears authorize one parse; successful detached snapshots are consumed once using the exact DB instance and parser input. Node math consumes the snapshot before asynchronous collection and checks exact parser-source binding. Independent review found no blocking lifecycle defect within the historical completion-snapshot contract.

28 tests across seven files, typecheck and diff checks pass. An isolated API test proves the race by observing cleared live metadata while preserving the original captured title. Failure/recovery, reentry, wrong receiver/DB, one-use consumption, input mismatch, in-parse clear rejection and private sanitizer restoration are covered. Evidence: `reports/math/requirement-lifecycle-snapshot.json`.

Next add validated serializable transport and production worker request/cache/build integration. Then implement measured rows, namespace isolation and public source/export acceptance. Public Requirement math remains guarded. Other Mermaid families and W5/W6/C01–C08 remain open. All jobs/reviews are terminal; no commit, push or publication occurred. The full goal remains active.

## Requirement serialized transport (2026-10-06)

The preceding goal turn verified native parse-completion capture. This turn adds JSON transport for authored records/variants, sanitation witnesses, effects, native snapshot, row slots and totals. A shared pure helper derives budget identities from local semantic field offsets rather than untrusted transported origins. Both collector and receiver use that helper, while original-source origins remain separate binding evidence. The synchronous verifier rechecks all formula variants, costs and native ownership.

Independent review found R-T1: arbitrary strings in generated stereotype/relationship enum fields could add uncharged display math. Exact native enum checks resolve it; coherent effect-plus-snapshot mutations prove rejection at that guard. Origin-copy budget attacks coherently reducing all costs also reject. 52 tests across eleven files, typecheck and diff checks pass; independent follow-up accepts this internal scope. Evidence: `reports/math/requirement-transport-snapshot.json`.

Next install Requirement contracts/lifecycle in production workers, add request/cache flags and source/release verification. Then implement measured row hooks, namespace safety and public source/export bindings. Sanitation witnesses and final source authenticity remain separate boundaries. Public Requirement math stays guarded; other Mermaid families and W5/W6/C01–C08 remain open. All jobs/reviews are terminal; no commit, push or publication occurred. The full goal remains active.


## Requirement production worker integration (2026-10-06)

The previous turn recorded the verified transport milestone. This turn installs native contracts and parse-completion capture in source and release workers. Requirement requests enforce their declared family, use a distinct cache identity, preserve located failures and return validated JSON transport. Public Requirement math remains guarded until rendering and final source bindings are ready.

708 tests across 112 files pass. Fourteen source/relocated worker fixtures agree, including hidden duplicate formulas, standard matrices, metadata sanitation, source normalization, invalid flags, resource limits and uncached failure recovery. Typecheck, build, diff and asset/reference budget checks pass; timing was not run. Independent review accepts the wiring and test oracles. Evidence: `reports/math/requirement-worker-snapshot.json`.

Next implement measured Requirement row hooks, namespace isolation and browser attestation, then public source/export and installed standalone acceptance. Native shape styling must exclude equation paths, and descendant label positioning must not capture equation content. Other Mermaid families and W5/W6/C01–C08 remain open. All jobs and reviews are terminal; no commit, push or publication occurred. The full goal remains active.


## Requirement measured browser rendering (2026-10-06)

The previous turn completed verified production worker integration. This turn adds pinned prelayout row hooks and detached native graph rendering. It assigns opaque node/edge/class identities, keeps requirement-first relationship lookup, and preserves separate requirement/element nodes with equal names. Math rows use standard TeX and measured bounds before graph layout; corrected packing prevents tall-row overlap and positions final-field-only dividers.

Independent review found R-G1: native label typography did not reach math content. Visual inspection strengthened the test to actual MathML glyph styles. Review then found the later overhang wrapper could reintroduce native span styles. Actual-row measurement and consistent wrapper inheritance resolve both cases; matrix/rlap style and containment checks pass. Hidden staging, injected measurement/commit rollback, DB detachment and recovery are verified.

710 tests across 113 files and 34 browser checks pass, including twelve Requirement cases and shared label/flowchart-shape regressions at 320/1440. Build, typecheck, diff and asset/reference budgets pass; timing was not run. Independent review accepts the renderer and material fixes. Evidence: `reports/math/requirement-render-snapshot.json`.

Next connect Requirement compiler/document budgets, exact original-source/export bindings and runtime attestation, then run installed standalone acceptance. Public Requirement math remains guarded; other families and W5/W6/C01–C08 remain open. All jobs/reviews are terminal; no commit, push or publication occurred. The full goal remains active.


## Requirement public source/export integration (2026-10-06)

The previous turn verified measured Requirement rendering. This turn activates public parsing, document budgets, compiler/runtime maps and installed single-file references. Empty maps remain present for hidden or accessibility-only math. Source mapping compares full transports to private immutable receipts keyed by original/rendered source. Missing receipts use bounded worker revalidation.

Review found R-S1 (coherent equal-TeX origin swaps) and R-S2 (duplicate request IDs binding the wrong response). The receipt comparison resolves R-S1 for Requirement. Unique request IDs and exact response-batch correlation resolve R-S2 before any cache/receipt writes. Adversarial tests prove mutable-cache attacks and invalid duplicate-result batches cannot establish source authority. Independent follow-up accepts these fixes.

746 tests across 117 files pass. The installed relocated single-file candidate passes at 320/1440 with six exact Requirement references, standard matrices, encoded document references, denied network, readable fallback and printed source. Build, typecheck, diff and asset/reference budgets pass; timing was not run. Evidence: `reports/math/requirement-public-snapshot.json`.

The user requested cheaper subagents where practical. Terra handled tests and the bounded cross-family inventory; specialist review handled source-authority decisions. Next generalize source ownership receipts to earlier family maps, with adversarial tests, before continuing the remaining family ledger. Pie/timeline need the final worker records projection; all other active transports pass through unchanged after worker emission. Remaining families and W5/W6/C01–C08, including human gates, stay open. All jobs/reviews are terminal; no commit, push or publication occurred. The full goal remains active.


## Cross-family source ownership and cache isolation (2026-10-06)

The Requirement review opened a source-ownership audit for earlier families. That audit is now closed for all eleven activated families.
Source maps compare final transports against private source-bound worker receipts. Pie and timeline compare their final record projections.
Absent receipts trigger bounded revalidation. Exact original fences, request modes and rendered sources remain part of receipt identity.

Independent review found two bypasses: explicit empty pie/timeline arrays skipped authentication, and returned parser objects could mutate cached transports.
Absent-only fast paths and deep cache isolation resolve both findings. Independent review accepts the final production snapshot.
Terra workers implemented map integration and adversarial tests; the coordinator owned the shared parse authority and integrated verification.

770 tests across 118 files pass, including 24 focused ownership, cache mutation/deletion and stripped-array tests.
The installed standalone candidate passes narrow/wide offline rendering, exact references, fallbacks and print source checks.
Build, typecheck, diff and asset/reference budgets pass. Timing checks were not run.
Evidence: `reports/math/source-ownership-snapshot.json`; details: [source ownership](source-ownership-notes.md).

Next continue the unimplemented Mermaid detector families in the coverage ledger and finish W5/W6.
C01–C08 and human acceptance remain open. All jobs and reviews are terminal; the full goal remains active.
No commit, push or publication occurred.


## Kanban grammar foundation (2026-10-06)

The previous turn closed the eleven-family source-ownership audit. This turn starts the remaining Kanban adapter.
A private native parser now collects exact node, decoration and opaque metadata provenance without changing the shared DB.
A prepared full-artifact contract checks the pinned grammar, DB and renderer; production installation remains pending.

Native probes establish repeated cards under duplicate column IDs and comma-joined typed YAML labels.
They also establish falsy overrides, hidden metadata, dropped classes and order-dependent indentation failures.
Kanban forces SVG text and has separate column, card, ticket and assignee paths; the existing HTML-label hook is insufficient.

Terra handled renderer inventory and bounded collector implementation. The coordinator added independent native and provenance tests.
Review pressure resolved callback indexing, metadata-prefix composition and permissive token matching before acceptance.
47 tests across seven files, typecheck and diff checks pass. Independent review found no remaining material foundation defect.
Evidence: `reports/math/kanban-foundation-snapshot.json`; details: [Kanban notes](kanban-notes.md).

Next decode typed YAML fields with exact provenance, reconcile native state and account for duplicate rendered copies.
Then implement checked transport, measured SVG layout, worker/compiler/source integration and installed acceptance.
Kanban remains publicly guarded. Remaining families, W5/W6 and C01–C08 remain open.
All jobs and reviews are terminal. The full goal remains active; no commit, push or publication occurred.


## Kanban typed metadata and grouping (2026-10-06)

The previous turn verified the grammar collector. This turn adds traced YAML decoding and a pure native copy-group planner.
Metadata preserves typed truthiness, nested and cyclic arrays, alias-definition origins and native string coercion.
Generated commas and object text remain synthetic. Grouping preserves actual parent ordinals and repeated cards under duplicate column IDs.

Two Terra implementation routes handled disjoint helpers. The coordinator added native parity, provenance and resource-boundary tests.
Independent review found K-M1, valid empty YAML slots rejected for missing trace, and K-M2, alias expansion allocated before downstream limits.
Null-slot handling and incremental enforcement of the existing 64 KiB UTF-8 label limit resolve both findings.
Independent recheck accepts the fixes. Its previous alias reproducer now fails at byte 65,537 with substantially lower peak memory.

105 tests across nine files pass, including 34 Kanban cases. Typecheck, diff and document checks pass.
The reviewer independently compared 55,987 grouping inputs and checked exact ASCII, BMP, astral and lone-surrogate boundaries.
Evidence: `reports/math/kanban-metadata-snapshot.json`; details: [Kanban notes](kanban-notes.md).

Next implement native sanitation witnesses, full state reconciliation and all-authored math accounting.
Then add transport, lifecycle/worker integration, measured SVG rendering, authenticated source binding and installed acceptance.
Kanban remains publicly guarded. Other Mermaid families, W5/W6 and C01–C08 remain open.
All known jobs and reviews are terminal. The goal remains active; no commit, push or publication occurred.


## Kanban stored-state replay and sanitation (2026-10-06)

The previous milestone verified metadata decoding and grouping. This milestone adds detached native DB capture, stored-state replay and strict sanitation witnesses.
Replay retains native fields, padding, counters, section aliases and cyclic YAML values.
Reconciliation rejects both changed fields and changed alias topology.
Decoration normalization preserves original truthiness even when sanitation empties the assigned value.
Sanitation records two native passes for HTML-label mode and one for SVG-label mode, preserving supported source origins.

Terra handled the bounded DB helper and sanitation tests. The coordinator added the native oracle, graph comparison and integration checks.
Independent review accepted the final helpers after a minor malformed-witness error correction.
Its separate probes covered 24 native cases, 52 sanitizer cases, cyclic aliases, recovery and artifact contracts.
The combined suite passes 120 tests across 11 files; typecheck, diff and document checks pass.
Evidence: `reports/math/kanban-db-snapshot.json`; details: [Kanban notes](kanban-notes.md).

Next join parser provenance to normalized effects before native parsing and add all-authored math accounting.
Then implement lifecycle capture, checked transport, measured SVG rendering, source receipts and installed acceptance.
The prepared contract remains uninstalled in production; Kanban stays publicly guarded.
Other families, W5/W6, C01–C08 and human acceptance remain open.
All jobs and reviews are terminal. The goal remains active; no commit, push or publication occurred.


## Kanban source-to-state integration (2026-10-06)

The previous turn added verified DB replay and sanitation witnesses. This turn connects them to the grammar collector and typed metadata decoder.
`kanban-source.ts` decodes every metadata document before replay, retains raw and sanitized base fields, and preserves unsanitized metadata overrides.
Ordered effect ownership checks bind decorations to their actual authored node.
The helper produces detached native-state expectations and duplicate-copy grouping without mutating Mermaid's singleton.
Equal equations retain separate source locations; aliases retain definition provenance.

Terra implemented the bounded helper. The coordinator added an isolated source/native oracle and source-ownership tests.
Independent review accepted the final helper with no findings and separately verified native parity, ownership and recovery.
127 tests across 12 files pass; typecheck and diff checks pass.
Evidence: `reports/math/kanban-source-snapshot.json`; details: [Kanban notes](kanban-notes.md).

Next implement all-authored math accounting and the exact column/card/ticket/assignee text variants.
Then add native lifecycle capture, checked transport, measured SVG rendering, source receipts and installed acceptance.
No production hook or public Kanban activation is included in this milestone.
Other families, W5/W6, C01–C08 and human acceptance remain open. The full goal remains active.

A separate reader traced each visible field to the pinned SVG Markdown functions.
The coordinator verified a critical ordering detail: native `getData` precedes the global switch to SVG-label mode.
Card titles, tickets and assignees receive another sanitation pass; column headings do not.
The evidence notes now retain this distinction for math normalization and render lifecycle work.
All jobs and reviews are terminal. No commit, push or publication occurred.


## Kanban field normalization and math budgets (2026-10-06)

The previous turn connected source preparation. This turn adds role-specific normalization, equation validation and per-field occurrence charges.
Terra implemented bounded normalization helpers; the coordinator added field validation, native-function oracles and Chromium characterization.
Separate local positional identities keep repeated YAML aliases distinct even when authored origins coincide.
Hidden variants consume validation charges; additional rendered copies consume canonical math charges.
Standard TeX backslashes remain intact.

Executable probes corrected the earlier reader's SVG-only interpretation.
Mermaid `getConfig` returns a copy, so Kanban's local `htmlLabels=false` does not change the mode read by label helpers.
The normalizer now retains configured mode. Fresh SVG-only use also requires deterministic initialization of native lazy link hooks.
Prepared contract v2 provides that inert warmup and verifies DB/configuration state remains unchanged.
These corrections supersede the source-only mode/lifecycle claims in the preceding milestone; its source-preparation evidence remains valid.

The combined suite passes 137 tests across 14 files; typecheck and diff checks pass.
Fresh HTML-first and SVG-first native-function processes pass 88 cases each after initialization.
Chromium verifies both native label modes with zero network requests and confirms two-stage duplicate-card expansion.
Independent review accepted the corrected helpers with no remaining scoped findings.
Evidence: `reports/math/kanban-field-snapshot.json`; details: [Kanban notes](kanban-notes.md).

Next enumerate all authored fields, retain erased/overridden occurrences and plan actual renderer copies from the DB display list.
Then integrate native lifecycle capture, checked transport, measured rendering, source receipts and installed acceptance.
The prepared contract is still uninstalled; no public Kanban activation is claimed.
W5/W6, other families, C01–C08 and human acceptance remain open. The full goal remains active.
All known jobs and reviews are terminal; no commit, push or publication occurred.


## Kanban authored math and renderer copies (2026-10-06)

Authored-field enumeration now validates visible, erased, overridden and hidden math.
Local positions preserve repeated alias occurrences; exact original intervals establish scalar coverage only within the same field.
An iterative trace walk checks hidden decoded scalars without expanding opaque alias graphs.
Scalar fallback charges stream and stop immediately at the shared budget boundary.

Terra implemented the bounded lazy renderer-copy planner. A bounded adviser resolved the scalar accounting invariant; separate Sol review found no production defects.
The reviewer identified stale evidence after the final streaming correction. Fresh checks resolve that finding: 153 tests across 16 files and typecheck pass.
Chromium directly matches native card order and duplicate multiplicity to the new iterator, with zero network requests.
Evidence: `reports/math/kanban-math-snapshot.json`; details: [Kanban notes](kanban-notes.md).

Native lifecycle capture, authenticated transport, measured rendering, source receipts and installed acceptance remain pending.
Kanban remains publicly guarded. Remaining families, W5/W6, C01–C08 and human acceptance remain open.
The full goal remains active; no commit, push or publication occurred.


## Kanban native lifecycle and source reconciliation (2026-10-06)

Terra implemented the bounded native lifecycle adapter and contract v3.
The coordinator added source reconciliation and strengthened completion-time capture and recovery checks.
The singleton now requires a fresh clear, exact parser/DB identity and unchanged strict configuration for each successful parse.
It records detached native state and resolved dimensions synchronously, before any asynchronous collection.
The source bridge consumes the receipt once, validates all authored math and reconciles native graph state against exact parser input.

The combined suite passes 155 tests across 18 files; typecheck passes.
Independent Sol review found no material lifecycle or reconciliation issue in the final production snapshot.
Draft corrections closed fresh-clear recovery, configuration-capture exception and native per-field-default mismatches before final verification.
Evidence: `reports/math/kanban-lifecycle-snapshot.json`; details: [Kanban notes](kanban-notes.md).

Next implement authenticated worker transport and production registration, then measured rendering, source receipts and installed standalone acceptance.
Kanban remains publicly guarded. Other families, W5/W6, C01–C08 and human acceptance remain open.
All known implementation jobs are terminal. The full goal remains active; no commit, push or publication occurred.


## Kanban checked worker transport (2026-10-06)

The previous turn completed verified internal lifecycle capture. This turn adds the JSON projection and worker integration.
Terra implemented bounded transport and sparse draw filtering; the coordinator connected source/bundled workers and private source receipts.
Formula witnesses reproduce each charge's resource maxima without serializing cyclic YAML or native object graphs.
Only math-bearing nodes expand into draw bindings; all hidden authored charges remain represented.
Structural consistency is separate from full source authentication. Coherent hidden-charge omissions and equal-TeX origin swaps are rejected by the private receipt.

The worker now performs bounded authored preflight before native YAML coercion, then independently reconciles completed native state.
A fixture verifies denied and oversized metadata never reaches native addNode.
Explicit HTML-label configuration matches the native effective default. Mixed-family regression coverage checks the shared worker change.

The shared Mermaid suite passes 764 tests across 115 files. A new maximum-cost witness regression passes in a subsequent three-test transport run.
Typecheck, release build and release budgets pass; timing benchmarks were not run.
Five source/bundled worker cases produce identical JSON, including cyclic YAML, recovery and a mixed Requirement batch.
Evidence: `reports/math/kanban-transport-snapshot.json`; details: [Kanban notes](kanban-notes.md).

Next implement measured rendering and source-map/export integration, then public activation and installed standalone acceptance.
Kanban remains publicly guarded. Other families, W5/W6, C01–C08 and human acceptance remain open.
The full goal remains active; no commit, push or publication occurred.

Independent review found no confirmed material defect in the fixed transport/worker snapshot.
The reviewer independently passed the lifecycle/preflight fixture. Its bundled parity rerun was blocked by sandbox process permissions; the coordinator’s authorized parity run passed.


## Kanban measured rendering and public integration (2026-10-06)

The prior milestone verified transport and worker registration. This turn adds
measured browser layout, native style/outline helpers, authenticated source maps,
compiler budgets and public activation. Duplicate card copies have distinct DOM
and source identities. Hidden authored formulas remain validated and budgeted.
Plain boards retain native rendering; failure keeps readable source.

Terra handled bounded source/export, native helper and acceptance-fixture packets.
The coordinator replaced an unsuitable post-render prototype with pre-layout
measurement. Separate specialist reviews accepted the final renderer and public
source/export integration with no material findings. Reviewers inspected code and
reported evidence; independent full-suite execution was not claimed.

853 tests across 133 files pass. Typecheck, build, asset/reference budgets and
source/bundled worker parity pass; timing budgets were not run. Eight unscaled
browser geometry combinations pass at 320/1440 with two columns, eight cards and
seventeen formulas, recovery and no network requests. Installed acceptance and
exact candidate hashes are recorded in `reports/math/kanban-public-snapshot.json`.

Two standalone fixture assertions were corrected without production changes:
named dollar entities are not Kanban equation delimiters, so the encoded case now
uses YAML Unicode escapes; plain and empty field wrappers are counted separately
from the fourteen formula owners. Initial failure logs are retained.

Remaining Mermaid families and full W5/W6/C01–C08 acceptance remain open. Next
continue the coverage ledger's remaining family adapters and final validation.
No commit, push or publication occurred. The overall goal remains active.


## ER and Info source foundations (2026-10-06)

The previous goal turn completed verified Kanban public integration. This turn
advances the remaining family coverage with ER native semantics and source
collection, plus Info authored-field inventory and source collection.

ER uses grammar ranges and object-identity carriers rather than text matching.
Its record order and native callback-array order remain separate. Independent
review accepted fixes for active Jison state, trimmed group IDs and empty-field
ordering. Native tests establish alias precedence, attribute order, global
accessibility state, group membership and clear-direction behavior.

Info cannot be N/A: its parser accepts hidden title/accessibility text and keeps
all concrete declarations even when the AST overwrites them. The new collector
preserves all source owners. `showInfo` is an optional modifier after `info`, not
a standalone grammar root. Independent review accepted the collector.

Terra handled inventory and bounded tests. An ER implementation draft did not
meet the ownership contract and was replaced by the coordinator; no public
activation or acceptance was based on that draft. Final source hashes, checks
and review dispositions are in `reports/math/er-info-foundation-snapshot.json`.

Next implement ER native-state replay and normalization, then worker/transport,
measured rendering and public source/export integration. Info still needs authored
math validation, resource reservation and worker/compiler integration. Other
families and W5/W6/C01–C08 remain open. The overall goal stays active. No commit,
push or publication occurred.


## ER stored-state replay and Info authored math (2026-10-06)

The previous turn verified grammar-owned source collection. This turn implements
pure ER stored-state replay and Info validation of all authored assignments.
ER snapshots preserve groups and lookup aliases, attribute/spec sharing, endpoint
resolution, styles, alias precedence and clear-direction behavior. Normalized
sanitation results and effective look remain explicit caller preconditions; the
replay does not claim sanitation or completed-parse authentication.

Info validates overwritten formulas, carries cumulative limits and reports exact
original source locations. Per-record costs exclude initial and preceding costs.
Native Info supplies no visible math-label or field-sanitation stage.

Terra supplied bounded implementations and native comparison tests. The
coordinator corrected cumulative cost reporting, argument coercion and sharing
checks before acceptance. Both final production files have independent read-only
review with no unresolved material finding. Reviewers did not independently run
the suite. 808 tests across 123 Mermaid files, typecheck and diff checks pass.
Evidence: `reports/math/er-info-state-snapshot.json`.

Next connect ER normalization and parser lifecycle to replay, then integrate
worker transport/rendering/source export. Info requires checked worker transport,
source receipts, compiler budgets and public activation. Full family coverage,
W5/W6 and C01–C08 remain open. No release integration is claimed for these new
internal modules; the overall goal remains active. All jobs and agents are
terminal. No commit, push or publication occurred.


## Info public integration

Info now validates hidden and overwritten equations through checked worker
transport, full source receipts, compiler budgeting and an authenticated empty
rendered-label map. It retains native version output. Independent production
review has no unresolved material finding.

894 tests across 142 files, typecheck, the 66-file build, five source/bundled-worker
parity cases, asset/reference budgets and installed standalone acceptance pass.
Standalone covers narrow/wide screens, offline single-file operation, print,
no-JavaScript, worker-failure and MathML-unavailable fallback. The initial notice
element assertion was a fixture mistake and was corrected without production
changes. Timing budgets were not run. Candidate evidence:
`reports/math/info-public-snapshot.json`.

ER normalization design now records distinct native text paths, replay-stage
boundaries and rough-look duplicate labels. Generic prose mixed with TeX and
layout-dependent group copies still require executable characterization. ER
normalization/lifecycle/rendering and remaining families are open. Full W5/W6,
C01–C08 and human acceptance remain open; the implementation goal stays active.
No commit, push or publication occurred.


ER follow-up characterization found that native generic-type preprocessing
rewrites TeX tildes, including across generic prose and equation boundaries.
Terra added two executable native-helper/source-contract tests; focused tests
and typecheck pass. This resolves an uncertainty but does not implement the ER
normalization path. Evidence: `reports/math/er-render-semantics-snapshot.json`.
All jobs and delegated work are terminal at this checkpoint.


## ER normalization foundations

Implemented DB-field sanitation/provenance and a shared generic-text edit planner
for math-bearing table fields. The planner makes equations opaque and preserves
accumulated comma-group spans, correcting native cases that discard earlier
text. Plain labels retain the native path when rendering is integrated.

Terra supplied the DB-field draft. Coordinator review corrected whitespace
semantics and replaced self-comparison tests with a real isolated native oracle
using raw authored inputs. The oracle covers 66 role/mode/input combinations.
Precise origin and malformed-witness tests pass. The generic planner and its
provenance helper have five focused tests, including native comparison for
non-overlapping groups. Separate read-only reviewers accepted both production
helpers with no material findings; neither reviewer ran tests.

Shared Mermaid checks pass: 822 tests across 128 files, typecheck and diff checks.
Evidence: `reports/math/er-normalization-snapshot.json`. No build/browser run is
claimed for these internal helpers, which are not yet release-integrated.

Next connect role-specific normalized fields to ER stored-effect replay and a
completed native parser lifecycle, including sanitizer-hook preparation. Then
implement validation/budgets, transport, measured rendering and source maps.
Remaining families, W5/W6, C01–C08 and human visual/accessibility acceptance stay
open. The goal is active. All current jobs and agents are terminal; no commit,
push or publication occurred.


## ER normalized effects and native contract

The collector's DB-owned fields now feed normalized replay arguments, retaining
all overwritten records and graph sharing while rejecting inconsistent owners.
Native Diagram.fromText parity passes in both label modes. A pinned module
contract now exposes ER class/configuration and inert sanitizer preparation;
its executable tests prove detached config and unchanged native DB/common state.
The configuration copy is mutable, so lifecycle code must retain it privately.

828 tests across 130 Mermaid files pass. Typecheck passes after a test-only
change to read look from the captured snapshot, since Mermaid's public DiagramDB
type does not expose ER's getEntity. The final three bridge tests were rerun and
pass. Independent read-only review accepted the bridge and contract with no
material production finding; reviewers did not execute tests. The coordinator
strengthened Terra's test drafts with real preprocessing/native execution,
supported source syntax, mutation checks and graph identity assertions.
Evidence: `reports/math/er-effects-snapshot.json`.

The source-inspected lifecycle design is recorded in er-notes.md. Next implement
its fresh-instance, explicit-clear, synchronous-parse and one-use completion
contract, then connect worker/build registration. Full ER normalization, math
validation/budgets, measured rendering and source export remain open, along with
remaining families and W5/W6/C01–C08/human acceptance. No release integration
is claimed for these new internal modules. All jobs/agents are terminal. Goal
active; no commit, push or publication.


## ER completed-parse lifecycle

Implemented fresh-instance registration, explicit-clear authorization, checked
configuration, synchronous native trace/state capture and one-use exact-source
receipts. Empty preparse-state validation preserves native retained direction
while rejecting unsupported metadata. Historical snapshots survive later native
mutation and globally shared metadata clearing.

Independent review identified caught reentrancy and foreign-clear invalidation
gaps; both were corrected and accepted. The coordinator completed Terra's
initial fixture with 17 lifecycle scenarios, native replay parity in both modes,
and caught-error regressions. 829 tests across 131 Mermaid files and typecheck
pass. Two additional failure scenarios were then added and the final isolated
fixture rerun successfully. Evidence: `reports/math/er-lifecycle-snapshot.json`.

Next register the pinned contract and lifecycle in source/bundled worker paths
and connect consumed state to collector trace comparison and normalized replay.
Full ER math validation, rendering and source transport remain open, as do
remaining families, W5/W6/C01–C08 and human acceptance. No release/browser
acceptance is claimed for this internal helper. All jobs/agents are terminal;
goal active, no commit/push/publication.


## ER source/state reconciliation and worker integration

The node-state bridge now consumes completed state before asynchronous source
collection, compares exact parser input and raw callbacks, and reconciles
normalized replay. Tests prove source mismatch consumes the receipt, historical
state survives later mutation/common clearing, and extra callbacks are rejected
even when final DB values are unchanged. Source and release workers register
the ER contract and lifecycle and use a dedicated plain-ER result path. Existing
ER E_MATH guarding remains; no ER math payload/rendering is enabled yet.

Independent review accepted the bridge and worker/build integration with no
material findings. 913 tests across 150 files, typecheck, 66-file build, six exact
source/bundled worker comparisons, asset/reference budgets and installed offline
single-file acceptance pass. The installed suite covers the already activated
families, print/source fallback, missing worker and missing MathML; this is not
ER rendering evidence. Timing budgets were not run. Candidate evidence:
`reports/math/er-state-snapshot.json`.

The next effective-field ownership design is recorded in er-notes.md, including
first alias, attribute order, group suppression and still-open runtime copy
mapping. Next implement this projection, full field normalization/validation,
resource accounting, measured rendering and source transport. Remaining families,
W5/W6/C01–C08 and human acceptance remain open. All jobs/agents are terminal;
goal active, no commit/push/publication.


## ER effective field ownership

Implemented and integrated exact owners for entity headers, attribute fields,
relationship labels and groups after native state reconciliation. The projection
retains all authored records and distinguishes same-key suppression from ordinary
group membership. Exact-index/source-position tests cover alias precedence,
repeated rows, multiple keys, empty comments, duplicate/empty/nested groups and
relationship resolution timing. Native getData independently verifies display
order, suppression and detached snapshots.

The coordinator replaced an incorrect Terra test draft; its reported pass was
not supported by the failed log. Final production and tests have independent
read-only review with no material findings. 835 tests across 134 Mermaid files,
typecheck, a 66-file build and six source/bundled worker parity cases pass.
Evidence: `reports/math/er-owners-snapshot.json`. Installed browser/standalone and
budgets were not rerun for this internal projection; their previous candidate
evidence must not be relabeled as this build's acceptance.

Next implement role-specific field normalization and authored/rendered equation
validation/resource accounting, then measured rendering and source transport.
Final runtime copy counts remain unproved; ER math remains guarded. Remaining
families, W5/W6/C01–C08 and human acceptance stay open. All jobs/agents terminal;
goal active, no commit/push/publication.


## ER display normalization helpers

Implemented field materialization and five-path display normalization with exact
provenance. Missing fields retain their collector source root; joined key commas
are synthetic. Group cluster/node routes must follow actual native layout, not
authored emptiness. Serialization recovery occurs only at the final input of
sanitizer-owned paths, with table/edge exclusions and TeX backslashes preserved.

Independent review found ER-F1 (missing fields used an unrelated empty source
root); the fix and coordinate/concatenation regressions were reviewed as resolved.
The reviewer inspected tests, without executing them. A Terra agent drafted the
bounded notes update; the coordinator corrected its generic-processing wording.

Final checks: 840 tests across 136 Mermaid files and typecheck pass. Five focused
tests include 90 native sanitation-stage comparisons across paths and label
modes. This is not browser layout or rendered-copy evidence. Build, standalone
and budgets were not rerun for these unintegrated helpers. Exact candidate and
logs: `reports/math/er-display-snapshot.json`.

Next integrate authored/rendered math validation and resource accounting, then
measured rendering and source transport. ER math remains guarded. Remaining
families, W5/W6/C01–C08 and human acceptance remain open. All jobs and agents are
terminal; goal active, no commit/push/publication.


## Authored ER equation validation

`er-authored-math.ts` checks all grammar-owned fields, including ignored aliases
and overwritten accessibility fields. Raw semantic checks precede independent
DB sanitation and trimmed-value check views. Those views recover one restricted
serialization layer without feeding recovered text back into sanitation.
Standard matrix backslashes and source origins are retained.

Occurrence identity uses one local root per grammar field. Variant costs merge
by coordinatewise maximum; distinct positions remain separate even when their
original origins match. Only the collector-established implicit group ID/title
pair shares an authored ledger. Explicit equal-text titles remain independent.
Future display validation must extend these ledgers instead of charging a second
authored base. Rendered-copy accounting remains open.

Native state reconciliation now returns authored validation after source, callback
and stored-state checks. Native tests verify overwritten invalid equations reject,
the failed check consumes its receipt, and a fresh valid parse recovers. Public ER
math remains guarded until measured rendering and source transport are complete.

Independent review found no material defects in the implementation or final
integration fixture; tests were inspected, not run by the reviewer. Initial test
fixtures with unsupported grammar were corrected; production policy was retained.
Final evidence: 845 tests across 137 Mermaid files, typecheck, 66-file release build,
and six exact source/bundle worker comparisons pass. Build reports its existing
CJS import.meta warning. Browser/standalone and budget checks were not rerun; this
is not ER rendered-math acceptance. `reports/math/er-authored-snapshot.json` records
the exact candidate and logs.

Next implement effective display ledger extension, copy accounting, measured
rendering and authenticated source transport. W5/W6/C01–C08, remaining families
and human acceptance stay open. Goal active; all jobs/agents terminal. No commit,
push or publication.


## ER effective display ledger

Integrated effective display candidate normalization with existing authored
equation ledgers. Authored canonical values remain separate from path-specific
outputs. Alternate group node/cluster routes extend maxima without duplicating
base charges. Suppressed entity displays are skipped while their authored math
remains validated. Native reconciliation returns the combined internal math and
exact candidate bindings.

The coordinator implemented ledger/provenance tests. Terra supplied bounded owner
binding tests; invalid initial fixtures were corrected before the coordinator
verified the passing log. Independent production review found no material defects.
852 tests across 139 Mermaid files, typecheck, a 66-file release build and six
source/bundle worker parity cases pass. Browser/standalone and budget checks were
not rerun; this is internal validation evidence, not ER rendered-math acceptance.
Exact source/artifact identities: `reports/math/er-display-math-snapshot.json`.

Next reconcile actual layout routes and persistent copy identities, including
rough erBox background copies and temporary group measurements. Then integrate
measured rendering, source transport and public activation. ER remains guarded.
W5/W6/C01–C08, other families and human acceptance remain open; goal active.
No commit, push or publication.

Final test-only independent review found no material findings. All jobs and
agents are terminal at this checkpoint.


## ER native prepared-graph ownership

Added browser-safe ordinal ownership tags and detached graph observations.
Eight pinned native preparation cases prove token survival and expose actual
winners for duplicate groups, entity-ID collisions and repeated self-loops, plus
empty/nested/external groups, rough metadata and native cycle rejection. A cheaper
Terra agent supplied the bounded fixture-harness inventory. Independent review
accepted the implementation and tests without material findings.

854 tests across 140 Mermaid files and typecheck pass. Evidence:
`reports/math/er-layout-owners-snapshot.json`. The new helpers are not imported by
production rendering yet; build, browser/standalone and budgets were not rerun.
Earlier build evidence must not be relabeled as acceptance of these helpers.

Dagre-specific contract: Dagre has no temporary measureGroupLabel pass; the later browser audit establishes that the pinned default is ELK.
Actual prepared graph winners must determine label field/path, including raw
entity names drawn as clusters after generated-ID collisions. Next integrate
these owners at pinned preparation/measurement boundaries, verify native label
call traces and rough foreground/background copies, then derive source transport
and activate ER rendering. Existing pre-layout display bindings remain candidates.

Remaining families, W5/W6/C01–C08 and human acceptance stay open. Goal active;
all current jobs and agents terminal. No commit, push or publication.


## ER selected-layout correction and Dagre labels

Implemented the Dagre retained-label planner and raw-cluster normalization path.
Independent review found ER-P1 (non-extracted top-level entity collisions fail
native painting); fixed with failure and nested-positive regressions. Native
receipt contract version 2 now captures configured layout and rejects drift.

The cheaper Terra browser fixture exposed the earlier default-layout assumption:
pinned Mermaid defaults to ELK, which retains duplicates that Dagre overwrites.
After resolving selector and assertion gaps, the coordinator reran the corrected
module-bundle browser matrix. It verifies eight modes, both layouts' exact final
ordinary-label copies, retained empty groups, native Dagre collision failure and
zero network. This is not ER measured-math or temporary-copy acceptance.

854 tests across 140 Mermaid files, typecheck, a 66-file build and six source/bundle
worker comparisons pass. Final targeted native/browser tests pass after assertion
strengthening. Snapshot: `reports/math/er-dagre-labels-snapshot.json`. Installed
standalone and asset budgets were not rerun for this internal work.

Next implement default ELK ownership/measurement, resolve layout dispatch, and
connect math measurement and source binding. Do not apply the Dagre plan to ELK
or change the default to simplify support. ER remains guarded; W5/W6/C01–C08,
remaining families and human acceptance remain open. Goal active; no commit,
push or publication.

Final independent test-delta review confirmed both acceptance gaps resolved, with
no new findings. All current jobs and agents are terminal at this checkpoint.


## ER default ELK labels and copy budgets

Implemented the default ELK label planner and a shared planned-copy budget helper.
The planner keeps ordinal identity through native sorting/collisions, accounts for
rough entity copies and distinguishes temporary group measurement from retained
labels. Independent review found ER-B1: unequal variants received an order-dependent
credit. Fixed using per-component sum-minus-maximum increments, with unequal real
variants, crossed maxima, repeated copies and exact byte/element limits tested.
The independent recheck accepted the fix.

A cheaper Terra agent produced the bounded temporary-measurement probe. Its rough
failure needed coordinator diagnosis and stronger identity assertions. The final
probe compares instrumented and unpatched native bundles across 32 runs. Unique
groups pass all modes. Native handDrawn duplicate-ID groups fail in both bundles;
temporary labels are removed before the failure. Rect-entry prefixes are not
successful retained output. No math, geometry parity or atomic cleanup is claimed.
Independent review accepted the final fixture and assertion scope.

859 tests across 142 Mermaid files, typecheck, a 66-file build and six exact
source/bundle worker comparisons pass. Toolkit:
`75c6b642d0597e43c9404594a0e862bca7b9043da56799f308917b8b696dc7da`.
Evidence: `reports/math/er-elk-labels-snapshot.json`. Browser probe passed with
zero network; installed standalone and asset budgets were not rerun.

Next integrate actual resolved-layout hooks, selected-path normalization,
measurement and source binding. ELK preparation changes edge input before the
later math text hook; Dagre raw-cluster paths need selected-owner validation.
Planned-copy helpers are not yet used by the renderer. Public ER math remains
guarded. Remaining families, W5/W6/C01–C08 and human acceptance stay open.
Goal active; current jobs and agents terminal. No commit, push or publication.


## ER selected-plan math bridge

Added `er-planned-math.ts` to normalize only layout-selected paths, retain full
authored validation, reserve physical-copy work and locate selected equations in
the original source. ELK edge preparation remains separate from semantic recovery.
Plan-provided provenance is reconstructed from reconciled field owners. This is
node-side preparation, not an active browser renderer or transport authenticator.

Independent production review accepted the bridge. A cheaper Terra reader checked
regression gaps; additions cover hidden/ignored invalid math, inherited totals,
distinct equal-source equations, the last identical Dagre self-loop source and a
hidden alias behind raw-cluster collision. Final review requested full start/end
spans for equal aliases; that assertion was added and rerun successfully.

862 tests across 143 Mermaid files and typecheck pass. The final test-only span
assertion then passed its two-test targeted rerun. Evidence:
`reports/math/er-planned-math-snapshot.json`. No build/browser/standalone/budget
rerun: production imports do not yet reach this new helper. Earlier renderer
artifacts must not be cited as acceptance of the new bridge.

The concrete runtime seams are recorded in er-notes.md: ER staged draw wrapper,
shared post-preparation/pre-measurement boundary, explicit erBox/labelHelper slots,
temporary group slot, cluster and edge hooks. Preserve graph identities, compose
existing shared-shape patches, and measure math before native geometry decisions.
Do not import node purification into browser hooks or consult mutable live DB
state after consuming a historical parse receipt. Native getData capture and the
selected-layout/source transport contract must be integrated with these hooks.

Goal active. Public ER math stays guarded; remaining families, W5/W6/C01–C08 and
human acceptance remain open. All current jobs/agents are terminal. No commit,
push or publication.


## ER historical native graph receipts

Contract v3 now captures detached native graph data synchronously at parse
completion. It avoids mutating the live DB and preserves receipt history across
later DB/common-state/config changes. Native planning fixtures consume that graph.
An explicit planning-config projection reproduces ER→Dagre spacing precedence;
it does not claim a full historical render-config snapshot. Default native config
contains functions, so the disproved full-config clone proposal was replaced by
this graph-only contract rather than rejecting normal defaults.

Independent review found ER-CAP1, final config capture after the last poison check.
The capture now finishes before final invalidation checks and receipt publication.
The recheck accepted the fix. Lifecycle regression covers 23 cases, including final
capture invalidation and valid recovery. A bounded Bonsai test-worker attempt was
unavailable on this account; Terra completed the native oracle instead. Coordinator
review corrected its native-ID, class-order and spacing-precedence assumptions
before accepting the passing oracle.

862 tests across 143 Mermaid files, typecheck, a 66-file build and six exact
source/bundle comparisons pass. Toolkit:
`d9cbd1de2c29061f5a71dfef660d16e6354c11f3c43219e53945e73c8661a7a7`.
Snapshot: `reports/math/er-data-capture-snapshot.json`. Browser/standalone and asset
budgets were not rerun for this node capture work. Public ER math remains guarded.

Next use historical graph/owners and selected plans at actual resolved-layout and
measured field hooks, with staged rollback and exact per-slot coverage. Do not read
live DB after receipt consumption, pass executable config through source transport,
or claim configured layout proves registry resolution. Remaining families,
W5/W6/C01–C08 and human acceptance remain open. Goal active; all jobs/agents
terminal. No commit, push or publication.


## ER runtime layout boundaries installed

Added private stage-scoped runtime hooks after ER registry resolution and after
native graph preparation, before measurement. The shared browser build now installs
both hash-pinned patches. Missing/repeated/out-of-order calls, overlap, caught
errors and stale async completion invalidate the stage; cleanup releases context.
The caller still owns DOM rollback and final source binding. No authored attribute
activates these hooks, and public ER math remains guarded.

Terra supplied bounded patchers/tests; coordinator fixed their named-import
integration. Independent review found ER-H1, resolved family/layout drift during
async preparation. Both post-await and final-return checks now reject drift.
Regression/recovery tests and independent recheck pass. The integrated suite also
caught changed missing-pie diagnostic ordering; the original ordering is restored.

Actual Chromium builds through the shared plugin verify six modes: ELK, Dagre and
unregistered-layout fallback × both label modes. The probe confirms hook identity
and ordering, awaited preparation before labels, expected ordinary output, failure
propagation, same-root context recovery after explicit SVG reset, inactive flowchart
smoke behavior and zero network. It does not prove automatic DOM rollback or ER
math measurement.

980 tests across 162 Mermaid/runtime files, typecheck, build, installed standalone
verification and all asset/reference budgets pass. Final rebuild after diagnostic
ordering repair yields the same toolkit bytes already exercised by standalone:
`f658e2f8a572664219aa6311d7536c0a1bce9f58eb91f7aa3a26543c537ca59b`.
Snapshot: `reports/math/er-runtime-boundaries-snapshot.json`; standalone JSON/HTML
are copied under this milestone prefix to preserve candidate evidence.

Next register the staged ER renderer and connect exact field/copy slots at erBox,
labelHelper, temporary group measurement, cluster rect and edge labels. Use real
math bbox before native sizing; require complete slot coverage and retained source
bindings before commit. Remaining families, W5/W6/C01–C08 and human acceptance
stay open. Goal active; all jobs/agents terminal. No commit, push or publication.

## ER measured table fields installed

Added private field dispatch and measured table labels before native row/column
sizing. Header and all four attribute fields carry explicit field/copy identities.
Math bypasses native generic/text rewriting; plain content stays native. Pending,
failed, detached and stale field invocations invalidate their stage.

Cheaper Terra workers supplied build hooks, a browser-test draft and next-boundary
research. Independent review found ER-T1 (native renderOptions occupied argument
three); the fixed hook keeps options third and copy identity fourth. Recheck closed
that finding. The coordinator corrected the browser draft's grammar and geometry
assumptions, rejected a private-entity TeX workaround, and ran the final fixture.

985 tests across 162 Mermaid/runtime files pass, together with typecheck, the
66-file release build, asset budgets, installed standalone/offline verification,
and native layout-boundary regression. Eight native table browser modes pass exact
field/key counts, real fractions, per-copy table/row containment and row/column
nonoverlap, failure and explicit-reset recovery. No network is used. These checks
cover the passive table hook, not public ER source binding or automatic rollback.
Toolkit: `586e68185ec76d7f3ac827b7a3a65e0ca7e6af1a802ccd78e008211ac1d9de41`.

Public ER math remains guarded. Native quoted aliases reject backslashes, so
command-based header equations need a parser-compatible solution preserving normal
LaTeX and source provenance. The passing fixture uses header powers and fraction
comments; it is not evidence for command-based headers. Remaining work includes
simple/group/edge labels, staged ownership and rollback, source transport, remaining
families and W5/W6/C01–C08. Goal remains active; no commit, push or publication.

Final independent fixture review closed its resolved-layout assertion gap; the
actual ELK/Dagre matrix rerun passes. No material finding remains in this bounded
slice. Evidence: `reports/math/er-table-snapshot.json`. All jobs are finished.

## ER headers and quoted command syntax

Simple ER headers now use measured MathML before native rectangle sizing, with
native fallback and minimum-width behavior preserved. A shared pinned lexer
extension admits normal commands in quoted math-bearing entity names without
rewriting source text. This resolves the command-header gap in the preceding
entry; it also applies to declarations, endpoints and group headers. The plan now
records this explicit lexical exception rather than implying native admission is
unchanged. Ordinary strings retain their native token route.

Terra supplied the bounded build and grammar patches. The coordinator implemented
the runtime/fixtures and integrated them. Independent review found ER-G1, a mismatch
for Unicode line separators inside a math span. The fixed predicate and positive/
negative regressions passed recheck. Node evidence covers nine admitted contexts,
ten rejected cases, unpatched role/comment parity, source spans and located
forbidden-command errors. Both eight-mode browser matrices now exercise actual
fraction headers, including narrow/wide simple-header sizing and table geometry.

The user's pacing concern is warranted: prior work over-fragmented private helpers
and repeated full release validation too often. Next work should complete the
remaining ER renderer/controller/transport as an integrated family slice. Use
focused tests during development, then the combined browser and installed suite
at the integration boundary. Keep the original all-surface scope; do not count
interim rejection guards as support or infer a scope reduction from this change
in execution approach.

Current combined candidate: toolkit
`2537ef6a3f88ce9e6b99d24c41965ea483845459a63cd3b8edab914a9c5695f5`.
Final checks already passed: 989 tests/163 files, typecheck, build66, both eight-mode
browser fixtures (no network), six-case source/release worker parity, asset budgets
and tracked diff check. Logs use `reports/math/er-header-*`; grammar node report is
`er-header-grammar.log`. Review has no remaining material finding in this scope.
The post-review change to the build patch is a documentation comment only.

Checkpoint while answering the user's status question: installed standalone
verification is still running in exec session `72623`, logging to
`reports/math/er-header-standalone.log`. Re-poll that specific handle; do not rebuild
or restart because of a timeout. Once complete, preserve standalone JSON/HTML under
this milestone prefix and write `er-header-snapshot.json`. All subagents and other
jobs are terminal. Overall goal remains active and W5/W6/C01–C08 remain incomplete.

The pending installed check completed successfully (session 72623 exit 0).
Standalone JSON/HTML are preserved under `er-header-standalone`; exact bounded
candidate evidence is now `reports/math/er-header-snapshot.json`. No job remains
live from that checkpoint. Continuing the integrated ER family work.

## Integrated ER labels, shared slots and transactional staging

Continued after the status-only turn (classified as no progress). Group/cluster
and relationship label hooks now join the previously implemented entity header
and table hooks. `er-fields-browser.mjs` passes all eight ELK/Dagre × HTML/SVG
label × default/handDrawn modes with fractions, exact retained label coverage,
no surviving temporary measurement nodes and zero network requests. It also
rejects forged keys, unowned formulas, leaked temporary nodes and detached stages.
The real native draw commits through `withERRenderStage`, and an injected failure
after a second complete native draw restores the previously committed outerHTML
in every mode. This does not yet prove complete geometry or public source binding.

Shared `er-slots.ts` enumeration now joins existing source-validated plans through
`er-slot-plan.ts`; native ELK and Dagre topology fixtures exercise that join,
preserving provenance and authored work accounting. A Terra reader found no
material enumeration mismatch; Terra implemented the source join and transaction
unit tests. The coordinator integrated native/browser fixtures, added runtime
slot accounting and transactional staging. Independent runtime review is pending.

Evidence in progress: `reports/math/er-fields-browser.log`,
`er-fields-focused.log`, `er-fields-typecheck.log`. Typecheck passed. Focused tests
include native source planning, slot join, stage lifecycle and rollback. No full
release rebuild/standalone rerun was performed for this intermediate integration.
Public ER remains guarded until worker transport, source binding, renderer factory
activation and combined acceptance tests are complete. Overall goal remains active;
W5/W6/C01–C08 and remaining families are not complete. No commit/push/publication.

Independent runtime review found successful rerenders retained old graphics. Fixed
commit to preserve direct style/defs infrastructure only; both unit and all eight
real browser modes now perform two successful draws and then an injected failure.
The browser matrix passes with no duplicates and exact rollback. A second review
finding proposed omitting empty Dagre relationship labels. Actual browser execution
rejected that proposal: Dagre's measurement path calls insertEdgeLabel unconditionally
(dagre-6A5THRUB.mjs:366/372), unlike the common/ELK hasEdgeLabel path. The original
Dagre planner behavior was restored. Added real empty normal/self-loop cases for
both layouts, proving one retained empty label for Dagre and none for ELK. This
pressure test prevents a review-induced regression. Final focused suite: 26 tests
across six files; typecheck passes. Independent finding disposition recheck pending.

Independent recheck closed the duplicate-redraw finding and withdrew the empty-role
finding after tracing the actual Dagre measurement path. Restoration and adjusted
empty-role browser expectation subsequently passed (session 92307 exit 0); final
focused run session 91357 also exited 0. No live test jobs remain. Public factory,
worker transport/source binding and full ER geometry acceptance remain next work.

## ER public integration candidate

Previous continuation was progress: native group/edge hooks, shared slots/source
join and stage rollback were implemented and verified. This continuation connects
`prepareERNodePlan` to the actual source and bundled workers, using pinned native
layout resolution and synchronous Dagre cluster reset before/after preparation.
The worker carries JSON-only ER transport with recomputed authored, hidden,
temporary and rough-copy work charges. Private source receipts authenticate the
exact payload before compiler source-map generation. Public figure resolution,
document budgets and compiler output now carry ER math; the old ER source guard
has been removed. The staged renderer is installed at the native draw boundary
without a second getData call. Runtime binding requires all retained ER labels.

Terra implemented native Node planning and the pinned loader/plugin; Sol implemented
transport validation. The coordinator integrated worker/compiler/runtime paths and
source binding, added source-map and real-browser copy tests, and extended the
installed standalone fixture with ER equations and fallback checks. Independent
review of the integrated candidate is running in `/root/er_runtime_review`.

Checks passed: 111 ER tests across 30 files; 1,010 broader Mermaid/runtime tests
across 169 files; typecheck; release build (66 files), toolkit
`571449826b2f99f4c23f41a4d877278fe3470551e4fdd09e4ec46957b1ef1119`;
five mixed source/release worker parity cases; eight native factory browser modes;
three complete worker-to-browser source-selection cases with fractions, groups,
relationships, repeated self-loops, BOM/CRLF/dedent and raw comparison sanitation.
Browser tests deny network and record zero requests. The rendered source-selection
screenshot was inspected: fractions, groups and relationships appear in their
expected native layout. This is not full geometry/print or human acceptance.
The transport worker separately reports six tests and a later typecheck pass.

Installed standalone validation is running in session 79892, log
`reports/math/er-integration-standalone.log`. Poll that exact session; do not restart
it because the log is quiet. No remaining worker writer is active. Independent
review may still require fixes. Goal remains active; all remaining diagram
families and W5/W6/C01–C08 remain in scope. No commit, push or publication.

All pending integrated checks completed: installed standalone session 79892 exit 0,
asset budgets session 31429 exit 0, fourth end-to-end browser source case (quoted
command-bearing entity name plus relationship) session 45623 exit 0. Standalone
JSON/HTML preserved under `er-integration-standalone`; all source-browser cases
made zero network requests. Independent integrated review found no confirmed
actionable defect after tracing classification, lifecycle/config, native planning,
transport budgets, source authentication, compiler/runtime binding and packaging.
It explicitly leaves W5 native geometry/visual acceptance outstanding.
No jobs or writers remain active. Source/release integration is now functional;
next work should close ER's remaining geometry acceptance and advance the next
unsupported family, not restart passive helper exploration. The global goal is
not complete. No commit, push or publication.

Artifact identity clarification: the standalone report and current release manifest
both identify toolkit `ee7fe675b2d2988eb8ad262b3f468248c9b15a69443e8854ff1338e2f8b0ed91`.
The earlier parallel build log printed `571449...`; do not use that earlier digest
as the installed-check candidate identity. `er-integration-snapshot.json` records
actual final file hashes, including the current manifest and preserved installed
report/HTML. Source/release parity was checked after the broad test jobs finished.

## Status checkpoint: ER geometry and swimlane candidate

ER geometry now passes 24 browser configurations (320/390/1440 widths,
ELK/Dagre, HTML/SVG labels, default/rough rendering), with network denied.
Fixed zero-height empty ELK groups and temporary group measurement that ignored
compiled class/inline fonts. The oracle now checks whole mixed labels, independent
owner outlines, label overlap, sampled edge crossings, and page overflow.
Evidence: reports/math/er-geometry-browser.log and er-geometry-tests.log
(23 tests across four files). Independent review found no implementation defect;
its low-priority oracle coverage gap was addressed by mixed-label and class-font
cases. Final recheck/typecheck and combined release verification remain pending.
The prior installed ER candidate predates these geometry fixes.

Terra worker /root/er_node_plan completed bounded swimlane reuse through the
Flowchart path and reports TB/LR Node and browser fixtures passing. Root integration
review and independent review remain pending; this is not accepted family coverage.
Agent is terminal; no root test jobs remain running at this checkpoint.

User requested a candid status update about duration. Core Markdown/native math,
numbering/references, readable fallback and offline single-HTML behavior have
working tested milestones. Exhaustive Mermaid family support remains the major
unfinished scope, together with final integrated V&V and human acceptance.
Goal stays active. No commit, push or publication.

## Swimlane integration review and failures

The prior status-only turn was no implementation progress; this continuation
changed integration code and produced new evidence. Focused ER/swimlane checks
passed 25 tests across five files, and typecheck passed. The enhanced native
swimlane browser fixture now exercises real math (shared build plugin), tall/wide
lane/node/edge labels, TB/LR at 320/1440, ambiguity rejection, network denial and
ordinary-flowchart rendering afterward.

The first combined installed check failed because the lane target did not map:
source binding succeeded, but `findDrawn` accepted only render-prefixed groups,
so the narrow-screen viewer defaulted to lists and hid the SVG. Fixed with an
exact unique native swimlane group mapping scoped by the SVG diagram role.
An initial review concern about native layout activation was withdrawn after
tracing Mermaid's diagram-scoped config promotion; no unnecessary runtime config
change was made.

Independent review also proved that suffix edge-label matching fails for valid
explicit IDs `foo` and `bar-foo`. The fix carries the exact native edge ID into a
private renderer attribute and uses that identity for source and target mapping.
Terra is implementing the pinned build transformation plus real browser collision
regression; root owns binding/target changes and installed checks. Review recheck
is pending. A browser test wrapper failed under Vitest's isolated HOME because
Playwright could not find its browser cache; the unit file now tests binding with
jsdom, while the real browser fixture is executed directly as other geometry
fixtures are. This environment failure is not counted as a passed check.

## ER/swimlane combined candidate passed

Final toolkit: `68f651e5f101d154303809333001c4e50dfee39ca429d02c9b703de412c11f08`.
The manifest after the final test build exactly matches the installed-check digest.
File identities and check list: reports/math/er-swimlane-snapshot.json.
Preserved installed output: er-swimlane-standalone.json and .html.

Passed: 44 focused tests across seven files, typecheck, native swimlane browser
geometry/collision matrix, asset budgets, installed single-file acceptance in
320/1440 rendered modes, no-JavaScript source, worker/renderer failure, exact
lane/node/edge source-copy plus CLI reference resolution, and zero HTTP(S)
requests. Logs: er-swimlane-final-tests.log, er-swimlane-typecheck.log,
swimlane-browser.log, er-swimlane-budgets.log, er-swimlane-standalone.log.
The budget check's sandboxed attempt could not export; its authorized rerun
passed. An ER composition assertion expected the old textual return statement;
updated it to require the preserved ER/Kanban composition followed by the new
swimlane transform. The final 44-test run passes this assertion.

Independent Sol recheck closed both material swimlane findings and ER's low
oracle gap. No remaining actionable finding in that assigned scope. This is not
whole-feature completion: remaining families, complete shape coverage and final
C01–C08/human gates remain open. No test jobs or writers remain running. No commit,
push or publication. Terra's read-only next-family assessment is complete.

Next concrete adapter: agentflow-beta. Native diagram-22UHCM2B.mjs has a distinct
parser/DB, despite reusing shared rendering helpers. It preserves comments for
Jison locations; do not reuse the Flowchart parser mapping which deletes them.
Whole-element db.elementMappings are insufficient for exact label spans. Build a
pinned reduction/lexer-range collector, preserving original fence provenance,
then reconcile vertex/edge/flow/connector labels and metadata label overrides
against raw DB and one getData snapshot. Include accessibility/title fields and
collapsed-flow visible/hidden ownership. Shared measurement can likely be reused,
but actual DOM identities must be characterized. Do not activate from native
helper use alone. Read-only assessment by /root/er_node_plan; no implementation
started for this family.


## User scope amendment: defer Mermaid

User: “If we are retiring mermaid can we just not worry about it for now?”
Remaining Mermaid work is deferred, not completed. The plan now explicitly removes
unfinished W5/COV-25/COV-26 work from the current math completion gate. Preserve
existing changes; do not activate Agentflow or perform a Mermaid removal project.
Next work is the retained Markdown/native-visual/standalone acceptance audit.

Checkpoint of interrupted Agentflow work: source collector and native DB
reconciliation pass 11 cases; real browser basic/typed-array source selection
passes with no requests; expanded/collapsed geometry/binding fixture passes.
Final focused log reports 62 tests across seven files passed, and typecheck log
contains no errors. Public Agentflow classification/guard remains unchanged.
Files and evidence are under agentflow-*; no final installed Agentflow verification
or whole-family acceptance is claimed.

Sol identified native YAML alias expansion before bounded math validation as an
outstanding pre-activation concern. Do not activate the adapter without resolving
it. No further fix is being pursued under the user's deferral. The adviser route
was unavailable due to the agent thread limit; Sol provided the bounded analysis.
Both active workers are now completed; the older er_table_browser agent remains
interrupted. The interrupted root tool invocation produced completed focused-test
and typecheck logs; no live command handle was returned. No commit or publication.


## Retained-scope regression and delivery fixes (2026-10-06)

The preceding scope-only response made no implementation progress. This run
revalidated the amended plan and executed the next available checks.

- Full Vitest: 2,461 passed / 3 failed across 275 files. Preserved log and JUnit:
  `reports/math/retained-full-suite.log` and `retained-full-suite-junit.xml`.
  Two failures are the previously reproduced baseline catalogue word counts
  (architecture 711; trace 780, limit 600). The third is an assertion against
  esbuild's truncated error summary. It now checks the structured error array;
  its focused regression passed. No Mermaid adapter work was resumed.
- Full Chromium tier, pre-fix release: 1,105 passed / 411 skipped / 10 failed.
  All failures name Mermaid specs (inline, state provenance, label geometry).
  These remain recorded under deferred scope, not passed or silently discarded.
  Preserved `retained-browser.log`, `retained-browser.json` and JUnit in reports/math.
- Typecheck, network-isolated offline check, asset budgets and clean-machine
  installation passed before the delivery fixes. Preserved `retained-*` logs;
  offline and budget JSON copied alongside them. These are not final candidate
  acceptance after the source edits below. Release inventory is preserved as
  `retained-pre-serve-fix-release.json`.
- Independent Sol review found `serve.ts` omitted math.js from its asset routes.
  Added conditional routing and math/no-math HTTP tests with a base-path prefix,
  content type, CSP and exact released asset bytes. Both new cases passed.
- Terra's new COV-01–05 compiler tests exposed image-alt math producing
  E_SPAN_UNPROVEN. The native image rule recursively parses a label-relative
  string, so its offsets cannot use the paragraph map. Alt text now preserves
  literal readable LaTeX; a scoped flag around the native image rule suppresses
  inline conversion there only. A tokenizer test proves surrounding and linked
  formula source spans survive; it passed. Compiler test expectation cleanup
  remains in progress (existing strike markup and content-addressed image URL).
- Sol also reproduced a retained resource-accounting mismatch: compiler charges
  canonical conversion bytes, while runtime adds generated root attributes.
  At 792 copies of `x x x x x x x x x x`, compile accepts 8,380,944 bytes but
  runtime charges 10,637 bytes per occurrence and falls back for the last four.
  Readable fallback limits impact, but this is an unresolved medium correctness
  issue against pre-publication expanded-output validation. Do not close C06/C07.
  Preferred next investigation: shared conservative insertion accounting with a
  derived, tested attribute allowance, retaining actual runtime bound checks.

Decision and coverage records now explicitly defer Mermaid. Remaining acceptance
work includes complete retained field/path mappings, exact-candidate checks after
fixes, contract evidence enforcement, independent finding disposition and human
notation/visual/print/accessibility approval. No human gate has been marked passed.

Integrated fix check completed: 26/26 tests across four files passed in
`reports/math/retained-fixes-tests.log`; final typecheck passed. Sol independently
reviewed the image-alt guard with no finding. New compiler tests check existing
strike markup and content-addressed image URLs; they now pass. Source/release
identities are in `reports/math/retained-fixes-snapshot.json`. The full browser
process and all root command handles are terminal. No further build/check is
running. Next action is the shared insertion-cost correction, then fresh affected
checks and retained coverage mapping. No commit or publication occurred.

Final bounded review added a second open medium finding: the validation child
caps stdin at 4 MiB although the parent protocol permits 16 MiB. Sol's 1,000
unique expressions (`x%` + 2,030 backslashes + a four-digit suffix, 2,036 source
bytes each) render only x because the rest is a TeX comment. Their aggregate
SVG is 1,257,000 bytes / 5,000 elements, but JSON serialization is 12,240,017
bytes. The worker exits before parsing and parent reports generic E_MATH instead
of a source-located E_LIMIT. Review pointers: `math/validate-worker.ts:7-10`,
`math/validate.ts:21,65-72`. Next correction must align a shared request byte cap
and check serialized request size before spawn; retain a regression for escaping
expansion. This finding also prevents C06/C07 acceptance.


## Resource-bound fixes and interrupted-run recovery (2026-10-09)

Previous turn made implementation progress. The resumed browser handle 17476
was no longer present; its completed log records 15/15 math browser cases passed
across the full Chromium viewport/motion matrix (14.2 seconds). No restart was
needed. Typecheck log is clean. Evidence: reports/math/resource-fixes-browser.log
and resource-fixes-typecheck.log.

Both medium resource findings are resolved and independently rechecked by Sol:
- Shared insertedMathCost reserves a derived 196-byte union of runtime SVG root
  attributes; validate, final compiler occurrence counting and browser insertion
  charge identically. Runtime verifies actual decoration stays within the bound.
  Native numeric dimensions normalize before insertion. The policy fingerprint
  includes this allowance; expression/document caps are unchanged.
- Parent and child share the 16 MiB IPC cap. Parent rejects oversized serialized
  requests pre-spawn with source-located E_LIMIT. A valid 12,240,017-byte request
  with 1,000 unique formulas passes; a 26,056,017-byte request fails before a
  nonexistent worker starts. The worker decoder preserves split UTF-8 sequences.

Full suite before the final UTF-8 decoder edit: 2,473 passed / 2 baseline catalogue
word-count failures; 276 files. Preserved resource-fixes-full-suite.log and JUnit.
After final decoder edit: 35 focused tests passed across policy, runtime, worker
validation, including a deliberately split UTF-8 transport regression. Evidence:
resource-fixes-focused.log. Final math browser and typecheck results above cover
that edit. These focused checks do not establish all completion gates.

Next retained work: fill field-specific delivery/projection coverage. New native
family tests target COV12–16 and figure title/question/body. Terra owns a separate
COV08–10 detail-surface test file. No production changes delegated in this batch.


## Retained field coverage and mobile dragging (2026-10-09)

Added compiler.math-detail-surfaces.test.ts (COV08–10) and
compiler.math-native-fields.test.ts (COV11–16 plus partial COV07). The integrated
run passed 7 tests / 2 files in reports/math/retained-field-coverage.log. The
coverage ledger now maps those assertions and corrects existing native-display
applicability using IMPROVEMENTS §3.4 (owner/shape/units remain in list/inspector).
No production change was needed. Field-coverage typecheck passed.

User asked whether oversized equations can be dragged horizontally on mobile.
reader.css already uses native overflow-x:auto. Added a Chromium mobile gesture
regression to math-display.spec.ts: real CDP touchStart/touchMove/touchEnd events
move scrollLeft in both directions while document width stays at 320px. Both
keyboard and touch cases pass (reports/math/touch-equation-scroll.log). Initial
synthetic-scroll probes did not scroll; the test fixture also lacked the exported
page's viewport meta tag, now corrected in both display tests. No production CSS
change was needed. This is emulated Chromium evidence, not physical iOS/Android
manual acceptance. All root test commands are terminal; workers finished.


## Installed standalone verification (2026-10-09)

`node scripts/verify-math.mjs` completed successfully (session 42951 terminal).
Report: reports/math/standalone.json; command log:
reports/math/retained-installed-verification.log. Toolkit:
`783d7d58443859b603e95e2231fc98350a16e6560c84f60a3478f12379449ae3`; standalone:
`b92d47323a2bbbc658a96f0e7ab2705ae6cad35ec419f1707faad7ebaa07cb30`; math fingerprint:
`91f4a0bc329fdffa9bf890a2f6335290221c8652c690e4f6d79eaf14e2b3cd6f`.

The installed relocated HTML passed rendered 320/1440px, no-JS 320px,
worker-failure 320px, and unavailable-MathML fallback cases. The first four
cases each cover 61 non-Mermaid math expressions. No network attempts, sibling
file requests, CSP violations or page errors. Copy/reference and print-source
assertions passed where applicable. Historical Mermaid regression assertions
in the same verifier also passed; this does not reopen deferred Mermaid scope.
Screenshots/PDFs and the source/HTML/corpus hashes are linked by the report.
Human notation/visual/print/accessibility approval remains open.


Retained compiler field batch complete: compiler.math-other-surfaces.test.ts and
compiler.math-extension.test.ts pass together (2/2 in other-field-coverage.log).
The coverage ledger records exact test identities, fields and path limitations.
Typecheck passed before the final assertion-only fixture corrections. No product
code changed in this batch. Worker completed; no command or agent task remains
running. Remaining work: executed field/path manifest and contract enforcement,
final required candidate reports, review/documentation disposition, then human
acceptance. Existing two baseline catalogue word-count failures and deferred
Mermaid browser failures remain explicitly recorded, not claimed green.


## Enforced field evidence and clean unit suite (2026-10-09)

Implemented scripts/math-evidence.mjs and integrated it into test:contracts.
The independent inventory pin protects 27 retained cases and 920 field/check
obligations; COV25/26 remain deferred. Exact testcase/report/candidate matching
rejects skipped, failed, duplicate, unknown or stale records. Browser evidence
also specifies the browser spec and project. Sol found an initial inventory
weakening hole; the independent pin plus field/check deletion tests resolved it.
Final bounded review found no remaining material issue in the trusted-record
model. Human review and report-generation pipeline were outside that review.

Trimmed the two baseline catalogue guides without dropping required sections,
attribute tables, rules or examples: architecture 545 words, trace 583. Catalogue
suite passes. Full npm test now passes 2,493/2,493 across 281 files. Evidence:
reports/math/evidence-full-suite.log and evidence-full-suite-junit.xml.

Bound 171 verified compiler field/check obligations to exact passing tests from
that report in evidence.json. The remaining 749 obligations are explicitly
unproven; see reports/math/field-evidence-status.json. They chiefly need browser
field-delivery cases/mappings and remaining compiler mappings, not 749 new test
functions. test:contracts must remain red until this ledger is complete. The
candidate digest is recorded in that status JSON. No report has been stamped
human-approved. Guide edits changed release identity, so the earlier installed
standalone run remains historical evidence for its recorded toolkit, not this
new release candidate. No commit or publication.

### Component browser field matrix — 2026-10-09

Added tests/browser/math-components.spec.ts with distinct formulas in nine fields:
note body; self-check question and answer; detail label and body; step label and
body; definition term and body. Five modes passed: successful worker rendering,
JavaScript disabled, deliberate worker failure, long formulas, and print media.
Assertions locate each field, retain exact TeX, require visible SVG on success,
and require visible unclipped source on fallback/print. This isolates math with
disclosures open; it does not claim reader interaction or physical-device proof.

Command: VISSER_BROWSER_TARGET=fixture npx playwright test
 tests/browser/math-components.spec.ts --project=chromium-320
 --project=chromium-nojs (Node 24). Result: 5 passed. npm run typecheck passed.
Reports: reports/math/component-browser.log, component-playwright-junit.xml,
component-playwright.json, component-typecheck.log. component-snapshot.json
records the candidate and report hashes. Initial fixture syntax failures were
corrected before the successful run; no production change was needed.

The new test changes the candidate digest, so prior evidence.json bindings need
fresh integrated verification before final acceptance. This matrix is not yet
mapped into evidence.json. Remaining field/browser obligations and human gates
remain open. No jobs are running and no commit or publication occurred.

### Markdown browser matrix and review — 2026-10-09

Expanded math-components.spec.ts to 24 math locations: COV-01 rich prose and
hard-break content, COV-02 authored heading/link/term/detail-link/focus text,
COV-03 list/quote/table text, COV-05 visible frontmatter title, and COV-08/09
component/definition fields. Added exact plain alias text/destination/no-math
checks and exact readable browser title in each mode. The long variant extends
every authored formula. Disclosures remain explicitly open for this isolated
math-runtime test; reader navigation and geometry are separate gates.

Sol independently found four evidence gaps: inherited rather than authored
term/detail-link labels, unused alias, insufficient hard-break relationship,
and unchecked browser title. All were fixed with direct assertions and Sol's
static recheck found no remaining material issue in this bounded scope.

Full Chromium matrix (1440, 1024, 390, 320, reduced motion, plus no-JS project):
21 passed, 0 skipped/failed, after review fixes. Reports are
reports/math/component-browser.log and component-playwright-junit.xml/json.
The full unit/integration suite also passed 281 files / 2,493 tests, recorded in
reports/math/field-matrix-full-suite.log and field-matrix-full-suite-junit.xml.
Native browser fixtures were being added separately during this run; final
candidate binding still requires an integrated refresh after edits settle.
The older component-snapshot.json describes the earlier nine-field run only.

### Native family browser matrix — 2026-10-09

Terra added math-native-fields.spec.ts for COV-11–16 and common graph/transform/
domain title, question and body fields. Root corrected fixture identity and
mode assertions, then split long variants into one document per family after
the combined fixture correctly hit the aggregate output budget. Production
limits were unchanged. The test opens disclosures and exercises the isolated
math runtime, not full reader/viewer navigation.

Sol reviewed the field assertions independently. Its native visibility finding
was resolved: every expected matching native slot must show its direct SVG in
success/long modes, and print must hide the native viewport while retaining
visible, unclipped source. Sol's static recheck closed the finding. Root also
requires actual visible HTML SVG on success and hidden visuals/unclipped source
on fallback/print. Unique formulas and one family per document disambiguate
inspector content outside the figure subtree.

Final integrated browser command: VISSER_BROWSER_TARGET=fixture
VISSER_BROWSER_TIER=full npx playwright test tests/browser/math-components.spec.ts
 tests/browser/math-native-fields.spec.ts --project=chromium-1440
 --project=chromium-320 --project=chromium-1024 --project=chromium-390
 --project=chromium-reduced-motion --project=chromium-nojs.
Result: 42 passed, no skipped or failed cases. Reports:
reports/math/field-matrix-browser.log, field-matrix-playwright-junit.xml,
field-matrix-playwright.json. No physical device or human acceptance is claimed.

The settled-source full suite passed again: 281 files / 2,493 tests; typecheck
passed. Rebound the existing 171 compiler obligations to this fresh report and
added 330 reviewed browser field/check obligations. evidence.json now records
501 of 920 obligations; 419 remain explicitly unproven. This is field-evidence
accounting, not a percentage-complete claim for C01–C08. Exact candidate:
2b0ce88f525080a53454d594e1da97ff3b745d3db279547562892ca7dc3b81e6.
The field checker reports only the 419 missing obligations, with no malformed,
stale, duplicate or failed mapped evidence. Full test:contracts remains unproven
until remaining coverage and other release checks are complete. All jobs and
subagent tasks from this batch are terminal; no commit or publication occurred.

### Expanded fields expose and fix inline overflow — 2026-10-09

Added a distinct-field semantic Markdown test with scoped HTML and projected
text contexts. Table output is reparsed with ordinary Markdoc: escaped math
recovers exact cell text and two columns, as required by the plan. Strengthened
numbered-equation Markdown identity/source assertions. Expanded component
browser fixtures to numbered equations/references, source title/excerpt,
ordinary fenced code and inline code, including long literal variants.

Terra added separate measure/tree/compare/annotated browser fixtures. Root
resolved responsive duplicate-view assertions and review findings: literal paths
and excerpts elongate in long mode; a depth-2 closed native tree disclosure
contains a deep math label and literal path and must reveal them through an
ordinary click, including with JavaScript disabled. Sol independently reviewed
these field assertions and closed its findings after corrections.

The deeper tree long case exposed a production narrow-reflow defect: Chromium
reported document width 1,102px in a 320px viewport and the disclosure click was
intercepted after horizontal viewport movement. Added local inline math scrolling
with natural-width SVG, trusted metric-based baseline including scrollbar height,
resize-sensitive keyboard focus and containing-control arrow-key proxy. Narrow
summary max-width and zero-minimum fact-grid value tracks let descendants shrink.
The diagnostic now reports document width 320px and the ordinary click succeeds.
Raw diagnostic logs remain in reports/math/tree-long-diagnostic*.log.

Focused scroll tests passed (3): local keyboard scrolling, link proxy, unchanged
SVG scale after resize, baseline within the existing 1px browser tolerance, all
copy-button labels, and existing display keyboard/touch behavior. The expanded
four-spec full Chromium matrix passed 141 cases with no skips/failures; reports
are reports/math/expanded-field-browser.log and expanded-fields-playwright-*.xml/json.
Typecheck passed. Production-fix independent review and full unit suite are still
in progress at this checkpoint. Existing evidence.json bindings describe the
previous candidate and must be refreshed after this production change settles.

Production review follow-up: Sol found three material lifecycle issues in the
first inline-scroller implementation. All were fixed and independently rechecked:
MutationObserver cleanup releases ResizeObserver targets after transient removal
and reobserves connected movement/attachment; proxies skip negative tab stops and
advance across multiple formulas; active focus remains exposed through resize
until blur. The actual rich-copy replacement/move/remove/detached-attach regression
passes with bounded observed target count. The expanded keyboard test reaches both
formulas in a link, verifies negative-tabindex owners, and keeps focused scrollers
accessible through widening and blur. Focused unit tests: 28 passed across three
files. Focused browser tests: 3 passed. Typecheck passed. Review reports no remaining
material finding in the bounded production fix; cross-document adoption is outside
the declared runtime path. Integrated reports are being refreshed after these fixes.

Final settled-source verification for this batch: 141 browser cases passed;
281 unit/integration files / 2,495 tests passed; typecheck passed. Reports:
reports/math/expanded-field-browser.log, expanded-fields-playwright-junit.xml,
expanded-fields-full-suite.log, expanded-fields-full-suite-junit.xml, and
inline-lifecycle-typecheck.log. The exact source candidate is
 a35851f2f414a225ba1c7de5a3998652e1f08c15efd20864db1bb70800f3f217.

Refreshed evidence.json now records 697 of 920 field/check obligations; 223
remain unproven. Removed the earlier COV-10 ordinary-fence HTML/Markdown mapping
that had used a captured-source fence: these are distinct renderer paths. The
ordinary fence browser modes now have direct evidence, but its compiler/Markdown
mapping remains open. Field validation returns only missing obligations, with
no stale, malformed, duplicate or failing mapped testcase. This count does not
close other C01–C08 gates. The installed standalone/offline/release reports need
refresh because runtime/CSS changed. All commands and agents are terminal; no
commit or publication occurred.

## 2026-10-09 — trace, extension and literal-field verification

Added exact browser coverage for image alt text/loading and extension title,
question, body, part label/body/custom facts. Independent Sol review closed the
image/extension findings. Added trace coverage for both list layouts, actor/entity
copies, exclusive branch headings, event/message/predecessor labels and time units.
Review exposed weak scopes and duplicate-slot assertions; tests now bind the body,
accessible figure metadata, condition fact, actor headings, peer lane/message slots,
and each event's numeric time and unit to their specific contexts. Sol's final
static recheck found no remaining material issue in that bounded change.

Ordinary code fence and inline code assertions now verify HTML and semantic
Markdown; the fence is reparsed to its exact AST content (the default Markdoc
renderer does not emit a nested code element for fences). Focused compiler tests:
3 passed. Focused trace browser modes: 5 passed before the final additional peer
context assertion. Typecheck passed before that final assertion; refresh pending.

Installed single-file verification passed, including 320/1440 rendering, source,
worker failure, print, copy, unavailable MathML and no external network requests:
reports/math/current-installed-verification.log and reports/math/standalone.json.
Network-denied offline check passed: reports/math/current-offline.log.

The first integrated run overlapped full unit tests and the full browser matrix.
It produced 156 browser passes / 6 long-case timeouts, and 2,494 unit passes / one
large-batch validation limit failure. Those failures are retained in
reports/math/current-fields-contention-junit.xml and
reports/math/current-unit-contention-junit.xml, with corresponding *contention.log
files. Resource contention is a hypothesis, not an accepted dismissal. The full
browser matrix is rerunning alone with two workers and unchanged test limits;
a separate unit rerun must follow. Do not use the failed runs to certify gates.

Evidence manifest refresh remains pending. The previous 697/920 mappings refer
to the earlier candidate and are stale after these test additions. A prepared
/tmp/visser-bind-current-fields.mjs may bind reviewed new cases only after fresh
passing reports exist. Fold/proxy coverage, real reader/viewer coverage, aggregate
Markdown projection evidence and human acceptance remain open. Mermaid remains
deferred. No commit, push or publication occurred.

The separate two-worker browser rerun passed all 162 cases in 1.9 minutes with
unchanged assertions/timeouts. Fresh reports are
reports/math/current-fields-playwright-junit.xml and current-fields-playwright.json;
final typecheck also passed. Full unit suite is now running separately; do not
rebind the manifest until its terminal result/report is checked.

Next actual-reader coverage approach (Terra read-only assessment): reuse
`tests/browser/inline.ts` serveInline and real release assets, following
journeys.spec.ts and figure-viewer.spec.ts. Exercise inspector rich title/detail,
viewer sheet qualifications, term/citation tooltip rich copies, appendix filtering,
reference labels/quotes, moved viewer title/list/detail, unique canonical IDs and
beforeprint/afterprint restoration. Direct initializeMath fixtures cannot prove
these paths. Native figures have no Mermaid-style authored source pane; COV28
viewer.source must be interpreted against the retained native source/fallback
contract, without reactivating deferred Mermaid acceptance.

Settled-source results: separate full unit/integration run passed 281 files /
2,495 tests in 61.93 seconds, including the large distinct-source IPC case.
Source candidate 606c2d85962d4a36329a0725e1fe2434b081ce9394f8f05bad0e168a821f1d05
now has 814/920 field/check obligations recorded and 106 unproven. The manifest
checker found only missing obligations, no stale/malformed/failing mapped cases.
Fresh unit report: reports/math/current-full-suite-junit.xml. Remaining inventory:
COV17 folds/proxies (35), COV27 reader (40), COV28 viewer (30), COV29 aggregate
Markdown authored-fields projection (1). This does not close broader release or
human C01–C08 gates. Both test suites and both review agents are terminal; no
running jobs remain from this batch. Goal remains active.

## 2026-10-09 — real reader, folds and derived acceptance

Added real-release fold tests. The standard fixture passed all 21 browser
project/mode combinations. A second fixture supplies deterministic crowded
geometry at the layout/renderer seam, preserving the compiler's authored lists
and math records, to force graphSvg's proxy-callout branch. It verifies endpoint
and edge math separately in the context and edge-label slots, containment in the
callout panel, keyboard unfold/refold, and complete fallback lists. The focused
normal+crowded matrix passed 10 cases. This is renderer/runtime seam evidence,
not a claim about layout's choice of route placement. Independent Sol review
closed the endpoint-copy state and duplicated edge-context assertion findings.
Fold HTML/Markdown compiler test passed. Final combined full matrix remains due.

Added real-release reader/viewer tests using serveInline. Corrected fixture
selectors for local inspector hosts, native disclosure ancestry, nested SVGs,
reference selection/panel ordering and Text view restoration. Five focused modes
now pass: success, nojs, worker-asset failure, long math, print. Checks include
rendered rich copies in titles/tooltips/reference labels, exact LaTeX quote
packets, appendix filtering, viewer qualification copies, native math slots,
moved lists/details and print restoration. Coverage semantics are under final
independent review; do not bind COV27/28 before its findings are resolved.

Evidence checker now validates the reviewed COV29 aggregate as a derivation of
121 separately proven Markdown obligations (fixed dependency count/hash), and
requires exact deferred declarations for the five Mermaid-only viewer.source
checks. These remain in the pinned 920 inventory and are never proven. Negative
checker tests passed (10 tests); typecheck passed. Review found no material issue
in the checker semantics. A test-fixture parenthesis and explicit callback types
were corrected after execution exposed them. Coverage.md records the retained
scope interpretation. The existing manifest has the new declarations but its
candidate/test mappings are stale after this batch's additions; refresh remains
required. No production code, commits or publication changed in this batch.

Final COV27/28 review closed the source-exactness, independent field identity,
DOM move/ID/reference integrity, and post-print restoration findings. A proposed
visible-print-SVG assertion was rejected against plan lines 261–264: math-bearing
native figures intentionally print their complete text/list replacement. The
corrected final assertion proves hidden viewport, exactly 2 node rows / 1
relationship row, exact visible formulas in node/edge/endpoint contexts, and the
plain Sink endpoint. Focused print passed, then the final 225-case seven-spec
browser matrix passed in 2.6 minutes. The sequential job is now running the full
unit suite before copying its JUnit and binding evidence (session 39685). Do not
restart this job without polling its handle; it includes the evidence binding.

Release browser gate scope was separately pressure-tested with Sol. Preserve the
older retained-browser report only as historical evidence. The user-authorized
Mermaid deferral permits NOT RUN (not passed) for these four exact logical titles:
- a render failure in one figure leaves the other figure drawn and nothing stray
- native state extraction preserves exact provenance through sanitization, updates and repeated passes
- optional width wraps prose while preserving explicit breaks and whole formula nodes
- wide overhanging and tall math remains atomic and inside measured ink bounds
The final release browser run must retain every other configured test/project,
including other Mermaid/shared regression tests, and compare its inventory against
the full selection minus those exact titles. No broad file exclusions or edited
JUnit statuses. Run contracts against its zero-failure fixed report plus the full
unit report and candidate-bound field evidence. Fresh execution of the deferred
four is unnecessary; prior failures do not describe the current candidate.

The final sequential job completed successfully. Full unit/integration suite:
2,498 passed; final browser field matrix: 225 passed. Candidate
8232746abeb8e9b097145d6eca187db350dc56af4de1d09b1e109cb44a926c0e
now has 914 direct + 1 derived proven obligations, 5 explicitly deferred Mermaid
source-view obligations, and zero unproven/invalid field obligations. Reports:
reports/math/complete-fields-playwright-junit.xml,
reports/math/complete-fields-full-suite-junit.xml,
reports/math/complete-fields-binding.log and field-evidence-status.json.
This closes the retained field evidence ledger, not C01–C08 overall. Final
retained-scope whole-repository browser run, budget/clean-machine/contracts,
traceability/documentation reconciliation and human acceptance remain open.
All commands and bounded agents from this batch are terminal. No commit or push.

### Release review continuation — 2026-10-09

- Retained browser release run is live (session 60518), using the exact-title
  exclusion reviewed by Sol: 1,746 configured project/test instances minus 20
  deferred Mermaid instances = 1,726 selected. Selection and candidate identity
  are recorded in `reports/math/release-browser-selection.json`; output is in
  `reports/math/release-browser.log`. Do not restart on an observation timeout.
- Updated coverage ledger and W0 open-gate wording to distinguish completed
  field evidence (914 direct + one derived, five deferred) from release/human
  acceptance. Corrected obsolete architecture text denying math support.
- Terra's C08 audit found the authoring guide still promises deferred Mermaid
  adapters. Prepared `/tmp/visser-final-doc-corrections.py` to remove that stale
  catalogue and update traceability notes. This script has NOT been applied;
  wait for the active browser run to finish, preserve its reports, then apply
  the consolidated corrections before final candidate verification. Both
  skills and tests/traceability.json participate in the source digest: their
  edits require fresh evidence, not relabeling old reports as a new candidate.
- Typecheck refresh started in session 91662, log
  `reports/math/release-typecheck.log`. Terra is auditing existing independent
  review coverage of the five retained implementation risk areas; no edits.
- Human notation, visual/print, physical-device and assistive-reading gates
  remain open. No feature-completion claim is made.

### Human review preparation and final integration review — 2026-10-09

- Added `human-review.md` with direct standalone/screenshot/PDF links, reviewer
  recording instructions and separate V01–V08 result rows. All 12 local links
  resolve. This prepares participation; no human approval is claimed.
- Typecheck session 91662 passed. Browser session 60518 remains live, beyond
  900 selected cases; do not overlap it with builds or restart it.
- Terra audited the independent-review inventory. Prior targeted reviews close
  their findings, but C07 still needs a final integration review joining worker
  accounting, retained native geometry and standalone asset/CSP packaging.
  Sol `/root/er_runtime_review` is now performing that bounded read-only review
  on candidate 8232746; production code is frozen during review.
- Measured the current math.js asset: 1,842,050 raw / 674,569 gzip bytes, within
  the fixed limits. See release-asset-measurement.json and decisions.md. This
  does not substitute for the final full budget/packaging checks.

### Completion audit scaffold — 2026-10-09

Added `completion.md` with explicit C01–C08 dispositions and supporting evidence.
It records open release/human gates without treating field closure as feature
completion. Links in both completion.md and human-review.md resolve.
Prepared `/tmp/visser-audit-release-browser.mjs` to compare the actual final
Playwright execution inventory with the selected inventory, reject unexpected
or flaky results, and retain counts/report hash after session 60518 completes.
The run remains live beyond 1,290 selected instances. Final Sol integration
review is also still running. Pending source-digest-affecting corrections remain
unapplied in `/tmp/visser-final-doc-corrections.py`.

### Retained browser completion and material review finding — 2026-10-09

Session 60518 exited 0: 1,319 passed, 407 skipped, 9.4 minutes. The execution
inventory matches all 1,726 selected instances exactly; no unexpected/flaky
results. Preserved `release-browser-junit.xml`, `release-browser.json` and
`release-browser-audit.json` belong to candidate 8232746. Applied the queued
authoring-guide/traceability prose corrections after preserving that evidence.
Their source digest changes; do not relabel prior reports as current evidence.

Sol confirmed a material retained prose/native geometry gap: conversion,
compiler reservation and runtime slot checks trust outer logical SVG metrics,
while admitted `\\rlap{xxxxxxxxxx}x`, `\\llap{xxxxxxxxxx}x`, a smashed four-row
matrix and `\\kern-2em x` have descendant ink outside that box. Root reproduced
acceptance and tiny metrics in `reports/math/retained-ink-repro.json`. Reviewer
original rule-based examples actually reject unsupported SVG color; root
challenged them and reviewer corrected the admitted examples and source paths.
The finding remains open despite passing existing tests.

Bounded Astra Medium adviser `/root/retained_ink_advice` is designing shared
pre-layout SVG ink-union normalization, preserving standard TeX commands rather
than adding an incomplete denylist. Initial evidence says MathJax BBox itself
intentionally suppresses dimensions for these commands, so it is not an
independent ink oracle. Sol `/root/er_runtime_review` is finishing the other
integration review areas. No geometry production edits yet.

Prepared `/tmp/visser-final-release-checks.mjs` for serial typecheck, unit/build,
retained full browser inventory/run/audit, field binding, installed/offline,
budget, clean-machine and contract checks. NOT STARTED: wait for geometry fix
and review closure first. Its final reports refresh the field mapping from the
full browser superset, avoiding a redundant separate 225-case run. No build or
browser process remains live now.

Ink design decision: adviser confirmed MathJax logical BBox cannot prove painted
containment. Implement conservative sanitized SVG leaf bounds (full path parser,
ancestor affine transforms, inherited paint/stroke), union with logical viewBox,
normalize horizontal origin with a group translation, preserve baseline y=0,
and derive em metrics at 884 SVG units/em. Recount final bytes/elements and
version the fingerprint. Worker boundary independently checks ink containment.
Standard base+AMS commands, including negative spacing, remain supported.

Terra worker `/root/ink_geometry` owns only new core math/svg-ink.ts and
unit/math.svg-ink.test.ts, implementing the pure geometry parser/bounds module;
no builds/tests/delegation authorized. Root owns subsequent engine normalization,
policy fingerprint, shared boundary integration and browser/native regressions.
Module design uses curve control hulls and full corrected arc ellipse bounds,
which are conservative; malformed/nonfinite geometry rejects. Independent
review and real browser leaf containment checks remain required before M10/C07
closure. No engine integration edits have started yet.

### Ink normalization integration started — 2026-10-09

Root changed core math engine.ts, svg-validate.ts, policy.ts and fingerprint.ts:
logical viewBox union conservative painted bounds, outward 0.001-unit rounding,
horizontal translation preserving baseline, normalized metrics/dimensions,
post-normalization resource recount, independent worker ink containment, policy
version and new-module source hashing. Added accepted-overhang tests to
math.engine.test.ts and a forged escaping-child test to math.svg-validate.test.ts.
No checks run yet: worker's new svg-ink.ts module is still being written, so
imports are temporarily unresolved. Do not run the final pipeline yet.

Terra `/root/ink_geometry` owns new svg-ink.ts and math.svg-ink.test.ts.
Terra `/root/er_node_plan` now owns only new browser/math-ink.spec.ts for actual
compiler/runtime prose and native leaf containment using Chromium geometry.
Both are forbidden from starting tests/builds or delegating. Root owns all
integration and execution. Independent Sol's completed8232746 review is recorded
in docs/reviews/math-rendering-implementation.md; new geometry changes explicitly
require fresh review. No test/build process is live.

### Initial ink probes and test review — 2026-10-09

The first svg-ink module arrived. Pure Node24 probes confirm the four admitted
reproducers now receive expanded bounds and pass shared validation; ordinary
negative thin spacing stays accepted, and extreme negative kern fails the ink
dimension budget. A development probe passed 1,028 conversions (14 corpus
expressions in both modes plus 1,000 distinct fractions), zero failures:
`reports/math/ink-corpus-probe.json`. Probe session80323 and typecheck session5457
both exited0; `reports/math/ink-typecheck.log` passed for that interim snapshot.
These are not final-candidate evidence and do not close the geometry finding.

Root reviewed the worker module and requested structural parser corrections:
initial moveto requirement, comma-after-command rejection and compact arc flags;
correct known-geometry test expectations rather than weakening comparisons.
Worker ink_geometry is still updating its two owned files. Browser worker
math-ink.spec.ts arrived; root requested exact attribute escaping, stable IDs for
all prose paragraphs, actual project viewport, line-fragment overlap checks and
separate geometry tolerances. er_node_plan is updating only that spec. No test
or build process is live; run focused units/browser once both workers stabilize,
then independent review. New root engine budget regression covers negative
kern beyond the4096em limit. Root-owned diff whitespace checks pass.

### Focused ink verification — 2026-10-09

First focused run caught post-command comma acceptance, TS erasable-syntax
constructor incompatibility, and a policy test hardcoded to obsolete serialized
bytes. Worker fixed its parser/constructor; root changed the real-conversion
budget test to derive the raw-byte-cap count and independently assert the other
caps are not responsible. Final worker hardening rejects nested SVG. Workers
are terminal and production files are frozen for Sol independent review.

Latest focused run session26112 exited0:58 tests/four files passed, saved in
`reports/math/ink-unit.log` and `ink-unit-junit.xml`. Typecheck session57137
passed before final nested-SVG delta; refresh later. Browser38553 failed during
fixture validation (missing heading ID), not geometry. Root added the required
ID. Browser retry session6426 is LIVE at1440/320, one worker, log ink-browser.log.
Do not run builds/unit suites while it consumes the release. Sol er_runtime_review
is reviewing the final production parser/normalization/accounting/fingerprint
snapshot; its earlier8232746 review does not approve these changes.

Browser6426 is terminal: fixture failed a second schema condition (`scale=order`
instead of supported `ordinal`). Root corrected it and reassessed the approach:
ran a pure source-preflight extracted from the actual fixture builder before
another browser attempt; bundle diagnostics now have zero errors. Browser
session98749 is the current live retry. Log remains reports/math/ink-browser.log.
The last browser failures did not reach ink assertions; do not count them as
renderer failures or passes. Production remains frozen for independent review.

### Ink browser pass and transform-parser review fix — 2026-10-09

Browser98749 exited0: both1440/320 cases passed (16.2sec). Actual glyph leaf
bounds fit normalized formula viewports and native graph/trace/measure slots;
adjacent prose/native labels stay separate. Saved ink-browser-junit.xml/json.
The assertions reached geometry after the fixture source preflight corrections.

Independent Sol review identified repeated suffix slicing in transform-list
parsing. Root changed command matching to a sticky regex on the original string
with lastIndex, and added a20,000-transform near-byte-cap worker-boundary case.
No V8-specific timing claim is assumed; the structural scan removes suffix
allocation risk. Reviewer is rechecking this delta and finishing geometry review.
Latest focused run77725 exited0:59 tests/four files passed, retained ink-unit.log
and ink-unit-junit.xml. No process live now. Production changed after the browser
run's start; final-candidate verification still required. Worker modules are
terminal; root owns remaining changes. Do not run final pipeline until review
findings are resolved. Human acceptance remains open.

### Production ink review disposition — 2026-10-09

Sol found no remaining material production defect in the frozen geometry fix.
Exact five-file hashes retained in ink-reviewed-production.sha256 and disposition
recorded in docs/reviews/math-rendering-implementation.md. Typecheck66881 passed.
Reviewer requested a substantive test strengthening: prove enclosing native
node/actor/event boxes and chart viewport also contain enlarged labels, and edge
label avoids endpoint shapes. Terra er_node_plan owns that spec-only delta; Sol
will recheck it. Production remains frozen.

Full unit/integration regression session44391 is LIVE (ink-full-unit.log),
including normal release rebuild. Do not run any browser or delivery check that
consumes dist concurrently. Final serial release pipeline remains unstarted.

### Independent review closure and full-suite load result — 2026-10-09

Sol final static recheck: no remaining material production/test finding; complete
label owner bounds and endpoint/bar exclusions accepted. Production hashes remain
ink-reviewed-production.sha256; browser spec8953adeb. New browser92744 is LIVE
for final strengthened assertions (1440/320), ink-browser.log; no other process.

Full unit44391 exited1:2,517passed/one failure, large distinct-source IPC batch
hit the production5sec/heap/output guard under full parallel load. Isolated
math.validation run59585 passed12tests; that same batch completed in1,615ms.
Preserve this full-run failure in ink-full-unit.log; no production limit changed.
Final release pipeline now runs every unit/integration test with--maxWorkers=2
instead of default concurrency, followed serially by every retained browser
case and remaining release checks. Pipeline still unstarted until browser92744
finishes. Current field evidence remains historical until fresh final bindings.

### Final candidate pipeline active — 2026-10-09

Strengthened ink browser92744 passed both1440/320 cases; reports were retained.
Final serial pipeline session61453 is LIVE on candidate
`2580f37cc7e747b5096481a7e2b0bc222913626d22d93523faa3b22c9f568378`.
Typecheck passed; all unit/integration tests are running with--maxWorkers=2.
Progress/results: final-release-pipeline.log and final-release-checks.json.
Do not restart on observation timeout; do not start competing builds/browser
runs, alter source/test/skill/config files, or edit anything during clean-machine.
The helper `/tmp/visser-final-release-checks.mjs` proceeds through retained full
browser inventory/run/audit, field binding, installed/offline, budgets,
clean-machine and contracts; it stops on first failure or candidate drift.

Read-only audit of the prior retained browser407skips found zero missing reasons;
all are explicit viewport/input applicability or run-once choices. Updated the
/tmp browser audit to retain the final skip-reason counts and reject a missing
reason, in addition to inventory equality and no unexpected/flaky cases. This
helper-only change does not change the candidate. No production/test changes
since the final candidate was captured. Human gates remain open.

### Final pipeline: unit gate passed — 2026-10-09

Session61453 remains LIVE. All2,518 unit/integration tests across283 files passed
with--maxWorkers=2 (184.80sec), production limits unchanged. Full retained browser
run is underway (final-browser.log), beyond600selected instances with no reported
failure so far. Do not treat partial logs as completion or restart the handle.

Prepared `/tmp/visser-final-manifest.mjs` (NOT RUN) for after the entire pipeline
passes. It requires every named check to exit0, current source identity, fresh
field/browser bindings, all declared packaged asset hashes, exact standalone
bytes/corpus/toolkit/fingerprint, packaged-guide equality and unchanged reviewed
production hashes. It retains report hashes in final-candidate-manifest.json
while explicitly keeping human approval open. Pipeline must be terminal/passed
before invoking it; no source changes are authorized by this evidence helper.

### Final automated verification complete — 2026-10-09

Session61453 exited0. Candidate2580f37cc7e747b5096481a7e2b0bc222913626d22d93523faa3b22c9f568378:
- Typecheck passed;2,518 unit/integration tests in283files passed.
- Retained browser1,324passed/407explicit-applicability skips, zero failures or
  flaky results; exact full-minus20deferred-instance inventory matched.
- Field binding:914direct+1derived proven,5deferred,0unproven/errors.
- Installed standalone, offline, budgets, clean-machine and contracts all passed.
- Final artifact audit passed:66packaged hashes, standalone/corpus/toolkit/math
  fingerprint, packaged-guide equality and unchanged reviewed production files.

Evidence: final-release-checks.json, final-candidate-manifest.json and named
report hashes. Toolkit18a17f594560318d528b5728798b904cd8f4b4a85ed3fc0af1024e05076f5a22.
Updated completion.md, coverage.md, decisions.md and human-review.md to distinguish
passed automated gates from human C04–C05. Final math.js1,855,103raw/678,479gzip
bytes remains below unchanged limits. No process remains live; no commit/push.

Only human acceptance now remains. human-review.md links the exact standalone,
screenshots/PDFs and V01–V08 exercise; human-gates.md still contains open rows.
Do not claim goal/feature complete or manufacture human approval. First audit of
this human-only blocking condition occurs now, after technical work is complete.

### Human-only gate audit 2 — 2026-10-09

Re-read human-gates.md: every math acceptance row remains open, with no reviewer,
date or device observations. All automated work is complete; no new tests or
source edits are justified. Requested the actual C04–C05 checklist observations
from the user. The same human-input dependency persists for the second goal
turn. Keep the goal incomplete; if unchanged on the third consecutive audit,
mark it blocked awaiting human results rather than repeating active status.

### Human-only gate audit 3 — 2026-10-09

The same C04–C05 human-input dependency persists for the third consecutive goal
turn. Re-read acceptance records: all six math rows remain open and no reviewer
observations have arrived. Automated verification and implementation are complete;
there is no remaining independent technical action that can supply human results.
Mark the goal blocked awaiting the linked checklist outcomes. Resume on actual
review observations or an explicit user scope change; do not manufacture approval.


## 2026-10-09 — copy icon and user acceptance closeout

User requested a copy icon, then said: “Then close out human acceptance, it looks
good enough to me.” Replaced repeated text with a compact icon, accessible name,
tooltip, visible focus and live success/failure feedback. Clipboard payload is
unchanged. Focused checks passed: 29 unit tests, six browser tests, typecheck,
build, export, and two network-denied standalone viewport checks including
keyboard activation and denied clipboard. Updated mobile screenshot inspected.
Evidence: `reports/math/copy-icon-closeout.json`; current artifact:
`reports/math/copy-icon-standalone.html`. Baseline full-suite evidence retained
under its original candidate identity; no full-suite rerun claimed for this UI delta.

C04–C05 closed under the user's acceptance amendment: shown visuals accepted,
unperformed physical-device/assistive/authoring exercises waived, not passed.
Unrelated project gates remain open. Retained implementation complete; no active
jobs, commit, push or publication. Current source digest:
`61fcfb6c2aa8010f1dc99a8b8c40c13c1ed37be2288d4392a0e4b846e06aa907`.
