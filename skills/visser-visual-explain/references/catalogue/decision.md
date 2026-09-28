# Decision record — `kind: decision`

**Question:** What did the team decide, why, and when does the team look at it again?

**Confused with:** `compare` alone (a comparison has no winner) and a design proposal (a decision is already made).

## Use it when

- The document is `kind: decision`, and the team made the choice.
- Two or more options were real, and a later reader will ask why this one won.
- The choice depends on assumptions that can become false.

## Do not use it when

- The choice is still open. Write a `compare` in a `kind: reference` or a
  `kind: architecture` document, and state no winner.
- Only one option was real. Say so in one paragraph.

## Misleading example

**Reject:** a `compare` with a "winner" column, a score row, or a check mark
on one option. The table then claims a verdict that it cannot support.

**Prefer:** a `compare` with facts only. The winner is in prose, under
"Chosen because", with its reasons and citations.

## Rules

A decision record has this fixed shape. There is no `decision` tag.

1. The title is the decision, written as a claim: "Charge requests go
   through a bounded queue", not "Queue options".
2. One paragraph of context: the problem, the constraint, and the date or
   the event that forced the choice.
3. A `compare` of the options. It keeps its own rule: no winner, no score.
4. Two paragraphs that start with a bold lead. **Chosen because:** gives the
   reasons, each with a citation. **Revisit when:** names a condition that
   the reader can observe and that reopens the decision, such as a load level
   or a new dependency.
5. One `note kind="assumption"` for each assumption that the choice needs.
   Put each note after the paragraph that depends on it.

The budget for `kind: decision` is 700 main-path words and 2 figures.

## Template

The source block below is what `visser capture file --kind example` writes.
Capture your own sources; do not copy this hash.

````markdown visser-template
<!-- vs:id h_decision -->
# Charge requests go through a bounded queue

<!-- vs:id p_context -->
The charge provider accepts 50 requests each second. Order peaks reach 400 each second, so the API cannot call the provider directly.

{% compare id="queue_options" title="A bounded queue and a direct call differ in waiting" question="Which option keeps the API inside the provider limit?" %}
The table states facts; the choice is in the prose after it.

{% option id="o_queue" label="Bounded queue" /%}
{% option id="o_direct" label="Direct call" /%}
{% criterion id="c_peak" label="Behaviour at 400 requests each second" /%}
{% cell id="cell_queue_peak" option="o_queue" criterion="c_peak" %}
Requests wait in the queue; the worker sends 50 each second.
{% /cell %}
{% cell id="cell_direct_peak" option="o_direct" criterion="c_peak" %}
The provider rejects 350 requests each second.
{% /cell %}
{% /compare %}

<!-- vs:id p_chosen -->
**Chosen because:** the queue keeps each call inside the provider limit, and the service loses no order at a peak. {% cite ref="src_peak_test" /%}

{% note id="nt_limit_stable" kind="assumption" %}
The provider limit stays at 50 requests each second.
{% /note %}

<!-- vs:id p_revisit -->
**Revisit when:** the queue holds more than 10 minutes of requests at a peak.

{% source id="src_peak_test" kind="example" title="Peak load test with the queue" language="text" excerptSha256="d4d50872cca31980cc368aa57fb19c8a6e74d38d0920e3f46fde4d6197f47cad" %}
```text
orders_in_per_s 400 charges_out_per_s 50 orders_lost 0
```
{% /source %}
````

## Diagnostics

- `W_LENGTH`, `W_FIGURE_COUNT` (`check --review`): the record is longer than
  the budget for `kind: decision`. Move the history to a linked document.
- `W_NOTE_DENSITY` (`check --review`): too many notes. In a decision record,
  only the `limit` and `warning` notes count. Keep one assumption note for
  each assumption that the choice needs.
