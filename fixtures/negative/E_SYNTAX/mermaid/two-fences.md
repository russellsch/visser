---
format: explain/1
docId: 06a01d52-22c1-49dc-b0a3-5707fa002fa6
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
```
```mermaid
flowchart LR
  c --> d
```
{% /mermaid %}
