# Human validation gates

These gates stay **open** until a person runs them and records the result (§21.1, §18.8). An agent never marks them passed.

| Gate | Checklist | Device / OS / browser | Reviewer | Date | Result |
|---|---|---|---|---|---|
| Comprehension trial (§18.7) | Protocol and materials: [comprehension-trial.md](comprehension-trial.md) and [trial/](trial/). Prepared, not run; results go in [trial/results.md](trial/results.md) | | | | open |
| Real touch device | Open an edge detail from the map and from the list; copy a reference; use the fallback copy text; return to the same place | | | | open |
| Manual keyboard review | Reach every edge through the relationship list with Tab only; open and close the inspector; focus returns to the origin | | | | open |
| First visual baseline | Approve the pinned-container screenshots of each page state | | | | open |
| macOS determinism | Build the same source on macOS and compare output digests with Linux | | | | open |

## Math rendering acceptance (M13, C04–C05)

Review entry point: [math acceptance materials and exercises](math-rendering/human-review.md).

**Closed by the requesting user on 2026-10-09.** After reviewing the screenshots
in this conversation, the user instructed: “Then close out human acceptance, it
looks good enough to me.” The shown appearance is accepted; remaining manual
exercises are waived for this delivery. No device/OS/browser was provided and no
hands-on or assistive-technology pass is inferred. This exception applies only to
the math gates below; unrelated gates above remain open. Baseline identity is in
[completion.md](math-rendering/completion.md); the copy-icon delta has separate evidence.

| Gate | Checklist | Device / OS / browser | Reviewer | Date | Result |
|---|---|---|---|---|---|
| Mathematical meaning | Independently check every case in [correctness-corpus.json](math-rendering/correctness-corpus.json), including precedence, grouping, signs, scripts, matrices and integral differentials, against the intended interpretation. | Not supplied; screenshot review in chat | Requesting user | 2026-10-09 | Waived; not performed/reported |
| Math visual baseline | Review prose and native Visser label geometry, baseline alignment, folded callouts, narrow layout, light/dark modes and zoom; approve first screenshots with candidate identity. Mermaid is deferred by the scope amendment in the plan. | Not supplied; screenshot review in chat | Requesting user | 2026-10-09 | Shown screenshots accepted; unshown states waived |
| Math print baseline | Inspect narrow-paper PDF before and after conversion and with JavaScript disabled; every formula and number has readable complete source, including long unbreakable input. | Not supplied; screenshot review in chat | Requesting user | 2026-10-09 | Waived; not performed/reported |
| Math keyboard and copy | Navigate references, locally scroll long display math, open/close inspectors and viewers, copy LaTeX and selected-text references; confirm focus return and source fidelity. | Not supplied; screenshot review in chat | Requesting user | 2026-10-09 | Waived; not performed/reported |
| Math assistive reading | Use a screen reader to read inline/display math, equation numbers/references and native figure fallback; verify no duplicate announcements or inaccessible source. Record assistive software and version. | Not supplied; screenshot review in chat | Requesting user | 2026-10-09 | Waived; not performed/reported |
| Math author/reader exercises | Run V01–V08 from [the plan](../plans/math-rendering.md), using guide instructions and the relocated one-file export. Record outcomes separately for each exercise. | Not supplied; screenshot review in chat | Requesting user | 2026-10-09 | Waived; not performed/reported |
