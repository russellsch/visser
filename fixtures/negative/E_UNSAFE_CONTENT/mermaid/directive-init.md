---
format: visser/1
docId: 7e688a19-7464-483b-b0f3-4e741161851c
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
%%{init: {"theme": "dark"}}%%
flowchart LR
  a --> b
```
{% /mermaid %}
