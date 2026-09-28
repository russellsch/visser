# Self-check — `self-check`

**Question:** Can the reader predict or explain this without the page?

**Confused with:** a quiz of names (recall is not understanding) and a `detail` (depth, not a test). This tag is not the `visser check` command.

## Use it when

- The document is `kind: teaching`, and a section gives the reader a model
  that the reader can apply.
- One question tests an item of `reader.mustUnderstand`.
- The answer is short, and the page holds the evidence for it.

## Do not use it when

- The document is not `kind: teaching`. You get `W_SELF_CHECK`.
- The question asks for a name, a number, or a word from the page.
- The section does not give the answer yet.

## Misleading example

**Reject:** "What is the name of the class that holds the queue?" The reader
finds the word and learns nothing.

**Prefer:** a task of one of the four types below, with an answer that cites
its evidence.

## Tags and attributes

| Tag | Required | Optional |
|---|---|---|
| `self-check` | `id`, `question` | — |

## Rules

- The body is the answer. Cite the evidence, as for any claim.
- Put the self-check at the end of the section that gives the answer.
- Use one of the four task types of the comprehension trial:
  - **Reconstruct:** "Draw the path of one order from the API to the charge.
    Which two components hold it?"
  - **Predict:** "A producer calls put() on a full queue. What happens, and
    what ends it?"
  - **Explain with evidence:** "Why does a timeout not lose the order? Name the
    line that shows it."
  - **Name a limit:** "Which input makes this method slow, and why?"
- One self-check for each section is enough.

## Narrow screens and text

The page shows the question, then a "Show answer" toggle. Without
JavaScript the toggle is a native `details`, and print shows the answer. The
text projection prints the question, then "Answer:" and the answer.

## Template

The source block below is what `visser capture file --kind example` writes.
Capture your own sources; do not copy this hash.

````markdown visser-template
<!-- vs:id p_rule -->
A producer that finds the queue full waits until a consumer takes an item.

{% self-check id="ck_full" question="A producer calls put() on a full queue. What happens, and what ends it?" %}
The producer waits. A consumer's take() frees one slot and wakes it. {% cite ref="src_put" /%}
{% /self-check %}

{% source id="src_put" kind="example" title="The put method of a bounded queue" language="python" excerptSha256="ef9c77af52acb98740b3a53ae135562f50c846c6f7631228e71066732ddc5236" %}
```python
def put(self, item):
    with self.not_full:
        while len(self.items) >= self.capacity:
            self.not_full.wait()
        self.items.append(item)
```
{% /source %}
````

## Diagnostics

- `E_SYNTAX`: `question` is missing, the body has no answer, or the
  self-check is inside another tag. Add the question and the answer, or move
  the tag to the top level.
- `W_SELF_CHECK` (`check --review`): the document is not `kind: teaching`.
  Remove the self-check, or state the answer in prose.
