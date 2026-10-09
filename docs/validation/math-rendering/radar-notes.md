# Radar math integration evidence

Pinned native artifact: `mermaid/dist/chunks/mermaid.core/diagram-MPIPVDR6.mjs`, SHA-256 `2ce7653fe44f279cbcdb434977860480efe1c20908203548ffbbc0e02648a4f3`. Public detector is `radar`; admitted grammar begins `radar-beta` with optional colon. This investigation and native-state foundation do not activate public math.

## Source and native semantics

The packaged `@mermaid-js/parser` exposes Radar AST/CST. Root title, accessibility title and accessibility description use last-assignment AST fields; their earlier CST occurrences must still be validated and charged. Common metadata population only calls setters for truthy surviving values. Native common setters sanitize metadata; that sanitation remains a separate extraction/reconciliation obligation.

Axis and curve names are IDs, not quoted labels. Optional labels use STRING, with backslash/quote decoding, and native DB fallback is `label ?? name`. Duplicate axis and curve names remain separate array entries. Root common fields trim/normalize whitespace, multiline accessibility descriptions retain grammar-owned spans, and hidden comments/YAML/directives need the existing source policy and mapped preprocessing. A future collector must use assigned CST terminals, not search all source text for delimiters.

Positional curve entries remain in authored order even when their length differs from the axis count. Referenced entries map over every axis and use the first matching `$refText`; duplicate axes repeat that first value and later matching entries are ignored. Missing referenced values throw. Options preserve authored order until native reduction, where the last occurrence wins. Defaults are legend true, ticks 5, maximum null, minimum 0, circular graticule; only the upper ticks bound is clamped to 32. Native numeric state must be preserved independently of later finite-geometry checks.

The native renderer draws axis labels as SVG text, curve legends as fixed 20-pixel rows when enabled, and the title unconditionally as text. Accessibility text is not a visible math label. Curves with entry counts unequal to the axes are silently skipped while their legend remains. Equal min/max can produce nonfinite radii; circular paths can extend outside the polar points through cubic control points. Measured math must reserve complete curve/stroke ink and preserve the native clipping and skip semantics. Title/axis/legend geometry, hidden legend accounting, source-owned visible slots and numerical rejection remain to implement.

## Native-state foundation

`radar-db.ts` captures detached native arrays, options and metadata, replays ordered axes/curves/options, and compares exact native state. Metadata input is explicitly projected and string-checked; its sanitation must already be attested by the future collector. Reconciliation is not a source-authentication or valid-rendering claim.

Independent review identified Radar-R1: spreading metadata allowed extra properties to replace replayed axes or version. The implementation now projects only the three metadata strings. Regression tests prove that extra metadata cannot change expected native state; independent follow-up review confirms the finding resolved.

`scripts/mermaid-radar-contract.mjs` checks the full native artifact and provides source-loader and exactly-one-bundle transforms. Source loading retains the original module URL. The contract helper is not yet wired into production workers or browsers. Generated parser grammar and token-builder evidence is recorded in the candidate snapshot; the native artifact hash alone does not attest the separately imported parser dependency.

Next collect every authored text terminal with exact original provenance, apply and attest common sanitation, reconcile native state and visible ownership, then integrate workers, measured rendering, compiler/source binding and standalone acceptance. Public raw math remains guarded.

Combined verification passes five tests across two files. Real native DB parity covers duplicate identities, first reference values, positional mismatch retention, option precedence/clamping, detached live getters, clearing and numeric state. Source-hook, unpatched native and relocated bundle snapshots agree. Typecheck and diff checks pass. Exact files, dependency evidence hashes and commands: `reports/math/radar-foundation-snapshot.json`. These checks do not imply math rendering or source ownership is implemented.

## Authored collection, validation and source ownership

`radar-labels.ts` collects assigned CST terminals for every title/accessibility occurrence and each axis/curve name and label. It preserves overwritten roots, empty explicit labels and fallback-name ownership. Mapped conversion mirrors the pinned ID/STRING/common converters and is independently checked against public parser values; overwritten root assignments are reparsed individually. Generic Mermaid preprocessing uses the shared mapped output before flowchart-specific transformations. BOM, normalized line endings, explicit fence dedent, comments, CSV-unrelated quoted escapes, Unicode and generic style-semicolon removal retain original provenance. Label `active` flags describe effective source fields, not legend visibility.

`radar-math.ts` validates every authored occurrence against incoming document totals. Only common title/accessibility fields use native sanitation and formula serialization restoration. Axis/curve labels remain literal native SVG text; encoded dollar entities in those raw fields do not become equations. Literal break tags are validation barriers. Errors retain record-owned byte/line ranges; formula parts retain exact original intervals through parser escaping and sanitation.

`radar-math-db.ts` ties the trusted collector result to the actual detached native snapshot, using the previously verified replay. Title ownership follows the surviving nonempty root assignment; accessibility creates no visible slots. Every axis has one label slot; every legend entry has one slot when showLegend is true, even for a curve whose mismatched entry count causes native geometry to be skipped. Duplicate names remain separate. All hidden/overwritten formulas stay charged. This function does not independently authenticate an untrusted transport or prove drawable geometry.

Sixteen tests across five Radar files pass, with typecheck and diff checks. Tests cover all assigned fields, exact escaped/encoded provenance, native metadata sanitation and raw-label parity, invalid overwritten/hidden equations, break barriers, incoming budgets, fallback/duplicate owners, empty final roots, hidden legends and forged native/owner inputs. Independent collector/validation and ownership reviews found no blocking issue. Exact evidence: `reports/math/radar-source-snapshot.json`.

Next enforce the separately imported parser dependency contract and integrate synchronous native-state capture, private metadata sanitation and validated worker transport. Then implement measured browser labels/geometry, compiler/source binding and installed acceptance. The production raw-math guard remains in place.

## Enforced parser dependency and worker bootstrap

`scripts/mermaid-radar-parser-contract.mjs` pins four complete artifacts: the package dispatcher, generated grammar/converters, Radar service wiring and lazy loader. Source load hooks retain their module identities; the release plugin requires exactly one application per artifact. Patched dependency markers are checked by the entry module, which exports the parser contract version. The worker requires that marker before processing requests. This also rejects fully cached unpatched entries; missing dependency exports reject partially cached unpatched graphs.

Review found Radar-P1: a first static bootstrap import still runs after Node loads the rest of the static dependency graph. The initial bootstrap-only ordering attempt and its tests did not prove enforcement. The corrected `parse-worker.ts` is a small entry that imports the bootstrap, then dynamically imports `parse-worker-main.ts`, which retains the former worker implementation. Type-only exports preserve existing source type imports. CJS release workers receive the same contract through the build plugin and do not install source hooks.

Final verification passes 622 integrated tests across 85 files, then five focused contract tests after adding partial-cache regressions. Actual source workers succeed; preloaded unpatched entry, grammar, service and loader cases fail closed. Patched parser AST projections match the unpatched native parser and a relocated isolated bundle. Nineteen fixtures match source and relocated release workers. Typecheck, release build and diff checks pass. Independent follow-up confirms Radar-P1 resolved. Exact candidate evidence: `reports/math/radar-parser-snapshot.json`.

Next integrate Radar native DB installation/private common sanitation, synchronous final-parse capture and validated numeric/ownership transport. The parser contract is now enforced, but Radar requests, browser rendering, compiler/source binding and installed public acceptance remain pending.

## Native asynchronous lifecycle

`radar-node-db.ts` requires both parser and native artifact markers before installing its wrappers. Only the three common metadata setters receive the private synchronous sanitizer; axis and curve labels retain native literal values. Installation is coalesced. Capture requires the exact installed DB and a completed successful parse, and returns a detached snapshot.

Every parse attempt consumes a fresh successful clear. An overlapping parse rejects; a clear during an asynchronous parse invalidates that parse and cannot authorize its successor. Recovery requires another clear after the pending parse settles. Failed and uncleared attempts invalidate capture. Repeated snapshots of a completed transaction remain valid.

Independent review found Radar-R2: the initial implementation only required that a clear had occurred sometime earlier, allowing an uncleared second parse to retain old common metadata. A consumed clear authorization fixes this, including failed-parse recovery and in-flight clears. Follow-up review also moved capture invalidation ahead of the missing-clear rejection. Final independent code review accepts the lifecycle/helper scope.

`radar-node-math.ts` synchronously captures state before awaiting source collection, then reconciles all authored records and native ownership. Its return value is an internal plan containing parser/provenance objects, not a serializable worker payload. Request flags, transport validation, source/release worker wiring and measured rendering remain pending; public Radar math is still guarded.

The integrated Radar suite passes 22 tests across seven files. The new isolated-process lifecycle regression checks missing contracts, asynchronous capture/overlap/clear races, stale-clear rejection, failed-parse recovery, detached collection, literal versus sanitized fields, sanitizer/global isolation, and the actual Mermaid `getDiagramFromText` clear/parse lifecycle. Exact candidate hashes and checks are recorded in `reports/math/radar-lifecycle-snapshot.json`.

## Internal worker transport

`radar-transport.ts` projects ordered semantic axes, curves and options without parser/CST objects. Canonical numeric strings preserve signed zero and native sentinels through JSON; native replay and geometry validity remain distinct checks. Every authored record retains its semantic value, sanitation result, formula provenance and effective ownership. Validation regenerates formula parts and costs, checks item order/coverage and final root assignments, replays native state, and reconstructs visible slots. Literal fields must equal their semantic values; common-field sanitation is the trusted worker boundary. Transport consistency does not authenticate original source.

The source worker installs the native artifact contract before loading Radar, and the release build requires the matching native contract transform. Radar request/cache flags are internal; math requires original fenced source. Conflicting families, inconsistent source/native state and invalid hidden formulas reject with recovery for subsequent requests. Review found Radar-T1: the first guard rejected the native attached-colon header. It now accepts `radar-beta`, `radar-beta:` and `radar-beta :`, with source and relocated-release fixtures for all three.

631 tests across 88 integrated files pass. Four transport tests include sentinels, canonical numeric rejection, hidden/overwritten costs, incoming budgets and payload forgery. Three integration tests cover source provenance, all native header forms, conflicts, invalid math/recovery and cache separation. Fourteen source and relocated release fixtures agree. Typecheck and build pass; independent follow-up accepts internal transport/worker integration. Exact candidate results and limits: `reports/math/radar-worker-snapshot.json`. The initial invalid-math test used JavaScript replacement-string dollar escaping incorrectly; the final callback-based fixture exercises the intended invalid TeX. The native grammar rejects a minus-prefixed zero fixture, so relocated parity uses admitted zero while direct transport tests preserve signed zero.

Next implement measured Radar geometry and label placement, including finite resulting geometry, complete curve/stroke ink, visibility and transactional cleanup. Then wire compiler/source binding and run installed standalone acceptance. Public Radar math remains guarded.

## Measured browser renderer

`mermaid-radar.ts` captures the pinned native draw on a private diagram/DB proxy, then retains its circles, axis lines, cubic or polygon curves and original curve indices. Only the plot frame translation changes. Axis labels occupy measured outside lanes with separate leader tracks. Legend markers keep native class/color indices and receive stroke-inclusive measured rows in a separate column; the title sits above the complete union. Hidden legends and accessibility fields create no visible label copies. Plain charts retain the native renderer path.

`mermaid-radar-ink.ts` validates every serialized coordinate before bounding it, using the complete cubic control-point hull and computed stroke reserves. This rejects invalid segments that SVG bounding boxes might silently omit. Native empty/degenerate axis counts are retained when their resulting geometry is valid. Nonfinite resulting geometry fails without treating every unused native sentinel as an error. `mermaid-radar-layout.ts` reuses ordered outside-track packing and adds legend/title space, with the existing math dimension gate.

The exact native capture transform and all four parser dependency contracts are enforced in the browser build. Temporary native drawing is hidden again after native sizing and before awaits. Measurement and commit failures remove temporary DOM, restore caller attributes and leave the actual DB unchanged.

Ten browser cases pass across Chromium 1440/320: plain/native parity, both graticules, visible/hidden legends, tall equations, spline tension, thick shape/marker strokes, skipped-curve indices, zero/one/two axes, invalid geometry/recovery, hidden staging, DB preservation and exact rollback. Seven pure layout/ink tests include sampled cubic containment and dimension boundaries. The integrated suite passes 638 tests across 90 files; typecheck and build pass. Independent review accepts this renderer milestone. Initial browser fixtures omitted a standards-mode doctype; corrected final fixtures supersede those quirks-mode failures. The transaction fixture's initial escaped command was also corrected before its passing run. Exact candidate checks: `reports/math/radar-render-snapshot.json`.

Next bind source-owned Radar slots through public parsing/compiler/runtime, then verify installed standalone exports, exact references and readable fallbacks before removing the public raw-math guard. These are not established by renderer tests.

## Public source and standalone integration

Radar math is now active for the native `radar-beta`, `radar-beta:` and `radar-beta :` header forms. Public parsing, figure transport, document accounting, compiler maps and runtime binding retain each visible title/axis/legend owner. Original-source maps validate fenced bytes and preserve quoted TeX escapes, common-field encoded delimiters, BOM/CRLF/dedent and comment removal. Overwritten, hidden and accessibility formulas remain charged without gaining visible source references.

Review identified Radar-S1: the compiler initially dropped maps with no visible expressions. It now emits empty maps whenever Radar math exists, so runtime binding still verifies that no unexpected formula rendered. Compiler coverage checks overwritten/accessibility-only input; runtime checks accept zero formulas and reject either unexpected or missing formulas. Independent follow-up accepts the public binding scope.

649 integrated tests across 92 files pass, with typecheck, build, diff and asset/reference budgets. Installed single-file acceptance passes at 320/1440 with four exact Radar references, including encoded title delimiters and distinct duplicate-axis ownership. Network requests are denied; source fallback with JavaScript disabled, worker failure and missing MathML, plus printed source, pass. No browser errors or CSP violations were recorded. The authoring guide describes Radar quoted backslash syntax and native visibility/layout behavior. Exact candidate evidence: `reports/math/radar-public-snapshot.json`.

This completes the Radar family slice, not the full math goal. Remaining Mermaid coverage and W5/W6/C01–C08 final integrated and human gates remain open. The earlier `radar-source-unit.log` was superseded during public integration; the current broad run is recorded under `radar-public-unit.log` and rechecks the earlier source tests.
