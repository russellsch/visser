# Task sheet: topic A (bounded queue)

Give the participant one task at a time. The document stays open. The limit is 6 minutes for each task. After each task, ask the effort and confidence questions from the protocol (§6).

**A-T1. Reconstruct an execution and a boundary condition.**
The queue is full. One producer calls `put`. Describe, step by step, what must happen before this producer's item is in the queue. Name the condition that the producer checks when it wakes.

**A-T2. Predict the effect of a design change.**
A developer changes the `while` loop in `put` to an `if` statement, so the producer checks the capacity only once before it waits. Two producers wait on a full queue, and one consumer removes one item. What can go wrong?

**A-T3. Explain a relationship and locate its evidence.**
Why does the producer not hold the lock while it waits? Show the place in the document that supports your answer.

**A-T4. Identify a limitation or uncertainty.**
A team wants to use this queue in a service that must shut down cleanly within 5 seconds. What does the document say that is relevant, and what does it not establish?

**A-T5 (Visser condition only). Request a precise change.**
Copy a reference to the part of the document that explains why the capacity check is a loop. Write a one-line request for an agent to add one sentence about spurious wakeups to that part.
