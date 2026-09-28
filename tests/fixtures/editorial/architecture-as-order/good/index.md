---
format: visser/1
docId: 6b67def5-43ae-4842-b4a7-19ae2fe6591c
title: Who is responsible for a request, and in what order it runs
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
# Who is responsible for a request, and in what order it runs

<!-- vs:id p_intro -->
The map shows which component owns each step. The trace after it shows the
order of one request.

{% graph id="request_path" mode="architecture" title="The API server owns validation and storage" question="Which component waits for which?" %}
The arrows describe calls, not execution order.

{% node id="client" label="Client" role="external" %}
Sends one order request and waits for the reply.
{% /node %}

{% node id="api" label="API server" role="process" %}
Validates the order before it writes anything.
{% /node %}

{% node id="store" label="Order store" role="storage" %}
Commits the order row.
{% /node %}

{% edge id="e_client_api" from="client" to="api" kind="blocking-call" label="POST /orders, waits" %}
The client holds its connection until the API server replies.
{% /edge %}

{% edge id="e_api_store" from="api" to="store" kind="call" label="inserts the validated order" %}
The API server writes only after validation succeeds.
{% /edge %}
{% /graph %}

{% trace id="request_trace" title="One accepted order" question="What happens before the client gets a reply?" scale="ordinal" %}
{% actor id="a_client" label="Client" entity="client" /%}
{% actor id="a_api" label="API server" entity="api" /%}

{% event id="ev_send" actor="a_client" to="a_api" label="Sends the order" kind="send" %}
The request carries one order.
{% /event %}

{% event id="ev_validate" actor="a_api" label="Validates the order" kind="compute" after=["ev_send"] %}
An invalid order returns an error here and is never stored.
{% /event %}

{% event id="ev_reply" actor="a_api" to="a_client" label="Replies after the insert" kind="return" after=["ev_validate"] %}
The reply comes only after the order store commits the row.
{% /event %}
{% /trace %}
