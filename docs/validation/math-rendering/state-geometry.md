# State-diagram adapter inventory

Status: parser and extraction-observer foundations verified; public state math remains guarded. This follows sequence activation and does not narrow the full Mermaid scope.

Pinned Mermaid 12.0.0 maps both `stateDiagram` and `stateDiagram-v2` to detector `stateDiagram`, loading `stateDiagram-v2-GCMORJYK.mjs`. Root verified SHA-256 `33ba302a233f6a2b43efd12b2ba42cd1878d637bf79d351d5901812728c9318d`. An earlier tentative hash in the investigation was corrected; use only this verified value. Sourcemap sources include stateDiagram.jison, stateDb.ts, stateCommon.ts, dataFetcher.ts and stateRenderer-v3-unified.ts.

A fresh StateDB(2) feeds `extract(getRootDocV2())`, `getData()` and generic rendering. The shared createText MathML ink hook is already patched, but that supplies no state provenance or source ownership. Existing worker extraction keeps only descriptions[0], basic state identity and edgeN transitions. Notes, additional descriptions and accessibility are not mapped.

## Source and renderer roles to characterize

- Explicit/implicit state names, colon descriptions, quoted aliases and descriptions attached to relation endpoints. Determine exact overwrite/multiple-description behavior before modeling slots.
- Transition relationTitle and sanitized edgeN.label; note connector edges consume numbers, so preserve actual native edge identity.
- Single-line and end-note blocks, left/right placement. The data fetcher emits a note leaf and parent/group with repeated text: characterize whether both really render before reserving copies or source slots.
- Accessibility title and single/multiline description, including actual common-DB normalization.
- Fork/join/choice/start/end/divider and direction/style/class tokens are controlled structural data, not automatically authored math labels.

## Existing restrictions and integration

Visser already rejects composite states because nested identity is not extracted; normal concurrency occurs inside a composite. Retain that existing exclusion unless implementing full recursive ownership. Synthetic divider/group IDs must never acquire invented authored spans. Links, directives, source HTML and style restrictions remain governed by the existing profile.

Core figure targets and runtime `findDrawn` use state IDs and edgeN. Flowchart source extraction/reconciliation/source-map/stamping modules are design references only; state needs its own verified slot and DOM ownership rules. Shared `mermaid-ink.ts` can reserve prelayout MathML dimensions once label inputs are attested. Native class assignment also needs an explicit toolkit namespace audit; sequence isolation does not prove other families safe.

## Next bounded work

Characterize native grammar reductions and browser DB fields for declarations, aliases, endpoint descriptions, transitions, both note forms, accessibility, repeated labels and overwrites. Inspect normalization with real sanitizer behavior. Preserve BOM/CRLF/Unicode/quote-escape origins. Then implement source extraction, DB equality, explicit visible copies and browser stamps; verify tall/overhanging geometry at 320/1440, original source selection, plain parity, pseudo-state behavior, existing exclusions and installed offline/fallback behavior before lifting the state guard.

The read-only inventory's direct Node probe hit the known DOMPurify non-DOM import limitation; it did not establish runtime behavior. Use the isolated worker sanitizer or actual browser for characterization. No state implementation or acceptance is claimed here.

## Native grammar and extraction foundation (2026-10-06)

The raw collector follows pinned Jison reductions and lexer ranges, retaining each field occurrence, its exact parser-object identity, original UTF-8 intervals and the returned root object graph. It preserves overwritten accessibility assignments, description arrays, relation endpoints, note-only implicit states and composite inner fields. Composite/concurrent rendering remains excluded by the existing profile. Fork/join/choice IDs are collected as authored structural data; this does not assert that their native shapes draw visible text.

The collector observes actual note lexer rule 67/68 rather than inferring mode from contents. Native rule 67 accepts whitespace, including a newline, before the colon and then removes exactly two characters before trimming. Quoted aliases retain native colon splitting; composite aliases retain the whitespace that their distinct production preserves. Special-state suffixes accept both native angle/bracket spellings and case variants. A dedicated divider counter preserves native parser IDs.

Browser characterization at 320/1440 establishes six cases: accumulating descriptions, authored descriptions equal to state IDs, quoted alias colon arrays, notes before edges, repeated notes, and accessibility normalization. Description title/body use separate foreignObjects; note leaves render once while note-group containers draw no label. Notes consume graph counters, so a following relation can be edge1 or edge2. Repeated extraction preserves the tested node fields and visible formula copies.

A SHA-checked source transform now observes the actual native extraction branches. It links parser objects to internal node records, candidates, retained layout nodes, relation edges and note leaves. Note sanitization is observed at the actual mutation on every pass. Observers are private per-DB/per-array WeakMaps with synchronous callbacks; callers must attest the patched module marker, avoid reentrant extraction and dispose in finally. One pure transform serves a Node load hook and an esbuild plugin, preserving the original Mermaid module URL and relative imports. Source-mode and relocated bundled probes agree. The browser characterization compares native and instrumented rendering.

These hooks are exercised by the foundation tests only; the production parse-worker and browser build have not enabled state observation. Remaining work: source-mapped sanitizer transformations and effective-label reconciliation, complete math validation including overwritten fields, explicit visible-copy and resource planning, compiler/source-map transport, DOM stamping and exact-source copy, reserved class boundary, native shape/geometry/print applicability, and installed standalone/fallback checks. Keep the state raw-math guard until those checks pass.

## Effective provenance and private Node sanitation (2026-10-06)

`state-provenance.ts` now consumes native observer events. It tracks immutable leaves/arrays by exact grammar/internal/candidate/retained object identity, applies the reported description operation, mirrors native one-level array flattening at sanitation, and attests resulting values before publication. Duplicate equations keep separate intervals. Note history survives extraction epochs because the native grammar note object itself is mutated. Generated note connectors require the observed state/note endpoints and directed native ID; unknown layout ownership fails.

Implicit IDs are promoted to authored labels only when they survive into a label-bearing native candidate; the epoch retains that promotion if a later declaration overwrites the label. Other IDs remain machine data. Quoted aliases now retain separate ID provenance because a whitespace-only title can fall back to the ID. Synthetic initial IDs are limited to the attested root start/end translations of an authored `[*]`. Exact ordered description records replace text-based field selection.

The Node-only state DB installer supplies one actual private-DOMPurify pass during synchronous native extract/common-setter calls, forwarding options and restoring the identity stub in finally. Nested scopes and thrown errors restore the prior dependency. It never leaves the substitute installed across an async boundary or installs browser globals. Pure HTML provenance tracing was moved from the sequence helper into `html-provenance.ts` without changing its algorithm, so browser probes and Node use the same source mapping with independently actual sanitizer output. Production worker installation is still pending.

Real probes cover source and relocated Node bundles, repeated extraction, HTML/encoded-dollar notes, pseudo states, duplicate title/body formulas, overwritten implicit labels and blank-alias fallback. The browser also records a pinned upstream limitation: `note right of A: n` with no preceding state declaration produces a node with shape undefined, and actual rendering throws `No such shape: undefined`. Extraction alone must not be cited as visible-rendering evidence. This case is not promoted as a supported visible path; its final compatibility/fallback treatment remains part of state integration. No new native default-shape behavior was invented.

The consumer does not yet validate TeX, reserve copies/resources, map common accessibility fields, join description rows for source-map transport, stamp DOM labels or enable state math. Those integration and acceptance gates remain open.

## Authored ledger and copy planning checkpoint (2026-10-06)

`state-math.ts` validates explicit authored records and promoted implicit labels, retaining source locations across observed sanitizer variants. `state-render-plan.ts` maps actual reconciled native objects to labelHelper, createLabel title/body, and direct edge slots. It verifies immutable native identity/applicability snapshots and ordered body constituents, and reserves copies by exact authored record identity. Hidden shapes and structural groups do not invent visible copies; unknown shapes fail.

`mermaid-state-text.ts` scopes four-entity formula restoration to the actual SVG during native state layout, matching core validation after slash and break normalization. The browser build verifies both pinned state/shared-text artifacts, unique patch anchors and application counts. Observer-enabled browser probes compose instrumentation and runtime normalization in the same loader. Plain labels and other diagram families retain their existing path.

Seven browser fixtures now compare planned equations with native MathML at both viewport widths. Source and relocated Node bundle tests compare plans and repeated extraction. Mutation tests reject changed node IDs, DOM IDs, shapes, description presence and edge endpoints. Independent reviews closed the stale-identity finding and accepted the scoped normalization. See `state-math-plan-snapshot.json` and the progress checkpoint for precise checks and limits.

Still open: common accessibility getter reconciliation, worker/compiler transport, exact source-bound DOM stamping/copy, reserved class boundaries, full state geometry, print and installed offline/fallback validation. The public state equation guard remains. The existing undefined-shape note-only behavior requires an explicit integration outcome rather than a fabricated shape.

## Production parser connection (2026-10-06)

The source and release parse workers now enable the version-checked observer and private native sanitizer. `state-node-math.ts` retains a normal native parse as its authority, saves layout/accessibility values, and compares a fresh collector-root extraction before deriving metadata. A second observed extraction matches native browser pre-layout behavior. `state-accessibility.ts` replays raw assignments and independently reconciles final normalized getter values; original overwritten assignments remain in the math ledger. `state-transport.ts` excludes live objects and provenance instances from worker JSON.

The planner's default remains strict. The worker may defer only undefined shape when proving the entire diagram has no effective equations; sentinel-only equations on a different admitted label still force the shape error. Plain note-only behavior and existing composite rejection remain unchanged. No default shape was invented.

Current evidence: six source-worker integration tests, seven exact source/relocated release parity fixtures and 449 Mermaid regressions. Details and source hashes are in `reports/math/state-worker-snapshot.json`. Production compiler transport, checked document totals, DOM/source-copy bindings, class boundaries, state geometry and installed state fallback acceptance remain pending. No public state activation is claimed.

## Source binding contract (2026-10-06)

State slots now map through the compiler's shared original-byte/displayed-code machinery and the runtime's private source-selection bindings. Node/note owners require ID `${renderId}-${domId}`; edge labels require their exact native data-id beneath an edgeLabel group. Each node has one direct label group. Plain boxes/notes have one direct foreignObject; rectWithTitle has exactly two, in title/body order even when one sibling contains plain text. No displayed-text matching is used.

Before stamping, runtime verifies all requested keys/owners/foreignObjects, expected formula TeX/counts and absence of unclaimed MathML. It commits only after validation. Source binding then checks source text, ranges and all formula identities. Nine native browser fixtures pass at 320/1440, including exact selection of encoded delimiter spelling; unit checks reject duplicate/missing/stale structure without mutation. This establishes selection binding for the admitted slots, not full state layout/print/installed activation acceptance.

The figure model and compiler now carry state math and recompute per-record maximum charges after JSON transport. The public raw guard is still present. See `reports/math/state-source-snapshot.json` for exact implementation and evidence.

### Next-step class audit (read-only, not implemented)

The pinned state shorthand `state A:::vs-x` can introduce reserved toolkit classes; the ordinary classDef/applyClass lexer currently uses word tokens and rejects a hyphenated class name. StateDB `addStyleClass` (pinned chunk around line 1800) owns class-definition map keys, and `setCssClass` (around 1850) receives direct/shorthand class assignments. Layout joins these into cssClasses and looks up matching class definitions before shared shapes write the SVG class attribute.

Reader recommendation: normalize reserved whitespace-delimited `vs-*` tokens idempotently at both StateDB method boundaries, preserving ordinary classes and matching definition/assignment keys; leave direct inline style statements unchanged. Use one fingerprinted transform for source worker, release worker and browser so native data comparison remains consistent. Recheck exact coercion, separators and native class application before implementing, then test real reader CSS, target helpers, plain/math labels and installed SVG copies. This recommendation is not yet an accepted or verified implementation.

## Effective authored classes and geometry (2026-10-06)

The preceding read-only class recommendation was incomplete. Parse success of standalone shorthand does not prove that the class reaches the rendered state. Actual browser fixtures now use explicit `class A ...` assignments. More importantly, a raw `vs-*` check is insufficient: a literal native sentinel such as `vsﬂ°°45¶ßselected` reaches the class value, and final SVG entity decoding plus attribute parsing produces `vs-selected`. Raw Mermaid `#45;` spelling remains excluded by the existing source profile; literal sentinel spelling is admitted.

`state-classes.ts` now computes a source-mapped effective attribute value: escape literal ampersands/quotes as serialization does, restore native sentinels, then decode HTML references in attribute mode. For each effective reserved token it inserts `mermaid-authored-` at the original token start; ordinary class bytes stay unchanged. The helper checks its effective output and is idempotent. The same fingerprinted patch applies it at StateDB class definition and assignment boundaries in source worker, release worker and browser. Matching original definition/assignment keys receive matching prefixes. Shared HTML provenance tracing exposes its decoder with an explicit mode; existing sanitizer tracing retains its prior legacy mode.

Real-browser class checks exercise literal, decimal-sentinel, hexadecimal-sentinel and encoded whitespace assignments under reader CSS, in plain and math states. They verify visible nodes, retained ordinary classes, real toolkit targeting/highlighting and cloned SVG. Native data/source bindings also continue to pass.

Geometry fixtures cover fractions, a 10em tall rule and a 20em overhang in rect title/body, plain state box, note and edge labels at 320/1440. They verify nonempty MathML ink fits each foreignObject and the SVG viewBox, and title/body do not overlap. Title/body owners come from actual native DB DOM IDs, not a guessed zero counter. This is bounded state geometry evidence; complete installed export, print/fallback and public activation acceptance remain pending.
