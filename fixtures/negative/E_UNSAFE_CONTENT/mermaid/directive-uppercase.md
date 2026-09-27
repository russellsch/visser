---
format: explain/1
docId: 0b0fe6ac-04d8-4ff5-917e-17e15ed6eaef
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
%%{INIT: {"theme": "forest"}}%%
```
{% /mermaid %}
