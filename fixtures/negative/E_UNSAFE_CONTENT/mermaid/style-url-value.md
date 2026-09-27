---
format: explain/1
docId: ba364a0e-0235-40b0-9141-eab006c595a1
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
  a --> b
  style a fill:url(https://example.com/x)
```
{% /mermaid %}
