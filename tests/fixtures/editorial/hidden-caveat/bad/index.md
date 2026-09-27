---
format: visser/1
docId: 8018faae-1969-4d9d-b8b2-eacc42661120
title: The cache always serves fresh prices
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [threads, queues]
  new: [this example]
  mustUnderstand: [the mechanism]
visibility: private
---

<!-- vs:id overview -->
# The cache always serves fresh prices

<!-- vs:id p_claim -->
Readers see the current price after an update.

{% detail id="d_caveat" label="Caveat" %}
However, this does not hold for the first 30 seconds after an update, when the
cache can still return the old price.
{% /detail %}
