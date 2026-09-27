---
format: visser/1
docId: 5b0c5e2a-5555-4a55-8a55-555555555555
title: Migration plan
kind: plan
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Migration plan

{% graph id="migration" mode="plan" title="Schema change before backfill" question="What must finish before the backfill starts?" %}
Two tasks can run in parallel.

{% task id="t_schema" label="Add nullable column" status="complete" output="column exists" %}
Done in the last release.
{% /task %}

{% task id="t_writes" label="Dual-write new column" status="ready" owner="storage team" %}
Writers fill both columns.
{% /task %}

{% task id="t_backfill" label="Backfill old rows" acceptance="no null values remain" risk="long lock on large tables" %}
Runs in batches.
{% /task %}

{% dependency id="d_schema_writes" from="t_schema" to="t_writes" label="column must exist" %}
{% /dependency %}

{% dependency id="d_schema_backfill" from="t_schema" to="t_backfill" label="column must exist" %}
{% /dependency %}

{% dependency id="d_writes_backfill" from="t_writes" to="t_backfill" label="new rows already filled" kind="input" %}
The backfill relies on dual writes for new rows.
{% /dependency %}
{% /graph %}
