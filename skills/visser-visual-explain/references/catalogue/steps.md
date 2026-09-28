# Walkthrough — `steps`

**Question:** In what order does the reader look at the parts of this figure, and what happens at each one?

**Confused with:** `trace` (an execution order, with `after`) and a numbered list in prose (no link to the parts).

## Use it when

- A figure has more parts than the reader can take in at once, and one path
  through it explains it.
- Each step names two or three parts and says one thing about them.
- The prose after the figure would say "first look at A, then at B".

## Do not use it when

- The order is an order of events at run time. Use a `trace`; only a trace
  claims an execution order.
- The walkthrough spans two figures. Use two `steps`, one in each, and a sentence
  between them.
- The figure has four parts or fewer. The prose after it is enough.

## Misleading example

**Reject:** a walkthrough of an architecture map whose steps say "then the
worker charges", read as the order of events in one run.

**Prefer:** steps that say what each part does, and a `trace` when the order
in time matters. In a `graph` of any mode and in a `domain`, the page prints
"Reading order, not execution order."

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `steps` | `id` | — |
| `step` | `id`, `label`, `targets` | — |

- `targets`: a list of part IDs in the same figure, such as `["n_api", "e_insert"]`.

## Rules

- `steps` goes directly inside a figure: `graph` (any mode), `trace`,
  `transform`, `compare`, `annotated`, or `domain`. One figure has one
  `steps`.
- `step` goes directly inside the `steps`. The body of a step is one or two
  sentences, with citations.
- `targets` names parts of the same figure: nodes, edges, events, cells,
  annotations, or concepts. A `detail` is not drawn, so a step cannot name it.
- Above 8 steps you get `W_VISUAL_DENSITY`. Split the figure by question.

## Narrow screens and text

Without JavaScript, in print, and on a narrow screen, the page shows a
numbered list under the figure. Each item has its label, its text, and a
link to each part. On a wide screen with JavaScript, a step bar shows
"1 of 4 · label" with **Previous** and **Next**, and the arrow keys work in
the bar. The parts of the active step stay bright, the other parts fade, and
the step text shows beside the bar. The text projection is the numbered list.

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
{% step id="wk_1" targets=["n_api", "e_insert"] label="The API stores the order" %}
One transaction writes the order and its charge request. {% cite ref="src_insert" /%}
{% /step %}
{% step id="wk_2" targets=["n_worker", "e_charge"] label="The worker charges later" /%}
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
- `E_SYNTAX`: `steps` is outside a figure, or it has no `step`.
- `E_SEMANTIC`: the figure has a second `steps`. Merge them, or split the
  figure.
- `W_VISUAL_DENSITY`: more than 8 steps.
