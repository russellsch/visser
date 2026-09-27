---
format: explain/1
docId: 4cae6db7-0e40-48a0-90dd-04c68bedeff1
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
  a --> b
  click a call alertMe()
```
{% /mermaid %}
