# Independent implementation review

Reviewer: separate Sol agent `flowchart_implementation_review`, read-only. Base `0db1968`.
Initial tracked patch SHA-256: `94062afa60011b4eac185b1345ddfd8dab0fde2b67b09d7d164e9d3fe2679c6a`.
The 48-file manifest includes new sources and tests; see `reports/flowchart/review-manifest.json`.
The shared detail-link selector correction was explicitly included as a subsequent delta.

| Finding | Correction and retained regression |
| --- | --- |
| IR01 grouped start rejected | `start.group` contextual schema; accepted grouped-start model fixture. |
| IR02 empty nested child accepted | Descendant-only member search; populated parent/empty child rejection fixture. |
| IR03 direct equation becomes process node | Compiler consumes semantic process node IDs; equation remains prose and never creates SVG/list part. |
| IR04 summary → Expand → Close loses focus | Recover visible own Fold control; browser checks exact focus target. |
| IR05 text projection omits direction | Explicit default down/right direction in canonical text; identity integration covers edits. |
| IR06 primitive work undercount | Charge docking containment, ancestor/compatibility comparisons, overlap, clipping/join and label-placement work before execution; independent 73-operation exact/one-over fixture. |
| IR07 cycle causes false depth diagnostics | Stop cyclic hierarchy before depth/proxy traversal; exact E_SEMANTIC-only fixture. |

The author pressure-tested each finding against the contract and reproducer. All seven were accepted and corrected; none was dismissed on the basis of earlier passing tests.
The geometry boundary test now has a hand-counted oracle in addition to the general threshold test.
A separate topology oracle proves it rejects swapped outcome labels, a reversed route, and removal of a folded flow.

Targeted recheck requested on tracked patch SHA-256 `0ca2e692185b53d6730760e919392688ae3388b33e554fbd601d64966cff353d`.
The reviewer rechecked all seven fixes and found no unresolved material production defect. A final independent evidence gap was closed with the 99-unit one-proxy exact/one-over fixture; the reviewer separately confirmed every term of its hand-counted ledger. Tests executed by the primary agent are recorded separately; this review did not execute browsers or full suites.
