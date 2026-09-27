---
format: visser/1
docId: 0f1401c9-3fa5-42b3-853b-3d81cf765e49
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
  %%{ initialize: { "securityLevel": "loose" } }%%
  a --> b
```
{% /mermaid %}
