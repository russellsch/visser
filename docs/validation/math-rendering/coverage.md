# Math rendering coverage inventory

Status: retained field/path evidence **complete** for candidate `2580f37cc7e747b5096481a7e2b0bc222913626d22d93523faa3b22c9f568378`; human acceptance remains open; final automated release checks passed. Baseline: repository HEAD `2f6bc5c8f30363ab50392cb3bc736dfdc6808c66`; governing plan `docs/plans/math-rendering.md`. This ledger records actual source fields and current rendering paths. It does not assert that math works, that a test ran, or that a screenshot was approved. Every field named in a row needs an executed case; grouping fields here does not waive field-level evidence.

Case IDs are stable. `HTML` means compiler-created page content; `SVG` means compiler-created native drawing; `runtime` means text created or moved by `reader.ts`, `figure-viewer.ts`, or `mermaid.ts`; `MD` means `projectText` / `document.md`. For every distinct path, the eventual evidence must cover correct mixed prose/math, long math, JavaScript disabled, and conversion failure. Shared delivery cases must additionally cover site, relocated standalone HTML, print, narrow viewport, and offline rendering as the plan requires. `Wn` names the planned implementation and test owner. The per-row evidence paths below are historical placeholders; exact executed mappings are in `evidence.json`. A **field/path proven** status refers only to that machine evidence, not release or human acceptance. COV-25/COV-26 and Mermaid portions of other rows are **deferred** under the user-approved plan amendment.

| Case | Source field(s) to exercise separately | Current path and delivery | Expected math behavior | M IDs | Owner; planned evidence path | Status |
| --- | --- | --- | --- | --- | --- | --- |
| COV-01 | Paragraph text; emphasis/strong/strike text; line breaks | `compile.ts` `inlines`/`block` → HTML, appendix/inspector; `project.ts` → MD | Inline and unnumbered display source survives rich formatting and projection; code stays literal. | M02 M03 M08 M09 M13 | W1/W3; `evidence/COV-01` | field/path proven |
| COV-02 | Headings; link text; `term`, `focus`, `detail-link` child text | `compile.ts` `inlines`/`link`/`inlineTag` → HTML/nav/inspector; MD | Math renders inside visible link labels without altering destinations, IDs, term scope, or focus targets. | M02 M08 M13 M15 | W1/W3; `evidence/COV-02` | field/path proven |
| COV-03 | List items, blockquotes, table headers/cells | `compile.ts` `block` → HTML; MD | Inline math appears in each container; long expressions scroll locally and preserve table structure. | M02 M03 M04 M13 | W1/W3; `evidence/COV-03` | field/path proven |
| COV-04 | Image `alt` text | `compile.ts` `image` → HTML `img[alt]`; MD source representation | If designated as human-readable text, math has a readable accessible string without treating image `src` as math. Verify whether visible typesetting is inapplicable, with approval recorded. | M02 M03 M13 | W1/W3; `evidence/COV-04` | field/path proven |
| COV-05 | Frontmatter `title` | `compile.ts` `<title>` and fallback h1; runtime contents/navigation text; `project.ts` MD title | Visible title may typeset; browser title, metadata, and accessible names retain readable source. | M02 M03 M13 | W3/W4; `evidence/COV-05` | field/path proven |
| COV-06 | Numbered `equation` body/ID and inline `eqref` | New registry → HTML anchors/numbers, runtime, MD, reference packets | Source order sets number; stable `x-ID` and exact TeX persist across reorder, copy, text view, viewer, and failure. | M03 M04 M05 M06 M09 M13 M15 | W1/W4; `evidence/COV-06` | field/path proven |
| COV-07 | Figure `title`, `question`, and prose body for graph/trace/transform/compare/annotated/domain/measure/tree/mermaid/extension | `compile.ts` `figureShell` → caption, question, body, accessible name; MD `renderComponent` | Each field parses math; question term links, caption, body, and readable names remain coherent. Exercise each figure family. | M02 M03 M13 | W3/W5; `evidence/COV-07` | field/path proven |
| COV-08 | `note` body; `self-check.question` and answer body; `detail.label` and body; `step.label` and body | `compile.ts` `note`/`selfCheck`/`detail`/`stepsSection` → HTML/inspector; runtime moves details; MD. | Math appears in used fields, including closed details and step lists. Source and numbers remain when hidden or JS fails. `detail.summary` is excluded as an unused field. | M02 M03 M13 M15 | W3/W4; `evidence/COV-08` | field/path proven |
| COV-09 | `definition.term` and body; `definition.aliases` matching input | `compile.ts` term links, glossary, `definitionSentence`; runtime term tooltip; MD | Term/body math remains readable; aliases are matching keys, not independent visual formulas. A definition with math in its first sentence must not be flattened into an incorrect tooltip or summary. | M02 M03 M13 M15 | W3/W4; `evidence/COV-09` | field/path proven |
| COV-10 | `source.title`; captured excerpt and code fence/spans | `compile.ts` source appendix, citation tooltip metadata, code lines; runtime citation tooltip; MD | Title may render where visible; excerpt, code and LaTeX examples remain exact literal source. | M02 M03 M08 M13 | W1/W3/W4; `evidence/COV-10` | field/path proven |
| COV-11 | Graph architecture `group.label`, `node.label`, `edge.label`, `edge.quantity` | `compile.ts` `graph`/`edgeLabel` → ELK `layout.ts` → `graphSvg`; list, inspector, MD | Each text field sizes before routing and typesets in SVG and list; quantity keeps its derived parentheses and source fallback. | M02 M03 M10 M13 | W3; `evidence/COV-11` | field/path proven |
| COV-12 | State graph `state.label`, `transition.label`, `transition.event`, `transition.guard`, `transition.action` | `edgeLabel` combines label/guard in SVG; event/guard/action list, inspector, MD | Run boundaries survive combinations; bracketed guard and notes retain math and correct geometry. | M02 M03 M10 M13 | W3; `evidence/COV-12` | field/path proven |
| COV-13 | Cause graph `factor.label`, `causal-link.label` | `graph`/`graphSvg`, list, inspector, MD | Math keeps measured label size and source form alongside fixed `basis` cue. | M02 M03 M10 M13 | W3; `evidence/COV-13` | field/path proven |
| COV-14 | Plan graph `task.label`, `task.owner`, `task.output`, `task.acceptance`, `task.risk`, `dependency.label`, `dependency.quantity` | `graph`/`graphSvg` for task/dependency labels; owner in list/inspector; inspector facts and MD for remaining prose | Every prose field retains math. `status`, `due`, dependency `kind` are controlled/structured facts; do not parse their machine meaning as TeX. | M02 M03 M10 M13 | W3; `evidence/COV-14` | field/path proven |
| COV-15 | Transform `stage.label`, `stage.representation`, `stage.shape` (string or strings), `stage.units`, `stage.location`, `stage.ownership`, `conversion.label`, `conversion.loss`, `conversion.condition`, `conversion.quantity` | `boxLineSegments` → SVG label/representation/location; `edgeLabel` → SVG label/loss/quantity; other stage/conversion prose → list/inspector; all → MD | Preserve text/math runs through joined shape and `loss:`/quantity strings; measure before routing. | M02 M03 M10 M13 | W3; `evidence/COV-15` | field/path proven |
| COV-16 | Domain `concept.label`, `concept.attributes` (strings), `relation.label`, `relation.cardinality` | Graph SVG and relation labels; glossary/definition body; inspector facts, MD | Each attribute string and cardinality shown to readers retains math; relation composition reserves size. | M02 M03 M10 M13 | W3; `evidence/COV-16` | field/path proven |
| COV-17 | Graph list labels and endpoint names; collapsed `group.label`; proxy edge label and fallback callout text | `compile.ts` graph list; `svg.ts` fold boxes, fold controls, proxy routes/callouts; runtime fold toggles | Every derived occurrence uses the source-owned run and measured box; folded and unfolded versions, keyboard labels, and complete list stay readable. | M02 M03 M04 M10 M13 M15 | W3/W4; `evidence/COV-17` | field/path proven |
| COV-18 | `actor.label`, `event.label`, `branch.label`, `branch.condition`; actor/entity and event/message/branch-derived labels | `compile.ts` `trace` → flat list, narrow actor cards, `traceSvg` lanes/boxes/branch headings; inspector, MD | Maintain runs in all compositions and both list forms; actor/lane and branch geometry account for tall math. | M02 M03 M10 M13 | W3; `evidence/COV-18` | field/path proven |
| COV-19 | `trace.timeUnit` joined with numeric time | `compile.ts` trace scale/list and `traceSvg` time lines; MD | Unit is readable text without changing numeric ordering/units semantics; combined line is measured. | M02 M03 M10 M13 | W3; `evidence/COV-19` | field/path proven |
| COV-20 | `measure.unit`, `reading.label`, `reading.display` | `compile.ts` measure table; `measure-svg.ts` bar labels, values and max-axis tick; inspector, MD | Preserve numeric `value` for bar length; typeset textual unit/display/label and reserve SVG size including maximum tick. | M02 M03 M10 M13 | W3; `evidence/COV-20` | field/path proven |
| COV-21 | `tree.entry.label` and `entry.path` | `compile.ts` nested tree list and summary, inspector, MD | Label typesets; path remains a literal machine path in monospace, including dollar signs. Confirm source fallback at deep closed levels. | M02 M03 M08 M13 | W3; `evidence/COV-21` | field/path proven |
| COV-22 | `compare.option.label`, `criterion.label`, `criterion.units`, `cell.value` when string, and cell prose body | `compile.ts` comparison table and narrow cards; inspector, MD | Render each duplicate occurrence consistently; numeric cell values remain numeric; preserve card/table alignment and first-body value. | M02 M03 M10 M13 | W3; `evidence/COV-22` | field/path proven |
| COV-23 | `annotated.annotation.label` and authored explanatory body | `compile.ts` annotation marks/list/inspector; `project.ts` diff/source projection | Math in explanation/label persists; source excerpts and line ranges stay literal. | M02 M03 M08 M13 | W3; `evidence/COV-23` | field/path proven |
| COV-24 | `extension.part.label`, extension part descriptions, extension-specific string attributes | `compile.ts` `extension` list/inspector; extension binding → `extensions/svg.ts`; MD | Host-owned text typesets and falls back; extension-drawn text needs an explicit capability with its own measurements and contract. | M02 M03 M10 M13 | W3/W5; `evidence/COV-24` | field/path proven |
| COV-25 | Mermaid flowchart node/subgraph/edge label; state name/transition label; sequence participant/message label | `mermaid/figure.ts` model → compiler source/lists → runtime `mermaid.ts` SVG; MD | Validate with Mermaid's effective engine, preserve grammar, source/lists and drawn geometry; each family and label field needs a case. | M02 M03 M07 M10 M13 | W5; `evidence/COV-25` | deferred |
| COV-26 | Mermaid `other` family source and any human-readable label in its native grammar | Compiler source-only fallback → runtime Mermaid rendering; MD | A supported family may not silently lose math validation or fail into a blank drawing. Record per-family capability and source fallback. | M02 M03 M07 M13 | W5; `evidence/COV-26` | deferred |
| COV-27 | Inspector title/qualifications, canonical detail body, term/definition and citation tooltip, appendix search/filter row, reference panel label/quote | `runtime/reader.ts` reads compiled attributes/text and moves canonical detail; no new authored target | Rendered math must not be flattened by `textContent` copies, corrupt source quote/copy, duplicate canonical IDs, or disappear in a filtered row. | M02 M03 M13 M15 | W4; `evidence/COV-27` | field/path proven |
| COV-28 | Figure viewer title, drawing, source/list sections, moved detail; print restoration | `runtime/figure-viewer.ts` moves existing figure/lists; `reader.ts` restores details for print | Moving views neither clones target IDs nor invalidates formula SVG fragment IDs; source and list remain accessible in viewer and print. | M02 M03 M04 M13 M15 | W4; `evidence/COV-28` | field/path proven |
| COV-29 | Every authored text field above in semantic Markdown; equation numbers/ref destinations | `model/project.ts` `renderInline`, `renderBlock`, component/entity/mermaid branches → `document.md` and CLI Markdown export | Original TeX, IDs, numbers and resolved references remain readable; generated labels do not replace source. | M05 M06 M08 M13 M15 | W1/W5; `evidence/COV-29` | field/path proven |

## Boundaries and scope gaps to resolve

- W5 family-level implementation and historical evidence are tracked in [mermaid-coverage.md](mermaid-coverage.md). Remaining Mermaid work is deferred; COV-25/COV-26 do not block retained-scope completion.

- The current schema exposes readable fields that the plan's overview does not name individually: `image.alt`, `trace.timeUnit`, `measure.unit`, `reading.display`, `criterion.units`, `concept.attributes`, task prose facts, stage `shape`/`ownership`, annotation labels, definition first-sentence tooltips, and extension-specific string attributes. Rows above keep them in scope until an explicit approved applicability decision.
- `detail.summary` and `cite.note` are schema-accepted unused fields: neither has a render consumer. They remain literal stored attributes and are excluded from math occurrence collection and conversion validation until a visible consumer is specified. Do not claim rendering based on schema membership alone. An extension `part` may independently use custom string facts named `summary` or `note`; those are displayed by the part inspector and remain eligible for math collection under COV-24.
- `tree.entry.path`, IDs, reference keys, link/image destinations, source paths/URLs/hashes, enums, timestamps, evidence IDs, numeric measure values, and raw code/excerpts retain their existing literal or machine semantics. A `source.title` and text shown from a source label are readable; provenance fields are not a math authoring surface.
- Current runtime appendix filtering is a text query over detail summaries, not a separate authored search field. The authored summary/label must stay searchable in source form after typesetting. Runtime copy and reference text must come from source-owned data; copying SVG paths is not acceptable.
- Generated legend words, status/role/basis cues, and fixed UI controls are toolkit text. Where they compose with authored labels, the authored portion must remain a separate math run. Extension-owned SVG and text inside imported images require the explicit capability boundary in the plan; they cannot be silently claimed as covered.

## Evidence and human-gate integration hooks

1. During implementation, add `M01`–`M15` entries and distinct math test tags to `tests/traceability.json`. `scripts/check-contracts.mjs` now calls `scripts/math-evidence.mjs` to require exact field/check identities from `coverage-fields.json` and executed testcase mappings in `evidence.json`, including browser project identities. The independently pinned inventory digest prevents silent removal of fields or delivery checks. A suite name or this inventory is not proof of a case.
2. Retain Vitest JUnit and Playwright JSON/JUnit/HTML in `reports/`; the completion record under `docs/validation/math-rendering/` must bind their candidate commit/patch digest, toolkit digest, fingerprints, test inputs, counts, failures/skips, and execution times. Missing report means blocked. Record screenshots, print PDFs/page renders, network-attempt logs, and unchanged-output digests for the applicable cases.
3. Add math-specific rows to `docs/validation/human-gates.md` (or a linked record): independent notation-corpus interpretation, first visual/geometry/print baselines, manual keyboard scrolling/reference use, screen-reader equation reading, and the V01–V08 author/reader exercise. Record reviewer, date, device/OS/browser, corpus version, and outcome. These remain open until a person performs them. Existing first-baseline, keyboard, touch, and macOS gates remain separate.
4. Apply the architecture §18.8 checks to narrow reflow, font/path-glyph size, local scrolling, focus return, offline requests, and print. Existing `font-size >= 14px` checks on SVG `<text>` do not establish SVG path glyph legibility. The plan's independent math corpus and measured tolerances supply the additional oracle.

## Historical evidence increments

The following increments record earlier candidates and are superseded by the current field closure below. Their outstanding counts are historical.

### Executed field evidence added 2026-10-09

These cases close specific missing HTML/projection/native-slot assertions, not
entire rows: browser success/failure, print and manual applicability evidence
still need their distinct paths recorded. Log: `reports/math/retained-field-coverage.log`
(7 passed, two files).

- `compiler.math-detail-surfaces.test.ts`, “preserves distinct authored formulas
  in component, definition, and source fields”: COV08 note body, self-check
  question/answer, detail label/body, step label/body; COV09 definition term/body
  and plain alias matching; COV10 source title plus captured code remaining literal.
  Each field's distinct formula is asserted in scoped HTML and semantic Markdown.
- `compiler.math-native-fields.test.ts`, parameterized “$id $family preserves each
  field in HTML and Markdown and reserves native geometry”: six cases COV11–16,
  architecture/state/cause/plan/transform/domain. Every field listed in each case
  has a unique formula checked in readable HTML and Markdown. Native fields are
  individually matched by authenticated expression key; slot width/height must
  fit conversion metrics at 14px, allowing the serializer's half-unit rounding
  at three decimal places (0.0005px). Title/question/body are exercised in each
  case as partial COV07 coverage.

Applicability correction: existing `docs/IMPROVEMENTS.md` §3.4 keeps task owners
and transform shape/units out of diagram boxes. The tests retain their HTML/MD
checks without inventing new native text paths. Transform representation/location
and domain concept attributes do have native slots and are checked there.


Additional executed field cases: `reports/math/other-field-coverage.log` records
2 tests / 2 files passed (2026-10-09):

- `compiler.math-other-surfaces.test.ts`, “preserves authored formulas and literal
  machine/excerpt text across HTML and Markdown”: COV20 measure unit, reading label
  and display, including 7:14 numeric bar-width ratio; COV21 entry label plus literal
  dollar-containing path; COV22 option/criterion/units, explicit cell value and
  first-body derived value in table and narrow cards, authored body in inspector;
  COV23 annotation label/body plus literal captured source. Title, question and
  figure body are independently exercised for these four families (COV07).
- `compiler.math-extension.test.ts`, “COV-24 preserves part labels, authored
  descriptions and custom facts in host HTML and Markdown”: extension title,
  question/body and part label/body/custom/summary/note fields each use a distinct
  formula. The inspector and semantic Markdown retain them. The extension-owned
  drawing remains its own unchanged output; this does not claim automatic
  typesetting inside arbitrary extension SVG.

These remain compiler-path evidence. The full field-by-path browser/fallback
matrix, machine-readable completeness gate and manual reviews remain open.


## Machine evidence gate

`coverage-fields.json` is the pinned minimum field/delivery inventory for the
27 retained COV cases. `evidence.json` contains only recorded assertions: each
entry binds one field/check to an exact JUnit classname/test name, report hash,
and source-input digest. Browser entries additionally require a browser spec and
exact project. Duplicate, unknown, missing, skipped, failed and stale evidence
fails `test:contracts`. The manifest cannot close human gates or substitute for
reviewing whether each named assertion actually exercises its claimed field.

The current complete unit suite passed 2,493 tests. Its preserved report is
`reports/math/evidence-full-suite-junit.xml`. Reviewed compiler assertions supply
171 field/check mappings; 749 remain unproven, chiefly browser delivery variants
and the remaining existing-test mappings. These are obligations, not 749 known
bugs or necessarily separate tests. `reports/math/field-evidence-status.json`
lists the exact remaining keys. Updating any source/test/config input invalidates
these mappings until the affected evidence is rerun and rebound. Changes to the
inventory itself require a matching reviewed pin update in math-evidence.mjs.

### Reviewed browser field evidence, 2026-10-09

The integrated math-components and math-native-fields browser matrix passed 42
cases across Chromium 1440/1024/390/320, reduced motion, and JavaScript disabled.
It covers successful rendering, worker failure, long input, print and no-JS
source for COV-01/02/03/05/08/09/11–16, plus COV-07 graph/transform/domain common
fields. Each mapped obligation identifies an exact passing project/testcase;
the complete matrix is retained in reports/math/field-matrix-playwright-junit.xml.
Independent Sol review findings were corrected and rechecked. Disclosures are
opened in these isolated math-runtime tests; reader movement, interactive
navigation, ink geometry and human visual acceptance require separate evidence.

The fresh 2,493-test unit/integration report and reviewed browser mappings now
prove 501 of 920 field/check obligations in evidence.json. The remaining 419
are enumerated in reports/math/field-evidence-status.json. Row-level acceptance
is not implied where geometry, delivery paths or human gates remain open.

### Expanded text/figure evidence and narrow overflow correction, 2026-10-09

COV-01/02/03 now have explicit HTML and semantic Markdown field contexts, with
ordinary-Markdown table reparse. COV-06 has source/ID/reference proof in HTML,
Markdown and all browser modes. COV-10 distinguishes captured source, ordinary
fences and inline code, including long literals in browser modes. COV-20–23 and
measure/tree/compare/annotated common fields have reviewed five-mode browser
coverage. Deep closed tree nodes remain initially closed and are revealed by
ordinary native interaction, including no-JS. Long inline formulas now scroll
locally without widening the page; keyboard, baseline, scale, resize/focus and
observer-cleanup regressions accompany the production fix.

The fresh integrated run passed 141 browser cases and 2,495 unit/integration
tests. evidence.json records 697 obligations with 223 still unproven, bound to
candidate a35851f2f414a225ba1c7de5a3998652e1f08c15efd20864db1bb70800f3f217.
These results do not replace remaining reader/viewer, installed delivery,
geometry or human acceptance evidence. Existing standalone release artifacts
are historical after this runtime/CSS change.

### Retained-scope interpretation of generated views

The user-authorized Mermaid deferral also applies to the five
`COV-28/viewer.source/browser-*` obligations: native Visser figures have no authored
source pane, while the Mermaid source pane travels with its figure into the viewer.
Keep these exact obligations in the pinned inventory and report them as deferred,
never proven. Native drawing, title, list, moved detail and print restoration remain
required; readable equation source within those views remains required.

`COV-29/projection.authored-fields/markdown` is aggregate evidence. Its completion
requires valid, current-candidate evidence for every non-COV29 Markdown obligation;
one broadly named passing testcase is insufficient. The independently reviewed
set contains 121 obligations. Generated fold/proxy geometry is not Markdown
content: projection preserves the original group labels and endpoint/relationship
semantics, including math, rather than serializing routing coordinates or callout
keys. HTML and browser checks still exercise the actual generated geometry.


## Current retained field closure

Candidate `2580f37cc7e747b5096481a7e2b0bc222913626d22d93523faa3b22c9f568378`
has 914 direct and one derived proven obligation, five explicitly deferred
Mermaid viewer-source obligations, and zero unproven retained obligations or
checker errors. The inventory remains 920; deferred entries are never counted
as proven. COV-07 and COV-29 statuses apply to retained surfaces only.

Evidence: `evidence.json`, `reports/math/field-evidence-status.json`,
`reports/math/complete-fields-binding.log`,
`reports/math/complete-fields-playwright-junit.xml` (full retained run: 1,324 passed, 407 applicability skips), and
`reports/math/complete-fields-full-suite-junit.xml` (283 files, 2,518 passed).
The derived Markdown aggregate requires all 121 pinned constituent obligations.
Independent review covered the field assertions and checker derivation.

This closes field/path reconciliation, not C01–C08 as a whole. Final release checks passed; human notation, visual, print, keyboard and
assistive-reading acceptance remain open. See completion.md for gate dispositions.
