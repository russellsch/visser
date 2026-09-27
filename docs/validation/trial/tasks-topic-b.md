# Task sheet: topic B (cache stampede)

Give the participant one task at a time. The document stays open. The limit is 6 minutes for each task. After each task, ask the effort and confidence questions from the protocol (§6).

**B-T1. Reconstruct an execution and a boundary condition.**
Describe the chain of events from the key expiry to the API timeouts. Which two conditions had to be true at the same time?

**B-T2. Predict the effect of a design change.**
The team adds a single-flight lock to the cache, so that concurrent misses for one key wait for one query. On the next day with an expiry at peak traffic, what do you expect to happen to the connection pool, and why?

**B-T3. Explain a relationship and locate its evidence.**
What supports the claim that identical queries filled the connection pool? Show where the evidence is, and say whether the link is observed or inferred.

**B-T4. Identify a limitation or uncertainty.**
Which part of the explanation is least certain, and why?

**B-T5 (Visser condition only). Request a precise change.**
Copy a reference to the part of the document about client retries. Write a one-line request for an agent to add the retry metrics once they are available.
