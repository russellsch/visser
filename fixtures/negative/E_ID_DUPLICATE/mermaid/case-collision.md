---
format: explain/1
docId: 3b0f0d9a-2122-49a3-9b18-16f8ba491cb0
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
  Queue --> queue
```
{% /mermaid %}
