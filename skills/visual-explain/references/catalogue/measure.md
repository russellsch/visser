# Measure — `measure`

**Question:** How large is it, and how did it change?

**Confused with:** `compare` (properties of options, often not numbers) and a metric card (a number with no source).

## Use it when

- The claim is a size: a latency, a count, a rate, or a cost.
- Two to twelve values in one unit tell the story, such as before and after
  a change.
- Each value has a source that the reader can open.

## Do not use it when

- The values have two units, or two series. Use a table.
- The values form a series over time. Use a table, or a `trace` with
  observations.
- One number is enough. Write it in the sentence and cite it.

## Misleading example

**Reject:** a bar chart of "estimated" values drawn like measured ones. The
reader takes a guess for a measurement.

**Prefer:** `valueStatus="estimated"` on each estimate. The page hatches the
bar and prints "(estimated)" after the value.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `measure` | `id`, `title`, `question`, `unit` | — |
| `reading` | `id`, `label`, `value`, `valueStatus` | `display`, `evidence` |

- `value`: a number, 0 or more. Write it without quotes: `value=800`.
- `display`: the text of the value on the page, such as `"0.50"`, when the
  number alone drops a digit. The bar uses `value`.
- `valueStatus`: `measured`, `estimated`, `illustrative`.
- `evidence`: a list of `source` IDs, such as `["src_dash"]`.

## Rules

- `reading` goes directly inside the `measure`. The bars keep the authored
  order. Use 1 to 12 readings.
- `unit` is one unit for the whole figure, such as `ms` or `%`.
- Each bar starts at zero. The axis shows zero and the maximum only.
- Bars are ink. The page hatches a reading that is not `measured`, and its
  value says its status. The hatch never carries the status alone.
- Give each reading `evidence`: the dashboard export, the log, or the test
  output. A reading with no evidence gets `W_EVIDENCE_GAP`.
- No lines, no pies, and no second series.

## Narrow screens and text

A table under the chart gives each reading, its value, its status, and its
evidence. On a narrow screen the table shows first, and **Show map** shows
the chart. The text projection is the same table.

## Template

The source blocks below are what `visser capture file --kind example`
writes. Capture your own sources; do not copy these hashes.

````markdown visser-template
{% measure id="m_p99" title="The tail fell after single-flight" question="How much did the change reduce the tail?" unit="ms" %}
Each value is the p99 latency of one hour of traffic.

{% reading id="v_before" label="Before" value=800 valueStatus="measured" evidence=["src_dash_before"] /%}
{% reading id="v_after" label="After" value=120 valueStatus="measured" evidence=["src_dash_after"] /%}
{% /measure %}

{% source id="src_dash_before" kind="example" title="Dashboard export, before" language="text" excerptSha256="400c3e5e249134632ff844d6d8758500a3d6255b9c38393a1c320d645b54c60d" %}
```text
p99_latency_ms 800
```
{% /source %}

{% source id="src_dash_after" kind="example" title="Dashboard export, after" language="text" excerptSha256="9e1fdbcbd19827e0c4b1bf233e65f43d7069610ebee248a351e59a81f4483236" %}
```text
p99_latency_ms 120
```
{% /source %}
````

## Diagnostics

- `E_SYNTAX`: `unit` or `valueStatus` is missing, `value` is not a number,
  or the measure has no reading. Add the attribute.
- `E_LIMIT`: more than 12 readings. Use a table.
- `E_SEMANTIC`: a negative `value`. A bar starts at zero.
- `E_REF_BROKEN`: `evidence` names something that is not a `source`.
- `W_EVIDENCE_GAP` (`check --review`): a reading has no `evidence`.
