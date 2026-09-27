---
format: explain/1
docId: 4b0c5e2a-4444-4a44-8a44-444444444444
title: Queue options
kind: decision
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id intro -->
# Queue options

{% compare id="queue_choice" title="Blocking and dropping queues fail differently" question="Which failure behavior does each queue have?" %}
The comparison has no winner; it states the difference.

{% option id="op_block" label="Blocking queue" %}
Producers wait.
{% /option %}

{% option id="op_drop" label="Dropping queue" %}
New items are discarded.
{% /option %}

{% criterion id="cr_full" label="When full" %}
Behavior at capacity.
{% /criterion %}

{% criterion id="cr_latency" label="Producer latency" units="ms" %}
Measured on the same host.
{% /criterion %}

{% cell id="c_block_full" option="op_block" criterion="cr_full" %}
The producer waits for space.
{% /cell %}

{% cell id="c_drop_full" option="op_drop" criterion="cr_full" %}
The item is lost.
{% /cell %}

{% cell id="c_drop_latency" option="op_drop" criterion="cr_latency" value=0.2 valueStatus="measured" %}
Constant.
{% /cell %}
{% /compare %}
