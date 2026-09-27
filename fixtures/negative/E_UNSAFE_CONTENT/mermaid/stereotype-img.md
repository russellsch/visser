---
format: explain/1
docId: 75148aa7-0c85-4f56-a254-692fe2e08e8b
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
  a["<<img src='https://evil.example/t.png'>>"] --> b
```
{% /mermaid %}
