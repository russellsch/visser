# Clearer figures plan review

Date: 2026-10-04. Scope: review and revise the [implementation plan](../plans/clearer-figures.md), including its authoring prompts. Application implementation remains unstarted.

## Review baseline

Repository commit: `5729a84001f6b2877b93ebc388538cbd0464ee83`.
Initial plan SHA-256: `8eb21f7ac90e99da8b1ff7e78885497e302f152174faa74fba8a7d4340dfa526`.

Four fresh subagents reviewed bounded, distinct areas without editing files:

| Reviewer | Scope |
| --- | --- |
| `sol_plan_core` | Source contract, encoding, accessible projection, groups, and compatibility |
| `sol_plan_runtime` | Viewer entry, modal reference workflow, focus, and interaction lifecycle |
| `sol_prompt_composition` | Question-first authoring, composition, text roles, and document evaluation |
| `sol_prompt_language` | Visual grammar, meaningful groups, label rules, and review prompts |

All four were requested through native delegation with `gpt-6-sol`, high reasoning, and no inherited conversation. Independent provider-level model verification was not exposed. Two initial attempts returned capacity errors; retries used the same requested model and produced reviews. No substitute model was requested.

The parent checked returned claims against the relevant code and authoring guidance. The reviewers' findings were treated as hypotheses requiring evidence, not automatically accepted changes.

## Findings and pressure tests

| ID | Finding and evidence | Parent assessment and disposition |
| --- | --- | --- |
| SR01 | New emphasis was absent from accessible HTML lists and SVG names. `compile.ts` list generation and `svg.ts` names do not currently include it. | Accepted. Require neutral “emphasized” wording in HTML lists and interactive SVG names. Keep bare parts inert and exclude generated wording from author quotes and depth classification. |
| SR02 | Three authored palettes converge to one weight treatment when semantic colour is active. Reviewer proposed binary syntax or three distinct non-colour treatments. | Clarified the contract; rejected that forced choice. The user requested colour options, not three new meanings. Palette values are interchangeable preferences for the same emphasis cue. Intentional convergence preserves semantic encoding. |
| SR03 | Folded proxy callouts render separately from styled edge routes in `svg.ts`. | Accepted as focused coverage. Include callouts in appearance and accessible-name tests without redesigning proxy routing. |
| SR04 | Click capture cannot prevent tooltips created earlier by term/edge focus handlers in `reader.ts:1040` and `reader.ts:1053`. | Accepted with a narrower remedy. Guard transient effects during prospective entry and focus a neutral viewer control. Do not blanket-cancel pointerdown and break article scrolling. |
| SR05 | The document reference toggle is inert during a modal viewer. Panel Open detail also calls the ordinary inspector path. | Accepted. Add a viewer reference-mode control sharing the existing state. Route Open detail to the sheet. Do not classify the whole viewer as chrome. Test entry with reference mode initially off. |
| SR06 | Authoring guidance was an unspecified P2 item without a quality acceptance gate. | Accepted. Add P2A, CF21–25, exact skill/guide/review scopes, fixed source packets, and main-path reading tasks. Preserve existing question-first and evidence rules. |
| SR07 | Prompting did not explain when emphasis helps. | Accepted. Start with the reading purpose and focal relationship. Permit no emphasis. Keep semantic category, basis, status, danger, and loss cues authoritative. Do not score feature adoption. |
| SR08 | Existing architecture guidance says to collapse above 25 nodes; density advice suggests folding without checking meaning. | Accepted. Require an explicit source-supported organizing relationship. Reject arbitrary “Misc” groups used to evade density. Preserve existing limits. Keep group bodies optional, as the user requested. |
| SR09 | Caption, question, interpretation, labels, details, and steps lacked distinct authoring jobs in the plan. | Accepted. Add a text-role table and prompt changes. Remove repetition through explicit author edits; preserve unique qualifications and evidence. No mandatory paragraph for every figure. |
| SR10 | Hard short-label advice can hide the mechanism or erase long names. | Accepted. Qualify the skill's four/five-word guidance, three-line warning, and label warning advice. Preserve accurate names and critical conditions. No new numeric limits. |
| SR11 | Overview/focus and mobile design were described as renderer behaviour rather than authoring choices. | Accepted. Give each figure a distinct question. The article must convey its central claim before zoom or depth. Use stable entity reuse only on supported tags. |
| SR12 | Guides still describe list-first maps and generated step bars. | Accepted selectively. Architecture, domain, transform, trace, and steps contain affected descriptions. Other guides already describe valid text semantics; do not rewrite them merely for uniformity. |

Two details in the authoring recommendations needed further pressure testing. A functional group can communicate meaning without representing a physical boundary. The plan therefore allows functional grouping and forbids implying an unsupported security or deployment boundary. Also, a conversion's `condition` is not shown on the current SVG map: `graphVisibleContext()` lists it only for the text view. The plan requires a decision-changing condition in visible figure text rather than assuming its source attribute makes it visible.

## Additional parent checks

| ID | Trigger and consequence | Correction |
| --- | --- | --- |
| SP01 | Moving a zoomed SVG back into the article can retain a modified viewBox or transform and crop the article drawing. | Snapshot and restore viewport attributes, scroll offsets, and presentation classes. Store reusable viewer transforms separately. Test exit, reopen, resize, and print. |
| SP02 | The previous toolkit rejects new emphasis attributes, so “rollback and rebuild” cannot compile current source. | Restore retained matched output, or rebuild a compatible retained source revision. Never strip new attributes automatically. Retain the legacy mobile switch through rollout for viewer-only regressions. |
| SP03 | P2 could switch mobile defaults before the viewer and sheet work. | Change desktop defaults first. Keep the legacy mobile path until P4 and P5 pass together. |

## Recheck and remaining validation

Targeted recheck plan SHA-256: `ab8cd8b5466d555006375baaa7e98f385d2ade69b877c7ff7e3a701a0eb70780`.

The compiler reviewer confirmed the revised emphasis contract, accessible cue, proxy tests, staged rollout, and rollback. The runtime reviewer confirmed both runtime findings were addressed. Its recheck found conflicting Escape descriptions; the final table now matches the stated fallback/panel-or-tooltip/sheet/viewer priority. The visual-language reviewer confirmed all five authoring recommendations were addressed, including the overlapping composition findings.

Only the plan and this review record changed. No application tests, generation comparisons, device interactions, or comprehension studies ran. Source inspection supports the integration findings; document checks validate links and structure. The implementation plan retains the browser, accessibility, export, authoring-example, and human-validation obligations for implementation.
