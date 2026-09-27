---
format: explain/1
docId: da29731b-af35-4838-ab9d-8fdbe9b271d9
title: Two queue classes share one interface but differ on a full queue
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [interfaces, generics]
  new: [how these two queues answer a full buffer]
  mustUnderstand: [what the shared interface promises, where the two classes differ]
visibility: private
---

<!-- ex:id overview -->
# Two queue classes share one interface but differ on a full queue

<!-- ex:id p_claim -->
Both classes implement the same `WorkQueue` interface, so a caller can hold
either one through the interface. They differ in one method: when the buffer is
full, `BlockingQueue.put` waits, while `DroppingQueue.put` returns `false` and
discards the item.

{% mermaid id="queue_classes" title="One interface, two answers to a full buffer" question="Which part of each class decides what happens when the buffer is full?" %}
The interface fixes the method names; each class owns the full-buffer policy.
Both classes hold their items in a `RingBuffer`.

```mermaid
classDiagram
  class WorkQueue~T~ {
    <<interface>>
    +put(item T) bool
    +take() T
  }
  class BlockingQueue~T~ {
    -RingBuffer~T~ buffer
    -Condition notFull
    +put(item T) bool
    +take() T
  }
  class DroppingQueue~T~ {
    -RingBuffer~T~ buffer
    -int dropped
    +put(item T) bool
    +take() T
  }
  class RingBuffer~T~ {
    -int capacity
    +isFull() bool
  }
  WorkQueue <|.. BlockingQueue : implements
  WorkQueue <|.. DroppingQueue : implements
  BlockingQueue *-- RingBuffer : owns
  DroppingQueue *-- RingBuffer : owns
```
{% /mermaid %}

<!-- ex:id p_limits -->
This is an illustrative design, not a description of a particular library. A
class diagram shows structure, not timing: it does not show how long
`BlockingQueue.put` can wait, or that `take` also waits on an empty buffer.
