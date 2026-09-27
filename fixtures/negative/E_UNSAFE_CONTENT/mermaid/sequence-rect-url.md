---
format: visser/1
docId: 428563ed-3dec-4524-8c95-9d70b06eb364
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
  participant A
  rect url(https://evil.example/r.png)
  A->>A: hi
  end
```
{% /mermaid %}
