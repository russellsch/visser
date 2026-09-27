# Fact-parity checklist

Both formats of a topic must contain each fact below, and no other fact. A second person checks each item in both formats before the trial and signs at the end.

## Topic A: bounded queue (`examples/bounded-queue`)

| # | Fact | Explain page | Baseline |
|---|---|---|---|
| A1 | The queue limits the number of stored items; producers wait when it is full. | ☐ | ☐ |
| A2 | A consumer taking an item creates space; it does not mean that processing of that item has finished. | ☐ | ☐ |
| A3 | `put` waits in a loop while the queue is full and rechecks the capacity after each wakeup. | ☐ | ☐ |
| A4 | The wait releases the condition lock while the thread is blocked. | ☐ | ☐ |
| A5 | A notification is not a reservation: another producer can take the free slot first, and then this producer waits again. | ☐ | ☐ |
| A6 | `get` waits while the queue is empty, removes one item, and notifies all waiters. | ☐ | ☐ |
| A7 | Backpressure here means that `put` blocks; the queue does not drop items or return an error. | ☐ | ☐ |
| A8 | The example has no timeout, cancellation, shutdown protocol, or fairness guarantee. | ☐ | ☐ |
| A9 | The code is a teaching example; it does not show how a particular production codebase behaves. | ☐ | ☐ |
| A10 | The source code of the queue (26 lines) and a link to the Python condition-variable documentation. | ☐ | ☐ |

## Topic B: cache stampede (`examples/cache-stampede`)

| # | Fact | Explain page | Baseline |
|---|---|---|---|
| B1 | The stall needed two conditions at once: a hot cache key expired, and many requests missed it concurrently. | ☐ | ☐ |
| B2 | Keys expire daily and peak traffic occurs daily; neither alone caused a stall on other days. | ☐ | ☐ |
| B3 | Without a single-flight lock, each miss issued the same database query (inferred from the cache design). | ☐ | ☐ |
| B4 | The identical queries held every pool connection (inferred; the log shows the repeated query while the pool filled). | ☐ | ☐ |
| B5 | Requests that could not get a connection waited past their deadline and timed out (observed). | ☐ | ☐ |
| B6 | The expiry and the pool exhaustion are observed; the stampede is inferred. | ☐ | ☐ |
| B7 | Client retries may have prolonged the stall; there were no retry metrics, so this is a hypothesis. | ☐ | ☐ |
| B8 | The fix: coalesce concurrent misses for one key so that only one query reaches the database. | ☐ | ☐ |
| B9 | The incident and its log are illustrative, written for teaching. | ☐ | ☐ |
| B10 | The six-line log excerpt. | ☐ | ☐ |

Checked by: ____________________ Date: __________
