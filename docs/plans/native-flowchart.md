# Native flowchart figure

Status: implementation authorized by the user on 2026-10-10; acceptance remains pending.
Baseline: `0db1968` on `explain-plan`, 2026-10-09. Existing untracked plans are independent work.
Owner: Visser maintainer. Implementation is authorized; commit, publication and Mermaid removal remain outside this task.

## 1. Purpose and decisions

The user wants a native flowchart with colored groupings while moving away from Mermaid.
A flowchart answers: **What happens next, and which path is taken?**
Architecture answers: **What components exist, and how do they interact?**

Use a dedicated `flowchart` figure with action, decision and terminal parts.
Reuse the native graph layout and reader infrastructure through explicit adapters.
Do not reinterpret architecture edges or add procedural meaning to architecture placement.

| Decision | Proposed first-version behavior | Reason |
| --- | --- | --- |
| Authoring | Dedicated `flowchart`, `start`, `action`, `decision`, `end`, and `flow` tags | Parts express procedural meaning without architecture roles. |
| Execution meaning | One active path; decisions select one outcome | Multiple arrows must not silently imply concurrency. |
| Grouping | Named, optionally nested groups with discrete color tokens | Groups identify phases or responsibility without changing control flow. |
| Layout | Top-to-bottom by default; explicit left-to-right option | Preserve authored reading direction across viewport sizes. |
| Folding | Existing native fold interaction, adapted for procedural groups | Large phases remain explorable without changing edge identity. |
| Math | Same explicit inline LaTeX support as other native figures | Flow labels and decisions need equations. |
| Mermaid | No new dependency; no automatic migration or removal in this feature | Retirement is a separate compatibility task. |

These are proposals for implementation, not claims about current support.
The plan chooses defaults so implementation does not need another design round.
Changes to these defaults must update their requirements and acceptance fixtures.

### Scope

Include branching, reconvergence, retries, explicit start/end nodes, cross-group flows,
nested colored groups, explanations, evidence, references, text alternatives and one-file export.
Reuse the existing figure viewer and source-preserving math behavior.

Exclude fork/join concurrency, swimlanes, subprocess expansion, multiple start nodes,
BPMN notation, execution/simulation, conditional expression evaluation, manual coordinates,
arbitrary CSS, author-supplied SVG, automatic Mermaid conversion and custom group palettes.
A multi-end flow is supported. A continuously running process without any modeled end is outside this initial contract.
Group names may describe responsibility; groups are not ordered lanes or a second membership dimension.

## 2. Repository evidence and integration boundaries

The following are inspected facts at the baseline, rather than proposed behavior.

| Boundary | Existing implementation | Required extension |
| --- | --- | --- |
| Syntax | `packages/core/src/syntax/profile.ts` enumerates block tags and math attributes | Register flowchart tags; keep identifiers, color and direction literal. |
| Validation | `packages/core/src/model/validate.ts` has tag contracts, parent lists, graph limits and family checks | Add flowchart schema and dedicated procedural validation. |
| Targets | `packages/core/src/model/targets.ts` lists component roots and extracts relationships | Register the root; extract `flow` as a relationship with stable ID. |
| Model | `packages/core/src/types.ts` permits catalogue target names | Check every serialized consumer; open-ended types alone do not establish compatibility. |
| Projection | `packages/core/src/model/project.ts` serializes family meaning | Add typed parts, conditions, grouping and flows to canonical readable output. |
| Compiler | `packages/core/src/compiler/compile.ts` dispatches figure families and graph encodings | Add flowchart adapter, list output, inspectors and conditional shape key. |
| Layout | `packages/core/src/compiler/layout.ts` uses ELK, measured labels and RIGHT/DOWN selection | Add opt-in fixed direction and shape-aware sizing/routing. Leave other families unchanged. |
| SVG/folding | `packages/core/src/compiler/svg.ts` draws graph parts and folded group proxies | Add flow shapes and group palette; preserve identity through every proxy. |
| Reader | `packages/runtime/src/reader.ts`, `figure-viewer.ts`, `reader.css` supply interactions | Reuse keyboard/viewer/fold paths; audit family-specific selectors and shape assumptions. |
| Delivery | CLI build/export and toolkit hashes already support static native drawings | Flowchart-only pages must not acquire a Mermaid asset or network dependency. |
| Guides/tests | Catalogue, `format.md`, unit/browser/integration tests and `tests/traceability.json` | Add a family guide, fixtures and requirement-bound evidence; amend visual-language guidance to distinguish group color from emphasis. |

Existing architecture groups accept `id`, `label`, `parent`, `collapsed`; they do not accept color.
Their expanded background is fixed gray. Node/edge `emphasis` currently means attention, not group membership.
Existing graph layout starts RIGHT and may choose DOWN; that rule cannot be reused unchanged for flowchart direction.
Existing target relationships require addressable IDs. The illustrative conversation omitted flow IDs; this plan corrects that omission.

The unrelated [figure meaning plan](figure-meaning-and-routing.md) remains a separate proposal.
This plan neither implements it nor treats its proposed trace routing as available infrastructure.

## 3. Authoring contract

All names below become reserved block tags only when implemented.
Existing document frontmatter, ID grammar, source spans, escaping and body rules remain in force.
Every figure, group, node and flow requires a document-unique `id`.
All parts are direct children of `flowchart`; `group` and `parent` attributes express membership.
A group body contains explanatory prose, not nested part declarations.

| Tag | Required attributes | Optional attributes |
| --- | --- | --- |
| `flowchart` | `id`, `title`, `question` | `direction="down|right"` (default `down`) |
| `group` in flowchart | `id`, `label` | `parent`, `color="neutral|teal|violet|amber"`, `collapsed` |
| `start` | `id`, `label` | `group`, `evidence` |
| `action` | `id`, `label` | `group`, `evidence` |
| `decision` | `id`, `label` | `group`, `evidence` |
| `end` | `id`, `label` | `group`, `evidence` |
| `flow` | `id`, `from`, `to` | `label`, `evidence` |

`evidence` uses existing source-ID arrays and validation. A part's body may explain its action,
outcome or evidence using the existing safe Markdown subset and detail links.
Flowchart nodes and groups always expose the useful structural summary defined in section 5.
Bare flows retain existing depth rules; empty prose or evidence sections are not required.
Add `flowchart` and its parts to applicable detail-parent and evidence rules.
Allow existing `steps` walkthroughs within the figure: their order is explicitly reading order, not execution order.

`group.color` defaults to `neutral`; every group chooses its own token, without inheritance.
`collapsed` defaults to false. Every flowchart group is foldable, regardless of its initial state.
Keep the complete foldable-group set separate from the initial folded-group set.
The baseline passes only initially collapsed groups into fold generation; flowcharts need an explicit adapter for this difference.
Color is allowed only on groups owned by a flowchart in this change.
Architecture groups retain their current contract and appearance.
No `entity`, `role`, architecture `kind`, free-form `style` or per-node color attribute is added.

A `flow` from a decision requires a nonempty `label`. Other flows may omit it.
An omitted label is not rendered as the target ID or inferred from the flow body.
Keep the authored outcome label separate from the generated target/accessible summary.
Define `TargetRecord.label` as `SOURCE — OUTCOME → DESTINATION`, using the original endpoint labels.
Use `continues to` for OUTCOME when the authored label is absent.
Keep `Relationship.label` equal to the authored label, or the empty string when absent.
Map labels use `Relationship.label`; reference menus and inspectors use the canonical target label.
Group proxies retain the original endpoint names in target labels, not the names of their temporary summary boxes.
Generated names are not source-owned text; copied source and quote spans still refer to authored content.
The existing target-label fallback uses body text and must not become a rendered condition.
Decision labels describe outcomes, not executed conditions. Visser does not parse or evaluate them.
Group labels, node labels, flow labels, titles, questions and supported prose accept existing inline math syntax.
Color, direction, reference attributes and IDs remain literal. Block equations obey the existing permitted-parent policy.

### Complete figure example

Place this fragment in a valid Visser document. It is a future syntax fixture, not executable on the baseline.

```markdown
{% flowchart id="order" title="Validate an order before fulfilment" question="When can an order proceed?" %}
One order follows one path. A corrected order is checked again.

{% group id="validation" label="Validate" color="teal" /%}
{% group id="resolution" label="Resolve" color="amber" /%}

{% start id="received" label="Order received" /%}
{% action id="check_order" label="Check order" group="validation" /%}
{% decision id="valid_order" label="Order valid?" group="validation" %}
The order needs an address and at least one item.
{% /decision %}
{% action id="correct_order" label="Request correction" group="resolution" /%}
{% end id="ready_order" label="Ready for fulfilment" /%}

{% flow id="f_received" from="received" to="check_order" /%}
{% flow id="f_checked" from="check_order" to="valid_order" /%}
{% flow id="f_valid" from="valid_order" to="ready_order" label="Yes" /%}
{% flow id="f_invalid" from="valid_order" to="correct_order" label="No" /%}
{% flow id="f_retry" from="correct_order" to="check_order" label="Correction received" /%}
{% /flowchart %}
```

The correction action includes waiting for the correction; its completion is qualified by the flow label.
The chart does not claim every invalid order will eventually be corrected.

## 4. Procedural semantics and validation

The chart describes possible paths through one process instance. It does not execute the process.
Following an action's outgoing flow means that action completes and the next part is entered.
A labeled non-decision flow qualifies that transition; an unsatisfied qualifier may leave the process waiting.
At a decision, exactly one applicable outgoing outcome is selected for a particular traversal.
Authors are responsible for outcome completeness and exclusivity; label uniqueness cannot prove either.
Multiple incoming flows are alternative arrival paths, not a join or synchronization barrier.
Groups have no execution semantics. Source order breaks layout and list ties; it does not impose execution order.

| Part | Incoming | Outgoing | Validation |
| --- | --- | --- | --- |
| Start | Zero | Exactly one | Exactly one start in the figure. |
| Action | At least one | Exactly one | Use a decision for alternatives; no implicit fork. |
| Decision | At least one | At least two | Each outgoing label is nonempty and unique after trimming and collapsing whitespace; comparison is case-sensitive. |
| End | At least one | Zero | At least one end in the figure; multiple outcomes may end separately. |

Degree counts include self-edges and parallel edges. Distinct decision outcomes may target the same next node.
A decision self-loop is valid when another outcome exits; incoming traversal cannot originate from an unentered node.
Action self-loops are structurally possible but trigger the no-exit warning below when they cannot reach an end.
Do not apply DAG validation to procedural flows. Group-parent relationships must remain acyclic.

Hard errors use existing codes where their meaning fits:

- `E_SYNTAX`: unknown tags/attributes/enums, missing IDs, wrong nesting and malformed attribute types.
- `E_ID_DUPLICATE`: document ID collisions, including flows.
- `E_REF_BROKEN`: wrong-kind or cross-figure endpoints, group parents/membership, or invalid evidence targets.
- `E_SEMANTIC`: invalid degrees/start/end cardinality, missing/duplicate decision outcome labels and cyclic group parents.
- `E_LAYOUT_LIMIT`: inherited native graph caps are exceeded.

Warn with target-local diagnostics rather than silently removing valid parts:

- Proposed `W_FLOW_UNREACHABLE`: a node is not reachable from the start.
- Proposed `W_FLOW_NO_END_PATH`: a reachable node has no path to an end.
- Existing `W_VISUAL_DENSITY`: apply the native visible-node rule, including collapsed group counts.
- Review guidance flags vague outcomes and questions whose branches overlap; no automated truth proof is claimed.

Compute reachability once forward from start and once backward from ends using adjacency lists.
Report warnings in source order. Do not enumerate all paths or unroll loops.
Validation phases are deterministic:

1. Collect schema/type/ID errors. Duplicate document IDs suppress topology checks because identity is ambiguous.
2. For schema-valid parts, validate endpoint kinds, ownership, group references and evidence references.
3. A figure with a schema or reference error skips all degree/cardinality/group-topology checks and reachability warnings.
4. Otherwise count every authored flow, including parallel and self-edges, for degrees. Validate group cycles/nonempty groups and degrees/cardinality.
5. A figure with a hard semantic error skips reachability warnings. Only a structurally valid figure runs both reachability passes.

Other valid figures are still checked. Missing decision labels belong to the semantic phase.
For a decision with one missing endpoint, report that reference error; do not invent a degree error or unreachable warning.
For a start whose only flow has an invalid destination, use the same rule.
Semantic checks may report independent faults together, but do not traverse a cyclic group-parent hierarchy to test nonempty membership.
An empty group is an `E_SEMANTIC` error; recursive membership must contain at least one node.
A group cannot itself be a flow endpoint. A node has at most one direct group; nesting supplies ancestors.

Reuse the current 200-node/400-edge hard caps and warning above 25 visible nodes.
Count start/action/decision/end toward the node cap and every authored flow toward the edge cap.
The document target cap bounds total authored records; the parser's literal-depth limit does not bound group-parent chains.
Existing folding enumerates combinations of endpoint ancestors outside the layout worker timeout.
Neither the node cap nor that timeout alone establishes a safe group/fold budget.

W0 must measure and fix flowchart-only bounds for group count, parent-chain depth,
proxy combinations, geometry work and serialized output before W1 starts.
Record the selected values, fixture sizes, time/memory/output evidence and acceptance boundaries.
The maintainer approves that bounded resource contract as W0 output; do not invent limits in later tests.
Reject excess complexity with `E_LAYOUT_LIMIT` before recursive layout or proxy allocation.
Count prospective proxy combinations with saturating arithmetic; do not allocate them to discover their size.
Bound post-layout geometry/fold work separately, with cancellation or deterministic work accounting.
Do not raise shared limits or reuse the layout worker timer as evidence for main-thread work.

## 5. Visual and interaction contract

### Shapes and direction

- Start/end: pill shapes, with a visible small “Start” or “End” cue as well as the authored label.
- Action: rectangular shape with modest corner rounding.
- Decision: diamond with label centered inside its usable interior.
- Flow: solid directional arrow; every decision outcome appears beside its own outgoing path.
- Group: labeled rounded boundary with a subtle color tint; nested headings occupy separate reserved bands.

Direction is a fixed preferred rank axis, not a promise that every edge advances along that axis.
Default direction is DOWN; `right` requests RIGHT. Neither changes when the viewport narrows.
For a simple ungrouped acyclic chain, node centers advance down or right in source-to-destination order.
Loops, self-edges and group constraints may produce routes that oppose the preferred axis.
Do not impose a global monotonic-edge rule or infer a main path from cycle-breaking decisions.
“Arrow direction” means the path starts at `from` and its final tangent/arrowhead enters `to`; it does not mean positive screen coordinates.
Use the native viewer, scrolling and textual presentation instead of relaying out a different process on mobile. On narrow touch screens, the first tap on an interactive block or group opens its shared detail sheet immediately, entering the viewer in the same action. Closing details or pressing Escape returns directly to the article after a direct part tap. In a viewer opened explicitly or from its background, closing details keeps the viewer open. A background tap opens only the viewer; dragging pans without opening details. This interaction was explicitly requested during implementation review on 2026-10-10.
The renderer aims to keep return flows outside forward paths. This is a layout goal, not a guarantee of planar drawings.
Do not describe a “main path” unless the author names one in prose; Yes/No receives no hidden priority.
Edge crossings may occur. An unmarked crossing never denotes a connection.
Arrowheads must touch their actual destination outline, including diamonds and pill curves, not an enclosing rectangle.

Measure text and math before layout. Include padding, shape geometry and terminal cues in node dimensions.
For diamonds, derive the necessary interior from measured label corners, not just its rectangular width.
Reserve edge-label space and keep labels attached to their original flow IDs.
Keep whole equations atomic; expand their owner or use existing overflow/fallback behavior without cropping or shrinking math independently.

### Colored groups

Use theme-owned tokens for `neutral`, `teal`, `violet` and `amber`.
Define separate fill, border and label tokens for light/dark themes; never accept arbitrary CSS colors.
Tokens distinguish groups without assigning success/failure/status meanings.
Same-colored groups remain distinct named regions. Descendant nodes do not inherit a semantic color or role.
Start/action/decision/end shapes remain recognizable inside every tint.

Group names, borders and text membership carry meaning when color is absent.
Forced-colors mode uses system colors and visible boundaries. Print remains understandable in grayscale.
Meet the repository accessibility contrast requirements.
Where unspecified, propose 4.5:1 for normal text and 3:1 for meaningful boundaries and focus cues.
Test actual composited nested fills rather than checking palette swatches alone.
Avoid opacity-based nesting that gradually erases label contrast.

### Selection, click targets and right sidebar

Clicking any start, action, decision or end opens its details in the existing right sidebar on wide screens.

Implementation reuses the existing inspector, not only its visual styling.
Extend canonical detail generation in `packages/core/src/compiler/compile.ts` for flowchart content.
Route target activation through the existing `reader.ts` inspector lifecycle, including `ensureInspector` and `showDetail`.
Reuse its host, state, history, Back/Close, Locate, Copy reference, focus restoration and responsive surface selection.
Do not create a flowchart sidebar component, parallel inspector state, duplicate detail DOM or separate navigation stack.
Reuse `.vs-inspector` and `.vs-detail-section` styles; add only content-specific rules where existing rules cannot express the content.
Keep flowchart-specific data and fold handling behind explicit adapters; do not fork the shared inspector lifecycle.

The complete visible node shape and label form one target. Decorative depth cues are not separate targets.
Clicking an expanded group heading, boundary or unoccupied tinted area opens that group's details.
A collapsed group replaces its expanded boundary with one compact colored container, retaining the group name, step count and an embedded Expand icon. Incoming and outgoing flow proxies dock to that compact container. The expanded boundary is hidden; folding does not create an extra node inside it. Clicking the compact container opens the same group details. Its separate Expand control unfolds the group.
The Fold control only folds; it does not also select or open details.

Use disjoint event handling: a node, nested group, flow or control wins over its ancestor group's surface.
Do not place a clickable overlay above descendants. Prevent bubbling from opening ancestor details.
Flows retain the existing depth policy: an inspectable flow opens its original flow inspector, including on a proxy route.
A bare flow remains addressable through reference and relationship interfaces; clicking its path must not select the group behind it.
This update requires structural summaries for nodes and groups, not empty inspectors for every bare flow.
A pointer drag that pans or scrolls must not select an item on release.
Clicking another item replaces the sidebar content through existing inspector history behavior.
Clicking the already selected item keeps its details open. Close clears selection and restores focus to the origin.
If folding hides that origin, restore focus to its nearest visible group control.
A folded child selection retains its original identity in the sidebar; mark its containing summary as containing that selection.
Do not mislabel that summary as the selected group.
The current reader's `addFolds` closes details when the selected target becomes hidden.
W3 must override that behavior for flowcharts while preserving other families' existing behavior.
Retain the original inspector target ID and content; folding moves focus to the visible fold control.

Every node and group offers meaningful structural details even without authored prose.
Show its kind, label and containing group path. Node details list incoming and outgoing flows with original endpoint labels.
Decision details keep outcome labels visible beside destination links.
Group details show authored explanation when present, parent path, member steps and cross-boundary flows.
Nested membership retains group headings. Folding does not remove members from these details.
Do not fabricate prose, evidence, execution status or an empty explanation section.
Sidebar member links select that original target; hidden targets reveal their containing groups before locating them.
Reuse existing Back, Close, Locate and copy-reference actions, including their focus behavior.
Reuse the inspector's existing labeled Copy reference button; the math copy icon is a separate control.

Visual states make inspection discoverable without relying on hover:

- Reuse the existing depth bars: two bars for explanation or useful context, one muted bar for sources only.
- Treat the required structural summary as context when it adds information beyond the visible label.
- Add no new document icon or generic details badge; retain an accessible target name on the whole target.
- Reuse the existing blue hover outline at 0.35 opacity and selected outline at 0.8 opacity, both 4 px.
- Preserve the original boundary, phase tint and procedural shape beneath these external markers.
- Reuse the separate 2 px blue keyboard focus outline, dashed for rectangular boundaries. Selection and focus may coexist.
- Keep depth bars and Fold/Expand controls spatially separate; controls retain independent accessible names.

Match `Reader UI and figure parts` in Penpot and the existing `.vs-inspector` styles in `reader.css`.
Use the standard 1 px border, 6 px radius, soft shadow, 18 px title and compact section headings.
Keep kind and depth in the title, standard Back/Close buttons and the existing footer actions.
Do not add a separate uppercase eyebrow, selection-status stripe or custom icon-only Close action.
Show only meaningful content sections; do not invent an Evidence count for illustrative prose.

The right sidebar must leave the selected shape visible or reachable through the existing figure viewport.
At narrow widths, reuse the existing inspector dialog/local detail and viewer sheet behavior; do not squeeze in a desktop sidebar.
Touch activation requires no preliminary hover. Keyboard activation exposes the same target and summary.
Provide separate keyboard stops for group details and folding, without making every decorative shape a stop.
Honor existing accessibility target-size and contrast rules; do not use a tiny cue as the sole hit area.

Penpot page `Visser — Flowchart · visual design` records these proposed visual states.
The click-target and sidebar boards are static specimens, not evidence of working runtime interactions.

### Folding and exploration

Reuse existing folding controls and focus restoration. A collapsed group reads “Group label · N steps”.
Its appearance remains a group summary, not an action or decision.
Preserve every cross-boundary flow as a separately addressable relationship, including parallel flows and outcome labels.
Internal flows disappear only from the folded map, not the relationship list or source projection.
No proxy may turn an exit/re-entry loop into an apparent terminal path.
When both endpoints are inside one collapsed group, keep the flow internal; it is not a summary self-edge.
Ancestor folding dominates child folding without losing each child's state when the ancestor reopens.

Following a deep link to a hidden part opens its containing groups and brings the target into view.
A flow inspector retains original endpoints even when its visible route uses group proxies.
If fixed geometry cannot support a fold configuration without ambiguous routing, W0 must resolve it before the fold feature ships.
Do not silently drop links or substitute aggregate outcome counts.

## 6. Model, compiler and delivery design

Build a validated `FlowchartModel` (name proposed) from parsed targets before adapting to layout.
Keep semantic parts and flows independent from rendering rectangles and folded proxies.
Each part retains ID, kind, label segments, source span, evidence, body and group membership.
Each flow retains ID, original endpoints, optional label segments and evidence.
Groups retain parent, color and initial collapsed state. Figure direction belongs to layout input.

Extend the native graph input with opt-in shape/direction metadata rather than guessing from labels.
Keep that metadata optional so other graph families retain existing defaults and geometry.
Layout worker serialization and deterministic cache/build inputs must carry the added values.
No browser typesetting or layout engine is introduced for ordinary flowchart geometry.
Math retains the existing bundled renderer, resource limits and readable source fallback.

Add shape-aware size calculation before ELK and outline-aware endpoint docking after routing.
Validate finite coordinates, arrow direction, owner containment and edge identity after layout.
Apply the same checks to generated fold routes. Detect path/label intersections with unrelated owners.
If routing cannot satisfy these invariants within its budget, reject the map through the existing layout-failure path.
Strict mode fails without publishing; explicit fallback mode shows the complete text alternative and notice.
Dense nonplanar input may therefore fall back or fail; no promise of collision-free layout for every admitted topology is made.
Audit self-loop placement and folded-proxy routes: both currently use graph geometry and cannot be assumed correct for diamonds.
Use the existing layout timeout/failure policy. In supported fallback mode, preserve the complete text alternative and show a failure notice.
In strict build mode, a layout failure must not publish partial output or overwrite a previously valid export.

Add `flow` relationship kind and native figure/part registrations across all consumers.
Audit compiler dispatch, figure shell, inspector, relationship lists, evidence discovery, references,
quote extraction, semantic Markdown, projection hashes, target listings, `read`, `refs` and guarded replacement.
Do not alias flow relationships to architecture `control` edges.
Treat group color, direction, membership, kinds and labels as authored changes in projection/build identity as appropriate to existing contracts.
Inspect JSON schemas and CLI report schemas before deciding whether an additive schema revision is needed.
An open `kind` string alone is insufficient evidence that every consumer supports a new family.

An old CLI rejects new tags through its unsupported-syntax path.
A new CLI can select an older toolkit's browser assets, so parser support alone is not a compatibility check.
Ship a versioned flowchart reader-contract marker in both `reader.js` and `reader.css`.
After existing asset integrity checks, flowchart builds require compatible markers in the selected assets.
Missing or incompatible markers produce `E_INTEGRITY` with an instruction to select a compatible toolkit.
Use one shared check for build, serve and HTML/site export; direct compiler callers supply validated capability evidence.
A flowchart document must fail before output replacement if that evidence is missing.
Documents without flowcharts do not require the marker. Do not add a new external script or asset solely for this check.
W0 fixes the marker encoding/version policy and tests its retention in built/minified artifacts.

Old documents keep the same meaning and existing hash-vector rules. Do not migrate source automatically.
Pinned older toolkits remain usable for older documents. Rebuilding with a newer toolkit may change build identity.

### Text, mobile, accessibility and print

Canonical text names the figure kind and direction separately from execution meaning.
List every group and its parent; list every part with kind, group and original label.
List each flow as “source — outcome/continues to → destination” with stable reference identity.
List order is source order; explicitly say branches and loops are defined by flows, not list order.
The default text view must not invent a linear numbered execution sequence.

Reuse current native narrow-screen cards/lists and viewer. Every outcome stays readable on a 320 px viewport.
Keyboard users can reach all parts and flows through the text/relationship interface, including bare parts without inspectors.
Retain focus after inspector/viewer close and fold operations. Controls need names and visible focus.
Screen-reader output identifies start/action/decision/end and original destinations, not generated SVG path content.
Avoid duplicate announcements between map, generated math and source alternatives using current reader conventions.

No-JS pages, print and text view expose the complete process, including initially collapsed groups.
Follow current native print policy: complete readable lists are authoritative; rendered print diagrams are not required here.
Math in print retains current readable LaTeX source behavior. Color names alone never explain a branch or group.
Standalone exports inline required assets and work from `file:` with the network denied.
Flowchart-only pages must contain no Mermaid asset, parser or generated Mermaid markup.

## 7. Requirements and acceptance map

Requirements are authorized for implementation. Source: the user's native-flowchart/group-color request and the design decisions above.
Owner for every row: Visser maintainer. Verification IDs refer to section 9.
Requirements become implementation acceptance obligations when implementation is authorized.

| ID | Obligation | Verification and success criterion |
| --- | --- | --- |
| FC01 | The parser shall recognize the authoring contract in section 3. | T01 accepts valid fixtures and rejects each invalid attribute/parent/type case. |
| FC02 | The model shall enforce the procedural degree rules in section 4. | T02 checks each valid boundary and one-beyond case with target-local diagnostics. |
| FC03 | Every authored flow shall retain its ID and original endpoints across views. | T03/T06 compare model, map, proxies, lists, inspectors and exports against fixture expectations. |
| FC04 | Procedural cycles shall remain representable without unrolling. | T02/T04 render a retry and self-loop with unchanged topology. |
| FC05 | Reachability warnings shall identify unreachable and no-end-path nodes. | T02 matches independent expected node sets without claiming termination proof. |
| FC06 | Groups shall preserve named hierarchical membership. | T01/T03 check nested, empty, invalid-parent and cross-figure fixtures. |
| FC07 | Flowchart groups shall support the four declared color tokens. | T05 checks all tokens, defaults and unsupported-value rejection. |
| FC08 | Group meaning shall remain readable without color. | T05/V02 verify labels, borders and textual membership in grayscale/forced colors. |
| FC09 | Node shapes shall visibly distinguish actions, decisions and terminals. | T04/V01 check shape, terminal cue and contained labels. |
| FC10 | Layout shall use the declared preferred rank axis without viewport-dependent switching. | T04 checks layout inputs, acyclic-chain center order, and identical cycle geometry across desktop/mobile. |
| FC11 | Rendered paths and labels shall preserve flow identity without obscuring unrelated nodes or labels. | T04 geometry assertions plus visual baselines cover retry, nesting, parallel outcomes and dense routing. |
| FC12 | Folding shall preserve all cross-boundary flow references and labels. | T06 tests nested folding, hidden deep links, parallel crossings and focus recovery. |
| FC13 | Native math support shall apply to flowchart human-readable surfaces. | T07 inventory covers success, no-JS, renderer failure, wide math and print. |
| FC14 | Text alternatives shall preserve the complete process topology. | T03/T08 compare exact parts, memberships and labeled flows against source. |
| FC15 | Keyboard and assistive interfaces shall expose each original part and flow. | T06/V03 exercise references, inspectors, viewer, fold controls and focus. |
| FC16 | Standalone flowchart export shall operate without external requests. | T08 opens a relocated single file with network denied and confirms the asset inventory. |
| FC17 | Existing native families shall preserve their authoring semantics. | T09 checks old fixtures, hash vectors and architecture group behavior. |
| FC18 | Failed compilation shall preserve the prior valid output. | T10 injects syntax/layout/resource failures through build/export paths. |
| FC19 | Flowchart resource use shall obey the explicit resource contract frozen in W0. | T10 exercises exact node/flow/group/depth/proxy/work/output bounds and one-over rejection without raising shared limits. |
| FC20 | Authoring guidance shall distinguish flowcharts from architecture and traces. | V01/T11 compare task selection and compile every documented example. |
| FC21 | Flowchart compilation shall reject incompatible reader assets before publication. | T08/T09/T10 verify new CLI with old/mismatched assets, both delivery formats and unchanged prior output. |

### Selection requirements added after visual review

Source: the user's request for clickable blocks and groups with right-sidebar details.
Owner: Visser maintainer. Status: implementation authorized by the user on 2026-10-10.

| ID | Obligation | Verification and success criterion |
| --- | --- | --- |
| FC26 | Activating a flowchart node or group shall open that original target's details. | T12 checks each node kind, expanded groups and collapsed summaries, including targets without prose. |
| FC27 | A group Fold/Expand control shall change folding without opening group details. | T12 checks pointer and keyboard activation while another target is selected. |
| FC28 | Descendant activation shall select only the deepest activated target. | T12 checks nested groups, nodes, flows and controls; pan/scroll release selects nothing. |
| FC29 | The reader shall display matching selection cues on the diagram and in the details surface. | T12/V02 compare hover, selection, keyboard focus, target changes and hidden-selection indicators. |
| FC30 | Node and group details shall retain their structural context without authored prose. | T12 compares kinds, paths, members and original flow endpoints with independent fixture expectations. |
| FC31 | Closing details shall restore focus to the activating target or its nearest visible group control. | T12/V03 check visible, folded and narrow-screen origins using keyboard and touch. |
| FC32 | Flowchart details shall use the existing shared inspector lifecycle and responsive surfaces. | T12 plus code review confirms shared host/state/history/actions and no parallel sidebar implementation. |

## 8. Implementation work packages

One writer owns a shared file set at a time. Workers may inspect dependencies but must not delegate.
Do not use file-count-driven parallelism for compiler/model/layout files shared across packages.
Suggested routes are cost guidance, not authorization for a particular active model or effort.

| Package | Work and permitted implementation scope | Dependencies | Acceptance / stop condition | Suggested route |
| --- | --- | --- | --- | --- |
| W0 feasibility | Disposable flow layout/shape/fold probes; schema/consumer audit; fixture designs | Plan authorization | Prove retry/diamond/parallel/fold feasibility; freeze measured group/depth/proxy/work/output bounds and capability marker contract before W1. | Sol for coupled design; bounded Terra evidence tasks. |
| W1 vertical slice | Syntax/profile, validation, target model, compiler adapter, projection; minimal start/action/end; plain text and native map | W0 | One real document builds, reads, references and exports offline with complete IDs. T01/T03/T08 slice passes. | One Sol or informed Terra writer. |
| W2 branches and routing | Procedural validation, shape measurement, direction, loop routing and relationship labels | W1 | T02/T04 pass before adding group complexity. No hidden fork or loop unrolling. | Sol; bounded Astra Medium advice only for a concrete hard invariant. |
| W3 colored groups and folds | Group validation, palette, nested geometry, fold proxies and reader integration | W2 | T05/T06/T12 group-selection slice passes with all crossing edges preserved; shape/flow meaning survives forced colors. | Terra for palette; Sol for folded topology. |
| W4 complete surfaces | Math fields, canonical detail content for all nodes/groups through the existing inspector, selection hit areas and cues, reference selection, viewer, no-JS/mobile/print and CLI/schema gaps | W3 | T03/T06/T07/T08/T10/T12 pass on the integrated candidate. | Bounded Terra work with strong fixture oracles. |
| W5 guides and acceptance | New catalogue guide, format/routing/visual-language guidance, architecture docs, traceability, automated matrix and human exercise | W4 | T09/T11 and V01–V03 recorded; independent implementation review findings resolved. | Terra author; separate Sol review. |

W0 is a bounded feasibility gate, not an open-ended attempt to perfect every diagram shape.
If it cannot preserve folded topology, stop that package and amend the design with the user before dropping folding.
Do not extend Mermaid adapters as a workaround. Do not spend implementation time on unrelated deferred Mermaid failures.

Rollback is source-level: retain older toolkit support and revert the additive feature if necessary.
New flowchart documents require a capable toolkit; rollback does not silently convert them to architecture or Mermaid.
Build/export uses existing atomic replacement and guarded-source-edit rules. No persistent source migration is planned.

## 9. Verification and validation

### Automated suites

| ID | Fixtures / exercised path | Independent oracle |
| --- | --- | --- |
| T01 syntax/schema | Valid minimal/full examples; all enum values; missing IDs; unknown tags/attrs; wrong parent/type; cross-figure refs; group cycle/empty group; duplicate IDs | Hand-authored accepted model and exact diagnostic target/code sets. |
| T02 control flow | One/multiple starts; no end; terminal exit; action fork; decision missing/repeated outcome; merge; retry; decision self-loop; disconnected cycle; reachable closed cycle | Fixed adjacency/degree tables and reachable sets; mixed broken-reference/start/decision cases produce only the specified phase diagnostics. Tests do not call production validation to calculate expectations. |
| T03 identity/projection | `read`, JSON/Markdown export, references, evidence, source spans, guarded replace; label/color/direction edits; unlabeled self-closing and body-bearing flows in every view | Exact ordered IDs, semantic tuples, original source quotes, authored span boundaries and unchanged IDs after non-ID edits. |
| T04 geometry | Both directions; diamonds with multiline/math labels; pills; 2/3-way decisions; parallel edges; return cycles; nested groups; long outcome labels; shared destinations | Independently measured text/ink bounds; shape containment; segment/outline intersections; original endpoint mapping; simple-chain center order and cycle/self-loop source-to-destination docking. Allow edge-edge crossings, not paths through unrelated owners; failed geometry uses the declared strict/fallback path. |
| T05 palette | Neutral/teal/violet/amber; every nested parent/child combination; same colors; light/dark/forced colors; grayscale print | Computed contrast and visible boundaries/labels against the stated thresholds; invalid arbitrary colors rejected. |
| T06 interactions | Initially expanded and initially collapsed groups both have fold controls; fold parent/child in both orders; original endpoints share/differ in collapsed ancestors; hidden deep links; keyboard and touch viewer; copy selection/reference; close/focus | Authored topology remains complete in lists; each visible boundary-crossing flow maps once to original ID; expected focus target and copied source. |
| T07 math fields | Figure title/question; group/node/flow labels; bodies; details; folded labels/proxies; lists/inspector/viewer | Source-owned TeX and geometry oracles; rendered/worker-failure/no-JS/long/print matrix; no formula lost or assigned to another target. |
| T08 delivery | Installed-toolkit HTML and site export; relocated one-file `file:`; JS disabled; network denied; restored print state | No HTTP requests or missing sibling files; complete model-derived lists; expected assets and valid flowchart contract markers only; no Mermaid asset for flowchart-only pages. |
| T09 compatibility | Existing graph modes, transform, trace, domain, folding, math and reference fixtures; old hash vectors and pinned toolkits; new CLI with pre-feature reader JS/CSS | Existing documented semantic/hash expectations remain valid; new schema behavior is explicit, not an unreviewed golden rewrite. |
| T10 resource/recovery | Exact 200-node/400-flow boundaries; W0 group/depth/proxy/work/output caps and one-over fixtures; flat parent chains; disjoint deep endpoint ancestors; timeout/geometry failure; malformed source | Deterministic diagnostics, bounded existing worker behavior, no partial publication, byte-identical prior output on failure. |
| T11 authoring guide | Minimal example, colored retry example, nested group example and anti-examples | Compile all promised examples; invalid examples produce the documented diagnostic or review finding. |

T12 — Selection and details: exercise every node kind, nested/expanded/collapsed groups and prose-free targets.
Assert the sidebar's target ID and semantic content after whole-shape, label, group-background and member-link activation.
Assert Fold/Expand does not replace an existing sidebar target; child activation never opens a parent.
Verify pointer drags scroll/pan without selection, and keyboard focus survives close, folding and hidden-target references.
Fold a selected child directly and through an ancestor; retain its inspector ID and show the containing-selection indicator.
Test inspectable flow activation separately from bare flow paths; neither activates an enclosing group.
Compare selected, hovered and focused appearances in light/dark and forced colors.
Exercise the right sidebar on wide screens and existing narrow-screen detail surfaces, including offline exports.
In one document, navigate between an existing native target and a flowchart target through detail links.
Verify a shared inspector host within each surface mode, correct Back history, standard actions and no duplicated detail IDs.
Repeat through the existing narrow-screen inspector and figure viewer to check responsive lifecycle reuse.
Code review rejects a separate flowchart sidebar, navigation stack or copied inspector lifecycle.
Fail the tests if parent bubbling is enabled, selection is assigned to a folded proxy, or a bare target loses its summary.

Use stable fixture IDs and connect every FC requirement to actual test cases in `tests/traceability.json`.
Generate geometry expectations independently from renderer helpers. A snapshot alone cannot prove endpoint identity or source fidelity.
The tests must fail if one branch label is swapped, a reverse edge becomes forward, or a folded flow disappears.
Use targeted mutation checks for these three invariants before declaring the test oracles adequate.

Required browser coverage: desktop and narrow mobile in the configured browser matrix, both orientations,
light/dark, reduced motion where transitions exist, forced colors, no-JS and print.
Include 200% zoom, keyboard-only access and the 320 px narrow layout.
Do not claim physical touch or assistive-technology validation from emulation alone.

Run focused checks per package. Run the retained integrated unit/browser/integration suite once at the final candidate.
Reuse the math task's documented Mermaid retirement scope only where the exact deferred cases remain applicable.
Record every excluded/skipped case and reason; do not invent a broader Mermaid exemption.
Run typecheck, build, offline, budgets, installed/clean-machine export and contract checks for the changed artifact.
Do not rerun unchanged full suites merely while waiting for human feedback.

### Human validation

V01 — Author and interpret: author the same branching retry example as architecture and flowchart.
Confirm the flowchart makes the next step and return path clear. Ask a reader to identify both outcomes,
the rejoin behavior and why two incoming flows do not wait for each other.
Review a three-outcome decision to avoid overfitting to Yes/No. Record misconceptions and corrections.

V02 — Visual baseline: review the colored nested-group fixture in both directions, light/dark,
narrow screen, zoom, grayscale and forced colors. Check shape meaning, group headings,
condition placement and actual arrow endpoints. Check discoverable click targets, selected group boundaries and the matching right sidebar. Inspect a representative no-JS/print alternative.

V03 — Reader interaction: use keyboard and one real touch device to reach a hidden branch,
follow its reference, open/close details, copy a flow reference and restore focus.
Select a block, an expanded group and a collapsed group; distinguish inspecting from folding without instruction.
Check bare-target summaries and opening a hidden member from the sidebar.
Use a named screen reader/browser combination to read the outcomes and their destinations.
Record device, browser, assistive software, candidate identity, observations and result.

The purpose is evidence of comprehension and access, not completion of a checklist by an agent.
If the user waives a manual exercise, record its scope and authority; never record it as performed or passed.
The preceding math acceptance waiver does not automatically apply to this new figure.

## 10. Completion and evidence

Create `docs/validation/native-flowchart/` during implementation, not as empty planning scaffolding.
Keep a small requirement/test map, decision log and completion record. Store generated reports under `reports/flowchart/`.
Record source-input digest, toolkit identity and exact test report/artifact hashes at the verified candidate.
A later UI delta receives separate targeted evidence; do not relabel old reports as a current full-suite pass.

| Gate | Complete when |
| --- | --- |
| C01 contract | W0 decisions, syntax, semantics, compatibility and resource behavior are resolved. |
| C02 implementation | FC01–FC32 have passing retained-scope evidence; no silent missing surface. |
| C03 verification | Required automated suites pass on the recorded candidate with explicit skip/exclusion inventory. |
| C04 review | Separate implementation review resolves all blocking/material findings against the final snapshot. |
| C05 validation | V01–V03 record human outcomes, or an explicit user waiver identifies each unperformed exercise. |
| C06 delivery | Guides compile, W5a prompt checks pass, standalone works offline, old document behavior is preserved and recovery tests pass. |

A plan review satisfies neither implementation review nor human validation.
A native flowchart does not complete Mermaid retirement. Inventory remaining Mermaid uses and migrations in a separate task.

## 11. Authoring prompts and math guidance

Added after the initial plan review, at the user's request to cover how Visser selects
and uses the new figure and the already implemented math support.
This section extends the implementation scope and acceptance gates.
It does not make the proposed flowchart syntax available in today's authoring prompts.

### Observed prompt gaps

`skills/visser-visual-explain/SKILL.md` routes components by reader question.
It has no flowchart row and no math-selection guidance. Its general instruction
“Label each relationship with what it does” conflicts with optional ordinary flow labels.
The architecture/trace/state/plan distinctions also need to include procedural branching.
The existing `decision` catalogue entry describes a decision-record document, not a decision diamond.

`references/format.md` section 10 already documents working math syntax, escaping,
numbered equations, references, unsupported commands, fallback and source-based printing.
It does not teach when equations improve an explanation or how to validate their meaning.
The staged review covers units and conditions generally, but does not explicitly test equation
interpretation, symbol definitions, derivation assumptions or inequality boundary cases.

`references/visual-language.md` correctly forbids emphasis on groups and describes architecture boundaries.
Adding flowchart group colors must not contradict that rule or repurpose emphasis as categorical color.
`packages/core/src/catalogue/index.ts` registers the real catalogue; a Markdown guide alone is not discoverable.
Its current `patternSchema` and catalogue tests read global tag contracts. Shared `group` rules need owner context.

### Prompt ownership and loading

Keep the core skill short. Put syntax in `format.md`, family meaning in its catalogue guide,
and mathematical exposition guidance in a new `references/math.md`.
Add a short instruction to read `math.md` when considering or authoring any supported math, including inline prose/labels, display math and equation targets.
Do not add math as a competing figure family or load a large math manual for every document.
Keep the wrapper as a toolkit resolver; it should not duplicate evolving figure or math instructions.

| Surface | Planned edit | Validation |
| --- | --- | --- |
| Core `SKILL.md` | Add flowchart routing; qualify relationship-label/entity rules; add math selection/load instructions and the exact-notation exception to prose-style rules. | Core remains under its existing 2,500-word target; valid commands only; P01–P10. |
| `catalogue/flowchart.md` | Add use/non-use cases, procedural semantics, groups, valid template, diagnostics and family-specific review. | Existing catalogue structure and 600-word prose cap; template compiles. |
| Adjacent catalogue guides | Update architecture, trace, state, plan, transform, steps and Mermaid comparisons where they overlap. | No instruction sends a supported procedural flowchart into architecture or Mermaid by default. |
| `catalogue/decision.md` | Clarify that this guide is a document decision record; process decision diamonds belong to flowchart. | Decision-record scenario still chooses the existing guide. |
| `visual-language.md` | Separate flowchart phase/responsibility groups from architecture boundaries; separate group `color` from part `emphasis`. | Neutral and same-color examples remain valid; no forced coloring. |
| `format.md` | Add implemented flowchart syntax and contextual attributes; link existing equations syntax to `math.md`. | All valid/invalid snippets agree with the actual validator. |
| New `math.md` | Explain notation choice, symbols, units, assumptions, references, label length and mathematical review. | P05–P10 and source-backed example checks. |
| `prose.md` | Exempt exact mathematical notation from prose rewriting while keeping surrounding explanations readable. | No change to TeX, units, inequalities, identifiers or quoted evidence solely to meet prose style. |
| `review-process.md` | Add targeted flowchart/math questions within R1–R5, without new mandatory review passes. | Cold-reader tasks include a branch contrast and a mathematical boundary case where relevant. |
| `figure-review.md` | Require source formulas and notation context when math is material; apply flowchart review when selected. | Specialist packet preserves equations and source evidence; no new agent-per-figure requirement. |
| Catalogue registry/schema | Register `flowchart`; expose owner-specific `group` attributes in catalogue schema output. | `catalogue list/show --part guide/template/schema` agree with actual syntax, including rejection of architecture `group.color`. |
| Packaging and resolver tests | Ship new guides and retrieve them through the selected toolkit's `skill show` and catalogue commands. | Installed/locked toolkit tests match packaged files; old toolkit does not advertise unsupported flowchart syntax. |

Do not broaden the architecture group's accepted attributes simply to make a shared catalogue table pass.
Use figure-context-aware schema projection or equivalent explicit metadata for the shared `group` tag.
Test the public schema command as well as Markdown attribute tables.

### Representation routing instructions

The core prompt should express these distinctions, with detailed examples in the catalogue:

| Reader question | Preferred representation | Guard against |
| --- | --- | --- |
| What happens next when a condition changes? | Flowchart for one process's alternative paths and retries | Architecture arrows mistaken for procedural order. |
| What exists and who calls whom? | Architecture | Services turned into actions merely because calls happen in sequence. |
| What happens in this run across actors, waits and partial order? | Trace | A flowchart implying unsupported synchronization or losing actor/message meaning. |
| Which states and transitions can this object have? | State | Actions substituted for persistent states. |
| What work depends on other work? | Plan | Dependencies treated as executable next-step arrows. |
| How does this value change representation? | Transform | Data transformations reduced to generic process boxes. |
| What is a short unbranched procedure? | Prose or a numbered list | A flowchart added only because the feature exists. |
| Why did we choose this design? | Existing decision-record guide | Confusing the guide name with the new `decision` part tag. |

Proposed core instruction:

> Use a flowchart for alternative steps and retries in one process. Use a trace
> for actors, messages and partial order. Use a state figure for an object's
> allowed states. A short straight procedure usually needs only a numbered list.

Remove the blanket implication that every temporal relationship belongs in `trace`.
Keep the rule that geometry alone never establishes chronology or evidence.
Flowchart edges explicitly carry next-step meaning; source order, group order and layout do not.

### Flowchart authoring and review instructions

Use imperative actions such as “Check order” and questions such as “Order valid?”
Keep terminal labels specific: “Rejected” and “Ready for fulfilment” convey different outcomes.
Every decision exit needs a source-supported outcome label. Ordinary continuation arrows may be unlabeled.
Do not add “then” or repeat destination labels merely to satisfy the old relationship-label instruction.
Keep existing architecture edge-label rules unchanged.

Do not invent a decision, its threshold, an exhaustive branch set or eventual success to complete a diagram.
A retry requires its actual condition and return destination. A retry arrow does not prove termination.
Converging arrows mean alternative arrival, not “wait for both.” Do not translate real parallel work into a one-path chart.
Use trace/plan only when they preserve the reader's question; otherwise state the unsupported requirement.
Use illustrative processes only when explicitly identified as examples.

Group by a named phase or responsibility that helps the reader follow the process.
Do not borrow architecture's deployment/trust-boundary requirement for a procedural phase.
Use `color` only on flowchart groups; supported tokens do not imply good/bad or priority.
Do not color every group by default. Repeated colors are acceptable when labels preserve identity.
Folding must not hide the decision-changing condition from the main explanation.
Do not add unsupported `entity`, `emphasis`, swimlane, fork or join attributes to flowchart parts.

### Mathematical exposition instructions

Proposed short core instruction:

> Use math when a relationship, constraint or derivation is clearer as an equation.
> Read `references/math.md` when considering or authoring math, including inline
> prose or labels, displays and numbered equations. Define unfamiliar symbols and
> units at first use. Keep assumptions and conditions beside the expression.

Add this exception to the always-loaded core prose rules, not only `prose.md`:

> Prose-style rules do not authorize rewriting exact mathematical notation, TeX,
> units or inequalities. Preserve source-owned notation. Explain any deliberate
> transformation and retain the assumptions and meaning that justify it.

The math guide should cover the following behaviors, linking to `format.md` for syntax:

- Inline math fits a short expression in a sentence or native label. Display math serves an expression needing its own reading space.
- Use an `equation` target when readers need a stable reference. Use `eqref`, not typed equation numbers or TeX `\label`/`\ref`.
- Define symbols, units, domains and index ranges where the reader first needs them. Distinguish vectors, scalars and similarly named quantities when relevant.
- Preserve exact source notation unless a change is explained. Check signs, grouping, subscripts, limits, dimensional consistency and assumptions.
- Mark approximations and illustrative inputs. Do not turn a fitted relation or model assumption into an exact physical law.
- Introduce a derivation's important step and its conditions. Decorative equations or algebra that does not help the reader can be omitted.
- Keep native labels short. Put long derivations beside the figure or in useful detail, retaining the operative condition in the visible label/prose.
- For a threshold branch such as `$q < C$`, explain what `q` and `C` measure and the equality case. Do not invent the complementary branch if the source does not establish it.
- Follow the existing supported syntax. Do not load a CDN, add macros/packages, use raw HTML, pre-render SVGs or put TeX in Mermaid to bypass a rendering error.
- Preserve code, captured evidence and literal currency as literal text. Apply Markdoc attribute escaping only in attributes; do not double-escape ordinary Markdown equations.
- Distinguish invalid TeX rejected by `check` from a reader-side renderer failure that shows valid source. Source fallback is not a reason to leave invalid authored math.
- Inspect source and rendering. Check long-equation scrolling and copy/reference fidelity where used. Print currently shows readable LaTeX source, not typeset equations.

In R1, check mathematical meaning against the source and one relevant boundary case.
In R2, check symbol definitions and prerequisites. In R3, check grouping, math-label fit and operative branch conditions.
In R4, check whether a derivation/detail explains an actual question rather than restating the formula.
In R5, ask the reader to interpret the equation or predict a changed input, not merely repeat notation.
A compiled formula is not proof of mathematical correctness.

### Prompt acceptance fixtures

Add a small source-backed task set under `tests/fixtures/authoring/flowchart-math/` during implementation.
Keep expected choices, source assumptions and answer keys separate from author/cold-reader packets.
These cases validate author behavior; string-presence assertions alone cannot establish success.

| Case | Task and input contrast | Required outcome |
| --- | --- | --- |
| P01 | Retry process, component map and short straight procedure | Flowchart, architecture and prose respectively; no feature overuse. |
| P02 | Concurrent request trace, object lifecycle, work dependencies and decision record | Preserve trace/state/plan/decision-guide distinctions; no false sequentialization. |
| P03 | Named phases with one retry crossing groups; request colored groups | Valid flowchart group tokens, explicit membership, valid return flow, outcomes readable without color. |
| P04 | Source omits a decision threshold or retry completion guarantee | Report the missing fact; do not fabricate a branch rule or promised success. |
| P05 | Same fraction in prose, display and a native quoted label; include a label-only task with no display equations, plus code and currency controls | Math guide loads for inline-only use; correct delimiter/backslash context; code and currency stay literal. |
| P06 | Referenced equation moved earlier in the document | Stable equation ID and `eqref`; no hard-coded number, TeX reference command or broken link. |
| P07 | Source-backed capacity condition `q < C`, with equality input and defined units | Exact inequality, definitions, supported equality outcome and visible qualification. |
| P08 | Long derivation and a short operative decision expression | Short meaningful label; derivation in appropriate prose/detail; no lost assumption or compressed unreadable equation. |
| P09 | Invalid TeX, valid no-JS fallback, print and older-toolkit cases | Fix author errors, describe actual fallback/print behavior, and never advertise unavailable flowchart support. |
| P10 | Source-backed near-neighbor formulas: `-x^2` versus `(-x)^2`, an index ending at `n-1` versus `n`, exact versus approximate equality, and milliseconds versus seconds | Preserve signs, grouping, indices, approximation and units in generated source and visible fallback; reader answers distinguish the paired meanings. |

For task trials, record the selected toolkit, prompt-file hashes, model/route, source packet,
generated document, diagnostics, actual checks and observed semantic errors.
Use the same task set on the baseline and revised prompts to expose regression or improvement.
Hold the capable toolkit, model configuration, source packet and task wording constant for paired prompt trials.
For math-only trials, use the current math-capable runtime. For flowchart trials, use the same new capable runtime in both arms.
Record the complete prompt/guide bundle in each arm. If runtime or model changes too, report the confound instead of attributing the result to prompts.
Record outcomes per case; do not invent a quality score or a statistically significant claim from a small trial.
Valid alternative authoring choices are acceptable only if they preserve the stated question and meaning.
If a case fails materially, fix the responsible instruction/example and rerun that case plus affected neighbors.

Add focused deterministic tests for catalogue discovery/schema, prompt links/budgets,
all documented syntax examples, old-toolkit behavior and the P05/P06/P10 serialization invariants.
Use source-aware review and the existing cold-reader protocol for P01–P04/P07–P08/P10 meaning.
For P10, compare decoded TeX rather than raw Markdoc escaping across surfaces.
Require the source-owned symbols to survive unchanged unless the task explicitly requests an explained transformation.
A tiny changed-input example must distinguish each near-neighbor pair; merely copying the same formula into the answer is insufficient.
Keep the reviewer blind to the expected answers until responses are collected.
Do not claim agent trials as physical-device or representative-human validation.

### Scheduling and requirements

Math-only prompt improvements can ship independently against the already implemented math feature.
Flowchart instructions, examples, catalogue registration and contextual schema changes ship with the capable implementation.
The core skill must load the selected toolkit's guidance; do not teach a locked older toolkit a future tag from an unrelated local guide.
Do not delete Mermaid documentation or migrate existing diagrams under this prompt work.
Once flowchart ships, stop recommending Mermaid for its supported procedural cases; broader retirement remains separate.

Add a W5a prompt package: one writer owns the skill/reference edits and catalogue-guide tests.
Catalogue schema/registry changes belong to the W1 model owner, with an explicit handoff to W5a.
W5a depends on W4 for flowchart runtime claims; its math-only subset has no flowchart dependency.

| ID | Obligation | Verification and success criterion |
| --- | --- | --- |
| FC22 | Selected-toolkit authoring guidance shall expose only supported flowchart syntax and contextual attributes. | Catalogue/schema/packaging tests and P09 reject unsupported old-toolkit and architecture-group usage. |
| FC23 | Authoring prompts shall distinguish flowcharts from adjacent figure families. | P01–P04 preserve the source-backed reader question without false order or invented branches. |
| FC24 | Math guidance shall preserve notation, conditions and source-backed meaning across supported surfaces. | P05–P08/P10 pass syntax/identity checks and source-aware meaning review. |
| FC25 | Authoring guidance shall describe current math fallback, printing and capability limits accurately. | P09 and packaged-guide checks match actual runtime behavior. |

All four requirements are proposed, with the Visser maintainer as owner.
Their source is the user's prompt-guidance follow-up and the audited prompt contradictions above.
C02 includes FC01–FC25. C06 includes W5a prompt checks and guide compilation.
The initial Sol review covered sections 1–10. The prompt addendum has a separate targeted review in `docs/reviews/native-flowchart-plan.md`.
