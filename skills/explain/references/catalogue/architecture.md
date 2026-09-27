# Architecture map — `graph mode="architecture"`

**Question:** What exists, where are the boundaries, and how do responsibilities interact?

## Use it when

- The reader must know which part owns a responsibility and which part it calls.
- A boundary matters: a deployment unit, a trust boundary, or an owner.
- Several later views (a trace, a comparison) refer to the same parts; give
  each part one canonical `node` and point to it with `entity`.

## Do not use it when

- The point is the order of events. Left-to-right placement never means
  "happens first". Use `trace`.
- Only two parts interact. A sentence is clearer.
- The map would have more than about 25 nodes. Split it by question.

## Misleading example

**Reject:** a left-to-right map whose arrows are labelled only "data", followed
by a claim that it shows execution order.

**Prefer:** a map for responsibilities with labelled edges such as "enqueue
charge request", and a `trace` for order. Both share node IDs through `entity`.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `graph` | `id`, `title`, `question`, `mode` | — |
| `group` | `id`, `label` | `parent` |
| `node` | `id`, `role` | `label`, `group`, `entity` |
| `edge` | `id`, `from`, `to`, `kind`, `label` | `basis` |

- `role`: `process`, `storage`, `external`, `interface`, `decision`, `concept`.
- `kind`: `call`, `blocking-call`, `data`, `control`, `owns`, `depends-on`, `contains`, `feedback`.
- `basis`: `observed`, `inferred`, `hypothesis`, `stipulated`.

## Rules

- `group`, `node`, and `edge` go directly inside the `graph`.
- A `node` needs `label` or `entity`; with `entity`, the label is inherited.
- `edge` endpoints are nodes in the same figure. `node group` and `group
  parent` name groups in the same figure. Group nesting must not form a cycle.
- `entity` names an existing `node` that has no `entity` itself.
- Above 25 nodes you get `W_VISUAL_DENSITY`. The hard cap is 200 nodes and
  400 edges (`E_LAYOUT_LIMIT`).
- Write an edge label that says what the relationship does, not "connects".

## Narrow screens and text

On a narrow screen the reader first sees a list of nodes and relationships,
with **Map** as an alternate view. The Markdown projection lists every edge
with its label, so the text alone must make sense.

## Template

```markdown explain-template
{% graph id="components" mode="architecture" title="The API answers; the worker charges" question="Which component answers the client, and which one calls the payment provider?" %}
Arrows are calls and messages, not execution order.

{% group id="g_service" label="Order service" %}
Deployed and owned together.
{% /group %}

{% node id="n_api" group="g_service" label="Order API" role="interface" %}
Validates the request and answers the client.
{% /node %}

{% node id="n_worker" group="g_service" label="Charge worker" role="process" %}
Takes charge requests and calls the provider.
{% /node %}

{% node id="n_provider" label="Payment provider" role="external" %}
Outside the service.
{% /node %}

{% edge id="e_enqueue" from="n_api" to="n_worker" kind="data" label="enqueue charge request" /%}

{% edge id="e_charge" from="n_worker" to="n_provider" kind="call" label="charge with idempotency key" %}
A retry with the same key cannot charge twice.
{% /edge %}
{% /graph %}
```

## Diagnostics

- `E_REF_BROKEN`: an edge endpoint is not a node in this figure. Fix the ID.
- `E_SYNTAX`: an unknown `role` or `kind`, or a missing `label`. Use a listed value.
- `E_SEMANTIC`: group nesting is cyclic. Remove one `parent`.
