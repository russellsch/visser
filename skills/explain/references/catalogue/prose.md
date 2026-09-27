# Prose, lists, and tables — no component

**Question:** Can ordinary text answer the reader's question without a visual?

Start here. Prose, lists, and Markdown tables are first-class options. No rule
requires a minimum number of diagrams (§9.11). Pick a component only when it
answers a question that text answers less well.

## Use it when

- The mechanism is a short chain that one paragraph can state in order.
- The reader must compare two or three facts; a Markdown table is enough.
- The claim depends on a caveat that must stay in the same sentence.
- A visual would repeat the prose with boxes around the nouns.

## Do not use it when

- The reader must see which of many parts talk to which: use `architecture`.
- The order of events and the waits between them carry the point: use `trace`.
- Allowed transitions matter more than any single run: use `state`.
- A value changes shape, encoding, or location: use `transform`.
- The reader must inspect each cell of a comparison with its evidence: use `compare`.

## Misleading example

**Reject:** a three-column "benefits" panel, a metric card with invented
numbers, or an executive-summary tile. These look like explanation but carry
no mechanism.

**Prefer:** "Producers enqueue work. Workers consume it independently. When the
queue fills, producers wait." Then state the exact waiting condition and what
releases it, with a citation.

## Rules

- Every paragraph, list, table, and heading needs an ID marker on the line
  before it (see `format.md`).
- Introduce a term where the reader first needs it, with `{% term ref="..." %}`
  and a `definition` block.
- Put detail that most readers can skip in a `detail` block near its owner.
- Keep a caveat that changes the conclusion in the main text, not in a detail.

## Template

```markdown explain-template
<!-- ex:id p_claim -->
A full queue makes producers wait. Workers remove items at their own pace, so
the wait ends when one worker takes an item.

<!-- ex:id tbl_limits -->
| Limit | Value | Effect when reached |
|---|---|---|
| Queue capacity | 100 items | Producers wait |
| Workers | 4 | Items stay queued longer |

{% detail id="d_wait" label="Why producers wait instead of failing" %}
A caller that must not lose work needs back-pressure. Waiting passes the
pressure back to the caller.
{% /detail %}
```

## Diagnostics

- `E_ID_MISSING`: a block has no marker. Run `explain ids assign DOC`.
- `E_SYNTAX`: a table has no header row, or a marker has no blank line before it.
