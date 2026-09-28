# Final improvements review 2

Reviewer: independent review role. Date: 28 September 2026.

## Scope and snapshot

This was one bounded, read-only pass over commit
`ab5eec8ca86b636e592805230041f00725181c94` plus the uncommitted files recorded
in `/tmp/visser-resume-review/snapshot.json`. I read `docs/IMPROVEMENTS.md`
§§5 and 14, the three earlier reviews, the affected model/compiler/runtime
sources, and the associated unit and browser tests. The reviewed source files
still match their recorded SHA-256 values.

The main path was `model/{diff,validate,project}.ts`,
`compiler/{compile,svg,layout,html}.ts`, and
`runtime/src/{marks,reader,components}.ts` plus `reader.css`. I also checked the
two portable test-only fixes made while this review was open:
`tests/unit/distribution.ustar.test.ts` and
`tests/integration/offline.test.ts`.

## Confirmed defects

| ID | Severity | Location | Trigger and consequence | Evidence | Smallest correction |
|---|---|---|---|---|---|
| R1 | Medium | `packages/core/src/model/validate.ts:517-547`; rendered at `packages/core/src/compiler/compile.ts:1157-1188` | In a `scale="time"` trace, give event B `after=["A"]` but a smaller `time` than A. The document passes validation although `after` means that A happens first. The page then shows a dependent event at 5 ms after a prerequisite at 90 ms, so one accepted model makes contradictory claims. | A source-level `/tmp` probe used A at 90 ms and B at 5 ms. `loadBundle` returned no error, and the compiled page contained the time scale, the `after` relation, and both times. The tests cover sorting two unconstrained observations by time (`tests/unit/components.test.ts:332-339`) but not time against `after`. | In the time-trace validation branch, reject an `after` edge whose dependent time is less than its prerequisite time. If `duration` means an occupied interval, also define and enforce whether the dependent must start after `prerequisite.time + prerequisite.duration`. Add one inverted-time negative fixture and a boundary test for equal times. |
| R2 | Medium (unresolved specification decision) | `docs/IMPROVEMENTS.md:374-377`; implementation at `packages/core/src/compiler/encoding.ts:130-140` and forced-colour CSS at `packages/runtime/src/reader.css:942-946` | A domain `value` concept now has a double outline, but the governing proposal still specifies only “value no fill.” This leaves the original phase-4 D4 decision unresolved in the source requirement, even though the guide, architecture, implementation, and tests chose the double outline. A future implementation following the proposal can remove the only non-colour cue that survives forced colours. | `skills/visser-visual-explain/references/catalogue/domain.md:40`, `docs/ARCHITECTURE.md:995`, and `tests/unit/domain.test.ts:157-162` all say or assert “double outline”; §5.3 does not. | Amend `docs/IMPROVEMENTS.md` §5.3 to say “value double outline with no fill,” and keep the forced-colour obligation. No runtime change is needed. |
| R3 | Medium | `packages/core/src/compiler/svg.ts:361,418-429` | Fold a group when an edge's original label lies inside that group and the longest external proxy segment passes close to another visible node. `labelAt` checks only the segment midpoint against folded rectangles; it does not check the full relocated label rectangle against visible nodes, other labels, or fold boxes. Nodes paint after proxies, so they can obscure the relationship label. | A direct renderer probe used an external horizontal segment that stayed 10 px above a visible node. The relocated label was `(x=300.5,y=41,w=90,h=24)` and the node was `(x=278,y=63,w=110,h=50)`, a 2 px overlap, while the route itself did not cross the node. This confirms the renderer-level defect. I did not reproduce the same geometry from the default ELK layout. | When choosing a proxy-label position, test the full label rectangle against visible node rectangles, fold boxes, and already placed labels. Try the remaining external segments in deterministic length/order, then keep the original position or a documented fallback. Add a unit fixture whose route clears a node but whose first candidate label does not. |
| R4 | Low (contract conflict) | `docs/IMPROVEMENTS.md:1024-1028`; `packages/core/src/compiler/compile.ts:1145-1149`; `packages/core/src/compiler/svg.ts:480-495,726-730`; later wording at `docs/ARCHITECTURE.md:835-839` and `skills/visser-visual-explain/references/catalogue/trace.md:55-68` | Every time-scaled trace says “Time scale in UNIT,” but `traceSvg` receives neither the scale nor the unit and always labels the vertical axis “Order layer” with 1-based layer numbers. §14.6 calls this a time axis; the later architecture instead describes order-layer rows with time text in each event. The reader cannot tell which contract is authoritative. | The `/tmp` compile probe contained both `Time scale in ms.` and `>Order layer</text>`. `TraceSvgInput` has no scale field, so this is invariant for time traces. Under the implemented geometry, “Order layer” is the accurate axis label: the row position encodes the longest `after` chain, while `time` only sorts events within one actor/layer/branch slot and prints in each box. | Keep the axis label “Order layer.” Change the surrounding note to an accurate statement such as “Event times in ms; vertical position shows order layer,” and change §14.6 “on the time axis” to “on the order-layer axis, with time in each event label.” A real time axis would instead require new proportional geometry and is a separate design. |

## Earlier material findings

The current source resolves phase-4 D1, D2, D3, D5, and D6. D4 remains R2.
The phase-6a C1-C5 fixes are present: a 2,000-line hard bound and flat typed
diff table, one mark-state owner, non-nested tree controls, and safe Markdown
fences. The phase-6b material fixes F1, F2, F4, F6, F7, F11, and the F14
recorded layout decision are present. The shared mark state recomputes filter,
walkthrough, neighbourhood, entity, and fold-box marks, so the earlier ordinary
interaction sequences no longer have separate class owners.

## Checks executed and inspected

- Verified SHA-256 values from the assigned snapshot for all eleven reviewed
  core/runtime source files.
- Ran a source-level `/tmp` `graphSvg` probe for proxy-label placement. It did
  not build `dist` or write to the repository.
- Ran a source-level `/tmp` bundle/compile probe for the inverted time trace and
  the time-trace axis label. It did not build `dist` or write to the repository.
- Inspected expected values in `components.test.ts`, `domain.test.ts`,
  `figure-interactions.test.ts`, and `interactions.spec.ts`, including the
  bounds/sharing, mark precedence, fold-box, focus-link, print, domain cue, and
  tree-control cases.
- Checked the archive test-only change independently. The exact Huffman-only
  fixture compressed to 33,874,733 bytes with a ratio of 7.9553:1 on Node
  25.9.0; zero-padding alone produced the same 7.9553:1 ratio on declared Node
  24.21.0. The Node 25 source-level extraction probe rejected it with
  “decompresses to more than 268435456 bytes.” The compressed input remains
  below the 64 MiB archive cap.
- Inspected the offline test-only change. An absolute `process.execPath` starts
  Node while an empty temporary `PATH` makes the script's first `unshare` probe
  fail; `finally` removes that directory. I did not execute this test because
  the script writes `reports/offline.json`.

## Limitations

I did not run Vitest, Playwright, the full suite, a browser, a screen reader, or
a `dist` rebuild; the parent task coordinates those write-producing checks.
The proxy-label collision is confirmed for the renderer's `GraphLayout`
contract, but I did not find a default-ELK document that produces the same
coordinates. Browser-specific focus and print behaviour were inspected through
source and test expectations only. Documentation authors were still editing
other files, so conclusions above are tied to the recorded core/runtime hashes
and the cited lines, not to later prose changes.

## Correction recheck addendum

This bounded recheck inspected the current corrections to R1-R4 and the listed
dogfood, reference-error, and test-harness changes. It did not repeat the full
review. The relevant source hashes at inspection time were:
`validate.ts` `d99d5c39...`, `compile.ts` `b468d991...`, `svg.ts`
`57fcc813...`, `registry.ts` `dea27e76...`, and `reader.css` `a0cfa3b5...`.

### Remaining confirmed defect

| ID | Severity | Location | Trigger and consequence | Evidence | Smallest correction |
|---|---|---|---|---|---|
| R5 | Medium | `packages/core/src/compiler/svg.ts:441-464`; fallback expectation at `tests/unit/figure-interactions.test.ts:353-365` | Fold an edge in a layout where every route-centred, original, and obstacle-adjacent label candidate is occupied. The final fallback puts the label in a new right gutter, but the proxy route does not enter that gutter and no leader or keyed callout connects the two. The label can therefore look like a free-standing annotation rather than the label of its relationship. | A current-source `/tmp` renderer probe forced the documented fallback. The visible label rectangle began at SVG `(612, 8)` while the proxy path's rightmost coordinate was `498`, leaving 114 px between the route extent and the label. The viewBox correctly expanded to `710 × 316`, and the label cleared every obstacle; the problem is visual association, not clipping or collision. The authored regression asserts the gutter position and expanded viewBox but does not assert an association cue. | Keep the finite collision search, but make the terminal gutter an explicit callout: connect the label to a deterministic point on its proxy route with a visible leader, or use matching on-route and gutter keys. Add an assertion that a fallback label has that cue. |

### Disposition of the requested corrections

- **R1 resolved.** `validate.ts` rejects a dependent event whose numeric time
  is less than the numeric time of a direct `after` prerequisite. A current
  source probe rejected 5 ms after 90 ms with `E_SEMANTIC`; the equal-time
  variant compiled. The proposal, architecture, trace guide, fixture, and
  test agree that equality is valid and that `duration` does not order event
  ends.
- **R2 resolved.** `docs/IMPROVEMENTS.md` §5.3 now specifies “double outline
  with no fill,” including the forced-colour obligation, matching the
  implementation and other governing text.
- **R3 resolved for its original trigger.** The proxy planner now tests the
  full label rectangle against state-compatible visible nodes, fold boxes,
  ordinary labels, and already placed proxy labels. It tries route segments
  in deterministic length order, then a finite set of candidates per
  obstacle. The graph width includes a label placed to the right. The original
  probe now moves the label clear of the nearby node. The loops are bounded by
  the finite route and obstacle lists; R5 is the remaining fallback issue.
- **R4 resolved.** A time trace now says “Event times in UNIT; vertical
  position shows order layer,” while the SVG axis remains “Order layer.” A
  current equal-time source probe found both exact statements. §14.6 and the
  later architecture and guide use the same semantics.
- **Narrow citation hit boxes resolved for the reported tap failure.** On
  narrow screens citations are in-flow `inline-flex` boxes with 44 px minimum
  dimensions, so adjacent citations do not place an invisible pseudo-element
  over each other. Term links use their native inline text boxes. The browser
  regression clicks both adjacent citations and both short terms and checks
  that the citation rectangles do not intersect.
- **Reference error resolved.** `assertInsideRoots` now reports the configured
  root list and gives a valid `<root>/<document>/index.md` action. The tests
  cover both the default root and a custom root.
- **Browser fixture harness resolved for the observed occupied-port failure.**
  `serveFixture` passes port `0`, which the CLI explicitly accepts, and derives
  the URL only from that child process's ready line after its listener is
  active. `interactions.spec.ts` and the tree block in `components.spec.ts`
  use this helper and close the child in `afterAll`; `startOnce` also rejects a
  spawn error. No readiness decision depends on an arbitrary HTTP 200 from a
  pre-existing process.
- The empty-`PATH` offline fixture and Huffman-only archive fixture remain
  sound under the earlier independent checks.

### Addendum checks and limits

- Ran current-source Node 24 probes for inverted and equal trace times, the
  corrected ordinary proxy-label collision, and the terminal gutter fallback.
- Inspected the expected values in the new trace, proxy, narrow-depth,
  reference-resolution, and browser-harness tests, and inspected the CLI's
  port-0 contract and ready output.
- Ran `git diff --check` over the rechecked source, tests, proposal, and this
  report; it reported no whitespace errors.
- Did not run Vitest, Playwright, a full suite, or a distribution rebuild. The
  parent task coordinates those integrated, write-producing checks. The R5
  probe uses the renderer's accepted `GraphLayout` contract; a default-ELK
  document reaching the terminal fallback was not established.

### Final R5 disposition

R5 is resolved in the final frozen snapshot (`svg.ts` `60b2387a...`,
`reader.css` `d88e9546...`, and `figure-interactions.test.ts` `d3445f81...`).
The terminal fallback now uses a foreground callout with matching keys on the
proxy route and beside the label. The panel names source, relationship, and
destination, so a covered route does not leave a detached, anonymous label.
The callout shares the proxy's fold metadata and filter target; the runtime
therefore shows, hides, and marks the route and callout in the same fold
state. Print hides both through the existing proxy rule.

The final geometry reserves the complete callout rectangle when placing later
co-visible labels. It separates nearby route keys with deterministic stems,
and expands both viewBox dimensions for panels and displaced keys. The
context baseline is inside its panel. Theme rules use `--vs-bg`, `--vs-line`,
and `--vs-fg`; forced colours explicitly use `Canvas` and `CanvasText`.
The earlier R3 full-rectangle avoidance remains intact.

For this final recheck I reran the original R3 source probe and a 20-callout
stress probe on Node 24. The original label cleared its nearby node. The
stress probe produced no intersecting callout panels, kept every parsed key
inside the expanded `4244 × 380` viewBox, and remained deterministic by source
inspection. I inspected the fold application and shared mark-state code, the
new complete-panel and nearby-key regression, and the light/dark/forced-colour
CSS. I ran `git diff --check`; it reported no whitespace errors. I did not run
Vitest, Playwright, a build, or the full suites during this final bounded
recheck. No material finding remains in the requested R3/R5 scope.
