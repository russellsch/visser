# Plan and dependencies — `graph mode="plan"`

**Question:** What depends on what, and what makes each step complete?

## Use it when

- Steps depend on each other, and some can run in parallel.
- Each step needs a stated output and an acceptance check.
- A risk belongs to one step, for example an irreversible drop.

## Do not use it when

- The steps run strictly one after another. A numbered list is enough.
- You need dates or percentages. v1 has no scheduling; do not invent them.
- The steps are states of one object. Use `state`.

## Misleading example

**Reject:** a plan drawn as one straight line, which suggests that every step
waits for the previous one, with invented dates and "60% complete".

**Prefer:** dependencies only where one step truly needs another, a `status`
from the source, and an `acceptance` that says how to know the step is done.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `graph` | `id`, `title`, `question`, `mode` | — |
| `task` | `id`, `label` | `owner`, `status`, `output`, `acceptance`, `risk` |
| `dependency` | `id`, `from`, `to`, `label` | `kind` |

- `status`: `proposed`, `ready`, `blocked`, `complete`, `unknown`. The default is `proposed`.
- `kind`: `finish-start` (the default), `input`, `decision`.

## Rules

- `task` and `dependency` go directly inside the `graph`.
- `from` and `to` name tasks in the same figure. `from` is the prerequisite.
- The dependency graph must not form a cycle.
- The `label` describes the dependency. It never sets its kind.
- Keep resource conflicts out of the dependencies; explain them in prose.

## Narrow screens and text

The text view lists each task with its prerequisites and output. It must not
suggest a single linear order.

## Template

```markdown explain-template
{% graph id="migration" mode="plan" title="Column rename in a live service" question="What depends on what, and what makes each step complete?" %}
Arrows point from a prerequisite to the step that needs it.

{% task id="tk_add" label="Add new column" status="complete" output="nullable column" acceptance="column exists in every environment" /%}

{% task id="tk_dual" label="Deploy dual writes" status="ready" acceptance="every new row has both values" /%}

{% task id="tk_backfill" label="Backfill existing rows" status="ready" risk="long-running; must be restartable" /%}

{% task id="tk_reads" label="Switch reads" status="blocked" %}
Blocked until dual writes and the backfill are both complete.
{% /task %}

{% dependency id="dp_add_dual" from="tk_add" to="tk_dual" label="column must exist first" /%}
{% dependency id="dp_add_backfill" from="tk_add" to="tk_backfill" label="column must exist first" /%}
{% dependency id="dp_dual_reads" from="tk_dual" to="tk_reads" label="new rows complete" /%}
{% dependency id="dp_backfill_reads" from="tk_backfill" to="tk_reads" label="old rows complete" kind="input" /%}
{% /graph %}
```

## Diagnostics

- `E_SEMANTIC`: the dependencies are cyclic. Remove the dependency that is not real.
- `E_SYNTAX`: an unknown `status` or `kind`. Use a listed value.
