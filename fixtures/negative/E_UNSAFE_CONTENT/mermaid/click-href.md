---
format: visser/1
docId: ad3aaa3f-873d-4cf5-a5ac-133270a171d2
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
  click a href "https://example.com/x"
```
{% /mermaid %}
