---
format: visser/1
docId: 4f8ac70c-7e14-4f06-9865-e194f57c7239
title: A full queue blocks producers, not consumers
kind: teaching
capturedAt: 2026-09-26T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [threads, locks, queues]
  new: [the precise waiting condition in this example]
  mustUnderstand: [what is bounded, what releases a producer]
visibility: private
---

<!-- vs:id overview -->
# A full queue blocks producers, not consumers

<!-- vs:id p_takeaway -->
The queue bounds the number of stored items by making producers wait when it is
full. A consumer taking an item creates space; it does not mean that processing
of that item has finished. {% cite ref="src_queue" /%}

<!-- vs:id p_limits -->
This is a teaching implementation, not a production design. It has no timeout,
cancellation, shutdown protocol, or fairness guarantee. The example does not
establish how a particular production codebase behaves.

<!-- vs:id p_vocabulary -->
This is {% term ref="def_backpressure" %}backpressure{% /term %}: the queue
makes the producer wait rather than accept unlimited pending work.

{% graph id="handoff" mode="architecture" title="Space, rather than completion, releases the producer" question="Where does waiting occur?" %}
The calls below share one queue. The arrows describe calls, not execution order.

{% node id="producer" label="Producer" role="process" %}
Calls `put(item)` and may wait for space.
{% /node %}

{% node id="queue" label="Bounded queue" role="storage" %}
Protects its item deque with a condition variable. Its capacity limits stored
items, not all outstanding work or the duration of a call.
{% /node %}

{% node id="worker" label="Consumer" role="process" %}
Calls `get()`, then processes the returned item outside the queue implementation.
{% /node %}

{% edge id="enqueue" from="producer" to="queue" kind="blocking-call" label="put waits while full" %}
`put` rechecks capacity after waking. Another producer may have taken a newly
available slot. A notification is not a reservation. {% cite ref="src_queue" /%}
{% /edge %}

{% edge id="dequeue" from="worker" to="queue" kind="blocking-call" label="get removes one item; waits while empty" %}
Removing an item creates queue capacity. The notification wakes waiting callers,
which must reacquire the lock and check their own condition. This code does not
wait for the consumer to finish processing. {% cite ref="src_queue" /%}
{% /edge %}
{% /graph %}

<!-- vs:id p_trace -->
One possible execution begins with a full queue. Follow
{% focus targets=["enqueue", "event_wait", "event_remove"] %}the wait and release{% /focus %}.
This is one possible ordering, not every legal thread interleaving.

{% trace id="full_queue_trace" title="A consumer creates space" question="What lets the producer continue?" scale="ordinal" %}
The producer can continue only after it reacquires the lock and finds the
waiting condition false.

{% actor id="actor_producer" label="Producer" entity="producer" /%}
{% actor id="actor_consumer" label="Consumer" entity="worker" /%}

{% event id="event_call" actor="actor_producer" label="Calls put with the queue full" kind="call" %}
The call enters the queue's condition-protected section.
{% /event %}

{% event id="event_wait" actor="actor_producer" label="Waits for capacity" kind="wait" after=["event_call"] %}
The wait releases the condition lock while blocked. {% cite ref="src_condition_docs" /%}
{% /event %}

{% event id="event_remove" actor="actor_consumer" label="Removes an item and notifies" kind="state-change" after=["event_wait"] %}
A `get` call creates space, not completed processing.
{% /event %}

{% event id="event_resume" actor="actor_producer" label="Rechecks capacity and enqueues if space remains" kind="state-change" after=["event_remove"] %}
Another producer could acquire the slot first; in that case this producer waits
again. The displayed trace illustrates the path on which space remains.
{% /event %}
{% /trace %}

{% annotated id="wait_code" title="Why this is a loop, not a one-time check" question="What condition must hold when put resumes?" source="src_queue" %}
The condition is rechecked after every wakeup.

{% annotation id="capacity_loop" label="Recheck capacity while holding the lock" lines=[14, 17] %}
The loop tests actual queue state after the waiter reacquires the condition lock.
A notification alone does not make the condition true for this caller.
{% /annotation %}
{% /annotated %}

{% self-check id="ck_second_producer" question="Two producers wait on a full queue, and a consumer removes one item. What does each producer do next?" %}
`notify_all` wakes both producers. Each producer gets the lock in turn and
checks the capacity again. The producer that gets the lock first finds the
free slot and enqueues. The other producer finds the queue full and waits
again. {% cite ref="src_queue" /%}
{% /self-check %}

{% definition id="def_backpressure" term="Backpressure" %}
A mechanism that makes upstream work wait or slow down when a downstream
resource cannot accept more work. Here it is implemented by blocking `put`
while the queue is full, not by dropping items or returning an error.
{% /definition %}

{% source id="src_queue" kind="example" title="Illustrative bounded queue" language="python" start=1 end=26 excerptSha256="46211103f813d56e7736c562cba07868cd8bcd12183327be0da376542fb4f358" %}
```python
from collections import deque
from threading import Condition


class BoundedQueue:
    def __init__(self, capacity):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self.items = deque()
        self.changed = Condition()

    def put(self, item):
        with self.changed:
            while len(self.items) >= self.capacity:
                self.changed.wait()
            self.items.append(item)
            self.changed.notify_all()

    def get(self):
        with self.changed:
            while not self.items:
                self.changed.wait()
            item = self.items.popleft()
            self.changed.notify_all()
            return item
```
{% /source %}

{% source id="src_condition_docs" kind="web" title="Python condition-variable documentation" url="https://docs.python.org/3/library/threading.html#condition-objects" capturedAt="2026-09-26T00:00:00Z" availability="link-only" /%}
