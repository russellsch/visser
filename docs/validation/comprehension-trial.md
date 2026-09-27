# Comprehension trial protocol (§18.7)

**Status: not run.** This protocol and its materials are ready. No participant has done the trial. Until a person runs it and records the results in [`trial/results.md`](trial/results.md), nobody can claim that Visser improves comprehension (§17.8, §21.1). This is a human validation gate. An agent never marks it passed.

## 1. Purpose and hypothesis

The trial is a small formative study for release learning. It does not measure a population-level effect.

- **Hypothesis H1:** with a Visser page, experienced engineers answer mechanism, prediction, and evidence questions correctly more often than with a conventional prose document that contains the same facts.
- **Hypothesis H2:** with a Visser page, the time to a correct answer is not longer than with the baseline.
- **Question Q1 (no hypothesis):** where do readers fail to find a fact, and is that fact hidden in inspection? §18.7 says: if readers miss an essential fact because it is hidden in inspection, move it into the main path.

## 2. Design

The design is **within-subject** with **counterbalanced topic and format**.

- Each participant reads two topics: topic A in one format and topic B in the other format.
- The four orders are: (A-Visser, B-baseline), (B-baseline, A-Visser), (A-baseline, B-Visser), (B-Visser, A-baseline). Assign them in rotation, so each order has the same number of participants.

**Why within-subject:** differences between engineers are large, and a small sample cannot absorb them in a between-subject design. Each participant is their own control. The two topics are different, so a participant never reads the same facts twice. Counterbalancing spreads the practice effect and the topic difficulty across both formats.

## 3. Participants

- Experienced software engineers (at least 3 years of professional work). They must know threads, locks, caches, and database connection pools at a general level.
- They must not know the two example topics in detail. Screen with one question per topic: "Have you studied the code or incident write-up for this example before?" Exclude a participant who says yes.
- Target: 8 to 12 participants (2 or 3 per order). Report the actual number. A sample of this size can show large problems and trends only.
- Exclude people who worked on Visser.

## 4. Materials

| Topic | Visser page | Baseline |
|---|---|---|
| A: bounded queue (`examples/bounded-queue`) | The built page of the example | A conventional prose document with the same facts |
| B: cache stampede (`examples/cache-stampede`) | The built page of the example | A conventional prose document with the same facts |

**Baseline rules:**

1. A person who did not write the Visser page writes each baseline as good conventional prose. Headings, code blocks, and one static diagram are allowed. The inspection panel, stable references, and inline definitions are not.
2. The baseline must contain every fact in the fact-parity checklist ([`trial/fact-parity.md`](trial/fact-parity.md)), and no extra fact. A second person checks each checklist item in both formats and signs the checklist before the trial starts.
3. Do not use `visser export --format markdown` output as the baseline. It keeps the Visser structure, so it is not a conventional document.

**Setup:** the same laptop, browser, and screen size for every session. Serve the Visser pages with `visser serve` or from an export. Open the baseline in the same browser as rendered Markdown.

## 5. Tasks

Each topic has four tasks that follow the four §18.7 task types. The task sheets are in [`trial/tasks-topic-a.md`](trial/tasks-topic-a.md) and [`trial/tasks-topic-b.md`](trial/tasks-topic-b.md).

1. Reconstruct one execution and identify a boundary condition.
2. Predict the effect of a relevant design change.
3. Explain an important relationship and locate its evidence.
4. Identify a limitation or uncertainty.

A fifth task applies only to the Visser condition and is reported separately. The participant copies a reference to one target and writes a one-line change request with it. This task checks that the reference workflow is usable. It is not part of the comparison.

## 6. Measures

- **Correctness:** score each answer with the prewritten rubric ([`trial/rubric.md`](trial/rubric.md)): 0, 1, or 2 points. Two scorers score each answer without knowing the format. Report their agreement (percentage of equal scores). They resolve differences by discussion, and the report records each discussion.
- **Time to a correct answer:** time from the moment the participant reads the task until the participant states a final answer that scores 2. If the answer scores less than 2, record the time and mark it "not correct".
- **Self-reported effort:** after each task, one question: "How much effort did this task take?" on a scale of 1 (very little) to 7 (very much).
- **Confidence:** after each task: "How sure are you of your answer?" on a scale of 1 to 7.
- **Navigation failures:** the observer records each time the participant looks for a fact in the wrong place for more than 30 seconds, and notes where the fact was (main text, inspection panel, definition, source).

## 7. Procedure

1. Consent ([`trial/consent.md`](trial/consent.md)) and the screening questions.
2. A 3-minute introduction to the Visser page controls on a third example (`examples/deadline-retry`), which is not part of the tasks. Show the baseline format too.
3. Topic 1: 5 minutes of free reading, then the four tasks with the document open. There is a limit of 6 minutes for each task.
4. A 2-minute break.
5. Topic 2: the same steps in the other format.
6. The reference task (Visser condition only).
7. A short interview: "Where did you look first? What was hard to find?"

The observer does not help, except to repeat the task text.

## 8. Analysis plan

- For each format: the mean correctness score per task type, the proportion of correct answers (score 2), the median time to a correct answer, the median effort, and the median confidence.
- The paired difference per participant (Visser minus baseline) for correctness and time, with each value shown. With 8 to 12 participants, report a Wilcoxon signed-rank test as descriptive only, and do not use it to support a general claim.
- The list of navigation failures, grouped by the place of the fact. Each fact that a reader missed because it was in inspection is a finding to act on (§18.7).
- The limitations: sample size, one laboratory setup, two topics only, and illustrative (not real) source material.

## 9. Ethics and data

- Participation is voluntary. A participant can stop at any time with no reason and no consequence.
- Record no names in the results. Use participant codes (P01, P02, and so on).
- Do not record the screen or audio unless the participant agrees separately on the consent form.
- Keep raw notes for the analysis only, and delete them after the report is final.
- The trial measures the documents, not the participants. Do not report individual scores in a way that identifies a person.

## 10. Rules for reporting

- Record the results in [`trial/results.md`](trial/results.md), with the date, the number of participants, the version of the toolkit (its digest), and the exact pages used.
- Report every task, including tasks where the baseline was better.
- A result of this trial supports a statement about these participants, topics, and pages only.
- Until the results file has data, the gate in [`human-gates.md`](human-gates.md) stays **open**.
