---
format: visser/1
docId: c0f2a297-45bf-4f4a-9bf4-b61e01e61d85
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
---
config:
  theme: forest
---
flowchart LR
  a --> b
```
{% /mermaid %}
