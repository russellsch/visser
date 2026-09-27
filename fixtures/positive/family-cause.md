---
format: visser/1
docId: 3b0c5e2a-3333-4a33-8a33-333333333333
title: Why the cache missed
kind: root-cause
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Why the cache missed

{% graph id="miss_cause" mode="cause" title="Two conditions together caused the miss" question="What mechanism links the deploy to the cache miss?" %}
Both conditions were needed; neither alone explains the miss.

{% factor id="f_deploy" label="Deploy changed the key format" basis="observed" %}
Recorded in the deploy log. {% cite ref="src_log" /%}
{% /factor %}

{% factor id="f_ttl" label="Old entries had not expired" basis="inferred" %}
Inferred from the TTL setting.
{% /factor %}

{% factor id="f_and" label="AND: new key format with live old entries" basis="inferred" %}
An explicit AND condition.
{% /factor %}

{% factor id="f_miss" label="Cache miss rate rose" basis="observed" %}
The observed outcome.
{% /factor %}

{% causal-link id="cl_deploy" from="f_deploy" to="f_and" label="contributes key mismatch" basis="observed" evidence=["src_log"] %}
The log shows the new format.
{% /causal-link %}

{% causal-link id="cl_ttl" from="f_ttl" to="f_and" label="keeps stale entries" basis="hypothesis" %}
Not confirmed.
{% /causal-link %}

{% causal-link id="cl_miss" from="f_and" to="f_miss" label="lookups use keys that no entry has" basis="inferred" %}
The mechanism.
{% /causal-link %}
{% /graph %}

{% source id="src_log" kind="web" title="Deploy log entry" url="https://example.com/deploys/42" capturedAt="2026-09-27T00:00:00Z" availability="link-only" /%}
