# Dogfood run 2: "The life of a target ID"

Date: 27 September 2026. Toolkit: `dist/release` built from commit `0f6959a`,
digest `89362ea5dff0…`. The author was an agent (Claude Opus 5.5) that
followed `skills/visser-visual-explain/SKILL.md` and the guides it names. The agent
installed the toolkit with the README's install step into a temporary
`VISSER_HOME` and ran every command through the installed user shim. The
agent used `--dev-toolkit dist/release` only for the steps that the skill's
rule for the toolkit's own repository covers.

## Result

- Document: `docs/explanations/life-of-a-target-id/index.md`.
- Reading words: 1,734, without markers, tags, and captured code.
- Targets: 86. Visuals: 1 `transform` (5 stages, 5 conversions), 1
  `graph mode="state"` (5 states, 8 transitions), and 1 `compare` (4 options,
  4 criteria, 16 cells). There are also 2 definitions, 1 list, and 12 git
  excerpts at `0f6959a`.
- `check`: exit 0. `check --review`: exit 0, `review: 0 prompts`.
- `check --verify-origins`, without `--repo-map`: exit 0. All 12 sources are
  `origin-matched`.
- `export --format markdown`: exit 0. The text carries every relationship with
  its label.
- `build`: exit 0. `serve`: the page loaded with no console errors at 1440,
  390, and without JavaScript. No width had a horizontal scroll.
- Reference flow on a copy in a temporary Git repository. Each result matched
  the claim on the page:

| Step | Exit | Result |
|---|---|---|
| `refs show DOC p_hashes` | 0 | |
| `refs resolve` | 0 | `exact` |
| Edit another block, then `refs resolve` | 5 | `stale`, `targetBodyUnchanged: true` |
| Add a block without a marker anywhere, then `refs resolve` | 2 | `missing`, `E_REF_BROKEN` |
| Remove that block, then `refs refresh` without `--acknowledge-stale` | 5 | `E_REF_STALE`; current text on stderr |
| `refs refresh --acknowledge-stale` | 0 | new packet resolves `exact` |
| Convert the file to CRLF, then `refs resolve` | 0 | still `exact` |
| `refs replace` | 0 | the old packet resolves `stale`, `targetBodyUnchanged: false` |
| `refs retire --replacement p_quote_role` (merge) | 0 | the old packet resolves `deleted` with "Advisory replacement: p_quote_role" |
| `cp -r` the bundle, then `refs resolve` | 2 | `ambiguous` |
| `refs replace` with a replacement without its marker | 2 | "the replacement must start with `<!-- vs:id p_retire -->`" |

## Lock convention

The skill's rule for a document in the toolkit's own repository applied. The
agent created the bundle with `visser init` through the shim, which wrote a
`visser.lock.json` that pins the installed digest. The agent used the lock while
it wrote the document, and removed it at the end, as the examples and round 1
do. Without the lock, `visser check DOC` through the shim exits 3 with a clear
message, and `visser check DOC --dev-toolkit dist/release` exits 0. To build
the document, run:

```sh
node dist/release/bin/visser.cjs build docs/explanations/life-of-a-target-id/index.md --dev-toolkit dist/release
```

## Time for each step (wall clock)

| Step | Time |
|---|---|
| Build, install, read the skill, `format.md`, and 3 catalogue guides | about 1.2 min |
| Read the code for IDs, hashes, resolution, refresh, replace, and retire | about 0.8 min |
| `init`, 10 captures, write the draft, first `check` (exit 0) | about 2.5 min |
| `--review`, `--verify-origins`, markdown export, build, serve | about 0.5 min |
| Screenshots, fill 6 empty cells, 2 more captures, fixes of 4 claims, reorder sources | about 3 min |
| Reference flow on a copy, lock convention, this log | about 3 min |

The model time between tool calls is included. The first draft passed `check`
with no error, as in round 1.

## Screenshots

In `docs/validation/dogfood-2/`:

- `wide-1440-top.png`, `narrow-390-top.png`, `nojs-1440-top.png`
- `wide-1440-tf_packet.png`, `narrow-390-tf_packet.png`, `narrow-390-tf_packet-end.png`, `nojs-1440-tf_packet.png`
- `wide-1440-lifecycle.png`, `wide-1440-lifecycle-viewport.png`, `narrow-390-lifecycle.png`, `nojs-1440-lifecycle.png`
- `wide-1440-cmp_handles.png`, `narrow-390-cmp_handles.png`, `nojs-1440-cmp_handles.png`

An element screenshot in a scrolled page shows the sticky toolbar over the top
of the element (`wide-1440-lifecycle.png`, `narrow-390-tf_packet.png`). The
viewport screenshot `wide-1440-lifecycle-viewport.png` shows the figure as a
reader sees it.

## Problems

### Q1 (major): the rename changed the verb "explain" in 2 places, and 1 article is wrong

- **Action:** the agent read `visser catalogue show transform`.
- **Result:** the rules say "A merge is two or more conversions with the same
  `to`. Visser in the stage body how the inputs combine." The sentence means
  "Explain in the stage body". A search found 2 more leftovers of the rename:
  - `docs/ARCHITECTURE.md:388`: "This is an **Visser convention**".
  - `tests/unit/projection.test.ts:12`: "with an visser-text/1 ID line".
- **Fix:** in `skills/visser-visual-explain/references/catalogue/transform.md:40`,
  write "Explain in the stage body …". Correct the article in the other 2
  places. The rename check searched for identifiers, not for the verb.

### Q2 (major): a claim about hashing passed every check and every reread, and was false

- **Action:** the agent wrote "Any byte change in any declared file changes
  [the source revision]", cited the manifest code, and reread the excerpt.
- **Result:** the claim was false. A test on a copy converted the file to CRLF,
  and the packet still resolved `exact`. The excerpt shows why:
  `sourceManifest` hashes a text file with `normalizedTextSha256`. The
  sentence had a citation, and the reread did not catch it. Only a test of the
  behaviour did.
- **Also found by rereading:** "a renamed ID is a deleted target" (it
  resolves `missing`, because there is no retirement record), and "move a
  document folder" (only inside the document roots).
- **Fix:** in `skills/visser-visual-explain/SKILL.md` step 12, add: "For a claim
  about what changes or does not change a result, test it on a copy when you
  can." A reread checks that the excerpt contains the words; it does not
  check the reasoning between the excerpt and the claim.

### Q3 (minor): citation numbers follow the order of source blocks, not the order of first citation

- **Action:** 10 captures in the planned reading order, then 2 more captures
  for claims found in review.
- **Result:** each later capture went to the end (the round-1 P3 fix), so
  its number was higher than the numbers after it on the page. One planned
  capture was also first cited later than the next one. The agent reordered
  the source blocks by hand twice.
- **Fix:** number citations by first use in the prose, in
  `packages/core/src/compiler/compile.ts`, so the order of source blocks does
  not matter. Alternatively, add `capture --before ID`.

### Q4 (minor): a state arrow shows `event`, the list shows `label`

- **Action:** the agent set `event="refs refresh"` and
  `label="refs refresh --acknowledge-stale"`.
- **Result:** the figure showed "refs refresh", and the list showed the longer
  label. The flag that matters was only in the list. The agent copied the
  label into `event`.
- **Fix:** in `packages/core/src/compiler/compile.ts`, draw `label` on the
  arrow (with the guard), or make `label` optional for a transition and default
  it to `event`. `state.md` says "Arrow labels show the event and guard", but a
  template user fills both and expects `label` to be the label.

### Q5 (minor): the compare figure shows a "Details" link in every cell

- **Result:** each of the 16 cells shows a "Details" link above its text
  (`wide-1440-cmp_handles.png`). With short cell text, the links are as
  prominent as the content. At 1440 the figure uses a 645 px column, so the
  cells wrap to 5 or 6 lines.
- **Fix:** in `packages/runtime/src/reader.css` or the compare renderer, show
  the inspection link only on hover or focus, or as a small icon. Let a
  `compare` use a wider column than prose.

### Q6 (minor): empty compare cells show "Not provided" with no prompt

- **Result:** the first draft had 10 of 16 cells. `check --review` gave 0
  prompts, and the page showed "Not provided" in 6 cells. The agent saw it only
  in the screenshot.
- **Fix:** in `packages/core/src/review/index.ts`, add a `W_EVIDENCE_GAP`
  prompt for a compare with more than a quarter of cells missing.

### Q7 (minor): the sticky toolbar takes 2 rows at 390 px

- **Result:** at 390 px, the 4 toolbar buttons wrap to 2 rows, about 95 px of
  an 844 px screen, and the bar stays on screen while the reader scrolls
  (`narrow-390-top.png` shows the 2 rows).
- **Fix:** in `packages/runtime/src/reader.css`, put the buttons in one row
  with horizontal scroll, or in a menu, at narrow widths.

### Q8 (minor): `transform.md` describes narrow cards; the page shows lists

- **Result:** the guide says "On a narrow screen stages become cards, and each
  conversion becomes a sentence with its loss and condition." At 390 px the
  page shows the same bullet list and numbered list as other graphs.
- **Fix:** correct `skills/visser-visual-explain/references/catalogue/transform.md`
  to describe the lists.

### Q9 (minor): `refs retire` and `refs replace` print a diff of most of the file

- **Result:** a one-paragraph retirement printed 225 lines. The frontmatter
  change and the removed span were in one hunk that covered the whole document.
- **Fix:** in `packages/core/src/references/guarded-write.ts` (`unifiedDiff`),
  split hunks with 3 lines of context.

### Q10 (minor): a state figure places edge labels between parallel lines

- **Result:** "the target's text changes" sits between the `missing` to
  `stale` line and the `exact` to `stale, text changed` line, closer to the
  wrong one (`wide-1440-lifecycle-viewport.png`).
- **Fix:** in the layout options for ELK (`packages/core/src/compiler/layout.ts`), put
  labels on the edge (`edgeLabels.placement` with inline labels) or increase
  the spacing between edges.

### Q11 (observation): `visser init` writes a lock that the toolkit-repository rule then removes

- The skill's rule says "a document inside the Visser toolkit's own repository
  has no lock". It does not say that `init` writes one, or when to remove it.
  The agent kept the lock while the installed toolkit matched `dist/release`,
  and removed it at the end. A rebuild of `dist/release` during authoring
  would have made the shim fail with `E_TOOLKIT_MISSING`.
- **Fix:** in `SKILL.md`, add "`init` writes a lock; delete it" to the rule, or
  add `init --no-lock` in `packages/cli/src/commands/init.ts`.

### Not tried: the example extension

No question on this page is a timeline with durations, which is what
`timeline-lanes` draws. The agent did not force the extension flow.

## Round-1 fixes verified

| Fix | Worked in practice? |
|---|---|
| P1: rule for the toolkit repository | Yes. `check` and `build` with `--dev-toolkit dist/release` exit 0 through the shim. The rule does not say what to do with the lock that `init` writes (Q11). |
| P2: trace figure and guide text | Not tested: this page has no trace. |
| P3: sources after the last source | Yes. The file order was the capture order. A later capture still breaks the reading order (Q3). |
| P4: `--verify-origins` finds the document's clone | Yes. 12 of 12 `origin-matched` without `--repo-map`. |
| P5: refused refresh prints the current text | Yes, on stderr, while stdout went to a file. |
| P6: missing-lock message | Yes: "restore visser.lock.json from version control, or pass --dev-toolkit DIR (`visser init` is only for a new document)", exit 3. |
| P7: replacement without its marker | Yes: "the replacement must start with `<!-- vs:id p_retire -->`", exit 2. |
| P8: `check --review` prints the prompt count | Yes: `review: 0 prompts`. |
| P9: narrow list layout | Yes: list numbers and kinds stay on their line at 390 px. The trace projection part was not tested. |
| P10: cite every claim, reread each excerpt | Partly. Citing and rereading found 2 wrong claims. A third claim had a citation and survived the reread; only a test found it (Q2). |
| Snapshot replacement (build ID) | Yes. The normal build and the development build of the same source are in 2 folders, `8573198b…` and `dc5ec373…`. |

## Status after the fixes (revision 1.24)

| Problem | Status |
|---|---|
| Q1 | Fixed: the verb in `transform.md` and two articles. |
| Q2 | Skill changed: test a claim about what changes a result on a copy. |
| Q3 | Fixed: citations number by first `cite` in document order. |
| Q4 | Fixed: a state arrow shows the label and the guard. |
| Q5 | Changed: a cell without a value shows its text, then a small "details" link. |
| Q6 | Fixed: `check --review` flags a compare table with many empty cells. |
| Q7 | Fixed: the narrow toolbar is one scrolling row. |
| Q8 | Fixed: narrow screens show transform cards, and the guide says so. |
| Q9 | Fixed: diffs have 3 lines of context for each change. |
| Q10 | Fixed: more ELK spacing; each label is nearest its own edge. |
| Q11 | Fixed: `init --no-lock`. |
