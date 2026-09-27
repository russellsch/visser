---
format: explain/1
docId: 6db47017-9ed8-4e2b-b441-b18452fd0a6a
title: Why the order API stalled
kind: root-cause
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [threads, queues]
  new: [this example]
  mustUnderstand: [the mechanism]
visibility: private
---

<!-- ex:id overview -->
# Why the order API stalled

<!-- ex:id p_claim -->
An expired cache key stalled the order API.

{% graph id="mechanism" mode="cause" title="The expired key stalled the API" question="Which mechanism links the expired key to the timeouts?" %}
{% factor id="f_expiry" label="Hot key expired" basis="inferred" %}
The key was no longer in the cache.
{% /factor %}

{% factor id="f_stampede" label="Identical queries reach the database" basis="inferred" %}
Many requests missed at once.
{% /factor %}

{% factor id="f_pool" label="Connection pool exhausted" basis="inferred" %}
No connection was free.
{% /factor %}

{% factor id="f_timeouts" label="API requests time out" basis="inferred" %}
Clients received errors.
{% /factor %}

{% causal-link id="cl_1" from="f_expiry" to="f_stampede" label="sends identical misses to the database" basis="observed" %}
Every miss runs the same query.
{% /causal-link %}

{% causal-link id="cl_2" from="f_stampede" to="f_pool" label="holds every connection" basis="observed" %}
The queries occupy the pool.
{% /causal-link %}

{% causal-link id="cl_3" from="f_pool" to="f_timeouts" label="makes requests wait past their deadline" basis="observed" %}
Requests wait for a connection.
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
