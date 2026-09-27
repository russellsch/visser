---
format: explain/1
docId: 02b1b7a3-403d-4b15-9bf4-30d098eadbda
title: What must finish before the old column can be dropped
kind: plan
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [schema migrations, rolling deployments]
  new: [this illustrative migration plan]
  mustUnderstand: [which steps can run in parallel, which step depends on a decision]
visibility: private
---

<!-- ex:id overview -->
# What must finish before the old column can be dropped

<!-- ex:id p_claim -->
Renaming a column in a live service is four changes, not one: add the new
column, write to both, backfill, and switch reads. The old column can be dropped
only after reads have switched and a person decides the rollback window is over.
Backfill and the dual-write deployment can proceed in parallel once the new
column exists.

<!-- ex:id p_scope -->
This is an illustrative plan. Status values describe the example, not a real
project, and the plan has no dates.

{% graph id="migration" mode="plan" title="Column rename in a live service" question="What depends on what, and what makes each step complete?" %}
Arrows point from a prerequisite to the step that needs it. Steps without a
path between them can run in parallel.

{% task id="tk_add" label="Add new column" status="complete" output="nullable column customer_ref" acceptance="column exists in every environment" %}
A nullable column is safe to add while old code runs.
{% /task %}

{% task id="tk_dual" label="Deploy dual writes" status="ready" output="application writes both columns" acceptance="every new row has both values" %}
Old and new application versions must both be correct during the rollout.
{% /task %}

{% task id="tk_backfill" label="Backfill existing rows" status="ready" output="all historical rows copied" acceptance="count of rows with a null new value is zero" risk="long-running; must be restartable" %}
Runs in batches so it can pause under load.
{% /task %}

{% task id="tk_reads" label="Switch reads to new column" status="blocked" output="application reads customer_ref" acceptance="no query reads the old column" %}
Blocked until both dual writes and the backfill are complete; otherwise some
rows would read as empty.
{% /task %}

{% task id="tk_drop" label="Drop old column" status="proposed" output="old column removed" acceptance="schema no longer contains the old column" risk="irreversible" %}
The only irreversible step.
{% /task %}

{% dependency id="dp_add_dual" from="tk_add" to="tk_dual" label="column must exist first" %}
Writes to a missing column would fail.
{% /dependency %}

{% dependency id="dp_add_backfill" from="tk_add" to="tk_backfill" label="column must exist first" /%}

{% dependency id="dp_dual_reads" from="tk_dual" to="tk_reads" label="new rows carry the value" /%}

{% dependency id="dp_backfill_reads" from="tk_backfill" to="tk_reads" label="old rows carry the value" kind="input" %}
The backfill's output, a fully populated column, is the input that makes the
read switch safe.
{% /dependency %}

{% dependency id="dp_reads_drop" from="tk_reads" to="tk_drop" label="rollback window closed" kind="decision" %}
Finishing the read switch is not enough: a person decides when rollback to the
old column is no longer needed.
{% /dependency %}
{% /graph %}
