# Math implementation decisions

Status: retained-scope decisions and automated release checks passed; human acceptance remains open.
The [plan's scope amendment](../../plans/math-rendering.md#scope-amendment-mermaid-deferred)
defers remaining Mermaid work and acceptance. It does not waive checks for shared code.
Evidence: [renderer prototype](../../../spikes/math-rendering/README.md),
[resource prototype](../../../spikes/math-resource/README.md),
[Mermaid prototype](../../../spikes/math-mermaid/README.md).
Paths in the preceding links are relative to this record's directory; measurements remain prototype evidence, not release acceptance.

## Engine and delivery

Use pinned MathJax 4.1.3 with mathjax-tex-font 4.1.3 for Visser-owned math.
Use explicit base and AMS configuration, fresh expression state, no font cache,
and `linebreaks.inline=false`. The last setting is essential: automatic splitting
produced multiple SVG roots and invalidated whole-expression geometry in the probe.
Reject system-font text glyphs instead of treating their metrics as deterministic.

This choice supports the native diagram metric contract. It does not minimize
the sampled standalone files: the 1,811,939-byte browser bundle becomes about
2.42 MB when embedded; the sparse and 100-equation SVG controls were smaller.
The comparison does not establish a break-even equation count. Conditional
loading keeps this fixed cost out of documents without math.

Browser conversion must run in a terminable blob worker. A data-URL worker failed
at the required script size in Chromium; the blob worker passed `file://`, strict
network denial, and forced cancellation with readable source remaining visible.
Production packaging must still prove its own delivery/CSP path. No prototype
success substitutes for the relocated installed-release test.

## Initial enforced policy

These are selected safety bounds, not guarantees that every expression below
each individual bound will render. The first exceeded bound stops validation.

| Bound | Selected value | Evidence and consequence |
| --- | --- | --- |
| Raw expression | 2,048 UTF-8 bytes | A 2,047-byte wide expression expanded to about 1.45 MB; raw size alone is insufficient. |
| Per-expression SVG | 256 KiB / 2,048 elements | Reject high expansion even below the source limit. Test exact boundaries in the implementation. |
| SVG nesting | 128 levels | Bound recursive conversion and boundary validation consistently; exact/over-limit structured-tree tests cover 128/129. |
| Normalized dimensions | 4,096 em per width, height, ascent or depth | Deliberate initial bound: twice a 2 KiB source sequence of nominal em-wide glyphs. Huge explicit spacing can exceed it with short source and is rejected. This is not a responsiveness guarantee. |
| Document occurrences | 1,000 | Tested repeated and distinct cases; include alternate rendered occurrences, not only unique conversions. |
| Expanded document SVG | 8 MiB / 50,000 elements | The 1,000-distinct probe used 7,772,435 bytes / 27,783 wrapped nodes. Alternate views consume the remaining allowance. |
| Node process | 128 MiB heap / 5 seconds | Three 1,000-distinct runs completed in 1.566–1.603 seconds; sampled heap reached 119.2 MB. Fail closed at either limit. |
| Node output protocol | 16 MiB | The measured JSON response was 7,928,208 bytes. Structured production output must be measured separately. |
| Browser conversion deadline | 2 seconds per bounded batch | Prototype 1,000-distinct conversion took 821–847 ms. Slow devices may retain source; no slow-device performance guarantee is claimed. |

Enforce byte/node budgets on the sanitized production representation, counting
each inserted instance. Prototype counts include wrapper nodes and therefore
are comparison evidence; production counters require separate boundary tests.
The parent process terminates synchronous conversion; no in-engine timer is
represented as a cancellation guarantee.

Production occurrence accounting reserves 196 additional bytes per converted
SVG for runtime root attributes. This is the serialized union of width, height,
baseline style, native x/y/generated marker and accessibility attributes, with
25 characters reserved per numeric spelling and explicit unit/markup bytes.
It conservatively counts complete replacement dimensions. Compiler validation,
final rendered-occurrence validation and browser insertion use the same charge.
The browser normalizes native dimensions and rejects attribute overhead beyond
the reservation; the 256 KiB expression and 8 MiB document caps remain unchanged.
The allowance is included in the renderer fingerprint.

The 16 MiB process protocol bound applies separately to serialized input and
output. The parent checks input bytes before spawning and reports a source-located
`E_LIMIT`; the child uses the same bound. JSON escaping is counted after
serialization, in addition to the 2,048-byte raw expression limit.

## Retained release disposition

Retained field/path reconciliation and final automated release checks passed.
See completion.md and reports/math/final-candidate-manifest.json for the exact
candidate and report bindings. Remaining Mermaid adapters are deferred and do
not block this scope. Human corpus meaning, visual/print baselines and reader
acceptance remain open under C04–C05.

Final math.js measures 1,855,103 raw bytes and 678,479 gzip bytes (Node zlib,
level 9), below the unchanged 2,097,152 / 786,432 byte limits. Packaged asset
SHA-256: `ba82dfcf88391ef8ada7f73a39ade6c0ebd1c4448243cd0c7e8e70164509a2d3`.
The final manifest verifies that the installed standalone uses this toolkit and
renderer fingerprint. See reports/math/release-asset-measurement.json.

The shared ink normalization reserves the union of logical dimensions and
conservative painted SVG bounds before native routing. Horizontal normalization
preserves the baseline at y=0. Worker validation independently recomputes
containment, and final serialized resource counts include the normalization.
This retains standard lap/smash/negative-spacing commands without allowing their
painted content to escape the complete formula's external reservation.

Worker replies require an unambiguous success/error arm and a safe structured
SVG whose recomputed byte/node counts, dimensions and policy match the request.
Engine and boundary checks share the 128-level depth and 4,096-em bounds.
The original 1,014-output geometry probe measured maximum width/height/baseline/
bottom residuals of 0.240/0.206/0.398/0.242 SVG units against the pinned 442 units
per ex. Validator quantization bounds remain 0.271001 units for extents and
0.492001 for baseline. Normalized output additionally has independently checked
painted containment; these format tolerances are not permission for ink overflow.
The final development probe passed all 14 corpus expressions in both modes and
1,000 distinct fractions. Human mathematical interpretation remains separate.

## Narrow inline equations

Inline formulas retain natural SVG size and scroll inside their visual wrapper
when wider than the containing text block. The wrapper uses the validated TeX
depth, adjusted for any horizontal scrollbar height, to preserve its baseline.
This also applies inside constrained summaries and fact-value grid cells.
Ordinary overflowing wrappers receive a keyboard stop and scroll label. A
keyboard-reachable containing link or disclosure remains the single stop and
routes left/right arrows through its overflowing formulas in reading order.
Negative tab stops are not selected as proxies. Resize preserves active focus
semantics until blur. Detached transient copies release resize observations;
connected movement or reinsertion keeps the scroller functional. These are
reader behaviors, not changes to TeX syntax or SVG resource-budget limits.

