# Clearer figures implementation plan

Status: Implemented locally; automated verification and independent review are recorded in `docs/validation/clearer-figures-implementation.md`. Real-device mobile and representative-reader validation remain outstanding.
Date: 2026-10-04.
Baseline: repository commit `5729a84`, plus the current untracked design records. Existing local changes remain untouched.

Implement the consolidated Penpot proposal through Visser's existing compiler and reader. Start with one complete native diagram, then extend coverage across figure families. The largest change is the mobile viewer and its interaction with canonical details, references, and accessibility.

## Scope and governing sources

The design baseline is the Penpot page **Visser — Clearer figures · Before & after**, page ID `8c0c298e-6329-8028-8008-bd61433ec72d`, in file `cbe5d0b0-6d79-8049-8008-b47fede8379c`. It has a guide and studies 01–09. Four hidden superseded boards are not requirements.

This plan covers quieter figure framing, local explanations, authored emphasis, labelled groups, separate interaction markers, narrow layouts, and mobile exploration. It does not include trace spans, quizzes, scenario switching, a browser editor, or all proposals in the older root [improvements.md](../../improvements.md).

The user-approved direction takes precedence where it changes older specifications. In implementation, update [ARCHITECTURE.md](../ARCHITECTURE.md) §§10.1–10.5 and [IMPROVEMENTS.md](../IMPROVEMENTS.md) §§4.1, 4.3, 14.1, 14.11. Those sections currently prescribe list-first mobile views, neighbourhood dimming, generated walkthrough controls, and no zoom/pan. Preserve unrelated requirements.

The [DOM contract](../../packages/core/src/compiler/dom-contract.ts), canonical source model, stable identities, offline output, and useful-detail classification remain foundational. Penpot shows appearance and intended behaviour; it does not validate browser gestures or accessibility.

## Current implementation and integration points

| Area | Current behaviour | Planned integration |
| --- | --- | --- |
| Figure shell | `Renderer.figureShell()` in [compile.ts](../../packages/core/src/compiler/compile.ts) emits caption, question, authored interpretation, legend, drawing, lists, and steps. | Simplify presentation without silently deleting authored meaning. Preserve unique questions, caveats, and evidence. |
| Authoring contract | [validate.ts](../../packages/core/src/model/validate.ts) owns tag attribute rules; [catalogue/index.ts](../../packages/core/src/catalogue/index.ts) reads those rules. | Extend the tag specs and catalogue guides together. Do not edit output JSON schemas merely to add a Markdoc attribute. |
| Page and views | [views.ts](../../packages/runtime/src/views.ts) defaults to lists below 900 px. `addViewToggles()` in [reader.ts](../../packages/runtime/src/reader.ts) adds controls to every mapped figure. | Replace routine per-figure controls with diagram-first presentation and one document-level text-view option. Keep accessible relationship lists. |
| Useful details | [inspection.ts](../../packages/core/src/model/inspection.ts) computes explanation, context, evidence, or bare depth, including per-instance visible content. | Reuse this gate. Colour or group membership alone must not create empty drill-downs. |
| Detail ownership | `showDetail()`, `returnCurrent()`, `closeInspector()` move one canonical `<details>` from the appendix, leaving a placeholder. | Extract shared detail lifecycle; support a local desktop host and a sheet inside the mobile viewer. Retain ordinary nonfigure inspection. |
| Marks | [marks.ts](../../packages/runtime/src/marks.ts) owns neighbourhood, walkthrough, filter, and cross-figure marks. Selection is also styled through `vs-inspected`, `vs-selected`, and `vs-focused`. | Separate authored emphasis, active selection, hover, and keyboard focus. Define composition centrally. |
| SVG styling | [encoding.ts](../../packages/core/src/compiler/encoding.ts) owns semantic categories. [svg.ts](../../packages/core/src/compiler/svg.ts) emits shapes, hit strokes, line patterns, markers, and group boundaries. | Add restrained emphasis tokens and dedicated selection geometry. Remove broad descendant stroke overrides in [reader.css](../../packages/runtime/src/reader.css). |
| Groups | Native graph groups already have stable IDs, parent nesting, node membership, boundaries, optional bodies, and collapsed-group proxies. | Refine existing groups. Do not introduce a parallel grouping model. |
| Layout | [layout.ts](../../packages/core/src/compiler/layout.ts) uses bundled metrics, wrapping, ELK, and deterministic geometry at build time. | Preserve build-time layout. Improve long-label and boundary clearance; do not introduce browser layout engines. |
| Alternate renderers | Mermaid renders asynchronously; extensions own their output contracts. HTML tables, trees, and code have different interaction needs. | Give compatible diagrams viewer support through explicit capabilities. Preserve fallbacks; do not force all figures into a graph viewer. |

## Requirements and acceptance

All CF requirements below are proposed implementation obligations derived from the approved design. The implementation owner is the developer assigned the corresponding work package. Each row defines its verification and success criterion; status remains unimplemented until evidence is recorded.

| ID | Obligation | Source | Verification and success criterion |
| --- | --- | --- | --- |
| CF01 | The reader shall omit routine map/list and Previous/Next bars from the default figure presentation. | Studies 01 and 08 | Browser checks find no routine per-figure bars; authored steps remain reachable. |
| CF02 | The compiler shall preserve unique authored questions, explanations, qualifications, and evidence links. | Studies 01 and 02 | Semantic projection and browser fixtures retain each fact after framing changes. |
| CF03 | Native graph nodes and edges shall support optional restrained authored emphasis. | Study 03 | Attribute validation, SVG, and theme tests cover independent node and edge emphasis. |
| CF04 | Authored emphasis shall preserve the figure's existing semantic visual encoding. | Studies 03 and 06 | Causal patterns, role/status colours, arrowheads, and terminal markers retain their meanings. |
| CF05 | Selection shall add its own marker without changing authored emphasis. | Study 05 | Select, hover, blur, clear, and keyboard navigation preserve the authored appearance. |
| CF06 | Ordinary selection shall leave surrounding labels readable. | Study 05 | Selecting a part does not dim neighbours or select its parent. |
| CF07 | Selecting a group shall mark its boundary without marking all children as selected. | Study 04 | Nested-group and child-selection tests distinguish their target IDs and markers. |
| CF08 | A group shall open details only when its inspection depth adds information. | Study 04 | Bare and explained group fixtures follow the existing depth contract. |
| CF09 | Desktop activation of a useful figure part shall open its detail immediately beside or below that figure. | Study 02 | One activation opens local depth; closing restores the originating instance. |
| CF10 | The article shall keep overview and focused figures in normal document flow. | Guide and user decision | Source order, deep links, print, and text view remain coherent without tabs. |
| CF11 | Narrow figure layouts shall retain full labels and relationships without shrinking type to fit. | Study 08 | Long labels and branching examples remain recoverable at 320 and 390 CSS px. |
| CF12 | The first mobile activation of a diagram preview shall open the viewer without selecting a part. | Study 09 | Tapping a node, edge, or background opens the same unselected viewer state. |
| CF13 | The mobile viewer shall support pinch zoom and drag pan. | Study 09 | Gesture tests show navigation without accidental target activation. |
| CF14 | Activating a useful part inside the viewer shall select it and open an expandable detail sheet. | Study 09 | Node, edge, and explained-group cases show the correct canonical detail. |
| CF15 | The sheet shall keep essential qualifications available in its compact presentation. | Study 09 and prior review | Loss, guard, basis, and authored caveat cases remain readable without hidden reversals. |
| CF16 | Closing the sheet shall preserve the viewer's zoom and pan. | Study 09 | View transform remains unchanged after dismissal and target replacement. |
| CF17 | Viewer Back shall restore the article's reading position and focus origin. | Study 09 | Return tests cover scrolled pages, expanded sheets, and browser viewport changes. |
| CF18 | Every supported presentation shall preserve canonical identity and reference resolution. | Existing R02, R12, R14 | Exactly one `x-ID` exists; copying an edge or group resolves to that target. |
| CF19 | The reader shall retain a keyboard-accessible text representation without per-figure toolbars. | Existing R06 and §10.5 | A document-level text view exposes all relationship/event links and useful details. |
| CF20 | No-JavaScript, print, and Markdown output shall retain the explanation and semantic relationships. | Existing R01 and R14 | Fallback and export tests pass before the new defaults ship. |
| CF21 | Authoring prompts shall choose the representation from the reader's question before choosing visual emphasis. | User authoring review request and existing R16 | Fixed source packets produce an appropriate representation with an explicit reading purpose in the existing outline. |
| CF22 | Authoring prompts shall permit omission of emphasis and groups when they add no explanatory value. | Restrained design direction | A simple neutral figure is accepted; feature use is not a quality score. |
| CF23 | Authoring prompts shall keep the central claim and decision-changing qualifications available before optional exploration. | Existing explanatory contract and study 09 | Main-path and narrow-article reading tasks succeed without opening the viewer or details. |
| CF24 | Shipped authoring guidance shall describe only the syntax and interactions supported by its toolkit. | Existing toolkit contract | Guide snippets compile; obsolete list-first and step-bar instructions disappear only when their replacements ship. |
| CF25 | Label guidance shall preserve entity identity and relationship meaning when shortening labels. | Study 08 and existing R16 | Long-name and conditional-edge cases retain disambiguating words and visible qualifications. |

## Proposed implementation design

### Source format and authored emphasis

Add an optional enum attribute, provisionally `emphasis="teal|violet|amber"`, to supported native graph node and edge tags. Use an allowlist, not arbitrary colours, CSS, or styles. Omission preserves current output. Final spelling is an implementation contract decision, not existing syntax.

All three values mean the same thing: the author draws attention to this part. They request a preferred palette, not distinct semantic categories or levels of importance. They may intentionally converge to the same weight treatment when semantic colour takes precedence. Do not invent three non-colour encodings to preserve decorative palette differences. The prompt must not use these values to encode status, confidence, ownership, or three separate meanings.

Resolve semantic styles first in `Renderer.encoding()`. Compute authored emphasis separately. If a figure already uses hue for semantic categories, retain those categories and represent emphasis through restrained weight. Do not mix a second hue meaning into that figure, including currently neutral parts. Retain semantic danger, no-fill, dash, arrowhead, and shape cues even when colour is otherwise available. Test a single-category figure as well as a mixed-category figure; adding another category must not erase authored emphasis.

Keep emphasis out of `data-vs-depth`, relationship semantics, filter tokens, and generated evidence. Attribute edits naturally change source/body hashes through the existing pipeline; they do not change target IDs or the hashing algorithm. Extend text projection explicitly to print `emphasis: teal`, `emphasis: violet`, or `emphasis: amber` on the affected part. Omitted emphasis emits no new line. This identifies an authored reading cue, not a new fact or status.

Preserve that reading cue in accessible HTML as well as Markdown. Add generated wording such as “emphasized” to affected HTML list entries and interactive SVG accessible names. Do not announce the preferred palette as the effective rendered colour. Bare parts remain noninteractive; their list entries still carry the cue. Include proxy-edge callouts as well as proxy routes in appearance tests. The route owns the accessible name and keyboard stop; the callout remains its decorative, aria-hidden pointer alias, so the same edge is not announced twice. Test that distinction explicitly. Keep this wording out of useful-depth classification and copied author quotes.

Initial emphasis support covers `node`/`edge`, `state`/`transition`, `factor`/`causal-link`, `task`/`dependency`, `stage`/`conversion`, and `concept`/`relation`. Every supported tag accepts the same three enum values. Update `SPECS` in `validate.ts`, `PartStyle`, SVG output, and `childLines()` in [project.ts](../../packages/core/src/model/project.ts). Projection does not automatically include new native attributes. Update format and family guides under `skills/visser-visual-explain/references/`. For each supported pair, test exact Markdown values, omitted attributes, and rejection of invalid values. Trace interaction markers and viewer support are included; new trace emphasis syntax is deferred because several trace edges are derived rather than authored targets.

Existing `group`, node `group`, and group `parent` attributes remain the grouping interface. Groups are currently architecture-only; this plan does not silently enable them in other families. Preserve collapse controls and proxy edge identities. Group explanations use the existing body, inline citations, and depth model, without a new explanation attribute. An emphasized edge keeps its authored appearance when a folded group replaces it with a proxy. Start with a neutral group boundary; an optional group palette is outside this plan.

### Interaction markers and precedence

Introduce a dedicated interaction-state layer rather than overloading `vs-near`. Distinguish inspection selection from reference-mode selection, even if both share restrained marker geometry. Keyboard focus appears only during keyboard navigation. Pointer hover previews only the hovered part and never clears selection.

Render selection and focus outside semantic shapes. A node's inner terminal ring remains untouched. Edge selection follows the original route and dash segments; it does not bridge semantic gaps or repaint arrowheads. Keep wide transparent hit strokes unchanged. Decorative marker paths must be noninteractive and excluded from accessibility and reference extraction. Reserve sufficient layout/viewBox clearance for their outer extent.

Remove automatic neighbourhood dimming from ordinary hover/focus. Retain explicit author focus links, authored steps, and filter interactions as separate behaviours; they must not erase selection. Replace whole-element opacity dimming with treatments that preserve label contrast. Retain useful cross-figure entity association as a distinct weak cue, not selection of every matching entity.

`marks.ts` remains the single owner of composed visual marks. Extend it or extract a small pure reducer with unit tests. Specify precedence and restoration for hover, selected target, keyboard focus, explicit focus links, steps, filters, hidden group members, and proxy edges. Avoid parallel class mutation from new viewer handlers.

### Figure framing and desktop details

Simplify `figureShell()` and CSS first. Remove generated repetition and routine bars. Keep authored steps as a readable list in document flow; preserve their IDs and part links. Do not guess that a paragraph is redundant because it resembles a label. Revise redundant example prose explicitly, and update authoring guidance to prevent new duplication.

Retain a single document-level Text view option within existing document tools. It switches mapped figures to their existing accessible lists, in place, while preserving captions, caveats, and reading position. HTML-native comparison tables, trees, and annotated text keep their native reading forms. This option is not a new button beside every figure or merely a download of `document.md`.

Extract canonical-detail movement and history from presentation hosting. Proposed hosts are local desktop figure detail, existing nonfigure desktop aside, existing standalone narrow detail, and viewer sheet. Preserve one active canonical detail globally. Useful depth continues to come from `inspectionProfile()` and `instanceDepth()`.

For figure-origin activation on desktop, insert a detail host immediately after the drawing in the figure. Prefer this stable below-figure location over a fixed side panel that competes with diagram width. Close returns focus to the exact activating instance. A detail opened from prose, a citation, or an appendix link keeps the ordinary inspector path. A direct target hash also keeps that path unless an explicit viewer context exists.

Nested evidence and definition navigation stays in the same detail host and uses target-ID history. When navigation reaches a part in another figure, use its owning figure on desktop; restore the previous host when navigating back. Never move main narrative blocks. Local hosts must be excluded from diagram-instance lookup and reference-mode chrome handling where appropriate.

### Mobile viewer and detail sheet

Treat the viewer as a new runtime controller, provisionally `packages/runtime/src/figure-viewer.ts`. Its state holds figure ID, viewport transform, selected target, sheet size, origin, and saved article position. Do not store viewer state in the existing map/list toggle set.

Use a single full-screen native dialog as the mobile presentation shell, with a nonmodal detail sheet inside it. Full-screen means filling the browser viewport; the browser Fullscreen API is not required. Reuse canonical-detail movement for the sheet. Do not open a second modal dialog for part details, citations, definitions, or reference-copy fallback while this shell is active.

Prefer temporarily moving the existing figure element into this shell and leaving a sized placeholder. This preserves SVG IDs, marker references, target instances, listener bindings, and `closest('figure')` ownership. Keep the figure's article framing and steps hidden only while it is in the viewer; preserve the diagram's own interpretation and essential qualifications. Restore the exact element before closing, printing, or changing presentation mode. Prototype this lifecycle before committing to it. If movement breaks a renderer's assumptions, keep that renderer on its accessible fallback until a capability adapter is tested. Do not clone canonical targets or duplicate SVG instance IDs as a shortcut.

Record the original viewport attributes, scroll offsets, and presentation classes before applying viewer transforms. On exit or print, restore those values before returning the figure to the article. Merely moving a zoomed SVG home leaves the article cropped. Keep any reusable viewer transform in controller state, separate from article geometry. Test zoom, pan, Close, reopen, resize, and print; the article must recover its original drawing bounds.

Mobile activation is proposed to mean a touch/coarse-pointer interaction in the existing narrow layout. A narrow desktop mouse window retains direct detail activation. Enter on the explicit viewer affordance opens the same viewer accessibly. Reference mode takes precedence over preview interception; ordinary text selection, modified links, prose citations, and text-view links retain their existing behaviours.

Gate preview activation in the capture phase. Existing fold and filter controls bind their own handlers before delegated `onClick()` runs. The entry event must not also fold a group, activate a term, select a filter, or open detail. Inside the viewer, restore those controls' normal tap and keyboard paths after gesture arbitration.

After reference-mode and modified-link bypasses, an accepted preview activation prevents default behaviour and stops propagation before target-bound handlers run. Test first entry on node, edge, group boundary, fold box, fold control, and term. Assert no detail, tooltip, selection, or fold mutation from that entry event.

Click capture alone is insufficient: existing term and edge focus handlers can show bubbles before click. Guard preview tooltip and transient-mark effects from a prospective touch entry through the completed transition. Keep ordinary article scrolling and text selection working; do not blanket-cancel pointerdown. Clear transient bubbles on entry and focus a neutral viewer control, such as Back, rather than a figure part. Cancellation releases the guard. Test before pointerup, after the entry click, and after dialog focus settles.

The viewer must expose the existing relationship/part list through a labelled disclosure inside its dialog. A toolbar outside a modal dialog cannot provide its keyboard path. Reuse the moved list instances and their stable IDs; do not add duplicate links with duplicate IDs. Keep the canvas and sheet keyboard-reachable within the one dialog. If `showModal()` is unavailable, preserve ordinary link/list inspection without hiding the explanation behind a broken preview.

Make reference UI host-aware. Mount the reference panel, status feedback, and clipboard fallback inside the active viewer dialog, following the existing tooltip host pattern. Remove them and restore origin focus on dismissal or viewer exit. Reference controls must remain usable without closing the viewer. Test exact edge and group packets, parent selection, and denied-clipboard fallback inside the modal. This requires updating `ensurePanel()`, `selectTarget()`, `showFallback()`, and `isChrome()` together.

Expose Reference mode inside the viewer's tools, using the same underlying mode state as the document toolbar. The toolbar outside the modal is inert. Route the reference panel's Open detail action to the active viewer sheet, not the existing narrow modal inspector. Define Escape priority for transient UI: clipboard fallback, reference panel or tooltip, detail sheet, then viewer. Each action dismisses one active layer. Test entry with reference mode off, enabling it inside the viewer, exact-part copying, Open detail, and exit. Restore the prior document reference-mode state on viewer exit.

Classify only viewer controls and transient panels as chrome; the drawing and target list must remain selectable in reference mode. Do not exclude the entire dialog through `isChrome()`.

| State or action | Result |
| --- | --- |
| Tap diagram preview, including a part | Open viewer, no selected target and no sheet. Consume this activation once. |
| Tap useful part in viewer | Select exact target and open compact sheet. Bare parts do not promise details. |
| Drag diagram or pinch | Change transform; suppress the ensuing synthetic click. |
| Expand or drag sheet upward | Expand sheet; long detail content scrolls within it. |
| Collapse | Return to compact sheet without replacing the selected target or resetting the view. |
| Close sheet | Return canonical detail, clear inspection selection, and focus its origin without moving the view. |
| Viewer Back | Close all viewer detail state, restore figure, article scroll, and focus. |
| Escape | Dismiss one active layer: clipboard fallback, reference panel or tooltip, detail sheet, then viewer. |
| Nested detail navigation | Replace content in the same sheet; distinguish detail-history navigation from viewer Back. |
| Resize out of mobile layout, Text view, Expand details, or beforeprint | Restore canonical detail and figure before applying the destination presentation. |

Keep zoom anchored at the pinch centre. Use SVG viewBox or transform attributes compatible with the existing strict CSP, not inline styles or a new gesture library by default. Apply touch-action restrictions only inside the viewer canvas. Preserve browser page zoom outside it. Handle pointer capture, cancellation, lost capture, multi-touch transitions, and scroll-versus-drag ownership explicitly.

Opening or replacing a sheet preserves manual zoom and pan. Pan only the minimum needed when a newly selected part is covered. Expanded sheets may cover the drawing. Do not refit the entire graph when the sheet changes size. Provide labelled non-gesture zoom/reset actions inside the viewer, not on every article figure.

Do not generate a summary by clipping a random first sentence. The compact sheet presents the beginning of the existing useful detail, with expansion and scrolling available. Extract structured material qualifications such as conversion loss, transition guard, or causal basis from the existing model into a persistent sheet summary area. Preserve authored caveats in full; when they cannot fit compactly, allow the sheet to grow or open expanded. Do not infer critical caveats from arbitrary prose or silently hide them. Source authoring guidance remains responsible for keeping decision-changing caveats in the main explanation.

### Narrow layout and figure capabilities

Reuse current wrapping and node-height calculation. Improve long unbroken identifiers, multiline edge labels, group headings, and selection-marker clearance where fixtures show failures. Do not implement mobile layout by scaling text until a wide diagram fits.

For compact native diagrams, show the readable drawing directly in the article. For larger two-dimensional diagrams, use a bounded preview with a clear exploration affordance and preserve the document-level text alternative. A preview is allowed to require exploration; it must not imply that cropped branches do not exist. Add a complete mini-overview or explicit full-diagram cue when clipping occurs. Dense authoring should still use overview plus focused figures in normal flow.

Keep a capability distinction between native SVG diagrams, asynchronously rendered Mermaid diagrams, HTML-native figures, and extension output. Native graphs and traces can use the viewer. Parsed Mermaid joins only after render success, target mapping, and a working in-viewer target list. Its drawn parts deliberately lack keyboard focus today. Test activation and screen-reader naming through its list while the modal is open; otherwise keep it on the fallback path. Unsupported Mermaid types remain figure-level targets. Extensions opt in through a verified compatible viewport rather than inferred SVG structure. No new arbitrary SVG rewriting or extension execution is needed.

### Authoring prompts and use of visual language

Treat prompting as part of implementation, with its own acceptance evidence. Preserve the existing skill's reader model, question-first catalogue selection, evidence discipline, main-path checks, and Markdown review. Extend its current workflow rather than adding another mandatory planning form.

Before styling, the author should identify what the reader must notice, which relationship demonstrates it, and what could change the conclusion. Put the reading purpose in the existing outline. Choose structure, trace, state, transformation, causation, comparison, or prose according to that purpose. A visual must expose a relationship that prose alone makes harder to recover. No new diagram family is needed for this step.

Assign each layer a distinct job:

| Layer | Authoring rule |
| --- | --- |
| Caption or title | Name the point or answer, with uncertainty intact. Do not overstate an inferred mechanism. |
| Question | Define the reading task and test whether the figure earns its place. Do not restate it in every surrounding paragraph. |
| Labels | Name the entities and actions precisely. Preserve identifiers and words that distinguish similar parts. |
| Interpretation and main-path prose | Supply a necessary reading rule, mechanism, or qualification not already clear from the drawing. No paragraph is required merely to retell the arrows. |
| Legend | Decode actual semantic marks. Do not create a second taxonomy for optional emphasis colours. |
| Part or group body | Add useful why, consequence, constraint, exception, or evidence. Leave it empty when the main view already suffices. |
| Authored steps | Explain a cross-part observation or conceptual phase. Do not narrate a routine tour of every box. |

Emphasize only the parts that help the stated reading purpose. The explanation and labels must carry that purpose without colour. Omit the emphasis if it is decoration or makes all parts equally prominent. Semantic roles, status, basis, danger, and loss remain authoritative. A preferred teal, violet, or amber accent is not a new status or confidence code. Do not instruct authors to draw runtime selection markers or work around semantic precedence with raw styling.

A group needs a source-supported organizing relationship, such as shared function, ownership, deployment, or another explicit boundary. Name which relationship it represents. Functional grouping must not imply a security or deployment boundary. An explanatory body is optional and should add a consequence or exception beyond the label. Do not add a “Misc” box just to tidy the layout or lower the visible-node count. Collapse a meaningful group only when its label and external relationships preserve the figure's answer; otherwise split by question.

An overview answers a system or boundary question. A focused figure earns a separate place by explaining a distinct mechanism, qualification, or contrast. Keep them in normal flow and reuse stable entities where the source model supports that relationship. Do not assume the `entity` attribute is legal on every tag. Zoom and collapse are inspection aids, not justification for hiding the article's main answer in a dense map.

Keep concise labels as a preference, not a reason to erase identity or move a critical condition into click-only depth. Reword or split the explanation before resorting to generic labels such as “sends data.” Preserve accurate long names and allow wrapping. Qualify the current skill's automatic three-line-label finding accordingly. Existing numeric density limits still apply; no new label, palette, or group-count quotas are introduced.

Use native visible guard, loss, and basis cues where supported. Do not assume every semantic attribute is drawn: `graphVisibleContext()` currently shows a conversion's `condition` in its list, but not its map. A condition that changes the conclusion therefore also needs visible figure text or a precise label. Test the rendered main view, not just the presence of an attribute in source.

### Prompt changes and evaluation

| Source or check | Planned change |
| --- | --- |
| `skills/visser-visual-explain/SKILL.md`, workflow steps 3–4, 7, 10–12 | Add purpose-before-styling, text roles, meaningful emphasis/groups, overview/focus choice, and narrow main-path review. Preserve evidence and reference workflows. |
| New `references/visual-language.md` under that skill | Hold concise examples and counterexamples; link it from the existing authoring/review steps. Keep the core skill within its existing 2,500-word test. |
| `references/format.md` and six native graph family guides | Document allowed emphasis tags, palette fallback, and accessible wording with compileable examples. |
| `catalogue/architecture.md` | Replace unconditional “Use it above 25 nodes” collapse advice with the meaningful-boundary test. Keep topology, identity, and hard-limit rules. |
| `catalogue/architecture.md`, `domain.md`, `transform.md`, `trace.md`, and `steps.md` | Replace obsolete control/default descriptions. Keep still-correct text-view semantics in other guides. |
| `packages/core/src/review/shape.ts` and `review/index.ts` | Revise label-length and density advice so it does not reward hidden qualifications or artificial groups. Retain advisory warnings and existing thresholds. |
| Existing skill, format-guide, catalogue, projection, and editorial tests | Check supported snippets and advisory diagnostic behaviour. Update paired fixtures only where an existing diagnostic has an objective trigger. |

Do not turn subjective composition rules into brittle lint scores. Meaningful boundaries, appropriate focal paths, and explanatory usefulness need an author or reviewer to assess the source and image. A warning is a prompt to inspect; do not fabricate group bodies, delete caveats, or shorten correct names simply to make warnings disappear. Preserve existing warnings for low-value walkthroughs and sources-only depth, without requiring detail on every part.

Add a small authoring evaluation set separate from the diagnostic fixture registry. Use fixed evidence packets and reader tasks; retain before/after authored source, Markdown, and desktop/narrow renders. Where comparing old and revised prompts, keep the generation conditions the same and record them. These comparisons are review evidence, not a claim of a measured learning-speed improvement.

| Evaluation packet | Success and counterexample |
| --- | --- |
| Branching architecture with shared function and long names | The article answers the main boundary question at 320 px. A focused figure explains one branch; a meaningful group preserves external edges. Reject a “Misc” wrapper or a viewer-only main answer. |
| Causal or dependency explanation with semantic categories | The reader distinguishes basis/status from authored emphasis in colour, greyscale, and Text view. Reject a preferred accent that implies a different confidence or completion state. |
| Lossy transform with a conditional operation | Main view retains the loss and decision-changing condition. Detail adds why. Reject a polished diagram whose qualification exists only in a part body or the conversion's nonvisible `condition` attribute. |

Include a simple neutral solution as a positive control: it should pass without adding emphasis, groups, or steps. For each packet, ask a reviewer to reconstruct the mechanism, explain any group boundary, and predict the specified change from the main path. Review the image and Markdown separately; an export cannot reveal misleading geometry. Use representative-reader feedback when available, and explicitly mark human comprehension unevaluated otherwise. Screenshots establish legibility and fidelity, not understanding.

## Work packages and delivery order

Effort is relative engineering size, not a calendar commitment. S is one local area; M crosses a few modules. L crosses compiler/runtime contracts; XL adds a new interaction system. Estimates include relevant tests and documentation.

| Package | Write scope and work | Dependency | Effort / impact | Acceptance gate |
| --- | --- | --- | --- | --- |
| P0 Contract and fixtures | Record design decisions in DOM/spec docs. Add native architecture, transform, grouped, state, and causal fixtures with distinct caveats and useful/bare details. | None | M / high risk reduction | Stable baseline identities and expected semantic output; new checks describe intended changes, not old chrome. |
| P1 Complete native slice | Emphasis schema, encoding, SVG markers, marks composition, local desktop detail host, and one narrow preview using an architecture plus transform example. | P0 | L / high | CF03–09 and CF18 on one complete path; no semantic colour or canonical-detail regression. |
| P2 Quieter article and accessible views | `figureShell`, `views.ts`, `components.ts`, reader CSS, document tools, authoring examples and guidance. | P1 | M / high | CF01–02, CF10, CF19–20; no authored steps or accessible lists lost. |
| P2A Authoring prompts and evaluation | Skill workflow, visual-language reference, affected catalogue/format guides, diagnostic advice, and authoring evaluation packets listed above. | P0; syntax examples require P1/P3; mobile wording ships with P5 | M / high | CF21–25; main-path reading tasks and supported examples pass without feature quotas or hidden qualifications. |
| P3 Family and group coverage | Shared graph kernels, group/proxy behaviour, causal/state/plan/domain markers, long-label layout tests, theme tokens. | P1; integrate with P2 | L / high | CF04–08 and CF11 across the family matrix, including nested and collapsed groups. |
| P4 Mobile viewer lifecycle | New viewer controller, single dialog, figure move/restore, event routing, detail host selection, reference and print cleanup. | P2 and P3 | L / high | CF12, CF14, CF17–20 before custom gestures are enabled. |
| P5 Gestures and sheet behaviour | Pan/zoom state, gesture arbitration, compact/expanded sheet, caveat placement, safe areas, keyboard alternatives. | P4 | XL / high | CF13–17 on touch devices; zoom/pan survive selection, close, and expansion. |
| P6 Alternate renderers and release | Mermaid lifecycle adapter, extension fallback tests, full exports, documentation and independent review. | P2A, P3, and P5 | M–L / high compatibility impact | Release matrix passes; unsupported paths degrade explicitly; design comparison and authoring examples reviewed. |

Use one writer at a time for shared `compile.ts`, `svg.ts`, `reader.ts`, and `reader.css`. Bounded fixture/document work can run separately. Use a routine worker for isolated fixtures and schema edits; use a design-capable worker for the viewer and lifecycle changes. Review the viewer and canonical identity independently before integration. No model route is assumed verified by this plan.

Do not enable the new mobile default halfway through P4/P5. Land additive capability behind an internal development switch if needed; ship diagram-first entry only when accessible alternatives and return behaviour work together. P1–P3 can deliver useful desktop improvements first.

P2 therefore changes desktop defaults first. Its mobile preview/default switch stays disabled until P4 and P5 pass together. Preserve the existing mobile list and inspection path during intermediate releases; removing mobile controls must not precede their replacement.

## Pressure tests and required corrections

| Trigger | Failure to prevent | Planned response |
| --- | --- | --- |
| A selected causal link is dashed | A solid halo implies a proven link. | Match dash geometry and keep the label and original arrowhead. |
| A state node has an inner terminal ring | Selection looks like another lifecycle state. | Separate external selection geometry; no descendant stroke-width rule. |
| Role colours already use teal and amber | Authored emphasis silently changes semantic meaning. | Resolve semantic encoding first; use weight for authored emphasis in that figure. |
| A child lies inside two nested groups | The click selects a group or colours every child. | Resolve nearest exact instance; group boundary and label own their target. |
| A group is folded during inspection | Selected child vanishes or focus points into hidden content. | Close or retarget selection deliberately, reveal hidden targets for Locate, and test proxy identity. |
| Viewer entry starts on an edge | Entry click immediately opens a sheet. | Explicit entry transition consumes that activation before generic target handling. |
| A gesture ends over a part or term | Pan/zoom opens detail or a tooltip. | Gesture recognizer owns activation suppression; term handling runs only for a confirmed tap. |
| A sheet covers the loss caveat | Optional depth hides the qualification that changes the claim. | Preserve structured caveat in the sheet; expand if needed. |
| Detail links to evidence or another figure | A nested modal or duplicate canonical ID appears. | One detail controller, one active canonical element, host-aware target history. |
| Reference mode targets an edge in a viewer | Copied packet points to the whole figure or generated chrome. | Preserve target metadata and exact target resolution; integrate copy fallback into the active shell. |
| Print or Expand details occurs during viewing | The diagram or canonical detail is absent from the document. | Restore both placeholders before the existing print/expand lifecycle runs. |
| Mermaid finishes after viewer initialization | The viewer captures an empty or unbound SVG. | Gate its capability on render completion; retain static source/list fallback on failure. |
| Label is long, unbroken, or text zoom is 200% | Text clips or outer markers overlap neighbours. | Deterministic wrapping tests plus browser inspection; do not fix by reducing type size. |

## Verification and release

Extend existing suites rather than building a second harness. Relevant starting points are `inspection-depth`, `compiler.render`, `compiler.families`, `compiler.layout`, `compiler.label-placement`, `runtime.views`, `runtime.figure-css`, `figure-interactions`, `projection`, and reference-resolution unit tests. Browser coverage belongs alongside `depth`, `journeys`, `interactions`, `domain`, `mermaid`, and `export`, plus a focused viewer spec.

Test desktop widths 1440 and 1024, touch widths 390 and 320, and narrow mouse input. Cover 200% text zoom, dark mode, forced colours, reduced motion, no JavaScript, and print. Include architecture, lossy transforms, causal dashes, terminal states, self-loops, and nested groups with external edges. Also cover branch-heavy traces, domain glossaries, comparison tables, and Mermaid success/failure. SQLite is one regression example, not the acceptance benchmark.

During implementation, run targeted checks after each package. At integration, run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:browser`, the full browser tier, `npm run test:contracts`, `npm run test:offline`, and `npm run test:budgets`. Contract checks consume test reports; run them after the applicable test suites. Use `VISSER_BROWSER_TIER=full npm run test:browser` for the existing full matrix. Add new cases where that matrix lacks modes; its current browser engine coverage is Chromium only.

Use real mobile browser checks for pinch/pan, cancellation, browser chrome resizing, safe areas, and sheet scrolling. Synthetic multi-pointer events and screenshots alone do not establish usable gestures. Validate Safari/iOS manually before calling mobile support complete. Confirm keyboard and screen-reader access to all useful parts through Text view and the active detail host.

Keep core runtime and CSS within the existing measured budget gates. Do not relax CSP, fetch remote assets, or add a client-side layout dependency to make the viewer work. Validate served, standalone, and project-subpath exports; a new Text view must work in each without requiring an external file.

No persistent source migration is needed. Old documents remain valid with emphasis omitted. Ship compiler, runtime, CSS, DOM contract, and toolkit digest together; do not mix new markup with an older reader. Older toolkits reject unknown attributes, so document the minimum supporting toolkit.

Rollback restores a retained, previously built snapshot with its matching assets. Rebuilding with the previous toolkit is valid only against a retained source revision that it supports. Do not rebuild newly emphasized source with an older validator or strip attributes from the current source automatically. For a mobile-viewer regression without retained artifacts, use the supporting compiler with the legacy mobile presentation switch retained through rollout. This does not recover an unrelated compiler defect; that case requires a corrected supporting build. Test recovery before release.

Completion means the nine studies have corresponding runtime evidence, semantic/reference contracts pass, and an independent implementation review has no unresolved material findings. Visual fidelity is checked against Penpot; comprehension benefit still requires human evaluation.

## Planning verification

This plan is based on source inspection and two bounded read-only integration reviews. No application tests or browser gesture tests were run during planning.

An independent reviewer checked draft SHA-256 `fcc4844e04b905afdea8298b5d8ba619c27cc16c828b6140b222d74b61eb9b8c` against commit `5729a84`. The following material findings were corrected in this revision:

| Finding | Correction |
| --- | --- |
| CFP-01 Incomplete source contract | Enumerated supported tags and enum values; added validator, projection, catalogue, and rejection-test obligations. |
| CFP-02 Entry event ordering | Specified capture-phase activation arbitration and first-tap checks for existing target-bound controls. |
| CFP-03 Reference UI outside modal | Required host-aware reference panel, status, and clipboard fallback, including focus restoration tests. |
| CFP-04 Mermaid keyboard path | Required an accessible target list inside the viewer before enabling parsed Mermaid support. |

The reviewer rechecked the four corrections and confirmed their behavioural resolution. The recheck also corrected the reference-panel function name to `ensurePanel()`.

A subsequent four-reviewer Sol pass covered compiler compatibility, runtime interaction, authoring composition, and visual-language prompts. Its findings, pressure tests, and dispositions are recorded in [the review record](../reviews/clearer-figures-plan-sol.md). Targeted rechecks confirmed the substantive corrections. The final wording correction makes the Escape table match the transient-layer priority.

The document checker passed with zero errors and warnings. It validates local links and structure. Requirement coverage and meaning were reviewed manually because these tables are not parsed as individual records by that checker.
