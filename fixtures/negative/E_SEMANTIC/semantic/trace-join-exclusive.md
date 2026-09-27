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

{% trace id="tr" title="T" question="Q?" %}
Interpretation.

{% actor id="a1" label="A" /%}
{% branch id="b1" label="Yes" condition="x" exclusiveWith=["b2"] /%}
{% branch id="b2" label="No" condition="not x" /%}
{% event id="ev1" actor="a1" label="E1" kind="compute" branch="b1" /%}
{% event id="ev2" actor="a1" label="E2" kind="compute" branch="b2" /%}
{% event id="ev3" actor="a1" label="Join" kind="compute" after=["ev1", "ev2"] /%}
{% /trace %}
