---
format: visser/1
docId: 4c1b7614-00aa-40a8-89b1-f59ffb7c9cfb
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
  A@{ img: "https://example.com/i.png", label: "x" }
```
{% /mermaid %}
