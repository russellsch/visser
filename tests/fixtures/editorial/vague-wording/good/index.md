---
format: visser/1
docId: f165be7e-1e93-4df2-97f2-3b642a2b6d30
title: How the work queue behaves
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
# How the work queue behaves

<!-- vs:id p_summary -->
Producers enqueue work. Workers consume it independently. When the queue fills,
producers wait.

<!-- vs:id p_release -->
A producer waits until a worker removes an item. The worker's removal frees one
slot, and the waiting producer then rechecks the capacity before it enqueues.
