---
format: visser/1
docId: 10a7780b-b734-4447-910f-4f2fd5cb4270
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
  xnode --> b
  click xnode href "https://evil.example/"
```
{% /mermaid %}
