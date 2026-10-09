# Info diagram inventory

The inventory and grammar-owned source collector are implemented. Authored math validation and resource accounting are also implemented; worker transport, compiler integration and public activation remain open; Info is not N/A.

## Pinned artifacts

- `node_modules/mermaid/dist/chunks/mermaid.core/infoDiagram-VRGFBTTK.mjs`: SHA-256 `7ab91ef6d2e46ac243cba517155dd24db6a54ac6b4a27690fe34bcf9027172c8`
- `node_modules/@mermaid-js/parser/dist/mermaid-parser.esm.mjs`: SHA-256 `35908a13f5906e3ab6ea36fa75866d6c8b75a535ce62871e9176da7c766da4af`
- `node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.esm/info-JQRVFZIU.mjs`: SHA-256 `9818fb2141dd8598446c634d8732d2b048dc5879230ca032d95e432d28775b48`
- `node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.esm/chunk-QTXQJRYY.mjs`: SHA-256 `3d6b713acd749de921dceb0ddb5bdb6102ee07cf20d31d75d0059726b3151c26`

## Authored fields and overwrite behavior

The exported `parse('info', source)` parser accepts `title`, `accTitle:` and `accDescr:` after `info`. Repeated declarations overwrite the AST fields: the final declaration becomes `Info.title`, `Info.accTitle` or `Info.accDescr`.

The concrete syntax tree retains each declaration as a separate leaf with its exact offsets. The focused inventory test uses distinct math delimiters in first and final title/accessibility declarations and verifies all six CST leaves, while confirming the AST exposes only the three final values. A future collector must therefore validate and charge every authored occurrence, including overwritten values, before deciding whether it has a rendered target.

`showInfo` is accepted as an optional modifier after `info`, on the same or following line. Bare `showInfo` is rejected because the grammar root requires literal `info`. The tests distinguish these forms. Arbitrary ordinary label lines are rejected by that grammar; there is no evidence here for an additional free-form text role.

## Native rendering boundary

The pinned native renderer parses the source but draws one fixed version string: it configures a 100 by 400 SVG and emits `v${version}` from its renderer argument; the DB separately exposes the fixed package version. Its body does not draw `title`, `accTitle` or `accDescr`.

Hidden authored math still needs source validation and document-budget accounting even though the current native body has no corresponding visible label. Any eventual adapter must establish exact grammar ownership, authenticate source spans, validate all declarations and explicitly describe whether any display binding exists. This inventory deliberately does not infer a renderer implementation from parser acceptance.


## Grammar collector

`extractInfoLabels` consumes the generic Mermaid preprocessing map and exact
Langium CST assignment locations. It retains each overwritten occurrence in
source order, marks the final assignment active, and records original UTF-16
and UTF-8 intervals. Common whitespace conversion is checked by independently
parsing each owned assignment, including overwritten values. The final assignment
must also match the complete AST. Failed grammar or source-map checks publish no
result. No native DB is constructed or mutated.

Three focused collector tests cover overwritten values, equal text at distinct
spans, multiline whitespace, BOM/CRLF/dedent, removed comments, altered source
rejection and recovery. Independent read-only review accepted source SHA-256
`874b49812ad1f01b25896c240b3f62c1fea373e83587e9009f7c20c3d85024b8`
with no material finding; the reviewer did not run tests. This is source-collection
evidence, not public adapter or final acceptance evidence.


## Authored math validation

`extractInfoMath` validates the exact native parser semantic text for every
assignment, including overwritten fields. Info has no native field sanitation or
visible math-label stage, so this validator introduces neither. Located formula
parts retain mapped source intervals; errors retain role, record index, line and
original UTF-8 byte locations. Cumulative resource totals include the supplied
initial budget, even for field-free diagrams. Per-record costs are deltas, not
repeated cumulative totals.

Six focused tests pass for distinct equal-TeX owners, standard matrices, invalid
and forbidden overwritten formulas, exact Unicode/BOM/CRLF locations, empty-field
budget checks and cumulative boundaries. The initial per-record cumulative-cost
bug was corrected before acceptance. Independent read-only review accepted
SHA-256 `bee1991b3117951fc3d065e22a24a8c387cbcd7f19ea2d8043fcfd3033308b4d`.
The reviewer did not run tests. Worker transport, source receipts, compiler budget
integration and public activation remain open.


## Public integration acceptance

Info is now enabled through the source and bundled workers, compiler and runtime
source-map contract. Transport preserves every authored assignment, validates
active/overwritten roles and recomputes per-expression resource costs. Private
source receipts reject coherent payload omissions, including after cache reset.
The worker checks the native diagram type and exact parser input before emitting
transport. Plain Info remains on its native path.

The compiler emits an authenticated empty label map: Info draws version text,
not its authored title/accessibility fields. Hidden equations are still validated
and budgeted. This is not a claim of visible Info equation glyphs or references.

Independent read-only review found no unresolved material production finding.
The shared suite passed 894 tests across 142 files, typecheck passed, the 66-file
build passed, and five source/bundled-worker cases matched exactly. Asset and
reference budgets passed; timing budgets were not run. Installed, relocated
single-file acceptance passed at 320/1440 pixels, without external requests,
including Info native version output, no generated formula bindings, print/source
fallback, worker failure and MathML-unavailable fallback. The initial standalone
fixture incorrectly asserted that the always-present hidden notice element was
absent; the corrected assertion waits for version text and checks visibility.
No production change was needed for that fixture failure.

Exact candidate hashes and check evidence are recorded in
`reports/math/info-public-snapshot.json`. Remaining-family coverage and final
W5/W6/C01–C08 acceptance remain open.
