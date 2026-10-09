# ER math adapter evidence

Status: collection, DB/state reconciliation, authored/display candidate validation and budgets are implemented. Native layout evidence, Dagre/ELK label-copy planners and planned-copy accounting are available; measured rendering, source transport and public activation remain pending.

Layout correction: the pinned default is **ELK**. Dagre topology evidence applies only when Dagre is explicitly selected. Do not force Dagre or apply its overwrite/copy rules to default exports.
Pinned Mermaid artifact: `erDiagram-OPXOYQCR.mjs`, SHA-256
`1437bfbd601358cd7f2e54d540410bdebc9bdd38131300d16c49705811f9de49`.

## Authored ownership and native effects

Entity names, aliases, attribute type/name/key/comment, relationship roles,
subgraph headings and accessibility fields need grammar-owned source records.
Repeated entity names and ignored later aliases still count as authored fields.
The first nonempty alias wins. Relationship records append in authored order.

Attribute production 64 builds a reversed callback array; native addAttributes
iterates backward and restores authored order within each declaration batch.
Do not reverse twice. Entity maps are per-DB, but common accessibility state is
global. Snapshot it before another DB constructor clears or changes it.

The grammar has title productions but its lexer never emits title/title_value.
Productions 23/24 call setAccTitle, not setDiagramTitle. The ordinary `title`
statement is not a supported authored diagram-title path in this pinned artifact.
Frontmatter is disallowed by Visser's existing source policy.

Nested groups complete inside-out. Preserve native document statement results:
alias-only and style productions have default values; accessibility returns text.
These can affect group membership. Membership deduplicates trimmed strings but
retains original strings. Earlier completed group membership wins; duplicate
subgraph IDs remain in the array while lookup resolves to the newest entry.
Relationship endpoint resolution uses the lookup at the moment of insertion.
Root direction is distinct from nested group direction. Native clear does not
reset direction, so later replay needs an explicit baseline or fresh DB lifecycle.

## Collector implementation contract

Use a fresh native Jison parser and private lexer/options with ranges enabled.
Execute native semantic actions with original string/object values. Maintain a
parallel provenance ledger; do not inject provenance objects into native values.
Verify callbacks and their arguments against the owning reduction. Record exact
callback order separately from all authored field occurrences. Publish only after
successful parsing. No shared parser/lexer/DB mutation is permitted.

For offsets below, r0 is the final RHS semantic value.

| Productions | Field ownership |
| --- | --- |
| 7–10 | Entity endpoints and relationship role r0; native relSpec orientation retained |
| 11–16 | Entity declaration, optional attributes/class |
| 17–22 | Entity declaration and alias; optional attributes/class |
| 23–26 | Trimmed accessibility fields |
| 31 | Subgraph close: header r2, native document r1; return the subgraph ID |
| 32–33 | Header ID/implicit title r1, or explicit ID r4/title r2 |
| 34–35 | Subgraph title identity or r1 + synthetic space + r0 |
| 40/45/46 | Class definition, class assignment, CSS effects |
| 58–62 | Entity-name primitive; 58 removes every quote, others preserve token |
| 65–68 | Attribute type/name and optional keys/comment |
| 69–70 | Type token, optionally concatenated with `?` |
| 71 | Attribute name token |
| 72–74 | Ordered key list, preserving authored key case |
| 75 | Comment with every quote removed |
| 76 | Relationship spec: cardA=r0, cardB=r2, relType=r1 |
| 84–86 | Role; 84/85 remove every quote, 86 preserves token |

Backtick delimiters are skipped by the lexer; the value token range excludes them.
Do not strip them again. Retain exact original source intervals through BOM,
CRLF, comment removal, fence dedent and Unicode. Equal text at different spans
must remain separate owners. Effects need immutable copies because native grammar
arrays are mutated later. Native addEntity/addAttributes internal calls during
replay are not extra authored occurrences.

## Rendering work still required

Entity header and all attribute cells use shared createText through erBox.
Generic type conversion, escaped angle brackets and Markdown/HTML processing
need normalization witnesses before measured rendering. Relationship labels use
generic edge rendering; groups use cluster rendering. Source transport, receipts,
resource reservation, private native capture, worker parity, compiler maps,
measured layout and installed standalone acceptance remain open.

A read-only Terra inventory and specialist design review informed this record.
Native oracle tests are in `tests/unit/mermaid.er-native.test.ts`; they do not prove
the future collector, replay or renderer complete.

Further renderer inventory: hand-drawn erBox recursively draws a default-look
background node before its own labels, so copy accounting must examine that
second label set rather than assuming one formula occurrence per entity field.
Attribute-free entities use drawRect instead of the attribute-table helper.
The generic-type helper also rewrites text descendants after createText when
angle entities are present; a math adapter must not flatten equation DOM through
that plain-text rewrite. getData suppresses entities whose keys collide with
subgraph IDs and emits groups in reverse completed order. It mutates entity
compiled styles and color indices before cloning visible nodes. These are native
render-state effects, not additional authored occurrences.


## Implemented source collector

`extractERLabels` preserves native semantic values and records callback arguments
in exact order. Scalar ownership follows grammar ranges; attributes, key lists
and subgraph headers carry separate object-identity ownership. No ownership is
recovered by matching text. Records sort by grammar position, including empty
fields, and effect references remap to that order. Callback arrays preserve the
native reversed attribute order independently of source-ordered records.

The initial Terra draft used ambiguous text matching and was rejected. The
coordinator replaced it with the grammar/object-identity collector. Terra then
provided independent native-trace tests; the coordinator added exact equal-TeX
effect reference, empty-field and parser-isolation assertions.

Independent review found ER-C1: nested directions checked the original parser.yy
instead of Jison's active copied state. The collector now reads the action's yy
argument. The subgraph callback returns the trimmed native ID. A later review
noted that interval-based sorting misplaced empty fields; grammar-position
sorting fixes this without narrowing the authored-order contract. Final reviewed
source SHA-256 is `c5f125c5d42993a9f7ec870e5c8ade5891674147f9ffdd6fdc1e4f9fc9e27f78`.
The reviewer inspected code but did not run tests.

Tests compare native callback traces across declaration and class/style forms,
nullable backtick types, attribute variants, nested directions, group membership
and relations before/after groups. Provenance tests distinguish equal TeX at
separate source locations and retain Unicode/BOM/CRLF/comment transformations.
An empty accTitle prefix consumes subsequent whitespace/newline in the native
lexer; the empty-field ordering regression uses a native-valid empty attribute
comment instead of inventing an empty accessibility production.

Evidence and scoped exclusions are recorded in
`reports/math/er-info-foundation-snapshot.json`. Public ER math remains guarded.


## Pure stored-state replay

`captureERDb` detaches stored entities, classes, relationships, group arrays and
lookup entries, counters, direction and common metadata before getData mutates
entities or another DB clears common state. It does not prove a completed parse.
`replayERDb` reproduces the pinned DB methods from normalized effects. Common
setter arguments must already equal native setter output; group-title text must
already be sanitized, before final trimming. Effective look is supplied by the
caller. These preconditions still need source normalization and lifecycle proof.

The replay retains native first-alias precedence, reversed attribute batches,
class/style effects, group membership, duplicate-ID lookup behavior and endpoint
resolution timing. Clear resets stored state and common metadata but retains
direction. It clones the complete effects graph before mutation, preserving
shared rows and relationship specifications without changing caller inputs.
Reconciliation requires both deep equality and bidirectional object sharing.

The initial Terra replay draft lacked native parity checks, strict argument
validation and complete sharing checks. The coordinator corrected those gaps;
Terra supplied native parser/DB comparison fixtures. Eight focused tests pass,
including coherent equal-valued lookup forgery rejection, shared row/spec
identity, input immutability, detachment and malformed arguments. Independent
read-only review accepted SHA-256
`d785dd9e013072eeef62722ef27c5d86e1279439c8d25883280c8f3acd906f79`.
The reviewer did not independently execute tests. This evidence does not prove
sanitation, source ownership, parser lifecycle or rendering.


## Normalization design boundary

A further read-only specialist inspection identified distinct renderer paths.
This is a design record, not completed normalization or browser evidence.

| Role | Native stages before the proposed math hook |
| --- | --- |
| Truthy effective header with no attributes | drawRect/labelHelper: decodeEntities then sanitizeText |
| Header with attributes, or empty effective header | Direct table addText input |
| Attribute type/name/comment | Direct addText input after grammar transformations |
| Attribute keys | Individual tokens joined with synthetic commas, then addText |
| Relationship role | Direct edge createText input |
| Group title | DB sanitation and trim; then direct cluster createText input |
| Accessibility title | Grammar trim, common sanitation, leading-whitespace removal |
| Accessibility description | Grammar trim, common sanitation, newline-following-whitespace removal |

Table addText runs parseGenericTypes, conditionally escapes all angle brackets,
then calls createText and may destructively rewrite descendant textContent.
A measured math hook must precede that entire sequence to preserve TeX and MathML.
Simple-header sanitation must remain a distinct witnessed stage. Do not apply a
serialization decoder to unsanitized table/edge input as though sanitation had
occurred. Reverse private entity sentinels with provenance; normalize breaks;
recover serialization only at actual sanitizer-owned stages. Preserve standard
TeX backslashes. Plain fields retain their native Markdown/generic behavior.
The interaction of generic-looking prose with math-bearing table fields needs an
explicit tested normalization decision; it is not settled by this inventory.

Stored-state replay must receive only DB-stage transformations: group title after
sanitation but before trim, and common fields after their complete setter output.
Renderer-only transformations must not change stored entity/attribute/role args.
First accepted alias chooses the effective header. Ignored aliases, overridden
common fields and entity keys hidden by group-ID collisions remain authored
validation surfaces.

Hand-drawn erBox recursively draws a complete default-look background before the
foreground, including both simple/table headers and every attribute cell. Native
preservation therefore needs two rendered copies per visible entity field.
A browser fixture must verify this count; no blanket doubling applies to edges
or groups. Duplicate group IDs and empty groups require layout/draw reconciliation
before claiming one label per stored group. These remain open implementation
obligations.


## Executable generic-text characterization

A bounded Terra characterization calls the pinned native `parseGenericTypes`
export directly and pins the ER shape source hash. It confirms a material
interaction: `List~String~ $$x~y$$` becomes `List<String~ $$x>y$$`, and
`$$x~y~z$$` becomes `$$x<y>z$$`. Generic normalization cannot run unmodified
over a complete math-bearing table field. The tested matrix/backslash input,
literal `<` and `&lt;` survive this helper; that does not prove the later
createText/DOM rewriting stages preserve them.

The source-contract assertion distinguishes attribute-free truthy headers using
drawRect from the table addText route, and covers each attribute field call. It
is source evidence, not browser layout evidence. Two focused tests and typecheck
pass. Logs: `reports/math/er-render-semantics.log` and
`reports/math/er-render-semantics-typecheck.log`.

The initial test draft covered inequalities only and incorrectly generalized
that math prose was unchanged. Coordinator review required tilde cases, which
exposed this native transformation; the final test makes the narrower claim.
Next implement and verify a pre-addText math path that protects formula contents
and explicitly defines generic-prose behavior. No ER production activation or
normalization acceptance is claimed by these tests.


## DB-field normalization and generic-text implementation

`er-db-normalize.ts` produces private strict/default sanitizer witnesses and
replays them with exact provenance for group titles and accessibility fields.
Group output exposes both sanitation before trim (for stored-effect replay) and
final trimmed text. Accessibility title strips leading whitespace; description
collapses native `\n\s+` sequences. Witness arrays are validated, detached and
frozen. No renderer entity decoding, generic rewriting or source authentication
is implied.

The isolated native oracle passes raw authored values to real ER setters and
compares their captured outputs with the helper: 66 cases cover three roles,
two label modes and HTML/entity/blank/multiline/Unicode/TeX inputs. It prepares
native link hooks before the first SVG-only case. The future completed-parse
lifecycle must establish this same precondition; the helper itself does not
change native config or native sanitizer state. Exact origin and malformed
witness tests also pass. Independent read-only review accepted source hash
`753fdb8cb882bda8b1415d3a9a83e7332521715c94d151193b84a45916d31643`.

`er-generic-text.ts` plans only single-unit tilde-to-bracket replacements.
Complete single-line equations are opaque to comma splitting and tilde pairing.
Adjacent original comma segments with one unprotected tilde each merge into a
complete accumulated span. Pairing waits until groups are finalized, preserving
all text even where native overlapping merges would discard earlier spans.
For example, `List~$$x~y$$~` becomes `List<$$x~y$$>`, and
`$$x$$~,b~,c~` becomes `$$x$$<,b~,c>` instead of losing the equation.
Plain fields will retain the native renderer path. This deliberate correction
is part of the math-bearing table-field contract, not a native parity claim for
the destructive overlap case.

`er-generic-provenance.ts` consumes that same edit plan and maps every bracket to
its authored tilde. Tests cover native non-overlap parity, multiple formulas,
Unicode offsets, wrappers, overlapping merges and unchanged entities/escapes.
Independent read-only review accepted generic planner hash
`eb1036f81fab66f6239b3ad38f3e95f0c31aa44cc767807e1d7aeb9169d9091e`
and provenance helper hash
`a3bdc0c3185026c240f495bbf6d86fba92b8a6a0427f0a4c74dc325efa191476`.
Reviewers did not run tests.

The later integration must validate equations before accepting normalization,
and render generated brackets as literal measured text. It must bypass native
generic reprocessing, HTML interpretation and destructive textContent rewrites
for math-bearing table fields. Simple headers still require their separate
sanitizer-owned rendering stage. No browser/layout or public ER activation is
claimed by this internal milestone.


## Completed-parse lifecycle design

Independent source inspection selects the existing Requirement fresh-instance
pattern, with Kanban's synchronous sanitizer/config checks. This is an
implementation contract, not completed lifecycle evidence.

Pin the ER module and expose its class, a detached configuration capture and an
inert sanitizer-hook preparation function. Configuration must prove strict mode,
explicit boolean HTML-label mode, effective look and default purification
options; a truthy custom dompurifyConfig is outside the accepted normalizer.
The inert preparation must not construct a DB or alter config.

Wrap the native fresh DB getter and register each instance in a WeakMap. Reject
construction during parsing before invoking the getter. Constructor clearing
does not arm parsing: require the later explicit successful clear performed by
Diagram.fromText. That clear invalidates completion and advances generation.
Preserve direction retention. Guard parser receiver, registered yy, fresh clear,
source string, argument count, overlap, thenables, clears during parsing and
config drift. Capture stored state and globally shared common metadata
synchronously before returning from native parse. Failure publishes no receipt.

Observe only outermost grammar callbacks: addAttributes calls addEntity
internally, so callback depth must suppress invented authored effects. Capture
arguments before native mutation/default insertion and retain return values.
Compare the collector's ordered raw method/args trace independently, normalize
DB-owned fields, then reconcile replay with the captured native state. Jison
copies yy, so parser-local subgraphDepth must not be read from the original DB
as though it had been updated.

Consume a detached completion for exact DB identity/source before asynchronous
collection/normalization; mismatched source still consumes it. A receipt proves
historical completed state, not live freshness. Later common metadata clearing
or another DB construction must not alter that captured state. A new parse or
clear of the same DB invalidates its pending receipt. Unsupported nonempty
preparse metadata seeds must be rejected until source ownership is implemented.

Required lifecycle tests include fresh DB separation, global common clearing,
one-use and source mismatch consumption, wrong receiver/DB, missing clear,
failure recovery, nested construction/parse, midparse clear/config changes,
strict sanitation in both modes and retained detached snapshots after mutation.


## Normalized effects and pinned module contract

`er-db-effects.ts` now joins the collector to stored-state replay. It clones the
complete effects graph once, selects DB-stage fields by owning record index and
role, checks raw semantic values, and consumes each such record exactly once.
Group effects receive sanitation before trim; common effects receive final DB
values. Overwritten fields remain separate normalized records. Renderer-only
arguments remain unchanged, with structural validation left to replay. Returned
effects are detached/frozen without destroying shared attribute identities.
This helper assumes complete collector input; it does not authenticate source
or certify native parse completion.

Three focused tests pass: raw-source native Diagram.fromText parity in both
label modes, malformed ownership rejection, and retained shared-object identity
through normalization and replay. The fixture uses source-policy-supported
encoded inequalities and quoted group labels with break markup; raw HTML tags
are disallowed by the existing source policy. The coordinator added real
preprocessing, sanitation and identity coverage after reviewing the initial
Terra test draft. Independent review accepted bridge source
`0a602be9f7857cc2858d79364b49a121f15e01efd4c12e819442dccbb38c4486`
and final tests without material findings; no reviewer test execution.

`scripts/mermaid-er-contract.mjs` pins the native ER artifact, exports its class,
captures detached security/label/look/purifier configuration and exposes inert
native sanitizer-hook preparation. Source loading and bundled plugin support
are supplied but not yet registered in worker/build paths. Three contract tests
pass, including a real isolated module import and preparation preserving native
DB/common state and config in both label modes. The lifecycle wrapper itself
remains unimplemented.


Independent read-only review accepted the pinned contract without material
findings. Captured configuration is detached but mutable, not frozen; lifecycle
code must keep its captured copy private. Integrated evidence is in
`reports/math/er-effects-snapshot.json`. Shared Mermaid checks pass 828 tests
across 130 files; typecheck and diff checks pass.


## Native lifecycle implementation

`er-node-db.ts` now registers fresh native DB instances, requires an explicit
successful clear, and captures synchronous completed-parse receipts with source,
configuration, raw outermost callbacks and detached stored state. The empty
preparse-state check rejects unsupported metadata seeds while retaining native
direction across clear. Consumption is one-use and exact-source; a mismatch
still consumes the receipt. Raw trace comparison and normalized replay remain
separate downstream obligations.

The fixture verifies 17 scenarios, including both label modes, native raw trace
and normalized replay parity, no invented internal addEntity callback, separate
fresh DBs, shared common-state clearing, historical snapshot detachment, failed
parse recovery, wrong receiver/source/arguments/DB, preparse metadata, strict
config/default purification, midparse config changes and clear, and rejection of
thenable parser returns. It checks caught nested-parse, constructor, foreign
mutation and foreign-clear errors: none may leave a usable outer completion.

Independent review found two material defects in the first draft: caught
reentrant failures did not invalidate the outer parse (ER-L1), and foreign clears
could alter globally shared metadata (ER-L2). The final helper makes lifecycle
violations invalidate the active transaction and rejects foreign clear before
native mutation. Review confirmed both fixed at source SHA-256
`58cecbe701bb90101669ac0369f969d8deea7c58138c3e9fda1e29287d88a95b`,
with no new material findings. The reviewer inspected regression cases but did
not execute tests.

Terra supplied the initial fixture; the coordinator completed missing adversarial
and native-parity cases. The full Mermaid suite passed 829 tests across 131
files, typecheck and diff checks passed, and the final 17-case isolated fixture
passed. Evidence: `reports/math/er-lifecycle-snapshot.json`. Source/bundle
registration and public worker integration remain open; this is not release or
rendering acceptance.


## Source/state reconciliation and worker registration

`er-node-state.ts` consumes the private native completion before awaiting the
collector. It requires exact parser input and ordered raw method/argument
equality, then normalizes DB-owned fields and reconciles the captured snapshot.
It never rereads live native/common state. Independent review accepted source
SHA-256 `eaf365797d9803b820df5659f35425b91cecd210313b9fb768d502b212f0c771`
with no material finding. The isolated fixture covers both label modes, source
mismatch/one-use consumption, immediate consumption before awaiting, later live
mutation/common clearing, changed callback arguments and an extra callback that
leaves final DB values unchanged. Terra supplied the initial fixture; the
coordinator added the latter historical and adversarial cases.

The source worker now registers the ER artifact contract and initializes the
lifecycle for declared ER requests. The release worker build registers the same
pinned plugin. The worker verifies native/request types and conflicting flags,
reconciles state, and returns a dedicated plain-ER result. This avoids falling
through to the existing sequence extractor for otherwise-unrecognized types.
The existing ER source guard, including E_MATH, remains in place. No public ER
equation rendering or math payload is enabled. Source/state checks are internal
foundation for the future full adapter.

Independent review accepted worker/build changes without material findings.
913 shared tests across 150 files, typecheck and a 66-file release build pass.
Six exact source/bundled worker comparisons pass: plain grouped ER, malformed
input, original-source mismatch, mixed Info, recovery and guarded equations.
The worker hash is
`29fd5926a27bfe259d87d34c4d166f0ecbe6989e445fb2e959db2cecfc8c6375`.
The new build toolkit hash is
`b632323fc6d4d608fd6e774d49a3a92af0e8fae357323b8aa193ce9635d59183`.
Reviewers did not execute tests/builds. Remaining work includes full ER field
normalization, validation/budgets, measured rendering, transport and source maps.


## Effective field ownership design

A further read-only source review recommends a projection alongside reconciled
DB state, driven by ordered effects and exact record indices, never text matching.
This is design evidence only; no ownership projection is implemented yet.

Use field owners `{kind: record, recordIndex}`, `{kind: joinedKeys, recordIndices}`
or `{kind: empty}` for native-generated absent keys/comments. Retain every
authored record independently, even when its field is ignored or suppressed.
Entity owners need insertion ordinal/key/native ID, first name record, accepted
alias record, effective header and simple/table path, final row owners and group
suppression. Row owners retain effect index and original argument-row index.
Relationship owners retain array ordinal, effect index, endpoint record pair
and role record. Group owners retain completion ordinal, effect index and
id/title records; do not collapse duplicates to the native lookup map.

For addEntity, check name/alias roles and values against arguments. First creation
fixes the name owner. Accept an alias only when existing alias is falsy and new
alias truthy; whitespace aliases stay truthy. First creation through a relation
is still creation. Simple headers require zero final attributes and truthy
effective header; otherwise use the table path. Ignored declarations remain
authored validation inputs.

For addAttributes, recordIndices begin with declaration name and optional alias.
Decode remaining records against callback-array rows: type, name, each actual key,
and comment only when authored. Reject role/value mismatches, missing records
and leftovers. Reverse decoded rows when appending to final stored order, as
native addAttributes does. Repeated blocks append. Joined-key commas are
synthetic; an authored empty comment retains its own record instead of becoming
a generated empty field. Verify final rows against the reconciled entity.

Relationships append endpoint/role owners; endpoint records reuse the associated
addEntity records rather than charging new authored occurrences. Keep captured
native endpoint resolution: a later group cannot retroactively redirect it.
Groups append id/title owners in completion order and compare normalized ID/title
with the existing normalization bridge. Preserve duplicate IDs and empty groups.

Native getData emits groups in reverse stored order, suppresses entities whose
authored key equals any group ID, then emits other entities in Map order and
relationships in stored order. Even empty/later groups suppress same-key entity
headers and all rows. All suppressed fields still need validation.

Renderer-only questions remain: duplicate group IDs collide in layout maps;
empty-group drawing needs characterization; authored group IDs can collide with
generated entity IDs; rough drawing gives two copies per actual erBox call, not
unconditionally per stored entity. Final draw keys need reconciled ordinals and
copy roles, not authored IDs or text. Do not claim final rendered-copy counts
from this projection.

Acceptance must check exact owners for relationship-first creation, accepted and
ignored aliases, whitespace aliases, equal text with distinct origins, multiple
attribute blocks/keys, empty comments and repeated references. Include empty-group
suppression, nested/duplicate groups with distinct titles and relationships
before/after group creation. Verify all authored records remain available.


Installed single-file regression acceptance passed against this worker release,
including offline rendering of already activated families, print/source, missing
worker and MathML-unavailable fallback. Asset/reference budgets pass; timing
budgets were not run. This does not establish ER equation rendering. Exact
candidate/check hashes are in `reports/math/er-state-snapshot.json`.


## Effective field ownership implementation

`er-owners.ts` implements the projection described above. It keeps first creation
and accepted-alias owners, decodes attributes by effect/argument position and
exact record roles, reverses callback batches into stored row order, and retains
empty authored comments separately from generated empty fields. Relationship
endpoints reuse the immediately preceding authored entity occurrences. Group
owners retain completion order, duplicates and normalized title agreement.
Entity-key suppression and group display reversal match native getData. All
authored records remain available regardless of visibility.

The projection runs inside er-node-state only after parser-source, raw-callback
and stored-state reconciliation. Four focused tests assert exact record indices
and original positions for relation-first creation, accepted/ignored/whitespace
aliases, repeated attribute blocks, multiple keys, equal comments at distinct
origins, empty comments, nested/duplicate/empty groups, timed endpoint resolution
and malformed ownership. A real native getData fixture independently checks
group order, visible entity IDs and snapshot detachment.

The initial Terra test draft incorrectly treated group membership as same-key
suppression and reported success despite a failed log. The coordinator replaced
that fixture with the above coverage; no production behavior was changed to
satisfy the incorrect expectations. Independent review accepted production hash
`7dfc4651d1d3faeacad837d8f979127720e631f2e07ee0efcf9fcd271265027a`
and integrated node-state hash
`2e5c128def0ce91fbd52efb01ae9af17226bbc06cb6247d3547b9623500d2fb0`,
with no material findings. The reviewer inspected tests but did not run them.

This is effective stored/display-field ownership, not proof of final renderer
copies. Duplicate-ID layout collisions, empty-group drawing and rough erBox
copy identities remain renderer obligations. Math is still guarded. Evidence:
`reports/math/er-owners-snapshot.json`.

## Display normalization boundary

ER has five display paths: `simple-header`, `table`, `edge`,
`group-cluster`, and `group-node`. A group uses the cluster or node path only
after the native layout has selected it; authored group emptiness does not
decide that path. Group input has already passed DB sanitation and final title
trimming before display normalization begins.

Sanitizer-owned paths are the simple header and both group paths. The simple
header and group-node paths perform renderer sanitation; table and edge paths
do not. Serialization recovery is restricted to the final input of those
sanitizer-owned paths. Table and edge text receive no such recovery. Table
text additionally follows the reviewed equation-preserving generic-type planner;
plain fields must retain the native rendering path.

`er-display-normalize` and its 90-case oracle characterize native sanitation
stages only. They do not characterize browser layout, native drawing, or final
rendered copies. These helpers are not integrated, and public ER math remains
guarded.


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


## Effective display validation

`er-display-math.ts` connects projected owners to normalization candidates.
Unsuppressed entity headers use their simple/table route, attribute scalar
fields use table processing, relationship roles use the edge route, and group
titles retain both group-cluster and group-node candidates. Joined enum keys
and absent fields cannot add equations. Suppressed entity records still receive
authored validation but no hypothetical display sanitation.

Each display check replays DB and renderer witnesses from the original field
root and reconstructs provenance. Independent semantic views never become
sanitation inputs. Authored canonical text remains distinct from the per-path
display outputs. Local occurrence maxima extend the existing ledger; candidate
paths do not multiply occurrence counts. Implicit group ID/title sharing remains
limited to collector-established identity.

Native reconciliation now returns `math`, including effective candidate bindings.
This remains internal: no final layout route, persistent render copies or measured
rendering is claimed. Public ER math is still guarded. The next step must reconcile
actual native layout identities and account for rough erBox background copies
and temporary group measurement before activating the browser adapter.

The final candidate passed 852 tests across 139 Mermaid files, typecheck, a
66-file build and six exact source/bundle worker comparisons. Independent review
accepted production and final tests without material findings; the reviewer did
not execute tests. Browser/standalone and budgets were not rerun. Evidence:
`reports/math/er-display-math-snapshot.json`.


## Native prepared-graph ownership

`er-layout-owners.ts` now tags reconciled native getData entries by ordinal and
observes the prepared Dagre graph hierarchy. It preserves native graph IDs, so
Dagre's overwrite and parent semantics remain intact. Extracted cluster wrappers
recover tokens from clusterData; self-loop clones retain relationship tokens.
Unowned synthetic and phantom nodes remain explicit observations. This is a
preparation-stage bridge, not native-data authentication or a render-copy plan.

Eight pinned native cases establish duplicate-group collapse, generated entity-ID
collisions, repeated self-loop replacement, empty groups, nested groups, external
cluster edges, rough entity shape metadata and native parent-cycle failure.
The fixture authenticates Dagre and the shared layout artifact and exposes its
private cluster-state reset only inside the isolated test process. Production
helper inputs must come from reconciled getData with exact ordinal owners.

The cases correct two earlier assumptions. Explicit Dagre supplies its own
measurement function and does not call shared measureGroupLabel; that temporary
label applies only to layouts using defaultMeasureLayout. Reversed group insertion
means the earliest-completed duplicate group supplies the surviving value.
Generated entity-ID collisions can replace a group value with an entity while
retaining children; this cluster label uses native node.label, not erBox's alias
selection. Repeated self-loops overwrite fixed native segment IDs, leaving only
the last relationship label.

Follow-up rendering work must use prepared topology to select field owners and
normalization paths. In particular, an entity drawn as a cluster has raw entity
text rather than a DB-sanitized group title; existing group-candidate assumptions
are insufficient for that collision. Rough erBox draws a complete default-look
background label set plus its foreground; rough clusters retain one label.
Verify actual label invocations and later recursive JSON cloning before deriving
exact work budgets and persistent source bindings.

Independent review accepted the observer and tests with no material findings.
Tests were inspected, not executed by the reviewer. These helpers remain
unintegrated with production rendering, and public ER math stays guarded.


## Layout dispatch and retained-label planning

Native browser checks resolved a material assumption: pinned config defaults to
ELK. Both the prebuilt artifact and a fresh unpatched module bundle show it; the
final acceptance fixture uses the latter and records its SHA-256. Default ELK
retains both duplicate group titles and both repeated self-loop roles. Explicit
Dagre retains the prepared-graph winners. Both retain empty group labels once,
but Dagre draws them through a leaf node rather than the cluster selector.

The ER native contract is now version 2. Completed receipts preserve configured
layout and reject layout drift during parsing. This is configured layout, not
proof of registered-layout fallback resolution; runtime integration must also
check the resolved layout algorithm. No renderer default was changed.

`er-dagre-labels.ts` plans labels from observed Dagre winners. It preserves
background/foreground identities for rough entity headers and table fields,
selects surviving self-loop roles, and uses raw entity names when native cluster
painting bypasses erBox alias selection. The new raw-cluster text path avoids
recovering nonexistent group-title sanitation. The normalization oracle now
compares 108 native stage cases across six paths and both label modes.

Review finding ER-P1 exposed a native failure: a top-level non-extracted entity
collision has children but isGroup=false, so measurement skips it and painting
cannot position its missing element. The planner now rejects that topology.
An extracted or nested recursive collision can paint its raw name; the positive
regression checks the nested graph path and non-extracted cluster route.

Ten native topology cases verify these distinctions. Eight native browser modes
(ELK/Dagre × HTML/SVG labels × default/handDrawn) verify one/two retained copies
for table fields and simple headers, one edge role, 7/13 foreignObjects with HTML
labels and zero without, plus no network. These are ordinary-label DOM counts,
not math rendering, temporary measurement work or invocation-trace coverage.

Next prioritize default ELK ownership and temporary measurement, then integrate
layout dispatch and measured rendering for both layouts. The Dagre planner is
still unintegrated, and ER math remains guarded. Standalone math acceptance and
resource/copy accounting must follow the integrated runtime.


## Default ELK labels and planned-copy budgets

`er-elk-labels.ts` plans labels from reconciled native getData arrays with stable
ordinal tags, before ELK edge preparation and in-place paint sorting. It retains
both duplicate groups and repeated self-loop roles; native graph-map overwrites
do not erase these array entries. It verifies source fields and endpoints,
selects exact display paths and marks rough entity background/foreground copies.
Only truthy group titles have temporary group-node measurement; all groups have
a retained cluster-label candidate. Break-tag conversion for edge preparation
preserves source intervals and does not recover sanitizer serialization.

`er-copy-budget.ts` extends the authored/display ledger with planned physical
uses, separating temporary work from retained occurrences. An authored charge
covers the componentwise maximum actual use; remaining uses add their costs.
Unused/hidden authored charges remain. Only collector-established implicit group
ID/title pairs share a budget root. Review finding ER-B1 identified first-copy
credit order dependence. The fix increments sum-minus-maximum for bytes and
elements independently, yielding order-independent totals without an oversized
intermediate reservation. Tests cover unequal real normalized variants, crossed
component maxima, repeated uses and exact document boundaries. Independent review
accepted the planner and the fixed budget helper under reconciled-input contracts.

The browser probe compares unpatched and hash-pinned instrumented native bundles
across four group sources, both HTML/SVG label modes and both looks: 32 runs.
It verifies exact getData ordinals, temporary label invocations and removal, and
entry into retained cluster-label creation. Unique groups, including empty and
blank-title groups, succeed in every mode. Duplicate-ID groups succeed with the
default look but fail with handDrawn in both unpatched and instrumented bundles,
with or without empty/blank groups. All their temporary labels were removed
before the failure; retained label creation stops before the final group entry.
This is a characterized native painting failure, not a completed render or proof
of atomic cleanup. Do not treat rect-entry traces as completed retained glyphs.
No network requests occurred. Independent review accepted the instrumentation
and bounded assertions; it did not execute tests.

859 tests across 142 Mermaid files, typecheck, build and source/bundle worker
parity are recorded in `reports/math/er-elk-labels-snapshot.json`. The browser
probe uses ordinary native labels, not the Visser math runtime. Installed
standalone and asset-budget checks were not rerun. Public ER math remains guarded.

Next connect the planners at actual resolved-layout boundaries, normalize selected
paths (including Dagre raw-cluster cases), and bind measured math calls to stable
owners. ELK edge preparation must remain distinct from later semantic recovery.
Temporary math consumes work budget but must never enter retained source maps.
Handle native painting failures through the existing readable/atomic failure
contract; do not change defaults or silently discard duplicate authored fields.


## Selected-plan normalization and source locations

`er-planned-math.ts` connects reconciled ELK/Dagre plans to node-side display
normalization, authored validation, planned-copy budgets and exact source locations.
Only selected paths receive display variants; every authored field is still
validated and charged. It reconstructs plan values from source owners, replacing
caller-supplied provenance even when its text matches. It separates ELK's early
edge break conversion (`hookInput`) from the final semantic equation input.
Temporary and retained math remain separate in the returned copies and budgets.

Native fixtures now pass plans through this bridge. They verify both label modes,
Unicode/CRLF byte coordinates, repeated equal-TeX fields, Dagre's last identical
self-loop source span, and an alias hidden by a native raw-cluster collision.
Direct tests reject hidden/ignored malformed equations even with no selected
fields or a different selected alias. Inherited document budgets include authored
and temporary work. Wrong layout, mismatched mode, duplicate copy identities and
changed native input reject. Independent production review accepted this bounded
bridge; runtime coverage and transport authenticity are outside its precondition.

The next integration uses explicit field hooks rather than a shared createText
interception. The concrete native boundaries are:

- ER `draw` in `erDiagram-OPXOYQCR.mjs`: attached hidden stage and detached,
  one-call getData capture; check the actual resolved layoutAlgorithm after
  getRegisteredLayoutAlgorithm, preserving graph IDs and ordinal owners.
- Shared `createCommonLayoutRenderer` in `chunk-3FUC2YCW.mjs`: after preparation
  and before measureLayoutFn, choose the ELK array or Dagre prepared-graph plan.
- `erBox` and `labelHelper` in `chunk-7INBJB4K.mjs`: explicit header/row field
  slots and rough background/foreground slots. Bypass the entire addText path
  for math, including generic rewriting and textContent rewrites. Replace the
  TeX-source calculateTextWidth minimum with measured math geometry.
- Shared measureGroupLabel: explicit temporary slot, retaining its native
  measurement and removal lifecycle.
- Cluster rect in `chunk-UA2S7LBM.mjs` and edge label creation in
  `chunk-Z7XXMR3K.mjs`: explicit retained owner/path slots and measured bbox.

Compose these changes with existing Requirement/Kanban shape patches after
checking original artifact hashes; do not register competing loaders. Reuse
measureMermaidLabel and the staged Requirement rollback pattern. Every planned
label call must be consumed exactly once before committing; temporary work must
not become a retained source binding. Native plain branches remain native.

This source bridge imports node-side normalization and is not a browser renderer.
Browser hooks must use native sanitation and verify canonical input against the
authenticated selected-path contract; they cannot import the node purifier.
Exact native getData capture/transport and resolved-layout dispatch still need
integration. Do not read a mutable live DB after accepting a historical receipt.
Evidence for this bridge is `reports/math/er-planned-math-snapshot.json`; previous
browser/build evidence does not establish its rendering acceptance.


## Historical native graph capture (contract v3)

Completed parse receipts now include native graph data projected from a detached
stored-state clone during the synchronous parse transaction. The pinned contract
captures original getData/getSubGraphs/getCompiledStyles implementations, clones
the whole stored snapshot once, reconstructs its Maps and invokes the projector
without an ErDB constructor or common-metadata clear. Native colorIndex and
compiled-style mutations affect only that detached receiver. The graph clone
preserves nodes, edges, other and direction; later live DB or config mutations
cannot rewrite it. Native ELK/Dagre planning fixtures now consume receipt data.

The initial full-output clone proposal was disproved: default Mermaid config
contains built-in functions, including sequence font helpers. Rejecting those
would reject ordinary defaults. The implemented contract deliberately captures
graph data without config, plus an explicit planning-config projection. That
projection adds top-level nodeSpacing/rankSpacing and ER nodeSpacing/rankSpacing
to the existing security/HTML/look/layout/purification fields. Unrelated native
functions remain supported; noncloneable values within the projection fail
clearly and leave no receipt. This is not a full historical styling snapshot.

`erPlanningData` reconstructs only ER/Dagre preparation inputs. ER draw overwrites
flowchart spacing with ER spacing or 140/80 fallbacks; native Dagre then gives
top-level spacing precedence. Original flowchart defaults are irrelevant here.
Tests cover top-level overrides, ER overrides and zero fallbacks. Browser rendering
must use native full config and verify its own measured-render contract. Configured
layout still does not prove registry resolution; runtime dispatch must check it.

Review finding ER-CAP1 showed that a final config-capture callback could invalidate
the transaction after its last poison check. The fix completes final config capture
and comparison before final poison/generation checks, then publishes with no
callback-producing operation between those checks and publication. Regression
injection targets that final clone, verifies absent receipt and subsequent recovery.
This proves receipt atomicity, not rollback of an already parsed live DB.

The cheaper Terra native oracle verifies both HTML modes, exact graph parity,
compiled/direct styles, attributes, duplicate group IDs, suppressed entities,
relationship endpoints and preservation of stored/common state. Lifecycle tests
now cover 23 cases, including historical capture, clone rejection and capture-time
invalidation/recovery. Independent review accepted the ER-CAP1 fix with no new
findings. Evidence: `reports/math/er-data-capture-snapshot.json`.

Public ER math is still guarded. The next work connects this historical graph and
selected-plan bridge to resolved runtime layout, measured field hooks and source
transport. Do not cite graph-capture evidence as browser math acceptance.


## Installed runtime layout boundaries

`mermaid-er-context.ts` scopes active hook state to an attached SVG using a private
WeakMap. The graph boundary runs after native registry resolution, while the
preparation boundary is awaited after native topology preparation and before the
first label measurement. Both require the exact graph object and unchanged
resolved family/layout. Missing, repeated, reordered, overlapping and caught-failed
calls invalidate the stage. Cleanup releases context after success or failure and
rejects stale asynchronous completion. DOM commit/rollback belongs to the caller;
this module does not claim to restore native drawing mutations.

Hash-pinned patchers in `mermaid-er-build.mjs` are installed in the shared browser
build plugin. They add named imports and the two calls without replacing native
layout logic. Plain rendering has no registered context and follows native paths;
shared preparation adds one awaited no-op in that case. A future staged ER renderer
must register its context and field hooks. Public ER math remains guarded.

Review finding ER-H1 identified identity drift during awaited preparation. Both
post-await preparation and final stage success now recheck graph family/layout,
with drift and recovery regressions. Independent review accepted the fix and the
native probe's bounded assertions. The cheaper Terra worker supplied the pinned
patchers/tests; named-import integration was corrected before the bundle checks.

The native Chromium fixture builds through the real shared plugin and calls native
Diagram.render on attached SVGs. Six modes cover ELK, Dagre, unregistered-layout
fallback to Dagre, and both HTML/SVG label modes. It checks native prepared object
shape, exact hook ordering and graph identity, an async preparation gate with zero
labels until completion, exact retained node/role counts, failure propagation and
same-root context recovery. The recovery test explicitly resets the SVG: it is
not evidence of automatic DOM rollback. An inactive flowchart also renders, and
all network attempts are denied. This is ordinary-label boundary evidence, not
ER math measurement, source binding or full visual parity.

Evidence is recorded in `reports/math/er-runtime-boundaries-snapshot.json`.
Next connect staged rendering and exact owner/field/copy slots at erBox,
labelHelper, temporary group measurement, cluster rect and edge-label creation.
Math geometry must replace native source-text width decisions before layout.
Complete slot coverage and retained source maps must be checked before commit.

## Measured table field hook

The private ER context now dispatches explicit table fields only after preparation.
Each request carries the native node, header/row field, and single/background/
foreground copy. A planner supplies the expected canonical text and stable key.
The table helper checks that text against `erMathText`, replaces the entire native
`addText` operation for math, and returns mutable measured bounds before native
column/row sizing. Plain fields retain native `addText`. All active fields receive
keys; source ownership and complete slot coverage remain controller obligations.

Caught field failures poison the stage. Pending field work prevents successful
completion, and post-await checks reject stale contexts, changed family/layout,
or detached ancestry. The context still does not own DOM rollback.

The shared shape patch composes with Requirement and Kanban after authenticating
the original artifact. Independent review found ER-T1: native `insertNode` already
passes render options as argument three. The corrected hook preserves that
argument and uses argument four for copy identity; rough background recursion
passes its role explicitly. Independent recheck accepted the fix. The reviewer
found no additional material issue in the bounded runtime implementation.

Public ER math remains guarded. Simple headers, group labels, edge labels, the
staged controller, source transport and automatic rollback are still outstanding.

Next-boundary read-only investigation located `drawRect`'s `labelHelper` call in
`chunk-7INBJB4K` and the earlier simple-header source-width/minEntityWidth decision.
A measured replacement must own both decisions before native sizing. ELK's
`measureGroupLabel` in `chunk-3FUC2YCW` stores bbox then removes the temporary shape;
cluster text sizing is separate in `chunk-UA2S7LBM`. Preserve separate invocation
and budget identities. Dagre leaf groups use retained group-node labels, while
nonleaf groups use cluster labels; the reader's broad “Dagre group-cluster only”
statement was corrected against the existing prepared-layout planner/evidence.


The native table browser fixture passes eight modes (ELK/Dagre, HTML labels on/off,
default/handDrawn), with exact field inputs/order/keys, expected MathML fractions,
per-copy table-outline and row containment, row/column nonoverlap, field failure,
explicit-reset context recovery and inactive native rendering. It blocks network.
These are native table-hook assertions, not complete ER visual/source acceptance.

A syntax gap surfaced while strengthening this fixture: native ER lexer rule 13
excludes backslashes from quoted entity names/aliases; the fallback WORD token is
not accepted as an alias. A standard `\frac` alias fails before field rendering.
The successful fixture therefore uses nested powers in the header and standard
LaTeX fractions in comments. Do not claim command-based header support from it.
Resolve this grammar/normalization gap while preserving authored provenance before
public activation; numeric/private-entity encoding is not an accepted substitute
for the user's normal-LaTeX requirement. The initial worker proposed that workaround;
the coordinator rejected it, took over the fixture, and tested standard TeX.

Final fixture review required asserting the resolved native layout rather than
only recording the request. Each run now captures `data.layoutAlgorithm` and
checks equality; the eight-mode rerun passes. Review has no remaining finding
within this table-hook scope. It does not cover type/name math or the public
controller. Exact candidate/check hashes: `reports/math/er-table-snapshot.json`.

## Simple headers and normal-LaTeX lexical admission

Simple headers now use a private adapter around native `drawRect`. Its optional
label renderer supplies measured MathML bounds before native shape sizing, applies
the configured ER minimum width to that measurement, and avoids source-width
estimation and the SVG-text-only recentering step for math. Native rectangle
styling, bounds and intersections remain in `drawRect`; plain/inactive headers
follow the original branch. Lazy field requests avoid extra sanitation on inactive
renders. Active normalization uses the native decodeEntities/sanitizeText sequence.

The quoted-header command gap above is resolved by a shared hash-pinned lexical
admission patch, not a source encoding workaround. Only native INITIAL rule 14 can
redirect WORD to ENTITY_NAME. It requires at least one backslash, all backslashes
inside complete same-line native `$$…$$` spans, and no percent outside those spans.
Physical CR/LF/VT/backspace remain rejected. ER-G1 review identified Unicode LS/PS
inside a span; the fixed predicate rejects these inside math while retaining them
in surrounding text. The raw lexer bytes, positions and grammar productions are
unchanged. The admission applies wherever quoted entity names occur, including
aliases, declarations, endpoints and group headers; it is not alias-only syntax.

The node contract hook/plugin and browser renderer transform use the same grammar
patch. The node fixture compares previously valid role/comment semantics, callback
traces and intervals against a separate unpatched process. Nine admitted cases
cover command headers, matrix row breaks, prose/multiple equations, quoted names,
endpoints, group forms and BOM/CRLF/Unicode source positions. Ten rejection cases
cover ordinary/outside-math backslashes, prose percent, unmatched delimiters and
line separators. Both native receipt modes reach normal math validation; forbidden
commands retain the alias role, line and source offset in their error.

Both eight-mode native browser matrices now use actual fraction headers. Simple
headers check minimum width on geometric/default backgrounds, wide equations,
exact field keys and containment on every copy. Rough foreground paths have native
jitter and are not asserted to be exactly the nominal minimum width. Table tests
also check row/column nonoverlap and per-copy row containment. Independent review
accepted the simple-header adapter and the ER-G1 fix. Public ER math stays guarded:
group/edge hooks, staged source ownership, actual-copy budgeting, transport and
atomic commit/rollback still need integration.

## Integrated ER candidate and geometry follow-up

The historical guard above has been removed: public worker, transport, compiler,
staged rendering and exact source binding are now integrated. See progress.md's
ER public integration candidate for installed/offline evidence and artifact identity.

The follow-up geometry matrix passes 24 combinations of 320/390/1440-pixel widths,
ELK/Dagre, HTML/SVG labels and default/rough rendering. It covers tall/wide and
mixed labels, tables, self-loops, nested/connected empty groups, class-based fonts
and inline styles. It checks formula and whole-label reservations, independent
owner outlines, label overlap, sampled edge intersections and page overflow.
Network is denied. Evidence: reports/math/er-geometry-browser.log.

Two implementation defects were fixed: empty ELK groups had zero native height,
and their temporary measurement omitted final compiled font styles. A private
synchronous callback on the original measured node reserves only math-bearing
leaf groups before layout, preserves larger existing dimensions and rejects
repeat/clone/unplanned calls. Independent review found no implementation defect;
its request to cover whole mixed labels and class-based group fonts was addressed
and independently rechecked. The ELK 390-pixel screenshot was inspected by the
coordinator; this does not constitute human visual acceptance.

Focused ER/swimlane check: 25 tests across five files passed; typecheck passed.
The earlier installed candidate predates these geometry fixes. Combined installed
ER/swimlane verification remains pending while swimlane review fixes are tested.

The combined installed follow-up passed on toolkit `68f651e5f101d154303809333001c4e50dfee39ca429d02c9b703de412c11f08`. Final focused integration: 44 tests / seven files; typecheck and budgets pass. See progress.md for preserved reports and limits.
