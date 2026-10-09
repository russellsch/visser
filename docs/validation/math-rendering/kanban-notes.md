# Kanban math implementation evidence

## Scope and pinned sources

Kanban is the next unimplemented Mermaid family after the cross-family source-ownership audit.
The public math guard remains active while the adapter is incomplete.

The native artifact is `kanban-definition-PNTS6WVX.mjs`, SHA-256 `b53dd676e6021cb1eb493ec133c619f4f9acb8586b36f0c97f7c18819c5b87aa`.
The reduction-table hash is `7b9f6864dbdcf3887a4e9fec7cf970a8dc5da438e2fa34a35c572cfceda0d400`.
The shared shape artifact is `chunk-7INBJB4K.mjs`, SHA-256 `4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce`.

The contract helper checks the complete native artifact and requires one match per build.
Its Node hook and build plugin are prepared but are not yet installed in production.
The collector checks the reduction table and exact callback ownership independently.

## Grammar and authored fields

The collector uses a fresh native parser and private lexer with range tracking.
It records every node callback, including duplicate IDs and original indentation levels.
Each node retains separate ID and label provenance, native shape type and optional opaque metadata text.
Each decoration retains its current node, icon/class kind and exact source provenance.
Effects preserve callback order.

The lexer removes quote or Markdown delimiters before returning label tokens.
Within quoted metadata, it replaces newline-plus-whitespace with `<br/>`.
The collector tracks that transformation and concatenates grammar-owned token pieces.
It does not search for matching label text in the original document.
YAML decoding, typed coercion, sanitizer normalization and equation validation belong to the next layer.

Kanban has no dedicated title or accessibility grammar statements.
A line resembling such a statement can instead become an ordinary node label.
The collector must not invent common-metadata roles for those lines.

## Native DB observations

| Behavior | Observed result | Implementation consequence |
| --- | --- | --- |
| Duplicate section IDs | Each section receives every card whose parent ID matches that ID. | Preserve actual rendered copies and charge them. |
| YAML label array | Native sanitation produces comma-joined text, such as `first,second`. | Preserve typed values and trace coercion; do not reuse flowchart's first-array-item rule. |
| Assigned array or numeric ticket | Native `.toString()` produces `A,B` or `42`. | Trace each visible value through the real coercion. |
| Falsy metadata values | False, zero, empty string and null do not override the existing field. | Keep overwritten and ignored authored occurrences for validation. |
| First node below the initial section level | Native code attaches it to the current section. The next addition fails. | Reproduce the actual order-dependent behavior during reconciliation. |
| `shape: kanbanItem` | Camelcase validation rejects it before the apparent special case can run. | Do not implement an unreachable override. |
| Decorated classes | Classes are stored but omitted from display data. | Do not create additional visible or styled roles. |

`addNode` sanitizes IDs and parsed labels. `getData` sanitizes labels again.
YAML values and decorations follow different paths. A single sanitation pass is not yet proven equivalent.
The implementation must capture and reconcile the actual native sequence.

## Renderer inventory

Columns render a heading through the cluster helper.
Cards render their title, ticket and assignee through separate text helpers.
Priority controls a stripe; it is not displayed as text.
Section ticket fields are retained but not drawn. Icons are also not drawn.
Visser already rejects `icon:` attributes before collection; this restriction remains in place.
Other hidden authored metadata still needs a documented validation and accounting policy.

The native renderer sets `htmlLabels=false` on a copied config; label helpers retain the configured mode. HTML mode is the default. See the corrected native text-path inventory below.
The shared HTML-label math hook cannot provide complete Kanban support.
A math adapter must restore any global configuration it changes, including failure paths.

The renderer measures headings, then cards, then stacks cards using measured heights.
It resizes columns after stacking. Tall equations must enter measurement before this placement.
The card formula for ticket/assignee height reserves only half the larger metadata height.
That formula needs explicit tall-math containment tests and may require a measured-layout correction.

Native IDs and parent IDs can collide. The adapter needs opaque per-copy DOM identities while retaining native grouping semantics.
Ticket links require both ticket text and `kanban.ticketBaseUrl`.
The native link bypasses the generic link helper. Confirm the effective Visser configuration and existing restrictions before enabling any link path.

## Remaining implementation and acceptance

- Decode metadata with traced YAML structure and reproduce native typed coercion.
- Preserve normalization witnesses and validate every authored math occurrence, including hidden and duplicate fields.
- Capture native state and reconcile repeated column/card copies.
- Add checked transport, worker contracts and document resource accounting.
- Measure all four visible text roles before layout and restore state on failure.
- Bind rendered copies to authenticated source receipts and exact reference exports.
- Verify narrow/wide standalone rendering, fallbacks, offline assets, print, budgets and human acceptance.

Evidence for this foundation is recorded in `reports/math/kanban-foundation-snapshot.json`.
No public activation or complete Kanban-support claim follows from the foundation tests.


## Verified foundation

47 tests across seven files pass, including 17 Kanban contract, native-characterization and collector cases.
Shared flowchart/Requirement collector and coordinate/provenance regressions also pass.
Typecheck and diff checks pass. Independent review found no material or blocking defect in this foundation.
The reviewer independently probed every grammar production, relevant lexer actions, concurrency, malformed input, callback drift and contract counts.

The initial implementation used incorrect callback-array indexing and flattened metadata prefixes repeatedly.
Exact argument comparison and iterative token composition resolve those issues.
Strict token equality replaces an unneeded whole-range substitution fallback.
Final evidence supersedes the initial failing run and test-setup corrections.
Build, browser, installed export and budget checks were not rerun for this unactivated foundation.


## Typed metadata and native grouping

`kanban-metadata.ts` now decodes the exact native YAML wrapper with structural provenance.
It retains recognized fields and their typed values, including falsy assignments that do not override native state.
Active label, ticket and assignee fields follow native string coercion before sanitation.
Arrays retain every element and comma separator; nested arrays use the same joining behavior.
Repeated aliases retain definition provenance. Active-path cycles contribute empty text, matching native array joining.
Generated commas and object text are synthetic; they do not invent an exact authored source span.
An equation assembled across array elements therefore remains identifiable as synthetic.

Decoded forbidden `icon` and `img` keys reject, including escaped keys that bypass a raw substring check.
Shape validation and incompatible shadowed string methods preserve native failure behavior.
The decoder does not replace the later sanitizer, all-occurrence math accounting or native-state reconciliation.
Its typed values and traces can contain cycles; they are internal data, not a serialized transport format.

`kanban-groups.ts` accepts already-normalized nonempty IDs, source ordinals and indentation levels.
It records the actual parent section ordinal and expands copies in native display order.
Duplicate section IDs repeat matching cards without merging their authored identities.
Canonical copy keys depend on section and node ordinals, not authored IDs.
The first lower-indentation node is accepted; a subsequent addition fails as native code does.
This planner does not sanitize IDs, generate fallback IDs or reconcile label fields.

Tests compare typed arrays, cycles and objects against the actual native DB.
Object fixtures use block YAML because the Kanban lexer closes metadata at an unquoted inner closing brace.
The shared regression suite passes 105 tests across nine files, including 34 Kanban cases.
Final review, typecheck and snapshot evidence are recorded in `reports/math/kanban-metadata-snapshot.json`.
Public activation remains pending.


### Metadata review corrections

K-M1 found that valid empty block-sequence entries have no scalar trace.
The decoder now handles null array entries before requiring provenance for non-null values.
An actual Kanban fixture verifies native `a,,b` output.

K-M2 found that alias expansion could allocate provenance before downstream label-size validation.
The decoder now enforces the existing 64 KiB UTF-8 label limit while retaining each output piece.
The check includes generated commas and object text. It runs before final mapped-text materialization.
Tests accept exact-boundary ASCII, multibyte and supplementary Unicode output, reject over-limit alias graphs and verify recovery.
This applies an existing limit earlier; it does not introduce a new policy bound.


Independent recheck accepts K-M1 and K-M2 with no remaining material helper finding.
The former alias reproducer now fails at byte 65,537; measured peak RSS falls from about 240 MiB to 96 MiB.
Those measurements describe the probe, not a new performance guarantee.
The reviewer also verified exact boundaries for lone surrogates and compared byte accounting with native Node byte length.
An independent exhaustive grouping comparison covered 55,987 short inputs, including duplicate IDs and lower-level failure timing.
Acceptance is limited to metadata coercion, provenance, its expansion bound and pure grouping.


## Stored DB replay and sanitation witnesses

`kanban-db.ts` replays native node additions and decorations from normalized effects.
It retains shape padding, fallback ID counters, duplicate IDs, typed metadata, shared section objects and YAML cycles.
Reconciliation checks every stored field and the object-alias graph against a detached native snapshot.
The prepared full-artifact contract exports that snapshot without exposing mutable native arrays.
This contract remains uninstalled in production.

Decoration effect fields are present only when the original decoration was truthy.
A nonempty decoration that sanitizes to empty text still overwrites the old native value.
The replay must not apply a second truthiness test after sanitation.

`kanban-sanitize.ts` uses the existing private purifier and records each strict/default pass.
HTML-label mode applies two passes; SVG-label mode applies one. Empty strings bypass both.
Each output is traced through HTML normalization to retain exact formula origins where supported.
Witness shape checks do not authenticate caller-supplied sanitation results; native reconciliation and future source receipts remain necessary.

An isolated Node process compares 12 native DB corpora in both label modes, including subsequent `getData` sanitation.
The cases cover duplicate IDs, all shape paddings, fallback collisions, typed and cyclic labels, falsy overrides, decorators and indentation failures.
Mutation probes check detached snapshots, alias topology, hidden fields, counters and recovery after clear.
Separate sanitation tests cover HTML normalization, scripts/styles, entities, target hooks, formula provenance and concurrent modes.

The combined foundation and shared provenance suite passes 120 tests across 11 files.
This milestone does not yet join parser provenance to normalized effects or implement all-authored math accounting.
Native lifecycle capture, checked transport, measured SVG rendering, source binding and public activation remain pending.

Independent review accepts this helper scope with no remaining material or blocking finding.
It independently checked 24 native DB cases, 52 sanitizer comparisons, cyclic aliases, detachment, recovery and contract drift/count checks.
One minor finding was corrected: malformed sanitation witnesses now raise `E_MATH_INVALID` consistently.
Evidence and final file hashes are recorded in `reports/math/kanban-db-snapshot.json`.


## Source-to-state preparation

`kanban-source.ts` now joins grammar collection, typed metadata decoding, sanitation, replay and copy grouping.
Every metadata document is decoded and bounded before replay can invoke native string coercion.
The helper preserves exact effect order and checks that each decoration belongs to the latest authored node.
It returns both original parser fields and their sanitized base values.
Effective metadata labels retain traced typed coercion without premature sanitation; native `addNode` stores those overrides directly.
Generated fallback IDs use synthetic provenance. Current source grammar rejects empty shape labels; the lower-level native DB oracle covers fallback IDs directly.

The replayed snapshot remains detached from decoded metadata, and its node/array wrappers are frozen.
Nested typed YAML values may still be cyclic and mutable; these internal records are not transport or authentication receipts.
Duplicate columns retain source ordinals and native repeated-card order.
Preparing a diagram never clears or mutates the native singleton DB.

An isolated oracle compares 21 authored source cases against native parsing, including HTML/SVG label modes, typed cyclic aliases, decorators, all shape types and BOM/CRLF/dedent.
It verifies native state is unchanged during successful and failed preparation.
Additional tests retain independent origins for equal formulas, alias-definition origins, overridden labels, decoded HTML, resource-limit failures and concurrent sources.
The sanitation mode is validated even for an empty diagram.

Independent review accepts the source-preparation helper with no findings.
It separately ran the 21-case native oracle and probed effect ownership, duplicate grouping, typed provenance and recovery.
The combined suite passes 127 tests across 12 files; typecheck and diff checks pass.
Evidence: `reports/math/kanban-source-snapshot.json`.


## Native text-path inventory (corrected by executable probes)

The earlier source-only inventory incorrectly treated `conf.htmlLabels=false` as a global mutation.
`getConfig()` actually returns a copied configuration (`chunk-O7XYJQB3.mjs:5156–5158`).
Kanban calls `getData()` first, then changes only its local config copy.
Column and card label helpers read fresh config, so they retain the configured mode.
The normalizer now uses that configured mode for both DB and renderer sanitation.
This supersedes the prior SVG-only interpretation; source-preparation and stored-state tests remain valid.

| Field | Native text stages after source preparation |
| --- | --- |
| Card title | `getData` sanitizes stored label; `kanbanItem` calls `labelHelper`, which reverses Mermaid entity sentinels and sanitizes again under configured mode; `createText` selects HTML or SVG from configured mode. |
| Column heading | `getData` sanitizes stored label; `kanbanSection` calls `createText` directly under configured mode, without the card helper's extra sanitation. |
| Ticket and assignee | Native metadata has already stringified truthy values. `getData` forwards them without sanitation; `insertLabel` reverses entity sentinels and sanitizes under configured mode, then calls `createText`. |

The pinned paths add no text prefix or suffix to these fields.
A ticket link wraps the same displayed text when configured; its URL substitution still needs assessment before activation.
The native SVG branch canonicalizes break tags, reverses entity sentinels and processes Markdown.
The native HTML branch has its own Markdown and KaTeX paths.
The planned math hook takes checked text before those branches, preserves standard TeX backslashes and measures its own mixed text/math label.
Unmodified native Markdown output is not the normalization helper's contract.

Primary source locations: `chunk-7INBJB4K.mjs:172–207,237–271,5983–6027`; `chunk-UA2S7LBM.mjs:349–425`; `chunk-MBY4JIJT.mjs:803–875`.
Section tickets, literal priority values, icons and decorated classes are not visible text in these pinned paths.
Priority selects a colored line; icon presence requests a label background; classes are dropped by `getData`.
Source-level hidden-field validation is distinct from charging rendered copies.

A native Chromium probe verifies four HTML label objects for a column, card, ticket and assignee in HTML mode, and zero in SVG mode.
The configured mode remains unchanged after rendering and no network request occurs.
This is a mode-characterization check, not math geometry or standalone acceptance.

## Per-field math normalization and charging

`kanban-text.ts` and `kanban-normalize.ts` retain configured-mode sanitation witnesses for each role.
The proposed prelayout hook reverses private entity sentinels, converts breaks to newlines and restores one sanitation entity layer only inside existing equations.
It preserves standard TeX backslashes and does not discover math by decoding arbitrary character references outside existing equations.
Every intermediate stage remains available for validation, including text later removed by sanitation.

`kanban-field-math.ts` validates those stages with the shared equation policy.
Budget identities use positions in a local copy of the effective field text, independently of original fence origins.
Repeated aliases therefore count as separate occurrences even when they point to the same authored definition.
Equivalent variants retain the maximum byte/element cost; synthetic variants retain separate charges.
Hidden fields still consume their validation charges. Additional rendered copies charge canonical math occurrences.
This helper does not yet enumerate every authored Kanban field or determine final rendered-copy multiplicity.

Executable parity tests also exposed Mermaid's lazy sanitizer-hook setup.
A fresh SVG-only parse does not install native link hooks, whereas the private purifier always has them.
Prepared contract version 2 exposes `visserPrepareKanbanSanitizer`; native integration must call it before parsing.
Its inert strict-HTML sanitation pass installs hooks without changing the DB or configured label mode.
Repeated initialization preserves both snapshots.
After initialization, fresh HTML-first and SVG-first processes each pass 88 exact native-field comparisons.
The contract remains uninstalled in production; activation still requires lifecycle, transport and rendering integration.


A duplicate-column Chromium probe adds an important distinction for the next copy planner.
Two columns sharing an ID with two authored cards produce four item entries in `getData`, but eight rendered card groups.
The draw loop filters the already-expanded display list separately for each matching section.
Thus `planKanbanGroups` models the DB display list; final renderer accounting must expand that list again.
Native rendering also creates ticket and assignee label objects when their text is empty.
The probe sees 26 HTML label objects: two headings plus eight cards with three fields each.
This does not require charging empty text, but the future row hook must expect those calls.

137 tests across 14 files, typecheck and diff checks pass for the field-helper milestone.
Independent review accepts the corrected configured-mode and warmup contracts, with no remaining scoped finding.
It separately ran both 88-case native oracles and probed role stages, aliases, hidden charges, extra copies, malformed witnesses, limits and recovery.
Evidence: `reports/math/kanban-field-snapshot.json`.


## Authored-field validation and actual render copies

`kanban-math.ts` now connects prepared source records to per-field validation and actual draw counts.
Base labels retain the original text and their initial `addNode` sanitation witness, including when metadata overrides them.
Explicit IDs are separate authored roots. A label-derived ID shares its root only when text and exact parser-token origins agree; equal text alone does not merge fields.
Decorations retain their real sanitation stages and remain hidden records.
Visible bindings select the effective label, ticket and assignee records by node ordinal.

Recognized metadata fields validate both native string-coercion variants and every physical decoded scalar reachable through their trace graph.
An iterative identity-based walk visits mapping keys/values, sequence items and alias definitions once, including cycles.
This catches math hidden behind native `[object Object]` output without expanding opaque alias graphs into imaginary text.
Unknown top-level data is not a text surface; it is traversed when a recognized field references it.
Equations split across incomplete scalar fragments reject rather than bypass authored scalar validation.

Accounting has two identities: local semantic positions distinguish effective occurrences, while original-source intervals establish scalar coverage within one metadata field.
A scalar check with an exact nonsynthetic origin can raise the maximum cost of one covering effective charge.
It never merges two effective charges; repeated aliases therefore retain their native output multiplicity.
Unmatched or ambiguous scalar occurrences keep separate fallback charges.
Physical hidden scalars count once per field trace graph. This is the selected internal accounting policy, not a claim that hidden mappings have repeated visible copies.
The existing expression and document limits remain unchanged.

`kanban-render-copies.ts` verifies the prepared display list and computes per-node counts arithmetically.
It provides repeatable lazy iterators in native draw order: all column headings, then each column's matching entries from the already-expanded display list.
Keys include outer section and display ordinals, preserving every repeated rendered instance.
No second expanded output array is allocated before resource validation.
The existing prepared display list is still materialized; this helper does not change parser-worker heap/time limits.

A Chromium check compares the new iterator's card-title order and counts directly to native output for duplicate columns.
It verifies eight cards from four DB display items, with zero network requests.
The combined suite passes 153 tests across 16 files, including hidden/overridden values, cyclic metadata, alias multiplicity, exact source bytes, limit boundaries and recovery.
Typecheck and diff checks pass. These internal records still require native lifecycle reconciliation and authenticated transport before activation.

Scalar fallback validation streams checks and reserves each charge before requesting the next scalar.
A boundary test verifies that the first excess charge rejects without consuming the remaining iterator; foreign-source scalar provenance also rejects.
Independent review found no production defects in the final three-helper snapshot. Its stale-evidence finding was resolved by rerunning all 153 tests and typecheck after the final edits.


## Internal native lifecycle and source reconciliation

Prepared contract v3 captures effective strict-mode configuration alongside native stored state.
Width and padding resolve with the exact native per-field nullish defaults.
The contract retains v2 sanitizer initialization; no production registration is included yet.

`kanban-node-db.ts` wraps the singleton parser, requires its exact receiver and DB, and consumes one fresh clear per attempt.
Every parse attempt invalidates the previous receipt. Failure, overlap and clearing during parse cannot authorize a subsequent parse.
The wrapper captures detached state and configuration synchronously on successful completion.
A capture is consumed once and bound to the exact parser input; later native mutation cannot alter it.
Configuration changes during parsing reject. The synchronous sanitizer replacement is restored on success and failure.

`kanban-node-math.ts` consumes that completion before asynchronous collection.
It uses captured options and label mode, requires exact collected parser input, and reconciles the complete stored graph including aliases.
These internal records are not serialized transport receipts.

The combined suite passes 155 tests across 18 files. Typecheck passes.
Isolated tests cover missing contracts, repeated installation, malformed callers, source mismatches, one-use receipts, failed parsing, clear/overlap failures and recovery.
Additional checks mutate native state and configuration before consuming a receipt, reject configuration changes during parsing, and compare fallback dimensions with native stored nodes.
Both label modes and the real Mermaid API pass source-to-state reconciliation, including duplicate-card math charges.
The native parser is synchronous; the asynchronous-result guard is not exercised by the pinned artifact.

Authenticated transport, worker registration, measured rendering, source receipts and installed standalone acceptance remain open.
Kanban remains publicly guarded.

Independent review accepted the final lifecycle and reconciliation snapshot with no material findings.


## Checked JSON transport and worker registration

`kanban-transport.ts` projects authored records to canonical text, located formulas and formula charge witnesses.
It does not serialize native snapshots, cyclic YAML, effect values or provenance graphs.
Each charge retains one or two validated formulas attaining its byte and element maxima; reservation revalidates those formulas and charges their coordinatewise maximum once.
Additional copies derive from renderer bindings. Numeric totals are recomputed rather than trusted.

Only nodes with visible canonical math contribute draw bindings.
The copy planner filters its display list once while retaining original display indices, then visits the filtered entries in native draw order.
Math-free repeated instances do not expand the transport. All authored records, including hidden charges, remain in the payload.

Structural validation checks shapes, roles, formula parts, charge witnesses, draw keys, field ownership and totals.
It cannot prove source completeness or original ownership.
The entire payload is bound to the existing private immutable source receipt, including charges, origins and bindings.
Tests swap equal-TeX origins and remove a hidden charge with correctly reduced totals: structural reservation accepts both coherent edits, while receipt authentication rejects them.
Any future compile integration must authenticate the source receipt before accepting this transport.

The worker now registers the pinned native contract in source and bundled modes.
It explicitly sets HTML labels to true, matching Mermaid's effective default while avoiding an undefined raw configuration field.
Before native parsing, it reads validated effective options and runs bounded authored-math preflight.
Denied metadata and oversized alias coercions reject before native addNode runs.
After native completion it independently collects and reconciles again; preflight does not substitute for the authenticated native capture.
Cache keys and receipts include the Kanban family. Plain Kanban emits no math payload.

The shared Mermaid suite passes 764 tests across 115 files.
A subsequently added componentwise proof test passes in a focused three-test run; production files did not change after the shared suite.
Typecheck and release build pass. A five-case fixture proves exact source/bundled worker JSON parity for cycles, duplicate draws, failure recovery, plain text and a mixed Requirement batch.
This is worker integration evidence, not installed standalone rendering acceptance.

Measured rendering, source-map/export integration and public activation remain open.
Kanban remains publicly guarded.

Independent review found no confirmed material defect in the fixed transport/worker snapshot.
The reviewer independently passed the lifecycle/preflight fixture. Its bundled parity rerun was blocked by sandbox process permissions; the coordinator’s authorized parity run passed.


## Measured rendering and public source/export integration

Kanban is now admitted by the public guard. The resolver requests the family
adapter, includes its occurrence budget, and carries the authenticated transport
through compilation. Source maps authenticate the entire private receipt before
traversing source claims. Each visible draw has a distinct label/ticket/assigned
key; hidden-only math emits an empty map. Encoded and unrepresentable source
bindings use the existing strict runtime attestation.

The browser adapter measures formulas before laying out columns and cards.
It preserves native plain-label processing and native classic/rough outlines,
using final measured dimensions. Ticket and assignee rows reserve their full
height and combined width. Every actual repeated card gets a fresh DOM identity.
A hidden SVG stage commits only after successful measurement and coverage checks;
failures remove the stage and restore root state. Math-free boards use the native
renderer. Fixed toolkit configuration has no ticket links; an externally configured
ticketBaseUrl is rejected for math-active boards.

The shared shape artifact composes Requirement and Kanban hooks only after
checking original artifact hashes. Build registration counts fail closed.
A rejected initial post-render replacement draft was replaced with measured
layout before acceptance; the final renderer was independently reviewed.

The browser fixture covers two viewports (320/1440), HTML/SVG labels and
classic/hand-drawn styles. All eight cases contain two columns, eight distinct
cards and seventeen formulas. Formula descendants fit outlines, metadata and
cards do not overlap, source selections bind, failure recovery succeeds, and no
network requests occur. This is automated geometry evidence, not human visual
acceptance. The representative screenshot excludes deliberately injected failure
output. Source/export and renderer reviews found no material defects; reviewers
inspected code and evidence but did not independently run the full browser suite.

Final candidate results and hashes are recorded in
`reports/math/kanban-public-snapshot.json`. Full family coverage and the overall
W5/W6 and C01–C08 gates remain open.
