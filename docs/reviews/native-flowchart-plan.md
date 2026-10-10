# Native flowchart plan review

Date: 2026-10-09. Scope: design and implementation planning only.
Repository baseline: `0db1968130576aced3986fd2c50a96d03722797c`.
Plan: [native-flowchart.md](../plans/native-flowchart.md).
Independent reviewer: `/root/flowchart_plan_review`, configured `cw_reviewer` (Sol).
The reviewer received a fresh source packet, not the author's conversation history.
No sub-delegation or implementation was requested.

## Snapshots and checks

Initial reviewed plan SHA-256:
`b05ae7c3719ccfd9f1a7a91f4c005f5338646232e045236dab7757540d1a53d9`.

Revised plan submitted for targeted closure recheck:
`2553ee26ddff7f297200b433f1921776183910fce2b8f3235fa69a079b062571`.

The reviewer read the complete initial plan and relevant syntax, validation,
targets, projection, compiler, folding, inspection, build and export contracts.
The reviewer used read-only file inspection and ran no tests or browser probes.
The author independently checked the material claims against baseline source.
The author ran the work-cycle Markdown checker on the revised plan: zero errors
and zero warnings. Its parser recognized no standalone requirement records;
FC01–FC21 are table rows and received a manual obligation/verification review.

No W0 feasibility, color contrast, layout, runtime or human usability result is claimed.
These remain implementation acceptance obligations, not blockers to delivering a reviewed plan.

## Independent findings and author pressure test

### NF-01 — Material: group and parent-chain bounds

Trigger: an otherwise valid process uses many groups and deep referenced parent chains,
while staying under the 200-node and 400-flow caps.
Consequence: layout recursion, ancestry handling and generated fold geometry are not bounded by those caps.
Evidence: `layout.ts` creates an ELK node per group and recursively places parents.
`svg.ts` ancestry walks stop after 1,000 links. `parse.ts` literal-depth checks apply
to attribute arrays/objects, not a chain of flat group declarations.

Disposition: fixed in the plan. W0 must select measured group-count and parent-depth
bounds before W1, with exact-limit and one-over rejection tests.
The author strengthened this beyond the review finding: proxy/work/output budgets
must cover SVG fold generation outside the worker timeout. See AP-01.
No new numerical resource allowance is asserted without measurements.

### NF-02 — Material: unlabeled addressable flows

Trigger: a flow omits `label`, with or without explanatory body prose.
Consequence: its target name can be empty or body text can become an unintended outcome.
Evidence: `targets.ts` falls back to body text when deriving a target label;
relationship extraction normally copies the target label.

Disposition: fixed in the plan. The optional authored outcome remains distinct from
`TargetRecord.label`. The canonical target label identifies original source, outcome
(or “continues to”) and destination. `Relationship.label` is authored text or empty.
Map rendering uses the relationship label; inspectors/reference controls use the target label.
Unlabeled self-closing and body-bearing fixtures must exercise every relevant view.
Generated target summaries never become source-owned quote text.

### NF-03 — Material: direction and cycles

Trigger: a retry or self-loop contains a route opposing the requested screen axis.
Consequence: “preserve direction” and “validate arrow direction” had contradictory readings.
The reviewer suggested direction over strongly connected components as one possible solution.

Disposition: fixed with a narrower contract. Direction is a fixed preferred rank axis.
Simple acyclic chains have a coordinate-order oracle. Loops may oppose that axis.
Arrow correctness is source-to-destination path order and destination-outline docking.
The author did not adopt mandatory component-monotonic positioning: the existing layout
contract supplies an ELK preference, and group constraints do not establish that stronger guarantee.
This avoids introducing an unsupported “main path” or rejecting a valid return route.
T04 now distinguishes orientation, viewport stability and endpoint correctness.

### NF-04 — Material: diagnostics on incomplete adjacency

Trigger: one of a decision's outcomes has a missing, wrong-kind or cross-figure destination.
Consequence: counting or excluding that edge could produce inconsistent degree and reachability diagnostics.

Disposition: fixed in the plan. Explicit validation phases precede topology analysis.
Schema/reference faults suppress degree and reachability checks for the affected figure.
Ambiguous document IDs suppress topology checks. Structurally valid figures count all authored
flows, including parallel/self-edges; hard semantic faults suppress reachability warnings.
Mixed-reference fixtures require exact diagnostic sets. Other independent valid figures remain checked.

## Additional author findings

### AP-01 — Material: fold work is outside the layout timeout

Evidence: `compile.ts` awaits worker layout, then calls `graphSvg` on the main thread.
`svg.ts` materializes the Cartesian product of endpoint ancestors before routing proxies.
The worker's 60-second timeout does not cover that later work.

Correction: W0 fixes proxy-count, geometry-work and output bounds, with prospective
counting before allocation and explicit bounded rejection. Deep disjoint endpoint
chains are required resource fixtures. No limits are raised to accommodate them.

### AP-02 — Material: foldability is not initial fold state

Evidence: the baseline compiler passes only `collapsed=true` groups into `foldPlan`.
Without that set, fold controls and proxy routes are absent.

Correction: every flowchart group is foldable. Its initial state remains independent,
with `collapsed=false` as the default. Existing architecture behavior is preserved.
Tests cover both initial states and nested state restoration.

### AP-03 — Material: geometry promises need a failure path

Evidence: a layout preference and fixture screenshots do not prove arbitrary dense
maps avoid every label/owner collision. Post-layout routes and proxies also need validation.

Correction: explicit finite-coordinate, containment, endpoint and owner-intersection
checks feed strict failure or the complete text fallback. The plan permits edge-edge
crossings but never interprets them as connections. It does not promise planar layout.

### AP-04 — Material: newer compiler with older reader assets

Evidence: CLI compilation uses the current compiler with a selected toolkit's browser
assets. Existing math code checks asset integrity and its renderer-policy fingerprint.
An older parser rejecting new tags does not cover a newer compiler selecting old reader CSS/JS.

Correction: versioned reader-contract markers in both reader assets gate flowchart compilation
after integrity verification. Old or mismatched assets fail before publication.
FC21 and T08–T10 cover build, serve, HTML/site export and direct compiler capability inputs.
Documents without flowcharts retain old-toolkit behavior. Marker encoding is fixed in W0.

## Review status

The Sol reviewer completed the targeted closure recheck on plan SHA-256
`2553ee26ddff7f297200b433f1921776183910fce2b8f3235fa69a079b062571`.
NF-01 through NF-04 are resolved. The reviewer found no material contradiction in
the added fold-state separation, geometry failure policy or reader capability checks.
The recheck inspected only the revised plan and the previously identified contracts;
it ran no implementation tests or feasibility probes.

Result: reviewed plan ready for an implementation decision. W0 remains the explicit
feasibility/resource-contract gate before production implementation begins.
This record does not authorize implementation or claim implementation/human acceptance.

## Prompt and math guidance addendum review

The user requested prompt changes for good use of native flowcharts and existing LaTeX support.
The author audited the live core skill, format/visual-language/prose/review references,
catalogue registry/schema, wrapper, packaging path and skill/catalogue tests.
Only the plan and this review record changed; live prompts still describe implemented features.

The same Sol reviewer inspected section 11 and the C02/C06 additions at SHA-256
`204ed85beb830d6742f32e7dacc67c920a03f26089c727da763acdea891d03ad`.
It ran no tests and did not reopen the renderer design review.
The following IDs distinguish prompt findings from the earlier author AP records.

### PG-01 — Material: inline-only math and core style exception

Reviewer label: prompt-review AP-01.
Trigger: an author uses an inline formula only in a native label, or considers math
without yet committing to a display equation.
The instruction to load a math guide “when using equations” was too narrow.
The core prompt also exempted code and identifiers from prose rules but not mathematical notation.
An exemption only in `prose.md` would not resolve the always-loaded instruction conflict.

Author pressure test: confirmed against the core skill's style scope and exemptions.
Correction: trigger the guide for any contemplated/authored math, including inline-only labels.
Add the exact-math/TeX/unit/inequality preservation exception directly to the core skill work package.
P05 now includes a label-only guide-loading case.

### PG-02 — Material: notation-preservation oracle

Reviewer label: prompt-review AP-02.
Trigger: author output preserves delimiters and a threshold inequality but changes a sign,
index range, approximation or unit elsewhere. Existing prompt cases could still pass.

Author pressure test: confirmed the difference between syntax acceptance and mathematical fidelity.
Correction: P10 supplies source-backed near-neighbor formulas with different meanings.
Compare decoded TeX, rendered source fallback and cold-reader interpretation.
Use changed inputs to distinguish the pairs rather than accepting a copied formula as understanding.
FC24 includes P10. Deliberate mathematical transformations require explicit explanation and task support.

### PG-03 — Author correction: paired trial attribution

Baseline and revised prompt comparisons can otherwise be confounded by runtime or model changes.
Hold the capable toolkit, model configuration, source packet and task wording constant.
Record the complete prompt/guide bundle for both arms and report any remaining confound.
Math-only guidance can ship against the current runtime; flowchart prompts await the capable feature.

Revised prompt plan submitted for closure recheck:
`11ca7cdbf693877634ba5a4eefcb54e45a6a02457297e56d22bfa99a17ced51d`.
Markdown checks passed with zero errors and warnings. Manual requirement review covers FC22–FC25.
The Sol reviewer confirmed PG-01 and PG-02 resolved at this exact snapshot, with no material contradiction remaining.
It also confirmed that paired-trial controls prevent unsupported prompt-only attribution.
This was a read-only targeted recheck. No authoring task trials or implementation tests were run.
The revised plan is ready for an implementation decision, including its prompt-guidance scope.


## Selection and sidebar design extension — 2026-10-10

The user requested clickable blocks and groups with details in the right sidebar.
The plan now defines whole-shape targets, separate folding controls, structural summaries and visual selection cues.
FC26–FC31 and T12 cover this extension. Prior Sol closure applies to its recorded snapshot, not this delta.

A bounded Terra read-only review found two material integration gaps.

- SI-01: `reader.ts` currently closes the inspector when folding hides its target.
  Confirmed against `addFolds`. W3 now explicitly retains original flowchart selection and details, with a containing-selection indicator.
  T12 covers direct and ancestor folding. Other figure families retain their existing behavior.
- SI-02: the selection prose included flows without defining bare-flow behavior.
  Confirmed the ambiguity against the existing depth rules and click dispatch.
  The revised contract distinguishes inspectable flows from bare flows, retaining the existing policy.
  Inspectable routes select the original flow, while bare paths must not select an enclosing group.
  Structural summaries remain mandatory for nodes and groups only. T12 checks both flow cases.

The author pressure-tested both findings against the runtime and amended the contract.
Penpot includes block/sidebar, group/sidebar and target-state boards; these are static design specimens.
Runtime implementation and behavioral acceptance remain outstanding.


### Existing-style alignment — 2026-10-10

The user requested the existing Visser styling. The author compared the Penpot reader UI components with `reader.css` and `reader.ts`.
The design now reuses depth bars, opacity-based external selection markers, dashed rectangular focus rings and standard inspector chrome.
The new document icons, uppercase sidebar eyebrow, selection stripe and custom Close control were removed.
Copy reference uses the existing inspector button; the prior math icon decision does not redefine the inspector.
This is a targeted visual correction, not runtime implementation or new behavioral acceptance evidence.
