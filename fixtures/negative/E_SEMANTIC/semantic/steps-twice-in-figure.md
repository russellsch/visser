---
format: visser/1
docId: 9c0c5e2a-1414-4a14-8a14-000000000016
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

{% steps id="walk_a" %}
{% step id="wk_a" label="The API stores the request" targets=["n_api"] %}
The API owns the request boundary.
{% /step %}
{% step id="wk_a2" label="The queue is durable" targets=["n_queue", "e_enqueue"] %}
The data edge crosses into durable storage.
{% /step %}
{% /steps %}

{% steps id="walk_b" %}
{% step id="wk_b" label="The queue holds it" targets=["n_queue"] %}
The queue owns the durable request.
{% /step %}
{% step id="wk_b2" label="The API writes it" targets=["n_api", "e_enqueue"] %}
The API and edge form the write path.
{% /step %}
{% /steps %}
{% /graph %}
