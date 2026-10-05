# Sol authoring trial review

Source: https://github.com/russellsch/dotfiles at
`abc1e037fdd7d223e796a0703caa23034a9e21dd`. Source scripts were read, never
executed. The source checkout is `/tmp/visser-dotfiles-evaluation`.

Native dispatch selected `gpt-6-sol`, medium effort, for the author, independent
source reviewer, and separate cold reader. All three had bounded tasks and no
nested delegation. The parent coordinated, inspected renders, checked findings,
and edited the authoring guide. No claim is made that the parent model changed.

## Frozen initial output

- Toolkit: `6b10d157617182d35a94f239f4f9430f63a1960d4190a5ef0600995cad097833`.
- Document ID: `cc3d4548-9254-4d8e-846a-8534ab91a540`.
- Source revision: `039a4badd35859080b9445281dcaa7a22857eb144d33de55255b289ba00fa962`.
- Build: `92671a0eab45831720b160476a7f6a907a0a47a24362026909d0a60b760889d1`.
- `first-draft.md` preserves the first valid draft. `pre-review.md` preserves
  the author-reviewed source before external review. `prompt-baseline/` preserves
  the initial authoring instructions. `render-initial/` holds browser evidence.

The initial document passed structural validation with 43 targets and zero
review prompts. The author had corrected a container/prompt distinction and
replaced TTY with plain language. The graph was legible at desktop width.
Browser checks covered 1440, 390, and 320 CSS px, dark and forced colors. No page
errors or document-width overflow occurred. Desktop edge details and the mobile
viewer/sheet opened and closed. These checks do not establish real-device behavior.

## Findings and pressure tests

| ID | Initial finding | Evidence and correction |
| --- | --- | --- |
| DF01 | Package-manager sentence generalized Linux privilege rules to macOS. | `install.sh:42-64` has independent Homebrew and Linux branches. Separate these in the main path. |
| DF02 | "Root access available" hid the actual predicate. | `common.sh:90-108` checks existing root or `sudo -n true`. The reviewer's "passwordless sudo" shorthand was too narrow; retain the exact noninteractive check. |
| DF03 | Target-home fallback without SUDO_USER was unstated. | `common.sh:110-123` uses USER/HOME with root and /root defaults. Do not imply recovery of an original unprivileged user. |
| DF04 | Naming ln -sfn concealed replacement of existing configuration. | `zsh/install.sh:141-160` has no backup. State regular-file/symlink replacement; do not claim real directories are replaced. Both source review and cold reading raised this gap. |
| DF05 | Update scope and version behavior remained vague. | `update.sh:68-95,124-158`: fzf uses its configured ref; uv self-updates; selected links are checked, not recreated. The complete script does not pull the dotfiles checkout. |
| DF06 | Worked unattended example treated default font behavior as unconditional. | `install.sh:16-24` permits DOTFILES_SKIP_FONTS=false. State default feature flags in the example. |
| DF07 | Tool names and source-only decision nodes left useful questions unanswered. | Cold reader flagged uv requirement versus installation, user-local paths, and "global" Git scope. Add role context and supported answers at useful decision/effect targets. Avoid a body-count quota. |
| DF08 | Repeated framing delayed the drawing on narrow screens. | Initial 320 px top render showed title, near-duplicate heading/caption, question, explanation, and legend before the drawing. Remove repetition, retaining needed meaning. |

The cold reader first received only the main-path extract and selected screenshots.
It answered the three stated tasks, while identifying the overwrite and terminology
gaps. It then received the detail text and screenshots. It correctly identified
the checkout-path dependency as useful new depth. Source notes and expected answers
were withheld throughout that cold read.

The parent rejected a broad demand to treat directional arrows as a defect:
the responsibility map has meaningful call/file-effect relationships and explicitly
separates them from chronology. The mobile viewer's partial graph is expected
pan/zoom behavior; it is not proof that content is lost. The clipped narrow toolbar
is a scrollable-control concern outside this authoring correction, not a reason
to shrink diagram labels or add more author instructions.

## Prompt changes

The shared review guide now asks for operational state changes, actual branch
predicates, default/override precedence, proper tool roles, concise framing,
and useful explanations at important decisions and effects. A contrast question
tests a meaningful alternate branch rather than only repeating the worked example.

A separate Sol pass checked these additions against the observed failures. It
flagged a requirement for contrasting cases on all operational tasks, including
tasks with no consequential branch. The parent narrowed this to decision points
that change outcomes. No feature, definition, depth, or finding quotas were added.

The later [paired review probe](review-comparison/results.md) compares old and
amended guides on the same frozen draft with two fresh Sol reviewers. It supports
the targeted additions but also shows complementary misses. It is not a
statistical benchmark or a comparison of independently generated drafts.

This is one author-and-revision trial, not a controlled old/new generation benchmark.
Revisions receive explicit review feedback; they do not establish the standalone
effect of the prompt edits. Agent answers do not establish human comprehension.

## Final recheck

The independent source reviewer rechecked DF01–DF06 against the revised artifact
and found them addressed. The revised document passed structural review with
47 targets and zero warnings. The author revised it using explicit findings;
this is not evidence that the amended guide alone produces a better first draft.

The revised browser probe covered 1440, 390, and 320 CSS px, dark mode, and forced
colors. It reported no page errors or horizontal document overflow. All five
authored figure explanations opened and closed on desktop and at 320 px. The
mobile viewer opened without selecting a part; returning detached the dialog.
The parent inspected the revised desktop figure and narrow top-of-page screenshots.
These checks do not establish complete mobile readability or physical-device gestures.

The scoped skill, format-guide, and prose-review suites passed: 107 tests across
three files. The external source checkout remained clean. No source scripts ran.
The trial artifact retains the original toolkit build; prompt packaging was
checked separately after guide changes. No runtime feature was changed in this trial.

Remaining fixture findings from the paired probe are retained as evaluation
evidence. The user's goal is reusable prompt and Visser improvement, not a polished
dotfiles publication. No additional sample rewrite is required for that goal.
