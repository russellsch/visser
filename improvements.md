# Visser improvements for deeper understanding

Date: 29 September 2026.
Status: revised proposals with Penpot iteration 02 completed. This document does not authorize application implementation.
Revision: 29 September 2026. P01–P10 retain their identities. Iteration 02 now uses compact layouts following user feedback on oversized values.

Visser should help readers explain a mechanism, predict a changed situation, and identify where their understanding stops.
The proposals below improve the diagrams and reading tools that support those tasks.

These proposals come from a fresh SQLite explanation built with the current toolkit.
The example asks why one connection still reads `100` after another commits `80`, while a new reader sees `80`.
It uses verified SQL outcomes, two diagrams, a comparison table, and self-checks.

- [Explanation source](docs/explanations/sqlite-wal/index.md)
- [Standalone explanation](docs/validation/sqlite-current/sqlite-wal-final.html)
- [Exercise results and screenshots](docs/validation/sqlite-current/assessment.md)

The desktop diagrams worked well in that exercise. Browser checks and an independent agent text review passed.
No human comprehension or learning-speed trial ran. The benefits below are hypotheses to test, not measured improvements.

This document is separate from the earlier [catalogue and reader improvements](docs/IMPROVEMENTS.md).
The proposal IDs below match the SQLite assessment. Source syntax remains a design decision; descriptions here do not define supported tags.

## Design direction after pressure testing

The first proposals concentrated on features. The revised direction emphasizes a visible mechanism and a clear visual hierarchy.
An elegant diagram should make the controlling relationship easy to notice, inspect, and apply to a changed case.
Visual appeal and comprehension are separate evaluation outcomes. Neither implies the other.

The [iteration 02 gallery](docs/validation/penpot-improvements-v2/index.html) contains the revised visual and interaction studies.
The Penpot page is **Visser — Iteration 02 · See the mechanism**, with the prototype flow **Visser 02 · See the mechanism**.
It contains 19 native, editable boards. The [first iteration](docs/validation/penpot-improvements/index.html) remains available for comparison.
These are design proposals, not implemented runtime behavior or measured learning improvements.
See the [validation notes](docs/validation/penpot-improvements-v2/assessment.md) for coverage and limitations.

| Review angle | Pressure-test finding | Proposed response |
|---|---|---|
| Mental model | Showing repeated values does not necessarily explain the controlling rule. | Separate state, boundary, observation, and reset in P01; expose explanations through P07. |
| Composition | Similar boxes, panels, and buttons compete with the mechanism. | Establish a focal relationship and reduce container nesting through P08. |
| Comparison | Tabs still require remembering a previous view. | Try aligned paired views before scenario switching in P02. |
| Visual meaning | More attractive geometry can imply unsupported duration, size, or causation. | Constrain visual forms to stated semantics in P09. |
| Author effort | More metadata can increase maintenance without improving an explanation. | Reuse existing targets and test authoring patterns before adding syntax in P10. |
| Generality | SQLite is a useful example, but not a sufficient product benchmark. | Test a lifecycle, a transformation, and branching behavior before generalizing. |

Current Visser already has semantic colours, state diagrams, causal diagrams, comparisons, and annotated artifacts.
These proposals should improve their composition and use rather than introduce parallel replacements.
The existing action colour and redundant shape/text cues remain governing constraints.

## Iteration 02 — Concrete visual direction

The composition places observed values inside their event labels, beside the conditions that explain them.
User feedback rejected the earlier oversized numbers: they consumed space and made explanatory text comparatively weak.
A labelled bracket and explicit endpoints explain the lifetime of the read view.
The observed number remains separate from the state; the main view no longer labels a snapshot as `100`.
Controls remain subordinate to the explanation, while keeping readable labels and comfortable hit areas.

Retain the existing action blue, teal boundary cues, warm committed-change cue, and readable ink labels.
Use colour with text, position, and line weight. Dark explanation panels distinguish optional depth from the persistent main diagram.
The revised studies use 17–20 px body text, 20–24 px event labels, and 32 px desktop titles.
Mobile uses 16–19 px explanatory text and 20–22 px event labels. These are prototype choices, not universal minimums.
The main desktop screen is 1280 × 800, down from 1440 × 1080. Its observed values no longer use 100 px type.

| Screens | Concrete design decision | Proposals |
|---|---|---|
| 01–02 | Keep values in event labels; show A's bounded view; open an explanation while retaining the entire diagram. | P01, P07, P08 |
| 03 | Show two cases together, with the changed ordering and both outcomes visible. | P02, P08 |
| 04 | Separate A's old and new transactions; a new read sees `80` after the original case ends. | P01, P09 |
| 05–09 | Select a value and reason, then submit. Preserve the selected reason beside its feedback. | P05 |
| 10–11 | At 390 px, retain the sequence and place A's and C's results side by side; explain locally. | P03, P07 |
| 12–13 | Follow `é` through `C3 A9` to `w6k=`; expose byte detail without replacing the overview. | P09 |
| 14–15 | Emphasize selected read paths with thicker strokes; keep both endpoints legible. | P04a, P04b |
| 16 | Show why the oversized-number treatment was replaced by event labels and readable explanation. | P08, P10 |
| 17 | Continue the separate `60` prediction case after END; the new read returns `60`. | P01, P05 |
| 18 | Keep transaction-end exploration within the 390-pixel mobile flow. | P03 |
| 00 | Provide an index into the studies and state which proposals remain deferred. | P10 |

A screenshot QA pass corrected obscured arrowheads, missing read-order connections, and connector-label occlusion.
Mobile transaction-end exploration now remains within a mobile-sized board.
Study links use action colour, and footer links have expanded hit areas.

### Interaction contracts illustrated by the boards

- The basic explanation is visible before any click. Opening depth keeps the relevant diagram present.
- Closing an explanation returns to its originating case.
- Changing a selected quiz answer clears submitted feedback and requires submission again.
- Selection and submission are separate states; no answer is preselected on entry.
- The original `80` case and the `60` practice case retain their own values through their follow-up screens.
- Comparison uses simultaneous paired views; no scenario-switching engine is assumed.
- A full-width read-path overview and focused step share geometry, so attention changes without rearranging the graph.

The Penpot prototype represents these contracts through linked boards. It does not implement runtime state, keyboard semantics, or responsive reflow.
The mobile screen is a separate 390-pixel design; the desktop board does not automatically reflow into it.
P06 remains an author-review checklist. A lifecycle example, branch-heavy trace, dark mode, and print studies remain future validation work.

## P01 — Add labelled state spans to traces

### Problem and purpose

A trace shows events, but an important condition can persist between those events.
Readers currently have to remember that condition and mentally connect it to later results.

In the SQLite example, A keeps the same snapshot while B commits a change.
The trace shows A returning `100` twice, but it does not draw the lifetime of that snapshot.
A labelled span would make the reason for the repeated value visible.

### Proposed change

Extend `trace` with optional spans attached to actor lanes.
Each span has a stable ID, a label, an actor, a start event, and an end event.
Its body can explain the condition and cite evidence, using the existing inspection model.

Draw the span beside the actor's events without covering labels or dependency arrows.
Use explicit start and end caps attached to their events, so a tinted region does not leave its boundary ambiguous.
Its length represents the scope between events. It does not imply elapsed time.
Allow small authored value badges at events when they clarify a change in state.

For SQLite, label the span **“A's read view remains fixed”**, from its first SELECT to the transaction end.
Keep `100` on the observed read result. A snapshot is not a scalar value.
Place a callout beside B's commit: **“This later commit is outside A's existing read view.”**
Mark the transaction end as the boundary after which a subsequent read can establish a new view.
The diagram should expose the state, excluded change, result, and reset without requiring inspection.

An authored span asserts that a condition holds over the stated scope; geometry does not prove the claim.
Evidence and scope belong to the span. Do not infer persistence solely because endpoints exist.
Before adding syntax, compare a native span prototype with an existing annotated illustration containing the same facts.

The same feature can explain lock ownership, resource lifetimes, cache validity, or a permission that remains active during an operation.

### Implementation and boundaries

- Extend trace syntax, target registration, and semantic validation for spans.
- Update trace rendering in [compile.ts](packages/core/src/compiler/compile.ts) and [svg.ts](packages/core/src/compiler/svg.ts).
- Add inspection and highlighting support for the span's stable ID.
- Extend [the text projection](packages/core/src/model/project.ts) to state the condition and its endpoints explicitly.
- Update the trace catalogue guide and authoring examples.

Validate endpoint references within the trace. Reject reversed bounds and combinations that require mutually exclusive events to occur together.
Define how bounds work with partial order before implementation. Do not infer a valid interval from visual placement alone.
Keep existing traces valid when they contain no spans.

Start with spans that have explicit start and end events. Decide later whether open-ended spans are useful enough to support.
Print, narrow views, and no-JavaScript output must retain the condition and its scope.

### Acceptance checks

- The SQLite span visibly continues past B's commit and ends at A's transaction boundary.
- Labels, events, and dependency arrows remain readable around a span.
- Invalid endpoint references produce a diagnostic tied to the authored span.
- Text output identifies the actor, condition, start event, and end event.
- A reader can predict A's result after another commit during the span, without reopening the explanatory prose.

## P02 — Compare changed cases directly, then consider scenario switching

### Problem and purpose

One example can show what happens without revealing which condition controls the outcome.
Distant diagrams or hidden alternatives force readers to remember the first layout while interpreting the second.

For SQLite, moving A's first SELECT from before B's commit to after it changes the observed value.
The diagram should make that change in ordering and its consequence visible together.

### Proposed change

Begin with a paired-view prototype using two authored traces and a shared comparison caption.
Show both cases together on wide screens, with aligned actors and an explicit changed condition.
On narrow screens, keep the changed condition and both results adjacent before the detailed traces.
Each case states its assumptions and observations.

Only add a declarative scenario switcher if paired views cannot support the intended reading task.
A switcher would expose a finite set of authored variants through keyboard-accessible controls.
Keep a textual difference summary visible so the reader need not remember the previous picture.

Prefer stable actor lanes and entity identity across cases. Event positions must change when their ordering changes.
Use emphasis and text cues to distinguish changed content from unchanged context.
Identify additions and removals explicitly; do not rely on colour or motion alone.
Keep the active scenario's assumptions visible beside the drawing.

Start with two trace variants: **first SELECT before commit** and **first SELECT after commit**.
Treat DEFERRED versus IMMEDIATE as a separate comparison, so readers can tell which condition each comparison changes.

### Implementation and boundaries

First, compose two existing traces with aligned actor labels and a shared difference summary.
This prototype should not require a new runtime state model.
If evaluation justifies switching, apply the following additional work:

- Define shared entity identity separately from scenario-specific event and relationship identity.
- Extend the compiler to produce deterministic layouts with shared actor lanes where readable.
- Add scenario selection to the runtime without replacing the document's canonical source.
- Make target inspection and reference resolution identify the relevant scenario where necessary.
- Provide static output that displays each scenario with its assumptions and differences.

Begin with trace scenarios before extending the feature across the whole catalogue.
Use authored outcomes. This feature does not execute SQLite, infer causation, or permit arbitrary document JavaScript.
The author remains responsible for evidence supporting each scenario.

Decide the source syntax and layout strategy before implementation.
Specify how a link to a scenario-specific target activates the correct view.
If stable placement causes an unreadable drawing, allow an explicit alternate layout and retain clear entity correspondence.

### Acceptance checks

- Paired cases expose the changed condition and both outcomes without switching views.
- A later switcher preserves actor correspondence while allowing changed event ordering.
- The changed condition and resulting observation are both explicit.
- If switching is added, keyboard use preserves meaningful focus and announces the active scenario.
- If switching is added, links to scenario-specific targets reveal the correct content.
- Print and Markdown exports communicate the comparison without interactive controls.
- Readers can identify the changed condition and predict a new variation of the same mechanism.

## P03 — Show mobile traces in event order

### Problem and purpose

The current narrow trace view groups event cards by actor.
In the SQLite exercise, it shows A's layers `1, 3, 4, 5` before B's layer `2`, followed by C's layer `3`.
The dependencies remain in the text, but the reader must reconstruct the interleaving.

Switching to the map does not fully solve this problem.
The tested trace is 674 pixels wide inside a 348-pixel viewport, so the reader cannot see A and C together.

### Proposed change

Provide order-layer grouping for narrow traces whose question depends on cross-actor interleaving.
Use it as the default in the SQLite example; test other trace shapes before changing every document's default.
Each layer contains event cards with clear actor labels.
Put events in the same layer together without suggesting an order between them.
Keep prerequisite links available when the layer alone does not explain a dependency.

In the SQLite example, show A's first read, then B's commit, then A's `100` and C's `80` together.
Show A ending its transaction and reading again afterward.

Preserve authored comparison groups when order layers alone do not keep the decisive observations adjacent.
Such a group identifies observations to compare; it does not assert simultaneity or add dependency edges.
Do not move an event across its prerequisites to satisfy presentation grouping.
Retain actor grouping as an alternate view for questions about one actor's behavior.
Keep the map available as another representation.

### Implementation and boundaries

Update `Renderer.trace` in [compile.ts](packages/core/src/compiler/compile.ts), narrow styles in [reader.css](packages/runtime/src/reader.css), and view controls.
Reuse the existing order-layer calculation instead of introducing a second interpretation of `after`.

Preserve stable target IDs across views. Each representation should open the same explanatory detail.
If P01 spans exist, include their conditions in the event-order view.
Preserve branch labels and mutually exclusive alternatives.

An order layer is a dependency level, not a timestamp.
Do not label independent events as simultaneous or impose an execution order merely because one card appears first.

### Acceptance checks

- At 390 pixels, A's and C's post-commit results appear together without horizontal scrolling.
- B's prerequisite commit appears before those results.
- Same-layer cards do not claim an order that the source does not establish.
- Switching views retains access to the same targets and evidence.
- Branches and span conditions remain understandable in the narrow representation.
- A reader can reconstruct the cross-actor sequence without searching past later events from one actor.

## P04 — Preserve context in walkthrough highlights and reduce repetition

### Problem and purpose

A walkthrough currently highlights the explicit target list.
In the SQLite exercise, highlighting A's read edges dimmed their destination nodes until the author added those nodes manually.
The highlighted relationship became harder to interpret because its context faded.

Walkthrough presentation also occupies substantial space for a small diagram.
The tested architecture SVG is 184 pixels high; the complete figure occupies about 698 pixels.
That includes explanations, controls, a legend, and generated Parts links.

### Proposed change

When a step targets a relationship, automatically preserve its endpoints as supporting context.
Give primary targets stronger emphasis than supporting context.
Keep unrelated content quieter, while leaving it available for inspection.
Use a stronger stroke and relation label for the primary edge, with readable endpoint frames for supporting context.
Do not make essential labels nearly transparent to achieve focus.

Provide an explicit author override for lessons that intentionally isolate a part.
Do not recursively include the entire connected graph.
For a hidden endpoint inside a folded group, retain the visible group representative as context.

Add a compact walkthrough presentation with one visible step title.
Make generated Parts links optional in that presentation.
Keep navigation controls and the step's explanation, including caveats that affect its meaning.

### Implementation and boundaries

Deliver P04a, supporting endpoint context, separately from P04b, compact walkthrough presentation.
P04a addresses a reproduced authoring problem. P04b needs a visual prototype and separate evaluation.
Try renderer and stylesheet defaults before exposing another authoring option.

Update [marks.ts](packages/runtime/src/marks.ts) to derive supporting endpoints from existing relationship data.
Update [components.ts](packages/runtime/src/components.ts) and [reader.css](packages/runtime/src/reader.css) for compact presentation.
Extend authoring syntax only where the context override or presentation choice requires it.

Define precedence between walkthrough selection, hover, keyboard focus, filters, and folded groups.
Existing authored target lists remain valid.
Keep a complete textual walkthrough for print and no-JavaScript readers.

### Acceptance checks

- A step that names only a relationship keeps both endpoints readable by default.
- Supporting context remains distinguishable from the main target without relying only on colour.
- An explicit override can isolate a part intentionally.
- Folded groups, filters, and keyboard focus do not erase the selected relationship's necessary context.
- Compact mode avoids duplicate step titles while preserving the explanation and navigation.
- The static walkthrough retains the relationships needed to understand each step.

## P05 — Add answer choices and misconception feedback to self-checks

### Problem and purpose

The existing `self-check` shows a question and a revealable answer.
It lets readers compare their prediction with an explanation, but it cannot respond to the particular mistake they made.

In the SQLite example, a reader who predicts `80` for A's repeated read may assume that every SELECT gets a fresh snapshot.
Feedback should explain that mistaken rule and connect the correction to the diagram.

### Proposed change

Allow a self-check to contain optional authored answer choices.
Each choice has an identity, answer text, correctness information, and feedback explaining its reasoning.
Feedback can cite evidence and link to relevant diagram targets.

Keep selection separate from submission so readers can revise their choice before revealing feedback.
After submission, show the explanation in place and offer a link to the relevant diagram part.
Do not unexpectedly move the reader away from the question.

A numeric answer does not identify the reader's reasoning.
Use conditional feedback, such as **“If you expected every SELECT to refresh the view, notice the active transaction.”**
Alternatively, include the reason in each answer choice and respond to that stated reasoning.
For an incorrect answer of `80`, explain why the existing transaction retains its old view.
If P01 is available, link to the span that stays fixed.
Follow the correction with a changed boundary, such as ending the transaction before the next read.
Also allow changed values, but do not rely only on numerical substitutions to test application of the rule.

### Implementation and boundaries

Extend self-check syntax and validation, compiler rendering, runtime behavior, and text projection.
Give choices stable identities if feedback or references can target them.
Begin with single-answer questions and validate that the author supplies one correct choice.
Keep the existing question-and-answer form valid.

Use authored feedback rather than automated grading of free text.
Do not require accounts, telemetry, persistent scores, or external services.
Print and no-JavaScript output should retain choices, the correct answer, and all explanations.

### Acceptance checks

- Keyboard users can select, revise, and submit an answer.
- Feedback explains the selected mistake or correct reasoning; it does not only say “wrong” or “correct.”
- Feedback links open the intended diagram target or evidence.
- Invalid choice structures receive actionable diagnostics.
- Existing self-check documents still render without modification.
- A follow-up question checks whether readers can apply the corrected rule to a new situation.

## P06 — Extend editorial review to report missing explanatory support

### Problem and purpose

Visser already records reader goals in `mustUnderstand` and provides editorial prompts through `check --review`.
Those checks can catch structural and wording problems, but a valid document can still leave its central mechanism implicit.

The SQLite document passed with zero review prompts even though its snapshot boundary existed only in prose.
That is not a correctness failure. It is an opportunity to help authors see which parts of the teaching task lack visual support.

### Proposed change

Start with an authoring checklist that traces each essential goal to visible support.
Add metadata only if repeated authoring exercises show that manual review misses consequential gaps.
Keep mappings optional and avoid a completeness score.

Where mappings are useful, allow each reader goal to reference its supporting content:

- The main-path explanation of the mechanism or rule.
- The diagram relationship or state that represents it, where a diagram adds value.
- A self-check that asks the reader to apply it to a changed situation.

Have `check --review` report missing or limited support in those mappings.
Examples include an essential explanation available only in collapsed detail, or a prediction goal with no practice question.
Where an author expects visual support, report whether the linked target is actually drawn.

Keep these prompts advisory. Do not demand a diagram for every goal or treat absent optional mappings as a build failure.
Explain what evidence the prompt uses, so authors can distinguish a structural observation from a judgment about teaching quality.

### Implementation and boundaries

Extend the reader metadata schema while preserving existing `mustUnderstand` strings.
Choose a stable way to identify goals before allowing mappings; avoid references that break when list order changes.
Reuse existing target IDs for explanation, visual, and self-check links.

Implement coverage prompts in [packages/core/src/review](packages/core/src/review).
Validate explicitly supplied references using the existing broken-reference rules.
Update the authoring skill with examples of useful mappings and acceptable prose-only explanations.

The checker can report that a goal points only to a definition or hidden detail.
It cannot prove that the explanation is true, that a question tests the intended skill, or that a reader understands it.
Do not report “comprehension passed” merely because every field is populated.

### Acceptance checks

- Existing documents without mappings retain their current build behavior.
- Supplied mappings resolve to valid targets and survive unrelated content reordering.
- Review output distinguishes main-path explanations from optional depth.
- A missing visual produces a prompt only when the goal explicitly expects visual support.
- Prompts name the goal, the observed gap, and a concrete author action.
- Human or independent reader evaluation remains separate from structural coverage checks.

## P07 — Explain a selected outcome in its diagram context

### Problem and purpose

Inspection describes a selected part, but a reader may need several parts to understand an outcome.
Following separate inspectors can break the connection between condition, mechanism, and result.

### Proposed change

Allow an author to associate an outcome with an explanation and a small group of existing target IDs.
Offer an optional **“Why this result?”** action beside the outcome or inside its inspector.
Activating it highlights the authored explanation group and presents its explanation beside the diagram.
Keep the selected outcome visible. Provide an explicit return to the original view.

For A's `100`, show the first read, active transaction span, and repeated read together.
Keep B's intervening commit visible as contrast, labelled as excluded from A's existing view.
The basic rule remains visible without interaction; this action supplies additional explanation or evidence.

### Implementation and boundaries

Prototype this as a reusable walkthrough selection using the existing target registry and marking code.
Do not add a causal inference engine or automatically turn graph adjacency into an explanation.
Validate explanation references. Preserve scenario identity if a later scenario feature exists.
Distinguish ordering arrows from causal claims using the existing trace and cause semantics.

On narrow screens, show a local explanation with the relevant diagram excerpt or target labels.
A full-screen inspector must not force readers to remember the entire hidden drawing.
Reuse the main targets rather than maintaining an independently authored miniature diagram.

### Acceptance checks

- Activating the action reveals the authored explanatory targets and keeps the outcome identifiable.
- Dismissal restores the previous selection and meaningful keyboard focus.
- No explanatory relationship is inferred from layout or adjacency alone.
- Static output states the same explanation and target relationships.
- A reader can name the controlling condition after inspecting the result.

## P08 — Compose figures around a focal relationship

### Problem and purpose

The Penpot studies place the mechanism inside nested, similarly weighted cards.
Prominent buttons and broad panels sometimes attract more attention than the difference being explained.
The measured runtime figure also contains substantial surrounding presentation, although some of it is useful.
Reducing height alone is not sufficient: the figure needs a deliberate reading order.

### Proposed change

Introduce a small set of composition patterns within existing figure families.
Start with **focused mechanism**, **paired contrast**, and **overview with local detail**.
These patterns arrange existing targets, captions, and controls; they are not new semantic diagram types.

For each figure, emphasize the relationship that explains the outcome.
Do not enlarge a scalar value merely to create a focal point; keep it attached to its event, unit, or condition.
Use a clear title, a short adjacent interpretation, and quieter supporting context.
Place essential annotations next to the boundary, arrow, or observation they explain.
Use spacing and alignment to group related content before adding another enclosing card.
Keep secondary controls outside the main reading path while preserving their visibility and hit area.

For SQLite, make **“One commit, two visible values”** the focal contrast.
Place A's `100` and C's `80` on a shared comparison line, linked to their distinct read-view boundaries.
Use one short nearby explanation of the difference. Keep the full event sequence as supporting context.

### Implementation and boundaries

Prototype composition in Penpot, then in compiler figure markup and runtime styles.
Reuse the existing semantic colour tokens. Blue continues to indicate action, focus, and selection.
Do not reuse a category hue for unrelated emphasis within the same figure.
Use weight, spacing, brackets, and direct labels to establish hierarchy without requiring extra colours.
Keep decisive boundary labels and explanations prominent. Values should remain proportional to the text that gives them meaning.
Use consistent typography for prose, data, and code; avoid making every label bold to create emphasis.
For paired results, align event labels and keep actor identity, value, and explanation close together.
Vary composition because the explanatory task changes, not simply to make successive figures look different.

Prefer finite layout constraints over manual coordinates: keep a caption beside its target, align compared observations,
and keep necessary context with its explanation. Define fallback behavior when these constraints conflict.
Do not shrink text until a crowded diagram fits. Reflow, separate cases, or offer local detail.
Do not remove a caveat merely to create a cleaner composition.

### Acceptance checks

- In a brief unprompted viewing, readers identify the intended comparison or relationship; record what they actually notice.
- Essential annotations remain attached to their targets at desktop and narrow widths.
- Controls remain discoverable without dominating the focal content.
- Removing oversized typography reclaims space for the mechanism rather than leaving empty value panels.
- Explanatory text remains readable beside event labels; emphasis does not depend on shrinking the explanation.
- Longer labels and an open inspector do not create overlaps or ambiguous associations.
- Light, dark, monochrome, and forced-colour views retain the visual hierarchy and meaning.
- A full document with several figures has a readable rhythm without requiring every figure to use the same arrangement.

## P09 — Use visual forms that express the subject

### Problem and purpose

A common box-and-arrow style is consistent, but can hide differences between containment, persistence, transformation, and flow.
Adding decorative icons does not resolve that problem.
The visual form should expose the relationship the reader needs to understand.

### Proposed change

Extend existing renderers with a small, constrained vocabulary of meaningful visual forms:

- A labelled band for a condition that persists across events, through P01.
- A bracket or boundary for a scope, visibility limit, or ownership region.
- Aligned versions or small multiples for a controlled comparison, through P02.
- A concrete sample value or payload carried through a transformation when the representation change is the lesson.

Start with one boundary treatment and one transformation example, rather than a general drawing language.
For the transformation example, carry a labelled sample through the existing `transform` stages.
Show the representation or shape change directly, and mark any loss at the conversion where it occurs.
The current transform model already supplies representation, shape, units, and loss; reuse those fields first.

A detail view may expand one stage to explain an internal mechanism.
Keep a visible connection to the original stage and an explicit way back to the overview.
Do not require animation or clicking to recover the basic explanation.

### Implementation and boundaries

Implement bounded rendering variants in the relevant compiler families and reuse current inspection targets.
Avoid arbitrary SVG or JavaScript as the default authoring interface.
Sample payloads are authored examples, labelled as illustrative unless backed by captured evidence.
Do not derive actual outputs from descriptive `shape` or `units` strings.

Geometry must not imply unsupported quantities.
Equal-width ordinal events do not represent equal durations; area does not represent volume without an explicit scale.
A drawn boundary must identify what it excludes or contains, and what it does not claim.
If transitions animate, use them only to preserve identity across states. Support reduced motion and immediate final states.
Defer animation until static comparison and keyboard interaction work.

### Acceptance checks

- Readers identify the intended boundary or transformation without relying on an unrelated legend.
- The sample remains recognizably the same entity across stages, with changes explicitly labelled.
- No visual size, motion, or connector introduces unsupported duration, magnitude, or causation.
- Print and text output retain the relationship communicated by the visual form.
- The new form explains something the equivalent generic boxes leave harder to see.

## P10 — Make good composition economical to author and maintain

### Problem and purpose

A feature can help one hand-tuned example while making ordinary authoring slower and more fragile.
More goal mappings, target lists, scenario variants, and annotations also create more opportunities for stale explanations.
Visser needs repeatable authoring patterns as much as new reader interactions.

### Proposed change

Extend the authoring skill with a worked pattern:
**question → concrete example → visible mechanism → changed case → prediction**.
Combine stages where one figure already performs several jobs. Do not require five separate blocks.
Include examples of when a sentence, table, or existing annotated artifact is sufficient.

Add a visual review checklist asking authors to identify:

- The first thing a reader should notice.
- The relationship that explains the outcome.
- The assumption or boundary that prevents overgeneralization.
- The information that belongs in the main view and the evidence that can remain in detail.

Provide complete examples using existing catalogue components before proposing new mandatory fields.
Where a new feature repeats another feature's target selection, share the reference rather than copying the content.
Keep a concrete sample value consistent across the narrative, diagram, and prediction.

### Implementation and boundaries

Update the authoring skill and relevant catalogue guides after prototype evaluation.
Create examples with a visible mechanism and an intentionally tempting wrong interpretation.
Use those examples to demonstrate how labels, placement, and evidence prevent that interpretation.
Review the complete page, not only isolated screenshots of its best figure.

Automated diagnostics may detect unresolved references, overlapping labels, or missing authored scope.
They must not claim that a diagram is elegant, true, or understandable because a checklist is complete.
Do not introduce a visual-quality score without evidence that it predicts a useful reader outcome.

### Acceptance checks

- An author can reproduce the composition from the guide without private manual layout fixes.
- Changing a sample value, adding an event, or lengthening a label has a clear maintenance path.
- Existing documents remain valid and do not acquire required metadata.
- Record authoring time and correction effort alongside reader outcomes.
- A smaller existing-component solution remains acceptable when it explains the same mechanism as well.

## Delivery order and shared expectations

1. Deliver **P04a**, endpoint context, as a bounded fix. Prototype **P03** on cross-actor traces.
2. Redesign one static SQLite figure using **P01 and P08** before adding interaction.
3. Prototype **P02** paired comparison and **P04b** compact presentation as separate changes.
4. Try **P07** outcome explanation and one **P09** transformation view using existing targets.
5. Update authoring examples through **P10** based on those results.
6. Add scenario switching, richer P05 quizzes, or P06 mappings only where simpler patterns fail the intended task.

Each proposal is independently reviewable. This list is an experiment sequence, not approval to implement every feature.
P08 can improve existing diagrams without P01. P07 can initially use existing walkthrough machinery.
Keep deterministic builds, stable references, accessible controls, and complete static output.
Update the affected catalogue guide, source-format documentation, examples, and focused tests with implementation.
New syntax needs an explicit toolkit compatibility decision before release.

## Evaluation that can reject these proposals

Compare against a well-authored current Visser page, not an intentionally weak baseline.
Use the same facts, scope, explanatory sentences, and questions where testing a rendering change.
The original Penpot before/after panels sometimes contain different amounts of explanation; they cannot isolate a visual benefit.
Separate authoring improvements from rendering improvements in the comparison.

Test the SQLite trace, a resource lifecycle, a data transformation, and a branch-heavy example.
Include one actor-centric trace to challenge the proposed mobile event-order default.
Use an ordinary page containing several figures as well as isolated diagrams.
Include longer labels, additional events, narrow screens, and static exports.

Ask unfamiliar readers to find the central contrast, explain the controlling rule, and predict an unseen case.
Test a changed boundary as well as a changed numerical value.
Ask what the diagram does not establish, to detect attractive but overbroad interpretations.
Record correctness, time to a correct answer, navigation failures, and confidence separately.

Also ask which version readers find visually clear and appealing, and why.
Treat preference as its own outcome. Do not substitute it for comprehension or transfer.
Counterbalance viewing order or use different readers for comparable versions to reduce practice effects.
Human trials remain outstanding; agent reviews can expose problems but do not establish human learning speed.

Reject or simplify a proposal when it adds authoring work or navigation without improving the intended reading task.
Prefer the static version if interaction adds no demonstrated value.
Retain visual polish when it improves appeal without damaging accuracy, accessibility, or maintenance.
Do not require every worthwhile visual refinement to claim a learning-speed improvement.
