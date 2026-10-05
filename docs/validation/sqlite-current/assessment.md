# SQLite exercise with the current Visser toolkit

Status: completed authoring and browser exercise; proposed product changes only.
Date: 28 September 2026 in America/Toronto (29 September UTC).

Visser explains the tested SQLite behavior accurately. Its desktop trace makes the example easy to follow. The next opportunity is to show the state that makes each event produce its result. The current page names that state in prose, but does not draw its persistence or visibility boundary.

## Baseline and artifacts

- Repository HEAD: `5729a84001f6b2877b93ebc388538cbd0464ee83`.
- Fresh `npm run build` toolkit: `157fd8b1ddded6022e52d2b9697d71d7bdf3ae98ad8e34ebe81de3635b76c275`.
- The development toolkit's authoring skill governed this exercise. The toolkit was not installed or published.
- [Final explanation source](../../explanations/sqlite-wal/index.md).
- [Standalone final page](sqlite-wal-final.html), 228 KiB by filesystem size reporting; [final Markdown projection](reader-final.md).
- Document ID: `322ecf26-1a5f-43ef-80b9-43e712cb9835`.
- Final source revision: `a13cd43d117821fb15e80c965e18179c8598e03c930ef0af7576fda914f73c89`.
- Final build ID: `9c7c175a4fe37017898d40284fd109097d74b8873b630f29d3d1cab3d5931a0b`.
- SQLite 3.53.0; [reproduction script](probe.py) and [observed output](probe-output.txt).
- Browser reproduction scripts: [rendering and accessibility](inspect.mjs), [interactions](interactions.mjs). Each accepts the local preview URL as its argument.

Existing untracked plans and reviews were preserved. No application implementation changed. The first-pass page and screenshots remain as evidence where named below.

## What the exercise established

The page targets engineers who know basic SQL. It explains separate connections in WAL mode, without shared cache. It does not explain crash durability or query optimization.

The probe creates disposable databases and asserts each result. It checks both orders of A's and C's reads after B commits. It also checks a delayed first read, a stale write attempt, and an early write transaction. All assertions passed. The probe removes its temporary databases.

Official documentation supports the general mechanism: [WAL concurrency](https://www.sqlite.org/wal.html), [isolation](https://www.sqlite.org/isolation.html), and [transaction modes](https://www.sqlite.org/lang_transaction.html). Those citations are link-only. The page embeds its experimental output, not a complete offline copy of the documentation.

The initial check produced two editorial prompts. A BEGIN definition and active wording resolved them. The final check reports 44 targets and zero review prompts. This establishes structural validity, not comprehension.

A separate reader agent read only the first-pass Markdown projection. It answered six questions correctly, with supporting parts:

1. Why A returns 100 while C returns 80 after B commits.
2. Why delaying A's first SELECT until after the commit yields 80.
3. Why waiting does not repair A's obsolete snapshot, and why the whole read–decide–write operation must restart.
4. What BEGIN IMMEDIATE trades away, and why it can itself fail.
5. Why an old reader need not read exclusively from the database file.
6. Why commit and checkpoint are distinct.

The reviewer noted that changed data may require a changed application decision after a retry. The document deliberately leaves application-specific decisions outside scope. The final revision only adds two endpoints to a walkthrough's highlight targets; its teaching claims are unchanged. The cold read is an agent review of full text, including details. It does not establish human learning speed or visual comprehension.

## Browser observations

Fresh Chromium runs at 1440 and 390 pixels produced no page errors, no page-level horizontal overflow, and no axe violations in the selected WCAG A/AA rules. See [browser-results.json](browser-results.json). Real touch, screen readers, print, dark mode, and no-JavaScript behavior were not tested in this exercise.

The walkthrough advances and dims other parts. The edge inspector opens explanatory text. Self-check answers open. The mobile map and its detail dialog open and close. See [interaction-results.json](interaction-results.json).

### F01 — Desktop diagrams work at this scale

Both drawings fit without scrolling in the default desktop view. The architecture SVG is 806 × 184 pixels. The trace SVG is 674 × 329 pixels. The trace puts the two post-commit results on the same row. This communicates their contrast clearly.

Evidence: [desktop trace](x-two_answers-1440.png), [desktop map](x-read_paths-1440.png).

### F02 — The decisive persistent state is only verbal

The architecture shows access paths. The trace shows events and returned values. Neither draws A's fixed end mark, eligible versions, or the lifetime of A's snapshot. The reader must connect those concepts from the prose and inspector.

This is an expressive limitation for this task, not a failed layout. An annotated custom illustration could fill the gap today. It would require the author to design and maintain an additional representation.

### F03 — Mobile actor grouping separates the contrast

The narrow trace shows A's order layers 1, 3, 4, and 5 before B's layer 2, then C's layer 3. It preserves dependencies in text, but requires mental reconstruction of the interleaving. The alternate map is 674 pixels wide inside a 348-pixel viewport. A and C cannot be compared at once there.

Evidence: [mobile cards](x-two_answers-390.png), [mobile alternate map](trace-map-390.png). This follows current design; it is not a claim that events were lost.

### F04 — Walkthrough selection requires manual relationship context

The first authored step named A and its two outgoing edges. The step dimmed their destination nodes. Adding WAL and Database file to the targets repaired the document. A semantic selection helper could prevent this authoring mistake.

Evidence: [before the author fix](walkthrough-before-author-fix.png), [after the fix](walkthrough-1440.png). Current marking logic is in `packages/runtime/src/marks.ts`.

### F05 — Figure presentation takes more space than the drawing

The final architecture figure occupies about 698 pixels in height, while its SVG is 184 pixels high. The remainder includes the question, interpretation, legend, controls, walkthrough, and spacing. These elements are useful individually, but can dominate a small diagram. The active walkthrough repeats its title in the status and explanation. Generated Parts links add another list.

This measurement does not imply that all surrounding explanation should disappear. Test a compact mode that keeps the reason for the diagram visible.

### F06 — Inspector context is mostly preserved in this example

The desktop inspector reduces the map viewport from 806 to 800 pixels. The drawing still largely fits, though a scroll hint appears. This is much less severe than the concern raised from older, wider examples. On mobile, the inspector fills the screen and hides the diagram until dismissal.

Evidence: [desktop inspector](inspector-1440.png), [mobile inspector](inspector-390.png). This run does not justify making a desktop inspector redesign the highest priority.

## Concrete proposals

These are candidate changes, not approved requirements or implemented features. Each has a proposed acceptance check.

### P01 — Draw persistent state alongside trace events

Add optional labelled spans to a trace lane. A span connects start and end events and states what remains true between them. Add small authored value badges at relevant events. For SQLite, show `A snapshot: 100` from the first SELECT to ROLLBACK. Show B's commit inside that span. Show C's fresh view at 80.

Rationale: the reader sees why A's result remains unchanged. Event labels alone show what happened.

Implementation surface: trace schema and validation, `packages/core/src/compiler/svg.ts`, trace rendering in `compile.ts`, and text projection. Spans refer to existing stable event IDs. Their geometry denotes event scope, not elapsed time. Print and Markdown state the same invariant explicitly.

Acceptance: with prose hidden, a reader can identify when A's view becomes fixed, when it ends, and whether B's commit changes it. Test the reader's prediction for a third commit during the span.

### P02 — Compare authored scenarios while keeping the diagram stable

Add a small declarative scenario layer that reuses entity positions. Authors provide changed assumptions, event differences, and outcomes. The reader chooses between finite authored cases. A changed fact receives emphasis; unchanged context stays in place.

For this example, compare first SELECT before versus after B's commit. Then compare DEFERRED with IMMEDIATE. State which variable changes in each pair. Keep scenario assumptions visible. This need not run SQLite or accept arbitrary document JavaScript.

Implementation surface: source schema, compiler scenario projection, runtime state, and export fallback. Start with two finite trace variants. Defer a general simulator until examples establish the need.

Acceptance: a reader can name the changed condition and predict its outcome before revealing it. The static fallback shows both cases and their difference.

### P03 — Preserve partial order in the mobile default

Offer a trace view grouped by order layer, with actor badges. Place A's 100 and C's 80 together after B's commit. Keep actor grouping as an alternate view. Do not invent an order between independent events in the same layer.

Implementation surface: `Renderer.trace` in `packages/core/src/compiler/compile.ts` and narrow styles in `packages/runtime/src/reader.css`.

Acceptance: at 390 pixels, readers can compare the two results without horizontal scrolling or searching past A's later events. Dependency relationships remain accessible.

### P04 — Make walkthrough highlighting preserve context

For a selected edge, include its endpoints as context automatically, with an author override. Distinguish the primary target from supporting context instead of dimming every unselected part equally. Provide a compact walkthrough mode with one title and optional Parts links.

Implementation surface: `packages/runtime/src/marks.ts`, `components.ts`, and `reader.css`. The compiler already emits relationship endpoints.

Acceptance: a step that targets a relationship keeps that relationship and its endpoints readable. An explicit override still supports lessons about one isolated element.

### P05 — Add prediction feedback that exposes the mistaken rule

Extend self-checks with optional authored choices and choice-specific explanations. An answer of 80 to A's repeated read should explain the mistaken assumption: every SELECT gets a fresh snapshot. Link the correction to the span that stays fixed.

Implementation surface: self-check schema, compiler, runtime, and static fallback. Do not require telemetry or a generated score.

Acceptance: each wrong choice explains a misconception and points to relevant evidence or diagram state. Test a new variation after feedback, not repetition of the same question.

### P06 — Review explanatory coverage, not only wording

Allow authors to map each `mustUnderstand` outcome to its main-path explanation, visual relationship or state, and transfer question. Report absent links as prompts. A correct structure still does not prove truth or comprehension.

For this exercise, such a report should expose that the snapshot boundary has a definition and prose but no explicit drawn representation. It should not demand diagrams for every fact.

Implementation surface: optional reader-goal metadata and `packages/core/src/review/`. Keep this advisory and lightweight.

Acceptance: the report identifies missing coverage without treating a populated field as proof that readers understand.

## Authoring improvements available now

Begin with the surprising observation, then explain the mechanism. Use one concrete value throughout. Prefer an adjacent contrast over a second distant explanation. Keep the essential invariant in the main path. Include a prediction that uses a changed value or schedule.

The existing catalogue can do much of this today. Better templates can improve outcomes before any schema change. Avoid adding a domain map merely because three new terms appear; add it only when their relationships are the lesson.

The current exercise also shows that broad advice about adding colour or interactivity is insufficient. Both already exist. Highlighting boxes cannot by itself show a variable staying fixed across events.

## Suggested order and evaluation

Start with P03 and P04 as bounded improvements to existing components. Develop P01 as the first new expressive capability. Use the SQLite page to test it before expanding it across the catalogue. P02 and P05 then add controlled experimentation and misconception feedback. P06 helps authors detect gaps.

Compare the current page with the revised page using the same facts and questions. Ask unfamiliar readers to reconstruct the sequence, predict an unseen schedule, and explain the invariant without looking back. Record time to a correct answer, errors, and navigation failures. Report speed only alongside correctness. Do not claim an improvement from prettier screenshots, zero linter warnings, or this agent cold read.
