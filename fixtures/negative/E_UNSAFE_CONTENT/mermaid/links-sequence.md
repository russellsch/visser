---
format: visser/1
docId: 019b7588-aa65-45ea-95da-0b0eebdcfa40
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
sequenceDiagram
  participant api as API
  links api: {"Dashboard": "https://example.com"}
  api->>api: tick
```
{% /mermaid %}
