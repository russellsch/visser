# Visual language for explanatory figures

Choose the representation from the reader's question before styling the figure.
The main path must state the answer and every qualification that changes it.
Part bodies and details add reasons, evidence, and context. A neutral figure is
a complete solution when no part needs extra attention.

## Authored emphasis

Native `node` and `edge`, `state` and `transition`, `factor` and `causal-link`,
`task` and `dependency`, `stage` and `conversion`, and `concept` and `relation`
accept `emphasis="teal|violet|amber"`. Omit it on all other tags, including
`group`, `event`, and trace-derived edges. The three values have one meaning:
"attend to this part." They request palettes, not status, confidence,
ownership, or three levels of importance. Use one value consistently in a
figure. Omission is preferable when labels and structure already guide the
reader.

If role, status, basis, or another semantic category already uses hue, the
reader preserves that hue. Emphasis then uses weight. Do not assign emphasis
to every item or use palette changes to imply a new category. The Markdown
and Text views name emphasized parts, so the cue is more than colour.

**Useful:** emphasize the one transfer whose failure explains an architecture
boundary. Name the transfer in its edge label and explain the failure in the
main path. The cue directs attention to an existing claim.

**Reject:** mark an observed causal link teal, an inferred link violet, and a
hypothesis amber. `basis` carries those meanings. Palettes would compete with
the evidence distinction.

## Boundaries and local explanation

Architecture groups use `group`, `node group`, and `group parent`. Use a group
only when its boundary has a source-supported function, such as shared
deployment, ownership, or trust. The label names that function. An optional
group body explains why the boundary matters when that adds information.
Keep external edges attached to their actual nodes. A group does not turn
every child into one component. Architecture groups have no `color` attribute.

Flowchart groups identify a process phase or responsibility. Their optional
`color` uses the discrete `neutral`, `teal`, `violet`, or `amber` palette. It
does not carry emphasis, status, confidence, ownership, or control-flow
meaning. The same color may occur in distinct groups. Do not color a group
only to make a neutral process look more important.

**Useful:** an "Order service" group contains an API and worker that deploy
together. An external provider stays outside. The API-to-provider path still
names the actual caller.

**Reject:** a "Misc" group wraps unrelated nodes to make a map appear tidy.
Its boundary implies a relationship that the evidence does not support.

Select a part only when it offers a mechanism, constraint, consequence, or
source that the main path does not already give. The part body is optional.
Colour and group membership alone do not create useful detail.

## Labels and qualifications

Keep entity identity and relationship meaning when shortening labels. If two
workers have different roles, "worker" is insufficient. A relationship label
such as "sends data" is insufficient when the reader must distinguish a
charge request from an acknowledgement. Split a dense figure by question
before shortening away disambiguating words. Keep full names in the text
description when a short visible label cannot distinguish them.

For a lossy transform, show `loss` on the conversion. `condition` alone does
not make the condition visible on the map. State a decision-changing
condition in the figure's main-path prose. A detail may explain *why* it
applies. The same rule applies to a transition guard and a caveat on any
figure. A reader who does not open details must still get the right answer.

**Useful:** "Resize loses fine detail if the image exceeds 224 pixels" appears
beside the figure; the conversion states `loss="fine detail"` and its body
explains the resampling method.

**Reject:** the diagram claims that resizing preserves detail, while the only
exception sits in `condition` or a collapsed body.

## Reading and checking

Keep overview and focused figures in article order. Use a focused figure when
one branch needs explanation; keep the overview's boundary and main answer
intact. Authored `steps` may group observations, but they must add a rule or
consequence rather than repeat part labels. The list remains in document
flow. A document-level Text view exposes relationships when drawings are hard
to read. On narrow screens, the diagram opens in a viewer for exploration;
its detail sheet holds more depth. Do not rely on that viewer for the main
answer. Check the image and Markdown separately: text can preserve facts while
the geometry suggests the wrong order, boundary, or causal direction.
