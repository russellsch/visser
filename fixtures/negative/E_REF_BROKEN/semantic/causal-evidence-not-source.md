---
format: explain/1
docId: 9c0c5e2a-9999-4a99-8a99-999999999999
title: Negative fixture
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- ex:id intro -->
# Negative fixture

{% graph id="fig" mode="cause" title="T" question="Q?" %}
Interpretation.

{% factor id="f1" label="A" basis="observed" /%}
{% factor id="f2" label="B" basis="observed" /%}
{% causal-link id="c1" from="f1" to="f2" label="causes" basis="inferred" evidence=["f1"] /%}
{% /graph %}
