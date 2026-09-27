---
format: visser/1
docId: 5a34bc49-2f68-480c-9980-c0d1fe2468c8
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
  a[Secret caveat] --> b
  style a fill:none,stroke:none,color:transparent
```
{% /mermaid %}
