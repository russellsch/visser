---
format: explain/1
docId: 35d608c5-bd19-4b7f-9134-181570c8429a
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
  a["<<a href='https://evil.example/'>>click me"] --> b
```
{% /mermaid %}
