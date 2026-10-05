<!-- visser-text/1 docId=322ecf26-1a5f-43ef-80b9-43e712cb9835 -->

<!-- vs:target overview -->
# Why SQLite readers can disagree after a commit

<!-- vs:target src_probe -->
**Source: Observed SQLite schedules, version 3.53.0**

kind: file
language: text
file: probe-output.txt
excerptSha256: 3ef1882a5f39260158898ebf167413d5b698f1c14f9f93452814243209cb3761
capturedAt: 2026-09-29T03:23:11Z

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

<!-- vs:target intro -->
A commit does not refresh an existing SQLite read transaction. This example changes one counter from **100** to **80**. Connection A still reads **100**, while connection C reads **80**. [cite: src_probe]

<!-- vs:target scope -->
Scope: WAL mode, separate connections, and no shared cache. You need basic SQL. This page explains visibility, not crash durability or query performance.

<!-- vs:target def_begin -->
**Definition: BEGIN**

BEGIN opens an explicit transaction. Plain BEGIN uses DEFERRED behavior; the first database access starts its read or write transaction. [cite: src_transaction]

<!-- vs:target def_wal -->
**Definition: WAL**

The write-ahead log (WAL) holds changed database pages before a checkpoint copies them into the database file. [cite: src_wal]

<!-- vs:target def_snapshot -->
**Definition: snapshot**

A snapshot is the fixed database view that one read transaction uses. [cite: src_isolation]

<!-- vs:target def_mark -->
**Definition: end mark**

An end mark bounds the committed WAL content that a reader can use. It stays fixed throughout that read transaction. [cite: src_wal]

<!-- vs:target read_paths -->
**graph (architecture): A reader chooses a page version**

Question: How can a reader keep its view while a writer commits?

The arrows show access paths. A read does not always come from the database file.

<!-- vs:target reader_a -->
Node Reader A (process)
Its end mark limits visible changes. [cite: src_wal]
Evidence: SQLite WAL: how it works and concurrency (src_wal)

<!-- vs:target writer_b -->
Node Writer B (process)
In this experiment, B commits while A keeps its transaction open. [cite: src_probe]
Evidence: Observed SQLite schedules, version 3.53.0 (src_probe)

<!-- vs:target wal_file -->
Node WAL (storage)
One WAL can contain changes from multiple commits. [cite: src_wal]
Evidence: SQLite WAL: how it works and concurrency (src_wal)

<!-- vs:target database_file -->
Node Database file (storage)
This file supplies pages with no suitable version in the WAL. [cite: src_wal]
Evidence: SQLite WAL: how it works and concurrency (src_wal)

<!-- vs:target write_wal -->
Writer B --[data; appends changed pages]--> WAL
A commit record makes the transaction complete in the WAL. [cite: src_wal]
Evidence: SQLite WAL: how it works and concurrency (src_wal)

<!-- vs:target read_wal -->
Reader A --[call; finds latest visible page]--> WAL
Choose the newest version within this reader's end mark, not the newest version overall. [cite: src_wal]
Evidence: SQLite WAL: how it works and concurrency (src_wal)

<!-- vs:target read_database -->
Reader A --[call; reads fallback page]--> Database file
Use this path if the WAL has no suitable version. [cite: src_wal]
Evidence: SQLite WAL: how it works and concurrency (src_wal)

<!-- vs:target checkpoint -->
WAL --[data; checkpoint copies safe pages]--> Database file
Checkpoint progress must preserve active readers. Commit and checkpoint are distinct operations. [cite: src_wal]
Evidence: SQLite WAL: how it works and concurrency (src_wal)

<!-- vs:target path_walk -->
Steps. Reading order, not execution order.

<!-- vs:target walk_visibility -->
1. Visibility has a boundary
targets: Reader A (reader_a), finds latest visible page (read_wal), reads fallback page (read_database)
The same files can supply different views to readers with different end marks. [cite: src_wal]

<!-- vs:target walk_commit -->
2. Commit does not refresh
targets: Writer B (writer_b), appends changed pages (write_wal), WAL (wal_file)
In the experiment below, B finishes its commit before A repeats its read. A still returns 100. [cite: src_probe]

<!-- vs:target invariant -->
**The fixed boundary belongs to the read transaction, not each SELECT.** A reader needs a new transaction to obtain a fresh snapshot. [cite: src_isolation]

<!-- vs:target two_answers -->
**trace: One commit leaves two valid answers**

Question: Which value does each connection read after B commits 80?

Ordering, not duration.

Both reads in the middle follow B's commit. Their relative order does not change the answers; the probe tested both orders.

<!-- vs:target actor_a -->
Actor Reader A (entity: reader_a)

<!-- vs:target actor_b -->
Actor Writer B (entity: writer_b)

<!-- vs:target actor_c -->
Actor New reader C

<!-- vs:target a_first -->
Event First SELECT: 100 (return; actor: Reader A)
after: (none)
A executes BEGIN and then SELECT. It keeps this transaction open. [cite: src_probe]
Evidence: Observed SQLite schedules, version 3.53.0 (src_probe)

<!-- vs:target b_commit -->
Event Commits 80 (state-change; actor: Writer B)
after: First SELECT: 100 (a_first)
B executes BEGIN IMMEDIATE, UPDATE, and COMMIT on its separate connection. [cite: src_probe]
Evidence: Observed SQLite schedules, version 3.53.0 (src_probe)

<!-- vs:target a_old -->
Event Same transaction: 100 (return; actor: Reader A)
after: Commits 80 (b_commit)
A repeats SELECT without ending its transaction. [cite: src_probe]
Evidence: Observed SQLite schedules, version 3.53.0 (src_probe)

<!-- vs:target c_new -->
Event New reader: 80 (return; actor: New reader C)
after: Commits 80 (b_commit)
C has no active transaction before this SELECT. [cite: src_probe]
Evidence: Observed SQLite schedules, version 3.53.0 (src_probe)

<!-- vs:target a_end -->
Event Ends old transaction (state-change; actor: Reader A)
after: Same transaction: 100 (a_old), New reader: 80 (c_new)
A uses ROLLBACK to release its old view. It has no successful writes to undo. [cite: src_probe]
Evidence: Observed SQLite schedules, version 3.53.0 (src_probe)

<!-- vs:target a_fresh -->
Event New transaction: 80 (return; actor: Reader A)
after: Ends old transaction (a_end)
A executes BEGIN and SELECT again. [cite: src_probe]
Evidence: Observed SQLite schedules, version 3.53.0 (src_probe)

<!-- vs:target trace_answer -->
Follow A's three reads: **100 → 100 → 80**. B's commit succeeds. A changes its answer only after it ends the old transaction. [cite: src_probe]

<!-- vs:target check_repeat -->
Self-check: B commits 60 next. A still holds the transaction that first read 100. What does A read?

Answer: A still reads 100. Another connection's later commit does not advance A's snapshot. [cite: src_isolation]

<!-- vs:target h_changes -->
## Change the transaction boundary, and the answer changes

<!-- vs:target variants -->
| Change to the experiment | Observed result | What it distinguishes |
|---|---|---|
| A runs BEGIN, but delays its first SELECT until after B commits 80. | A reads 80. | BEGIN alone did not fix the view. |
| A first reads 100; B commits 80; A then tries UPDATE. | SQLITE_BUSY_SNAPSHOT | A cannot write from this obsolete view. |
| A runs BEGIN IMMEDIATE before B tries UPDATE. | B gets SQLITE_BUSY; C can still read 100. | A reserves the writer position early; readers can continue. |

<!-- vs:target experiment_evidence -->
These results come from fresh databases on SQLite 3.53.0, with a zero busy timeout. [cite: src_probe]

<!-- vs:target deferred -->
Plain BEGIN defaults to DEFERRED. The first database access determines whether it starts a read or write transaction. [cite: src_transaction]

<!-- vs:target stale -->
**Waiting does not refresh an obsolete snapshot.** End that transaction and restart the read–decide–write operation. SQLite rejects the stale write to prevent divergent histories. [cite: src_isolation]

<!-- vs:target immediate -->
BEGIN IMMEDIATE obtains the write transaction before the initial read. It can itself fail if another writer is active. This trades early writer contention for avoiding a later stale-snapshot upgrade. [cite: src_transaction]

<!-- vs:target check_boundary -->
Self-check: A runs BEGIN but reads nothing. B commits 60. A then makes its first SELECT. Is the result 100 or 60?

Answer: It is 60 in this scenario. BEGIN DEFERRED does not start database access; the first SELECT starts the read transaction. [cite: src_transaction]

<!-- vs:target scope_limits -->
**detail: What this experiment does not establish**

This probe does not simulate crashes, measure throughput, or exercise shared-cache read_uncommitted behavior. It uses disposable local files and explicit transaction control. Its observations establish these schedules on the recorded SQLite version.

<!-- vs:target src_transaction -->
**Source: SQLite deferred and immediate transactions**

kind: web
availability: link-only
url: https://www.sqlite.org/lang_transaction.html
capturedAt: 2026-09-29T03:22:37Z

<!-- vs:target src_wal -->
**Source: SQLite WAL: how it works and concurrency**

kind: web
availability: link-only
url: https://www.sqlite.org/wal.html
capturedAt: 2026-09-29T03:22:37Z

<!-- vs:target src_isolation -->
**Source: SQLite isolation between connections**

kind: web
availability: link-only
url: https://www.sqlite.org/isolation.html
capturedAt: 2026-09-29T03:22:37Z
