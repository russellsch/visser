---
format: explain/1
docId: 12301e3f-ebad-4e21-ba58-5e972f61b4ca
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
  linkStyle 0 display:none
```
{% /mermaid %}
