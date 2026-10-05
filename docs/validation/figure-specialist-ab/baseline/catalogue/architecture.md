# Architecture map — `graph mode="architecture"`

**Question:** What exists, where are the boundaries, and how do responsibilities interact?

**Confused with:** `trace` (the order of events) and `transform` (representations of one value, not components).

## Use it when

- The reader must know which part owns a responsibility and which part it calls.
- A boundary matters: a deployment unit, a trust boundary, or an owner.

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
| `group` | `id`, `label` | `parent`, `collapsed` |
| `node` | `id`, `role` | `label`, `group`, `entity`, `evidence`, `emphasis` |
| `edge` | `id`, `from`, `to`, `kind`, `label` | `basis`, `quantity`, `evidence`, `emphasis` |

- `role`: `process`, `storage`, `external`, `interface`, `decision`, `concept`.
- `kind`: `call`, `blocking-call`, `data`, `control`, `owns`, `depends-on`, `contains`, `feedback`.
- `basis`: `observed`, `inferred`, `hypothesis`, `stipulated`.

## Rules

- Optional `emphasis` (`teal`, `violet`, or `amber`) draws attention to a part.
  All three values mean the same thing. Omit it when no cue helps. It does
  not encode role or relationship kind. See [visual language](../visual-language.md).
- `group`, `node`, and `edge` go directly inside the `graph`.
- Group only a source-supported function. Its body is optional.
- A `node` needs `label` or `entity`; with `entity`, the label is inherited.
- `edge` endpoints are nodes in the same figure. `node group` and `group
  parent` name groups in the same figure. Group nesting must not form a cycle.
- `entity` names an existing `node` that has no `entity` itself.
- `evidence=["src_handler"]` names `source` targets: the code that shows
  this node. A `cite` supports one sentence in the body.
- `collapsed=true` starts a group folded into one counted box. Its dashed
  boundary stays. Fold only an existing source-supported function or ownership
  boundary. Otherwise split the map by question. No-JavaScript, print, and
  lists show every node.
- `quantity="1,200 req/s"` on an `edge` shows after its label. Name the
  source of the number in `evidence` on the edge.
- Above 25 visible nodes you get `W_VISUAL_DENSITY`. The hard cap is 200
  nodes and 400 edges (`E_LAYOUT_LIMIT`).
- Write an edge label that says what the relationship does, not "connects".

## Narrow screens and text

On a narrow screen, keep the main answer in the article. The diagram preview
opens a viewer for exploration. The document-level Text view lists nodes and
relationships. The Markdown projection lists every edge with its label, so
the text alone must make sense.

## Template

```markdown visser-template
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

- `E_REF_BROKEN`: an edge endpoint is not a node in this figure, or `evidence`
  names something that is not a `source`. Fix the ID.
- `E_SYNTAX`: an unknown `role` or `kind`, or a missing `label`. Use a listed value.
- `E_SEMANTIC`: group nesting is cyclic. Remove one `parent`.
- `W_VISUAL_DENSITY`: more than 25 nodes when the map opens. Split by question,
  or fold an existing source-supported boundary with `collapsed=true`.
- `W_EVIDENCE_GAP` (`check --review`): a `quantity` with no `evidence`. Name
  the source of the number.
