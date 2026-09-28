# Review: skill text and review prompts (IMPROVEMENTS.md §6.2, §7, §11, §12.3, §12.4, §13.6, §13.7, §14.10)

Date: 27 September 2026. Branch `explain-plan`, uncommitted working tree on top of `ab5eec8`.
Reviewer role: independent review. No source file was changed.

## Scope

- Skill text: `skills/visual-explain/SKILL.md`, `references/prose.md`, `references/operations.md`,
  `references/catalogue/*.md` (the "Confused with" lines and `mermaid.md`), and `references/handoff.md`
  (to confirm where the packet workflow went).
- Review code: `packages/core/src/review/{index,context,prose,shape,terms,text}.ts`.
- CLI: `packages/core/src/catalogue/index.ts` and `packages/cli/src/commands/{init,catalogue,check}.ts`,
  `packages/cli/src/main.ts`. Also read for context: `commands/skill.ts`, `shim.ts`, `model/validate.ts`,
  `syntax/profile.ts`, and `schemas/visser-frontmatter.schema.json`.
- Tests: `tests/unit/review.prose.test.ts`, `tests/unit/review.test.ts`,
  `tests/integration/{init.reader,catalogue}.test.ts`, and the edited editorial fixtures.
- Out of scope: `reader.css`, `svg.ts`, `compile.ts`, `layout.ts`, `html.ts`, `mermaid.ts`, and
  `compiler/autolink.ts`. Another agent owns these files. So §6.2 item 5 (the Mermaid `theme: 'base'`) is not reviewed.

## Checks run

1. `npx vitest run tests/unit/review.prose.test.ts tests/unit/review.test.ts tests/integration/catalogue.test.ts tests/integration/init.reader.test.ts`:
   4 files and 60 tests pass. Vitest also wrote `reports/vitest-junit.xml`, which git ignores.
2. `dist/release` was built at 23:41, after the last review-source edit at 23:23. Its SKILL.md, prose.md,
   operations.md, mermaid.md, and handoff.md match the working tree by sha256. So I used the built CLI.
3. `visser check DOC/index.md --review --dev-toolkit dist/release` on the 13 examples and the 2 authored explanations.
4. Three probe documents in the session scratchpad (`review-skill/d1`, `d2`, `d3`), checked the same way.
5. `catalogue list` and `skill show`, once with `--dev-toolkit dist/release` and once with `--toolkit-dir dist/release`.
6. A scratch STE scan script, then a manual pass over SKILL.md, prose.md, operations.md, mermaid.md, and the 9 other "Confused with" lines.
7. Each tag, attribute, and frontmatter key that the skill names, compared with `profile.ts`, `validate.ts` `SPECS`, and the frontmatter schema.

## 1. Spec conformance

### SKILL.md changes (§12.3)

| # | Change | Status | Where |
|---|---|---|---|
| 1 | Step 1 writes the reader; `init --must-understand`; a reminder | done | SKILL.md:71-77; init.ts:34-39, 55, 70-72; main.ts:31 |
| 2 | Step 3 gives the outline in the reply, with no approval question | done | SKILL.md:82-86 (drops one old rule, see F14) |
| 3 | Step 4 rewritten; list kept; `domain` added; `mermaid` removed | partly | SKILL.md:87-110. The `domain` row is missing because no `domain` tag exists (profile.ts:13-23). That deferral is correct. |
| 4 | Step 7: label limits, part body, definition and `term`, or open with `domain` | partly | SKILL.md:123-129. "Or open with a `domain`" is left out because the tag does not exist. |
| 5 | Budgets step before Validate | done | SKILL.md:137-151. The numbers match §12.3 item 5. |
| 6 | Self-check against `mustUnderstand`, and a cold read by a subagent | done | SKILL.md:161-166 (the name collides with a planned tag, see F7) |
| 7 | Visual-inspection thresholds | done | SKILL.md:168-179 |
| 8 | Five anti-patterns | done | SKILL.md:180-187 |
| 9 | STE block after the boundaries | done | SKILL.md:29-48 |
| 10 | Operations moved out; boundaries block and five safety sentences kept; one line names the reference | done | SKILL.md:14-27, 50-67; operations.md:1-68. The packet detail is still in handoff.md:44, 52, 61-63, 97-98, 107-109. |

### Prompts (§11.3, §12.4, §6.2, §13.6)

§11.3 and §12.4 list 13 rows. With `W_MERMAID` and the two §13.6 prompts, that makes 16 items. ARCHITECTURE.md:1632 lists the 15 new codes plus the `W_JARGON` extension.

| Prompt | Status | Where | Note |
|---|---|---|---|
| `W_SENTENCE_LENGTH` | done | prose.ts:36-43 | Covers prose and part bodies. Each code span counts as 1 word. |
| `W_PASSIVE` | done | prose.ts:12-24, 45-58 | False positives: F2, F19 |
| `W_CONTRACTION` | done | prose.ts:27, 60-76 | Includes labels. No false positive found. |
| `W_VAGUE_QUANTITY` | done | prose.ts:29, 78-84 | False positive: F3 |
| `W_JARGON` extension | done | index.ts:121-158 | Acronyms and `reader.new` items used 2 or more times. False positive: F4 |
| `W_SYNONYM` | done | prose.ts:87-112 | |
| `W_READER` | done | shape.ts:56-63 | |
| `W_LENGTH` | done | shape.ts:65-72; context.ts:61-73 | Each code span counts as 1 word. Fences, details, part bodies, and definitions are left out. |
| `W_FIGURE_COUNT` | done | shape.ts:73-75 | |
| `W_LATE_FIGURE` | done | shape.ts:76-82 | Stays quiet in a document with no figure (probe d1) |
| `W_LABEL_LENGTH` | done | shape.ts:85-101 | An `event` label gets the node limit of 4 words (F18) |
| `W_DUPLICATE` | done | shape.ts:103-134 | False positive: F5 |
| `W_HEADING` | done | shape.ts:136-145 | |
| `W_MERMAID` | partly | shape.ts:31-49, 147-155 | ER and class diagrams map to `architecture` concept nodes, not `domain`. The message contradicts mermaid.md (F6). |
| `W_TERM_UNUSED` | done | terms.ts:208-225 | |
| `W_TERM_COLLISION` | partly | terms.ts:227-248 | Aliases are not handled because they do not exist yet. "Common word" is approximated by tag and mode names. The plural key has a bug (F4). |

### §6.2 Mermaid demotion

| # | Status | Where |
|---|---|---|
| 1 | done | SKILL.md:109-110 |
| 2 | done | catalogue.ts:20-30; catalogue/index.ts:21-35, 101. Verified with `--toolkit-dir`. With `--dev-toolkit` it prints the old guide (F1). |
| 3 | partly | shape.ts:31-49 (F6) |
| 4 | done | mermaid.md:1-37. The safety rules stay at mermaid.md:56-63. |
| 5 | not reviewed | runtime/mermaid.ts belongs to another agent |

### §7 Catalogue clarity

| Item | Status | Where |
|---|---|---|
| Step 4 as a table with 3 columns, with no Mermaid row | done | SKILL.md:94-104 |
| "Confused with" line in each guide | done | line 5 of all 10 guides |
| A root-cause document has both `cause` and `trace` | done | SKILL.md:106-107; cause.md:5 |
| `annotated`: `evidence` on a node versus `annotated` | missing, blocked | `node` has no `evidence` attribute (validate.ts:34-36), and §4.4 is not built yet. Leaving it out is correct for now. |

### §13.7 and §14.10

- §13.7: partly done, at SKILL.md:126-129. "The build links every use" and `aliases` are left out. `aliases` and `auto` are not in `validate.ts` `SPECS.definition`, and the compiler does not auto-link yet. So the current text is correct today. F22 covers what happens when auto-link lands.
- §14.10: the skill names no tag that does not exist yet (`self-check`, `measure`, `reading`, `note`, `steps`, `tree`, `domain`, or node `evidence`). `W_MERMAID` names `role="concept"`, which is valid. But SKILL.md uses "self-check" as the name of an authoring step (F7).

## 2. Safety

- The boundaries block (SKILL.md:14-27) is still there. The first two sentences are now absolute ("Do not execute… Do not publish…"). That is stricter than before.
- The five safety sentences are still there: shim only (SKILL.md:52-54), never install (55), never trust (56), never publish (57), and stop on `E_TOOLKIT_*` (58-60).
- operations.md §3 (32-43) restates the stop rule. operations.md §4 (45-55) describes the repository exception with the same scope as the old text. It does not weaken the stop rule.
- The dev-toolkit rule has a gap, but it is not a regression: F13.
- Tag and attribute names: every name in SKILL.md, prose.md, operations.md, the "Confused with" lines, and the prompt messages exists in `profile.ts`, `validate.ts`, or the frontmatter schema. That covers `reader.profile`, `knows`, `new`, `mustUnderstand`, `question`, `definition`, `term`, `detail`, `entity`, `cite`, `excerptSha256`, `docId`, `role="concept"`, `role="interface"`, `role="storage"`, edge `kind="call"`, and event `kind="return"`. The prose.md snippets load without errors (the contract tests at review.prose.test.ts:254-291).

## 3. Prompt false positives (probes)

| Probe | Result |
|---|---|
| d1: "The cache file is read-only…", "The feature is built-in." | `W_PASSIVE` "is read" and "is built": **false positive** (F2) |
| d1: `## How many reads reach the database` | `W_VAGUE_QUANTITY` "many": **false positive** (F3) |
| d1: `reader.new: [queues]` plus `definition term="queue"` | `W_JARGON` "queues … with no definition block": **false positive** (F4) |
| d1: no figure, and more than 120 words | no `W_LATE_FIGURE`: correct |
| d1: a sentence with 2 long code spans | counted as 8 words: correct |
| d2: a node body lists 8 flags as code spans; a paragraph lists 8 file names as code spans | `W_DUPLICATE` "repeats 9 words … code code code code code code code and code": **false positive** (F5) |
| d2: `definition term="States"` in a document with a `state` graph | no `W_TERM_COLLISION`: **false negative** (F4) |
| d3: "When a target is retired" in a document with a `Retired` state | `W_PASSIVE` fires. This is a state name, not a hidden agent (F19, optional). |
| d3: "as many workers as the machine has cores" | `W_VAGUE_QUANTITY`: **false positive** (F3) |
| d3: `## Commands` in a `reference` document | `W_HEADING` fires. The spec allows it, but it is noise (F20, optional). |
| examples/order-intake, bounded-queue | `W_LABEL_LENGTH` on `event` labels with 5 to 7 words (F18) |
| docs/explanations/life-of-a-target-id | `W_JARGON` on CR, LF, and CRLF, because the threshold is now 2 uses. The reader is an experienced engineer, so this is noise. It is not a defect. |

## 4. STE hits

The scan found no contractions outside the invalid examples. It found no description over 25 words in the four files or in the 10 "Confused with" lines.

| File:line | Hit |
|---|---|
| SKILL.md:20 | "when necessary": "when" for a condition (rule at SKILL.md:45) |
| SKILL.md:98 | "Which transitions are allowed?": passive. The `W_PASSIVE` allow-list accepts it. |
| SKILL.md:104 | "Many parts": a vague word |
| SKILL.md:108 | "only when you consider that component": "when" for a condition |
| SKILL.md:110 | "explains when it is allowed": passive, and "when" for a condition |
| SKILL.md:163 | "When a subagent is available": "when" for a condition. The wording is copied from spec §12.3 item 6. |
| SKILL.md:232 | "Could an unfamiliar engineer…": "could" |
| SKILL.md:233 | "is chronology kept separate": passive |
| SKILL.md:237 | "Is each term defined…": passive |
| SKILL.md:18, 80 | "requirements-grilling" and "falsely tidy": an idiom and a metaphor. This text existed before the change. |
| SKILL.md:109-110; mermaid.md:1, 7 | "escape hatch": a metaphor. The spec requires this phrase (§6.2 items 1-2). |
| prose.md:9 | "tests some rules": "some" |
| operations.md:3-4 | An instruction of 21 words (the limit is 20) |
| operations.md:34 | "is not installed": passive |
| operations.md:48 | "a lock would be stale": "would" |

## 5. Consistency (one word, one meaning)

- **component** has 3 meanings:
  - a catalogue entry (SKILL.md:88, 109, 214);
  - a service in the explained system (SKILL.md:99; transform.md:5);
  - a tag (terms.ts:246: "the word of a component … (`node`)").

  `prose` also sits in the Component column (SKILL.md:104). But SKILL.md:90 and catalogue/index.ts:23 treat prose as "not a component".
- **part** has 2 meanings:
  - a figure part (SKILL.md:89, 124-125, 138, 150, 163; mermaid.md:14);
  - a piece of the system (SKILL.md:103, 104, 232).

  `--part` is also a CLI flag (operations.md:66-67), and `part` is a tag.
- **figure / visual / diagram** are three words for one meaning (SKILL.md:8, 11, 88, 91, 239). **pattern** (operations.md:65) and **component** also name one thing: a catalogue entry. **straight line** (SKILL.md:97, 186) and **strict line** (SKILL.md:102; plan.md:5) also mean the same thing.
- **self-check** names an authoring step (SKILL.md:161). It is also the reserved tag of §14.3 and §14.10.
- **target**, **reader**, and **prompt** each keep one meaning in SKILL.md and the guides. `reader.*` is always code-formatted.

## Findings

Severity: blocker, major, or minor. "Optional" marks a suggestion, not a defect. "Hypothesis" marks a finding that I did not confirm by a run.

| ID | Severity | File:line | What is wrong | Fix |
|---|---|---|---|---|
| F1 | major (confirmed; the code existed before, but the new text sends agents into it) | commands/skill.ts:15-35; SKILL.md:62-63; operations.md:52-53 | `skill show` and `catalogue list/show` ignore `--dev-toolkit` and read the user-default toolkit. `skill show --dev-toolkit dist/release` printed `~/.visser/toolchains/cfe069…/SKILL.md`, which is the old text (0 matches for "Write in Simplified Technical English"). `catalogue list --dev-toolkit` printed the old Mermaid line. With `--toolkit-dir dist/release`, both are correct. SKILL.md says "follow its text", and operations.md says to use `--dev-toolkit` for each command. So an agent in the Visser repository follows the old skill. That repository is where dogfood run 3 (§12.5) runs. | In operations.md §4, add: "`skill show` and `catalogue` do not read `--dev-toolkit`. Pass `--toolkit-dir dist/release` to them." Or make `selectForSkill` honour `--dev-toolkit`. |
| F2 | minor (confirmed) | prose.ts:24 | `W_PASSIVE` matches a participle before a hyphen: "is read-only" gives "is read", and "is built-in" gives "is built". The cause is that `\b` matches before `-`. | Replace the final `\\b` with `(?![\\w-])`. |
| F3 | minor (confirmed) | prose.ts:29 | `W_VAGUE_QUANTITY` fires on "How many…" (a question) and "as many X as Y" (an exact comparison). | Skip `many` after `how` or `as`, for example with `(?<!\bhow\s)(?<!\bas\s)`. |
| F4 | minor (confirmed) | terms.ts:181-183, used at index.ts:143-147 and terms.ts:229, 243 | `termKey` strips `es` before `s`, so "queues" becomes "queu" and "queue" stays "queue". The same happens to "states" and "state", and to "processes" and "process". Result: `W_JARGON` fires on `reader.new: [queues]` although `queue` is defined (d1). `W_TERM_COLLISION` misses `States` against the `state` tag (d2). | Compare by pattern: an item is defined if `termPattern(def.term).test(item)`, or the reverse is true. Or strip only one trailing `s`, and do the same to both keys. |
| F5 | minor (confirmed) | shape.ts:103-120; context.ts:30, 53-56 | `W_DUPLICATE` builds its 8-word runs from text in which each code span is the placeholder `CODE`. Two different lists of 8 or more code spans then count as a copy (d2). | In `duplicates`, tokenise with `proseOf(node, isTarget)` (code removed) or with the literal code text. |
| F6 | minor (confirmed) | shape.ts:41-43; mermaid.md:12-13, 72-83 | For `erDiagram` and `classDiagram`, `W_MERMAID` says to use `architecture` with concept nodes. mermaid.md says that no native component draws these diagrams, and its own template is an `erDiagram`. The prompt and the guide disagree. The spec wanted `domain`, which does not exist. | Until `domain` exists, make `nativeFor` return `undefined` for these types, so the message says "no native component". Or change mermaid.md to match the prompt. |
| F7 | minor | SKILL.md:161 | "Then do the self-check" uses the name that §14.3 and §14.10 reserve for a reader-facing tag. When that tag ships, one word will have two meanings. | Rename the step, for example "Then test the main path", or name it after `mustUnderstand`. |
| F8 | minor | SKILL.md:88-110, 214; transform.md:5; terms.ts:246 | "Component" has 3 meanings (see §5). `prose` sits in the Component column, but SKILL.md:90 says prose is not a component. | SKILL.md:99: "Services that call each other…". transform.md:5: "(services, not representations)". terms.ts:246: "the name of a tag or mode". Rename the table column to "Choice", or move the `prose` row out of the table. |
| F9 | minor | SKILL.md:103, 104, 232 | "Part" means both a figure part and a piece of the system. | SKILL.md:103: "How services interact". SKILL.md:104: "Many services". Keep "part" only for figure parts. |
| F10 | minor | SKILL.md:8, 11, 91, 97, 102, 186, 239; operations.md:65; plan.md:5 | One meaning has more than one word: figure, visual, and diagram; pattern and component; straight line and strict line. | Use "figure", "component", and "straight line" everywhere. |
| F11 | minor | see §4 (15 rows) | STE breaches in the text that teaches STE. | Rewrite each hit. For example, SKILL.md:163: "If a subagent is available, …". prose.md:9: "tests 7 of the 10 rules". operations.md:34: "if the user did not install the pinned release". operations.md:48: "so a lock is stale after each build". |
| F12 | minor (confirmed) | SKILL.md:160 | "Each prompt gives the measured value and the budget." This is false for `W_EVIDENCE_GAP` (index.ts:205, 221, 227, 232, 245, 257), `W_VISUAL_DENSITY` (index.ts:176, 183), and 2 `W_JARGON` messages (index.ts:82, 127). SKILL.md:159 lists `W_EVIDENCE_GAP` next to this sentence. | "The prose and shape prompts give the measured value and the budget." |
| F13 | minor (safety hardening; not a regression) | operations.md:45-55; SKILL.md:66 | `--dev-toolkit` skips the trust store (shim.ts:135-137 only calls `verifyRelease`). No text limits it to the Visser repository. No text forbids it as a way past `E_TOOLKIT_*`. The error text at shim.ts:86 even suggests it. SKILL.md:66 calls it "the `--dev-toolkit` rule", as if it had its own scope. | operations.md §4: "Use `--dev-toolkit` only for a document inside the Visser repository. It skips the trust check. Never use it to get past `E_TOOLKIT_MISSING` or `E_TOOLKIT_UNTRUSTED`." |
| F14 | minor | SKILL.md:82-86, 190-193 | Two rules were dropped. First, old step 3: "Main claims, mechanisms, and decision-changing caveats must not require inspection to find." Other text covers this only in part. Second, Deliver lost "or does not change" from the claim that needs a test on a copy. | Step 3: "The main path states each main claim and mechanism." Step 13: "A claim that a change does or does not change a result…". |
| F15 | minor | ARCHITECTURE.md:1666-1667, 2333 | §16.2 step 3 still says "Privately select…". Step 4 still says "Prefer prose/table/example". The embedded skill draft still has "Load the correct toolkit". All of these contradict the new SKILL.md. | Update §16.2, or record the change in REVISIONS.md (IMPROVEMENTS.md calls itself "a proposal, not a specification change"). |
| F16 | minor | format.md:13-15, 25-36 | SKILL.md:64 says to always read format.md. But format.md does not describe `reader.new` or `reader.mustUnderstand`. Its `teaching` example has no `mustUnderstand`, so a copy of it gets `W_READER`. | List the `reader` keys in format.md, and add `mustUnderstand` to the example. |
| F17 | minor (test gap) | review.test.ts:67; review.prose.test.ts:293-312 | The precision check on the examples now counts only the 3 old codes. The examples test asserts only the severity. No test pins the 15 new prompts on real documents, so F2-F5 pass the tests. | Add the four probe cases above as negative tests, and pin the expected new prompts on each example. |
| F18 | minor (spec ambiguity) | shape.ts:27; SKILL.md:123-124 | `event`, `group`, `state`, `task`, and `stage` labels get the 4-word node limit. §11.2 groups "edge and event labels". SKILL.md says nothing about events. The §12.1 count for `order-intake` matches the code, so the code is not wrong, but an author cannot predict the limit. | Add to SKILL.md:124: "An event, state, task, or group label counts as a node label." |
| F19 | optional | prose.ts:17-18 | `W_PASSIVE` fires on state names ("is retired", "is captured") and on common stative participles (enabled, disabled, bounded, shared, cached). | Skip a participle that equals a `state` label in the document, and add these stative words to the allow-list. |
| F20 | optional | shape.ts:136-145 | `W_HEADING` fires on the topic headings that a `reference` document normally uses. | Skip `kind: reference`, as the budgets do. |
| F21 | optional | SKILL.md (2,269 words; it was 1,644) | §12.1 gave attention as the fifth cause. SKILL.md grew by 38%. | No action is required. If attention matters, move the STE list detail to prose.md. |
| F22 | hypothesis (coordination) | SKILL.md:126-129; index.ts:125-127; terms.ts:175-183 | When `compiler/autolink.ts` (another agent) lands, three things break. First, "mark the first use with `term`" and the W_JARGON "defined but not wrapped" prompt contradict §13.6 and §13.7. Second, `W_TERM_COLLISION` does not read `aliases`. Third, `termPattern` and `termKey` use different match rules from `autolink.ts` `phraseKey`. | After the merge, update step 7 to the §13.7 text, remove the defined-but-not-wrapped branch, read `aliases`, and share one matcher. |

## Verdict

The change does what §12.3 and §12.4 ask:
- 9 of the 10 SKILL.md changes are done, and the 10th is partly done only because `domain` does not exist.
- All 16 prompts exist, and each gives a measured value and a budget.
- The Mermaid demotion and the "Confused with" lines are in place.
- The five safety sentences and the boundaries block are intact. operations.md does not weaken them.
- No text names a tag or attribute that the toolkit does not have.
- The targeted tests pass.

I found no blocker. The one major finding (F1) is an integration trap, not a defect in the diff. Inside the Visser repository, `skill show` and `catalogue` ignore `--dev-toolkit` and print the older default toolkit's skill. The new text tells the agent to follow that printed text. So the planned validation run (§12.5) would test the old skill unless F1 is fixed first.

The prompts are sound but noisy in four confirmed ways (F2-F5):
- hyphenated compounds trip `W_PASSIVE`;
- "how many" and "as many … as" trip `W_VAGUE_QUANTITY`;
- the plural key is wrong for words that end in -e or -s;
- inline-code placeholders make false 8-word runs in `W_DUPLICATE`.

The tests do not catch them, because the precision guard on real documents covers only the 3 old codes. The skill text breaks its own STE and one-word-one-meaning rules in about 15 places, mostly with "when" for a condition and with "component" and "part". I recommend fixing F1-F6 and F11-F12 before dogfood run 3.

## Limitations

- I did not run `npm run build`, the full test suite, or the browser tests. I ran only the 4 assigned vitest files and the prebuilt `dist/release` CLI.
- I did not review the runtime and compiler files that another agent is editing. So I did not verify §6.2 item 5 or the interaction with `autolink.ts`. F22 is therefore a hypothesis.
- The STE scan uses a regex for passives and sentence boundaries, plus a manual pass. It can miss inverted passives and noun strings. I checked those only by reading.
- I did not measure how often the prompts fire on documents that are not in the repository.
