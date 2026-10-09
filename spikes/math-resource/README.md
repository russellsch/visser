# W0 math resource and worker probe

Status: **experiment, not approved renderer policy**. The scripts use `../math-rendering/engine.mjs` after its `linebreaks.inline=false` correction and pinned MathJax 4.1.3 dependencies. No production files or dependency manifests are changed here. Results were obtained with Node 24.21.0 and Chromium 153.0.8010.12 on 2026-10-05. The exact browser worker bundle in the final browser results is SHA-256 `b57bd8fae6e21c87950644971c0c56e4898afb512941f58d22892b650d7cce8a`.

Run from repository root with the Node 24 binary:

```sh
/opt/codex-desktop/resources/cua_node/bin/node spikes/math-resource/node-probe.mjs
/opt/codex-desktop/resources/cua_node/bin/node spikes/math-resource/node-batch-probe.mjs
WORKER_SCHEME=data /opt/codex-desktop/resources/cua_node/bin/node spikes/math-resource/browser-probe.mjs
WORKER_SCHEME=blob /opt/codex-desktop/resources/cua_node/bin/node spikes/math-resource/browser-probe.mjs
```

Each single-expression Node case runs in a separate child process with `--max-old-space-size=128`, a 5 s wall timeout, `SIGKILL`, and a 4 MiB captured-output cap. The distinct-1,000 Node batch uses the same heap and deadline with a 16 MiB captured-output cap. The browser probe creates one temporary `index.html` containing all executable bytes, opens it by `file://`, intercepts HTTP(S) attempts, tests a classic worker, and removes the temporary file. It writes summaries to `results/node.json`, `results/node-batch.json`, `results/browser-data.json`, and `results/browser-blob.json`. The probe's `innerHTML` is **only** a trusted W0 rendering fixture; production insertion requires the plan's SVG validation and ID rewriting.

## Observed behavior

| Input | TeX bytes | Conversion ms | SVG bytes | Approx. element count |
| --- | ---: | ---: | ---: | ---: |
| `x_i` | 3 | 10.2 | 2,203 | 9 |
| fraction | 11 | 8.4 | 2,173 | 10 |
| matrix | 34 | 10.4 | 4,002 | 19 |
| 100 repeated fractions in one expression | 1,199 | 24.6 | 218,645 | 802 |
| 100 distinct fractions in one expression | 2,381 | 54.1 | 646,641 | 2,284 |
| wide sequence | 1,023 | 41.1 | 726,677 | 2,050 |
| wide sequence | 2,047 | 74.7 | 1,454,422 | 4,098 |
| wide sequence | 4,095 | 121.8 | 2,910,096 | 8,194 |
| 128 nested roots | 897 | 23.1 | 179,410 | 1,015 |

These are single warm-looking observations from fresh processes, not a latency distribution. Process startup took about 80–203 ms including conversion. The 4,095-byte wide case used about 63 MiB V8 heap after conversion, the largest sampled heap value. The unknown-command case failed in 5.4 ms. The simple output-to-source expansion is large: a 1,023-byte wide input made 727 kB SVG, so input bytes alone cannot provide the resource bound. Element counts in the Node table come from a tag-pattern count, not parsed browser DOM; production should count validated SVG nodes.

In the browser, 100 occurrences of five repeating formulas converted in 16.6 ms worker time, inserted in 1.9 ms, and expanded to 322,740 markup bytes / 1,540 DOM nodes. One hundred distinct formulas converted in 118.8 ms worker time, inserted in 3.8 ms, and expanded to 645,154 bytes / 2,582 nodes. The 1,000-occurrence runs repeated three times each:

| Browser workload | Unique TeX | Worker conversion ms, three runs | DOM insertion ms, three runs | Expanded UTF-8 bytes | Expanded DOM nodes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 occurrences of five repeating formulas | 5 | 15.4, 16.5, 15.0 | 18.2, 16.0, 16.0 | 3,227,400 | 15,400 |
| 1,000 distinct fractions | 1,000 | 845.7, 821.1, 847.1 | 40.3, 31.5, 33.6 | 7,772,435 | 27,783 |

All six runs completed within the 10 s probe timeout; there was no fallback trigger or CSP violation. Round-trip worker startup and messaging added about 17–28 ms to the measured worker conversion; the browser's 1,000-distinct total, including insertion, was about 0.88–0.91 s. The Node 128 MiB / 5 s child also completed all three 1,000-distinct runs: conversion 1,464–1,477 ms, total process 1,566–1,603 ms, 7,772,435 expanded UTF-8 bytes, 7,928,208 stdout JSON bytes, and 26,783 SVG opening tags. Sampled post-conversion V8 heap usage ranged from 87.6 to 119.2 MB, so the 128 MiB cap passed with limited headroom in one run. Browser DOM nodes include 1,000 occurrence wrappers; Node tag counts do not. These are warm local measurements on one Chromium build and one host; memory and slower-device variability remain unmeasured.

The classic **data:** worker is a failed delivery route for this bundle. A minimal data worker and a 2,066,756-byte data URL started under `file://` with `worker-src data:`; a 2,133,424-byte control and the 1,812,353-byte MathJax bundle encoded as a 2.4 MB data URL failed before script startup. This brackets a browser URL-size failure around 2 MiB for this configuration; it does not prove a cross-browser limit. The worker failure left the readable source visible. The single HTML containing that data URL measured 3,222,780 bytes.

The classic **blob:** worker succeeded from one relocated `file://` HTML file with `script-src data:; worker-src blob:; connect-src 'none'`. It rendered a fraction, produced one SVG, attempted no HTTP(S) request, and had zero page errors or CSP violations. The file had no sibling dependency and measured 2,446,520 bytes. A worker sent an explicit `started` message, began 1,000 bounded matrix conversions, and was terminated after 50 ms; it sent no completion message, the source fallback remained visible, and the canceled result left no DOM nodes. `terminate()` therefore interrupts active synchronous conversion in this browser configuration.

The generated MathJax SVG caused inline-style CSP violations under `style-src 'none'`. The clean blob-worker result uses page-scoped `style-src 'unsafe-inline'` while `script-src` remains data-only and `connect-src` remains none. This is an observed constraint of this candidate output, not approval to relax production CSP. W0 should either accept and document this generated-style exception, or sanitize/rewrite generated styling into a fixed stylesheet and repeat the visual/offline test.

## Provisional limits for plan-owner decision

The following numbers are **recommendations**, not accepted product limits. They retain the sampled 100-expression cases while rejecting the wide expansions above; the independent correctness corpus and slower-device runs may justify changes.

| Limit candidate | Proposed value | Measurement basis and remaining check |
| --- | ---: | --- |
| TeX input per expression | 2 KiB UTF-8 | Allows the sampled 1,199-byte repeated expression; output caps still reject wide 1,023/2,047-byte cases. Check authoring corpus and below/at/above boundaries. |
| Validated SVG per expression | 256 KiB and 2,048 element nodes | Allows 128 nested roots (179 kB/1,015); rejects sampled wide 1,023-byte input (727 kB/2,050) and distinct-100 compound expression (647 kB/2,284). Enforce both before embedding. |
| Expanded output per document | 8 MiB and 50,000 element nodes | Actual 1,000-distinct batch produced 7,772,435 UTF-8 bytes and 27,783 wrapped DOM nodes. Only 616,173 bytes remain under 8 MiB; count all actual/derived/alternate occurrences, not unique conversion keys, and include viewer copies if they clone. |
| Occurrences per document | 1,000 | Actual 1,000-case browser runs passed three times for both repeated and distinct workloads, with 3.23 MB / 15.4k and 7.77 MB / 27.8k respectively. This is a sampled workload, not proof that every set of 1,000 formulas fits the byte/node caps. |
| Node validation worker | 128 MiB V8 heap; 5 s per document; kill on timeout | Actual 1,000-distinct batch passed in 1.46–1.48 s conversion but sampled heap reached 119.2 MB. Treat 128 MiB as an experimental hard stop with narrow observed headroom, not a validated production-safe setting. The 7.93 MB JSON IPC payload fit the probe's 16 MiB buffer. Production should avoid retaining the full batch and IPC JSON twice, or evaluate a larger heap with below/at/above stress tests. |
| Browser conversion worker | One cancellable worker, 2 s watchdog per bounded batch | Actual 1,000 distinct conversions took 0.82–0.85 s worker time; cancellation succeeded during active conversion. The 2 s candidate needs slower-device and exact-boundary testing. A timed-out batch retains source and must not publish partial SVG. |

Production must validate command/environment policy and rendered SVG before insertion, disallow external references, namespace fragment IDs per occurrence, and enforce the aggregate expanded budget before publishing the HTML. The browser should independently refuse output beyond the published budget and leave source visible. Both engines and all transitive bytes must be pinned by the release. The plan owner must choose the final limits and CSP route after repeat runs, correctness corpus, accessibility/print checks, and below/at/above boundary tests.
