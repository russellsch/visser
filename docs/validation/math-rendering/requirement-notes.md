# Requirement math integration evidence

Pinned grammar/DB/renderer artifact: `mermaid/dist/chunks/mermaid.core/requirementDiagram-PLB6GJNP.mjs`, SHA-256 `78077a43ffafbf1f752fe3ea7d7c78a0c7f9af6ad00ab3a619e9c494fc74cb0a`. The shared shape artifact `chunk-7INBJB4K.mjs` has SHA-256 `4046b2f1b5524ca743ddd13b24be059278b026fd074e56e84629c2e74b104dce`, already pinned by the shared browser build. Public Requirement math is now admitted through the verified worker, renderer and source-binding paths.

## Native state and grammar

`diagram.db` constructs a fresh `RequirementDB`. Requirement and element declarations use separate ordered maps. The first declaration for each map key wins; every declaration resets its own pending field buffer even when the duplicate is ignored. Requirement and element buffers are independent. Requirements win lookup when a style/class command or relationship endpoint names a key present in both maps. This parity does not establish safe renderer ownership for colliding IDs.

`setCssStyle` returns on the first missing ID, skipping subsequent IDs. Class assignment skips missing IDs and keeps going. Repeated classes append, and assigning an existing class copies its stored styles without splitting commas. Class definitions append styles and matching text styles, and retroactively append comma-split styles to existing members. Forward definitions and assignments therefore depend on order. `clear` resets maps, relationships, pending buffers and shared common metadata, but retains direction. A new DB starts in `TB`.

`getData` mutates the raw node objects with IDs, shape, look, classes and color indices. Capture must precede that phase. Construction of another DB clears shared metadata; capture must also precede another constructor. Parse-success/lifecycle enforcement is a separate integration obligation.

The pinned Jison reductions assign accessibility fields (4–6), requirement declarations (21/22), requirement body fields (23–26), element declarations (42/43), element body fields (44/45), relationships (48/49), class definition/assignment (57–59) and styles (64). Risk, verification and relationship kinds come from fixed grammar enums. Body productions are right-recursive: setters run in reverse authored order, so the first authored occurrence of a repeated body field wins. Native effects must retain callback order while diagnostics and resource accounting retain source order. Quoted strings retain their backslashes. The native lexer rejects empty quoted body strings (`text: ""`), while quoted whitespace is admitted; collection does not extend that grammar. Unquoted strings start with a word character; dollar-prefixed labels need quotes. A direct native probe confirms `title hello` is rejected despite a title lexer rule: the grammar has no corresponding title production. Existing Visser figure titles remain separate authored content.

## Rendering inventory

`requirementBox` in the shared shape artifact (around lines 5769–5914) renders requirement/element names, requirement ID/text/risk/verification, and element type/docRef. Generated prefixes are `ID: `, `Text: `, `Risk: `, `Verification: `, `Type: ` and `Doc Ref: `. Empty optional rows are skipped. Requirement type and relationship labels are generated enum text, not free authored math labels.

`addText3` (around lines 5916–5961) decodes entities and sanitizes each row, then invokes `createText`, measures it and positions the row before the shape computes its outer bounds. The shared HTML math path subsequently collapses doubled backslashes. Source validation must retain the exact native sanitation boundary and literal prefixes. The planned math-row hook intentionally bypasses native doubled-backslash collapse to preserve standard TeX matrix row separators, and restores one sanitation serialization layer inside existing equations. Both corrections must use the same validated input before row measurement. Merely replacing labels after layout would invalidate node bounds and edge routing.

The implemented hook is at the pinned shape's row construction/measurement: associate semantic field owners before native sizing, retain the native shape/index/style behavior, and attest each rendered formula. The later milestones below supply class isolation, field validation, duplicate-ID handling and plain/native parity. Final source binding remains required. The diagram renderer also inserts common title text directly, but the current admitted grammar does not supply an authored title statement.

Renderer integration must also account for two native postprocessing steps. `requirementBox` repositions every descendant `.label`, so generated formula content must not introduce that class. Its styled-node branch applies `nodeStyles` to every descendant `path`; formula paths must be excluded from that shape-only styling. Browser checks must combine math rows with authored node styles and inspect final ink, bounds and formula geometry after these steps.

## Implemented foundation

`requirement-db.ts` captures detached ordered maps, relationships, pending buffers, direction and common metadata. It replays trusted ordered effects from a fresh DB baseline and compares exact parsed-phase state. Common metadata effect values must already have native sanitation/normalization attested by the caller. This helper does not validate untrusted serialized effects or authenticate source.

`scripts/mermaid-requirement-contract.mjs` requires the full reviewed native artifact, retains source module identity, requires one build application and exports the native constructor without constructing an instance. Source-hook and relocated bundle tests compare parsed declarations, styles and relationships against an unmodified native module. The contract now runs in production workers; browser installation is supplied by the measured renderer below. Independent review found no material parity defect in this foundation.

All six tests across two files pass, with typecheck and diff checks. Native tests cover independent pending buffers, duplicate/ordered maps, namespace lookup, style/class order, relationships, clear/detachment and rejection of post-layout snapshots. The initial contract fixture incorrectly used unquoted dollar-prefixed values; it was corrected to the pinned grammar. An initial test expectation omitted a forward-defined class from the ordered native map, and its effect-construction cast failed typecheck; final evidence supersedes both test-harness failures. Candidate identity and commands: `reports/math/requirement-foundation-snapshot.json`.

Next collect grammar-owned authored fields and effects with original provenance, validate every occurrence and reconcile effective state. Then implement worker isolation/transport, prelayout measured row ownership, class isolation, compiler/source binding and installed acceptance. No public activation is claimed by these helpers.

## Grammar-owned collection

`requirement-labels.ts` invokes a fresh pinned Jison parser with constructor-free DB spies. It checks the reduction table, exact callback methods/order/arguments and primitive token values. Each name is attached to its eventual declaration, including inline classes and ignored duplicate declarations. The collector keeps every body and accessibility occurrence before state overwrite. Style/class and relationship arguments remain control effects, not extra display records.

Record positions come from parser ranges mapped through generic Mermaid preprocessing to original UTF-16 and UTF-8 intervals. Records are sorted by parser position rather than relying on nonempty original intervals; their effect references are remapped without changing native callback order. Quoted backslashes are literal. Risk and verification enum casing retains provenance. The flowchart-specific brace rewrite is not applied.

Independent read-only review of collector SHA-256 `148b37faef6e29f740ed47cabe19efa22186eabbc022594d412300d863079c98` found no concrete coverage or misattribution defect. The reviewer did not execute tests.

This collector returns authored semantics, not sanitized native metadata or safe renderer identities. It does not lift the public guard, authenticate serialized effects, validate math, or install the artifact contract into production. Common sanitation, all-occurrence math charging, effective row ownership and native reconciliation are the next stage.

The integrated collector verification passes 29 tests across six files, including ten Requirement tests and 19 generic provenance tests. Cases cover duplicate declarations, native reverse body-field order and first-authored wins, exact remapped record references, native DB parity, inline class and relationship effects, literal backslashes, exact original UTF-16/UTF-8 spans through BOM/CRLF/dedent/comments, shared metadata isolation and native empty-string rejection. Typecheck and diff checks pass. Evidence and candidate identity: `reports/math/requirement-collector-snapshot.json`.

## Authored math and surviving row ownership

`requirement-math.ts` retains literal body DB values and native-sanitized common metadata separately from the complete generated row. Prefixes are synthetic provenance. Normalization must include the prefix: adding `Text: ` changes leading whitespace into interior text for HTML sanitation, so sanitizing just the field is not an equivalent operation.

The adapter validates authored, Mermaid-sentinel-decoded and sanitized/display inputs. Every collected occurrence is checked, including ignored declarations, overwritten body values and accessibility fields. Validation happens before sanitation can delete an authored equation and again after it can create or change one. Break tags cannot join equation halves. Record-local field offsets identify normalization variants of the same physical occurrence; costs take the maximum per occurrence across variants. Different records and field positions are charged separately. Original fence intervals remain source-binding data, not budget identities supplied over transport. Untraceable variants are conservatively charged independently rather than guessed equal. Canonical parts always come from the final input, even when an earlier variant has identical text.

Requirement quoted values have literal backslashes. The proposed hook preserves standard TeX double-backslash row separators instead of applying native `createText` collapse. Like the existing state correction, it restores one HTML serialization level only inside already-delimited equations. These are explicit adapter semantics, not claims of native KaTeX parity. Public activation requires the measured prelayout hook to consume exactly this input, while plain rows retain native Markdown behavior.

`requirement-ownership.ts` reconciles every DB effect with the actual parsed snapshot, replacing only common metadata setter arguments with their normalized values. It then selects native surviving names and body owners in rendered row order, preserving first declarations, reverse body setters and resets after ignored duplicates. Optional absent rows have no slot. Requirement and element keys are distinct even when names collide; this is a provenance distinction, not proof of safe DOM IDs, class namespaces or relationship endpoints. Those integration gates remain open.

The integrated math/ownership foundation passes 46 tests across nine files, including 21 Requirement tests. Verification covers standard matrix row separators without extra author escaping, erased invalid/valid formulas, encoded delimiters, distinct identical formulas within one row, hidden repeated/duplicate values, metadata DB sanitation, incoming budgets, native row replay and exact CRLF source spans. Typecheck and diff checks pass. An initially overescaped matrix test was corrected before final verification; final evidence supersedes it. Evidence: `reports/math/requirement-math-snapshot.json`.

Independent read-only review found no blocking defect in normalization, resource accounting or row ownership. Its requested edge cases are present in the final tests. The renderer must consume canonical input exactly once; applying native slash collapse or a second entity-restoration pass would invalidate this contract. The later milestones below supply production worker lifecycle and transport validation. Namespace safety, browser measurement and installed acceptance remain pending.

Review qualification: the CRLF fixture proves source normalization and coordinates. Generic Mermaid preprocessing converts CRLF before sanitation, so that fixture does not by itself demonstrate prefix-sensitive DOMPurify behavior; full-row normalization follows the inspected native call boundary.

## Native parse completion lifecycle

`requirement-node-db.ts` uses the normal native API after the exact Requirement artifact contract and private DOMPurify alias are installed. It wraps the configurable fresh DB getter, registers each actual native instance and wraps common metadata setters with the synchronous private sanitizer. A successful explicit `clear` authorizes one parse; parse start consumes that authorization. Failed parses, subsequent clears, unexpected inputs and reentry cannot produce a usable completion capture.

The critical boundary is inside the synchronous Jison parse wrapper. `Diagram.fromText` awaits the parser even though Requirement parsing is synchronous. A different DB constructor or another family can therefore replace shared common metadata before the normal API caller resumes. The wrapper captures detached native state immediately on success and binds it to that exact DB and parser input. Consumption is one-use; mismatched input consumes and rejects the pending capture. It describes historical parse completion, not mutable live state afterward. Clearing the same DB invalidates its pending capture; constructing another DB cannot alter the detached snapshot.

`requirement-node-math.ts` consumes that capture before asynchronous source collection, requires the collector's parser source to equal native `Diagram.text`, and then reconciles normalized effects and row ownership. Independent read-only review found no blocking lifecycle defect within this contract. The later milestones below supply worker request/cache flags, validated JSON transport and production hook installation. Rendering remains pending.

The integrated lifecycle check passes 28 tests across seven files, including isolated source processes with and without the artifact contract. It proves actual shared-metadata replacement between synchronous parse completion and the API continuation, while the authenticated snapshot retains the original metadata. It also covers wrong receiver/unregistered DB, one-use and mismatched input, fresh-clear authorization, parse failure/recovery, reentry, in-parse clear rejection, sanitizer restoration and detached async math reconciliation. Typecheck and diff checks pass. Evidence: `reports/math/requirement-lifecycle-snapshot.json`. The initial test harness needed the native appended parser newline and corrected clear-authorization expectations; final evidence supersedes those fixture issues.

## Serializable transport and local accounting

`requirement-normalize.ts` now supplies the same pure normalization/accounting operation to the collector and the receiver. It reconstructs provenance from each semantic field value, adds the synthetic row prefix, traces both sanitation-pass witnesses and validates all three variants. The collector separately maps those validated offsets back to the original fence. This prevents transported original origins from becoming trusted budget identifiers. Tests compare local accounting to original-span unions after BOM, CRLF, indentation and entity normalization.

`requirement-transport.ts` serializes records, all hidden variants, sanitation witnesses, authored effects, native snapshot, surviving slots and totals. The synchronous verifier checks field sets, identities, normalization, formula parts and costs, reconstructs local charges, replays DB effects, and compares native state and ownership. A mutation that copies the first equation's origins onto a second identical equation and coherently reduces all three cost metrics is rejected. Figure-local totals are required from the producer; the receiver can reserve them against an incoming document total.

Review finding R-T1 exposed arbitrary generated stereotype/relationship values in otherwise matching effects and snapshots. Exact native enum domains now constrain requirement types, relationship kinds, directions, risk and verification values. Coherent effect-plus-snapshot mutations reject at the enum guard, so generated labels cannot acquire uncharged equations.

Sanitation output remains a witness from the worker's private purifier. Pure tracing does not independently prove DOMPurify execution. Original-source authenticity and browser native-row attestation remain separate integration gates. The production worker milestone below wires this transport into requests/cache/build. Public rendering remains pending.

52 tests across eleven files, typecheck and diff checks pass. Independent review accepts this internal transport scope after R-T1 and test-oracle follow-up. Evidence: `reports/math/requirement-transport-snapshot.json`.


## Production worker integration

The source worker installs the pinned Requirement artifact hook before native imports. The release worker applies the same full-artifact build contract. Requests with `requirement: true` install the native lifecycle adapter before parsing. They require the exact Requirement family and reject conflicting family/type flags. The parse cache includes the Requirement flag and original source.

After the native API returns, the adapter consumes the completion snapshot with the returned DB and exact `Diagram.text`. It validates all authored fields, reconciles native rows, and serializes the verified transport. Math requires original fenced source; plain diagrams omit the transport. Located math errors preserve original line and byte coordinates. This internal request path does not remove the public raw-math guard.

The final integrated suite passes 708 tests across 112 files. Fourteen source/relocated release worker fixtures compare complete outputs. Independent assertions cover sanitized accessibility text, standard matrix separators, hidden duplicate costs, a 1,001-occurrence rejection, normalized BOM/CRLF originals, source mismatch/missing originals, wrong/mixed flags, native syntax failure and uncached recovery. Unit tests also check cache separation. Typecheck, build, diff and asset/reference budgets pass. Timing was not run.

Independent review accepts the internal wiring and test oracles. Unit recovery can reuse a cache entry; the direct worker verifier proves uncached recovery in a single batch. Browser rendering and final source authenticity remain outside this acceptance. Evidence: `reports/math/requirement-worker-snapshot.json`.

Next implement measured native row hooks, class/ID isolation and browser attestation. Then connect public compiler/source/export paths and run installed standalone acceptance. The glyph-styling and descendant-label obligations above apply to those hooks.


## Measured browser rows and isolated graph identities

The browser patch checks the complete native Requirement and shared-shape artifacts. It inserts explicit row roles at all nine native call sites. The runtime re-enumerates native row inputs, including synthetic prefixes and generated stereotypes, before rendering. Each planned role must appear exactly once. Visible row groups receive stable `kind:index:field` ownership keys; displayed equations receive formula attestations. These internal stamps do not yet authenticate original fenced source.

Wholly plain diagrams use the native draw function unchanged. An adapted diagram renders detached native maps through a proxy, so native `getData` cannot mutate the original DB. It assigns opaque node and DOM IDs by kind/index and opaque relation IDs by relation index. Endpoint lookup keeps native requirement-before-element precedence. Authored classes become opaque tokens while native structural classes and computed styles remain. A requirement and element with the same name now remain separate graph nodes; this deliberately corrects the native ID collision.

Each math-containing node packs rows from measured top/bottom bounds before native rectangle sizing and layout. This avoids the native half-height placement overlap when a tall row follows a short row. Plain rows within those nodes retain native text rendering. Final recentering reserves symmetric padding, and the divider occupies the gap after the name, including nodes with only the last optional field. Equation rows preserve standard TeX backslashes and apply the validated sanitation normalization once.

Measurement uses the actual row ancestry and native filtered label CSS. Review finding R-G1 exposed lost typography. A stronger visual/test check also found native span color rules overriding MathML descendants. Formula wrappers, MathML roots and later ink-reservation wrappers now inherit row color and font properties explicitly. Internal MathML sizing remains untouched. The styled regression checks actual MathML color/size with both a matrix and `\rlap` overhang. Public rules continue to reject text shadows and overflow-changing styles; this does not claim arbitrary native CSS support.

The native draw runs in a hidden temporary SVG. Successful rendering transfers its content and viewport; failures restore the caller's original nodes and attributes. Tests inject measurement and commit failures, verify detached DB state, inspect staging visibility and prove recovery. Another assertion verifies requirement-first edge resolution when an element shares the same name.

The final integrated suite passes 710 tests across 113 files. Thirty-four browser checks pass at Chromium 320/1440, covering twelve Requirement cases plus shared label and flowchart-shape regressions. Plain parity compares viewport, text and geometric bounds; native random Rough.js control points are not a deterministic oracle. Build, typecheck, diff and asset/reference budgets pass; timing was not run. Independent review accepts the renderer and R-G1 fixes. Evidence: `reports/math/requirement-render-snapshot.json`.

The public integration below now supplies compiler/document budgets, exact original-source/export bindings, runtime attestation and installed standalone acceptance. Human notation/visual/accessibility gates remain open.


## Public compiler and source ownership

Requirement figures now participate in public parsing, figure transport and document math budgets. The compiler emits source maps even when every validated formula is hidden or belongs only to accessibility metadata. This retains the zero-visible-formula attestation. The runtime accepts Requirement maps and verifies each rendered equation against its semantic row key before enabling references.

Review finding R-S1 showed that valid byte coordinates alone cannot authenticate field ownership. Two fields can contain identical equations, and a coherent origin swap can pass transport consistency and byte checks. The parser parent now retains a private canonical JSON receipt at fresh worker-result ingress, keyed by exact original/rendered source and request flags. Source mapping reconstructs the original fence from document bytes and compares the entire Requirement payload to that receipt. It never trusts the shared mutable parse-cache object as the expected value. Missing receipts trigger bounded synchronous worker revalidation; cache clearing and worker-path changes clear receipts.

Review finding R-S2 showed that duplicate request IDs could associate another source's result with a receipt. Request IDs must now be unique before cache lookup. Responses must have exactly the pending IDs, without duplicates, and matching successful diagram types. Invalid batches cannot create receipts or cache entries. Tests cover cached request collisions, malformed worker outputs, coherent equal-TeX origin swaps, shared-cache mutation and revalidation of legitimate clones.

The installed single-file verifier now checks six visible Requirement equations, including standard matrix source and an entity-encoded document-reference field. It selects rendered glyphs, copies each exact reference and resolves the packet against the installed document. Hidden duplicates remain budgeted. Network denial, narrow/desktop rendering, source fallbacks and printed source remain part of that verifier.

R-S1 also identifies an ownership-authentication audit obligation for earlier family source maps using only byte/display checks. Their historical rendering evidence does not close that stronger ownership requirement. Complete that cross-family audit and any required hardening before C06/C07 acceptance.


Public verification passes 746 tests across 117 files. The relocated installed single-file candidate passes at 320/1440, including six exact Requirement references, standard matrix syntax, encoded document-reference delimiters, denied network, readable fallbacks and printed source. Build, typecheck, diff and asset/reference budgets pass; timing was not run. Independent review accepts Requirement source ownership and response correlation after R-S1/R-S2. Evidence: `reports/math/requirement-public-snapshot.json` and `reports/math/requirement-public-standalone.json`.


The later [cross-family source ownership slice](source-ownership-notes.md) closes R-S1 for all activated families.
It also isolates cached parse results from callers and rejects explicit empty pie/timeline record substitutions.
Requirement remains covered by the shared eleven-family adversarial suite.
