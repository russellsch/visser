# Architecture map — `graph mode="architecture"`

**Question:** What exists, where are the boundaries, and how do responsibilities interact?

**Confused with:** `trace` (the order of events) and `transform` (representations of one value, not components).

## Use it when

- Explain responsibility, calls, and a meaningful deployment, trust, or ownership boundary.

## Do not use it when

- The point is event order: left-to-right never means "happens first"; use `trace`.
- Two parts suffice in prose, or more than about 25 visible nodes need a narrower question.

## Misleading example

**Reject:** arrows labelled only "data" and presented as execution order.

**Prefer:** responsibility edges such as "enqueue charge request"; use a `trace`
for order. Both can share node IDs through `entity`.

## Figure-specific review

- Trace one reader-relevant responsibility: verify actor, direction, and kind
  against the source; placement is not order.
- Separate call, data movement, ownership, and dependency. An arrow neither
  grants file ownership nor promises completion.
- Give every group a source-supported boundary meaning. Keep important changes
  and conditions visible; use depth for mechanism or consequence. Preserve useful
  hubs and cross-boundary edges; split only when paths no longer answer the question.

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

- Optional `emphasis` (`teal`, `violet`, or `amber`) draws attention only; all
  values mean the same thing and never encode role or kind. See [visual language](../visual-language.md).
- `group`, `node`, and `edge` go directly inside the `graph`.
- Group only a source-supported function; its body is optional.
- A `node` needs `label` or `entity`; with `entity`, the label is inherited.
- `edge` endpoints are nodes here; `node group` and `group parent` name local
  groups; nesting must not cycle.
- `entity` names an existing `node` that has no `entity` itself.
- `evidence=["src_handler"]` names source targets; a `cite` supports one body sentence.
- `collapsed=true` folds one counted box but keeps its dashed boundary. Fold only
  a source-supported function or ownership boundary; otherwise split by question.
  No-JavaScript, print, and lists show every node.
- `quantity="1,200 req/s"` follows an edge label; its edge `evidence` names the source.
- More than 25 visible nodes gives `W_VISUAL_DENSITY`; caps are 200 nodes and 400 edges (`E_LAYOUT_LIMIT`).
- Write an edge label that says what the relationship does, not "connects".

## Narrow screens and text

On narrow screens the article keeps the answer and the viewer supports exploration.
Text and Markdown list nodes and labelled edges, so they must stand alone.

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

- `E_REF_BROKEN`: an endpoint is not a local node, or `evidence` is not a `source`. Fix the ID.
- `E_SYNTAX`: an unknown `role` or `kind`, or a missing `label`. Use a listed value.
- `E_SEMANTIC`: group nesting is cyclic. Remove one `parent`.
- `W_VISUAL_DENSITY`: more than 25 open nodes. Split by question or fold a source-supported boundary.
- `W_EVIDENCE_GAP` (`check --review`): quantity lacks evidence. Name its source.
