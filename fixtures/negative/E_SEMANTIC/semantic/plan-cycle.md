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

{% graph id="fig" mode="plan" title="T" question="Q?" %}
Interpretation.

{% task id="t1" label="A" /%}
{% task id="t2" label="B" /%}
{% dependency id="d1" from="t1" to="t2" label="x" /%}
{% dependency id="d2" from="t2" to="t1" label="y" /%}
{% /graph %}
