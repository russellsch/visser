---
format: visser/1
docId: 3a1f0c2e-8b7d-4e6f-9a5b-141414141414
title: A dependent event precedes its prerequisite
kind: teaching
capturedAt: 2026-09-28T00:00:00Z
visibility: private
---

<!-- vs:id overview -->
# A dependent event precedes its prerequisite

{% trace id="log" title="Contradictory times" question="Which event happens first?" scale="time" timeUnit="ms" %}
{% event id="a" label="Prerequisite" kind="compute" time=90 /%}
{% event id="b" label="Dependent" kind="compute" time=5 after=["a"] /%}
{% /trace %}
