---
format: visser/1
docId: b4731796-c8c2-4eec-abf0-febdbbf8724b
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
  state "Waiting for capacity" as Waiting
  [*] --> Idle
  Idle --> Waiting : put when full
  Waiting --> Idle : space freed
  state decide <<choice>>
  Idle --> decide : close
  decide --> [*] : drained
  decide --> Idle : pending work
```
{% /mermaid %}
