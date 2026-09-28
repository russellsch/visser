---
format: visser/1
docId: 9c0c5e2a-1414-4a14-8a14-000000000019
title: Negative fixture
kind: teaching
capturedAt: 2026-09-28T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Negative fixture

{% trace id="run" scale="time" timeUnit="s" title="One run" question="What happens?" %}
One run.

{% actor id="a_api" label="Order API" /%}
{% event id="ev_one" actor="a_api" label="Accepts order" kind="receive" time=1 /%}
{% /trace %}

{% graph id="why" mode="cause" title="Why the pool fills" question="What fills the pool?" %}
The mechanism.

{% factor id="f_load" label="Load rises" basis="observed" /%}
{% factor id="f_pool" label="Pool fills" basis="observed" /%}
{% causal-link id="cl_one" from="f_load" to="f_pool" label="holds connections" basis="observed" evidence=["ev_one"] /%}
{% /graph %}
