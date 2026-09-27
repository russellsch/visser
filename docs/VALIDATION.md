# Design-bundle validation

**Date:** 26 September 2026.  
**Subject:** `ARCHITECTURE.md` revision 1.0 and its companion files.  
**Status:** an architecture and implementation specification with executable contract-model tests. This bundle is not an implemented Explain toolkit.

> **Repository note (revision 1.1):** this repository contains only `docs/`. The `verification/`, `examples/`, and `skill/` companion files are absent, so the commands and results in "Executed checks" cannot be run again here. They record what the original bundle reported, not evidence for this repository. In revision 1.1, the Appendix A captured-code digest was recomputed from `ARCHITECTURE.md` and matched (26 lines, `46211103…f358`).

## Design review

Five self-review passes are recorded in architecture §20. Each pass states its challenge, findings, applied corrections, and residual uncertainty. They are not independent-agent or independent-human reviews.

| Pass | Main challenge | Corrections incorporated |
|---|---|---|
| 1. Intent and scope | A teaching toolkit becomes a research agent, application builder, or simulation system. | Explanation-only boundary; complete main argument; selective visuals; explicit non-goals. |
| 2. Stable references | Renames, moved blocks, repeated text, stale tabs, and repeated visual instances target the wrong content. | Source-owned IDs; separate source/build/body hashes; exact/stale/ambiguous/deleted outcomes; canonical anchors; guarded editing. |
| 3. Distribution and trust | Shared hosting undermines offline snapshots or leaks private reading activity. | Exact local release packs; explicit acquisition; repo/user scope; one shared runtime per export; extension trust separate from document locks. |
| 4. Comprehension and mobile | Hover-only details, unreadable diagrams, clipboard failure, or invented order/causation mislead readers. | Keyboard/touch alternatives; semantic mobile views; copy fallback; explicit ordering semantics; main-path caveats. |
| 5. Implementation contracts | Parser positions, hash dependencies, static-host headers, extension execution, and file races have overstated guarantees. | Byte-span characterization gate; canonical hashing rules; source/build distinction; CSP header/meta limits; honest extension and edit-lock boundaries. |

## Executed checks

### Reference contract model: 25 tests passed

Command, from this bundle's root:

```sh
cd verification
python3 -m unittest -v test_reference_model.py
```

The Python standard-library model checks identity and revision invariants independently of a future TypeScript implementation. Tests cover moves and renames, repeated text, duplicate identifiers, forks, retirement, evidence changes, toolkit-versus-source changes, malformed references, Unicode and newline normalization, canonical hashing, and rejection of unsuitable paths or hash inputs.

Actual output is in `verification/test-results.txt`. The supplied targets are fixtures, not output from a real Markdoc parser. Passing these tests does not establish that a production parser, resolver, or guarded editor has been implemented correctly.

### Bundle structure: 15 checks passed

Command, from this bundle's root:

```sh
cd verification
python3 validate_bundle.py
```

The structural checker verifies balanced Markdown fences, 25 table-of-contents anchor links, 19 external source-reference definitions, and exact agreement between embedded appendices and their standalone companions. It also checks the illustrative example's tag nesting, 23 unique target IDs, 22 structural references, captured code digest, 26-line capture range, Python syntax, and annotation bounds. It generates an illustrative reference packet and cross-language hash test vectors.

Actual output is in `verification/bundle-checks.json`. The nesting/reference checker is deliberately a small structural check, not a substitute for parsing the complete format or validating every schema rule.

### Reproducible example

`examples/bounded-queue/index.md` is explicitly illustrative, with no invented attribution to a Git repository. Its captured code's normalized SHA-256 is:

```text
46211103f813d56e7736c562cba07868cd8bcd12183327be0da376542fb4f358
```

The example's generated reference is in `examples/bounded-queue/reference-example.json`. `verification/test-vectors.json` contains normalization, canonical JSON, source-revision, body-hash, and build-ID vectors for porting the contracts. The synthetic toolkit digest used in the build-ID vector is test data, not an installed or released toolkit.

The example intentionally has no fabricated dependency lock. The implementation must create a real lock from the toolkit it builds and installs.

### Independent model reviews (revisions 1.1–1.5)

Two Kimi K3 reviews (contract consistency; third-party assumptions, security, and handoff) read revision 1.0. The author checked each finding against the text. `REVISIONS.md`, Round 6, lists the accepted and rejected findings. Three Claude Opus 5.5 reviews (1.1 regressions and identity/hashing; catalogue and reader; plan executability and coverage) then read revision 1.1; `REVISIONS.md`, Round 7, lists the corrections in revision 1.2. Four further Claude Opus 5.5 reviews (1.2 regressions, adversarial security, LLM authorability, Appendix A walkthrough) read revision 1.2; `REVISIONS.md`, Round 8, lists the corrections in revision 1.3. A Claude Opus 5.5 testing-and-validation review then read revision 1.4; `REVISIONS.md`, Round 10, lists its corrections in revision 1.5. All reviews read documentation only. They did not execute Markdoc, ELK, Tailscale, or any test.

### Executed spikes (revision 1.4)

These checks executed code in `spikes/`. The author reran each spike's commands and confirmed the results. Environment: Linux, Node v25.9.0 (ELK also on a local Node v24.21.0), Python 3.14.4, Git 2.43.0.

| Spike | Command | Result |
|---|---|---|
| Markdoc spans | `cd spikes/markdoc-spans && npm ci && npm run spike` | Appendix A: 23/23 targets, identical spans in LF/CRLF/BOM/no-EOL variants, `RESULT: PASS`. Probes: 32 pass, 4 "fail" that record Markdoc behaviors the spec now handles (fence parsing, setext, trailing comment text, multi-line openings). |
| Hash vectors | `cd spikes/hash-vectors && python3 gen_vectors.py && node ts/run.ts > expected.json && python3 py/run.py > actual-py.json && python3 compare.py` | 95 cases: 93 agree, 2 known divergences (integral floats, now specified), 0 failures. Appendix A digest reproduced. |
| Mermaid 12.0.0 (rev 1.10) | `cd spikes/mermaid && npm ci && node csp-run.mjs strict inline && node parse-jsdom.mjs` | Strict CSP: 15 `style-src-elem` and 382 `style-src-attr` violations and broken rendering; `style-src 'self' 'unsafe-inline'`: 0 violations, five types correct. Flowchart, state, and sequence parse in Node through `getDiagramFromText` under jsdom. `mermaid.min.js` is 1,594,645 B gzip. |
| Git hardening (rev 1.5) | `cd spikes/git-hardening && node attack.mjs && node unhardened.mjs` | No hostile-repository code ran through the §8.2 path across 15 vectors; option injection stopped. Confirmed gaps, now specified: gitfile redirect, alternates, inherited `GIT_DIR`, and a clean filter under `git status`. |
| ELK determinism | `cd spikes/elk-determinism && npm ci && node run.mjs once handoff` (see `run.mjs` modes) | One digest per fixture across 20 in-process runs, 10 processes, a worker, and Node 24/25. 200/400 graph: 3–4 s per layout. |

These are spikes, not the toolkit's test suite. They do not cover macOS, a slower machine, the full build pipeline, or the pinned Node 24 for the Markdoc and hash spikes.

## Checks not performed

No production compiler, renderer, installer, server, catalogue extension, source-capture command, or guarded-edit command has been built; the spikes above are throwaway characterizations. No browser screenshots, keyboard or phone interaction tests, accessibility audit, GitHub Pages deployment, Tailscale access, archive-extraction attack tests, filesystem race tests, asset-budget measurement, performance measurement, or human comprehension study were performed.

An attempted Markdoc dependency acquisition timed out in the original bundle environment. Revision 1.4's Markdoc spike has since characterized 0.5.10 on Node 25; full parser integration remains the first implementation gate. The available container's Node version also does not constitute validation of the specified Node 24 implementation target.

The primary-source documentation informs the design, but citation presence does not prove the eventual implementation will meet its requirements. Proposed performance budgets remain targets, not measured results. A coding agent's ability to complete the implementation in a single session is not guaranteed by this specification.

## Implementation follow-through

Port the reference/hash tests first, then complete the bounded-queue vertical slice end to end. Run the acceptance matrix in architecture §18 and report each executed, failed, or unverified gate. Preserve the distinction between these design-bundle checks and tests of the actual toolkit.
