---
format: explain/1
docId: 8f1fa230-2fc6-4fa6-9933-a3b4725cf91b
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
flowchart TD
  A@{ icon: "fa:user", form: "square", label: "User" }
```
{% /mermaid %}
