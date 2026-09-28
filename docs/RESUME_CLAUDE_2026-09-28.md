# Resume: Visser improvements after the Claude usage limit

Recovered on 28 September 2026 from Claude Code history and the current workspace.
This is a recovery record, not a new implementation approval or a final review.

## Baseline and evidence

- Repository: `/home/r/Documents/MyStuff/random_ts/visser`.
- Branch: `explain-plan`; HEAD: `ab5eec8` (`wip`).
- Claude transcript: `/home/r/.claude/projects/-home-r-Documents-MyStuff-random-ts-visser/90537d21-16b3-4a95-bc6d-6b7b110f0685.jsonl`.
- Last normal status: 28 September, 10:12 EDT. The final Penpot report arrived at
  10:33 EDT; the combined phase 6 fix report arrived at 10:44 EDT. The main
  session could not process these reports because it had reached its usage limit.
- Governing work plan: `docs/IMPROVEMENTS.md`. Specification updates:
  `docs/ARCHITECTURE.md` and `docs/REVISIONS.md`, through revision 1.28.
- The user had requested all improvements, subagent implementation, review and
  fixes, and updates to Penpot. Historical Claude model requests do not prove
  that a particular model is selected in the resumed session.
- Many tracked and untracked changes are present. Preserve them. No commit,
  push, stash, cleanup, or new feature work was done during this recovery.

## Objective and decisions

Make terse, visual explanations with useful depth on click, terms defined on
hover, and a compact canonical text form. All explanation prose follows ASD-STE
100. Semantic colour always has a shape, pattern, or text cue; blue marks action.
Each figure uses hue for at most one variable. Domain maps are a distinct
component and are suggested when useful, not required at the start of every doc.
Mermaid remains available as an escape hatch; the opt-in extension split is later
work. Static, narrow-screen, print, and Markdown forms must keep the full meaning.

## Implementation state

| Phase | Work | State at interruption |
|---|---|---|
| 1 | Palette, semantic cues, legends, simpler boxes | Implemented, reviewed, fixed |
| 2 | List toggle, richer inspector, neighbourhood hover, term auto-links | Implemented, reviewed, fixed |
| 3 | Evidence on parts, task due dates | Implemented, reviewed, fixed |
| 4 | Domain map, concepts and relations, glossary | Implemented, reviewed, fixed |
| 5 | Skill rewrite, STE and editorial prompts, Mermaid demotion | Implemented, reviewed, fixed |
| 6a | Steps, note, self-check, measure, tree, trace observations, annotated diff, decision guide | Implemented and reviewed; final fixes landed |
| 6b | Folding, cross-figure highlight, edge quantities, filter chips | Implemented and reviewed; final fixes landed |
| Penpot | Final component and reader UI design pass | Worker reported complete; relevant boards confirmed present by MCP |
| Final review | Independent review of the combined final fixes | Outstanding |
| Dogfood run 3 | Rewrite and evaluate the two authored explanations | Outstanding |

The final fixer addressed phase 6a C1–C16 and S1–S4, and phase 6b F1–F14 and
F16–F19. F15 was accepted without a code change. Reports are in
`docs/reviews/phase6a-components-review-1.md` and
`docs/reviews/phase6b-interactions-review-1.md`; these are the original reviews,
not reviews of the final fixes.

Important final changes confirmed in source:

- `packages/runtime/src/marks.ts` owns hover, focus, steps, chips, folds, and
  entity marks, with one function to compute near and dim states.
- Diffs have a 2,000-line cap per side, strip common prefixes and suffixes, and
  share computed rows between HTML and text projection.
- A folded group keeps its dashed boundary; print unfolds it; focus links reveal
  hidden targets. Fold boxes derive marks from their hidden parts.
- The domain glossary layout uses a 632 px map-width threshold. Domain values
  have a double outline; cardinality is in the relation label.
- Example capture inputs live in `examples/_sources/`, outside bundle roots.

## Verification evidence

The final worker reported successful typecheck and build, a bounded diff memory
probe, axe checks, print checks, and screenshots in
`docs/validation/improvements-1/phase6-fix/`.

Recovery independently read the saved reports, without rerunning the suites:

- `reports/vitest-junit.xml`: 1,418 tests, 1 failure, 0 errors (1,417 passed).
  Failure: `tests/unit/distribution.ustar.test.ts`, the decompression-bomb fixture
  expects a ratio below 1000, but obtains about 1028.51. Earlier workers also
  reported this as a baseline failure. It remains unresolved.
- `reports/playwright.json` and `playwright-junit.xml`: 249 passed, 115 skipped,
  0 failures, 0 flaky tests. The run finished at about 10:43 EDT.
- The worker reported that `node scripts/check-contracts.mjs` exited 1 because
  of that archive test; hash vectors passed 95/95. This is reported historical
  evidence, not a fresh recovery run.
- Penpot MCP read-only queries confirmed the light and dark note, self-check,
  measure, tree, steps, and annotated boards, plus fold states, filter legend,
  inspector, and wide view-bar. Recovery did not visually re-export them.

## Next bounded work

1. Independently review the final phase 4 and phase 6 fixes against the original
   findings, accepted decisions, integrated source, and saved test evidence.
   Preserve the existing patch; do not repeat completed implementation or the
   final Penpot pass without a new finding.
2. Resolve material findings. Run affected checks after changes. Keep the known
   archive-test failure explicit rather than calling the complete suite green.
3. Run dogfood 3 with the revised repository skill on:
   - `docs/explanations/how-visser-works/index.md`
   - `docs/explanations/life-of-a-target-id/index.md`
4. Measure the targets in IMPROVEMENTS §12.5: fewer than 1,200 main-path words
   for teaching, fewer than 120 words before the first figure, no over-limit
   labels, `reader.mustUnderstand` present and answered by the main path, and
   zero review prompts after fixes. Validate wide, narrow, text, and no-JS views.
5. Record the results as dogfood 3. The comprehension trial and human gates
   remain separate; do not infer understanding from word counts or tests.

Known smaller follow-ups from the final worker: H1 proxy-label collisions;
the time-scale trace axis still says "Order layer"; optional chip-group labels
and neighbourhood hover for fold boxes. Penpot has a reported stray empty
100 × 100 board at 0,0 on the Reader UI page. No cleanup is required to resume.

No running job is owned by this recovery task. Both final Claude workers have
completion records. Process visibility in the sandbox does not establish whether
an unrelated host process is still active.

## Resumed work — 28 September 2026

The user subsequently authorized completion, real dogfooding, and fixes. The
outstanding final review and dogfood run are now documented in
`docs/reviews/final-improvements-review-2.md` and `docs/validation/dogfood-3.md`.
Revision 1.29 records the additional implementation changes. The archival
baseline failure above was repaired in its test fixture without changing archive
extraction policy. Both teaching documents were rewritten and exercised against
the current working tree. Consult the dogfood report for final verification;
this record's earlier counts describe the recovered baseline only.
