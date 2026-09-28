# Explain specification revision history

This file records the review rounds and executed spikes that changed `ARCHITECTURE.md` after revision 1.0. Rounds 1–5 are in `ARCHITECTURE.md` §20. Section numbers below refer to the revision named in each round; revision 1.6 split §11.9 into §11.9–11.12.

## Round 6 — External model review (revision 1.1)

Two independent Kimi K3 reviews read revision 1.0: one for contract consistency, one for third-party assumptions, security, and handoff executability. The author checked each finding against the text before accepting it. This is an independent-model review, not a human review or an implementation test.

**Accepted corrections (revision 1.1):** normative definition of `entity` (§9.3); nested-ID retention in `refs replace` and a new guarded `refs retire` command (§11.9, §17.1); body-change acknowledgement in `refs refresh` (§11.9); `retiredTargets` in the frontmatter schema (§6.2); manifest source digests equal the revision-input digests (§7.1); canonical-domain render options (§7.4); `capture file --kind` for web/supplied/example sources (§17.1); no v1 garbage-collection command (§12.4); raw-HTML rejection as an adapter duty with fixtures (§6.5); a bundled text-metrics table for layout, and no Windows determinism claim (§7.5); `local-dir` and `archive` lock origins for bootstrap (§12.3); tailnet-reach warning for private documents (§13.4); explicit server limits (§15.4); manual lock recovery (§11.9); five added security tests (§18.5); clarified per-document JS budget (§2.3); companion files marked absent and replaced by materialization steps (Appendices A–C).

**Rejected or unchanged:** reproducible tar packing is not required, because the lock pins the published archive digest and the toolkit digest comes from the file tree. The budget-realism and Markdoc-maintenance notes need no change: §2.3 already labels budgets as targets, and §5.2 pins exact versions. Comment-marker adjacency stays the largest Phase 0 risk and is already gated by §7.3.

**Residual:** the reviews did not execute Markdoc, ELK, or Tailscale. Their third-party checks are documentation-based. The lost `verification/` fixtures must be regenerated.

## Round 7 — Three-lens model review (revision 1.2)

Three independent Claude Opus 5.5 reviews read revision 1.1: one for regressions from the 1.1 edits plus identity/hashing, one for the catalogue, projection, and reader, and one for plan executability and requirement coverage. The author checked every finding against the text; all findings were accepted, some with a narrower fix. This is a model review, not a human review or an implementation test.

**Identity, hashing, and editing:** `refs show` creates current packets for merge/split steps; `refs replace` accepts new sibling roots for a split; retire rules prevent replacement chains, report live referrers as `E_REF_BROKEN`, and insert frontmatter text minimally; edit results report dependent targets; the edit lock lives under `.explain/locks/` (renamed `.explain/edit-locks/` in Round 8); `local-dir`/`archive` lock diagnostics; code-point (not UTF-16) sort order; NFC-only bundle paths; entity-inherited labels.

**Catalogue and reader:** relationship `kind` mapping per family; `evidenceIds` from attributes plus body citations; `after` means all prerequisites and cannot join exclusive branches; ordinal traces reject times and the renderer prints the ordering caveat; transform merges; `annotated` source preconditions; plan `kind` separated from `label`; moved details return for print and Expand details; JS and no-JS deep-link contracts; generated DOM text excluded from quotes; per-view `data-ex-target`/`data-ex-rel` hooks.

**Plan and coverage:** Phase 0 emits `dist/release` and implements `init` with a `local-dir` lock; Phase 1 includes refresh and a minimal guarded replace, matching the handoff; every §17.1 command has a phase; JSON output schemas; complete §4.3 write list; §17.9 functions for every command; scripts in the §5.3 layout; tests T15–T20, R03 per-kind browser references, R10 release-API mock, R15 extension harness, R16 editorial fixtures; automated versus human release gates; per-phase exit checks and a network-blocked rule.

**Residual:** none of these checks executed code. The largest open risks remain Markdoc comment-marker adjacency (§7.3) and ELK determinism (§7.5).

## Round 8 — Four-lens model review (revision 1.3)

Four independent Claude Opus 5.5 reviews read revision 1.2: regressions from the 1.2 edits, adversarial security and privacy, LLM authorability, and a literal walkthrough of Appendix A from parse to retire. The author checked every finding against the text; all were accepted, one with a narrower fix (packet text limits and match flags instead of an `untrusted` output wrapper), and two duplicate findings were merged. This is a model review, not a human review or an implementation test.

**Regressions fixed:** `refs show` could bypass the body-change guard (now `issuedBy` and a rule that it serves only non-referenced targets); every dev rebuild broke locks (`--dev-toolkit`); T15 was unsatisfiable for nested targets; edit locks renamed to `.explain/edit-locks/` and gitignored; split siblings may precede the retained root; `quoteFound` added to `ResolveResult`; new codes `E_PATH_INVALID`, `E_ID_RETENTION`, `E_UNSUPPORTED`; module owners for new functions; repeated ordinal caveat removed from Appendix A.

**Security:** repository shims/toolchains run only when trusted in user scope; trust store location fixed in user scope; repository config cannot expose the server; document roots confined; Git hardened against hostile repositories; packet field limits and label/kind match flags; parse and literal limits (`E_LIMIT`); bundle files regular with magic-byte checks; public export lists all non-example sources; WHATWG link parsing; `O_NOFOLLOW` lock files; bidi escapes; archive case collisions; adversarial fixtures in §18.5.

**Authorability:** a required `references/format.md` grammar guide; skill steps for `init`, `capture file --kind example`, the resolve/refresh/replace/show procedure, span-error recovery, and `export --format markdown`; markers only at top level; guide checklist with attribute tables and diagnostics; a prose-first fixture; Appendix A labelled as syntax coverage.

**Walkthrough:** canonical elements carry body digests so any target can be copied exactly; normative derived target fields (`kind`, `label`, `plainText`, `parentId`, `sectionId`, `inspectable`, `dependencies`); derived `order` relationship IDs; collision-free instance IDs; declared content files; `effectiveRenderOptions` membership; projection ID lines; retire whitespace and YAML format; page-title and `question` DOM rules.

**Residual:** none of these checks executed code. Markdoc comment-marker adjacency (§7.3) and ELK determinism (§7.5) remain the largest open risks.

## Round 9 — Executed spikes (revision 1.4)

Unlike Rounds 1–8, this round executed code. Three spikes under `spikes/` tested the largest open risks; the author reran each spike's commands and confirmed the reported results before changing the spec. Node was v25.9.0 (plus a local v24.21.0 for ELK); results need a rerun on the pinned toolchain.

**Markdoc spans (`spikes/markdoc-spans/`, Markdoc 0.5.10):** the marker and byte-span design works. All 23 Appendix A targets bound with identical byte spans across LF, CRLF, BOM, and no-final-newline variants. Spec changes: fences are raw leaves (Markdoc parses tags and variables inside fences by default); strict comment rules (trailing text after `-->` is silently dropped, and multi-line markers evade raw-line checks); ATX headings only and fences only (Markdoc disables setext headings and indented code); the adapter enforces one-line tag openings; `html: true` confirmed as the raw-HTML detection method.

**Hash vectors (`spikes/hash-vectors/`):** independent TypeScript and Python implementations agreed on 93 of 95 vectors; the 2 divergences exposed an integer-lexing gap. The UTF-16 sort bug was reproduced (a naive sort gives a different revision). Spec changes: exact string escaping, scalar-value strings, text-level integer grammar, `-0`, not-JCS warning, bundle path grammar and diagnostics, digest kind by role, docId regex, fixed `effectiveRenderOptions` keys, sorted extension digests, and canonical-bytes-only URI parsing.

**ELK determinism (`spikes/elk-determinism/`, elkjs 0.12.0):** byte-identical rounded layouts on Linux across processes, workers, and Node 24/25; 8 cold 40-node/80-edge layouts took under 1 s of layout time on a 16-core desktop. A 200-node/400-edge layout took 3–4 s, so the node/edge caps, not a wall-clock timeout, bound layout cost. Spec changes: fixed ELK option allowlist, the meaning of authored order, a 60 s safety timeout, and the Node version recorded in `build.json`.

**Residual:** macOS determinism, a slower laptop, real font metrics, full-pipeline timing, and Node 24 reruns of the Markdoc and hash spikes are untested.

## Round 10 — Git spike and testing review (revision 1.5)

**Git hardening spike (`spikes/git-hardening/`, Git 2.43, executed):** the author reran it. The §8.2 read path ran no hostile-repository code across fsmonitor (including through `include.path` and `includeIf`), hooks, textconv, filters, `diff.external`, pagers, and credential or proxy settings; `--end-of-options` and the leading-dash check both stopped option injection. Three redirection gaps were confirmed: a `.git` gitfile made the capture return another repository's content under the requested repository's name, `alternates` allowed a foreign commit to resolve, and an inherited `GIT_DIR` redirected a naive read. `git status` ran a clean filter even with the `-c` flags. Spec changes: allowlisted Git environment, git-dir and toplevel containment, alternates refusal, blob and symlink-blob checks, no `safe.directory` override, `E_SOURCE_UNAVAILABLE`, and new §18.5 fixtures.

**Testing and validation review (Claude Opus 5.5, documentation only):** all 13 findings accepted. Spec changes: an applicable Playwright matrix with per-commit and full-matrix tiers; deterministic clipboard stubs; a two-part print test because print emulation does not fire `beforeprint`; measurable oracles (§18.8); Linux-container-only pixel baselines with human first approval; `tests/traceability.json` and report-based gate evidence where missing browsers mean not run; a concrete network-denial mechanism; size budgets gate and timing budgets report; a `beforeRename` seam for race tests; axe scope; a path from the spikes into Node 24 Phase 0 tests; fixture conventions; and a human-gate record template.

**Residual:** Playwright was not installed, so the reviewer marked some engine details UNVERIFIED; the stub-based tests avoid depending on them.

## Revision 1.6 — Editorial consolidation

No normative change. Merged layered edits into single statements (§6.3, §6.5, §7.4, §7.5, §8.2, §12.7, §18.5), split §11.9 into replace, refresh, retire, and show subsections, and moved this history out of the specification.

## Revision 1.7 — Phase 0 amendments

Phase 0 implementation on Node 24.21.0 and Markdoc 0.5.10 required these explicit amendments (§17.3):

- A marker must follow a blank line or the frontmatter, because Markdoc lets a marker interrupt the paragraph above it (§6.3).
- Horizontal rules are not addressable (§6.4).
- Dynamic features and raw HTML are `E_UNSAFE_CONTENT`; malformed or unknown syntax is `E_SYNTAX`. An inline HTML comment arrives as an `html_inline` token and is treated as a comment (§6.5).
- A definition's label is its `term` attribute (§7.1).

Implementation choices that are not spec changes: TypeScript 5.9.3 rather than 7.x (the `tsc` behavior of 7.x was not verified); one root `tsconfig.json` with `erasableSyntaxOnly`, because Node 24 type stripping rejects parameter properties and project references cannot use `noEmit`.

## Revision 1.8 — Phase 1 amendments

- §15.6 lists the implementation diagnostic codes that Phase 1 added: `E_USAGE`, `E_BUILD`, `E_PORT_BUSY`, `W_DEV_TOOLKIT`, `W_UNDECLARED_FILE`, `W_QUOTE_NOT_FOUND`, `W_UNSUPPORTED_COMPONENT`, and `W_LAYOUT_FALLBACK`.
- The DOM contract lives in `packages/core/src/compiler/dom-contract.ts`. Phase 1 added instance names that the contract comment does not list yet: `l-FIGURE.ID` list instances for nodes and actors, and `v-FIGURE.ANN.LINE` annotation markers. The runtime treats any `[data-ex-target]` element as an instance.
- `refs resolve` exits 2 for `deleted`, `missing`, and `ambiguous`; §15.6 has no separate code for them.
- The Phase 1 inspection report and open visual defects are in `docs/validation/phase1-review.md`.

## Revision 1.9 — Phase 2 amendments

- §15.6 adds `E_SEMANTIC` for violations of the §9 family rules.
- §18.4: by user decision, v1 browser testing covers Chromium only. Firefox and WebKit are out of scope, not run, and never reported as passed.
- DOM contract additions (`packages/core/src/compiler/dom-contract.ts`): `data-ex-views="map list"` on figures with a map, the `.ex-lists` container, compare instances `v-FIG.ID`, `l-FIG.ID`, and `l-FIG.CRITERION.OPTION`, and the title-first order (h1 block, then a compact snapshot line).
- The §7.1 `dependencies` rule also covers `evidence`, `group`, `parent`, `branch`, and `exclusiveWith`, so broken references in them are reported.
- The contract gate now fails when any test in any report failed (§18.8 "zero failures"), not only when a tag lacks a passing test.
- The Phase 2 inspection report and open visual items are in `docs/validation/phase2-review.md`.

## Revision 1.10 — Mermaid diagrams (user decision)

The user asked for Mermaid diagrams and answered two rounds of questions on 27 September 2026:

- **Purpose:** more diagram types, a familiar look, and easier LLM authoring.
- **Rendering:** `mermaid.js` in the browser, shipped once per toolkit as a separate asset that loads only on pages with a Mermaid figure. This revises ADR-04 and ADR-06 and adds a §2.3 budget exception (about 1.6 MB gzip for 12.0.0).
- **Types:** all Mermaid types. Flowchart, state, and sequence diagrams get build-time identities; other types are one figure-level target.
- **Catalogue:** Mermaid is an addition; the skill prefers a catalogue family when relationships and evidence must be inspectable.
- **CSP:** decided from a spike in Phase 2b step 1; the strict policy stands until then.
- **Order:** Phase 2b runs before Phase 3.

Changes: §1.2, §2.1, §2.3, the new §9.12, §13.1, ADR-04 and ADR-06 notes, the new §17.5a, the skill (Appendix B step 4), and the handoff build sequence.

**Spike results (same revision):** the Mermaid-page CSP adds `'unsafe-inline'` to `style-src` only on pages with a Mermaid figure (the strict policy broke rendering; no narrower variant worked); parsing uses Mermaid's `getDiagramFromText` under jsdom; the rendered element mapping and the `securityLevel: 'strict'` checks are recorded in §9.12.

## Revision 1.11 — Phase 2b review corrections

Two Claude Opus 5.5 reviews read the Phase 2b plan and ran experiments in `spikes/mermaid/`. The author reran the key evidence independently (composite-state parse, sequence control records, label `<a>`/`<img>` survival, and `useMaxWidth` scaling to 2.5 px at 320 px) before accepting findings.

**Consistency and implementability:** Mermaid names map one way to target IDs (lowercase, `.` to `_`) and must be document-unique; subgraphs are `mermaid-group` targets; composite and concurrent states are rejected in v1; sequence messages map by raw `getMessages()` index; in-fence targets take their figure's span and cannot be replaced or retired alone; Mermaid nodes are not entities; R06/R14 scope for figure-level types; jsdom shipping method (shim first, then declared data files, never a `node_modules` subtree) with a release-level test; per-file asset copying and per-page CSP in the implementation; characterization, render-timing, and print tests.

**Security, robustness, and UX:** build-time rejection of `%%{` anywhere, leading `---`, `click`/`href`/`call`/`callback`, label HTML other than `<br>` (not inside `<<…>>`), `img:`/`icon:` shapes, and non-allowlisted style declarations; `useMaxWidth: false`; SRI on the lazy script; eager rendering; accessible names; cleanup of Mermaid's error graphic; parse limits in the bounded worker (64 KiB, §2.3 caps, 30 s, reusing `E_LIMIT`).

**Refinement by the author:** the review proposed rejecting any `<` followed by a letter; that would also reject `<br>` line breaks and `<<choice>>`/`<<interface>>` stereotypes, so the rule allows `<br>` and skips stereotypes.

## Revision 1.12 — Phase 2b implemented

- The parse worker needs no jsdom: a DOMPurify stub is enough; the worker is one bundled file and runs through `spawnSync` with a timeout and a heap limit. `jsdom` remains only as a test dependency.
- The build also rejects `link` and `links` statements, which create links in class and sequence diagrams.
- Accessibility: no `aria-label` on drawn elements (axe `aria-prohibited-attr`); the render viewport is focusable (axe `scrollable-region-focusable` at 320 px); autonumber badges are raised to 14 px.
- Dependency: Mermaid 12.0.0 reaches `lodash-es` 4.17.23 through `chevrotain`; an npm override selects 4.18.1, and `npm audit` reports 0 vulnerabilities.
- Known gaps: state initial/terminal information from `[*]` is not in the figure model (the source shows it); only an ER example exists for figure-level types (no class example); a lifeline can cross a message label in Mermaid's sequence layout.
- The Phase 2b inspection report is `docs/validation/phase2b-review.md`.

## Revision 1.13 — Phase 2b code review

Two Claude Opus 5.5 code reviews tested the implemented Phase 2b. The author reran the evidence before accepting: 11 rule bypasses that produced external links or off-origin requests, and a state-transition misalignment with notes.

Fixes: statement splitting at `;`, a strict stereotype pattern, a keyword lookahead that no longer skips names starting with `o`/`x`/`*`, quote-aware `@{…}` scanning, `url(` rejection, opaque-only colours, rejection of entity codes; transitions from `getData()`; initial and terminal flags; `flowchart-elk` as a flowchart; fail-closed SRI (`E_INTEGRITY`); figure-type notice text; non-interactive derived arrows with a reference-mode note; a lifeline halo; 14 px cardinality labels; five test-weakness fixes; and new tests for two figures on a page, a single-figure failure, and prefix names. A class-diagram example (`examples/mermaid-class/`) closes the last example gap. After the fixes, the bypass scripts give 0 harmful accepted cases out of 31.

## Revision 1.14 — Phase 3 plan review

Two Claude Opus 5.5 reviews read the Phase 3 plan against the implemented code and ran experiments with Git 2.43 and the real parsers. The author reran the key evidence (a `refs/replace` object returning forged bytes through the hardened procedure; a partial clone fetching from its promisor remote; the absence of any retirement validation; `repository` rendered verbatim) before accepting findings.

Accepted (§8.2, §8.4, §8.5, §11.11, §12.8, §17.1, §17.6):

- **Git:** `GIT_NO_REPLACE_OBJECTS=1`, `GIT_GRAFT_FILE=/dev/null`, `-c protocol.allow=never`, `-C <toplevel>`, an object-hash recheck (`E_INTEGRITY`), strict `--file`/`--lines` grammars, size limits, LFS-pointer rejection, and rejection of lone CR, NUL, and control bytes. The excerpt always has one terminal LF.
- **Provenance:** `repository` is a portable identity, never a local path; `--verify-origins` uses a user-local repository map and a defined comparison; pages show only `capture-consistent` or `link-only`; working-tree matches are labelled with their time.
- **Writes:** every source-writing command uses the §11.9 guarded write; capture uses a fence longer than any backtick run (the review showed a plain fence letting captured text inject a paragraph and a second source), JSON attribute encoding, defined placement, and `--recapture`.
- **Retire:** frontmatter insertion only into a two-space block mapping, validation before rename, `check` enforcement of the §11.7 rules, and `refs replace --retire` for nested IDs that cannot be retired alone (a Mermaid node was otherwise undeletable).
- **Scope:** `content import` is deferred to Phase 4 with a v1 narrowing; `fork` copies only declared files and writes through a temporary directory.
- **Plan:** a work order that reuses the Phase 1 lock code and the spike's capture code, and a concrete exit check.

## Revision 1.15 — Phase 3 implemented

- New diagnostics: `E_ORIGIN_MISMATCH` (exit 2) and `W_ORIGIN_UNAVAILABLE` (warning); verification states in `check --verify-origins` output include `origin-mismatch` and `working-tree-matched`.
- `content import` remains `E_UNSUPPORTED` (Phase 4).
- The guarded write is one shared module used by replace, retire, capture, and the fork's docId rewrite.
- Fixed during integration: `fork` claims `DEST` with an exclusive `mkdir` before renaming, because rename(2) silently replaces an empty directory (a test with the seam in the old race window showed the old code overwriting it); `capture` with a missing document now gives `E_SOURCE_UNAVAILABLE` instead of an internal error.
- Known gaps: JSON schemas for `explain-capture/1`, `explain-fork/1`, and the `origins` part of `explain-check/1` are not yet in `schemas/` (§5.4 asks for one per `--json` output); planned for Phase 4 with the other schema work.

## Revision 1.16 — Phase 3 code review

Two Claude Opus 5.5 code reviews tested the implemented Phase 3. The author reran the key attacks before accepting: a hostile repository's `protocol.ext.allow=always` made capture run a command, and `protocol.file.allow=always` let it fetch; a symlinked `objects` directory or a `commondir` file read another repository's private data; a hand-written `commit="HEAD"` passed `check` and verified as `origin-matched`.

Fixes: `GIT_ALLOW_PROTOCOL=none`; object-location containment and `commondir` refusal; a hash recheck of the commit and every tree on the path; full-ID `commit` and `baseCommit`; suppressed Git advice lines; control and line-separator characters refused in titles, symbols, and labels; one repository-identity rule for captured and hand-written sources (no password, query, or fragment); `guardedWrite` runs the caller's check first, so `refs replace` again reports `E_ID_RETENTION` as §15.6 specifies (the Phase 3 refactor had changed it to `E_ID_DUPLICATE`); JSON-quoted `retiredTargets` keys and values; a fork `docId` rewrite that keeps comments and quotes; refusal of a fork inside another bundle; an `afterClaim` seam whose test fails against the old racy code (the earlier race test could not); refusal of repeated flags. After the fixes, the reviewers' attack scripts are all refused.

JSON schemas: every `--json` output and `build.json`/`release.json` now have schemas, every CLI JSON output is validated before printing, and the contract gate fails on unvalidated JSON output.

## Revision 1.17 — Phase 4 plan review

Two Claude Opus 5.5 reviews read the Phase 4 plan against the implemented code and ran experiments (hostile archives with a pinned `node-tar` in a spike, local servers only). The author reran the key evidence before accepting: an unlisted `workers/evil.cjs` and a symlinked `bin/explain.cjs` passed release verification with an unchanged digest; a repository toolchain's worker wrote a sentinel file during `build`; a Mermaid `%%` comment with an internal hostname appeared in `document.md` and `index.html`; `skills/explain/references/` is empty; `toolkit.ts` does not implement the §12.4 order; `unshare -rn` isolates the network on this machine.

Accepted: wrappers call only the user shim, and no repository shim is ever executed (a trust check inside a repository shim runs too late); repository toolchains need user trust; the resolved toolkit's own CLI runs, so all code comes from one trusted release; strict release verification (schema path grammar, regular files, exact file set); a small ustar reader that rejects instead of sanitizing; reproducible `release:pack`; the format guide and license notices in the release; GitHub acquisition rules and a test CA seam; defined `upgrade` with a guarded lock write and downgrade refusal; `doctor` that never executes repository code and checks wrapper text; the development-build mark and `check --release`; the export contract (collection index, report, Mermaid comment removal, public-export refusal of development builds, Node major version only, declared-file `--include-source`); the offline test mechanism; schemas for the new JSON outputs; the corrected bootstrap command.

Scope: `vendor` and `content import` are deferred beyond v1; catalogue guides, templates, and `catalogue list|show` move to Phase 5; Phase 4 splits into 4a (release, installation, trust), 4b (export), and 4c (network and lifecycle).

## Revision 1.18 — Phases 4a and 4b implemented

Phase 4a added the strict archive reader, reproducible packing, `install`, `trust toolkit`, the §12.4 resolution with the trust gate, the user shim, `doctor`, `skill show`, and `check --release`. Phase 4b added `export --format site`, Mermaid comment removal, and the offline test. The spec now records what the implementation decided:

- `install --scope user --default` writes the user default pointer, which the shim reads.
- A refused development build is `E_USAGE`.
- `%%` inside a Mermaid line is `E_UNSAFE_CONTENT`, because diagram types treat it differently.
- Export report warnings and the rule that `file` and `web` sources always need `--allow-private-content` in a public export.
- `--include-source` keeps Mermaid comments in the labelled source bundle.
- The placement of `definition` and `detail`, which the code already enforced.
- The known limit between shim verification and execution.

## Revision 1.19 — Phase 4c implemented

Phase 4c added `install --from-release` and `upgrade`. The spec now records these decisions:

- The default download hosts, the `node:https` client, the test seams, the refusal of a version mismatch, and the error codes for acquisition.
- `E_DOWNGRADE` for a refused downgrade.
- The user shim runs the target toolkit's CLI for `upgrade`, because an older pinned toolkit may have no `upgrade` command.
- `upgrade` writes `origin: local-dir` and keeps the new lock if the rebuild fails.

## Revision 1.20 — Phase 5 implemented

Phase 5 added extensions, catalogue guides with templates and `catalogue list|show`, the core skill, the handoff guide, the canonical wrapper, `check --review` with the R16 editorial fixtures, the prepared (not run) comprehension trial, and the performance budgets. The spec now records:

- Build-only extensions (`browserEntry: null`), the `extension` and `part` tags, the four `extension` commands, the new codes `E_EXTENSION_MISSING`, `E_EXTENSION_FAILED`, and `W_EXTENSION_FALLBACK`.
- The review prompt rules and the rule that they never change the exit code.
- Appendix B now runs only the user shim, as §12.7 has required since revision 1.17.
- `check` now runs the same semantic validation as `build`; before, `check` passed a document that `build` rejected.

## Revision 1.21 — review of Phases 4 and 5

Four Claude Opus 5.5 reviews read the Phase 4 and 5 code and proved each finding with a probe. The author reran every probe before and after the fixes. Fixed: unbounded symlinked lock and config reads (memory exhaustion, content echo); lost trust-store updates that could undo a revocation; an install that failed but still activated and trusted a release; an older install that replaced the user shim; collection export through the shim; `--doc` that selected a different toolkit and wrote to the positional document; `upgrade` crashes and dead ends; `.` and `..` in release names; no total download deadline; ReDoS in an untrusted extension schema before trust; control characters in `extension inspect`; EPIPE on a closed stdout. Documented instead of fixed: the public-export allowlist trusts recorded repository names (`W_PUBLIC_BY_NAME`).

## Revision 1.22 — first real authoring run

An agent wrote "How Explain works" with only the skill and logged 10 problems (`docs/validation/dogfood-1.md`). Fixed: a trace now renders a figure (actor lifelines, order-layer rows, `after` arrows, message arrows, wait and failure boxes), with the lists kept for narrow screens and no-JS reading; the development mark is part of the build ID, so a snapshot folder is never replaced; a new captured source goes after the last source, so citations number in reading order; `check --verify-origins` uses the document's own clone and warns once per repository; clearer messages for a missing lock and a replacement without its marker; `check --review` prints the prompt count; a refused refresh prints the current text on stderr; the skill covers documents in the toolkit's own repository and requires a citation for each claim about code.

## Revision 1.23 — rename to Visser

By user decision, the tool is named Visser, and the agent skill is named `visual-explain`. The rename is complete, because nothing was published yet:

- The command is `visser`, the release entry is `bin/visser.cjs`, and the installed user shim is `${VISSER_HOME:-~/.visser}/bin/visser.cjs`.
- Every `EXPLAIN_*` environment variable is now `VISSER_*`. `GITHUB_TOKEN` stays as a fallback.
- The repository folder is `.visser/`, and the lock file is `visser.lock.json`.
- The frontmatter format is `format: visser/1`, schema names are `visser-*/1`, and the schema `$id` host is `visser.invalid`.
- The URI scheme is `visser://`, and the ID marker is `<!-- vs:id X -->`.
- DOM classes, CSS custom properties, and data attributes use the prefix `vs-`, for example `data-vs-target`.
- The skill folder is `skills/visual-explain/`, and repository wrappers install at `.claude/skills/visual-explain/` and `.agents/skills/visual-explain/`.
- The release archive is `visser-VERSION.tar.gz`.

Error and warning codes, Markdoc tag names, target ID formats, and the default document root `docs/explanations/` do not change. The hash vectors were regenerated with the same pipeline, because the source-manifest and build-input schema names and the URI scheme are hash inputs. Revisions 1.1–1.22 above use the old names.

## Revision 1.24 — second authoring run and install pressure test

A second authoring run ("The life of a target ID") and an install pressure test (108 checks, `docs/validation/install-pressure-1.md`) found 16 install problems and 11 authoring problems. Install fixes: the shim forwards signals; user-level commands work when the default toolkit is missing; `doctor --doc` reports resolution errors instead of stopping; `~/.visser` no longer makes the home folder a repository, and the root search stops at a folder every user can write; `VISSER_HOME` must be absolute, and a missing home is an error; interrupted installs are cleaned up; the trust lock is taken before activation; `--help` and `--version`; an untrusted repository copy is skipped when the user installed the same digest.

## Revision 1.25 — skill text and review prompts

This revision implements IMPROVEMENTS.md §6.2, §7, §11, §12, §13.6, and §13.7. IMPROVEMENTS.md is a proposal, so this entry records what changed in the specification.

- §16.2 now has 13 steps. The agent writes the reader profile with `mustUnderstand`, gives the outline in the reply, selects a component by question, keeps to a budget by `kind`, and tests the main path against `mustUnderstand`.
- `SKILL.md` requires Simplified Technical English (ASD-STE 100). `references/prose.md` gives a valid and an invalid snippet for each rule.
- `references/operations.md` holds the shim, the lock, a missing or untrusted toolkit, and `--dev-toolkit`. Only a document inside the Visser repository uses `--dev-toolkit`. It never gets past `E_TOOLKIT_MISSING` or `E_TOOLKIT_UNTRUSTED`.
- Mermaid is an escape hatch (§6.2). `catalogue list` prints it last. `W_MERMAID` names the native component. An ER or a class diagram has no native component until `domain` exists.
- Each catalogue guide has a "Confused with" line (§7).
- `check --review` adds 15 prompts (§11.3, §12.4, §13.6). Appendix B is now a historical draft; `SKILL.md` wins.
- `skill show` and `catalogue` read `--dev-toolkit`, as `check` and `build` do.
- The review in `docs/reviews/skill-prompts-review-1.md` found false positives in `W_PASSIVE`, `W_VAGUE_QUANTITY`, and `W_DUPLICATE`. This revision fixes them. `W_HEADING` does not apply to `kind: reference`.
- IMPROVEMENTS.md §4.4: `node`, `event`, `state`, `stage`, and `task` take an optional `evidence` array of `source` IDs, as `causal-link` does. A `task` takes an optional `due` date (ISO 8601). A click on a part with `evidence` shows the excerpt first. `W_EVIDENCE_GAP` also covers a `due` with no `evidence`, and counts the parts with no evidence in a `root-cause` document. `W_MERMAID` names `plan`, with the source of each `due` date in `evidence`, for a Gantt chart.

## Revision 1.26 — the `domain` component

This revision implements IMPROVEMENTS.md §5 as §9.13.

- New tags `domain`, `concept`, and `relation`. A concept names its `definition` (one owner per definition); a relation has a `kind` (`is-a`, `has`, `uses`, `produces`, `identifies`) and an optional `cardinality`. A `relation` emits its own `kind` (§9.2).
- The map and a glossary table show together; on a narrow screen the glossary comes first. The text projection gives the glossary, then each relation as a sentence.
- A term whose definition a concept owns opens the concept in the inspector. A concept label is an alias of its definition for the auto-link.
- `W_MERMAID` names `domain` for an ER or a class diagram. `W_JARGON` suggests a `domain` figure at 3 or more undefined terms.

## Revision 1.27 — components for walkthroughs, limits, numbers, and code maps

This revision implements IMPROVEMENTS.md §14.1 to §14.8 as §9.14 to §9.18 and extensions of §9.4 and §9.10.

- New tags `steps` and `step` (§9.14): a walkthrough inside a figure. Its steps name parts of the same figure. Without JavaScript and on a narrow screen it is a numbered list; on a wide screen the runtime adds a step bar that marks the parts of each step. In an architecture map it says "Reading order, not execution order."
- New tags `note` (§9.15, `kind` is `limit`, `assumption`, or `warning`) and `self-check` (§9.16, a question with its answer in a native `details`).
- New tags `measure` and `reading` (§9.17): one ink bar for each cited number, hatched when the value is not measured, with a table as the list view and the text form.
- New tags `tree` and `entry` (§9.18): an indented code map with the architecture role cues.
- `trace`: `event kind="observation"`, and `actor` is optional in a time-scaled trace with no actors. A `causal-link` can name an observation in `evidence`.
- `annotated`: `before` and `annotation side`; the build computes a line diff.
- New review prompts `W_NOTE_DENSITY` and `W_SELF_CHECK`; `W_EVIDENCE_GAP` covers a reading or an observation with no `evidence`; `W_VISUAL_DENSITY` covers more than 8 steps, more than 40 tree entries, and more than 80 diff lines on one side.
- Catalogue guides for `measure`, `tree`, `steps`, `note`, `self-check`, and `decision` (§14.8, the fixed shape of a `kind: decision` document; it has no tag). A catalogue name can hold a hyphen.

## Revision 1.28 — review of the §14 components and the figure interactions

This revision fixes the findings of `docs/reviews/phase6a-components-review-1.md` and `docs/reviews/phase6b-interactions-review-1.md`.

- `annotated` with `before` (§9.10): a side above 2,000 lines is `E_LIMIT`. The diff strips the common prefix and suffix, keeps its table in one `Uint32Array`, and runs once for each build; the page and the text projection share it. Each fence of the projection is longer than any backtick run in its content. The diff sign is `aria-hidden`, with a visually hidden word. Each annotated code line has a fixed marker column.
- The runtime has one owner for `vs-near` and `vs-dim` (`packages/runtime/src/marks.ts`). The hovered and the focused node, the active step, the pressed chips, the folded groups, and the cross-figure highlight are state; one function computes every mark from it. A fold box takes the state of the parts that it hides. A `focus` link to a hidden part unfolds its group first.
- Collapsible groups (§14.9): a folded group keeps its dashed boundary, with no label and the fold box at its centre. This replaces the empty area of revision 1.27 and is the decision that the 6b review asked for (F14); a compact second layout stays later work. Print shows every group unfolded. Each proxy edge has its own point on the fold box. The fold box and the Fold control follow their group in the SVG, under the edges; the control is 44 × 24 px. A collapsed group counts as one node in `W_VISUAL_DENSITY`.
- The hidden `display="none"` fallback of the 6b review (F15) is not taken: the fold markup stays `hidden` with a rule in `reader.css`, because no product path exports the SVG without its stylesheet.
- `tree`: the entry link is outside the `summary`; the children are behind a "N entries" toggle under the entry line.
- `factor` takes `evidence` (a source or an observation), and the observed-factor prompt counts it. An observation in an ordinal trace is `E_SEMANTIC`. On a time scale the events of one slot stack in `time` order. A note needs a body and a self-check an answer (`E_SYNTAX`). A step cannot name a `detail`. `reading` takes `display`, and a number prints with no exponent.
- In a `kind: decision` record, `W_NOTE_DENSITY` counts only the `limit` and `warning` notes. **Expand details** leaves a self-check answer closed; print still opens it. The walkthrough heading prints.
- A walkthrough in a `graph` of any mode or in a `domain` says "Reading order, not execution order."
- The text projection prints relationship evidence as "TITLE (ID)", as for part evidence.
- The capture inputs of the examples moved to `examples/_sources/NAME/`, outside every bundle root. The bundle format reserves no folder name.

## Revision 1.29 — final review and real-document dogfood

- Time-trace prerequisites cannot occur later than their dependent event. Equal
  timestamps remain valid. The note distinguishes event times from vertical order
  layers; duration does not delay an `after` occurrence.
- Folded-edge label placement considers full text bounds and compatible fold
  states, including visible nodes, fold boxes, and other labels. Displaced labels
  have foreground keyed callouts with explicit endpoints; panels and keys retain
  their proxy fold state and use theme and forced-color tokens.
- Narrow-screen citations occupy separate 44 px touch boxes. Invisible expanded
  hit areas no longer intercept adjacent citations or short glossary terms.
- Reference-root errors name the configured roots and give a valid document path.
- Both real explanations use the revised authoring workflow and current source
  captures. The edit instructions use a numbered list, and removed IDs have
  retirement records. Dogfood evidence is in `docs/validation/dogfood-3.md`.
- Test fixtures use zlib-stable compressed input, an actually empty executable
  search path, and server-assigned ports whose ready URL belongs to that child.
