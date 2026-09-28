---
format: visser/1
docId: 9c0c5e2a-1414-4a14-8a14-000000000021
title: Negative fixture
kind: teaching
capturedAt: 2026-09-28T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Negative fixture

{% annotated id="cal" title="The calendar" question="Which date?" source="src_calendar" before="src_old" %}
One change.

{% annotation id="an_date" label="The old date" lines=[3, 3] side="before" /%}
{% /annotated %}

{% source id="src_old" kind="example" title="Old calendar" language="text" excerptSha256="6626dd26e9e51ed361785466eab042101a5f174dc8383e31b7f4d70d766df836" %}
```text
Release calendar
2026-09-30: start the new charge worker
```
{% /source %}

{% source id="src_calendar" kind="example" title="Release calendar" language="text" excerptSha256="b5774e3dd2e3b09961fd06cd5f183c5ed45e3038d49f2a5a684b801de8bbe9a3" %}
```text
Release calendar
2026-10-03: start the new charge worker
```
{% /source %}
