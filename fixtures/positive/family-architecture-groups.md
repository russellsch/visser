---
format: explain/1
docId: 6b0c5e2a-6666-4a66-8a66-666666666666
title: Request path
kind: architecture
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id intro -->
# Request path

{% graph id="req_map" mode="architecture" title="The gateway owns retries" question="Where are the boundaries between client, gateway, and store?" %}
Two boundaries: the edge network and the data tier.

{% group id="g_edge" label="Edge network" %}
{% /group %}

{% group id="g_data" label="Data tier" %}
{% /group %}

{% group id="g_primary" label="Primary region" parent="g_data" %}
{% /group %}

{% node id="n_client" label="Client" role="external" %}
Outside our control.
{% /node %}

{% node id="n_gateway" label="Gateway" role="process" group="g_edge" %}
Retries idempotent calls.

{% detail id="d_retry" label="Retry budget" %}
At most two retries per request.
{% /detail %}
{% /node %}

{% node id="n_store" label="Store" role="storage" group="g_primary" %}
The system of record.
{% /node %}

{% edge id="e_request" from="n_client" to="n_gateway" kind="call" label="sends request" %}
HTTPS.
{% /edge %}

{% edge id="e_read" from="n_gateway" to="n_store" kind="data" label="reads rows" basis="observed" %}
One query per request.
{% /edge %}
{% /graph %}
