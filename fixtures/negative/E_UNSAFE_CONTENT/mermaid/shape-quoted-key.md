---
format: visser/1
docId: a9ae8728-f6ea-467b-a8bf-98fa749c9fec
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
  A@{ "img": "https://evil.example/i.png", label: "x", h: 60, constraint: "on" }
```
{% /mermaid %}
