# Scoring rubric

Write this rubric before the trial and do not change it after the first session. Score each answer 0, 1, or 2. Scorers do not know the format that the participant used.

- **2 (correct):** the answer contains every required element.
- **1 (partial):** the answer contains at least one required element and no wrong statement about the mechanism.
- **0 (wrong or missing):** no required element, or a wrong statement about the mechanism.

For tasks T3, the "locate" part counts only if the participant shows the place in the document.

## Topic A

| Task | Required elements |
|---|---|
| A-T1 | (a) the producer waits while the queue is full, and the wait releases the lock; (b) a consumer removes an item and notifies; (c) the producer reacquires the lock and rechecks that the length is below capacity before it appends. |
| A-T2 | (a) both producers can wake after one removal; (b) with `if`, both append, so the queue exceeds its capacity (or: a producer appends without space); (c) the reason: a notification is not a reservation. |
| A-T3 | (a) the wait releases the condition lock while blocked, so a consumer can take the lock and remove an item; (b) shows the wait event or its citation of the Python condition-variable documentation. |
| A-T4 | (a) the example has no timeout, cancellation, or shutdown protocol, so a blocked `put` can wait forever; (b) the example does not establish how a production codebase behaves. |

## Topic B

| Task | Required elements |
|---|---|
| B-T1 | (a) the hot key expired; (b) many concurrent requests missed it; (c) each miss sent the same query to the database; (d) the queries held every connection, and requests timed out waiting for one. The two conditions are (a) and (b) together. |
| B-T2 | (a) only one query reaches the database for the key; (b) the pool does not fill from that key, so requests do not time out from this mechanism; (c) the reason: the stampede needed each miss to issue its own query. |
| B-T3 | (a) the link is inferred, not observed; (b) the evidence is the log that shows the same query repeated while the pool filled; (c) shows the log excerpt or the link that cites it. |
| B-T4 | (a) the role of client retries is a hypothesis; (b) the reason: no retry metrics were available. (Also accept the inferred stampede link, if the participant says it is inferred and why.) |

## Reference task (Explain only, reported separately)

| Task | Success |
|---|---|
| A-T5, B-T5 | The copied reference names the correct target (`capacity_loop` or `wait_code` for A-T5; `f_retries` or `cl_retries_pool` for B-T5), and the request states one change. |
