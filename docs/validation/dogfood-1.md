# Dogfood run 1: "How Visser works"

> **Note (revision 1.23):** this run happened before the rename from Explain to Visser. The log now uses the new names (`visser`, `VISSER_HOME`, `skills/visser-visual-explain/`). At the time of the run the command was `explain` and the page was `how-explain-works`.

Date: 27 September 2026. Toolkit: `dist/release` built from commit `9fdeb25`,
digest `9d3613f2e8fe…`. The author was an agent (Claude Opus 5.5) that
followed `skills/visser-visual-explain/SKILL.md`. The agent ran every `visser` command
through the installed user shim, with a temporary `VISSER_HOME`.

## Result

- Document: `docs/explanations/how-visser-works/index.md`.
- Reading words: 1,931, without markers, tags, and captured code.
- Targets: 77. Visuals: 1 architecture map (8 nodes, 7 edges) and 1 trace
  (3 actors, 11 events, 2 exclusive branches). There is also 1 table, 4
  definitions, 2 details, and 7 git excerpts at `9fdeb25`.
- `check`: exit 0. `check --review`: exit 0, 0 prompts.
- `check --verify-origins --repo-map https://github.com/russellsch/visser.git=$PWD`:
  exit 0. All 7 sources are `origin-matched`.
- `build`: exit 0. `serve`: the page loaded, with no console errors at 1440,
  390, and without JavaScript. No width had a horizontal scroll.
- `export --format markdown`: exit 0. The text carries every relationship
  with its label.
- Handoff on a copy in a temporary repository: `refs show` 0, `refs resolve` 0
  (`exact`), `refs replace` 0. Then the old packet gave `resolve` 5 (`stale`)
  and `replace` 5 (`E_REF_STALE`). A replacement without a marker gave 2
  (`E_ID_MISSING`). `refs refresh` gave 5 without `--acknowledge-body-change`
  and 0 with it. The new packet resolved `exact`.

## Lock convention

The examples in `examples/` have no `visser.lock.json`. The test suite builds
them with `--dev-toolkit dist/release`. Every rebuild of the toolkit changes
its digest, so a committed lock goes stale at the next build. This bundle
follows the same rule: the agent removed the lock after it finished. To build
the document, run:

```sh
node dist/release/bin/visser.cjs build docs/explanations/how-visser-works/index.md --dev-toolkit dist/release
```

## Time for each step (wall clock)

| Step | Time |
|---|---|
| Read the skill, `format.md`, 2 catalogue guides, and the code | about 1.5 min |
| `init`, 7 captures, write the draft, first `check` | about 1.8 min |
| `check --review`, `--verify-origins`, markdown export, first `build` | about 0.4 min |
| Screenshots, 3 fixes of facts, layout fix, rebuild, handoff test | about 3.2 min |
| Lock convention and this log | about 1 min |

The model time between tool calls is included. The first draft passed `check`
with no error.

## Screenshots

- `docs/validation/dogfood-1/wide-1440-top.png`
- `docs/validation/dogfood-1/wide-1440-map.png`
- `docs/validation/dogfood-1/wide-1440-trace.png`
- `docs/validation/dogfood-1/narrow-390-map-list.png`
- `docs/validation/dogfood-1/nojs-1440-trust.png`

## Problems

### P1 (major): the skill has no rule for a document in the toolkit's own repository

- **Action:** the agent removed the lock, as the examples do, and then ran `visser check DOC` through the shim.
- **Result:** `E_TOOLKIT_MISSING: no visser.lock.json …; run visser init or pass --dev-toolkit`, exit 3.
- **Expected:** a documented path. The skill forbids any entry point other than the shim, and it never mentions `--dev-toolkit`.
- **Fix:** in `skills/visser-visual-explain/SKILL.md`, add one paragraph: "A document in the toolkit repository has no lock; run commands with `--dev-toolkit dist/release`." Alternatively, add `init --no-lock` in `packages/cli/src/commands/init.ts`.

### P2 (major): a trace renders only as a list, at every width

- **Action:** the agent chose `trace` for "what happens in one build, and whose code runs", as the catalogue guide advises.
- **Result:** the page shows a numbered list with "Order layer N" on each event, and bare lists of actors and branches. No lane figure appears at 1440. The renderer also adds "Ordering, not duration." under the author's own text, so the agent's similar sentence was printed twice.
- **Expected:** the guide describes a figure with waits and partial order. For a linear run, the result is only a longer numbered list, and the skill says to remove a visual that prose answers as well.
- **Fix:** in `skills/visser-visual-explain/references/catalogue/trace.md`, state that the trace renders as an ordered, layered list. Alternatively, draw lanes in `packages/core/src/compiler/compile.ts`. The guide should also say that the page already prints "Ordering, not duration."

### P3 (minor): `capture` puts each new source directly after the title, so citation numbers run backwards

- **Action:** 7 `capture git` commands, in reading order.
- **Result:** the file held the sources in reverse order, and the first citation on the page showed `[7]`. The agent moved the blocks by hand.
- **Expected:** citations numbered in reading order.
- **Fix:** in `packages/core/src/provenance/capture.ts`, append a new source after the last existing `source` block. Alternatively, number citations by first use in `compile.ts`.

### P4 (minor): `--verify-origins` does not find the clone that holds the document

- **Action:** `check --verify-origins` on a document inside a clone of the captured repository.
- **Result:** 7 identical `W_ORIGIN_UNAVAILABLE` warnings that ask for `--repo-map URL=PATH`.
- **Expected:** if the repository of the document has the same `remote.origin.url`, use it.
- **Fix:** in `packages/core/src/provenance/verify.ts`, add the document's own repository to the map when its remote matches. Print one warning for each repository, not one for each source.

### P5 (minor): a refused `refs refresh` does not print the current text in text mode

- **Action:** `refs refresh --acknowledge-stale` on a packet whose target text changed.
- **Result:** exit 5 and one error line. The current text is only in the `--json` output (`currentText`).
- **Expected:** `references/handoff.md` says "exits 5 with `E_REF_STALE` and prints the current text".
- **Fix:** print `currentText` in `packages/cli/src/commands/refs.ts`, or correct `handoff.md`.

### P6 (minor): wrong advice in `E_TOOLKIT_MISSING`

- **Action:** a command on a bundle without a lock.
- **Result:** the message says "run `visser init`". `init` on the existing bundle gives `E_USAGE … init never overwrites content`, exit 2.
- **Fix:** in `packages/cli/src/toolkit.ts` and `shim.ts`, say "restore `visser.lock.json`, or pass `--dev-toolkit DIR`".

### P7 (minor): a replacement without its marker gives an unclear message

- **Result:** `E_ID_MISSING: … paragraph has no ID marker (line 228)`. Line 228 is in the candidate document, not in the replacement file.
- **Fix:** in `packages/core/src/references/replace.ts`, say "the replacement must start with `<!-- vs:id p_next -->`".

### P8 (minor): `check --review` gives no sign that the review ran

- **Result:** the output with `--review` and without it was the same line: `ok: 77 targets`.
- **Fix:** print `review: 0 prompts` in `packages/cli/src/commands/check.ts`.

### P9 (minor): layout and page length

- The first map had a browser node with 2 edges back into the repository group. The layout routed both edges around the whole figure. The agent removed the node and explained the browser in prose.
- At 1440 the page shows the SVG, the node list, and the relationship list, one after the other. The page is 9,338 px tall at 1440 and 13,545 px at 390.
- At 390, each relationship list number sits above its line, and the kind label, for example "(call)", sits on a line of its own (`packages/runtime/src/reader.css`).
- The text projection of the trace gives `after:` as event IDs, but the page gives event labels (`packages/core/src/model/project.ts`).

### P10 (observation): `check` does not check facts

- The first draft passed `check`, `--review`, and `--verify-origins`, but it held 3 false claims about the code:
  - that the trust check applies only when no user copy exists;
  - that nothing ever runs from `.visser/`;
  - that the layout worker has a memory limit.
- The agent found them only when it read the cited code again. A `cite` shows where a claim comes from; it does not prove the claim.
- The skill says this in one sentence. It could ask the author to reread each cited excerpt against its sentence before delivery.
- A second reader (the parent session) found 1 more false claim and 1 missing limit after delivery:
  - "An existing snapshot folder is never overwritten". `packages/cli/src/commands/build.ts:179-195` replaces a snapshot when its development mark differs, because a development build and a normal build can share a build ID. The sentence had no citation.
  - The trust limits did not say that a trusted extension can load Node modules from outside its digest.
- Both are fixed in the document. An uncited claim about behaviour is the most likely place for an error; the skill could ask for a citation on each claim about what the code does.

## Status after the fixes (revision 1.22)

| Problem | Status |
|---|---|
| P1 | Fixed: `SKILL.md` covers documents in the toolkit's own repository. |
| P2 | Fixed: a trace renders a figure; the page prints "Ordering, not duration." once; `trace.md` says so. |
| P3 | Fixed: a new source goes after the last source. |
| P4 | Fixed: `--verify-origins` uses the document's own clone and warns once per repository. |
| P5 | Fixed: a refused refresh prints the current text on stderr; `handoff.md` matches the code. |
| P6 | Fixed: the missing-lock message no longer advises `init`. |
| P7 | Fixed: the message names the marker the replacement needs. |
| P8 | Fixed: `check --review` prints the prompt count. |
| P9 | Partly fixed: the narrow list layout and the trace projection labels. The page length at wide widths remains. |
| P10 | Skill changed: a citation for each claim about code, and a reread step. `check` still cannot check facts. |
| Snapshot replacement | Fixed: the development mark is part of the build ID. |
