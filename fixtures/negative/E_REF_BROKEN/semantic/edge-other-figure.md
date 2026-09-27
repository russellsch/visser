---
format: visser/1
docId: 9c0c5e2a-9999-4a99-8a99-999999999999
title: Negative fixture
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Negative fixture

{% graph id="fig1" mode="architecture" title="T" question="Q?" %}
Interpretation.

{% node id="n1" label="One" role="process" /%}
{% node id="n2" label="Two" role="storage" /%}

{% /graph %}

{% graph id="fig2" mode="architecture" title="T" question="Q?" %}
Interpretation.

{% node id="m1" label="M" role="process" /%}
{% edge id="e1" from="m1" to="n1" kind="call" label="calls" /%}
{% /graph %}
