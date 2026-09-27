---
format: explain/1
docId: e18e91c9-3c5b-4868-875b-fa5eca581f9e
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
  a["<img src='https://example.com/t.png'>"] --> b
```
{% /mermaid %}
