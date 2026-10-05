---
format: visser/1
docId: 322ecf26-1a5f-43ef-80b9-43e712cb9835
title: "Why SQLite readers can disagree after a commit"
kind: teaching
capturedAt: 2026-09-29T03:22:37Z
reader:
  profile: engineer familiar with basic SQL
  knows: [SELECT, UPDATE, COMMIT]
  new: [WAL, snapshot, end mark]
  mustUnderstand:
    - "Explain why an existing reader returns 100 while a new reader returns 80."
    - "Predict the result when BEGIN happens before a commit but the first SELECT happens after it."
    - "Explain why a stale reader cannot become a writer by waiting."
    - "Explain the concurrency tradeoff of BEGIN IMMEDIATE."
visibility: private
---

<!-- vs:id overview -->
# Why SQLite readers can disagree after a commit

{% source id="src_probe" kind="file" title="Observed SQLite schedules, version 3.53.0" language="text" file="probe-output.txt" capturedAt="2026-09-29T03:23:11Z" excerptSha256="3ef1882a5f39260158898ebf167413d5b698f1c14f9f93452814243209cb3761" originFileSha256="3ef1882a5f39260158898ebf167413d5b698f1c14f9f93452814243209cb3761" %}
```text
SQLite 3.53.0
Separate connections; WAL; explicit transactions; timeout=0; no shared cache.
Snapshot, SELECT order AC: A first read=100; B commits 80; A=100; C=80
A tries UPDATE in old transaction: SQLITE_BUSY_SNAPSHOT
A ends old transaction and reads in new one: 80
Snapshot, SELECT order CA: A first read=100; B commits 80; A=100; C=80
A tries UPDATE in old transaction: SQLITE_BUSY_SNAPSHOT
A ends old transaction and reads in new one: 80
Delayed first read: A BEGIN; B autocommit UPDATE=80; A first SELECT=80
A BEGIN IMMEDIATE: B UPDATE=SQLITE_BUSY; C SELECT=100
A commits 70: C next autocommit SELECT=70
All assertions passed. Temporary databases removed.
```
{% /source %}


<!-- vs:id intro -->
A commit does not refresh an existing SQLite read transaction. This example changes one counter from **100** to **80**. Connection A still reads **100**, while connection C reads **80**. {% cite ref="src_probe" /%}

<!-- vs:id scope -->
Scope: WAL mode, separate connections, and no shared cache. You need basic SQL. This page explains visibility, not crash durability or query performance.

{% definition id="def_begin" term="BEGIN" %}
BEGIN opens an explicit transaction. Plain BEGIN uses DEFERRED behavior; the first database access starts its read or write transaction. {% cite ref="src_transaction" /%}
{% /definition %}

{% definition id="def_wal" term="WAL" %}
The write-ahead log (WAL) holds changed database pages before a checkpoint copies them into the database file. {% cite ref="src_wal" /%}
{% /definition %}

{% definition id="def_snapshot" term="snapshot" aliases=["snapshots"] %}
A snapshot is the fixed database view that one read transaction uses. {% cite ref="src_isolation" /%}
{% /definition %}

{% definition id="def_mark" term="end mark" %}
An end mark bounds the committed WAL content that a reader can use. It stays fixed throughout that read transaction. {% cite ref="src_wal" /%}
{% /definition %}

{% graph id="read_paths" mode="architecture" title="A reader chooses a page version" question="How can a reader keep its view while a writer commits?" %}
The arrows show access paths. A read does not always come from the database file.

{% node id="reader_a" label="Reader A" role="process" evidence=["src_wal"] %}
Its end mark limits visible changes. {% cite ref="src_wal" /%}
{% /node %}
{% node id="writer_b" label="Writer B" role="process" evidence=["src_probe"] %}
In this experiment, B commits while A keeps its transaction open. {% cite ref="src_probe" /%}
{% /node %}
{% node id="wal_file" label="WAL" role="storage" evidence=["src_wal"] %}
One WAL can contain changes from multiple commits. {% cite ref="src_wal" /%}
{% /node %}
{% node id="database_file" label="Database file" role="storage" evidence=["src_wal"] %}
This file supplies pages with no suitable version in the WAL. {% cite ref="src_wal" /%}
{% /node %}
{% edge id="write_wal" from="writer_b" to="wal_file" kind="data" label="appends changed pages" evidence=["src_wal"] %}
A commit record makes the transaction complete in the WAL. {% cite ref="src_wal" /%}
{% /edge %}
{% edge id="read_wal" from="reader_a" to="wal_file" kind="call" label="finds latest visible page" evidence=["src_wal"] %}
Choose the newest version within this reader's end mark, not the newest version overall. {% cite ref="src_wal" /%}
{% /edge %}
{% edge id="read_database" from="reader_a" to="database_file" kind="call" label="reads fallback page" evidence=["src_wal"] %}
Use this path if the WAL has no suitable version. {% cite ref="src_wal" /%}
{% /edge %}
{% edge id="checkpoint" from="wal_file" to="database_file" kind="data" label="checkpoint copies safe pages" evidence=["src_wal"] %}
Checkpoint progress must preserve active readers. Commit and checkpoint are distinct operations. {% cite ref="src_wal" /%}
{% /edge %}
{% steps id="path_walk" %}
{% step id="walk_visibility" label="Visibility has a boundary" targets=["reader_a", "read_wal", "read_database", "wal_file", "database_file"] %}
The same files can supply different views to readers with different end marks. {% cite ref="src_wal" /%}
{% /step %}
{% step id="walk_commit" label="Commit does not refresh" targets=["writer_b", "write_wal", "wal_file"] %}
In the experiment below, B finishes its commit before A repeats its read. A still returns 100. {% cite ref="src_probe" /%}
{% /step %}
{% /steps %}
{% /graph %}

<!-- vs:id invariant -->
**The fixed boundary belongs to the read transaction, not each SELECT.** A reader needs a new transaction to obtain a fresh snapshot. {% cite ref="src_isolation" /%}

{% trace id="two_answers" title="One commit leaves two valid answers" question="Which value does each connection read after B commits 80?" %}
Both reads in the middle follow B's commit. Their relative order does not change the answers; the probe tested both orders.

{% actor id="actor_a" entity="reader_a" /%}
{% actor id="actor_b" entity="writer_b" /%}
{% actor id="actor_c" label="New reader C" /%}
{% event id="a_first" actor="actor_a" label="First SELECT: 100" kind="return" evidence=["src_probe"] %}
A executes BEGIN and then SELECT. It keeps this transaction open. {% cite ref="src_probe" /%}
{% /event %}
{% event id="b_commit" actor="actor_b" label="Commits 80" kind="state-change" after=["a_first"] evidence=["src_probe"] %}
B executes BEGIN IMMEDIATE, UPDATE, and COMMIT on its separate connection. {% cite ref="src_probe" /%}
{% /event %}
{% event id="a_old" actor="actor_a" label="Same transaction: 100" kind="return" after=["b_commit"] evidence=["src_probe"] %}
A repeats SELECT without ending its transaction. {% cite ref="src_probe" /%}
{% /event %}
{% event id="c_new" actor="actor_c" label="New reader: 80" kind="return" after=["b_commit"] evidence=["src_probe"] %}
C has no active transaction before this SELECT. {% cite ref="src_probe" /%}
{% /event %}
{% event id="a_end" actor="actor_a" label="Ends old transaction" kind="state-change" after=["a_old", "c_new"] evidence=["src_probe"] %}
A uses ROLLBACK to release its old view. It has no successful writes to undo. {% cite ref="src_probe" /%}
{% /event %}
{% event id="a_fresh" actor="actor_a" label="New transaction: 80" kind="return" after=["a_end"] evidence=["src_probe"] %}
A executes BEGIN and SELECT again. {% cite ref="src_probe" /%}
{% /event %}
{% /trace %}

<!-- vs:id trace_answer -->
Follow {% focus targets=["a_first", "a_old", "a_fresh"] %}A's three reads{% /focus %}: **100 → 100 → 80**. B's commit succeeds. A changes its answer only after it ends the old transaction. {% cite ref="src_probe" /%}

{% self-check id="check_repeat" question="B commits 60 next. A still holds the transaction that first read 100. What does A read?" %}
A still reads 100. Another connection's later commit does not advance A's snapshot. {% cite ref="src_isolation" /%}
{% /self-check %}

<!-- vs:id h_changes -->
## Change the transaction boundary, and the answer changes

<!-- vs:id variants -->
| Change to the experiment | Observed result | What it distinguishes |
|---|---|---|
| A runs BEGIN, but delays its first SELECT until after B commits 80. | A reads 80. | BEGIN alone did not fix the view. |
| A first reads 100; B commits 80; A then tries UPDATE. | SQLITE_BUSY_SNAPSHOT | A cannot write from this obsolete view. |
| A runs BEGIN IMMEDIATE before B tries UPDATE. | B gets SQLITE_BUSY; C can still read 100. | A reserves the writer position early; readers can continue. |

<!-- vs:id experiment_evidence -->
These results come from fresh databases on SQLite 3.53.0, with a zero busy timeout. {% cite ref="src_probe" /%}

<!-- vs:id deferred -->
Plain BEGIN defaults to DEFERRED. The first database access determines whether it starts a read or write transaction. {% cite ref="src_transaction" /%}

<!-- vs:id stale -->
**Waiting does not refresh an obsolete snapshot.** End that transaction and restart the read–decide–write operation. SQLite rejects the stale write to prevent divergent histories. {% cite ref="src_isolation" /%}

<!-- vs:id immediate -->
BEGIN IMMEDIATE obtains the write transaction before the initial read. It can itself fail if another writer is active. This trades early writer contention for avoiding a later stale-snapshot upgrade. {% cite ref="src_transaction" /%}

{% self-check id="check_boundary" question="A runs BEGIN but reads nothing. B commits 60. A then makes its first SELECT. Is the result 100 or 60?" %}
It is 60 in this scenario. BEGIN DEFERRED does not start database access; the first SELECT starts the read transaction. {% cite ref="src_transaction" /%}
{% /self-check %}

{% detail id="scope_limits" label="What this experiment does not establish" summary="Visibility is separate from durability and latency." %}
This probe does not simulate crashes, measure throughput, or exercise shared-cache read_uncommitted behavior. It uses disposable local files and explicit transaction control. Its observations establish these schedules on the recorded SQLite version.
{% /detail %}

{% source id="src_wal" kind="web" title="SQLite WAL: how it works and concurrency" url="https://www.sqlite.org/wal.html" capturedAt="2026-09-29T03:22:37Z" availability="link-only" /%}
{% source id="src_isolation" kind="web" title="SQLite isolation between connections" url="https://www.sqlite.org/isolation.html" capturedAt="2026-09-29T03:22:37Z" availability="link-only" /%}
{% source id="src_transaction" kind="web" title="SQLite deferred and immediate transactions" url="https://www.sqlite.org/lang_transaction.html" capturedAt="2026-09-29T03:22:37Z" availability="link-only" /%}
