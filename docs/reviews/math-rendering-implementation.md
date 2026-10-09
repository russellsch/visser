# Math implementation review record

Status: in progress, not final candidate acceptance. Baseline `2f6bc5c8f30363ab50392cb3bc736dfdc6808c66`; all implementation is an uncommitted workspace candidate. This record distinguishes targeted independent reviews from author verification. Full coverage, candidate-wide independent review and human gates remain open.

| Finding | Independent evidence | Disposition and verification |
| --- | --- | --- |
| Valid Markdoc whitespace bypassed math tagging; quote/list prefixes leaked into display source | Syntax/tokenizer probes | Corrected with tokenizer and integration regressions. |
| Empty no-ink SVG paths rejected ordinary text spaces | Engine/runtime corpus review | Empty path accepted only as a no-ink path; literal-dollar/text corpus regression passes. |
| Numbered environments and broad HTML rejection produced policy mismatch | Engine review | Explicit environment policy and narrow HTML guard; ordinary comparisons accepted. |
| Malformed worker SVG or mixed success/error reply could appear successful | Protocol review | Shared structural validation and strict reply arms; eight worker validation tests pass. |
| Finite extreme geometry could pass numeric validation | Structural geometry review | Explicit dimension bound and viewBox/metric coherence; engine corpus and boundary tests pass. |
| Display/unit delimiters paired across independently authored fields | Integrated measure probe | Segmented SVG text, table values and inspector facts; integrated no-math regression passes. |
| Plain proxy edge label overlapped a tall math context | Independent graphSvg probe | Offset now uses measured context height; regression verifies containment. |
| Generated equation ordinal entered a partial copied quote | Independent DOM and browser probe | Live source text-node projection removes generated ancestry, including a generated target itself. Standalone partial/mixed reference tests pass. |
| Copied math duplicated itself in quote prefix/suffix | Installed-release browser assertion | Normalize selected source range before context extraction; exact/prefix/suffix assertions pass. |
| Tooltip text could contain generated Copy LaTeX controls | Independent runtime source review | Source projection removes generated controls; rich copies preserve explicit math/code structure. Installed-release tooltips and inspector tests pass. |
| Concurrent dynamic roots used stale document output costs | Independent asynchronous lifecycle review | Corrected: recheck live aggregate output before each insertion and serialize conversions per document. Fifteen runtime tests and installed-release interactions pass. |
| Replacing a pending inspector title missed its new placeholders | Independent asynchronous lifecycle review | Corrected: coalesce a follow-up rescan using latest records; stale detached slots are skipped. Controlled delayed-worker regression passes. |
| No-math note projection gained a blank line after its target marker | Full-suite regression | Restored legacy adjacency while retaining display-equation spacing; components suite passes. |
| New markdown-it import emitted Node punycode warnings in release CLI | Baseline archive comparison and deprecation stack | Bundle pinned userland punycode; review CLI tests 8/8 pass. Source development imports may still emit the upstream Node deprecation warning. |

The full suite initially ran 1,561 tests with seven failures. Three were stale math test expectations, one was projection spacing, one was the new warning, and two catalogue word-count failures were reproduced at baseline. Focused corrections passed; this does not substitute for a final full-suite run.

Mermaid remains a separate open implementation gate. Pie now has grammar-aware extraction and pre-layout measurement; other families retain the conservative source-line guard. This is partial implementation, not completed Mermaid support.

Latest milestone full suite: **1,590 pass / 1,592 total**, only the two baseline catalogue failures. The AST first-sentence code-immunity fix is included. Evidence is retained in `reports/math/full-suite-junit.xml` and `reports/math/full-suite.log`; standalone/browser identity and results are in `reports/math/standalone.json`. This remains a milestone review, not completion of W5/W6 or C01–C08.

## Pie slice review (2026-10-06)

| Finding | Independent evidence | Disposition and verification |
| --- | --- | --- |
| `rlap` and `smash` permit ink beyond the outer MathML layout box | Astra bounded rendering review, confirmed with pinned KaTeX | Measure the union of descendant boxes in local SVG coordinates and normalize negative extents. Chromium tests contain every descendant within its reserved label and viewBox; independent recheck closed the finding. |
| Replacing plain pie labels changed upstream spacing and typography | Astra rendering review | Dispatch no-math diagrams to upstream `draw`. Browser tests compare actual plain viewBox, arc paths, legend transforms and title with an unpatched bundle. |
| Chunk-name changes could silently skip the adapter patch | Astra build review | Require exactly one fingerprint-checked patch. Unit tests prove missing and modified chunks fail the build; independent recheck closed the finding. |
| Escaped dollars decoded into math after the raw-source validation gate | Sol source integration review and reproduced `loadBundle` bypass | Every pie goes through grammar extraction. Escaped delimiters without provable raw spans fail closed. Independent recheck and 12 extractor/integration tests passed. |
| Print retained a hidden source for a rendered math pie | Installed standalone assertion (author verification) | Math-bearing Mermaid figures print their wrapped source. Installed-release rerun passed. |

The integrated slice passed 188 focused unit tests and three Chromium tests (including 30 pie renders). Installed-release standalone checks passed rendered, no-JavaScript, MathJax worker failure, and unavailable-MathML modes without network/sibling requests. These checks do not close other Mermaid families, diagram glyph-selection/reference coverage, the COV ledger, or human acceptance.

## Pie reference-copy review (2026-10-06)

- The compiler maps proven byte spans to the displayed source after fence dedent, comment removal and visible bidi escaping. Runtime binding verifies occurrence keys, formula counts, effective TeX and exact source spelling before populating private bindings.
- A Sol test review exposed cross-figure binding; the implementation now verifies figure ownership and rechecks moved nodes and changed source during selection.
- Astra review found binding of overwritten/accessibility-only math to upstream plain drawings, outside-endpoint ranges crossing drawings, and differing bidi transformations. Binding now follows active visible expressions, intersecting ranges reject, and source/offset transformations agree. The independent recheck found no remaining material flaw in these fixes.
- Single-formula and same-label formula selections map to a fresh source range. Mixed or cross-label selections clear the old quote and explain how to select source; they are never silently reduced to one equation.
- Verification includes source privacy, duplicate/overwritten labels, missing/stale/duplicate metadata, partial glyph selection, same-label formulas, mixed selections, reversed source order, figure ownership, source mutation and node movement. Installed-release checks assert exact quoted TeX, prefix/suffix, and stale-quote clearing.

This is a bounded review of pie source copying. It does not close remaining Mermaid families or final candidate/human acceptance.

## Timeline adapter bounded review (2026-10-06)

Astra Medium reviewed parser reductions, DB cross-checks, repeated-section resource accounting, source keys, pinned build dispatch and LR/TD geometry. One material finding: connectors appended after nodes painted through event formulas and section headers. All connector wrappers now lower behind nodes; a regression checks paint order in both orientations. The reviewer independently re-inspected and closed this finding. This is a bounded review, not final candidate acceptance. Neo/redux styling parity is unclaimed; Visser's configured base-theme path is the current contract. Browser geometry checks remain separately required.

## Flowchart source provenance foundation review (2026-10-06)

Astra Medium reviewed the shared immutable UTF-16 provenance utility and restricted flowchart preprocessing against pinned Mermaid code. It found an admitted-size many-line fence could exceed JavaScript's call argument limit through `concat(...pieces)`. The fix adds iterable concatenation and removes that spread; the exact 64,000-blank-line case is a regression. The reviewer independently re-inspected and closed the finding. Live tests compare mapped intermediate text with Mermaid's `getDiagramFromText().text` and mapped parser text with the actual underlying flow parser input. UTF-16 spans still require a checked conversion to UTF-8 boundaries when the family collector is integrated. YAML scalar provenance and actual renderer normalization remain separate unfinished obligations; the flowchart guard is unchanged.

## Flowchart YAML, coordinates and ink reservation review (2026-10-06)

Independent Astra Medium review found two YAML adapter defects: a `.js` import that worked under bundling/Vitest but failed in native Node source mode, and quadratic source-interval expansion for keep-chomp block scalars. The import now uses `.ts` and has a native Node 24 test. Literal/chomp newlines now map individually to physical breaks; the shared mapper streams intervals and visits consecutive identical replacement origins once. The reviewer independently reproduced the corrected near-limit scalar and 16,000-island replacement behavior and closed both findings.

A separate bounded review found no material defect in native ink reservation or the UTF-8 converter. Its evidence gap was addressed: patched-bundle tests now assert node-shape containment, neighboring-node/edge separation, multiline/multiple formulas, and ordinary/Markdown cluster header clearance. The helper's one-call typography/transform invariant is documented. This is not complete flowchart-family or candidate-wide acceptance.

The composed flowchart validator received a further independent review. It found decoded `icon`/`img` keys could bypass lexical restrictions, and repeated SHAPE_DATA concatenation made long metadata lists quadratic. The decoder now rejects decoded prohibited keys before target-kind filtering; the installed parse worker also rejects actual icon/image vertex fields. Grammar reductions retain constant-cost chunk joins and flatten once. The reviewer independently closed both findings: escaped/aliased keys and node/edge/subgraph targets reject, while its 48,034-byte reproducer fell from 8.875 seconds to 103 ms with exact mapped text. These timings are diagnostic evidence, not new product limits. The root's four composed/guard suites pass 34 tests, including a corrected valid YAML alias fixture (`*k :`).

Structured flowchart diagnostic follow-up received independent review with no material finding. Policy and fanout error codes are preserved; field-level interval records are copied and frozen, with primary coordinates referring to the first interval. Read-only probes confirmed disjoint folded-YAML origins and alias-definition ownership. This closes the bounded diagnostic review, not worker integration or family activation.

## Flowchart effective-DB reconciliation review (2026-10-06)

The new reconciler compares final source assignments with actual node/edge/subgraph identities, label values and label types, then derives visible slots from one `getData()` call. Independent read-only probes found no defect in this bounded checker, including nested collapse, redirected external edges, node/subgraph ID collisions and Markdown labels.

Worker integration review found plain-diagram compatibility regressions from applying math identity restrictions unconditionally and assuming every node-shaped or style statement creates a vertex. Reconciliation now runs only for parsed math-bearing diagrams; collection remains unconditional so encoded/overwritten math cannot bypass validation. Explicit labels targeting an existing edge remain inactive authored records, and style statements on existing edges create no label. Actual-worker regressions cover duplicate plain subgraphs, explicit/style edge references and a node/edge ID collision. The first two reported examples were independently confirmed fixed; the style follow-up is awaiting recheck.

Source preflight now preserves existing semantic/unsafe/limit diagnostic classifications. Accessibility descriptions use pinned newline-indentation normalization; final truthy metadata labels without a selected string fail with exact field coordinates, while a later valid assignment can supersede them. Metadata label types match pinned defaults. These changes do not enable flowchart export.

The independent recheck closed the compatibility finding, including style references with a prior same-ID node. It also confirmed the entity-code rule now matches upstream `#\w+;` and preserves `E_SEMANTIC` with a source line for mixed/underscore entity names. Browser formula attestation remains a separate follow-up.

## Native formula attestation review (2026-10-06)

The pinned shared-text hook now passes its actual pre-KaTeX label to the ink helper. The helper applies the same break normalization and formula regex, verifies rendered MathML count, and stamps exact TeX for future source binding. It checks a retained TeX annotation when available (pinned Mermaid normally strips annotations). This is input attestation, not independent mathematical-equivalence proof of KaTeX output.

Independent source review found no material defect in hook placement, count checking, rollback, repeated-call source/tag checks or plain-label behavior. The worker's Chromium suite passed 12 tests across 320px and 1440px, including actual patched-bundle TeX tags, doubled-slash normalization, mismatched counts and stale tags. Typecheck and diff check passed. No flowchart export activation is implied.

## Flowchart source binding integration review (2026-10-06)

Independent review found no material issue in exact encoded-span binding, explicit unrepresentable origins, formula-count/TeX/ownership checks, or transactional rebinding. Selections crossing an unrepresentable formula reject even if both endpoints have ordinary spans. The compiler maps provenance through verified document bytes, normalization, comments and visible bidi spelling; no TeX-text search establishes identity. Native ownership tests cover nodes, edge fanout and expanded/collapsed group labels without letting a group claim its descendants.

Activation review found encoded YAML math could bypass the retained ELK guard. The worker now checks parsed occurrences against the declared family before returning records. The reviewer independently confirmed ELK rejects and normal `flowchart`/`graph` still succeed.

Installed narrow-screen testing exposed an existing visibility assumption: intentionally hidden child targets disabled viewer support and forced list view. Reconciliation now records exact hidden keys from the same layout snapshot as visible slots; runtime excludes only those keys from missing-target counts. Independent nested-collapse probes confirmed hidden child groups, nodes and unlabeled internal edges, with external redirected edges preserved. No material finding remained in the bounded recheck. These reviews do not close the full Mermaid-family/shape audit or human acceptance.

## ELK activation and native shape applicability (2026-10-06)

Independent bounded review found no material issue in activating `flowchart-elk` through the existing grammar, DB reconciliation, native ink and source ownership paths. The pinned ELK loader is bundled into the browser artifact; the browser tests verify the actual configured layout, expanded/collapsed groups and both orientations.

The canonical-shape matrix exposed intentionally label-less symbol handlers: these require no visible label slot, while every authored expression still receives validation and resource accounting. A pinned artifact hash and an alias-to-handler contract protect this classification. Independent review found no material defect in that exclusion or its build guard. Further registry testing identified `anchor` as another label-less handler and `icon` as a text-bearing handler with a distinct native group class. The binder now accepts `icon-shape` under the same exact renderer ID, unique-owner and direct-label requirements. Independent reinspection of both extensions found no material issue. This review does not assert complete Mermaid-family coverage or human acceptance.

## Sequence preparation foundation (2026-10-06)

Independent source review of native sequence geometry identified separate actor, message/note, box and title paths, missing awaits, fixed-height assumptions and ordinary-text remeasurement. The 24-case browser characterization confirms clipping and absent box/title math; the implementation obligations are recorded in `docs/validation/math-rendering/sequence-geometry.md`.

The bounded `prepareSequenceLabels` helper received separate review with no material finding. It validates and snapshots requests before asynchronous measurement, keeps measured DOM private per preparation call, and rejects unknown, duplicate-copy and cross-diagram placement identities. It uses existing validated KaTeX content and attached-diagram typography. Two Chromium tests pass after correcting the test fixture to standards mode; they verify role fonts, descendant overhang, explicit copies and mutation isolation. This does not constitute sequence renderer integration, wrapping support, lifecycle copy budgeting or source-map completion.

The sequence grammar collector received independent review against pinned reductions and fresh DB effects. A multiline `accDescr` mismatch was corrected with mapped newline-indentation removal and a regression; the reviewer rechecked and closed it. Root browser comparisons then exposed `Canvas` misclassification as title text. The collector now recognizes the 42 standard/legacy system-color names from installed MDN syntax data. All 42 compare with actual browser DB labels at both viewport widths; independent reinspection confirmed the set and test scope.

Separate reviews found no material issue in the composed sequence math validator or participant metadata decoder. The validator preserves sequence backslashes, validates/counts inactive authored labels, maps formula origins and locates policy errors. The decoder mirrors pinned YAML wrapping and JSON_SCHEMA while preserving truthy typed aliases and scalar/alias provenance; explicit-description precedence remains a collector integration obligation. These bounded reviews do not close sequence rendering or activation.

## Sequence metadata integration and DB reconciliation (2026-10-06)

Independent metadata-integration review found that final unsupported typed aliases lacked source coordinates. The collector now preserves field-level alias provenance on typed markers and emits `LocatedSequenceLabelError`; the reviewer rechecked both collector and composed validator with ordinary and BOM/CRLF/escaped source. Nested strings remain separately validated even when a typed assignment is superseded. A further cyclic-alias probe exposed JSON serialization of non-renderable values. Bounded category/primitive agreement replaces that traversal; independent probes confirm final cyclic aliases reject with coordinates and superseded cyclic aliases retain nested formula validation.

Independent logical DB-reconciliation review found unchecked box wrapping. The collector now freezes box wrap/fill alongside actor type/wrap/box identity and message id/type/endpoints/placement/wrap/activation/connection identity. Reconciliation compares these fields, rejects duplicate/missing owners and retains semantic source keys. The reviewer independently confirmed wrap and fill mutations reject. Browser tests additionally alter actor/message fields and remove/duplicate active source records. Render-copy planning and layout/source-binding integration remain separate outstanding obligations.

## Sequence copy planning and shared source mapping (2026-10-06)

Independent review found no material issue in extracting the existing original-byte/comment/bidi/provenance mapping into a shared source-display helper. Flowchart owner checks remain family-specific; sequence source maps validate semantic owner slots, hidden keys and copy identities before giving each copy the original expression spans. Runtime binding permits the sequence format for encoded/unrepresentable spans while retaining atomic checks and cross-label selection rejection.

Render-copy review found that an unknown YAML actor type was incorrectly assigned header/footer copies even though pinned `drawActor` has no default branch. The planner now rejects visible unsupported types; hidden unused actors remain hidden with authored costs retained. The reviewer rechecked the exact eight supported switch cases and the rejection. Other reviewed paths match scheduled native actor/filter/lifecycle/box-run behavior. This is not proof of final sequence drawing: native asynchronous actor-math omissions and geometry corrections remain adapter work.

## Sequence actor rendering and formula wrapping (2026-10-06)

The pinned sequence artifact now routes math actor sizing and drawing through measured DOM. Independent actor-adapter review found no material issue in object-identity bindings, claims before asynchronous work, synchronous placement at all eight native actor calls, measured dimensions/glyph bands, explicit copy checks and cleanup in `finally`. Plain diagrams retain native geometry. This review covers the actor slice only; sequence export remains guarded pending the other roles and activation.

Independent review found a P1 in the new formula-atomic wrapping path: reserving only the outer label's ink bounds allowed `\rlap` ink to overlap following prose. The helper now reserves each overhanging formula's own inline footprint before prose reflow, including the existing unwrapped path. The reviewer reproduced the correction in Chromium at narrow widths and checked right/left overhang, tall smashed formulas and adjacent lines; the finding is closed. Tests independently check prose/formula nonintersection, rather than accepting foreignObject containment alone.

Root integration additionally aligned hidden unsupported actor types with the copy planner: unused hidden types have no copies, while visible unsupported types reject. A browser regression checks hidden → rejected visible → hidden renders. No full-family, release-candidate or human acceptance conclusion follows from these bounded reviews.

## Sequence note and message rendering (2026-10-06)

Independent note review found no material issue in original NOTE-message identity, prelayout width/start-position correction, measured padding/height, native wrapping bypass, one-copy placement and failure cleanup. The reviewer independently rendered nested loop/alt notes with identical formulas and consecutive overhanging notes; distinct original-index keys and SVG containment passed. The review does not certify math in loop headers.

Independent message review found no material issue in the pinned arrow-type inventory, original-message/model bindings, preliminary/final wrapping variants, measured bounds, synchronous placement or failure cleanup. Native arrow/activation/central-connection endpoint routing remains in place. Math bounds are reserved again after creation/destruction adjustments, and math failures escape the native message catch. Root browser tests subsequently passed activation, lifecycle, autonumber, plain loop-container and right-angle/curved self-message cases, including label-to-arrow and neighbor separation.

A failure-injection regression verifies that a partially placed message followed by a native failure or missing expected copy removes partial math and releases model ownership before a subsequent successful draw. Sequence remains guarded pending loop/branch-header, box/title and worker/model/compiler/source-binding integration. These are bounded implementation reviews, not final C07 closure.

## Sequence loop, box and title rendering (2026-10-06)

Independent box/title review found no material issue in original object ownership, filtered actor-run copy identities, snapshot coordinates, measured typography/margins, final title viewBox union or cleanup. Root tests cover repeated box runs, filtering transitions, large text margins, anonymous boxes and title-only output.

Independent loop review found a P1: an empty math loop without participants failed because native actor bounds were absent. The fix supplies finite initial frame bounds around the measured label while retaining available native geometry. Independent recheck covered actorless empty and nested frames and wide overhanging formulas; the finding is closed. No remaining material finding was reported for the bounded loop slice.

All 26 arrow spellings and central connections now have browser clearance coverage. The combined 36 browser/26 unit checks and fresh build pass. Sequence export remains guarded until pipeline integration; these reviews do not close C07 or human acceptance gates.

### Pipeline audit findings

Independent review found mixed plain/math source maps expected DOM ownership markers for plain labels. The source-map builder now validates all planned copies but emits only nonempty math rows. The reviewer found the change sound; 18 source-map/runtime-binding tests pass. The separate Node box-parser incompatibility and properties sanitizer/class policy findings remain open and block sequence activation. They are recorded in `docs/validation/math-rendering/sequence-geometry.md`.

## Sequence worker and compiler integration (2026-10-06)

Independent review found that replacing native browser color queries was insufficient for box titles: native sanitizeText can normalize breaks and decode entities. The worker now temporarily rejects `<` in box titles. A second independent probe found a concrete accessibility bypass: `<br>` plus encoded dollars became malformed native math while the worker reported no math. The gate now covers all three common title/accessibility setters before native application. Independent overwritten/multiline probes closed that bypass within the temporary profile; proper source-mapped sanitization is still required. Semicolon-bearing entity box headers fail the pinned grammar before DB application, so direct DB sanitizer probes are not evidence of that full-source bypass.

The transport review found no additional material issue in original-source requirements, shared fixed rendering flags, authored/extra-copy costs, compiler maps or located-error transport. Root completed testing after the implementation agent encountered capacity errors. The 67 focused tests, 367 Mermaid regression tests, typecheck, fresh build and installed offline/fallback/source-reference checks pass. This verifies integrated encoded actor math, not the still-guarded raw sequence profile or final C07 closure.

## Sequence sanitizer and worker packaging review (2026-10-06)

Independent adviser review of the real sanitizer helper found no material issue within its stated provenance contract. Packaging review found no material issue; root also added per-build counter resets and a stylesheet fingerprint suggested as minor improvements. Independent integration probes covered empty sanitized fields, overwritten multiline accessibility failures and synthetic error locations, with no material finding. One semicolon-bearing title fixture was corrected because the native grammar rejects it before sanitization.

Root integration checks pass (40 focused unit, 375 Mermaid regression, 16 browser, typecheck/build/installed export/budgets). Snapshot: `reports/math/sequence-sanitize-snapshot.json`. These reviews do not close semantic text decoding, properties/details, raw sequence activation, remaining families or release acceptance.

## Sequence comparison normalization review (2026-10-06)

Independent probing reproduced the rejected raw comparison after HTML serialization. Review of the shared core/runtime correction found one material complexity issue: immutable provenance replacement for each entity copied the full input repeatedly. Root replaced both paths with original-offset chunk assembly. Independent recheck confirmed linear scaling, exact entity intervals and core/runtime equality; the finding is closed with no further issue. The transform intentionally decodes only four serialization entities inside existing formulas, including native no-HTML fast-path fields, and full policy validation follows it. Final regression/browser/build/typecheck/installed evidence is in `sequence-text-snapshot.json`.

A separate read-only properties/details investigation confirmed sanitizer-before-JSON semantics, shallow property merging, class/icon effects and external-DOM/link behavior for details. It suggested a restricted inert-property subset; this is a proposal only, not an accepted compatibility narrowing. No properties/details implementation or activation was claimed.

## Sequence participant data and class boundary review (2026-10-06)

Independent policy review corrected the earlier inert-only/all-string-TeX proposal: properties are machine data excluded from label math. Root preserved native JSON/merge behavior and applied decoded root resource/prototype checks, explicit external-details rejection and typed state reconciliation. Review found an Infinity/null identity collision caused by JSON.stringify; iterative typed encoding closed it. Independent probes confirmed distinct identities and 12,000 nested objects without recursion failure.

Review also identified a toolkit-class collision that the raw-dollar guard could not protect against, because encoded math and ordinary properties reach rendering. Root namespaces authored `vs-*` tokens at all five pinned SVG assignments while preserving raw values and ordinary classes. Separate inspection confirmed assignment coverage, native coercion order, class-token handling and genuine later highlighting; no material issue remains in the sequence boundary. The browser matrix and installed export confirm the observed behavior. Other Mermaid families are not covered by this class-boundary claim. Evidence and exact source hashes: `sequence-properties-snapshot.json`.

## Sequence activation audit (2026-10-06)

A separate read-only audit checked label roles across collection, reconciliation, explicit copy budgets, source binding and measured rendering. No additional code-level blocker was found. It identified installed all-role successful MathML/source-copy verification at narrow/wide widths as the outstanding activation check. Root added that fixture and verified it through the freshly packaged offline release, including all fallback paths. The raw guard is now removed for sequence only; the audit does not establish coverage of other Mermaid families. Evidence: `sequence-activation-snapshot.json`.

## State parser and extraction-observer foundation review (2026-10-06)

Separate collector review identified valid spaced-inline-note rejection, missing raw fork/join/choice IDs and duplicate fake divider IDs. Fixes follow the actual lexer rule and native transforms, with dedicated divider counting. Recheck exposed newline-before-colon as another native inline-note form; tracking lexer rule 67/68 by token range resolves it. Root added note-only implicit-state ownership, bracket/case suffix and composite-alias whitespace cases. The reviewer retracted the proposed relation-endpoint identity loss: the native relation retains exact state1/state2 object references. Final static recheck found no material collector issue.

Independent observer review required a candidate-to-internal-node identity bridge and observation of native note text sanitization on every extraction. Both are implemented. The final fingerprinted patch, loader and per-DB WeakMap lifecycle received no further material finding under the documented synchronous, non-reentrant, finally-disposal contract. Hooks remain foundation-only; production state math is guarded. Final native/observed browser equality, fresh-source/relocated-bundle event equality, 26 focused checks and typecheck are archived in `state-foundation-snapshot.json`. This is not whole-feature C07 closure.

## State effective provenance and Node sanitizer review (2026-10-06)

Separate review accepted the synchronous scoped DOMPurify substitution: it delegates one pass with native options, restores in finally under nesting/errors, and leaves native sanitizer call order intact. Pure HTML source tracing moved to an environment-neutral helper without a semantic change. Actual Node source/relocated-bundle and browser probes verify the integration.

Consumer review found a valid whitespace-only alias fallback with no source-owned ID. The collector now records alias IDs separately and promotes them only when exposed as labels. Root replaced text-selected descriptions with exact ordered statement records and limited synthetic IDs to attested root pseudo states. The final reviewer probe confirms these fixes and no remaining material consumer issue. A separate claim that note-only states needed default-shape promotion was withdrawn: real Chromium rendering throws for the native undefined shape. That compatibility/fallback case remains part of later state integration, not a supported rendering claim.

Evidence: 32 focused unit checks, two Chromium tests over four fixtures each, typecheck and `state-provenance-snapshot.json`. This review does not activate state math or close whole-feature C07.

## State math ledger, copy plan and normalization review (2026-10-06)

Independent adviser reviewed the authored ledger and shape-specific rendered-copy planner. Material finding: retained native node/edge objects could mutate identity or applicability after reconciliation, letting a changed shape disappear from planning or a changed ID receive a new key. Fix: publish frozen identity snapshots and check them before dispatch/filtering; attest description presence and contents separately. Regression tests capture snapshots before mutation. Recheck found no unresolved material issue in this fix. Reviewed provenance SHA-256 `4b3b7f0655f1a8aab9ee55976f0826b03360ffa51487fc25c117684e144719b0`; planner `966bc95dac8401d337a43d2921eeca54c083806773509e7d2a80519db597ff39`.

A separate bounded adviser review covered state-only runtime entity restoration and build patches. No material finding: actual SVG registration is private, covers the awaited layout operation, rejects same-root overlap and clears in finally; other diagram inputs remain unchanged. Slash collapse and break normalization precede one-pass formula-only entity restoration. Pinned hashes, unique anchors and application counts guard both patch sites. Reviewed runtime helper SHA-256 `8ede9f9e9b68885a9527decc831f5b831cd07b3fdfcf7cb19a8a8944ff68bd0f`; build plugin `89fe1f1d5232af5d4f9a87add4c0982c79538eac6fbe780ea5776dbe04447878`. Reviewers inspected tests but did not run them; root separately ran the integrated checks recorded in `reports/math/state-math-plan-snapshot.json`.

These are bounded implementation reviews, not final candidate acceptance. State production transport/source bindings/activation and remaining family/whole-product gates are still open.

## State production parser connection review (2026-10-06)

Independent adviser reviewed native/collector reconciliation, worker transport, observer loading/bundling and the explicit plain undefined-shape exception. No material finding. Its read-only production probe confirmed plain note-only parsing remains accepted, sentinel-decoded math elsewhere makes that same unrenderable diagram fail with E_MATH, and a subsequent plain state figure succeeds. The reviewer inspected bundler wiring but did not run release tests; root separately verified seven fixtures against the actual relocated release worker.

Reviewed SHA-256: state-node-math.ts `fd08674fbb875b5195e10d6ee16f128fa8f1ed602fbbc5cdda652cee398bba2a`; state-transport.ts `0144ab363478eef406c15ed8d18a539555e345ddb84eef3bd3a350e3c84bfb48`; parse-worker.ts `835317b25061d59cbf4373634aa210d93217c044478ed47ec6823e25340b4880`; state-render-plan.ts `728210abdf33c97327ba7ec5a180ac7b18eb24084acde0f4d3b958683e8ab1b2`; build.mjs `dfb849b7cf2aaea80608e9b8af0315ff8d279c7eb9a837c2a7c024e348cf4e0b`.

A separate reader audited repeated native sanitation. Current two-pass orchestration is non-lossy for validation: only notes mutate grammar-owned text; their private history retains post-first/pre-second input and post-second output, while canonical validation includes raw input. Description/transition fields repeat their immutable inputs. General historical retention across three or more epochs is not established and is not relied on here. A future additional native text mutation requires review under the pinned artifact contract.

These bounded results do not close compiler/browser bindings, state activation or full-plan acceptance. Final evidence and hashes are in `reports/math/state-worker-snapshot.json`.

## State transport accounting and DOM source binding review (2026-10-06)

Independent native-source design audit established exact prefixed DOM IDs, edge data IDs and direct foreignObject order as the state binding contract. It specifically required counting plain title/body siblings and checking unexpected/unclaimed equations. Implementation follows that contract and is tested against real native SVG.

Bounded implementation review found no material ownership, accounting or isolation issue. Stamping validates all exact owners, direct structure and formula attestations before atomic attributes. Compiler source mapping preserves distinct record identities; transport recomputes visible-copy charges, per-record maxima and document totals. Plain figures without a source map do not enter binding. Reviewer inspected code/tests but did not rerun the browser suite; root separately ran the integrated checks in `reports/math/state-source-snapshot.json`.

Reviewed SHA-256: runtime mermaid-state-source.ts `5b5cf04cbea603b2ed681261c1071b00490bdca249b8d6af3a89d9295336fd1e`; state-source-map.ts `255649f573c89cb394eb21db6fe0f861f58901e546930f5c6ad6664e02824539`; state-transport.ts `380c6455cbebdd1d912662653a728cf89c1a6ba6eb48b78309aa2bb1926fbda0`; runtime mermaid-source.ts `3fd56b90ec2b86f9a01bb7840c660d2aca12396b5fd3a1e08af4e77a41d52803`; runtime mermaid.ts `1e3a4190e3133605d23cca8c04c8dd0a48496729c2a68bd6f37249b100f909b6`; compiler compile.ts `d6f351318d0e262714f2c42761e2c2f6b1ae05703ac681e9a5684d3b36f58c33`.

This is not a state activation or full-plan acceptance review. Reserved classes, full state geometry, installed export/reference/fallback acceptance and remaining family/gate work remain open.

## State reserved class decoding review (2026-10-06)

The first raw-regex namespace patch received a no-bypass disposition, but that disposition is superseded. Root questioned final SVG decoding; a reader confirmed that admitted literal Mermaid sentinels reach class values and become reserved tokens after entity restoration/attribute parsing. An earlier statement treating standalone shorthand parse success as effective class application was also corrected. Final fixtures use explicit class assignment and verify actual DB and browser results.

The replacement source-mapped effective-attribute helper preserves ordinary bytes, inserts prefixes at original effective reserved-token starts, and verifies the result. Independent adviser review found no remaining material finding. The adviser reported running 512 ASCII-reference cases at token boundaries/within the reserved prefix through SVG serialization, sentinel restoration, DOMPurify and insertion; no reserved token survived and all results were idempotent. This probe supplements root's stored automated tests and is not whole-plan acceptance.

Reviewed SHA-256: state-classes.ts `d8e886b532ed2fda647fd9bdffdc28f166a6d23008f3900ee62560d4210c3a4a`; html-provenance.ts `97f67e8090885a54614b6e350003b05c370d088303415d30a743a9219275e9c5`; mermaid-state-classes-build.mjs `7d7521101c981e617c120f7c6b255b7d027ce348a1927a0611a883c462d21fcc`; mermaid-state-observer-build.mjs `4627d1c8e949359fd7bdd38c54f208113a510e185fef8e4978c8bac0892de74c`; mermaid-build.mjs `4eda909785d45ed35cfd00e958c7704e44075190703d9c0e785d63ab59ca2fe3`.

See `reports/math/state-classes-snapshot.json` for root checks, including real-reader CSS/targeting, source/release parity and bounded state ink geometry. Public activation, installed state acceptance and full-plan gates remain open.


## State activation review (2026-10-06)

A separate bounded read-only review checked the state guard admission, original-source forwarding, public compiler fixture, installed verifier and author guide. It found no material integration regression. Both declarations share the pinned renderer; composite state support remains excluded by the existing profile. The reviewer did not rerun the tests. Root subsequently completed 493 regression tests, installed offline checks, build, typecheck and budgets.

Review clarification: `verify-math.mjs` disables the general math worker in its worker-failure scenario; Mermaid still renders there. That result must not be described as forced Mermaid renderer failure. Actual no-JavaScript and unavailable-MathML checks separately verify state source fallback. Candidate-wide final review remains outstanding. Exact reviewed activation file hashes and acceptance evidence are in `reports/math/state-activation-snapshot.json`.


## Journey collector review (2026-10-06)

Separate read-only review compared `journey-labels.ts` and its tests with the pinned grammar, lexer and DB splitting behavior. It found no material issue in field ranges, native substring/trim transforms, score/actor splitting, overwrite retention or parser isolation. The reviewer did not run tests. The reviewer also checked the final typed callback-effect reader and native DB parity test. Final reviewed collector SHA-256: `05c5c300074ba30b8c5e4fea770a1e02fb87b8f153a5ad63cacc294d97196760`; test SHA-256: `8738d6e2bc3ba88e3d74f93e88a62b60f74f215ecae82b35f1128bf871d14851`. Root's final 42-test collector regression and typecheck passed. This review covers raw extraction only; production journey activation remains open.


## Journey validation and snapshot review (2026-10-06)

Independent review checked role-specific validation, native sanitation, provenance, source-owned visible slots and copy-budget bounds. It found one material discrepancy: the initial task/section display transform assumed SVG line breaks, whereas the pinned default `textPlacement: "fo"` writes literal text. The implementation now separates validation barriers from primary display mapping, validates both without double charging, and derives source spans from display input. The reviewer verified the correction and found no new material issue; the original adviser independently confirmed its previous assumption was wrong.

The final reviewer confirmed hashes `journey-math.ts` = `05d939514ddd92eda1a033f06543058010329103fce750ab4632b9e9233f93a5`, `journey-text.ts` = `faf4802f7b65f5cddb0290df1ff759c6a62bb6e08e0f0ef7b421514597a93612`, and `mermaid.journey-math.test.ts` = `af86a3210f5571d13ef37b36d2b6d443d3d1f45ed9785b8492a435782684cef3`. DB reconciliation and the distinct-visible-owner invariant had no material finding. Root verified 41 relevant tests and final typecheck. This is a preactivation foundation review, not a browser/installed acceptance review. The future renderer must preserve literal primary text instead of reintroducing generic measurement break-tag splitting.


## Journey worker lifecycle and transport review (2026-10-06)

Independent read-only review found no material blocker in native singleton sanitation, exactly-one snapshot capture, failure recovery, source requirements, cache separation or JSON transport verification. The reviewer did not run tests; root subsequently verified six worker tests, 515 integrated regression tests, typecheck and ten source/relocated-release fixtures. The public guard/index remain unchanged. Browser and compiler activation are not covered by this review.

Reviewed hashes: `journey-node-db.ts` = `d45458571e3d0a09cf06776a655d9b6c90294f72518ba88a75a7b2011d1ee9d0`, `journey-node-math.ts` = `8623024ae5f6750f9ffa8abeca6ec531d893780c209e7f26114d696da100c062`, `journey-transport.ts` = `42273350273353e006d57c0acd570e56896777c72e5c112656cc0ff07e084f77`, `parse-worker.ts` = `38140abc9e0e8a1bd55e7be4f27cee78b99976cabbfe2703bde8a50972cb090e`, `parse.ts` = `6625b4e0aa503ce7f5a3e73822541a9a356d49be9c3aec5488ac5b1ef2a4475f`. Final source/evidence hashes are recorded in `reports/math/journey-worker-snapshot.json`.


## Journey measured renderer review (2026-10-06)

Separate read-only review checked one-read plain dispatch, native semantics, measured geometry, bounds, ownership keys, rollback and exact build patching. One material discrepancy concerned integer actor names: native legend enumeration differs from sorted DB order. The renderer now uses safe own-property enumeration for legend rows and keeps sorted indices for keys/colors. The reviewer verified the delta and found no remaining material issue. Prototype-like actor support in the math path is an intentional correction; plain diagrams retain native drawing.

Final reviewed hashes: `mermaid-journey.ts` = `42f52b5392a80644e400285c3be8ce5e505dcd40849732ae2b563853b4916250`, `mermaid-label.ts` = `bef82031820e13bd9c83edc2b48b7edda2b61e276dbaeea3986facc5ae3b9f4d`, and `mermaid-build.mjs` = `7dadfaa1079495dcf274a958593c175b7ee5403cf9e2b3ba79e58d0db34ec2d3`. Root completed 26 browser checks and the supporting build/typecheck/unit/budget verification. Compiler/source binding and installed/public acceptance remain outstanding.

## Journey compiler and source integration review (2026-10-06)

Independent reader review checked transport ownership, resource accounting, compiler emission and runtime source binding. It found no material issue in those paths. An initial missing-renderer-hook finding was challenged against the fingerprinted build-time injection in `scripts/mermaid-build.mjs`; the reviewer inspected that path and explicitly retracted the finding. The shipped Mermaid `api.render` reaches the journey wrapper through that injection. The reviewer performed static reads, searches, hashes and diff checks; root executes the automated acceptance checks separately.

The public compiler fixture passes, as do source ownership tests covering equal formulas, canonical first actor ownership, merged headings, hidden authored charges, Unicode/BOM/CRLF/comment normalization and stale source rejection. Runtime selection tests cover journey encoded and unrepresentable source-map formats. Installed verification initially expected only the math actor key while querying all visible labels; the test was corrected to include the two plain numeric actor keys. This was an assertion error, not a renderer change.

## Quadrant collector and validation review (2026-10-06)

Independent static reader reviews compared `quadrant-labels.ts` and `quadrant-math.ts`/`quadrant-text.ts` to the pinned parser and native DB/common sanitation. No material findings remain. The reviewer checked range ownership, text concatenations, quoted/Markdown lexer behavior, generated axis arrows, overwritten fields, parser isolation, trim/sanitation order, display barriers, costs and provenance. A real DOMPurify probe confirmed entity-only text does not bypass a native delimiter conversion.

A bounded adviser identified reversed point storage, partial axis overwrites, class precedence and configuration mutation in `getQuadrantData`. It recommended a fingerprinted detached semantic snapshot export before reconciliation, rather than a source-only replay or setter observer. This is the next integration step; no quadrant public activation is claimed. Root's eleven focused tests, including independently initialized native DB parity, pass; typecheck and diff checks pass.

## Quadrant native snapshot/reconciliation review (2026-10-06)

Independent static reader review found no material issue in the exact-hash snapshot transform, source loader, bundle plugin or detached data contract. A subsequent review verified last-field assignment, class Map replacement/order, reversed point ownership, exact native snapshot equality and pre-layout title semantics. The final coordinate-guard delta was reviewed against the native lexer and D3 scale use: `0a2` parses natively but cannot form finite layout, so math reconciliation rejects it. Plain parsing remains unchanged.

Root ran 15 focused tests across five files, including patched source/bundle parity, independent unpatched native layout-data parity, real DOMPurify/native DB reconciliation, forged owners, mutation and recovery. Typecheck/diff checks pass. Snapshot and reconciliation remain internal foundations; production-worker and browser integration are not claimed.

## Quadrant worker integration review (2026-10-06)

Independent review checked source/release hook equivalence, sanitizer lifetime, native capture before asynchronous collection, internal request admission/cache identity, visible-label attestation and transport ownership/accounting. It identified missing integrity checks for hidden overwritten transport records. Allowed-role validation and recomputation of displayed text from each native DB value now reject the reported mutations; focused regressions cover both. The reviewer inspected the final delta and confirmed resolution. No material finding remains in this bounded review.

Root verification: final 508-test cross-family regression passes, typecheck/diff check pass, and nine actual source/released-worker fixtures match with the release copied alone away from node_modules. Public quadrant math remains guarded pending browser/compiler/standalone integration.

## Quadrant measured renderer review (2026-10-06)

Independent geometry review found that the first math layout discarded native axis positions/visibility. The renderer now passes native position settings, filters hidden axes, preserves top X with no points and forced bottom X when points exist, and places right Y beyond the right label column. The reviewer confirmed this resolves the finding; no other material issue remained in its bounded review of point mapping, rotated ink, columns, bounds and rollback. Browser evidence was executed by root, not the reviewer.

A bounded test writer added native parity, all-role geometry, axis variants and recovery cases. Root corrected native point-order/local-transform test assumptions, strengthened formulas and nonoverlap/large-marker cases, and ran the suite with browser subprocess permissions. Final 10 Chromium cases and 32 focused unit cases pass; typecheck/build/budgets/diff checks pass. Public quadrant activation remains gated pending source/compiler/installed integration.

## Quadrant public compiler/source review (2026-10-06)

Independent static review checked figure transport, public request activation, document accounting, source-map byte validation, canonical reversed point slots and runtime binding. No material issue was found. Root's 531-test regression run covers the integrated path, including encoded caption sources, BOM/CRLF/comments/Unicode, equal point labels with distinct positions, synthetic axis suffixes, stale-source rejection and hidden authored document charges. The installed fixture initially used an unquoted native grammar keyword inside a caption; quoting the caption fixed the fixture without widening syntax or weakening validation. Author guidance documents that rule and the measured point-label presentation.

## Retained integration review — 2026-10-09

Independent Sol static review inspected candidate
`8232746abeb8e9b097145d6eca187db350dc56af4de1d09b1e109cb44a926c0e`,
joining worker/resource accounting, retained native geometry and standalone
packaging. No separate material defect was found in IPC/heap/time bounds,
reply validation, resource accounting, conditional asset routing, SRI/CSP or
standalone delivery. This is source review, not an executed test claim.

One material finding remains open: accepted dimension-suppressing or negative
spacing TeX can paint beyond its logical SVG viewport, which compiler and runtime
trust for reservation. Root independently reproduced accepted horizontal lap,
vertical smashed matrix and negative kern inputs; see
`reports/math/retained-ink-repro.json`. Initial rule-based examples rejected for
unsupported color and were withdrawn as repros; the admitted examples retain the
finding. M10 containment cannot be closed by the prior green suite.

Correction underway: shared conservative SVG ink measurement, normalized metrics
before routing, independently checked worker containment and browser leaf-bound
regressions. This changes production engine/policy/validator after the reviewed
snapshot. Those changes require fresh independent review and execution; this
record does not approve them. Human geometry/notation/print/accessibility and
remaining Mermaid adapters were outside the review scope.

### Ink correction: production review disposition

Sol reviewed the frozen corrected production files recorded in
`reports/math/ink-reviewed-production.sha256`. The original lap/smash/negative-kern
containment defect is addressed: conservative path/arc/curve and affine bounds,
paint/stroke inheritance, normalized footprint with preserved baseline, final
resource recount, independent worker containment and source fingerprinting are
coherent. No remaining material production finding was reported.

Review also removed repeated transform-suffix allocation: parsing now uses a
sticky regex over the original string. A near-budget20,000-transform boundary
regression passes in the59-test focused run. Final test review is still open
pending whole-label/owner-box and edge-label/endpoint assertions in the browser
regression. This production disposition does not replace that test review or
final-candidate checks and human approval.

Final Sol static recheck closed the browser evidence gap against spec hash
`8953adebf09f9f687dd868200a7c607188302634a63927935913e23169cef9e0`:
complete rich labels fit their drawn graph/trace/edge/measure owners; explicit
counts prevent vacuity; edge backgrounds avoid endpoints and measure labels
avoid bars. No remaining material production or test finding in the reviewed
snapshot. Execution after the final assertion delta and human acceptance remain
separate requirements. The five production hashes above remain unchanged.
