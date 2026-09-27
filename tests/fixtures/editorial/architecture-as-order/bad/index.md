---
format: visser/1
docId: b65b45cc-961d-4290-9813-a5994b1d6d95
title: The order in which a request is handled
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [threads, queues]
  new: [this example]
  mustUnderstand: [the mechanism]
visibility: private
---

<!-- vs:id overview -->
# The order in which a request is handled

<!-- vs:id p_intro -->
The map below shows the request path.

{% graph id="request_path" mode="architecture" title="The order in which a request is handled" question="What happens first, and what happens next?" %}
{% node id="client" label="Client" role="external" %}
Sends requests.
{% /node %}

{% node id="api" label="API server" role="process" %}
Handles requests.
{% /node %}

{% node id="store" label="Order store" role="storage" %}
Stores orders.
{% /node %}

{% edge id="e_client_api" from="client" to="api" kind="data" label="data" %}
Requests go to the API server.
{% /edge %}

{% edge id="e_api_store" from="api" to="store" kind="data" label="data" %}
Orders go to the store.
{% /edge %}
{% /graph %}
