---
format: visser/1
docId: f517e3a7-9cbb-45b2-9c83-7c34767a57ee
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
  a --> b
  style a transform:scale(9)
```
{% /mermaid %}
