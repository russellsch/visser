---
format: explain/1
docId: cf70908c-cf44-488f-89e8-50419c1f5889
title: Mermaid fixture
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id overview -->
# Mermaid fixture

{% mermaid id="fig_a" title="Where the request waits" question="Which step blocks?" %}
The client waits only for the API.

```mermaid
flowchart LR
  orders_api --> db
```
{% /mermaid %}

{% mermaid id="fig_b" title="Where the request waits" question="Which step blocks?" %}
The client waits only for the API.

```mermaid
flowchart LR
  client --> orders_api
```
{% /mermaid %}
