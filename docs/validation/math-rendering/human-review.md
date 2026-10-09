# Math acceptance review

Status: **closed by user acceptance on 2026-10-09**. The user reviewed the desktop,
numbered-equation/native-label, 320 px mobile, overflow, no-JS fallback and first
print-page screenshots displayed in this conversation and said: “Then close out
human acceptance, it looks good enough to me.” Reviewer: requesting user; device,
OS and browser not supplied (screenshots viewed in chat).

This approves the shown appearance and waives the remaining manual gate exercises
for this delivery. It does not assert that a physical-device, screen-reader,
independent notation or authoring trial was performed. The requested copy-icon
follow-up is documented in [completion.md](completion.md).

The original checklist below is retained for optional future validation, not as
an open release blocker. Historical artifact identities belong to the baseline;
see `reports/math/copy-icon-closeout.json` for the subsequent UI delta.

## Current delivery

The requested copy-icon update is available in the
[updated standalone](../../../reports/math/copy-icon-standalone.html),
[desktop screenshot](../../../reports/math/copy-icon-1100.png) and
[mobile screenshot](../../../reports/math/copy-icon-320.png).

## Baseline review materials

- [Standalone HTML](../../../reports/math/standalone.html): copy this one file
  into an empty directory and open it. No sibling assets should be needed.
- [Artifact identity and automated delivery results](../../../reports/math/standalone.json):
  record `toolkitSha256`, `standaloneSha256`, `corpusSha256`, browser and OS.
- [Expected mathematical readings](correctness-corpus.json): compare every
  MC01–MC14 expression against its reading and structure, not just appearance.
- [Desktop rendering](../../../reports/math/rendered-1440.png),
  [narrow rendering](../../../reports/math/rendered-320.png),
  [no-JS source](../../../reports/math/source-320.png), and
  [worker-failure source](../../../reports/math/worker-failure-320.png).
- [Rendered-page print](../../../reports/math/rendered-print.pdf),
  [no-JS print](../../../reports/math/source-print.pdf), and
  [worker-failure print](../../../reports/math/worker-failure-print.pdf).

These materials cover recorded views only. They do not establish approval of
light/dark modes, zoom, folded callouts or every native geometry state. Exercise
those states on the candidate and retain additional screenshots where needed.

## Record acceptance

Record reviewer, date, device/OS/browser, artifact hashes, observations and
pass/fail in [human-gates.md](../human-gates.md). Include assistive software and
version for screen-reader results. Record defects rather than approving a
category with unresolved omissions.

1. Check all corpus readings and visual grouping, scripts, signs, matrices,
   alignment and integral differentials. Confirm prose baseline and native
   labels remain legible at narrow width, zoom and in both themes.
2. On a real mobile device, drag an overflowing equation left and right. Check
   ordinary vertical reading still works. Automated Chromium touch checks are
   supporting evidence; they are not a physical-device result.
3. Use the keyboard to follow equation references, scroll wide math, open and
   close details/viewers, and copy LaTeX and references. Verify focus returns
   correctly and copied source is exact.
4. Inspect each print mode for complete readable source and equation numbers,
   including long expressions and native figure text lists.
5. Use a screen reader for inline/display math, numbers/references and figure
   fallback. Check intelligibility, reachable source and duplicate announcements.
6. Perform V01–V08 from [the plan](../../plans/math-rendering.md), recording each
   separately. The plan's scope amendment excludes the Mermaid label in V01;
   the Markdown and native Visser authoring exercise remains required. Record
   authoring friction and responsiveness during typesetting as well as outputs.

| Exercise | Observation / evidence | Result |
| --- | --- | --- |
| V01 author | Not reported; waived by user acceptance, 2026-10-09 | waived |
| V02 revise | Not reported; waived by user acceptance, 2026-10-09 | waived |
| V03 distribute | Not reported; waived by user acceptance, 2026-10-09 | waived |
| V04 degrade | Not reported; waived by user acceptance, 2026-10-09 | waived |
| V05 navigate | Not reported; waived by user acceptance, 2026-10-09 | waived |
| V06 reuse | Not reported; waived by user acceptance, 2026-10-09 | waived |
| V07 print | Not reported; waived by user acceptance, 2026-10-09 | waived |
| V08 reject | Not reported; waived by user acceptance, 2026-10-09 | waived |
