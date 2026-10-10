# Native flowchart W0 feasibility record

Baseline `0db1968`; Node v25.9.0; 2026-10-10. This is one bounded probe pass, not an implementation or visual acceptance. The reproducible source is [`spikes/native-flowchart/probe.mjs`](../../../spikes/native-flowchart/probe.mjs); captured measurements are in [`results.json`](../../../spikes/native-flowchart/results.json). Run `node --experimental-strip-types spikes/native-flowchart/probe.mjs` from the repository root. The probe imports baseline `toElkGraph`, `fromElk`, `layoutGraph`, `graphSvg`, and `render`; production files were not edited. Times are single process wall times with JIT/GC noise, not guaranteed limits. Heap is a snapshot after each case, not peak heap.

## Result and remaining geometry work

The existing ELK adapter laid out a DOWN retry/branch graph and nested group graphs with no missing route point arrays. The retry graph includes distinct decision outcomes with the **same destination** and cross-group return links. Existing fold generation retained each authored edge ID: the prospective combination count matched the number of distinct proxy IDs in all cases. These observations establish a viable adapter path, not correctness of the final visual routing.

The present `layoutGraph` chose RIGHT for the ungrouped retry case (804 × 153), while an explicit DOWN call produced 222.5 × 522. The fixed direction must bypass the width-dependent second-layout choice for flowcharts. It must be carried through worker serialization; the viewport must never choose another axis. A simple chain can be checked for center order, but retries must permit reverse-axis segments.

The present decision label `Accepted?` gets a 93 × 34 rectangular box. With 12 px horizontal and 8 px vertical inner padding, a centered diamond needs at least 185.2 × 68 for this measured text. For a diamond of width W and height H, a padded label rectangle fits only if `paddedWidth/W + paddedHeight/H <= 1`. Existing decision exit ports in the retry case lie on the rectangular box but have diamond norms 1.333; they would float outside a diamond outline. The start port norm is 1 only by coincidence. Size the diamond from measured text and math, then project each route endpoint along the center-to-port ray to the actual outline. Use the analogous rounded-rectangle/pill outline intersection for start/end. Check the final tangent and arrowhead at the actual destination. Keep the action rectangle sizing path and legacy families unchanged. Recompute and verify self-loop ports after shape docking.

The baseline proxy route logic preserves original edge IDs and distinct outcome labels in emitted elements, including same-destination parallel outcomes. It is **not** proof that every folded route avoids unrelated visible shapes or that a proxy remains unambiguous under all fold combinations. `foldPlan` currently moves labels against visible-state obstacles and can place keyed callouts in a right gutter. W3 needs geometry validation for every generated route/state, original-endpoint identity checks, internal-flow hiding, and exit/re-entry loops. A failed geometry case must take the declared strict/fallback path; do not silently drop or merge a flow. Rendering all groups as foldable requires passing the complete group ID set separately from initially collapsed IDs.

## Measured resource cases

All groups in these cases were passed as foldable to `graphSvg`, including initially expanded groups. Depth is the longest parent chain. “Proxies” counts distinct proxy edge elements. SVG bytes are UTF-8 serialized bytes of the generated figure. The synthetic crossing cases stress layout and folding; they are not themselves procedurally valid authored charts because some action nodes have several outgoing edges.

| Case | Groups / depth | Nodes / flows | Proxies | Layout ms | `graphSvg` ms | SVG bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| retry, parallel outcome | 0 / 0 | 5 / 8 | 0 | 69.0 | 1.7 | 17,163 |
| nested, cross-group retry | 4 / 2 | 5 / 8 | 26 | 26.7 | 3.4 | 72,133 |
| nested, cross-group retry | 6 / 3 | 5 / 8 | 45 | 20.4 | 2.0 | 111,837 |
| four phase arms | 12 / 3 | 7 / 14 | 87 | 28.7 | 4.3 | 212,506 |
| deep chains | 16 / 8 | 5 / 8 | 200 | 28.0 | 14.5 | 439,555 |
| at proposed proxy cap | 16 / 4 | 7 / 20 | **256** | 34.4 | 11.7 | 539,245 |
| one over proxy cap | 16 / 4 | 8 / 21 | **257** | 36.0 | 13.1 | 545,240 |
| denser crossings | 16 / 4 | 7 / 22 | 324 | 62.8 | 20.9 | 677,613 |

The source JSON contains exact timings from the last run; the table times are rounded and may vary slightly when rerun. Group nesting independently enlarges layout dimensions: 16 groups at depth 8 produced 1,568.2 × 1,746 before SVG margin. More labels, math, long routes, and dense 200-node/400-flow inputs were not measured. The 2 MiB output choice below is a defensive admission bound, not a maximum observed at the inherited node/flow limits.

## Proposed flowchart-only resource contract for maintainer approval

| Quantity | Admit | Reject | Enforcement and boundary fixture |
| --- | ---: | ---: | --- |
| Groups | `<= 16` | `17` | Count authored flowchart groups before recursive layout. The probe has 16; create a nonempty 17th group for the one-over test. |
| Parent depth | `<= 4` | `5` | Compute longest parent chain iteratively after parent validity/cycle checks; the depth-8 probe shows why this is independent of group count. |
| Prospective proxy combinations | `<= 256` | `257` | Count compatible `(from stand-in, to stand-in)` combinations across every flow before allocating proxies. The probe contains exact 256 and 257 cases; matching emitted IDs verify the count. |
| Post-layout geometry work | `<= 200,000` primitive checks | `200,001` | Instrument deterministic checks in fold/label/shape routing, including obstacle compatibility/overlap and segment-outline/intersection tests; abort before the next check. Count independently of worker time. Build exact and one-over fixtures with a test counter/injected budget if natural inputs cannot land on both values. |
| Serialized flowchart SVG | `<= 2,097,152` UTF-8 bytes | `2,097,153` | Bound emitted bytes while serializing, before publication; test exact and one-over with controlled safe label lengths. Retain the complete text alternative on fallback. |

The group/depth caps contain recursive hierarchy and the proxy cap bounds output multiplicity. They do not replace the existing 200-node/400-flow caps or document target cap. The work counter catches post-layout quadratic placement even below 256 proxies; the output counter catches verbose labels/math and repeated proxy markup. The work and output numbers are conservative starting limits chosen above this probe's observed sizes, with independent admission tests required before W1/W3. They are not empirically proven safe for every admitted 200-node/400-flow graph. If integration shows a legitimate small chart exceeding either, measure that chart and revise the contract with the maintainer before loosening it.

For proxy preflight, obtain each endpoint's foldable ancestor chain (innermost first). Visit the empty stand-in plus each ancestor on both sides and count combinations except both empty, the same fold on both ends, or a fold containing the other endpoint. This matches baseline `foldPlan` filtering. Use saturating addition at 257 so untrusted depth/flow counts cannot overflow, and reject with `E_LAYOUT_LIMIT` before recursive `toElkGraph` or proxy allocation. The exact-boundary cases have 256 and 257 prospective combinations respectively. Cyclic or broken group parents must be rejected in validation before this traversal. All geometry counters should be local to one figure and deterministic across runs.

No production cap, shape, worker, or fold behavior was changed in W0. The separate implementation still needs exact/one-over automated boundary tests, visual retry/diamond/parallel/fold fixtures in both directions, and a check that strict failure publishes no partial output.
