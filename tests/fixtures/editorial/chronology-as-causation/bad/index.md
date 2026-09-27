---
format: visser/1
docId: ffc34c36-b720-4b59-9098-5fed31068f6c
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
The deploy broke checkout.

{% graph id="mechanism" mode="cause" title="The deploy broke checkout" question="Why did checkout fail?" %}
{% factor id="f_deploy" label="Deploy of version 42" basis="inferred" %}
The deploy finished at noon.
{% /factor %}

{% factor id="f_errors" label="Checkout errors" basis="inferred" %}
Errors rose at 12:05.
{% /factor %}

{% causal-link id="cl_1" from="f_deploy" to="f_errors" label="then" basis="inferred" %}
The errors started after the deploy.
{% /causal-link %}

{% /graph %}
