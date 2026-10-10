# Native flowchart implementation candidate

Implemented on 2026-10-10 from baseline `0db1968`. No commit, push, or publication was performed.

The native figure supports procedural nodes, branches, retries, direction, colored nested groups and folding. Every node and group has canonical structural detail through the existing inspector. Fold proxies retain original flow identity; selection survives folding; closing details restores visible focus. Math, text alternatives, print and relocated offline single-file export use the existing infrastructure. Authoring guidance now covers flowchart routing and precise math use.

## Interaction follow-up

The subsequent [interaction and mobile review](interaction-review.md) fixes targeting, focus, keyboard order and callout stacking, and implements immediate first-tap mobile details. Its separate candidate/report records supersede the mutable focused report paths below; the original manifest remains historical.

## Candidate and verification

Runtime: Node 24.21.0. `reports/flowchart/candidate.json` binds source inputs, toolkit, reports, preview and screenshot hashes.

| Check | Result |
| --- | --- |
| Full unit/integration suite, `--maxWorkers=4` | 2,562 passed in 290 files. |
| Final focused flowchart + exact math-field unit suites | 50 passed in 12 files, including the added hand-counted fold-budget test. |
| Shared native reader/browser regression matrix | 130 passed; 54 explicit applicability skips. Desktop 1440, touch-emulated 320, no-JS. |
| Relocated standalone flowchart, HTTP(S) denied | 3 passed: desktop, mobile, no-JS/print. |
| Six exact math-field browser suites | 90 passed; fresh exact-case evidence replaces stale source pins. |
| TypeScript and whitespace checks | Passed. |
| Build, namespace-isolated offline and asset/resource budgets | Passed. No timing gate was requested or reported. |
| Clean-machine installed toolkit | Passed within the full integration suite. |
| Contract checks | Hash vectors, JSON output discipline, traceability and retained math field evidence passed after evidence refresh. |
| Independent review | Seven material findings fixed and rechecked; no unresolved material findings. |

The initial Node 25 full run had a guide enum-format failure, a math-worker timeout under unrestricted concurrency, and a Node-24-only test failure. The guide was fixed and the supported-runtime bounded run passed. Production worker limits were not raised.

The first browser run found a Fold button obscured by an edge hit path; controls now occupy reserved header space and draw above routes. Authored detail links now enter shared inspector history. These fixes have retained interaction regressions.

The final resource regression was added after the full suite: it has a separate passing focused report. No production delta followed the final full-suite build. The final math-field refresh ran only its exact seven unit and six browser suites; historical full math reports were not relabeled as current runs. Existing Mermaid deferrals and inventory remain unchanged.

## Review artifacts

- `reports/flowchart/preview.html`: a real standalone export of the nested retry fixture.
- `light-sidebar.png`, `dark-sidebar.png`, `forced-colors.png`: actual browser screenshots of the shared inspector and native figure.
- `coverage.md`: requirement/test map and remaining limits.
- `review.md`: independent findings, corrections and closure.

Agent visual inspection checked the light screenshot's node shapes, outcome labels, colored boundaries and existing inspector styling. Palette automation checks all 16 parent/child token combinations in light and dark against text/boundary contrast thresholds. CSS 200% zoom is layout stress evidence, not a claim of physical browser/device testing.

## Remaining human acceptance

The feature is implemented and automated checks pass. V01 interpretation, V02 human visual review, and V03 real touch/screen-reader use remain pending. Prompt P01–P10 has source-aware and deterministic evidence; representative cold-reader/author behavior trials have not been performed. No human pass or waiver is inferred from earlier math acceptance.
