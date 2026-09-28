# Dogfood 3 — final improvements verification

28 September 2026. Continued the interrupted Claude implementation in the same
working tree. No commit or publication was made. The repository's
`skills/visser-visual-explain/SKILL.md` governed the authoring pass.

## Real tasks and outcomes

Rewrote **How Visser works** and **The life of a target ID** against current
source evidence. Cheap author agents handled each document; a separate reader
reviewed their text, a separate reviewer checked product fixes, and an Astra
reviewer inspected the final screenshots.

| Document | Main-path words | Words before first figure | Targets | Figures | Review prompts |
|---|---:|---:|---:|---:|---:|
| How Visser works | 406 | 33 | 59 | 3 | 0 |
| The life of a target ID | 706 | 40 | 99 | 4 | 0 |

Both have explicit, answered `reader.mustUnderstand` outcomes and labels within
the review limits. Sources were captured from the authorized working tree.
The first explanation deliberately retires removed IDs rather than silently
reusing them. A linear edit diagram became a numbered list.

The target-ID task also exercised real CLI packets in a scratch repository:
exact resolution, unrelated edits, changed target text, acknowledgement refusal,
refresh with both acknowledgements, guarded replacement, retirement, and moving
a marked target. All produced the expected result. A separate build-option probe
kept the source revision and packet exact while changing the build ID.

## Defects found and fixed

- Adjacent narrow-screen citations had overlapping invisible hit areas. Real
  page clicking exposed the failure. Citations now occupy separate in-flow
  44 px boxes; a browser regression clicks both citations and short terms at
  320 and 390 px.
- Reference-root rejection did not tell an author where a document could live.
  The same confinement check now names configured roots and an example path.
- A timed event could precede its declared prerequisite. Validation rejects that
  contradiction, permits equal timestamps, and clarifies order-layer positioning.
- Folded-edge labels could overlap nearby parts. Placement now considers the
  whole label and only obstacles that can appear in the same fold state.
  Off-route fallback panels name their endpoints and use distinct foreground
  keys. Full panels and keys avoid collisions, expand the viewBox, and support
  light, dark, and forced colors. Independent final review reports no material
  findings; it also exercised 20 simultaneous callouts.
- The review found source/explanation gaps around write refusal, trust rationale,
  normalization, and build identity. The page and captured evidence were corrected.
- Test infrastructure had a zlib-sensitive compressed fixture, an assumed empty
  PATH, and fixed browser ports that could connect to an unrelated server. Each
  now tests its intended condition explicitly. A negative packet fixture also
  now always changes its random hash; previously a hash starting with `f` could
  leave the supposedly invalid packet unchanged.

## Browser and reading evidence

`dogfood-3/browser-checks.json` records both documents at 1440 px light and dark,
390 px, 320 px, and 1440 px with JavaScript disabled. All ten runs had zero page
overflow, page errors, or off-origin requests. The eight JavaScript runs had zero
axe findings under WCAG 2/2.1 A/AA and best-practice rules. Term and evidence
inspectors opened; desktop hover worked; keyboard inspection returned focus.
Print-media and viewport screenshots are saved alongside the JSON. The Astra
visual reviewer found no material layout defect in sampled desktop, dark, mobile,
print, and no-JavaScript regions. At 320 px the glossary uses horizontal scroll;
its initial view is cramped. Element-only screenshots can crop breakout figures;
full-page screenshots are the acceptance evidence. Print pagination was not tested. The synthetic crowded-route render is recorded
in `r5-visual.json` and `r5-{light,dark,forced}.png`; this tests fallback association
under deliberate occlusion, rather than representing a normal authored layout.

`dogfood-3-cold-read.md` records the independent text read and its corrections.
`dogfood-3-how-author.md` and `dogfood-3-target-author.md` contain the source,
reference-operation, authoring, and timing evidence. Final implementation review
is in `../reviews/final-improvements-review-2.md`.

## Final integrated checks

All commands used Node 24 (`PATH=/usr/bin:/bin:$PATH`).

| Check | Final result |
|---|---|
| `npm test` | 86 files, 1,426 tests passed |
| `VISSER_BROWSER_TIER=full` Playwright | 601 passed, 392 conditionally skipped, no failures |
| `npm run typecheck` | Passed |
| `node scripts/check-contracts.mjs` | 95/95 hash vectors agree; 42 traceability entries (39 covered, 3 partial) |
| `node scripts/check-budgets.mjs` | All 16 size/count/limit gates passed; timing mode not run |
| `git diff --check` | Passed |
| Independent final implementation review | No material findings |

Machine reports are `reports/vitest-junit.xml`, `reports/playwright.json`,
`reports/playwright-junit.xml`, and `reports/budgets.json`. The final development
toolkit digest begins `8d7554a96569`. Intermediate failures were corrected or
rerun; one budget subprocess stalled during overlapping suites, then both its
isolated negative-gate run and the sequential complete suite passed.

A local preview of How Visser works is served on port 39127 and queued in the
Codex browser panel. Its source revision is
`2a1bce38393d56d828604103adfc6452781fb008df85d0a6a0171e3ce0b6da2b` and build ID is
`87e1c5f6a707c728e10e1c6def04334bfe2b3283315c2408a387646880817748`.

Penpot MCP read and write operations succeeded. At the user's request, the
citation touch targets and crowded-edge callouts are integrated into the existing
`ui / citation-group` and `figure-part / edge` boards on `Visser — Reader UI and
figure parts`. The separate corrections board was removed. Updated component
notes and obsolete implementation-status wording, adjusted section spacing, and
exported both component boards to check layout and text.
Citation board: `806d8709-0231-8021-8008-b4ada1fd6c4b`.
Edge board: `806d8709-0231-8021-8008-b4ae59327dfa`.

No human comprehension trial, physical touch trial, or screen-reader session was
run. Those existing human acceptance gates remain separate from agent review,
automated accessibility, and mouse/keyboard browser checks.
