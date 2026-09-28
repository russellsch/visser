---
format: visser/1
docId: b654fa4b-f72e-48eb-afbd-4020436f2d69
title: The services that a checkout waits for
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
# The services that a checkout waits for

<!-- vs:id p_intro -->
The map shows only the services that a checkout waits for. The others run after
the reply.

{% graph id="all_services" mode="architecture" title="Services that a checkout waits for" question="Which calls hold the checkout reply?" %}
{% node id="svc_1" label="Service 1" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_2" label="Service 2" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_3" label="Service 3" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_4" label="Service 4" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_5" label="Service 5" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_6" label="Service 6" role="process" %}
Handles one step.
{% /node %}

{% edge id="call_1" from="svc_1" to="svc_2" kind="call" label="calls service 2 next" %}
One call per request.
{% /edge %}

{% edge id="call_2" from="svc_2" to="svc_3" kind="call" label="calls service 3 next" %}
One call per request.
{% /edge %}

{% edge id="call_3" from="svc_3" to="svc_4" kind="call" label="calls service 4 next" %}
One call per request.
{% /edge %}

{% edge id="call_4" from="svc_4" to="svc_5" kind="call" label="calls service 5 next" %}
One call per request.
{% /edge %}

{% edge id="call_5" from="svc_5" to="svc_6" kind="call" label="calls service 6 next" %}
One call per request.
{% /edge %}
{% /graph %}
