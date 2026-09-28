# Walkthrough — `steps`

**Question:** Which sequence of observations helps the reader understand this figure?

**Confused with:** `trace` (execution order) and a numbered list (no links to parts).

## Use it when

- A figure has more parts than the reader can take in at once.
- Each step groups related parts and adds an invariant, boundary, contrast, or
  consequence that the labels do not already say.

## Do not use it when

- The order is events at run time. Use a `trace`.
- The walkthrough spans two figures. Use one per figure.
- The figure has four parts or fewer. The prose after it is enough.
- Replacing every step with its target labels loses no meaning. Remove the
  walkthrough; the figure already says it.

## Misleading example

**Reject:** architecture steps that replay "then the worker charges."

**Prefer:** conceptual observations; use a `trace` for time order. Graph and
domain walkthroughs print "Reading order, not execution order."

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `steps` | `id` | — |
| `step` | `id`, `label`, `targets` | — |

- `targets`: a list of part IDs in the same figure, such as `["n_api", "e_insert"]`.

## Rules

- `steps` goes inside `graph`, `trace`, `transform`, `compare`, `annotated`, or
  `domain`. One figure has one `steps`.
- `steps` has at least two `step` children. `step` goes directly inside the
  `steps`, names at least one target without duplicates, and has a body. The
  body is one or two sentences of explanation; a citation alone is not a body.
- `targets` names drawn parts of the same figure, never a `detail`.
- Above 8 steps you get `W_VISUAL_DENSITY`. Split the figure by question.
- `check --review` gives `W_WALKTHROUGH_VALUE` when the figure has four or
  fewer drawn parts, or when every step visits exactly one different part.

## Shape the explanation for the figure

- **Architecture/domain:** group a boundary or relationship; explain its rule.
- **Transform:** combine input, conversion, and output into a change of shape,
  encoding, location, or owner.
- **Compare:** group cells or options into a contrast.
- **Trace:** group events into explanatory phases; do not replay the trace.
- **Annotated:** connect annotations into one claim about the source.

## Narrow screens and text

Without JavaScript, in print, and on narrow screens, a numbered list shows each
label, explanation, and part link. Wide screens add a keyboard-operable step
bar; active parts stay bright and the rest fade. Text uses the numbered list.

## Template

The source block below is what `visser capture file --kind example` writes.
Capture your own sources; do not copy this hash.

````markdown visser-template
{% graph id="components" mode="architecture" title="The API stores, the worker charges" question="Which component charges the card?" %}
The arrows are calls and data flows, not an order of events.

{% node id="n_api" label="Order API" role="interface" /%}
{% node id="n_db" label="Order store" role="storage" /%}
{% node id="n_worker" label="Charge worker" role="process" /%}
{% edge id="e_insert" from="n_api" to="n_db" kind="data" label="inserts order and charge request" /%}
{% edge id="e_charge" from="n_worker" to="n_db" kind="call" label="reads open charge requests" /%}

{% steps id="walk_order" %}
{% step id="wk_1" targets=["n_api", "e_insert"] label="Acceptance is atomic" %}
One transaction writes the order and its charge request. {% cite ref="src_insert" /%}
{% /step %}
{% step id="wk_2" targets=["n_worker", "e_charge"] label="Charging is retry-safe" %}
The worker reads durable requests, so retrying the work does not repeat acceptance.
{% /step %}
{% /steps %}
{% /graph %}

{% source id="src_insert" kind="example" title="Order insert in one transaction" language="typescript" excerptSha256="3aab864ac9549256620acc9c6956e032fddc56949f5697a6c932921e0c4d13b9" %}
```typescript
await db.transaction(async (tx) => {
  await tx.insert('orders', order);
  await tx.insert('charge_queue', { orderId: order.id });
});
```
{% /source %}
````

## Diagnostics

- `E_REF_BROKEN`: a `targets` ID is not a drawn part of this figure. Name a
  part of the figure that holds the `steps`.
- `E_SYNTAX`: `steps` is outside a figure, has fewer than two steps, or a step
  has no target or explanatory body.
- `E_SEMANTIC`: the figure has a second `steps`, or a step repeats a target.
  Merge the walkthroughs or remove the duplicate.
- `W_VISUAL_DENSITY`: more than 8 steps.
- `W_WALKTHROUGH_VALUE`: the walkthrough is on a figure with four or fewer
  drawn parts, or every step merely visits one different part. Add conceptual
  grouping and explanation, or remove the walkthrough.
- `W_DETAIL_VALUE`: sources-only drill-downs dominate the figure. Add useful
  explanation or context to the parts that need it; do not add prose merely
  to silence the prompt.
