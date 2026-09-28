---
format: visser/1
docId: 7e1d6f3b-1414-4c14-8a14-141414141414
title: Components of section 14
kind: teaching
capturedAt: 2026-09-28T00:00:00Z
visibility: private
reader:
  profile: An engineer who reads the order service for the first time.
  mustUnderstand:
    - Which component stores an order.
---

<!-- vs:id intro -->
# Components of section 14

<!-- vs:id p_lead -->
The API stores the order, and a worker charges it later. The figures below show the parts, the numbers, and the files.

{% graph id="intake" mode="architecture" title="The API writes to the queue" question="Which component writes a charge request?" %}
The arrow is a data flow, not an order of events.

{% node id="n_api" label="Order API" role="interface" /%}
{% node id="n_queue" label="Charge queue" role="storage" /%}
{% node id="n_worker" label="Charge worker" role="process" /%}

{% edge id="e_enqueue" from="n_api" to="n_queue" kind="data" label="enqueues charge request" /%}
{% edge id="e_take" from="n_worker" to="n_queue" kind="call" label="takes next request" /%}

{% steps id="walk_intake" %}
{% step id="wk_store" label="The API stores the request" targets=["n_api", "e_enqueue"] %}
One call puts the request in the queue. {% cite ref="src_handler" /%}
{% /step %}
{% step id="wk_charge" label="The worker charges later" targets=["n_worker", "e_take", "n_queue"] %}
The durable queue separates acceptance from retryable charge work.
{% /step %}
{% /steps %}
{% /graph %}

{% note id="nt_limit" kind="limit" %}
This map shows one region. The second region has the same parts.
{% /note %}

{% measure id="m_wait" title="Pool wait before and after the change" question="How much did the change reduce the wait?" unit="ms" %}
The two values come from one test run each.

{% reading id="rd_before" label="Before" value=800 valueStatus="measured" evidence=["src_handler"] /%}
{% reading id="rd_after" label="After" value=120 valueStatus="estimated" evidence=["src_calendar"] %}
The value is an estimate from the calendar.
{% /reading %}
{% /measure %}

{% tree id="code_map" title="What each folder owns" question="Where does the handler live?" %}
Only the folders that the reader needs.

{% entry id="t_core" path="packages/core" role="process" label="Parse and render" %}
{% entry id="t_handler" path="packages/core/src/handler.js" role="interface" label="Order handler" evidence=["src_handler"] /%}
{% /entry %}
{% entry id="t_docs" path="docs" label="Release notes" /%}
{% /tree %}

{% trace id="log" scale="time" timeUnit="s" title="What the log shows" question="When did the pool fill?" %}
The times come from one log.

{% event id="ob_fill" label="Pool at 100 percent" kind="observation" time=12 evidence=["src_calendar"] /%}
{% event id="ob_timeout" label="First timeout" kind="observation" time=14 evidence=["src_handler"] /%}
{% /trace %}

{% annotated id="diff_handler" title="What changed in the handler" question="Which line changed?" source="src_handler_after" before="src_handler" %}
The new handler checks the request first.

{% annotation id="an_new" label="The new check" lines=[2, 2] /%}
{% annotation id="an_old" label="The old first line" lines=[2, 2] side="before" /%}
{% /annotated %}

{% self-check id="ck_store" question="Which component stores the charge request?" %}
The charge queue stores it. The API only puts it there. {% cite ref="src_handler" /%}
{% /self-check %}

{% source id="src_handler" kind="example" title="Order handler" language="javascript" excerptSha256="be555afba965e00b4cf5aae6f5a2aa34f852c1f287c84ff60c9049be229ed6ff" %}
```javascript
export function acceptOrder(request) {
  queue.put({ orderId: request.id });
  return { status: 202 };
}
```
{% /source %}

{% source id="src_handler_after" kind="example" title="Order handler, checked" language="javascript" excerptSha256="f2a13ca8aa3d53d16beac0472282f965d17b363cef166c55d7f29591cf502cdd" %}
```javascript
export function acceptOrder(request) {
  if (!request.id) return { status: 400 };
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
