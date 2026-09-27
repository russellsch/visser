---
format: visser/1
docId: fa260154-120f-4284-bb01-74dc1b9bccad
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
flowchart TD
  A@{ label: "}", img: "https://evil.example/i.png", h: 60, constraint: "on" }
```
{% /mermaid %}
