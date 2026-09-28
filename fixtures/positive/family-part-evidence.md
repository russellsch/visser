---
format: visser/1
docId: 6d0c5e2a-6666-4a66-8a66-666666666666
title: Evidence on parts
kind: plan
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Evidence on parts

{% graph id="intake" mode="architecture" title="The API writes to the queue" question="Which component writes a charge request?" %}
The arrow is a data flow, not an order of events.

{% node id="n_api" label="Order API" role="interface" evidence=["src_handler"] %}
Validates the request and answers the client.
{% /node %}

{% node id="n_queue" label="Charge queue" role="storage" /%}

{% edge id="e_enqueue" from="n_api" to="n_queue" kind="data" label="enqueue charge request" /%}
{% /graph %}

{% graph id="rollout" mode="plan" title="Queue before the new worker" question="What must finish before the new worker starts?" %}
The dates come from the release calendar.

{% task id="t_queue" label="Create charge queue" status="complete" /%}

{% task id="t_worker" label="Start new worker" status="ready" due="2026-10-03" evidence=["src_calendar"] %}
Starts after the queue exists.
{% /task %}

{% dependency id="d_queue_worker" from="t_queue" to="t_worker" label="queue must exist" /%}
{% /graph %}

{% source id="src_handler" kind="example" title="Order handler" language="javascript" excerptSha256="be555afba965e00b4cf5aae6f5a2aa34f852c1f287c84ff60c9049be229ed6ff" %}
```javascript
export function acceptOrder(request) {
  queue.put({ orderId: request.id });
  return { status: 202 };
}
```
{% /source %}

{% source id="src_calendar" kind="example" title="Release calendar" language="text" excerptSha256="b5774e3dd2e3b09961fd06cd5f183c5ed45e3038d49f2a5a684b801de8bbe9a3" %}
```text
Release calendar
2026-10-03: start the new charge worker
```
{% /source %}
