---
format: visser/1
docId: cbea82ac-70e9-46e2-bb87-ede4d5c96df8
title: Every service in the checkout path
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
# Every service in the checkout path

<!-- vs:id p_intro -->
The map shows every service that a checkout request reaches.

{% graph id="all_services" mode="architecture" title="Every checkout service" question="Which services does a checkout call?" %}
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

{% node id="svc_7" label="Service 7" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_8" label="Service 8" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_9" label="Service 9" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_10" label="Service 10" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_11" label="Service 11" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_12" label="Service 12" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_13" label="Service 13" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_14" label="Service 14" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_15" label="Service 15" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_16" label="Service 16" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_17" label="Service 17" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_18" label="Service 18" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_19" label="Service 19" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_20" label="Service 20" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_21" label="Service 21" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_22" label="Service 22" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_23" label="Service 23" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_24" label="Service 24" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_25" label="Service 25" role="process" %}
Handles one step.
{% /node %}

{% node id="svc_26" label="Service 26" role="process" %}
Handles one step.
{% /node %}

{% edge id="call_1" from="svc_1" to="svc_2" kind="call" label="calls service 2 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_2" from="svc_2" to="svc_3" kind="call" label="calls service 3 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_3" from="svc_3" to="svc_4" kind="call" label="calls service 4 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_4" from="svc_4" to="svc_5" kind="call" label="calls service 5 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_5" from="svc_5" to="svc_6" kind="call" label="calls service 6 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_6" from="svc_6" to="svc_7" kind="call" label="calls service 7 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_7" from="svc_7" to="svc_8" kind="call" label="calls service 8 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_8" from="svc_8" to="svc_9" kind="call" label="calls service 9 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_9" from="svc_9" to="svc_10" kind="call" label="calls service 10 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_10" from="svc_10" to="svc_11" kind="call" label="calls service 11 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_11" from="svc_11" to="svc_12" kind="call" label="calls service 12 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_12" from="svc_12" to="svc_13" kind="call" label="calls service 13 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_13" from="svc_13" to="svc_14" kind="call" label="calls service 14 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_14" from="svc_14" to="svc_15" kind="call" label="calls service 15 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_15" from="svc_15" to="svc_16" kind="call" label="calls service 16 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_16" from="svc_16" to="svc_17" kind="call" label="calls service 17 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_17" from="svc_17" to="svc_18" kind="call" label="calls service 18 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_18" from="svc_18" to="svc_19" kind="call" label="calls service 19 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_19" from="svc_19" to="svc_20" kind="call" label="calls service 20 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_20" from="svc_20" to="svc_21" kind="call" label="calls service 21 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_21" from="svc_21" to="svc_22" kind="call" label="calls service 22 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_22" from="svc_22" to="svc_23" kind="call" label="calls service 23 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_23" from="svc_23" to="svc_24" kind="call" label="calls service 24 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_24" from="svc_24" to="svc_25" kind="call" label="calls service 25 for the next step" %}
One call per request.
{% /edge %}

{% edge id="call_25" from="svc_25" to="svc_26" kind="call" label="calls service 26 for the next step" %}
One call per request.
{% /edge %}
{% /graph %}
