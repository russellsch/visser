# Process flowchart — `flowchart`

**Question:** What happens next when a condition selects one path or another?

**Confused with:** `architecture` (components and responsibilities), `trace`
(one run across actors), `state` (persistent object states), and `decision`
(a document decision record).

## Use it when

- One process has alternative paths, a retry, or distinct end outcomes.

## Do not use it when

- A short procedure has no meaningful branch. Use prose or a numbered list.
- Actors, messages, waits, or partial order define one observed run. Use a
  `trace`.
- The boxes are components, or the question is who calls whom. Use
  `architecture`.

## Misleading example

**Reject:** service boxes connected left to right as if arrows prove the next action.

**Prefer:** a flowchart for one process. Use a labeled outcome after each
decision. A group names a phase or responsibility; it does not change control
flow.

## Figure-specific review

- If a source omits a threshold, branch coverage, retry condition, or completion
  guarantee, state the gap. Do not invent it to complete the flowchart.
- Trace each decision outcome to an `end`. Test a retry and another outcome.
- Check each outcome label. It qualifies the next step; it is not executable
  code or a parsed condition.
- Source order, group order, and geometry do not carry execution meaning.
- Use group color only to distinguish phases or responsibility. Explain a
  group boundary when it changes the reader's understanding.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `flowchart` | `id`, `title`, `question` | `direction` |
| `group` | `id`, `label` | `parent`, `color`, `collapsed` |
| `start` | `id`, `label` | `group`, `evidence` |
| `action` | `id`, `label` | `group`, `evidence` |
| `decision` | `id`, `label` | `group`, `evidence` |
| `end` | `id`, `label` | `group`, `evidence` |
| `flow` | `id`, `from`, `to` | `label`, `evidence` |

- `flowchart.direction=` `down` is the default. Use `flowchart.direction=`
  `right` only when it helps.
- `group.color=` `neutral`, `teal`, `violet`, or `amber`. Color belongs only
  to a flowchart group.

## Rules

- All parts go directly inside `flowchart`. `group` and `parent` express
  membership and nesting; a group body holds explanation, not parts.
- A flowchart has one `start`, one or more `end` parts, and an end path from
  each reachable part. An action has one outgoing flow. A decision has at
  least two outgoing flows.
- Each flow starts and ends at a node in this flowchart. A flow from a decision
  has a nonempty outcome label. Other flows may omit `label`.
- A group may nest, but cannot cycle. Every group contains a node directly or
  through a nested group. `collapsed` affects the initial view only.
- `evidence` names `source` targets. A `cite` supports one sentence in a body.
  Labels and bodies accept inline math; read [math guidance](../math.md) when
  notation matters.

## Narrow screens and text

The text view lists nodes and outgoing flows. It preserves original endpoint
labels when groups fold. State the material outcome in the main path.

## Template

```markdown visser-template
{% flowchart id="order" title="Validate an order before fulfilment" question="When can an order proceed?" %}
An invalid order returns for correction before another check.

{% group id="validation" label="Validate" color="teal" /%}
{% group id="resolution" label="Resolve" color="amber" /%}

{% start id="received" label="Order received" /%}
{% action id="check" label="Check order" group="validation" /%}
{% decision id="valid" label="Order valid?" group="validation" /%}
{% action id="correct" label="Request correction" group="resolution" /%}
{% end id="ready" label="Ready for fulfilment" /%}

{% flow id="f_received" from="received" to="check" /%}
{% flow id="f_check" from="check" to="valid" /%}
{% flow id="f_yes" from="valid" to="ready" label="Yes" /%}
{% flow id="f_no" from="valid" to="correct" label="No" /%}
{% flow id="f_retry" from="correct" to="check" label="Correction received" /%}
{% /flowchart %}
```

## Diagnostics

- `E_SYNTAX`: an unknown tag, attribute, color, or direction. Use listed values.
- `E_REF_BROKEN`: a flow endpoint or group reference is outside this figure, or
  evidence is not a `source`.
- `E_SEMANTIC`: degrees, starts, ends, decision outcomes, or group nesting are
  invalid. Use one path at a time and label each decision outcome.
- `W_FLOW_UNREACHABLE`: no path from `start` reaches a node. Connect it or
  remove it.
- `W_FLOW_NO_END_PATH`: a reachable node cannot reach an `end`. Add an end
  path or explain a supported stop outside this figure.
