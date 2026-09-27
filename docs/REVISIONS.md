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
