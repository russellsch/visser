---
format: explain/1
docId: b474f2af-e16b-4b15-b1ea-ce972a59c5ad
title: Why an expired hot key stalled the order API
kind: root-cause
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [caching, database connection pools]
  new: [this illustrative incident]
  mustUnderstand: [which links were observed, which were inferred, what is still a hypothesis]
visibility: private
---

<!-- ex:id overview -->
# Why an expired hot key stalled the order API

<!-- ex:id p_claim -->
The stall needed two conditions at once: a heavily read cache key expired, and
many requests missed it concurrently. Together they sent a burst of identical
queries to the database, which exhausted its connection pool. The timeline and
the pool metrics are observed; the stampede is inferred from them; the role of
client retries is only a hypothesis.

<!-- ex:id p_scope -->
This is an illustrative incident written for teaching. The log excerpt below is
an example, not output from a real system.

{% graph id="mechanism" mode="cause" title="Two conditions together exhausted the pool" question="What mechanism links the expired key to the timeouts, and how well is each link supported?" %}
Line styles and labels state the basis of each link. Timing alone did not
establish any arrow.

{% factor id="f_expiry" label="Hot key expired" basis="observed" %}
The cache reported the key's expiry at the start of the incident window.
{% /factor %}

{% factor id="f_traffic" label="High concurrent read rate" basis="observed" %}
Request rate for the product page was at its daily peak.
{% /factor %}

{% factor id="f_and" label="AND: expired key with concurrent misses" basis="inferred" %}
Neither condition alone caused a stall on other days: keys expire daily, and
peak traffic occurs daily. The mechanism needs both at the same moment.
{% /factor %}

{% factor id="f_stampede" label="Identical queries reach the database" basis="inferred" %}
Each miss issued the same query because the cache had no single-flight lock.
{% /factor %}

{% factor id="f_pool" label="Connection pool exhausted" basis="observed" %}
The pool reported every connection in use with a growing wait queue.
{% /factor %}

{% factor id="f_timeouts" label="API requests time out" basis="observed" %}
The outcome that users saw.
{% /factor %}

{% factor id="f_retries" label="Client retries add load" basis="hypothesis" %}
Retries may have prolonged the stall. No retry metrics were available, so this
remains unconfirmed.
{% /factor %}

{% causal-link id="cl_expiry_and" from="f_expiry" to="f_and" label="provides the missing key" basis="observed" evidence=["src_log"] %}
The log shows the expiry immediately before the first misses.
{% /causal-link %}

{% causal-link id="cl_traffic_and" from="f_traffic" to="f_and" label="provides concurrent misses" basis="observed" %}
Peak traffic supplies many readers of the same key.
{% /causal-link %}

{% causal-link id="cl_and_stampede" from="f_and" to="f_stampede" label="each miss queries the database" basis="inferred" %}
Inferred from the cache design: without single-flight, every miss issues its
own query.
{% /causal-link %}

{% causal-link id="cl_stampede_pool" from="f_stampede" to="f_pool" label="identical queries hold every connection" basis="inferred" evidence=["src_log"] %}
The log shows the same query repeated while the pool filled.
{% /causal-link %}

{% causal-link id="cl_pool_timeouts" from="f_pool" to="f_timeouts" label="requests wait past their deadline" basis="observed" %}
Requests that could not obtain a connection timed out.
{% /causal-link %}

{% causal-link id="cl_retries_pool" from="f_retries" to="f_pool" label="may add queries (feedback)" basis="hypothesis" %}
A feedback mechanism, if it happened: timeouts cause retries, retries add load.
This is not a chronological step.
{% /causal-link %}
{% /graph %}

{% source id="src_log" kind="example" title="Illustrative cache and pool log" language="text" start=1 end=6 excerptSha256="0fdc481c509983652fa861eff76950383f95f2de3d2607d6ef756b869b9de215" %}
```text
12:00:00.004 cache  expire key=product:42
12:00:00.019 cache  miss key=product:42
12:00:00.020 cache  miss key=product:42
12:00:00.021 db     query SELECT * FROM products WHERE id = 42
12:00:00.022 db     query SELECT * FROM products WHERE id = 42
12:00:00.310 pool   in_use=50/50 waiting=37
```
{% /source %}

<!-- ex:id p_fix -->
The fix follows from the mechanism, not from the timeline: coalesce concurrent
misses for one key so that only one query reaches the database.
