# Comparison and before/after — `compare`

**Question:** Which relevant property differs, and what follows from the difference?

## Use it when

- The reader must choose between options, and each difference needs its own
  explanation or evidence.
- A change has a before and an after. Use two options named "Before" and "After".
- Some values are measured and some are estimates, and the reader must see which.

## Do not use it when

- Two or three plain facts differ. A Markdown table is enough.
- You would need a score or a winner. `compare` has neither, by design.
- The comparison is a code diff. Use `annotated`.

## Misleading example

**Reject:** a table of green and red marks with a "recommended" badge and an
empty cell shown as zero.

**Prefer:** concrete differences such as ownership, failure behaviour, or a
measured number with its conditions. A missing cell shows **Not provided**.
State the recommendation in prose with its reasons.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `compare` | `id`, `title`, `question` | — |
| `option` | `id`, `label` | — |
| `criterion` | `id`, `label` | `units` |
| `cell` | `id`, `option`, `criterion` | `value`, `valueStatus` |

- `valueStatus`: `measured`, `estimated`, `illustrative`.

## Rules

- `option`, `criterion`, and `cell` go directly inside the `compare`.
- `cell option` names an option, and `cell criterion` names a criterion, in
  the same figure.
- Each option and criterion pair has at most one cell.
- `value` is a string or a number. Put the explanation in the cell body.

## Narrow screens and text

On a wide screen the figure is an HTML table with headers. On a narrow screen
criteria are rows, and the options stack inside each criterion with their labels.

## Template

```markdown visser-template
{% compare id="queues" title="Bounded or unbounded queue" question="What happens to producers when consumers fall behind?" %}
Only the behaviour under overload differs.

{% option id="o_bounded" label="Bounded queue" /%}
{% option id="o_unbounded" label="Unbounded queue" /%}

{% criterion id="c_overload" label="When consumers fall behind" /%}
{% criterion id="c_memory" label="Memory use" units="items" /%}

{% cell id="x_b_overload" option="o_bounded" criterion="c_overload" %}
Producers wait, so the pressure reaches the caller.
{% /cell %}

{% cell id="x_u_overload" option="o_unbounded" criterion="c_overload" %}
Producers never wait; the backlog grows.
{% /cell %}

{% cell id="x_b_memory" option="o_bounded" criterion="c_memory" value=100 valueStatus="illustrative" %}
Never more than the capacity.
{% /cell %}
{% /compare %}
```

## Diagnostics

- `E_SEMANTIC`: two cells for the same option and criterion. Merge them.
- `E_REF_BROKEN`: `option` or `criterion` is not in this figure.
