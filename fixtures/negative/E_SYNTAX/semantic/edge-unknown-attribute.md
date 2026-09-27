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

{% graph id="fig" mode="architecture" title="T" question="Q?" %}
Interpretation.

{% node id="n1" label="One" role="process" /%}
{% node id="n2" label="Two" role="storage" /%}
{% edge id="e1" from="n1" to="n2" kind="call" label="calls" colour="red" /%}
{% /graph %}
