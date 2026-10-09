# Swimlane math integration

Swimlane (`swimlane-beta`) reuses the pinned Flowchart grammar and FlowDB.
The source header remains unchanged through collection and reconciliation.
Its native scoped configuration selects swimlane layout; the adapter does not
force a global layout that could leak into following figures. Agentflow remains
a separate, unfinished family.

Public classification and the worker math gate now route swimlane through the
existing authenticated Flowchart transport, source map and document budget path.
The renderer uses the shared math measurement hook before native layout.

Native swimlane lanes use unprefixed group IDs, and edge labels occupy synthetic
nodes. Source binding resolves exact native owners before writing any attributes.
A hash-pinned build patch carries the complete native edge ID into the synthetic
label's `data-vs-native-edge-id`; it never infers identity from label text or an
ID suffix. Exact native lane and edge mapping also feeds interactive targets and
viewer readiness. Ordinary flowchart group mapping remains render-prefixed.

## Review findings and disposition

Independent Sol review confirmed two material issues:

- Missing lane-to-list target mapping made narrow screens choose list view even
  though the native drawing and source binding succeeded. Exact unique lane
  matching, scoped to native swimlane SVGs, fixes viewer readiness.
- Suffix matching confused valid edge IDs `foo` and `bar-foo`. Carrying the full
  native ID fixes this without widening the source transport or guessing an owner.

Both fixes were independently rechecked with no remaining actionable finding in
this scope. An initial concern about layout activation was withdrawn after the
reviewer traced native scoped-config promotion; it caused no code change.

## Verification

The native browser fixture uses actual math and the production build plugin.
It covers TB/LR at 320/1440 pixels, tall/wide lane/node/edge equations, formula and
mixed-label reservations, native owner boundaries, atomic ambiguity rejection,
explicit suffix-colliding IDs, blocked network, and an ordinary flowchart after
each swimlane. Source collection checks unchanged headers and native FlowDB slots.
Unit regressions cover exact native IDs, missing/duplicate owners, ordinary group
isolation, and interactive target mapping.

The installed single-file verifier includes swimlane fractions, lane/node/edge
source-copy and CLI reference resolution, viewer readiness, no-JavaScript source
and forced-renderer failure. Final combined run status and candidate identity are
recorded in progress.md; fixture presence alone is not a passing result. Human
visual/accessibility acceptance and wider Flowchart shape coverage remain open.
