# Execution trace — `trace`

**Question:** What happens in a concrete execution, including waits and partial order?

**Confused with:** `state` (all runs, not one run), `architecture` (who calls whom, with no order), and `cause` (a mechanism; timing alone is not a cause).

## Use it when

- Follow one run's calls, waits, prerequisites, alternatives, or exclusive outcomes.

## Do not use it when

- Use `state` for all-run transitions or unbounded loops; show a finite iteration.
  Do not draw unsupported order; use numbered `prose` for an unbranched line.

## Misleading example

**Reject:** top-to-bottom rows called an observed sequence when evidence gives
only prerequisites.

**Prefer:** `after` prerequisites and prose for events that may reorder. The page
prints "Ordering, not duration." for ordinal traces; do not repeat it.

## Figure-specific review

- Separate required from observed order; never order independent events for appearance.
- Distinguish send, receipt, acknowledgement, and completion. A destination arrow
  must not contradict failed delivery; show a failed attempt locally when needed.
- Split bundles whose dependency implies unsupported order. Joins require all
  prerequisites, and exclusive outcomes cannot both precede one event.
- State covered runs, alternatives, and source-supported failures without claiming
  exhaustiveness. Ordinal position is not duration; time traces use order layers,
  not proportional distance. Use depth for wait, race, or consequence.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `trace` | `id`, `title`, `question` | `timeUnit`, `scale` |
| `actor` | `id` | `label`, `entity` |
| `event` | `id`, `label`, `kind` | `actor`, `to`, `after`, `time`, `duration`, `branch`, `evidence` |
| `branch` | `id`, `label`, `condition` | `exclusiveWith` |

- `scale`: `ordinal` (the default) or `time`.
- `kind`: `call`, `return`, `send`, `receive`, `compute`, `wait`, `state-change`, `failure`, `observation`.

## Rules

- `actor`, `event`, and `branch` go directly inside the `trace`.
- `event actor` and `event to` name actors, `event branch` names a branch,
  and `after` names events, all in the same trace.
- An actor needs `label` or `entity`. `entity` names an architecture `node`.
- `after` means all listed events happen first. The `after` graph must not
  form a cycle.
- `after` must not join events from branches that exclude each other.
- `evidence=["src_handler"]` names `source` targets: the code that shows
  this event. A `cite` supports one sentence in the body.
- An ordinal trace rejects `time` and `duration`. A `time` trace needs
  `timeUnit` and a numeric `time` on every event. A time cannot precede an
  `after` prerequisite. Equal times are valid; `after` orders occurrences,
  not the ends of their durations.
- `actor` is optional only in a `time` trace with no actors: one implicit lane.
- An `observation` is a log line, an alert, or a metric reading, with
  `evidence` and a `time` on a `time` scale. A `factor` or a `causal-link`
  can name it. Timing does not establish direction.
- On a time scale, the events of one lane and one layer stack in `time` order.
  Vertical position shows order layers, not proportional elapsed time.

## Narrow screens and text

Narrow screens use actor cards. Cards and text retain order layers, kinds,
prerequisites, and branches, and must answer the `question`.

## Template

```markdown visser-template
{% trace id="one_order" title="One order from request to charge" question="When does the client get its answer relative to the charge?" %}
The client's answer comes before the charge.

{% actor id="a_api" label="Order API" /%}
{% actor id="a_worker" label="Charge worker" /%}

{% event id="ev_store" actor="a_api" label="Stores order and enqueues charge" kind="state-change" /%}

{% event id="ev_reply" actor="a_api" label="Replies 202 Accepted" kind="return" after=["ev_store"] %}
The client learns that the order exists, not that it is paid.
{% /event %}

{% event id="ev_take" actor="a_worker" label="Takes the charge request" kind="receive" after=["ev_store"] %}
Can happen before or after the reply; the trace does not order these two.
{% /event %}

{% branch id="br_paid" label="Charge succeeds" condition="provider accepts" exclusiveWith=["br_declined"] /%}
{% branch id="br_declined" label="Charge declined" condition="provider declines" exclusiveWith=["br_paid"] /%}

{% event id="ev_paid" actor="a_worker" label="Marks the order paid" kind="state-change" after=["ev_take"] branch="br_paid" /%}
{% event id="ev_failed" actor="a_worker" label="Marks the payment failed" kind="state-change" after=["ev_take"] branch="br_declined" /%}
{% /trace %}
```

## Diagnostics

- `E_SEMANTIC`: `after` is cyclic, joins exclusive branches, or an ordinal trace
  has `time` or an observation. Fix order or scale.
- `E_REF_BROKEN`: `actor`, `to`, `after`, or `branch` is outside this trace, or
  `evidence` is not a `source`.
- `E_SYNTAX`: an event has no `actor`, but the trace needs one.
- `W_EVIDENCE_GAP` (`check --review`): an observation has no `evidence`.
