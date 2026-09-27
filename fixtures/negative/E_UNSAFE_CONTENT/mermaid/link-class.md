---
format: visser/1
docId: 5c62a2d9-4cf1-46bd-8352-3479f8db7c18
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
classDiagram
  class Queue
  link Queue "https://example.com/queue"
```
{% /mermaid %}
