---
format: explain/1
docId: 8670a90e-7531-467d-baa6-81941f78c577
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
  1abc --> b
```
{% /mermaid %}
