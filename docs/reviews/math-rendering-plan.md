# Math rendering plan: independent review and pressure test

Date: 2026-10-05. Status: all seven material findings closed at the design level after independent rechecks.
Artifact: [design and implementation plan](../plans/math-rendering.md).
Repository HEAD: `2f6bc5c8f30363ab50392cb3bc736dfdc6808c66`.
Scope: planning documents only. No production implementation, dependency installation, commits, or publication.

## Review snapshots and routing

- Initial plan SHA-256: `56829acb31267556597834e5814690f617154f3182d3257a992a292ecbc33935`.
- Revised plan SHA-256: `fd673509a8ca2c3548a2a3158201c9ec25e46b9345bab7eb710550adb3ee5682`.
- Original final plan SHA-256: `1a0e503209d0171056466174a3c021618b35fe694f3b7396060ff02bfeaf335b`.
- The tracked worktree was clean. Existing unrelated untracked plans and reviews were excluded and preserved.

All three reviewers rechecked the revised hash and closed their material findings.
The original final plan differed only by splitting one source-list bullet to clear a prose lint warning; no design obligation changed.
The later V&V amendment below is a separate revision and does not inherit an unqualified three-reviewer approval.

The user requested three Sol subagents. Three native agents accepted explicit `gpt-6-sol`, High requests with fresh contexts.
Tool configuration records the requested routes; separate provider-level model telemetry was unavailable.
Each reviewer received the fixed plan hash, repository revision, user requirements, evidence pointers, and a read-only boundary.
Each was prohibited from editing or delegating. They inspected repository sources and returned findings without running tests.

| Reviewer task | Lens |
| --- | --- |
| `/root/math_syntax_review` | Syntax, model, source identity, projection, compatibility |
| `/root/math_render_review` | Rendering, geometry, runtime, accessibility, Mermaid |
| `/root/math_security_review` | Security, distribution, offline behavior, resource limits, sequencing |

## Findings and author dispositions

### SYN-1 — Nested numbered equation ownership

Material. The initial phrase “inside prose-bearing bodies” did not exclude ordinary lists and quotes.
The parser tracks enclosing tag IDs, not ordinary block IDs, when assigning `parentId` to tag targets.
A nested numbered equation could become a false root in projection and escape descendant-retention checks during replacement.
Evidence: [parse.ts](../../packages/core/src/syntax/parse.ts), [project.ts](../../packages/core/src/model/project.ts),
and [replace.ts](../../packages/core/src/references/replace.ts).

Author pressure test: confirmed the parser's `parentTagId` traversal, root filtering, and ancestry-based replacement checks.
Disposition: fixed by restricting numbered equations to top level or direct children of eligible addressable tags.
Numbered equations nested through lists, quotes, or tables are explicitly rejected. Inline math remains supported there.
The plan now requires nested-tag ownership and guarded replacement tests.
Recheck: syntax reviewer confirmed closure on the revised hash.

### SYN-2 — Math pipes corrupt projected Markdown tables

Material. A formula containing `|` could add columns in semantic Markdown because cells are currently joined verbatim.
Evidence: table projection in [project.ts](../../packages/core/src/model/project.ts).

Author pressure test: inspected table projection and ran the pinned Markdoc tokenizer on a proposed literal-text escape.
The first attempt escaped the `#` inside generated pipe entities and failed exact source recovery.
The corrected order escapes Markdown punctuation first, then ampersands, then pipes.
The sample `$\left|a & b\right|$` recovered exactly, with two columns retained.
Disposition: fixed with table-safe literal projection and column-count/decoded-text round-trip acceptance tests.
Recheck: syntax reviewer confirmed closure on the revised hash.

### SYN-3 — Source numbering differs from reader presentation order

Material ambiguity. Source-order numbering can display out of sequence after definitions move into an appendix.
Evidence: main-body entity omission in [compile.ts](../../packages/core/src/compiler/compile.ts)
and citation ordering in [project.ts](../../packages/core/src/model/project.ts).

Author pressure test: confirmed both presentation reorderings. A change to DOM-order numbering would make host movement affect identity labels.
Disposition: fixed by making source-order numbering an explicit design tradeoff, shared by HTML and projection.
The plan warns that Equation (2) may appear before Equation (1), and requires a definition/main-body example.
Recheck: syntax reviewer confirmed closure as an intentional documented tradeoff.

### REN-1 — Horizontal scrolling does not solve printed overflow

Material. Paper cannot scroll, and existing print CSS permits visible viewport overflow.
A long rendered equation or raw source could run beyond the page.
Evidence: print rules in [reader.css](../../packages/runtime/src/reader.css).

Author pressure test: confirmed that screen scrolling and print visibility do not guarantee readable paper output.
Disposition: fixed with an explicit initial print policy: wrapped source and equation numbers, with text/list views for math-bearing figures.
Source can paginate and break long tokens. No-JS print needs no event callback.
The plan requires narrow-paper PDF checks before and after conversion.
Recheck: rendering reviewer confirmed closure on the revised hash.

### REN-2 — Mermaid math validation is not complete across families

Material. Model extraction covers flowchart, state, and sequence. Other families keep source without equivalent label enumeration.
Runtime rendering failures occur after export, contradicting export-blocking validation if no family adapter checks math first.
Evidence: [parse worker](../../packages/core/src/mermaid/parse-worker.ts), [types](../../packages/core/src/mermaid/types.ts),
and [runtime](../../packages/runtime/src/mermaid.ts).

Author pressure test: confirmed extracted families and browser error handling. A global source regex cannot prove grammar-aware coverage.
Disposition: fixed with a W0 gate for source-located enumeration and effective-engine validation of every required label field.
The test matrix includes malformed math in an `other` family and non-node labels.
An interim error blocks unvalidated math-bearing families; this guard cannot satisfy W5 coverage completion.
Recheck: rendering reviewer confirmed closure on the revised hash.

### SEC-1 — Ordinary check lacks a renderer invocation

Material. `runCheck` currently loads the bundle and resolves a toolkit only for `--release`.
The original plan assigned engine implementation without explicitly wiring ordinary `check` to it.
Evidence: [check command](../../packages/cli/src/commands/check.ts).

Author pressure test: confirmed the command sequence. Requiring lock resolution for every check would introduce an unrelated behavior change.
Disposition: fixed with an explicit `validateMath` service invoked after bundle loading and before exit status and editorial review.
Ordinary checks use the executing toolkit, preserving lockless checking; release checks retain exact toolkit verification.
W2 now owns CLI check/bin bindings and cross-command error tests.
Recheck: security reviewer confirmed closure on the revised hash.

### SEC-2 — Unique-expression limits do not bound repeated output

Material. One validated expression can have many rendered occurrences, producing excessive SVG nodes or browser work.
Existing source and target limits do not bound this expanded output.
Evidence: [source limits](../../packages/core/src/syntax/profile.ts) and the proposed unique-expression cache.

Author pressure test: confirmed that deduplicated conversion avoids repeated typesetting but not repeated DOM allocation.
Disposition: fixed with occurrence counts and aggregate expanded-byte/node budgets, including alternate and derived presentations.
Enforce limits before export, then batch runtime insertion with a budget and source fallback.
W0 must bound synchronous conversion or require a cancellable browser worker; promises alone do not provide cancellation.
Add both repeated-expression and distinct-complex-expression stress cases.
Recheck: security reviewer confirmed closure on the revised hash.

### Preliminary toolkit mismatch concern — narrowed after pressure test

The security reviewer initially questioned worker/browser release matching.
The author inspected [toolkit.ts](../../packages/cli/src/toolkit.ts) and found existing digest equality enforcement for bundled CLI execution.
The reviewer independently corrected the general claim before the final review. It is not a release-path defect.
The remaining source-mode concern is addressed with an explicit math-policy fingerprint gate.
The plan preserves existing release enforcement and forbids loading arbitrary document-selected worker code.

## Author verification evidence

- Read-only Node probes used the installed Markdoc 0.5.10 tokenizer and parser.
- Single-backslash `frac` in a quoted attribute failed parsing; doubled backslashes decoded correctly.
- Four source backslashes decoded to two TeX backslashes for a matrix row separator in a quoted attribute.
- Ordinary Markdown body parsing collapsed a two-backslash row separator, confirming the need for raw math parsing.
- Corrected table literal escaping retained two columns and exact decoded formula text.
- Repository evidence was checked for every material finding before disposition.
- Document lint was run on the initial plan: zero errors and one prose-length warning; the warning was corrected.
- The lint script does not parse requirement tables as formal records. The author manually checked M01–M15 for source, owner, status, and acceptance criteria.
- Final document lint checked both documents with zero errors and zero warnings.
- Explicit whitespace checks cover both new untracked files; tracked changes remain absent.

No application build, unit suite, browser suite, math-renderer benchmark, or offline-rendering prototype ran.
The proposed implementation still has explicit W0 feasibility gates. Design review closure does not prove those gates pass.

## V&V completion amendment

The user asked whether the plan sufficiently defines testing to judge completion, then authorized strengthening it before implementation.
The author identified a distinction between broad test coverage and executable completion criteria.
The amendment adds:

- Evidence mappings for every M01–M15 requirement and a field/path coverage ledger.
- An independently checked mathematical corpus with explicit notation, visual, and semantic expectations.
- Automated oracles and human checks for geometry, print, copying, accessibility, and offline behavior.
- W0 ownership and acceptance rules for measurements, limits, tolerances, and budgets.
- V01–V08 end-to-end acceptance exercises against an installed release outside the checkout.
- C01–C08 completion gates bound to the exact release candidate and fresh reports.
- Explicit blocked/failed states, skip handling, human baseline approval, and evidence invalidation after changes.

Amendment review snapshot: `a194f46f03c9703cae43844c183bc16e5677ceb0f9fa4092201be5622dbe57ef`.
The rendering reviewer received a bounded read-only review of these additions against architecture §18.8.
Review outcome: no material findings. The reviewer confirmed alignment with architecture §18.8 and existing traceability/report mechanisms.
This was a read-only document and source review; no feature tests ran. The reviewed amendment hash remains the delivered plan hash.

Author checks: document lint passed; explicit table checks covered all M requirements and unique V/C case IDs.
The table checker was scoped to the requirement section after its first version incorrectly counted mapping rows as duplicate requirements.
These are document checks, not executed feature tests. No implementation or new test code was written.
