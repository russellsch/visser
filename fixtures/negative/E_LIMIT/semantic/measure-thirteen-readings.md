---
format: visser/1
docId: 9c0c5e2a-1414-4a14-8a14-000000000006
title: Negative fixture
kind: teaching
capturedAt: 2026-09-28T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Negative fixture

{% measure id="m_wait" title="Pool wait" question="How long is the wait?" unit="ms" %}
Thirteen runs.

{% reading id="rd_1" label="Run 1" value=10 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_2" label="Run 2" value=20 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_3" label="Run 3" value=30 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_4" label="Run 4" value=40 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_5" label="Run 5" value=50 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_6" label="Run 6" value=60 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_7" label="Run 7" value=70 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_8" label="Run 8" value=80 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_9" label="Run 9" value=90 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_10" label="Run 10" value=100 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_11" label="Run 11" value=110 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_12" label="Run 12" value=120 valueStatus="measured" evidence=["src_calendar"] /%}
{% reading id="rd_13" label="Run 13" value=130 valueStatus="measured" evidence=["src_calendar"] /%}
{% /measure %}

{% source id="src_calendar" kind="example" title="Release calendar" language="text" excerptSha256="b5774e3dd2e3b09961fd06cd5f183c5ed45e3038d49f2a5a684b801de8bbe9a3" %}
```text
Release calendar
2026-10-03: start the new charge worker
```
{% /source %}
