# Default staged review

Use these passes for every new explanation and substantive revision. They are
separate review tasks, not a requirement to launch one agent per pass.
For a small edit, inspect the changed content and its dependent claims,
definitions, figures, and details. Keep existing IDs and reference safeguards.

## Prepare a testable explanation

Start with the reader profile and `mustUnderstand` tasks from the core skill.
Use the supplied context to distinguish known concepts from unfamiliar local
terms. Do not assume that an experienced engineer knows this project's language.

Write a source-backed expected answer for each task, including its conditions
and unknowns. Keep this answer key out of the cold-reader packet. Decompose a
compound task if its parts require different evidence.

For each section, note its question, answer, source, representation, and likely
misreading. Name any condition that changes the answer. Choose prose, a table,
or a neutral figure when these explain the question well.

For each planned clickable explanation, name the follow-up question it answers.
Draft the main path first. A main path is the visible article and figures before
the reader opens optional details. It must explain the mechanism and its limits.
Do not postpone necessary meaning until a click.

## Review protocol

Complete R1–R4, revise, then run R5 on the revised artifact. An early structural
finding can justify revision before the next pass. Run `visser check DOC` before
rendering. Use `visser check DOC --review` as input, not as proof of clarity.

For claims about persistent changes, compatibility, or recovery, use an independent
source-aware R1 reviewer when available. Give it the draft, reader tasks, and
source packet, without the author's expected answers or earlier findings.
It may also review R2–R4. Check its findings against evidence before revising.
Keep this review separate from R5: a source-blind reader tests the explanation,
but cannot independently establish that its claims are true. If separate review
is unavailable, record that limit; do not label self-review independent.

Keep a short working record outside the reader-facing document. Each finding
names the pass, target ID or exact phrase, likely wrong interpretation, evidence,
and smallest useful correction. Mark it fixed, rejected with a reason, or
unresolved. A pass may return no findings. Do not produce a numeric quality score.

## R1 — Meaning and evidence

Ask: **What can the reader wrongly conclude, and does the evidence rule it out?**

- Reconstruct each main claim from the cited material. An excerpt supports only
  its contents. Preserve contradictions, uncertainty, and missing information.
- Check actor, action, direction, scope, units, conditions, and causal basis.
  Distinguish one observed run from a general guarantee.
- Test a relevant boundary or changed condition. Does the proposed conclusion
  still follow? A hypothetical test must not become a new asserted system fact.
- Remove empty sections, generic praise, and repetition. A heading should give
  an answer. A comparison shows differences; it does not invent a winner.
- Find claims of prevention, completion, durability, ownership, or eventual
  success. Check their conditions rather than trusting familiar terminology.
- For operational explanations, state what changes, what remains, and which
  existing state can be replaced. Distinguish creation, repair, verification,
  and refresh. Naming a command does not explain its effects.
- Replace vague branch conditions with the actual decision rule. Separate a
  default from an override and identify precedence. State scenario inputs,
  including assumed defaults. Branch selection does not prove successful execution.
- When math is material, check each symbol, unit, assumption, and equality or
  inequality boundary against the source. Test a changed input at the boundary.

Evidence: point to the supporting source and main-path target for each
`mustUnderstand` answer. State an unsupported answer as unknown, narrow the
claim, or request missing material if it blocks the task. Do not investigate
a new system or invent a mechanism merely to finish the document.

## R2 — Terminology and prerequisites

Ask: **Which words require knowledge this reader has not yet received?**

Read titles, questions, labels, legends, prose, definitions, and clickable
bodies in their reading order. Check phrases, not only acronyms or repeated words.

- Flag local terms, overloaded ordinary words, unexplained abbreviations,
  vague relationships, ambiguous pronouns, and changes of name for one entity.
- Explain an unfamiliar phrase in plain language. Expanding its acronym is
  insufficient if the expansion still requires unexplained concepts.
- Check definitions for circularity and unfamiliar prerequisites. A definition
  of "commit point" as "where commit happens" supplies no meaning.
- Give essential meaning at first need in the visible explanation. A linked
  definition or hover alone does not establish that the main path is clear.
  Use a canonical `definition` for a recurring term and aliases for its forms.
- Keep terms the reader already knows. Replace needless jargon with a direct
  phrase; do not build a glossary for ordinary words or rename exact identifiers.
- Check proper tool names as well as technical terms. Give an unfamiliar tool
  its relevant role at first need, or omit the name if its identity adds nothing.
- Preserve uncertainty. If a source provides no quantity, say it is unknown
  instead of inventing a number to satisfy a prose warning.

Evidence: record the ambiguous phrase, the reader's likely interpretation, and
the clarification location. Check the sentence again with the new definition.
If the definition needs another unknown term, explain or remove that dependency.

## R3 — Diagram meaning and visual clarity

Ask: **What does the geometry tell a reader before they read the explanation?**

First read each figure with its title, legend, and adjacent main-path prose.
Then isolate the drawing to detect misleading geometry. Do not require every
standalone drawing to repeat the whole article.

Apply the matching catalogue's figure-specific checks. For a central, difficult,
or persistently misunderstood figure, consider [selective specialist review](figure-review.md).
Keep the final whole-document pass; local corrections must preserve shared meaning.

- State the answer to its question. Trace the important path by naming the
  actor, relationship, direction, and relevant condition. Check each arrow's
  meaning, not merely whether an arrow has a label.
- Check whether layout implies sequence, causation, scale, or a shared boundary
  that the source does not support. Verify guards, loss, and joins that need
  multiple inputs. Keep uncertainty visible.
- For a flowchart, trace one contrasting decision outcome and any retry. Check
  that group color does not imply an outcome, priority, or execution order.
- Distinguish entities with similar names. Check that shortened labels retain
  identity. Split by reader question before hiding meaning in a tooltip.
- Replace a figure with prose or a numbered list if it only draws a straight
  sequence and adds no useful timing, branching, or relationship information.
- Follow `visual-language.md`: groups need supported boundaries; emphasis directs
  attention without inventing categories. Test the answer without color or clicks.
- Inspect the rendered figure at 1440 CSS px. Investigate labels that wrap to
  three lines, overlapping labels, figures taller than 700 px, and nodes with
  more than six edges. These existing review signals are not proof of a defect.
  Keep a justified hub or long label when it remains clear. Never shrink text
  or invent groups to satisfy a threshold.
- Inspect article flow at 390 and 320 CSS px. Check readable labels, order,
  qualifications, clipping, and continuity between overview and focused figures.
- Check the space before the drawing. Remove repeated section titles, figure
  titles, questions, and introductions that make the same point. Keep distinct
  meaning and needed legends; do not force every figure into one screen.

Evidence: record the wrong interpretation or actual rendered collision and
where it occurs. Source inspection alone cannot establish rendered clarity.
If rendering is unavailable, mark visual checks unperformed.

## R4 — Useful depth and interaction

Ask: **What does this click let the reader explain or predict that they could
not explain or predict before?**

Inspect each authored part body and `detail`, including edge and group bodies.
For each one, identify what is already visible, its follow-up question, new
answer, and source basis.

- Keep a supported mechanism, invariant, constraint, contrast, failure behavior,
  consequence, or worked example that resolves a likely question.
- Remove label paraphrases, generic importance claims, copied paragraphs, and
  citations presented as explanation. A source-only inspection can be useful
  for verification; retain it when that is its purpose and do not call it depth.
- Do not make every part clickable. Omit an empty body or combine repeated
  explanations in their canonical owner. Color and membership do not merit a body.
- Check whether important decision points and effects have unanswered follow-up
  questions. A source-only click may verify code while leaving its consequence
  unexplained. Add depth for that question, not to meet a coverage percentage.
- Keep the main conclusion and decision-changing conditions in the main path.
  A detail explains why a qualification applies; it must not reverse the visible
  answer. Repeating a short condition for context is acceptable.
  After moving a hidden caveat into the main path, reassess the remaining body.
  Remove it if it now only repeats that caveat and adds no useful explanation.
- Test a click on each distinct interaction type used by the document. Check
  that it opens the intended explanation and that closing restores context.
  On desktop, useful figure details open in page flow. On narrow touch screens,
  the first tap opens the viewer; a later tap selects a part and opens its sheet.
  Check labels, qualifications, selection versus emphasis, and return navigation.

Evidence: name a concrete question and the sentence that answers it for each
authored body. An empty or unsupported answer warrants deletion or revision,
not invented content. Record interaction checks separately from text inspection.

## R5 — Cold reader and regression check

Ask a fresh reader to perform the `mustUnderstand` tasks without the author's
outline, expected answers, earlier review findings, or source packet. Supply the
reader profile and neutral questions that do not reveal the answer.

Use a fresh subagent if available; otherwise perform and label a self-check.
Do not require additional agents for each editorial pass. An agent reader is
not a representative-human comprehension study.

Test these presentations separately:

1. Main path: the article with optional bodies closed. The Markdown export can
   include bodies, so do not use the full export as proof of main-path coverage.
   If needed, prepare a faithful main-path extract and identify it as an extract.
2. Diagram: ask the reader to trace the relevant relationship and state any
   ambiguity. A text-only reader cannot judge a screenshot they have not seen.
3. Depth: after the main-path answers, open a relevant detail and ask what new
   question it resolves. Assess whether it clarifies rather than contradicts.
4. Markdown: check whether the export preserves relationships, qualifications,
   and meaning without relying on color, hover, or geometry.

Request answers with the phrase or target that supports each answer, plus
uncertainties. Judge answers against the source-backed expectations from R1.
A correct guess based on outside knowledge does not prove document coverage.
An unsupported reviewer criticism is not a required edit.

If a decision point changes the outcome, include a contrasting case at that point,
such as a changed prerequisite or existing target. Keep the question neutral
and check the answer against source evidence. Do not test only the worked example.
When math is material, include a boundary case and ask the reader to interpret
the symbols, units, and inequality before checking the calculation.

Fix material misunderstandings and rerun the affected task on the revised
presentation. Do not restart every pass for punctuation. If the same material
failure survives two revisions, reconsider the representation, scope, or missing
evidence. Do not continue cosmetic rewrites or claim the problem is resolved.

## Final gate and delivery

After edits, rerun structural validation and review affected IDs, citations,
terms, and relationships. Rebuild and re-export changed artifacts. Reinspect
changed figures and interactions; an earlier screenshot covers an earlier draft.
Recheck each cited excerpt beside its claim as required by the core skill.

Keep the stage checklist and review discussion out of the published explanation.
Deliver the artifacts, important corrections, checks actually completed, and
unresolved limitations. Do not claim a visual pass, independent review, or
reader comprehension test that did not occur.
