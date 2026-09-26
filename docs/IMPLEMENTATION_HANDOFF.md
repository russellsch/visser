# Implementation handoff: Explain

Implement the system specified in `ARCHITECTURE.md`. Treat that file as the
current authority rather than provisional design discussion. Build a usable
repository, not a visual mockup or a collection of unconnected modules.

Start by reading §§1–7 and §11. Preserve the distinctions between source identity,
source revision, build identity, origin evidence, and browser location. Use the
implementation order in §17; the vertical slice comes before catalogue breadth
and visual polish.

## Nonnegotiable architectural decisions

Use TypeScript/Node 24, restricted Markdoc authoring, a source-owned semantic IR,
build-time diagram layout, static HTML/SVG, and small shared browser assets.
No database, browser authoring API, React/Next application, runtime document
execution, embedded model API, or default remote CDN dependency is required.

Stable IDs live in source. Hashes detect viewed/current differences; neither
content hashes nor heading slugs are stable identity. A copied reference must
resolve locally by document/target ID, survive moves, and fail closed on ambiguity
or stale writes. Do not implement fuzzy automatic retargeting.

All document-specific meaning must be recoverable from the canonical text bundle.
Desktop/mobile/text/no-JavaScript views derive from the same model. Relationships,
not just boxes, must be inspectable. Source captures must distinguish exact Git
content, working-tree material, and illustrative examples.

## Build sequence

1. Implement schemas, hash vectors, restricted parsing, ID assignment, and proven
   byte spans. Characterize the actual pinned Markdoc version; do not assume its
   locations are already byte offsets.
2. Complete the bounded-queue vertical slice in `examples/bounded-queue/index.md`:
   compile, serve, inspect an edge, copy a reference, resolve it, move the target,
   detect staleness, deliberately refresh, and make a guarded edit.
3. Implement every v1 catalogue family with its mobile/text fallback and target
   mapping, reusing kernels and reader primitives.
4. Complete capture/verification, source privacy, lock/conflict handling, and exact
   dependency resolution. Implement all required CLI commands or report a genuine
   incomplete implementation; do not leave successful no-op stubs.
5. Add repo/user installation, shared release packs, static export/subpath support,
   skill dispatchers, extension trust, and security/resource-limit tests.
6. Run the test matrix in §18, inspect desktop/mobile screenshots, and report
   actual results and any unverified gates.

End each step with the runnable exit check you name under the §17 phase exit
rule. Stop at the first step whose exit check fails and report it. If the npm registry is unreachable, report
bootstrap as blocked; do not substitute other packages. Human validation gates
in §21.1 (comprehension trial, real touch device, manual keyboard review) stay
open until a person runs them.

## Companion material

The original design bundle listed `examples/`, `skill/`, and `verification/`
companion files. This repository does not contain them. Materialize them as follows:

- Copy the fenced body of Appendix A to `examples/bounded-queue/index.md`: complete
  illustrative authoring fixture; its source code is explicitly an example, not
  attributed to a real repository. Confirm its captured-code digest matches.
- Copy the fenced body of Appendix B to `skills/explain/SKILL.md` (the §5.3 path):
  canonical initial instruction text; host wrappers should load the version
  selected by the document/workspace lock.
- `verification/` (Python reference model, `test-vectors.json`, and
  `reference-example.json`) is not recoverable. Instead, `spikes/hash-vectors/`
  holds independent TypeScript and Python §7.4 implementations and 95 vectors.
  In step 1, port the TypeScript side, keep the Python side as the independent
  check, and extend the vectors. `spikes/markdoc-spans/` and
  `spikes/elk-determinism/` hold the parser and layout characterizations; rerun
  them on the pinned Node 24 toolchain. Do not cite the earlier "25 tests passed"
  result as evidence for this repository.
- `VALIDATION.md`: checks performed on the design bundle, with limitations.

## Completion report

Generate the report from `reports/` (§18.8), not by hand. State which tests
actually ran, which passed, which failed, and which could not run; missing
browser binaries mean the browser gate did not run, never that it passed. Provide commands to build, test, install, and serve the completed repository.
Include generated example source/output, screenshots where available, measured
asset sizes, and a demonstrated reference-based edit. Do not claim that tests,
visual review, performance targets, or human comprehension trials passed without
executing them. Do not publish, alter application code, trust arbitrary extensions,
or change the user's Tailscale/security configuration without authorization.

Resolve incidental file/module organization yourself. For a genuine specification
conflict, choose the safer/narrower behavior, document the decision, and preserve
as much working functionality as possible. Do not substitute a new architecture
merely because it is faster to scaffold.
