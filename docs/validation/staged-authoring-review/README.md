# Default staged authoring review

Date: 2026-10-04. Repository baseline: `5729a84001f6b2877b93ebc388538cbd0464ee83`
plus existing uncommitted clearer-figures work. This change edits authoring
instructions only. It does not add a model service or change CLI diagnostics.

## Design decision

The core skill now requires [review-process.md](../../../skills/visser-visual-explain/references/review-process.md)
before the outline and applies its passes by default to new documents and
substantive revisions. Small edits use the same lenses on affected content.

The process separates evidence and meaning, terminology, diagram clarity,
clickable depth, and a final cold-reader test. Authors revise before that final
test. The passes require concrete evidence, not a quality score or a finding
quota. One fresh reader can serve the final test; five agents are not required.

Alternatives rejected: one general "make it clearer" critique hides different
failure modes; an agent per stage adds cost without ensuring independence;
mandatory diagrams, definitions, and clickable bodies reward filler. The guide
keeps positive controls and allows no findings. Existing lint remains advisory.

## Independent review and pressure test

A Terra reader inspected the original prompt and deterministic review code.
It identified gaps in phrase-level ambiguity, main-path prediction evidence,
visual meaning, and added click value. These informed the staged guide.

A second fresh Terra reader applied the draft guide to [packet.md](packet.md),
without the first review or an answer key. The packet contains fictional source
facts, flawed drafts, and valid controls. It is not an executable document.

The probe identified the unsupported payment-success claim, missing queue and
incorrect provider boundary, unqualified duplicate-prevention guarantee,
ambiguous policy revision, circular definition, hidden image loss, redundant
HTTP definition, and empty bodies. It preserved the prose-only answer, explicit
source-inspection link, distinct long labels, and the useful resize explanation.

The parent checked the findings against packet sources and revised the process:

| Finding | Pressure test and disposition |
| --- | --- |
| Expected answers were only implicit. | Added a source-backed answer per task, including conditions and unknowns. Keep it out of the cold-reader packet. |
| "Test a claim" could imply execution. | Clarified source-based or hypothetical testing. Code execution still requires separate authorization. |
| Reviewer recommended retaining a boundary-only detail. | Partly rejected. The caveat belongs on the main path; retaining an otherwise empty body then adds repetition. Added a post-move depth recheck. |
| "Much smaller" was treated as a file-size claim. | Qualified: this is ambiguous, not proof of a false byte-count assertion. Specify dimensions and state the unknown file size. |
| A suggested queue-to-worker chain could imply chronology. | Accept explicit queue/read relationships, not automatic sequence semantics. The guide retains representation-by-question and direction checks. |
| Long-label preservation conflicted with the core word limit. | Changed the core wording to a review signal, preserving the existing numeric thresholds and identity requirement. No lint threshold changed. |

This is a semantic prompt probe with sources provided, not R5 main-path testing,
a controlled old/new generation experiment, or a representative-reader study.
No render or interactive document existed in the packet. The reviewer correctly
left visual, interaction, structural-validation, and cold-reader claims unproven.

## Verification

- `npm test -- tests/unit/skill.test.ts tests/unit/format-guide.test.ts tests/unit/review.prose.test.ts`: passed, 3 files and 107 tests.
- Initial sandboxed test setup could not spawn its build subprocess. The authorized retry outside the sandbox passed.
- `npm run build`: passed. The final test setup also rebuilt the toolkit after the last prompt corrections.
- `skill show --dev-toolkit dist/release --json`: verified the mandatory guide reference, guide discovery, and 2,394-word core skill, below 2,500.
- Final development toolkit: `6b10d157617182d35a94f239f4f9430f63a1960d4190a5ef0600995cad097833`.
- `git diff --check`: passed. Work-cycle Markdown checks cover the changed skill, guides, and this evaluation record.

The build includes the new default. No release was installed, trusted, or
published. Existing documents still use their pinned toolkit until deliberately
updated. Existing application changes and prior validation records remain intact.

## Next comparative evaluation

Use the same source packets, reader tasks, model settings, and toolkit behavior
to compare the previous and staged prompts. Keep generated drafts and review
revisions. Blind the task reader to the prompt variant and author's answer key.
Compare supported task answers, misunderstandings, useful versus empty details,
and unnecessary content additions. Record generation/review cost and elapsed
time. Judge rendered diagrams and main-path coverage separately from full exports.
Do not claim the staged prompt improves comprehension until that comparison or
a representative-reader study supports the claim.
