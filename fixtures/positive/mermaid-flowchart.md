---
format: explain/1
docId: 16d06024-8112-4d93-b02f-1f51008974c9
title: Mermaid fixture
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id overview -->
# Mermaid fixture

{% mermaid id="fig" title="Where the request waits" question="Which step blocks?" %}
The client waits only for the API.

```mermaid
flowchart LR
  accTitle: Order intake
  accDescr: Where an order waits
  subgraph backend [Backend]
    orders_api[Orders API<br>v2] -->|enqueue| charge_queue[(Charge queue)]
  end
  client["`**Client** app`"] e_submit@-->|POST /orders| orders_api
  client --> backend
  classDef hot fill:#f96,stroke:#333,stroke-width:2px,font-weight:bold
  class orders_api hot
  style charge_queue fill:#eef,stroke-dasharray:5 5
  linkStyle 0 stroke:#333,stroke-width:2px
```
{% /mermaid %}
