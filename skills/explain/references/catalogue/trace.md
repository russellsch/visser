# Execution trace — `trace`

**Question:** What happens in a concrete execution, including waits and partial order?

## Use it when

- The reader must follow one concrete run: who calls whom, who waits, and what
  must happen before what.
- Two events have no order between them, and that matters. A trace shows it;
  a numbered list hides it.
- A run can branch into outcomes that exclude each other.

## Do not use it when

- The point is which transitions are allowed in every run. Use `state`.
- The run is a loop with no fixed count. Show a finite iteration, or use `state`.
- You have no evidence for the order. Do not draw one.
- The run is a straight line: each step has exactly one prerequisite and no
  branch. A numbered list says the same with less. Use `prose`.

## Misleading example

**Reject:** a trace whose rows are drawn top to bottom and described as "the
observed sequence" when the source only shows that each event needs its
prerequisites.

**Prefer:** state prerequisites with `after`. Say in prose which events may
happen in either order. The page itself prints "Ordering, not duration." under
an ordinal trace; do not repeat that sentence in your text.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `trace` | `id`, `title`, `question` | `timeUnit`, `scale` |
| `actor` | `id` | `label`, `entity` |
| `event` | `id`, `actor`, `label`, `kind` | `to`, `after`, `time`, `duration`, `branch` |
| `branch` | `id`, `label`, `condition` | `exclusiveWith` |

- `scale`: `ordinal` (the default) or `time`.
- `kind`: `call`, `return`, `send`, `receive`, `compute`, `wait`, `state-change`, `failure`.

## Rules

- `actor`, `event`, and `branch` go directly inside the `trace`.
- `event actor` and `event to` name actors; `event branch` names a branch;
  `after` names events. All must be in the same trace.
- An actor needs `label` or `entity`. `entity` names an architecture `node`.
- `after` means all listed events happen first. The `after` graph must not
  form a cycle.
- `after` must not join events from branches that exclude each other.
- An ordinal trace rejects `time` and `duration`. A `time` trace needs
  `timeUnit` and a numeric `time` on every event.

## Narrow screens and text

The page shows each event with its order layer, actor, kind, prerequisites
(`after`), and branch, and it lists the actors and the branch conditions. On a
narrow screen the events become cards grouped by actor and order layer. The
text projection lists each event with its prerequisites. Write the trace so
that this list alone answers the `question`.

## Template

```markdown explain-template
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
  trace has `time`. Fix the order or the scale.
- `E_REF_BROKEN`: `actor`, `to`, `after`, or `branch` names an ID outside this trace.
