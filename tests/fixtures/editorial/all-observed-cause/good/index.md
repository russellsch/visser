---
format: visser/1
docId: 59b95d53-32aa-49de-8297-1d00926015d8
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

<!-- vs:id overview -->
# Why the order API stalled

<!-- vs:id p_claim -->
An expired cache key stalled the order API. The log shows the expiry and the
exhausted pool; the stampede between them is inferred.

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

{% causal-link id="cl_1" from="f_expiry" to="f_stampede" label="sends identical misses to the database" basis="observed" evidence=["src_log"] %}
The log shows two misses and two identical queries. {% cite ref="src_log" /%}
{% /causal-link %}

{% causal-link id="cl_2" from="f_stampede" to="f_pool" label="holds every connection" basis="inferred" %}
The pool was full while the identical queries ran.
{% /causal-link %}

{% causal-link id="cl_3" from="f_pool" to="f_timeouts" label="makes requests wait past their deadline" basis="hypothesis" %}
No request log was captured, so this link is a hypothesis.
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
