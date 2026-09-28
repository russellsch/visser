---
format: visser/1
docId: 9c0c5e2a-1414-4a14-8a14-000000000018
title: Negative fixture
kind: teaching
capturedAt: 2026-09-28T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Negative fixture

{% trace id="run" scale="time" timeUnit="s" title="One run" question="What happens?" %}
One run.

{% actor id="a_api" label="Order API" /%}
{% event id="ev_one" actor="a_api" label="Accepts order" kind="receive" time=1 /%}
{% event id="ev_two" label="Pool fills" kind="observation" time=2 evidence=["src_calendar"] /%}
{% /trace %}

{% source id="src_calendar" kind="example" title="Release calendar" language="text" excerptSha256="b5774e3dd2e3b09961fd06cd5f183c5ed45e3038d49f2a5a684b801de8bbe9a3" %}
```text
Release calendar
2026-10-03: start the new charge worker
```
{% /source %}
