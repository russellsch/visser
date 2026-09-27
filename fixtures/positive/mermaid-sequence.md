---
format: visser/1
docId: 7883e098-53cf-4727-acdc-a66dc1407d7b
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
sequenceDiagram
  autonumber
  accTitle: Retry until success
  participant U as User
  participant orders_api as Orders API
  U->>orders_api: POST /orders
  Note over U,orders_api: the client holds its own deadline
  loop retry
    orders_api-->>U: 503
  end
  alt accepted
    orders_api->>U: 202 Accepted
  else rejected
    orders_api->>U: 400
  end
```
{% /mermaid %}
