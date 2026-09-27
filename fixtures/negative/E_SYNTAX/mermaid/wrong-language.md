---
format: visser/1
docId: 196753e5-62a2-446e-8b8d-ac7c94e15e1c
title: Mermaid fixture
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id overview -->
# Mermaid fixture

{% mermaid id="fig" title="Where the request waits" question="Which step blocks?" %}
The client waits only for the API.

```text
flowchart LR
  a --> b
```
{% /mermaid %}
