---
format: visser/1
docId: 2282ba6a-7f3b-474a-aa14-a3504f1336d7
title: Mermaid fixture
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id overview -->
# Mermaid fixture

{% mermaid id="fig" title="Where the request waits" question="Which step blocks?" %}
The client waits only for the API.

```mermaid
flowchart LR
  client --> orders_api
```
{% /mermaid %}

{% trace id="t_flow" title="One request" question="What happens first?" %}
One request.

{% actor id="actor_api" label="API" entity="orders_api" /%}

{% event id="ev_one" actor="actor_api" label="Receives the request" kind="receive" %}
It arrives.
{% /event %}
{% /trace %}
