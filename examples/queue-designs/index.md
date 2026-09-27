---
format: explain/1
docId: 70484962-c89d-49b3-8193-7ba4696d87ee
title: Blocking or dropping when consumers fall behind
kind: decision
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [producer-consumer queues]
  new: [the tradeoff framing]
  mustUnderstand: [what each design does when consumers lag]
visibility: private
---

<!-- ex:id overview -->
# Blocking or dropping when consumers fall behind

<!-- ex:id p_claim -->
Both designs bound memory. They differ in who pays when consumers fall behind:
the blocking queue slows producers down, and the dropping queue loses work.
The right choice depends on whether losing an item is acceptable.

{% compare id="designs" title="Two bounded queues under consumer lag" question="What happens to producers and to work when consumers cannot keep up?" %}
Values are illustrative. The throughput row has no data for either design in
this document.

{% option id="op_block" label="Bounded, blocking" %}
The producer waits in put while the queue is full.
{% /option %}

{% option id="op_drop" label="Bounded, drop newest" %}
The producer never waits; a put on a full queue discards the new item.
{% /option %}

{% criterion id="cr_memory" label="Memory bound" /%}

{% criterion id="cr_producer" label="Producer behavior under lag" /%}

{% criterion id="cr_loss" label="Work lost under lag" /%}

{% criterion id="cr_throughput" label="Sustained throughput" units="items per second" /%}

{% cell id="c_block_memory" option="op_block" criterion="cr_memory" %}
Capacity times item size.
{% /cell %}

{% cell id="c_drop_memory" option="op_drop" criterion="cr_memory" %}
Capacity times item size.
{% /cell %}

{% cell id="c_block_producer" option="op_block" criterion="cr_producer" %}
Blocks until a consumer removes an item, so latency grows with the lag.
{% /cell %}

{% cell id="c_drop_producer" option="op_drop" criterion="cr_producer" %}
Returns immediately; latency does not grow.
{% /cell %}

{% cell id="c_block_loss" option="op_block" criterion="cr_loss" value="0" valueStatus="illustrative" %}
None, provided producers tolerate waiting.
{% /cell %}

{% cell id="c_drop_loss" option="op_drop" criterion="cr_loss" %}
Every item offered while the queue is full.
{% /cell %}

{% cell id="c_block_throughput" option="op_block" criterion="cr_throughput" %}
Limited by consumer speed.
{% /cell %}
{% /compare %}

<!-- ex:id p_missing -->
The drop-newest throughput cell is deliberately absent, so it renders as not
provided: this document has no measurement for it, and zero would be wrong.
