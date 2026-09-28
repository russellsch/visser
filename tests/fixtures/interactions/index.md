---
format: visser/1
docId: 3b0f6f0e-6d8a-4f5e-9a51-2c7d4e1f9a60
title: Two services that fold
kind: architecture
capturedAt: 2026-09-28T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [HTTP services]
  new: [these two services]
  mustUnderstand: [which service calls which, where a click unfolds a service]
visibility: private
---

<!-- vs:id h_top -->
# Two services that fold

<!-- vs:id p_intro -->
Each service folds into one box. One call crosses from one service to the
other, and one client calls the first service.

<!-- vs:id p_store -->
The API keeps each order in {% focus targets=["n_store"] %}the order store{% /focus %}.

{% graph id="map" mode="architecture" title="Orders call billing" question="Which service calls which?" %}
Each boundary is one deployable service.

{% group id="g_orders" label="Order service" collapsed=true /%}
{% group id="g_billing" label="Billing service" collapsed=true /%}

{% node id="n_client" label="Web client" role="external" /%}
{% node id="n_api" group="g_orders" label="Order API" role="interface" /%}
{% node id="n_store" group="g_orders" label="Order store" role="storage" /%}
{% node id="n_bill" group="g_billing" label="Billing API" role="interface" /%}
{% node id="n_ledger" group="g_billing" label="Ledger" role="storage" /%}

{% edge id="e_submit" from="n_client" to="n_api" kind="call" label="submit order" /%}
{% edge id="e_save" from="n_api" to="n_store" kind="call" label="save order" /%}
{% edge id="e_invoice" from="n_api" to="n_bill" kind="call" label="create invoice" quantity="40 req/s" evidence=["src_load"] /%}
{% edge id="e_post" from="n_bill" to="n_ledger" kind="data" label="post entry" /%}

{% steps id="walk_map" %}
{% step id="wk_inside" label="Saving stays inside the order boundary" targets=["n_api", "e_save"] %}
The API and store own the durable acceptance path.
{% /step %}
{% step id="wk_client" label="Submission crosses the boundary once" targets=["n_client", "e_submit"] %}
The client knows only the API contract, not the storage path.
{% /step %}
{% /steps %}
{% /graph %}

{% trace id="flow" title="One order" question="Who acts first?" scale="ordinal" %}
{% actor id="a_api" entity="n_api" /%}
{% actor id="a_bill" label="Billing API" entity="n_bill" /%}

{% event id="ev_accept" actor="a_api" label="Accepts the order" kind="receive" /%}
{% event id="ev_invoice" actor="a_api" label="Asks for an invoice" kind="call" to="a_bill" after=["ev_accept"] /%}
{% event id="ev_fail" actor="a_bill" label="Rejects the invoice" kind="failure" after=["ev_invoice"] /%}
{% /trace %}

{% source id="src_load" kind="example" title="Load test summary" excerptSha256="48ef95e1aa22b978586bc39b470f1ea0874177b770facda8f583f3d41c94a795" %}
```text
invoice calls: 40 per second at peak
```
{% /source %}
