# Execution trace — `trace`

**Question:** What happens in a concrete execution, including waits and partial order?

**Confused with:** `state` (all runs, not one run), `architecture` (who calls whom, with no order), and `cause` (a mechanism; timing alone is not a cause).

## Use it when

- Follow one run: calls, waits, and prerequisites.
- Show events that can happen in either order.
- Show mutually exclusive outcomes.

## Do not use it when

- The point is which transitions the system allows in every run. Use `state`.
- The run is a loop with no fixed count. Show a finite iteration, or use `state`.
- You have no evidence for the order. Do not draw one.
- The run is a straight line with no branch. Use a numbered list in `prose`.

## Misleading example

**Reject:** a trace whose rows are drawn top to bottom and described as "the
observed sequence" when the source only shows that each event needs its
prerequisites.

**Prefer:** state prerequisites with `after`. Say in prose which events may
happen in either order. The page itself prints "Ordering, not duration." under
an ordinal trace; do not repeat that sentence in your text.

## Figure-specific review

- Trace the question's answer through prerequisites. Separate required order
  from one observed schedule; do not order independent events for visual tidiness.
- Check message send, receipt, acknowledgement, and completion separately when
  the source distinguishes them. A reply need not mean the work has completed.
- Verify wait release conditions and branch conditions. A join requires all
  its prerequisites; mutually exclusive outcomes cannot both precede one event.
- State which run or alternatives the trace covers. Show relevant failure paths
  supported by the source, without inventing an exhaustive execution model.
- Check what spacing implies. Ordinal position is not elapsed duration; even
  a time trace uses order layers rather than proportional vertical distance.
- Use depth to explain a wait, race, or consequence. Keep the ordering fact
  needed to answer the main question visible without opening an event.

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

Narrow screens show event cards grouped by actor. Cards and text retain order
layers, kinds, prerequisites, and branches. This list must answer the `question`.

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

- `E_SEMANTIC`: `after` is cyclic, joins exclusive branches, or an ordinal
  trace has `time` or an observation. Fix the order or the scale.
- `E_REF_BROKEN`: `actor`, `to`, `after`, or `branch` names an ID outside this
  trace, or `evidence` names something that is not a `source`.
- `E_SYNTAX`: an event has no `actor`, but the trace needs one.
- `W_EVIDENCE_GAP` (`check --review`): an observation has no `evidence`.
