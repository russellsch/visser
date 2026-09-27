---
format: visser/1
docId: c2671499-bf39-4e87-8669-1a5c0ae6bdde
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

<!-- vs:id overview -->
# How the queue applies back pressure

<!-- vs:id p_one -->
The BQW limit stops producers when the queue holds 64 items.

<!-- vs:id p_two -->
A worker that removes an item lowers the BQW count by one.

<!-- vs:id p_three -->
When the BQW count falls below the limit, one waiting producer continues.
