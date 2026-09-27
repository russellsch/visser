---
format: visser/1
docId: 0b4d6a0d-3c71-46b3-85c7-579edef94259
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
  a --> b; click a href "https://evil.example/"
```
{% /mermaid %}
