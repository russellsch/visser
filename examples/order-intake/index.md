---
format: visser/1
docId: fa23a11c-4aeb-42dc-afff-83524d9a7520
title: An order is accepted before payment is charged
kind: architecture
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [HTTP services, message queues]
  new: [this illustrative order service]
  mustUnderstand: [what "accepted" means, where a charge can be retried]
visibility: private
---

<!-- vs:id overview -->
# An order is accepted before payment is charged

<!-- vs:id p_claim -->
In this illustrative service, a successful response to the client means the
order is stored and a charge request is queued. It does not mean the card was
charged. A separate worker charges the card later and can retry without
creating a second order.

{% graph id="components" mode="architecture" title="Accepting and charging are separate responsibilities" question="Which component answers the client, and which one talks to the payment provider?" %}
The arrows describe calls and messages, not execution order. The boundary
marks what this service owns.

{% group id="g_service" label="Order service" %}
Everything inside is deployed and owned together.
{% /group %}

{% node id="n_api" group="g_service" label="Order API" role="interface" %}
Validates the request and answers the client.
{% /node %}

{% node id="n_store" group="g_service" label="Order store" role="storage" %}
Holds each order with its payment state.
{% /node %}

{% node id="n_queue" group="g_service" label="Charge queue" role="storage" %}
Holds one charge request per order.
{% /node %}

{% node id="n_worker" group="g_service" label="Charge worker" role="process" %}
Takes charge requests and calls the payment provider.
{% /node %}

{% node id="n_provider" label="Payment provider" role="external" %}
Outside the service. Accepts an idempotency key per charge.
{% /node %}

{% edge id="e_insert" from="n_api" to="n_store" kind="call" label="insert order as pending" %}
The insert and the enqueue share one transaction in this design.
{% /edge %}

{% edge id="e_enqueue" from="n_api" to="n_queue" kind="data" label="enqueue charge request" %}
The request carries the order ID, which later becomes the idempotency key.
{% /edge %}

{% edge id="e_take" from="n_worker" to="n_queue" kind="call" label="take next request" /%}

{% edge id="e_charge" from="n_worker" to="n_provider" kind="call" label="charge with idempotency key" %}
A retry with the same key cannot charge twice.
{% /edge %}

{% edge id="e_update" from="n_worker" to="n_store" kind="call" label="mark paid or failed" /%}
{% /graph %}

<!-- vs:id p_trace -->
One possible path for a single order follows. Other orders interleave freely.

{% trace id="one_order" title="One order from request to charge" question="When does the client get its answer relative to the charge?" scale="ordinal" %}
The client's answer precedes the charge.

{% actor id="a_api" label="Order API" entity="n_api" /%}
{% actor id="a_worker" label="Charge worker" entity="n_worker" /%}
{% actor id="a_provider" label="Payment provider" entity="n_provider" /%}

{% event id="ev_store" actor="a_api" label="Stores order and enqueues charge" kind="state-change" %}
One transaction, so an order never exists without its charge request.
{% /event %}

{% event id="ev_reply" actor="a_api" label="Replies 202 Accepted" kind="return" after=["ev_store"] %}
The client learns that the order exists, not that it is paid.
{% /event %}

{% event id="ev_take" actor="a_worker" label="Takes the charge request" kind="receive" after=["ev_store"] %}
Can happen before or after the reply; the trace does not order these two.
{% /event %}

{% event id="ev_charge" actor="a_worker" label="Calls the provider" kind="call" to="a_provider" after=["ev_take"] %}
Uses the order ID as the idempotency key.
{% /event %}

{% branch id="br_paid" label="Charge succeeds" condition="provider accepts the card" exclusiveWith=["br_declined"] /%}
{% branch id="br_declined" label="Charge declined" condition="provider declines the card" exclusiveWith=["br_paid"] /%}

{% event id="ev_paid" actor="a_worker" label="Marks the order paid" kind="state-change" after=["ev_charge"] branch="br_paid" %}
The client sees the change the next time it reads the order.
{% /event %}

{% event id="ev_declined" actor="a_worker" label="Marks the order payment-failed" kind="state-change" after=["ev_charge"] branch="br_declined" %}
The order stays stored; only its payment state changes.
{% /event %}
{% /trace %}

{% compare id="retry_choice" title="Where to retry a failed charge" question="Which retry location can charge a card twice?" %}
Both retry the same charge; they differ in whether the provider can recognize the retry.

{% option id="op_worker_retry" label="Worker retries with the same key" /%}
{% option id="op_client_retry" label="Client resubmits the order" /%}

{% criterion id="cr_double" label="Risk of a double charge" /%}
{% criterion id="cr_orders" label="Orders created" /%}

{% cell id="c_worker_double" option="op_worker_retry" criterion="cr_double" %}
None: the provider sees the same idempotency key.
{% /cell %}

{% cell id="c_client_double" option="op_client_retry" criterion="cr_double" %}
Present: a new order gets a new ID, so a new key.
{% /cell %}

{% cell id="c_worker_orders" option="op_worker_retry" criterion="cr_orders" %}
One.
{% /cell %}

{% cell id="c_client_orders" option="op_client_retry" criterion="cr_orders" %}
One per submission.
{% /cell %}
{% /compare %}
