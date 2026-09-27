---
format: visser/1
docId: f4b8c6aa-6fdd-4dbf-af3b-8172a15f538b
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
  a --> b
  classDef hot position:fixed
  class a hot
```
{% /mermaid %}
