# Integration review — 2026-10-04

Scope: the six canonical Penpot pages after integration and removal of the before/after page. Repository baseline remains `5729a84001f6b2877b93ebc388538cbd0464ee83`; existing uncommitted implementation was used as evidence, not changed. Contracts: `../clearer-figures-implementation.md`, `../../plans/clearer-figures.md`, and runtime selection/local-panel styles in `packages/runtime/src/reader.css`.

A fresh Terra read-only reviewer inspected the six-page text/shape metadata and selected rendered boards. The parent independently inspected the new layout and interaction renders. Penpot state stayed unchanged during the initial review; a six-page shape snapshot was retained in the session as `storage.reviewBaseline`.

| ID | Finding and pressure test | Disposition |
| --- | --- | --- |
| PI-R01 | Desktop selection changed the resize label to bold blue without marking the edge. This contradicted the external-marker contract. | Fixed: neutral label retained; separate 4 px blue marker at 0.8 opacity behind the original route. |
| PI-R02 | Expanded mobile details changed the resize route to amber, while the other states used a neutral route. Collapsed details used an obsolete pale 9 px marker. Comparing the same operation across states confirmed this was selection-induced recoloring, not authored meaning. | Fixed: neutral authored route in both states; consistent 4 px blue selection at 0.8 opacity. |
| PI-R03 | Inferred-edge selection used pale `#d9ebff`, nearly disappearing in the render. The canonical selection style uses the accent color. Some interaction specimen markers also stopped short of their route. | Fixed: blue 4 px markers follow the original dashed segments without filling the gaps or recoloring arrowheads. Solid hover/selection markers now follow the entire authored route. Label weight remains unchanged. |
| PI-R04 | Desktop detail panel had a blue side stripe absent from the implemented local panel. | Fixed: neutral 1 px border and rounded panel, matching the runtime structure. |
| PI-R05 | Independent reviewer found editor-facing layer names describing removed list-first, Map/List, Previous/Next and filled-selection behavior, although visible text was current. These names do not affect runtime readers; they do mislead library maintenance. | Fixed: renamed 46 extant text layers from the integration replacement set. Reviewer independently rechecked all nine cited IDs and confirmed closure. |

The citation-to-excerpt instruction was considered but not filed as a defect: evidence-only parts can still use that behavior, so the current evidence does not establish a contradiction. Wider selection halos were not introduced as a cosmetic preference; corrections retain the implemented marker width.

After edits, rendered and inspected desktop local detail, expanded/collapsed mobile details, semantic dashed edges and terminal states, and authored emphasis/interaction specimens. Confirmed all four corrected boards remained on their canonical pages, no pale `#d9ebff` strokes remained, and the file still had six pages with the before/after page absent. No unresolved material Penpot finding from this pass. Static review does not establish physical-device gesture or assistive-technology acceptance. No application code changes or application test runs in this design review.
