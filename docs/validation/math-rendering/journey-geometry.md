# Journey adapter implementation evidence

Status: source validation, isolated worker and measured browser renderer implemented; compiler/source binding, installed acceptance and public activation remain open.
Baseline: Mermaid 12.0.0, pinned `journeyDiagram-ZHPQQLJL.mjs` SHA-256 `b2a84793cf6fea9b0c5cf7f680bcbfebf648dadf0535d4fdfd7f636c025e3c0d`.

## Native field and lifecycle audit

The pinned grammar supplies title via `substr(6)`, section via `substr(8)`, trimmed accessibility title/description, and the unchanged task-name token. Native task data removes the first colon, splits on colons, converts only the first field using `Number`, and obtains actors only from the second field by comma splitting and trimming. Later colon fields are ignored. The collector preserves the complete task-data token for later reconciliation and records only native actor fields as labels. Machine scores are not math surfaces.

`getTasks()` appends raw tasks into its retained array on every call. Native draw calls it once before `getActors()`, which reads the populated task array. Reconciliation must use a separate isolated native parse or observe the exact single draw-time read; calling `getTasks()` ahead of native draw duplicates tasks. Native task objects acquire geometry while drawing. Both DB and renderer retain module state, so cleanup and failure isolation are required.

Task labels render once per returned task. Sections render once per contiguous run of equal task-section text, with no heading for the initial empty section. Repeated equal section declarations can merge; unused sections do not render. Actor names are deduplicated and sorted for the legend. Each actor occurrence also produces a task-circle tooltip, including repeated actors. All authored occurrences still require validation; final planning must explicitly choose source ownership for a shared legend label. Accessibility and tooltip contents remain accessible text.

The native actor maps use ordinary objects indexed by authored names. `__proto__` and similar names need explicit handling in the replacement math path before complete actor support can be claimed. The source collector preserves these names, and native DB parity tests verify they are not lost during extraction; these tests do not prove native renderer correctness.

## Layout requirements still open

There is no native math renderer in journey. All four visible roles—title, sections, tasks, actor legend—need premeasurement. Native task columns use fixed width and margin; section/task rectangles, row spacing, title clearance, legend row heights and score offsets are fixed. Enlarging only rectangles would overlap labels and the score region. Derive column widths, section-run widths, row heights, legend clearance and score-region origin together, preserving native colors, markers and score semantics. Actor legend wrapping currently splits words and characters; formulas must remain atomic.

Before activation, verify repeated-copy accounting, canonical legend ownership, tooltip policy, all-role geometry at narrow/wide widths, exact source reference round-trips, offline single HTML, readable fallbacks and failure cleanup. Keep plain native rendering behavior unchanged unless a demonstrated compatibility requirement warrants a separate fix.

## Completed source extraction

`journey-labels.ts` observes pinned Jison reductions on a fresh parser/lexer with ranges enabled. Every field is checked against its exact token range and observed native callback value. Records retain distinct authored identities, task/section ownership, actor positions and source-mapped text. Title/accessibility overwrites and repeated actor labels remain available for validation. BOM, CRLF, Unicode and fence dedent map to original UTF-8 intervals. The collector now feeds the internal isolated worker path; public activation remains gated.

Six focused tests pass. They cover all roles, overwritten metadata, repeated actors, ignored colon suffixes, machine scores, unused/equal section declarations, Unicode/source mapping, concurrent parser isolation, and native DB parity with exactly one `getTasks()` read. Together with adjacent state, sequence and timeline collectors, 42 tests pass across four files. Typecheck and diff check pass. A separate read-only review found no material collector issue; it did not run tests. Exact hashes and commands are in `reports/math/journey-labels-snapshot.json`.


## Authored math validation and DB reconciliation

`journey-math.ts` validates every collected field, including overwritten roots, unused sections and duplicate actors, against the incoming document budget. `journey-text.ts` supplies role-specific edits without flowchart backslash collapse. Tasks and sections convert native opening break tags to newline barriers for validation, but their primary display spelling stays literal because pinned `textPlacement: "fo"` uses `.text(content)`. The fallback SVG branch splits those tags. Actor equations use the same barriers during validation, then plain actor text uses spaces for legend display; the DB spelling stays available for tooltips. Raw text fields do not decode entities or native sentinels.

Metadata alone uses the existing private strict sanitizer and the common DB setter's normalization. The sanitized `dbValue` stays separate from the renderer's equation input. One serialized entity layer is restored only inside already-delimited metadata equations. Every formula maps through provenance to original bytes, while failures retain the owning authored field's source interval. The future measured renderer must consume the same role-specific input contract; using its generic break-tag handling for all roles would change title or actor prose.

`journey-db.ts` compares a supplied single native snapshot against every task, section, sorted actor and final metadata value. It never invokes native getters. Visible slots retain exact source record IDs: final title, each task, each contiguous section run and one sorted legend per raw actor identity. The first authored actor occurrence owns a shared legend; all duplicates remain separately validated. Maps retain prototype-like actor names. Each visible slot must have a distinct record owner, so the all-authored validation budget bounds current rendered MathML copies. A future duplicated visible record must add explicit copy accounting. Tooltip and accessibility output remain plain text.

The native DB test initializes a real DOMPurify factory against an isolated JSDOM, then restores the dependency at teardown. Its oracle uses native parser/setters and exactly one task getter; it does not obtain expected metadata by calling the implementation sanitizer. Tests reject stale task/section/actor/metadata snapshots, duplicated native tasks and forged duplicate source ownership even for identical label text.

Forty-one combined journey/shared sanitizer/math tests pass across seven files after the primary-display correction, including the identical-label ownership check. Final typecheck and diff check pass. Early test setup errors (uninitialized native DOMPurify, semicolon-bearing raw fields rejected by native grammar, and an incorrect expected document-limit code) were corrected before final checks. No browser or installed-worker journey integration is claimed by this evidence.


Review corrected an initial assumption that task/section default display uses the SVG line-break branch. The pinned default is foreignObject text. Final records therefore retain distinct validation and primary display inputs, validate both without double-charging, and map formula origins from the display input. The dedicated renderer must disable the existing generic measurement helper's break-tag splitting for literal task/section/title plain text, or it would undo this correction. Earlier advice and the earlier newline display expectations are superseded.


## Production parser worker connection

The internal parse request accepts `journey: true` only for declared journey source with mapped type `other`; conflicting family flags fail. Cache identity includes the journey flag. Existing source restrictions are applied before native parsing. The public index does not yet request this adapter and the raw journey math guard remains in force.

The pinned journey singleton's common setters use the prepared private sanitizer through a synchronous scope that restores the shared dependency in `finally`. Both native parse calls reset the DB; the second parse is authoritative. `journey-node-math.ts` calls `getTasks()` exactly once, then snapshots actors, sections and metadata before awaiting collection. It reconciles those copied values and returns no math transport for a plain diagram. Source-less effective math is rejected. A math plan with nonfinite task scores is rejected because JSON and SVG geometry cannot retain those values; plain parser behavior remains unchanged.

`journey-transport.ts` drops provenance instances and grammar data. It recomputes authored equation charges, requires complete canonical visible-slot coverage and distinct owners, verifies each slot's native task/section/actor/title identity, and checks displayed parts against their value. This is not yet compiler-side resource integration.

Six isolated-worker integration tests pass. They cover all roles, sanitizer-introduced delimiters, original UTF-8 spans, duplicate/equal sections, duplicate/empty/prototype-like actors, successive figures without accumulation, syntax/policy/reconciliation/nonfinite failures followed by valid journey and flowchart figures, source requirements, cache separation, unsafe direct requests and transport mutations. The full relevant Mermaid regression passes 515 tests across 57 files. Typecheck and diff check pass. `scripts/verify-journey-worker.mjs` confirms source/released worker equality across ten fixtures after copying the release worker alone to a fresh directory away from node_modules. Test setup builds the production release. Exact evidence: `reports/math/journey-worker-snapshot.json`.

Independent read-only review found no material worker-lifecycle or transport issue. A separate lifecycle audit confirmed installation timing, native reset behavior, read ordering, source preprocessing checks and recovery obligations. Browser geometry, actor-map correction, compiler/source binding, installed single HTML and public activation remain open.


## Measured browser renderer

`mermaid-journey.ts` captures tasks and actors once and proxies those arrays to the upstream plain renderer. Math rendering copies native data before awaiting measurements. It uses the shared role-specific validation/display transforms and the label helper's new `interpretBreakTags: false` option. That option preserves literal primary task/section/title text; its default retains other families' existing behavior.

All four visible roles are measured before permanent drawing. Task columns include label ink and the full duplicate actor-circle strip. Section rectangles span actual contiguous columns and their gaps, and their labels can expand those columns. Uniform task/section heights, title clearance, measured legend rows, arrow clearance and the score-region origin are derived together. Score differences retain the native 30-unit spacing without clamping finite values to 0–5; face and line extents contribute to bounds. Full geometry is checked against the existing dimension policy before drawing. Native drawing helpers retain face/marker appearance and native actor colors.

Canonical actor keys/colors retain sorted DB indices. Native JavaScript object enumeration puts integer names first numerically, so legend placement uses safe own-property enumeration mapped back to those indices. Review identified this distinction and verified the correction. The math path deliberately supports prototype-like actor names through Maps and safe own properties; plain native behavior remains delegated unchanged. Repeated names produce repeated task markers with original plain-text tooltips.

Measurements remove probes in `finally`. Permanent output is created only after preflight; a drawing failure removes the staged group/definitions and restores all original SVG attributes. A direct injected-failure browser test proves exact SVG restoration and subsequent recovery. The build hook checks the pinned journey hash and requires exactly one patch.

Final browser evidence: 26 Chromium checks at 320/1440, covering the journey suite, shared label suite and injected rollback. Journey fixtures check upstream plain parity, one-read dispatch, four visible roles with fractions/matrices/tall rules/overhang, literal task/section break tags, actor spaces and raw tooltips, prototype and duplicate actors, numeric legend order, finite out-of-range score spacing, all relevant shape/label/ink bounds, row separation and failure recovery. An initial numeric-order test had its vertical comparison reversed; the final assertion follows the explicit 2-before-10 legend order. Typecheck, production build, 30 focused unit tests, budgets and diff check pass. Budget timing mode was not run. Exact hashes/results: `reports/math/journey-render-snapshot.json`.

This is bounded browser adapter evidence, not public activation. Compiler/model/source binding, installed offline/print/fallback/reference checks and final candidate acceptance remain open. Activation fixtures should additionally attest runtime keys against compiler slots, repeated/unused section ownership, and title-only/accessibility-only cases.

## Public compiler and source binding (2026-10-06)

Journey transport now passes through the figure/model/compiler and shared document math budget. Public requests carry the internal journey flag and original source; the raw journey guard is removed. Source maps use validated canonical slot owners and verified original bytes. Runtime binding accepts the journey format for encoded/disjoint origins. The author guide documents literal primary break text, shared actor ownership and finite score requirements.

Checks: 506 Mermaid/compiler/runtime source tests across 56 files, typecheck, production build and diff check pass. Installed release acceptance passes at 320/1440 with exact title/section/task/actor reference packets resolved by the installed CLI. The relocated HTML requests no network or sibling files. Source mode, print and MathML-unavailable fallback pass. The general worker-failure case covers the ordinary math worker; it does not simulate failure of the Mermaid renderer. Budget report is `ok:true` with timing not run; the npm wrapper remained open after printing all passed gates and was interrupted (exit 130).

Independent static review found no material issue after rechecking and retracting an incorrect missing-hook finding against the fingerprinted build injection. An installed-test expected label list initially omitted plain numeric actors; it was corrected without production changes. Exact source hashes and evidence pointers: `reports/math/journey-source-snapshot.json`. Other family adapters and whole-plan acceptance remain open.
