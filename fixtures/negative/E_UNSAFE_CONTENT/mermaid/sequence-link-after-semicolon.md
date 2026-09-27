---
format: explain/1
docId: fc184b2f-b7f2-4271-9e77-71432c13736c
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
sequenceDiagram
  participant A; link A: Dash @ https://evil.example/
  A->>A: hi
```
{% /mermaid %}
