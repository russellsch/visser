---
format: visser/1
docId: af7ee8dc-5410-4368-b266-2cf5f6000964
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
stateDiagram-v2
  [*] --> Active
  state Active {
    [*] --> Running
    Running --> Paused : pause
  }
```
{% /mermaid %}
