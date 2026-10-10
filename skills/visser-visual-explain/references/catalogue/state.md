# State and lifecycle — `graph mode="state"`

**Question:** What states are possible, and which events and guards permit transitions?

**Confused with:** `flowchart` (process actions), `trace` (one run), and `plan` (steps, not states).

## Use it when

- An object has a lifecycle, and the reader must know which moves are allowed.
- A guard or an action on a transition is the point, for example "close waits
  until in-flight is zero".
- Failure and timeout paths matter as much as the normal path.

## Do not use it when

- The point is one concrete run with waits. Use `trace`.
- The boxes are actions and choices in one process. Use `flowchart`.
- There are two independent machines. Use two figures; v1 has no regions.
- The states are really steps of a plan. Use `plan`.

## Misleading example

**Reject:** a state diagram presented as proof that the code never reaches
another state.

**Prefer:** say that the figure shows the transitions the design permits, and
cite the code that enforces each guard. A state diagram is not formal
verification.

## Figure-specific review

- Name the single entity whose state changes. Check that nodes describe its
  conditions, rather than actions, events, or different entities.
- For each important transition, separate its triggering event, enabling guard,
  and resulting action. Do not turn a necessary guard into a sufficient trigger.
- Test a blocked transition and a supported failure or recovery path. Do not
  add conventional timeout or retry behavior when the source does not define it.
- Check initial and terminal claims within the stated scope. An omitted arrow
  does not prove a transition impossible; a drawn path does not prove progress.
- Keep decision-changing guards visible. A detail may explain why the guard
  exists or what waiting means; it must not reveal a different transition rule.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `graph` | `id`, `title`, `question`, `mode` | — |
| `state` | `id`, `label` | `initial`, `terminal`, `evidence`, `emphasis` |
| `transition` | `id`, `from`, `to`, `event`, `label` | `guard`, `action`, `basis`, `emphasis` |

- `initial` and `terminal` are booleans: `initial=true`.
- `basis`: `observed`, `inferred`, `hypothesis`, `stipulated`.

## Rules

- Optional `emphasis` (`teal`, `violet`, or `amber`) draws attention to a part.
  All three values mean the same thing. Omit it when no cue helps. It does
  not encode initial, terminal, or transition basis. See [visual language](../visual-language.md).
- `state` and `transition` go directly inside the `graph`.
- `from` and `to` name states in the same figure.
- At most one state is `initial`.
- A `terminal` state has no outgoing transition.
- Cycles and self-transitions are allowed.
- `evidence=["src_states"]` names `source` targets: the code that defines
  this state. A `cite` supports one sentence in the body.
- Do not invent a guard that the source does not state.

## Narrow screens and text

The text view lists each state with its outgoing transitions, their event,
guard, and action. Each arrow shows the transition's `label` and its guard,
so put the words that matter in `label`; `event` appears in the list.

## Template

```markdown visser-template
{% graph id="lifecycle" mode="state" title="Close waits for in-flight requests" question="Which events move a connection toward closed, and which guard delays it?" %}
Draining sits between open and closed.

{% state id="st_open" label="Open" initial=true %}
Accepts new requests.
{% /state %}

{% state id="st_draining" label="Draining" %}
Accepts no new requests while at least one request is in flight.
{% /state %}

{% state id="st_closed" label="Closed" terminal=true %}
The socket is released and never reused.
{% /state %}

{% transition id="tr_close" from="st_open" to="st_draining" event="close requested" label="close requested" action="stop accepting requests" /%}

{% transition id="tr_drained" from="st_draining" to="st_closed" event="last response" label="last response" guard="in-flight = 0" action="release socket" %}
The guard makes close graceful.
{% /transition %}

{% transition id="tr_fail" from="st_open" to="st_closed" event="transport error" label="transport error" action="fail in-flight requests" /%}
{% /graph %}
```

## Diagnostics

- `E_SEMANTIC`: two initial states, or a transition leaves a terminal state.
  Split the figure or remove the transition.
- `E_SYNTAX`: `initial="true"` in quotes. Write `initial=true`.
- `E_REF_BROKEN`: `from` or `to` is not a state in this figure, or `evidence`
  names something that is not a `source`.
