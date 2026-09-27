---
format: explain/1
docId: c6091f36-ce2a-4800-81f3-0ebcbf20f2b3
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
  a["<a href='https://example.com'>docs</a>"] --> b
```
{% /mermaid %}
