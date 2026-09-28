---
format: visser/1
docId: 0d6a2f44-86c3-4b86-a3f1-5a3f6c9b8e12
title: Two queue designs under overload
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
# Two queue designs under overload

{% compare id="queues" title="Bounded and unbounded queues" question="What happens to memory and to producers under overload?" %}
{% option id="o_b" label="Bounded" %}
Fixed capacity.
{% /option %}

{% option id="o_u" label="Unbounded" %}
Grows with demand.
{% /option %}

{% criterion id="c_mem" label="Memory" %}
{% /criterion %}

{% criterion id="c_prod" label="Producers" %}
{% /criterion %}

{% criterion id="c_fail" label="Failure" %}
{% /criterion %}

{% cell id="cell_b_mem" option="o_b" criterion="c_mem" %}
Never more than the capacity.
{% /cell %}

{% cell id="cell_b_prod" option="o_b" criterion="c_prod" %}
Producers wait.
{% /cell %}

{% cell id="cell_b_fail" option="o_b" criterion="c_fail" %}
Nothing is lost.
{% /cell %}

{% cell id="cell_u_mem" option="o_u" criterion="c_mem" %}
Grows until memory runs out.
{% /cell %}

{% /compare %}
