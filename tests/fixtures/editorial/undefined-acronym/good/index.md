---
format: explain/1
docId: 2e8f5e0e-1cc9-43b1-8bc4-51c1685e5f49
title: How the queue applies back pressure
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [threads, queues]
  new: [this example]
  mustUnderstand: [the mechanism]
visibility: private
---

<!-- ex:id overview -->
# How the queue applies back pressure

<!-- ex:id p_one -->
The bounded queue window (BQW) limit stops producers when the queue holds 64
items.

<!-- ex:id p_two -->
A worker that removes an item lowers the BQW count by one.

<!-- ex:id p_three -->
When the BQW count falls below the limit, one waiting producer continues.
