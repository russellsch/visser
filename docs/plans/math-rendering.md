# Math rendering: design and implementation plan

Status: implementation authorized and active. Remaining Mermaid work is deferred by the user; completion now focuses on Markdown, native Visser visuals and standalone export, including their outstanding verification and acceptance. Current evidence is recorded in [progress.md](../validation/math-rendering/progress.md).
Date: 2026-10-05. Baseline: `2f6bc5c8f30363ab50392cb3bc736dfdc6808c66`.
Owner: the implementation developer. Review owner: the planning agent.

## Scope amendment: Mermaid deferred

The user asked to stop worrying about Mermaid while it is being retired. This
amendment supersedes requirements elsewhere in this document to finish every
Mermaid family before completing math support.

- Defer remaining Mermaid adapters, family/shape coverage, Mermaid-specific
  geometry work and acceptance. W5 and COV-25/COV-26 do not block this release.
- Preserve completed work and unfinished adapters; do not activate unfinished
  Agentflow support or remove Mermaid as part of this math task.
- Continue the Markdown and native Visser requirements, equation numbering and
  references, readable-source fallback, and fully standalone single-file HTML.
- Apply C01–C08 to that retained scope. Required regression checks still cover
  shared changes that ship; the deferral is not a claim that Mermaid work passed.

## Intent and accepted decisions

Support LaTeX equations throughout Visser-authored text. Preserve the existing single-file HTML export.
The user accepts readable LaTeX when JavaScript is disabled or rendering fails.
The user accepts horizontal scrolling and wants equation numbering and references.
Custom macros are unnecessary. Existing stable target IDs remain the identity mechanism.
Blocking invalid exports is desirable. This design also rejects invalid math during `check` and `build`.

Browser rendering is the preferred delivery strategy. The HTML carries source expressions and one packaged renderer.
This preference does not establish that its file size is smaller. Measure that claim before selecting the engine.
Build-time validation and diagram measurement remain necessary even with browser rendering.

## Governing sources and current behavior

- [Architecture](../ARCHITECTURE.md): restricted Markdoc (§6), identity and layout (§7), offline output (§13), and safe content (§15).
- [Syntax adapter](../../packages/core/src/syntax/parse.ts): tokenizes with Markdoc 0.5.10.
- [Syntax profile](../../packages/core/src/syntax/profile.ts): defines restricted syntax. Fences remain raw leaves.
- [Target model](../../packages/core/src/model/targets.ts): source spans, dependencies, text, and stable IDs.
- [Projection](../../packages/core/src/model/project.ts): semantic Markdown generated from the model.
- [Layout](../../packages/core/src/compiler/layout.ts): deterministic text metrics and ELK run during compilation.
- [SVG renderers](../../packages/core/src/compiler/svg.ts): labels currently use strings and fixed line heights.
- [Measure renderer](../../packages/core/src/compiler/measure-svg.ts): bar-row labels use the same text-only assumptions.
- [HTML builder](../../packages/core/src/compiler/html.ts): element and attribute allowlists; no general raw-markup escape hatch.
- [Compiler](../../packages/core/src/compiler/compile.ts): CSP, render dispatch, files, and browser asset requirements.
- [Standalone exporter](../../packages/cli/src/commands/export.ts): embeds reader CSS/JS and image bytes; embeds Mermaid conditionally.
- [Mermaid runtime](../../packages/runtime/src/mermaid.ts): asynchronous rendering with source/list fallbacks.
- [Build script](../../scripts/build.mjs): release assets, workers, dependencies, and license notices.
- [Budget checks](../../scripts/check-budgets.mjs): exact browser asset inventory and existing JS/CSS gates.

The installed Markdoc tokenizer holds a private markdown-it instance. It exposes no public plugin registration method.
Do not assume a math plugin can simply be registered through the existing public adapter.
The installed Mermaid 12 source recognizes `$$...$$` and uses KaTeX. Its bundled distribution must be inspected separately.
Do not assume its module-level dynamic import needs a network request or that the prebuilt bundle supplies every required asset.

Existing unrelated untracked plans and reviews are outside this write scope. The tracked baseline was clean when planning began.

## Requirements

The implementation developer owns these obligations. Acceptance remains open until the linked coverage and completion gates have evidence. Each verification names its success criterion.
User-derived behavior is accepted in principle; spelling, algorithms, and proposed policy remain design proposals.

| ID | Obligation | Source | Verification and success criterion |
| --- | --- | --- | --- |
| M01 | A standalone math export shall open from one HTML file without network or sibling files. | User | Relocate export; block network; all supported math renders. |
| M02 | Visser shall support inline math in every Visser-owned human-readable text surface. | User: everywhere | Coverage inventory fixtures exercise every declared field and rendering path. |
| M03 | Visser shall preserve readable equation source when rendering is unavailable. | User | Disabled JS, load failure, and conversion failure retain complete source. |
| M04 | Display equations shall permit horizontal scrolling without forced shrink-to-fit. | User | Keyboard and narrow-viewport checks retain readable size and all content. |
| M05 | Numbered equations shall use stable document-local target IDs. | User and existing identity contract | Reorder and replacement fixtures preserve IDs and canonical anchors. |
| M06 | Equation references shall resolve to derived numbers and stable destinations. | User | Forward references and insertion update labels without changing target IDs. |
| M07 | The compiler shall reject invalid or unsupported math before publishing an export. | Proposed error policy | Diagnostics identify source and existing output remains intact. |
| M08 | Code and captured source shall retain their literal contents. | Existing source contract | Delimiters and tags in fences, code spans, and excerpts do not render. |
| M09 | Math parsing shall preserve original source byte spans. | Existing identity contract | LF/CRLF, Unicode, assign, resolve, and replace tests preserve exact spans. |
| M10 | Native diagram layout shall reserve the dimensions of rendered math before edge routing. | Existing layout contract | Fractions, matrices, mixed labels, folds, and proxies do not clip or overlap. |
| M11 | Math processing shall preserve the existing prohibition on authored executable content. | Existing security contract | Hostile TeX, URLs, markup, and resource exhaustion fixtures fail safely. |
| M12 | Documents without math shall not load or embed math browser assets. | Proposed packaging policy | Release/site/standalone asset assertions pass. |
| M13 | Math shall retain a readable representation in text view, print, and semantic Markdown. | Existing fallback contract | Source, IDs, numbers, and references remain available in each mode. |
| M14 | Renderer configuration and font data shall be pinned by the toolkit release. | Existing reproducibility contract | Packaged builds resolve only verified local dependencies. |
| M15 | Browser conversion shall not change authored target identity or reference quotes. | Existing reference contract | Packets before/after typesetting resolve to the same source-owned target. |

## Authoring contract

Proposed syntax:

```markdown
The energy is $E = mc^2$.

{% equation id="eq_energy" %}
E = mc^2
{% /equation %}

As shown in {% eqref ref="eq_energy" /%}, energy depends on mass.

<!-- vs:id eq_ratio -->
$$
\frac{a}{b} = \frac{c}{d}
$$
```

`equation` is a numbered raw-body block. It uses its explicit ID and needs no preceding marker.
`eqref` is an inline, self-closing reference. It renders `Equation (N)` as an ordinary anchor to `x-ID`.
`$$` is an unnumbered display block. At document top level it takes an ordinary marker; `ids assign` supplies missing markers.
Nested unnumbered displays belong to their enclosing addressable target, like existing nested prose.
Inline equations have no independent target ID.

Number equations by opening source byte position, starting at 1 for each document.
Include equations inside details, even when initially collapsed. Runtime visibility does not affect numbering.
This is source order, not visual reading order. Appendix relocation and citation ordering can display Equation (2) before Equation (1).
That behavior is intentional: moving a detail between reader hosts must not renumber equations.
HTML and semantic Markdown use the same source-order registry, even when their presentation orders differ.
Document this rule and test an early definition equation shown after a later main-text equation.
One equation block has one number. Use `aligned`, `gathered`, or a matrix within that block for multi-line notation.
Keep automatic TeX numbering disabled. Reject `\label`, `\ref`, `\eqref`, `\tag`, and user macro definitions with migration guidance.
An `eqref` target must be a numbered `equation`; an unnumbered display is not a valid destination for this tag.
Use existing `focus` links for authored text pointing to any target without a generated equation number.
Cross-document equation references and per-line numbering are outside this increment.

Permit numbered blocks at document top level and directly in eligible addressable tag bodies that accept prose blocks.
Reject numbered blocks nested through an ordinary list, list item, blockquote, or table, even inside an eligible tag body.
Those ordinary blocks are atomic replacement targets; this increment does not introduce addressable descendants within them.
Inline math and unnumbered displays remain available in their valid prose positions and belong to the outer target.
W0 must enumerate eligible tag parents from schemas and renderer behavior, rather than enabling the tag in every component indiscriminately.
For an allowed nested equation, the enclosing addressable tag is its `parentId`; projection and guarded replacement follow that ownership.
Test list/quote rejection, nested-tag parent IDs, and retention of equation IDs when replacing an enclosing tag.
Reject numbered blocks inside headings, inline tags, code, labels, and other raw math blocks.

Inline delimiters cannot cross a paragraph or an attribute boundary. An opening `$` must be followed by non-whitespace.
A closing `$` must follow non-whitespace and cannot be immediately followed by a digit.
An unmatched single dollar remains literal. An unmatched standalone display delimiter is a syntax error.
Use `\$` for literal currency when text could otherwise form a math pair. Code spans show literal syntax examples.
Document ambiguous currency examples explicitly; delimiter rules cannot infer author intent in every sentence.
Only standalone delimiter lines open display blocks. In native label strings use inline delimiters, even for tall notation.

The source adapter must retain raw TeX before Markdown escape processing.
For quoted Markdoc attributes, first apply exactly the existing string-literal decoding, then parse math in designated text fields.
An author probe of Markdoc 0.5.10 confirmed the spelling below. W0 must turn it into parser characterization tests.

```markdown
{% node id="ratio" role="process" label="$\\frac{a}{b}$" /%}
{% node id="matrix" role="process" label="$\\begin{matrix}a & b \\\\ c & d\\end{matrix}$" /%}
```

Two source backslashes become one TeX backslash in a quoted attribute. Four become a TeX row separator.
A single source backslash before `frac` produced a Markdoc parse error in the probe.
The ordinary Markdown body parser also reduced a two-backslash row separator to one; raw-body interception is required.

## Coverage and exclusions

W0 produces a field-by-field coverage ledger. W5 closes every required row before this feature is called complete.

| Surface | Integration |
| --- | --- |
| Paragraphs, headings, lists, quotes, tables, link text | Structured inline math nodes; no replacement of link destinations. |
| Captions, questions, caveats, definitions, notes, self-checks, details, steps | Shared rich-text rendering with accessible source projection. |
| Native graphs: node, edge, group, state, task, stage, concept labels | Mixed text/math metrics before layout; SVG insertion at runtime. |
| Trace actor/event/branch labels and generated label combinations | Preserve run boundaries when composing text; update lane and event dimensions. |
| Measure labels, tree entries, compare text and values | Rich-text fields only; numeric values retain their numeric semantics. |
| Inspector, text views, folded groups, proxy labels, legends, search/review text | Reuse source-owned runs; keep copies and references source-based. |
| Document title and navigation text | Visible HTML may typeset; browser title, metadata, and accessible-name strings use readable source. |
| Mermaid labels | Dedicated Mermaid integration; preserve Mermaid grammar and layout lifecycle. |
| Extension parts and extension-owned SVG | Host-rendered part descriptions support math; drawn extension text requires an explicit extension capability. |

IDs, paths, URLs, enum values, numeric machine data, evidence IDs, and code are not math surfaces.
Do not modify text baked into imported images or arbitrary extension SVG. No post-processing regex over generated SVG.
This ownership boundary is a limitation of “everywhere,” not a claim that those external drawings support math.
Any required built-in surface that fails the prototype remains a release blocker, not a silent omission.

## Compiler and model design

Introduce a source-owned `MathExpression` with raw TeX, display mode, original span, and enclosing target ID.
Introduce `TextRun = text | math` for human-readable attribute values and layout inputs.
Preserve existing prose formatting AST nodes; insert math leaves rather than flattening paragraphs to strings.
Introduce an equation registry containing ID, ordinal, source span, and optional enclosing target.
Build the registry before rendering references. Add `eqref` dependencies to the containing target's dependency set.
Duplicate IDs continue through the existing document-global ID validation.

Keep `bodySha256` based on original normalized source, including equation tags and TeX.
Keep generated ordinals and runtime SVG out of source hashes and copied author quotes.
The normal source revision and toolkit digest invalidate compiled artifacts when inputs change.
Use a separate rendering cache key containing TeX, mode, engine/configuration/font digest, and measurement parameters.
Do not share mutable TeX macro state between expressions or documents.
Projection prints readable TeX plus equation numbers and stable target markers. Resolve `eqref` from the same registry as HTML.
Table-cell projection must escape Markdown syntax and encode literal pipes without changing the recovered readable source.
Use a table-safe literal-text projection for math, including escaped dollar delimiters, rather than asking a downstream math parser to decode entities.
Escape Markdown punctuation first, then encode ampersands, then encode pipes as `&#124;`.
Do not escape the generated entity's `#` afterward. Preserve TeX backslashes through Markdown text escaping.
Reparse projected tables with the pinned ordinary Markdown tokenizer and verify column count and decoded cell text.
Include absolute-value bars, escaped bars, ampersands, and backslashes. A visually plausible projection alone does not pass.
Update useful-depth and review text deliberately: generated numbers or duplicated source fallbacks must not inflate authored explanations.

### Parser adaptation gate

First characterize math, Markdoc tags, comments, table pipes, and escapes against the pinned parser.
Do not access private tokenizer internals or regex-rewrite the whole source into placeholders.
Preferred implementation: a maintained tokenizer adapter using the same pinned markdown-it behavior and required Markdoc plugins,
with explicit raw math rules before Markdown interpretation and a tested token-to-Markdoc adapter.
Determine whether this requires copying a small licensed adapter or an upstream-supported extension point during W0.
If token compatibility cannot be proved, stop and revise the syntax/adapter decision before W1.
Any copied adapter carries its upstream license and characterization tests. Do not fork the entire parser casually.
Raw equation bodies must bypass Markdoc variable/tag evaluation just as code fences do, with original byte mapping intact.

### Validation and measurement

Use a bounded Node worker, following the existing Mermaid worker lifecycle.
Validate all equations during `check`, not only when a figure needs dimensions.
Add an explicit asynchronous `validateMath` service after `loadBundle` in `runCheck`; bundle loading alone does not execute a math engine.
Skip engine work after fatal parse errors. Merge source-located results into diagnostics before determining the exit code or running editorial review.
Ordinary `check` uses the executing toolkit's worker and reports against that toolkit, preserving its ability to check without a lock.
The installed shim continues to select the locked toolkit. `check --release` additionally resolves and verifies that exact toolkit as today.
Configure the math worker from the executing release in `bin.ts`, following the existing Mermaid-worker binding.
Source-mode checks use the local pinned adapter. They do not claim validation against an unrelated selected browser pack.
Build, serve, and export call the same validation service before emitting output and reuse validated results for measurement.
Test ordinary `check`, `check --release`, build, and export with the same unsupported command and source-located error.
Batch unique expressions per document; return diagnostics and normalized width, height, depth, and baseline metrics.
The worker's renderer and the browser renderer share a pinned configuration module and command/environment policy.
Start with base math and the required AMS environments. Enumerate supported commands/environments in shipped guidance.
Do not advertise arbitrary LaTeX document compilation, package loading, files, or custom macros.
Treat renderer error output as an error even if its API returns markup instead of throwing.
Convert worker failures to source-located diagnostics; never publish a partial document.

Choose explicit expansion, expression-size, output-size, aggregate-work, heap, and execution limits during W0.
Record their measured rationale before implementation; existing source-size limits alone do not bound TeX expansion.
Count both unique expressions and every rendered occurrence, including alternate views and planned derived labels.
Compute an aggregate expanded-output budget from validated conversion size/node count multiplied by occurrence counts.
Enforce occurrence and expanded-output limits before publishing, even when all occurrences share one conversion cache entry.
Account for viewer movement or any future clones separately; avoid multiplying hidden representations without accounting for them.
Keep worker cancellation enforceable from the parent process. Isolate conversion state between documents.
In the browser, reuse conversions and process occurrences in yielding batches; stop on the published aggregate budget.
A promise or timer cannot interrupt synchronous typesetting. W0 must establish a bounded main-thread conversion envelope,
or require a packaged browser-worker conversion path with cancellation and corresponding CSP/delivery tests.
Retain source when the runtime budget is exhausted. Stress-test many repetitions of one short equation as well as distinct complex equations.

## Browser runtime and native layout

Preferred candidate: packaged MathJax TeX-to-SVG with a fixed local font and supported extension set.
This is a candidate, not an observed installed dependency or validated package configuration.
KaTeX remains the comparison candidate, particularly because Mermaid already uses it.

Emit explicit fallback nodes with escaped source. Never scan the completed page for dollar delimiters.
Emit a document-local expression table and occurrence records so repeated math can share source and conversion results.
Treat expression keys as rendering cache keys, never as authored target IDs.
Initialize the renderer only if math is present. Prevent default automatic typesetting and network extension loading.
Retain source until conversion and validated insertion succeed. A failed occurrence retains source and a readable error notice.
Use DOM text APIs for source. Validate generated SVG elements, attributes, and fragment references before insertion.
Namespace generated IDs per occurrence, including viewer copies, so local glyph caches cannot collide.
Prefer local SVG definitions for movable expressions; evaluate shared definitions only after move/clone tests pass.

Native layout consumes measured runs rather than `textWidth(tex)`.
Wrap only between text words and complete inline expressions. A formula is an indivisible run.
Compute line ascent/descent from both text and math. Update label rectangles, node padding, edge labels, group headers, and trace rows.
Use explicit normalized math metrics and the same chosen scale at build and browser time.
Do not measure math against an arbitrary installed system font or rely on the browser's surrounding font heuristics for diagram geometry.
Keep ELK at build time. Do not reroute graphs after browser rendering.

For no-JS native diagrams, retain a complete text/list representation and a visible route to it.
Raw TeX inside a formula-sized SVG box is not an adequate fallback. Before typesetting, math-bearing drawings may show the text view.
Reveal a math-bearing native drawing only after its required equations render; failure keeps its readable text view available.
Prose may render incrementally. Hidden detail math and viewer copies must use the same idempotent lifecycle.
Do not erase reference listeners, marks, or canonical targets when replacing a math placeholder.
Printing must not hide both source and visual forms during an asynchronous transition.
Print has no horizontal scrolling. Therefore the initial print contract always includes wrapped LaTeX for each equation and its number.
Hide math visuals that could overflow printed prose; use source text with preserved whitespace and emergency wrapping for long tokens.
Math-bearing native figures print their complete text/list representation. Do not rely on `overflow: visible` to fit paper.
Allow long source representations to paginate. No-JS printing follows the same rules without a `beforeprint` dependency.
Verify narrow-paper PDF output before and after conversion, including an unbreakable equation longer than a printed line.

Retain accessible source and semantic math output where the selected engine supports it.
Avoid duplicate screen-reader announcements of fallback, MathML, and SVG.
Readable LaTeX is an accepted fallback, not evidence of high-quality spoken mathematics. Test keyboard and assistive reading explicitly.
Selection and Copy reference use the source-owned representation, not serialized glyph paths.
Provide a way to copy the original LaTeX from rendered equations without requiring users to select SVG glyphs.

## Mermaid integration gate

Mermaid is a separate grammar and renderer. Its existing math support uses `$$...$$` and KaTeX.
Preserve native syntax outside explicit, reviewed math admission; do not reinterpret arbitrary Mermaid source using the prose tokenizer. ER requires a pinned lexical extension for quoted math-bearing entity names: permit backslashes only inside complete native same-line `$$…$$` spans, preserve source bytes and ranges, and retain ordinary-string rejection. Apply the same extension to node parsing, collection and browser rendering; validate admitted TeX through the existing math policy.
W0 must inspect the actual packaged `mermaid.min.js`, not only its ESM source.
Test math in the supported diagram families, strict security mode, narrow view, and disabled-network standalone output.
W0 must also prove source-located extraction and validation of every math-bearing label in each supported family.
Current model extraction covers flowchart, state, and sequence; `other` diagrams retain source without comparable label enumeration.
Include malformed math in an `other` family and labels outside mapped nodes, such as titles, notes, and edge annotations.
Use grammar-aware family adapters or an upstream validation hook. Scanning all fenced text for delimiters cannot establish label coverage.
An unvalidated math-bearing family must fail before export with a specific diagnostic until its adapter exists.
Such failure is an interim guard, not satisfaction of the user's everywhere requirement; W5 remains incomplete until required families work.

Preferred route: use Mermaid's supported math path, package its required assets, and validate those expressions with its effective engine.
Do not validate Mermaid with MathJax while rendering it with KaTeX and assume the supported commands match.
If this ships two engines, report total artifact size and justify it against a unified KaTeX alternative.
Do not expose Mermaid's private bundled KaTeX as an undocumented public API.
Post-render replacement of Mermaid labels is not acceptable unless layout is proven correct after equation sizing.
If a built-in family lacks a supported math path, design an adapter before declaring coverage complete.
Failure must preserve the existing readable source and lists; report any unsupported family explicitly.

## Packaging, CSP, and compatibility

Generalize conditional browser assets beyond `needsMermaid` without removing its compatibility behavior prematurely.
Keep the existing bundled-CLI enforcement in `resolveForDocument`: executing and selected release digests must match.
Do not load worker code from a document-selected release to bypass this rule.
For source-mode builds, compare an explicit math-policy fingerprint with the selected browser pack before compilation.
The fingerprint covers engine, dependency/font bytes, supported commands, configuration, and metric normalization.
Reject mismatches with an actionable diagnostic. W0 must prove this source-mode path alongside the already protected bundled path.
Release manifests must include the math runtime, worker, font data, styles, hashes, and license notices.
Serve only declared browser assets. Keep worker code outside the served pack.
Site export copies required assets with integrity metadata. Standalone export embeds every transitive dependency once.
If fonts are used, rewrite CSS font URLs to embedded data URLs for standalone files.
Bundle dynamic font ranges locally or disable unsupported autoload behavior. `connect-src 'none'` remains in force.
Test `file://` directly: same-origin assumptions from a local HTTP server are not sufficient.

Keep document-authored scripts, styles, URLs, and HTML prohibited.
Add the minimum generated-markup allowance proven necessary by W0. Do not add an unrestricted HTML builder escape hatch.
Inspect both header and meta CSP generation. Math-only, Mermaid-only, combined, and no-math pages need separate tests.
If generated inline styles are necessary, document the page-scoped CSP exception and keep authored styles rejected.
Permit font sources only when the chosen output needs fonts; SVG path output should not require browser font downloads.

Existing documents remain pinned to their toolkits. Old toolkits reject new equation tags as unknown syntax.
New-toolkit upgrades can reinterpret paired dollar text. Include a dry-run diagnostic for newly recognized math spans and document escaping.
Do not silently rewrite existing prose on upgrade or change its IDs. No new source hash algorithm is required.
Update schema enums only where an actual serialized contract requires them; test old records and unknown kinds before changing versions.
Amend architecture, revisions, diagnostics, authoring guides, and asset budgets alongside implementation.
Do not silently waive existing size gates. Report actual added raw and compressed bytes and propose justified math-specific budgets after W0.

## Work packages and stop conditions

Implementation sequencing amendment: W0 now has independent parser, renderer, resource, and Mermaid evidence gates.
An isolated foundation may proceed after its own gate passes, without enabling an unproven rendering path.
This permits the verified tokenizer port while Mermaid scope remains unresolved; it does not waive C01 or release coverage.
Integration and release still require every relevant gate, and no unsupported family may be counted as complete.

| Package | Ownership and work | Dependencies | Acceptance / stop condition |
| --- | --- | --- | --- |
| W0: evidence prototype | Disposable spike, coverage ledger, measured artifact report; no production edits | None | Prove parsing/spans, attributes, native metrics, offline engine packaging, and Mermaid route. Stop for design revision on any failed gate. |
| W1: syntax and model | `syntax/`, `model/`, shared types, affected schemas, parser/model fixtures | W0 parser gate; integration requires relevant remaining gates | IDs, numbering, forward refs, literal code, spans, projection, and invalid-input behavior pass. |
| W2: engine adapter | New `math/` module and worker; shared configuration; CLI `check` and `bin` bindings; worker tests | W0, W1 interface | Ordinary check invokes validation; dimensions are deterministic; invalid input and exhaustion fail within selected limits. |
| W3: text and native geometry | Compiler, `layout.ts`, `svg.ts`, `measure-svg.ts`, rich text fixtures | W1, W2 | Every native family and composed label path reserves measured geometry and retains fallback. |
| W4: runtime and delivery | Runtime math module, reader/viewer integration, CSS, CLI export/serve, build/release scripts | W1, W2 interfaces; W3 integration | Offline single file, conditional assets, CSP, copying, print, idempotence, and movement tests pass. |
| W5: Mermaid and coverage closure | Mermaid adapter, alternate views, extension host text, coverage ledger | W0 route; W1–W4 | Every built-in coverage row has implementation and evidence; no hidden family exclusions. |
| W6: release readiness | Guides, architecture/revisions, fixtures, budgets, final integrated verification | W1–W5 | Completion gates C01–C08 below pass on the release candidate; evidence and human acceptance are recorded. |

Use one writer per shared file set. Runtime/compiler integration needs coordinated ownership of `compile.ts` and shared types.
W1 and W2 can proceed separately only after their interfaces are fixed. Do not parallelize speculative edits to shared files.
Use bounded implementation agents when useful; use separate review for parser, security, compatibility, and final integration changes.
This plan authorizes no implementation agents, dependency installation, commits, pushes, or publication by itself.

## Verification matrix

| Area | Required cases |
| --- | --- |
| Parser | Inline/display/raw tag; emphasis, table pipes, links; code fences/spans; comments; malformed delimiters; currency; CRLF; emoji; backslashes; attributes; EOF. |
| Identity | Assign markers; nested-tag targets; list/quote rejection; guarded parent replacement; unchanged inline owner; source versus display ordering; duplicate IDs; forward/missing/wrong-kind references; packets. |
| Math | Fractions, scripts, roots, Greek, integrals, sums, matrices, aligned derivation; unsupported command; malformed braces; forbidden macros/URLs/HTML; resource exhaustion. |
| Geometry | Mixed runs, tall/deep equations, long unbreakable math, edge labels, group headers, collapsed proxies, trace lanes, measure rows, dark theme, viewer cloning and zoom. |
| Runtime | JS disabled; asset load failure; one conversion failure; details opened after load; repeated-expression stress and output caps; copy source; narrow-paper print before/after conversion; text view; fallback restoration. |
| Packaging | Installed release outside checkout; site subpath; relocated single file; no sibling assets; blocked network; glyphs that trigger dynamic data; no-math asset omission. |
| Safety | Generated markup allowlist; fragment ID scope; no document URL loads; malicious TeX; bounded worker cancellation; CSP header/meta; preserved old output on error. |
| Mermaid | Actual packaged bundle; native grammar; all label fields; malformed math in an `other` family; tall math; effective engine validation; strict mode; source/list fallback; combined assets. |
| Accessibility | Keyboard references and scrolling; one accessible equation representation; meaningful source fallback; reading order; no duplicate canonical IDs. |
| Compatibility | Existing fixtures and guides; old/new locked toolkit behavior; literal currency upgrade diagnostic; hashes; exports; release inventory and license accounting. |

W0 measures actual standalone raw bytes and gzip bytes for sparse and dense equation documents, including repeated and distinct equations.
Compare runtime MathJax, runtime KaTeX where feasible, and a pre-rendered control; include fonts and all transitive assets.
Gzip size is a comparison metric, not the size of a double-clicked HTML file.
Record startup-to-typeset timing, main-thread work, DOM size, fallback behavior, and layout movement on the same machine/browser.
Do not invent a crossover point or performance threshold before measurements.

Implementation verification: focused unit/integration suites, `npm run typecheck`, `npm test`, `npm run build`, browser suites,
`npm run test:offline`, `npm run test:budgets`, `npm run test:clean-machine`, then `npm run test:contracts` after reports exist.
Run full browser tier for final integration. Record actual commands and environment restrictions; do not call an unrun check passed.
Browser support initially follows the repository's Chromium contract; broader compatibility requires separate evidence.

## Verification, validation, and completion evidence

Verification proves that implementation meets M01–M15. Validation checks that the resulting authoring and reading workflow meets the user's need.
Passing unit tests or completing the work packages alone does not establish feature completion.
Apply architecture §18.8 to this feature, including traceability, report evidence, network isolation, and human visual approval.
The rules below extend those mechanisms where math needs a different oracle.

### Traceability and coverage ledger

During W0, create a math coverage ledger under `docs/validation/math-rendering/`.
Each row records a stable case ID, requirement IDs, source field, renderer path, delivery mode, expected result, and evidence path.
Also record implementation owner, test owner, status, and any exclusion with rationale and approval authority.
Use explicit statuses: planned, passed, failed, blocked, and approved-not-applicable. Missing evidence is blocked, never passed.
These are proposed artifact paths; the directory and tests do not yet exist.

Inventory fields from validation schemas, compiler renderers, alternate views, and runtime-created text.
Do not infer complete coverage from one example per component family or from successful prose math.
Test every inventoried field at least once through its actual rendering path.
For each distinct renderer path, cover success, disabled JavaScript, conversion failure, long math, and mixed text/math.
Use representative combination tests for delivery, themes, and viewports; record omitted combinations and their rationale.
Do not omit a unique path, such as a collapsed proxy or Mermaid family, merely because another family passes.

Add M01–M15 mappings to `tests/traceability.json` during implementation, with distinct math test tags.
Map cases to executed test identities, not just to files or suite names.
Extend contract checking to validate the math ledger and expected case set against reports.
The current checker finds passing tags; this alone does not prove every required field or case ran.
Do not mark a requirement covered until all its required cases pass or have an explicitly approved applicability exclusion.

| Requirement | Minimum evidence allocation |
| --- | --- |
| M01, M12, M14 | Installed-release tests; relocated single-file and site tests; asset manifest; network-attempt log; policy fingerprint checks. |
| M02 | Complete field/path ledger; positive rendering cases; state and fallback cases for each distinct path. |
| M03, M04 | Forced failures and no-JS browser results; source recovery; local scrolling and page-overflow assertions. |
| M05, M06, M09, M15 | Parser/model/CLI tests; guarded edits; numbering/anchor checks; packets and source quotes before and after conversion. |
| M07, M08, M11 | Negative fixtures with exact diagnostics; literal-code tests; bounded-work cases; output preservation; CSP and unsafe-input results. |
| M10 | Build/browser metric comparisons; glyph containment and collision checks; approved visual corpus across native renderers. |
| M13 | Text/projection round trips; print PDFs; keyboard and assistive reading records; complete source and reference recovery. |

### Independent mathematical and visual oracles

Before implementing renderer assertions, freeze a small authored correctness corpus with an independently checked expected interpretation.
Record literal TeX, expected notation structure, expected plain-language reading, and an approved visual reference for each case.
Include nested fractions, grouped exponents, subscripts, unary minus, roots, bounds on sums/integrals, Greek symbols, and matrices.
Include matrix row/column order, multi-line alignment, absolute-value bars, escaped characters, and mixed prose.
Use near-neighbor pairs such as `x^{a+b}` versus `x^a+b`; tests must detect changed grouping, not merely a visible result.
A reviewer who can read the notation approves that symbols, grouping, and bounds retain their intended meaning.
The selected engine's output cannot be its own sole correctness oracle. A screenshot generated today is not an approved baseline.

Automated tests compare available semantic structure, accessible representation, source recovery, and diagnostic results with fixed expectations.
Check that accepted formulas produce no renderer error node, missing-glyph marker, or unsupported-command fallback.
Pixel comparisons cover typography regressions only after a person approves the initial baseline, as architecture §18.8 requires.
Record the reviewer, date, corpus version, browser, fonts, and pinned screenshot environment.
Agent visual inspection supplies evidence and defects; it does not substitute for the required human baseline approval.

| Concern | Automated oracle and required judgment |
| --- | --- |
| Native geometry | Compare browser math bounds/baseline against the reserved build-time rectangle in the same SVG coordinates. Check glyph ink containment and forbidden label/shape/route intersections, excluding authored or intentional contacts. W0 fixes rounding tolerances from measured evidence. |
| Baselines and type size | Compare mixed-run baseline and ascent/descent against approved samples. Existing SVG text font-size checks do not measure path glyph size. Check actual rendered dimensions and visually review scripts, fraction bars, and matrix rows. |
| Narrow reflow | At the repository's 320/390 CSS-pixel cases, document width must not exceed viewport width. Only declared local math/figure scroll containers may overflow; keyboard navigation reaches their full content. |
| Print | Narrow-paper PDF contains all equation source and numbers, wraps long tokens, and preserves pagination. Inspect rendered pages for clipping; text extraction alone cannot prove visibility. |
| Identity and copying | Exactly one canonical `x-ID` exists per target. Copying math returns the original TeX; copied target packets resolve before/after typesetting and viewer movement. |
| Accessibility | Inspect the accessibility tree for one equation representation and correct reading order. Perform keyboard and screen-reader checks; automated accessibility lint alone does not establish understandable mathematics. |
| Offline behavior | Prove network isolation, record requests, and assert no network attempts. Opening with requests merely aborted is insufficient if rendering silently fell back. Assert rendered success separately from the deliberate no-JS fallback case. |
| Atomic failure | Record existing export/snapshot digests, trigger an invalid expression or worker failure, and verify unchanged bytes and a nonzero diagnostic result. |

Tolerance values must have an owner, measurement basis, unit, supported environment, and fixed acceptance rule in the W0 report.
Do not choose a tolerance by widening it until the current implementation passes.
Geometry changes that intentionally alter references need documented reapproval, not automatic screenshot regeneration.

### W0 decisions and performance gates

W0 delivers a decision record, measurements, corpus, and coverage inventory before production work starts.
Resolve engine/version/font selection, parser adaptation, Mermaid family validation, and source-mode policy matching.
Set the resource limits already required above, including occurrence and aggregate expanded-output limits.
For each limit, test below, at, and above the boundary where applicable, plus cancellation and readable failure behavior.

Record raw standalone bytes, compressed comparison bytes, startup-to-typeset time, main-thread blocking, and expanded DOM size.
Benchmark sparse/dense and repeated/distinct expressions with recorded machine, browser, input hashes, warm/cold conditions, and repeated runs.
Separate network-independent startup from conversion and DOM insertion. Report variability rather than a single best run.
W0 proposes justified math-specific artifact budgets and responsiveness targets; the plan owner accepts or revises them before W1–W5.
Preserve existing hard gates. State which new metrics gate release and which remain informational, consistent with the architecture's timing policy.
A metric cannot move from gating to informational solely because a candidate fails it.
If timing remains informational, manual acceptance must still record whether the representative workflow remains usable during typesetting.
An unresolved limit or decision blocks W0; it is not an implicit waiver for the release.

### End-to-end validation exercise

Run this exercise on the installed release candidate, outside the source checkout, with a realistic explanation from the corpus.
The implementation developer records execution evidence. A human reviewer records authoring, visual, and accessibility acceptance.
Use the repository's Chromium support boundary and record OS/browser versions; do not claim untested browser support.

| Case | Action | Expected outcome and evidence |
| --- | --- | --- |
| V01: author | Write inline math, a numbered aligned equation, forward references, a native label, and a Mermaid label using the guide. | Guide examples work without undocumented escaping. Save source, command output, and rendered views. |
| V02: revise | Insert and reorder numbered equations; change one through a guarded reference packet. | Numbers follow documented source order; links retain destinations; unrelated IDs/source remain unchanged. Save before/after packets and diffs. |
| V03: distribute | Export one HTML file, copy it into an otherwise empty directory, and open under proven network denial. | Typeset prose and supported diagrams work with no sibling dependency or network attempt. Save export digest, request log, and screenshots. |
| V04: degrade | Disable JavaScript, then separately inject runtime load/conversion failures with JavaScript enabled. | Full readable source, numbers, and references remain available. No blank figure or clipped source is accepted. Save each distinct result. |
| V05: navigate | At narrow width, follow references, scroll long equations, open details/viewer, and return using keyboard controls. | Content remains reachable; identity, focus return, and reading position follow existing reader contracts. Save assertions and manual observations. |
| V06: reuse | Copy LaTeX and a target reference; open text view and semantic Markdown. | TeX is exact, packets resolve, table columns survive, and alternate views retain the intended equations. Save recovered text. |
| V07: print | Print narrow-paper output before and after typesetting, including no-JS output. | Wrapped source and numbers remain complete and legible across pages. Save PDFs, page renders, and inspection notes. |
| V08: reject | Introduce malformed/unsupported math and a resource-limit violation; run check/build/export. | Required diagnostics identify source; no partial output replaces prior valid artifacts. Save logs and unchanged-output digests. |

Validation records must answer whether the author could express the intended equations and the reader could follow, recover, and reuse them.
Record friction and notation errors, not only whether commands exited successfully.
This is feature acceptance, not a claim that math support improves comprehension in a population-level study.

### Evidence bundle and final completion checklist

Store the completion record under `docs/validation/math-rendering/`, with links to retained machine reports and human records.
Record repository commit plus any dirty patch digest, toolkit/release digest, dependency/configuration fingerprints, and test-input hashes.
Record Node/browser versions, environment, commands, test counts, failures, skips, and executed-at times.
Bind screenshots, PDFs, network logs, and budgets to that same candidate. Do not reuse stale reports from another build.
Use JUnit/Playwright reports and contract checks to derive automated status. Keep manual acceptance visibly separate.
Missing tools or browser binaries produce blocked results; they do not reduce the expected test set.
Skips require an explicit reason and applicability decision. A skipped required capability keeps its completion gate open.
Changes after acceptance invalidate affected evidence; identify and rerun affected tests and integrated release checks before closing gates again.

| Gate | Completion condition | Evidence / owner |
| --- | --- | --- |
| C01 | All W0 decisions, limits, budgets, and required scope are fixed; no feasibility gate remains open. | Decision record and measurements / plan owner. |
| C02 | M01–M15 and every required coverage row have passing evidence; no unique rendering path is omitted. | Traceability and coverage ledger / implementation developer. |
| C03 | Required unit, integration, browser, offline, budget, clean-machine, and contract checks pass for the exact candidate. | Fresh reports, counts, candidate manifest / test owner. |
| C04 | Correctness corpus and geometry/print baselines have recorded human approval; no unresolved notation or clipping defect remains. | Approved corpus, screenshots, rendered PDFs / human visual reviewer. |
| C05 | V01–V08 and keyboard/assistive reading checks pass within the declared environment. | Validation records and accessibility evidence / human acceptance reviewer. |
| C06 | Negative tests prove safe failures, enforced limits, preserved output, and complete offline assets. | Attack/failure cases, network logs, digests / implementation developer and independent reviewer. |
| C07 | Independent implementation review has no unresolved blocking or material finding. | Findings, dispositions, and material-fix rechecks / independent reviewer. |
| C08 | Guides, diagnostics, supported syntax, compatibility notes, and known limitations match shipped behavior. | Compiled guide fixtures and release checklist / implementation developer. |

Declare the feature complete only when C01–C08 pass. Report remaining gates individually if completion is blocked.
Scope changes or risk acceptance require explicit authority and a revised requirement/acceptance record; they cannot silently convert failures into passes.
W0 prototype completion, design-review closure, and final feature completion are separate statuses.

## Rollout and recovery

Deliver through a new pinned toolkit. Existing documents continue to use their old release until explicitly upgraded.
Build and export use existing staged/atomic publication. A failed check leaves the old export or served snapshot intact.
Rollback selects the prior toolkit and restores compatible source through normal version control; new math tags need removal or conversion first.
Do not delete old snapshots, change document locks, or migrate content automatically as part of this feature.

## External evidence and unresolved gates

- [MathJax SVG options](https://docs.mathjax.org/en/latest/options/output/svg.html): local/global glyph caches; output choice.
- [MathJax conversion metrics](https://docs.mathjax.org/en/v4.0/web/convert.html): explicit em/ex/container metrics.
- [MathJax Node configuration](https://docs.mathjax.org/en/latest/server/preload.html): components and font-data loading require deliberate packaging.
- [KaTeX browser packaging](https://katex.org/docs/browser.html): JavaScript, CSS, fonts, and optional auto-render are distinct assets.
- [Mermaid math configuration](https://mermaid.js.org/config/math.html): its math path uses KaTeX.

These sources establish available mechanisms, not proof that a selected release satisfies this plan.
Open gates: exact engine/version/font selection; parser adapter strategy; resource limits; Mermaid family coverage; measured asset budgets.
W0 resolves each gate in the plan before production implementation. A failed gate requires a documented design change.

## Review record

Three fresh Sol reviewers examined the initial draft: syntax/identity, rendering/layout, and security/distribution.
The author checked their findings against repository code and revised this document.
See the [review record](../reviews/math-rendering-plan.md) for snapshot hashes, dispositions, evidence, and material-fix rechecks.
The subsequent V&V amendment adds explicit completion gates; the review record distinguishes it from the earlier reviewed snapshot.

### User acceptance amendment — 2026-10-09

After reviewing the screenshots, the user requested a copy icon instead of the
repeated “Copy LaTeX” label and instructed: “Then close out human acceptance, it
looks good enough to me.” C04 is closed by approval of the shown appearance plus
waiver of unperformed exercises. C05 and unperformed V01–V08/manual checks are
closed by waiver, not recorded as test passes. Physical-device and assistive
reading results remain unknown. This supersedes the requirement to hold this
math delivery open for additional human sessions; unrelated project human gates
are unchanged. See `docs/validation/math-rendering/completion.md` for delta checks.
