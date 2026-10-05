# Comparison and before/after — `compare`

**Question:** Which relevant property differs, and what follows from the difference?

**Confused with:** a Markdown table (two or three plain facts) and `annotated` (a code diff).

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

## Figure-specific review

- For each criterion, compare the same property under compatible conditions:
  workload, population, time window, units, and measurement method where relevant.
- Distinguish missing, inapplicable, estimated, and measured values. Do not turn
  missing evidence into zero, equality, or a disadvantage.
- Test whether a reader could infer a ranking that the evidence cannot support.
  Check titles, row order, emphasis, and asymmetrically detailed cells as well as values.
- Keep qualifications needed for comparison visible beside the values. Use depth
  for measurement limits or a tradeoff's consequence, not a hidden reversal.
- Preserve meaningful differences; do not force all cells to equal length or
  invent matching metrics. If values cannot be compared, explain the mismatch.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `compare` | `id`, `title`, `question` | — |
| `option` | `id`, `label` | — |
| `criterion` | `id`, `label` | `units` |
| `cell` | `id`, `option`, `criterion` | `value`, `valueStatus`, `evidence` |

- `valueStatus`: `measured`, `estimated`, `illustrative`.
- `evidence=["src_measurement"]` names the captured sources that support the cell.

## Rules

- `option`, `criterion`, and `cell` go directly inside the `compare`.
- `cell option` names an option, and `cell criterion` names a criterion, in
  the same figure.
- Each option and criterion pair has at most one cell.
- `value` is a string or a number. Put the explanation in the cell body.
- A displayed value alone is not a useful drill-down. Add a body or nested
  `detail` only when it explains a condition, tradeoff, failure behavior, or
  consequence. Use `evidence` to prove the value.

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
