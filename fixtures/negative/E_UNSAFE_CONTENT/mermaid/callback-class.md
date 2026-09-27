---
format: explain/1
docId: 1d0c095b-1473-46d1-b0be-095dfd739fa7
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
classDiagram
  class Queue
  callback Queue "notify"
```
{% /mermaid %}
