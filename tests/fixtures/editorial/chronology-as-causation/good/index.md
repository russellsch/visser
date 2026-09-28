---
format: visser/1
docId: ef0cfd2a-991f-4b16-805f-2ad095d292cb
title: Why the deploy broke checkout
kind: root-cause
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [threads, queues]
  new: [this example]
  mustUnderstand: [the mechanism]
visibility: private
---

<!-- vs:id overview -->
# Why the deploy broke checkout

<!-- vs:id p_claim -->
The deploy removed a column that checkout still read, so each checkout query
failed.

{% graph id="mechanism" mode="cause" title="A removed column broke checkout" question="Why did checkout fail?" %}
{% factor id="f_deploy" label="Deploy of version 42" basis="inferred" %}
The migration dropped the column.
{% /factor %}

{% factor id="f_errors" label="Checkout errors" basis="inferred" %}
Each query failed with an unknown-column error.
{% /factor %}

{% causal-link id="cl_1" from="f_deploy" to="f_errors" label="drops a column checkout reads" basis="inferred" %}
Each checkout query names the removed column.
{% /causal-link %}

{% /graph %}
