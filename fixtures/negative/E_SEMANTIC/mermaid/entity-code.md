---
format: visser/1
docId: 90a7c296-5808-4648-99f1-7e97773a459f
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
  a["#quot;quoted#quot;"] --> b
```
{% /mermaid %}
