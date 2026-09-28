---
format: visser/1
docId: 86d16eb8-95b3-4768-9955-7182f1554f60
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
{% step id="wk_contract" label="The client sees one contract" targets=["n_client", "e_submit", "n_api"] %}
The client depends on the API contract, not on the storage mechanism.
{% /step %}
{% step id="wk_durable" label="The request becomes durable at the queue" targets=["n_api", "e_enqueue", "n_queue"] %}
The data edge crosses the durability boundary before later work begins.
{% /step %}
{% /steps %}
{% /graph %}
