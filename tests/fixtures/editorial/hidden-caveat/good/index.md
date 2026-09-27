---
format: visser/1
docId: 375ab61d-c6b6-4921-b9e0-93168889093f
title: The cache serves fresh prices after 30 seconds
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
# The cache serves fresh prices after 30 seconds

<!-- vs:id p_claim -->
Readers see the current price from 30 seconds after an update. During those 30
seconds, the cache can still return the old price.

{% detail id="d_expiry" label="Where the 30 seconds come from" %}
Each cached price has a 30-second time to live, and an update does not remove
the cached copy.
{% /detail %}
