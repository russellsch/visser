# Prose rules: Simplified Technical English

Read this guide before you write the prose of a document. Visser documents
follow the rules of Simplified Technical English (ASD-STE 100). The rules
help two readers. A person builds a mental model faster. An LLM that reads
the Markdown export later finds fewer ambiguous words.

Each rule has a valid snippet and an invalid snippet. `visser check DOC
--review` tests 6 of the 10 rules. An invalid snippet with a code, such as
`visser-invalid W_PASSIVE`, gets that review prompt. An invalid snippet
marked `ste-invalid` breaks a rule that no prompt tests. The contract tests
check every snippet in this file.

A snippet without frontmatter is part of a `reference` document that starts
with valid frontmatter and an `overview` heading.

## Where the rules apply

The rules apply to prose, figure titles, questions, part labels, part
bodies, and definitions. They do not apply to captured code, quoted material,
or identifiers.

A review prompt is a question, not a verdict. A simple text test gives false
positives. If the sentence is correct, keep it.

## 1. One idea per sentence

A sentence has one idea. An instruction has at most 20 words. A description
has at most 25 words. `W_SENTENCE_LENGTH` reports a longer sentence.

```markdown visser-valid
<!-- vs:id p_wait -->
A full queue makes the producer wait. The wait ends when a worker takes one
item.
```

```markdown visser-invalid W_SENTENCE_LENGTH
<!-- vs:id p_wait -->
A full queue makes the producer wait until a worker takes one item, and the
worker then signals the condition variable so that the producer wakes up and
retries its put.
```

## 2. Active voice, with the agent named

Name who does the action. `W_PASSIVE` reports a form of "be" followed by a
past participle. A short list of participles that state a property, such as
"is stored" and "is based", does not get a prompt. A participle before a
hyphen, as in "is read-only", and the name of a `state` also do not get a
prompt.

```markdown visser-valid
<!-- vs:id p_retry -->
The worker retries the charge with the same key.
```

```markdown visser-invalid W_PASSIVE
<!-- vs:id p_retry -->
The charge is retried with the same key.
```

## 3. Simple tenses

Use the simple present, the simple past, and the simple future. Do not use
an "-ing" form as the main verb. Do not use the present perfect.

```markdown visser-valid
<!-- vs:id p_state -->
The worker took the item. It writes the result now.
```

```markdown ste-invalid
<!-- vs:id p_state -->
The worker has taken the item. It is writing the result now.
```

## 4. One word for one meaning

Use one word for one meaning, and one meaning for one word. A `definition`
fixes a word. `W_SYNONYM` reports a part with a label that is different from
the label of its `entity`.

```markdown visser-valid
{% graph id="parts" mode="architecture" title="The API writes invoices" question="Which service writes an invoice?" %}
{% node id="n_api" label="Invoice API" role="interface" /%}
{% node id="n_store" label="Invoice store" role="storage" /%}
{% edge id="e_write" from="n_api" to="n_store" kind="call" label="writes the invoice" /%}
{% /graph %}

{% trace id="run" title="One invoice" question="When does the API reply?" %}
{% actor id="a_api" entity="n_api" /%}
{% event id="ev_reply" actor="a_api" label="Replies to the client" kind="return" /%}
{% /trace %}
```

```markdown visser-invalid W_SYNONYM
{% graph id="parts" mode="architecture" title="The API writes invoices" question="Which service writes an invoice?" %}
{% node id="n_api" label="Invoice API" role="interface" /%}
{% node id="n_store" label="Invoice store" role="storage" /%}
{% edge id="e_write" from="n_api" to="n_store" kind="call" label="writes the invoice" /%}
{% /graph %}

{% trace id="run" title="One invoice" question="When does the API reply?" %}
{% actor id="a_api" label="Front end" entity="n_api" /%}
{% event id="ev_reply" actor="a_api" label="Replies to the client" kind="return" /%}
{% /trace %}
```

## 5. Define a term where the reader first needs it

Put the meaning in a `definition`. The build links every use of the term to
the definition, so you do not tag the uses. Tag a use by hand with `term` only
when the text uses a different phrase for the term. Use the same word each
time. `W_JARGON` reports an acronym that appears two
or more times with no definition. `W_TERM_UNUSED` reports a definition that
the main path never uses.

```markdown visser-valid
{% definition id="def_bqw" term="BQW" %}
A BQW is a bounded queue wait: the time that a producer waits for space.
{% /definition %}

<!-- vs:id p_bqw -->
The BQW grows if the workers stop. A long BQW slows each producer.
```

```markdown visser-invalid W_JARGON
<!-- vs:id p_bqw -->
The BQW grows if the workers stop. A long BQW slows each producer.
```

## 6. Short noun strings

Do not put more than two nouns in a row. Use "of" or a verb to show how the
nouns relate.

```markdown visser-valid
<!-- vs:id p_digest -->
The lock file of the document records the digest of the toolkit.
```

```markdown ste-invalid
<!-- vs:id p_digest -->
The document lock file toolkit digest changes.
```

## 7. Exact numbers

Give a source-supported number. If the quantity is unknown, say so; never
invent a number to silence a warning. Do not write "some", "several", "many", "a few", or
"various". `W_VAGUE_QUANTITY` reports these words. "How many" and "as many
as" do not get a prompt, because they ask for or compare a number.

```markdown visser-valid
<!-- vs:id p_workers -->
Four workers take items from the queue.
```

```markdown visser-invalid W_VAGUE_QUANTITY
<!-- vs:id p_workers -->
Several workers take items from the queue.
```

## 8. No contractions, idioms, or metaphors

Write the full words. Say what the part does, not what it is like.
`W_CONTRACTION` reports a contraction such as "don't" or "it's".

```markdown visser-valid
<!-- vs:id p_block -->
The producer does not return until the queue has space.
```

```markdown visser-invalid W_CONTRACTION
<!-- vs:id p_block -->
The producer doesn't return until the queue has space.
```

## 9. "If" for a condition, "when" for a time

Use "if" for a condition that can be true or false. Use "when" for a point
in time that will come.

```markdown visser-valid
<!-- vs:id p_full -->
If the queue is full, the producer waits. When a worker takes an item, the
producer continues.
```

```markdown ste-invalid
<!-- vs:id p_full -->
When the queue is full, the producer waits. If a worker takes an item, the
producer continues.
```

## 10. Keep the articles

Terse means fewer ideas in each sentence, not fewer words in each idea. Keep
"a", "an", and "the".

```markdown visser-valid
<!-- vs:id p_take -->
The worker takes the next item from the queue.
```

```markdown ste-invalid
<!-- vs:id p_take -->
Worker takes next item from queue.
```
