---
format: visser/1
docId: 6d6d0bb5-76c6-4d15-a00b-d572bc36ed21
title: Where an order becomes durable
kind: teaching
capturedAt: 2026-09-28T00:00:00Z
reader:
  profile: An engineer learning the order path.
  mustUnderstand:
    - Where the request becomes durable.
visibility: private
---

<!-- vs:id h_top -->
# Where an order becomes durable

<!-- vs:id p_lead -->
The request crosses one contract boundary and one durability boundary.

{% graph id="order_path" mode="architecture" title="The API writes the request" question="Where does the request become durable?" %}
Every arrow names a dependency.

{% node id="n_client" label="Client" role="external" /%}
{% node id="n_api" label="Order API" role="interface" /%}
{% node id="n_queue" label="Charge queue" role="storage" /%}
{% edge id="e_submit" from="n_client" to="n_api" kind="call" label="submits order" /%}
{% edge id="e_enqueue" from="n_api" to="n_queue" kind="data" label="stores request" /%}

{% steps id="walk" %}
{% step id="wk_client" label="Client" targets=["n_client"] %}
The client starts outside the service boundary.
{% /step %}
{% step id="wk_api" label="Order API" targets=["n_api"] %}
The API accepts the request.
{% /step %}
{% step id="wk_queue" label="Charge queue" targets=["n_queue"] %}
The queue stores the request.
{% /step %}
{% /steps %}
{% /graph %}
