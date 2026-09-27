---
format: explain/1
docId: 18b39e29-d997-4f8d-96e0-95cd3bec8a04
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
{% detail id="d_inner" label="Inner" %}
x
{% /detail %}
{% /mermaid %}
