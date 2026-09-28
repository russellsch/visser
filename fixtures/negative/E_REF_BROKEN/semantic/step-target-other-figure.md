---
format: visser/1
docId: 9c0c5e2a-1414-4a14-8a14-000000000012
title: Negative fixture
kind: teaching
capturedAt: 2026-09-28T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Negative fixture

{% graph id="intake" mode="architecture" title="The API writes to the queue" question="Which component writes a charge request?" %}
The arrow is a data flow.

{% node id="n_api" label="Order API" role="interface" /%}
{% node id="n_queue" label="Charge queue" role="storage" /%}
{% edge id="e_enqueue" from="n_api" to="n_queue" kind="data" label="enqueues charge request" /%}

{% steps id="walk" %}
{% step id="wk_1" label="The API stores the request" targets=["n_api", "t_core"] /%}
{% /steps %}
{% /graph %}

{% tree id="code_map" title="What each folder owns" question="Where is the handler?" %}
One folder.

{% entry id="t_core" path="packages/core" label="Parse and render" /%}
{% /tree %}
