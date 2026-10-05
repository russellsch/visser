# Penpot clearer-figures integration

Completed 2026-10-04. Penpot file: `cbe5d0b0-6d79-8049-8008-b47fede8379c`.

Integrated the accepted clearer-figures designs into the six canonical pages, aligned with `../clearer-figures-implementation.md`:

- Foundations: restrained authored emphasis and separate interaction markers across light, dark and greyscale.
- Reader UI and figure parts: emphasis, useful groups, selection/hover/focus, semantic edge patterns, and a single document Text view.
- Principles: meaningful composition, useful detail, readable mobile labels, and complete main-path explanations.
- Page layouts: restrained figure framing, desktop details in normal flow, mobile full-screen exploration with immediate expanded details, and full labels on narrow screens.
- Both catalogue themes: preserved semantic encodings, removed obsolete per-figure view/step controls, and placed authored steps in normal reading flow.

All integrated boards remain native editable Penpot shapes. Removed obsolete layout variants and duplicated guidance. Recreated 48 existing text shapes because Penpot exports retained stale glyphs after text-property edits. Fixed mobile text overlap and catalogue annotation placement through rendered checks.

Validation: independent read-only review checked the canonical text against the implementation contract; its stale-dimming findings were resolved. A six-page text audit found no remaining targeted obsolete prescriptions. Visually inspected rendered interaction, theme, grouping, desktop, mobile, narrow-label and catalogue examples. Confirmed ten migrated boards existed on their intended pages before deleting the `Clearer figures · Before & after` page (`8c0c298e-6329-8028-8008-bd61433ec72d`). Verified exactly six canonical pages remained afterward.

`integration.json` records final page and board identifiers and the text audit. `design-backup.json` preserves a pre-integration shape-property snapshot of all seven pages; it is not a full `.penpot` export.

This task changed the design library and these records only. Existing application changes were preserved. No application tests were rerun for this design-only integration; static Penpot review does not establish physical mobile gesture behavior.
