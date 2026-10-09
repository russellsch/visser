# Math rendering completion audit

Status: **accepted by the user on 2026-10-09; human acceptance closed with explicit waivers**.
The retained scope is Markdown, native Visser visuals, equation numbering and
references, readable fallback, and standalone one-file export. Remaining Mermaid
work is explicitly deferred by [the plan](../../plans/math-rendering.md).
The user reviewed the screenshots and instructed: “Then close out human acceptance, it looks good enough to me.” The copy-icon follow-up is recorded below.

## Verified baseline candidate

Source-input SHA-256: `2580f37cc7e747b5096481a7e2b0bc222913626d22d93523faa3b22c9f568378`.
Toolkit SHA-256: `18a17f594560318d528b5728798b904cd8f4b4a85ed3fc0af1024e05076f5a22`.
Renderer fingerprint: `78700ed4a42bdac5bc0de3225ca15916f79b714751dce56ea067a6ab8cdcc236`.
The source digest includes uncommitted implementation, tests, configuration and
packaged guides; it is not a commit. No commit or publication was performed.

[Final candidate manifest](../../../reports/math/final-candidate-manifest.json)
binds the reports and artifact hashes. The audit checked all 66
packaged files, exact standalone/corpus bytes, toolkit identity, renderer policy,
packaged-guide equality, and unchanged independently reviewed production files.

## Gate dispositions

| Gate | Disposition | Evidence / remaining action |
| --- | --- | --- |
| C01 feasibility and decisions | Passed for retained scope | [Decisions](decisions.md), W0 prototypes, final fixed limits and passing artifact budgets. Human corpus meaning is C04, not inferred from engine acceptance. |
| C02 requirements and coverage | Automated evidence passed | M01–M15 tagged checks and exact field ledger: 914 direct + one derived proven obligation; five Mermaid viewer-source obligations explicitly deferred; zero unproven retained obligations. |
| C03 required checks | Passed | 2,518 unit/integration tests in 283 files; 1,324 retained browser passes, 407 applicability skips; typecheck, installed standalone, offline, budgets, clean-machine and contracts all exit 0. |
| C04 notation and baselines | **Accepted by user; remaining exercises waived** | User approved the screenshots shown in this conversation on 2026-10-09. Independent corpus interpretation, unshown states and full PDF inspection were not separately reported. |
| C05 author/reader and accessibility | **Closed by user waiver** | User requested closure after screenshot review. Hands-on V01–V08, physical-device, keyboard and screen-reader checks were not reported as performed; no manual pass is claimed. |
| C06 safe failure and offline | Automated evidence passed | Worker/process/output boundaries, malformed/unsafe inputs, unchanged-output rejection, no-JS/load/worker failure, and network-denied installed delivery. Final report hashes are in the manifest. |
| C07 independent implementation review | Passed for reviewed candidate | [Independent review](../../reviews/math-rendering-implementation.md): material ink-containment and test gaps corrected and rechecked; final production hashes match the candidate. |
| C08 documentation | Passed | Authoring syntax/diagnostics audited, stale Mermaid promises removed, architecture corrected, guide fixtures pass, packaged guide bytes match source. |

W0 decisions and W1–W4 implementation are verified. W5 remaining Mermaid work is
deferred. W6 automated release verification is complete; its human acceptance
gates C04–C05 are closed by the user’s approval and waiver.

## Executed checks and limits

The serial [check record](../../../reports/math/final-release-checks.json) records
commands, exit codes and durations. Unit tests ran with `--maxWorkers=2`; this
avoided a previously observed limit failure under heavy parallel test load.
The production 5-second/128-MiB validator limits were not increased. The prior
failure is preserved in `reports/math/ink-full-unit.log`, and the isolated
validation suite passed before the complete bounded-concurrency rerun.

The retained browser selection excludes exactly four deferred Mermaid titles
(20 project instances). All other configured tests remain selected. The
[browser audit](../../../reports/math/release-browser-audit.json) proves exact
execution-inventory equality, no unexpected/flaky results, and explicit reasons
for all 407 skips. This is a retained-scope pass, not an unqualified all-Mermaid pass.

The final field mapping and reports are [evidence.json](evidence.json),
`reports/math/complete-fields-full-suite-junit.xml` and
`reports/math/complete-fields-playwright-junit.xml`. Deferred entries remain in
the 920-obligation inventory and are never counted as proven.

## Human acceptance disposition

See [human-review.md](human-review.md) and [human-gates.md](../human-gates.md) for the approval and waiver record.
The user’s acceptance is based on the displayed screenshots, not a claim that automated checks establish human usability. No physical iPhone/Android or screen-reader
acceptance has been claimed. No process remains running from this verification.

## Copy-icon closeout delta

The user requested an icon in place of repeated “Copy LaTeX” text. The runtime now
uses a compact copy icon, a check on success and an exclamation on failure. It keeps
an accessible name, tooltip, keyboard focus indication and live status feedback.
The clipboard payload and math renderer are unchanged.

The baseline full-suite reports above remain evidence for the pre-icon candidate;
they are not relabeled as full-suite results for this delta. Focused verification
and updated artifact identities are in `reports/math/copy-icon-closeout.json`.

Delta verification passed: 29 runtime/copy/viewer unit tests, six desktop/mobile
browser checks (inline baseline, keyboard overflow and bidirectional touch),
typecheck, toolkit build and standalone export. The rebuilt one-file artifact
also passed desktop/mobile keyboard copy and denied-clipboard feedback checks
with zero network attempts. Agent visual inspection confirmed the icon in the
320 px screenshot; the user's preceding acceptance is recorded separately.

[Updated standalone](../../../reports/math/copy-icon-standalone.html) ·
[Desktop screenshot](../../../reports/math/copy-icon-1100.png) ·
[Mobile screenshot](../../../reports/math/copy-icon-320.png).

Current source-input SHA-256:
`61fcfb6c2aa8010f1dc99a8b8c40c13c1ed37be2288d4392a0e4b846e06aa907`.
This closes the retained math implementation under the user acceptance amendment.
