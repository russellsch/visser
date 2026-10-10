# Native flowchart coverage map

This map records the retained evidence currently in the repository. “Proved” means an automated check exists; it does not replace the human exercises below.

| Requirement | Automated evidence | Status / gap |
| --- | --- | --- |
| FC01 | `tests/unit/native-flowchart-model.test.ts` valid fixture, contextual attributes, references and identity gates | Proved in focused model cases; exhaustive invalid-tag matrix is not separately enumerated. |
| FC02, FC04, FC05 | model degree, outcome, retry/self-loop, warning-gating and source-order cases | Fixed authored degree/reachability expectations; the separate topology oracle detects swapped labels, reversed routes and missing folded flows. |
| FC03, FC14 | model canonical target labels/projection; compiler and browser list checks | Proved for the fixture; built-CLI identity tests now cover source spans, resolve, guarded replacement and ID stability under label/color/direction edits. |
| FC06 | model group cycle/empty/scope cases; browser nested folds | Proved for covered cases. |
| FC07, FC08 | contextual schema tests; browser palette/contrast test | Proved for tokens and measured palette combinations; grayscale human review remains open. |
| FC09–FC11 | `tests/unit/native-flowchart-layout.test.ts`; compiler shape checks | Proved for covered direction, docking, proxy, crossing and geometry cases; visual baseline review remains open. |
| FC12 | layout proxy checks; `tests/browser/native-flowchart.spec.ts` nested fold/member checks | Proved for covered fold paths. |
| FC13 | `tests/browser/native-flowchart-offline.spec.ts` rendered math; no-JS literal-math path | Proved only for the exported fixture; failure/long-field matrix is incomplete. |
| FC15, FC26–FC32 | `tests/browser/native-flowchart.spec.ts` and offline spec: inspector, fold, focus, viewer, pointer and palette cases | Proved for scripted desktop/mobile paths; assistive-technology exercise remains open. |
| FC16 | integration delivery test and offline browser spec relocate one standalone HTML and abort HTTP(S) | Proved. |
| FC17 | model architecture-group regression; delivery compatibility checks | Proved only for selected compatibility paths. |
| FC18, FC19, FC21 | delivery preservation/marker tests; model exact W0 group/depth/proxy/node/flow bounds | Proved for the listed failure and capacity cases; hand-counted 73-unit docking and 99-unit fold boundaries, plus exact 2 MiB escaped output and one-over rejection, are retained. |
| FC20, FC22–FC25 | catalogue schema command check; `tests/unit/catalogue.test.ts`, `tests/unit/format-guide.test.ts`, skill/catalogue guide files | Partially proved: schema and guide packaging are checked; P01–P10 source-aware review and serialization fixtures are recorded in prompt-acceptance.md; human meaning trials remain open. |

| Test packet | Concrete retained tests | Status / gap |
| --- | --- | --- |
| T01 syntax/schema | `native-flowchart-model.test.ts`; `native-flowchart-delivery.test.ts` owner-specific catalogue schema | Partial: representative schema and reference failures, not every invalid attribute/type. |
| T02 control flow | model degree/outcome/retry/self-loop/unreachable cases | Partial: no complete independent table for every degree combination. |
| T03 identity/projection | model canonical labels; compiler list/detail assertions | Built-CLI identity packet covers flowchart source spans, reference/resolve and guarded replacement. |
| T04 geometry | `native-flowchart-layout.test.ts`, `native-flowchart-compiler.test.ts` | Partial: no visual baseline corpus for every listed routing case. |
| T05 palette | browser palette contrast test and model contextual color test | Partial: forced-color/grayscale assertions exist, but human grayscale review is open. |
| T06 interactions | `tests/browser/native-flowchart.spec.ts` | Partial: covered nested folds, focus and touch viewer; copy/reference matrix is incomplete. |
| T07 math fields | offline browser fixture | Partial: title/group/node math and static fallback are covered; all field/failure/long cases are not. |
| T08 delivery | integration delivery and offline browser specs | Proved for relocated standalone, network denial, no-JS and print fixture. |
| T09 compatibility | delivery test plus architecture-group model regression | Full 2,562-test unit/integration run and 130 passing shared-reader browser cases cover retained existing behavior; see completion.md for scope and skips. |
| T10 resource/recovery | model W0 boundaries; delivery prior-output preservation | Exact node/flow/group/depth/proxy/work/output boundaries and failed-build preservation are covered; shared layout worker timeout tests remain the timeout oracle. |
| T11 authoring guide | catalogue and format-guide tests compile documented snippets | Source-aware P01–P10 comparison is recorded; representative cold-reader trials remain open. |
| T12 selection/details | native browser and offline browser specs | Partial: scripted node/group/fold/viewer checks; not every kind/prose state. |

## Human validation still required

V01 remains open: author and interpret the same branching retry example as architecture and as flowchart.

V02 remains open: review nested colored groups in both directions, light/dark, forced colors and grayscale with a human reader.

V03 remains open: use a real touch device and assistive technology to reach a hidden branch, inspect it, and verify focus restoration. Prior math acceptance does not satisfy these flowchart exercises.
