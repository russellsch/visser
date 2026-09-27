---
format: explain/1
docId: 5a738973-bfc7-4cb5-8fda-35afbc0914ac
title: This retry loop stops at a deadline, not after a count
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [exponential backoff]
  new: [deadline-bounded retries]
  mustUnderstand: [why the loop terminates, what the last attempt can overrun]
visibility: private
---

<!-- ex:id overview -->
# This retry loop stops at a deadline, not after a count

<!-- ex:id p_claim -->
The loop below retries a failing call with growing delays, but it stops on
time, not on an attempt count. Before each sleep it checks whether the sleep
would pass the deadline; if so, it gives up and raises the last error. The
caller therefore gets an answer within the deadline plus the duration of one
call.

<!-- ex:id p_why -->
A count-based limit answers the wrong question. Five attempts can take a
second or a minute depending on the delays and on how long each failing call
takes. A caller with its own timeout cares about elapsed time, so the loop
measures elapsed time.

<!-- ex:id q_requirement -->
> The caller must receive either a result or an error within its own time
> budget; it does not care how many attempts were made.

<!-- ex:id t_budget -->
| Limit | What it bounds | What it leaves unbounded |
|---|---|---|
| Attempt count | Number of calls | Total elapsed time |
| Deadline | Elapsed time before the last attempt starts | Duration of that last attempt |

<!-- ex:id p_overrun -->
The bound is not exact. The deadline check happens before sleeping, not
during the call, so one slow call can run past the deadline. If the caller
needs a hard bound, the call itself must accept a timeout.

<!-- ex:id fig_overrun -->
![Illustrative timeline: three calls separated by growing sleeps all end before the 1000 ms deadline; the fourth call starts at about 920 ms, before the deadline, and ends after it.](assets/retry-timeline.png)

{% annotated id="loop_code" title="Where the deadline is enforced" question="Which line guarantees that the loop ends?" source="src_retry" %}
The deadline test is the only exit besides success.

{% annotation id="ann_check" label="Stop before a sleep that would pass the deadline" lines=[11, 12] %}
Checking before the sleep avoids waking up only to discover that no time is
left for another attempt.
{% /annotation %}

{% annotation id="ann_growth" label="Delays double, with a cap" lines=[14, 14] %}
The cap keeps late attempts from waiting longer than the remaining budget is
likely to allow.
{% /annotation %}
{% /annotated %}

{% source id="src_retry" kind="example" title="Illustrative deadline-bounded retry" language="python" start=1 end=14 excerptSha256="c1e4bd0dd5cffab7c335c3a2e0262db75128e7a2e7b85a43270e8fc3d20654db" %}
```python
import time


def call_with_retries(call, deadline_s, first_delay_s=0.1, max_delay_s=2.0):
    start = time.monotonic()
    delay = first_delay_s
    while True:
        try:
            return call()
        except Exception:
            if time.monotonic() - start + delay > deadline_s:
                raise
            time.sleep(delay)
            delay = min(delay * 2, max_delay_s)
```
{% /source %}

<!-- ex:id p_usage -->
A caller passes its own budget and a zero-argument callable:

<!-- ex:id c_usage -->
```python
profile = call_with_retries(lambda: fetch_profile(user_id), deadline_s=1.5)
```

{% detail id="d_jitter" label="Why this example has no jitter" %}
Production retry loops usually randomize each delay so that many clients do not
retry in lockstep. The example leaves jitter out to keep the deadline logic
visible; adding it does not change where the loop exits.
{% /detail %}

<!-- ex:id p_use -->
Use a count limit only when each attempt has a real cost, such as a paid
request. Otherwise, a deadline expresses what the caller needs.
