# Spike 2: ELK determinism and timing

**Result:** the §7.5 byte-determinism promise holds on Linux. The §2.3 layout bound needs a change: a 200-node graph takes 3–4 s, so node/edge caps, not a wall-clock timeout, must bound layout cost. Revision 1.4 applies both.

**Environment:** Linux, AMD Ryzen 9 9950X (16 cores / 32 threads), 188 GiB RAM. Node v25.9.0 and a local Node v24.21.0 in `node24/` (gitignored, 189 MB). elkjs 0.12.0 pinned exactly.

**Reproduce:** `npm ci`, then `node run.mjs once handoff` (other modes in `run.mjs`; per-process results in `proc-*.jsonl`).

**Setup:** fixed text-metrics table (5 width classes, nominal 14 px, fallback 14.0) with label wrapping. Fixtures: `handoff` (Appendix A), `g40` (40 nodes, 80 edges, 4 groups), `g200` (200/400, 8 groups). Options: `layered`, `randomSeed=1`, `INCLUDE_CHILDREN`, `considerModelOrder=NODES_AND_EDGES`, `thoroughness=7`. Coordinates rounded to 3 decimals; canonical JSON with code-point key order.

| Claim | Verdict | Evidence |
|---|---|---|
| §7.5 byte-identical layout | Confirmed (Linux) | One digest per fixture across 20 in-process runs, 10 processes, a worker, and Node 24/25: `a3af5a6b2c23`, `99dcb88fa455`, `38dc4b8d960c`. The author reran two fixtures in a fresh process and got the same digests. |
| Constant seed needed | Confirmed | Seeds 1 and 2 differ. |
| Authored order | Confirmed; wording clarified | Shuffled input gave 3–5 layouts; a fixed order is stable. |
| Text-metrics table | Workable | No system fonts needed; the real table must come from the reader's font. |
| Build < 3 s for 8 × 40/80 | Confirmed for layout (desktop) | 8 cold layouts 0.93–0.98 s; with process start and import 1.74–1.86 s; warm 0.75 s. Full pipeline and laptop not measured. |
| 200/400 cap with timeout | Spec change | 3.0–3.9 s per layout; `SEPARATE_CHILDREN` gives 0.06 s, still deterministic. |
| Nondeterminism sources | Avoidable | `Math.random` only in a non-`layered` routine; `Date.now` only with `measureExecutionTime`. V8 math gave identical results on Node 24 and 25. |

**Not tested:** macOS, Windows, a slower machine, layout readability, real font metrics.
