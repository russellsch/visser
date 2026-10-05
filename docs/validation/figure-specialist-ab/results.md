# Figure specialist guidance: paired evaluation

## Scope and method

Improve reusable Visser guidance, not a particular publication. The change adds
short type-specific checks to architecture, state, trace, cause, and comparison
catalogues, plus one selective specialist-review brief. Runtime behavior is unchanged.

Baseline repository HEAD: `5729a84001f6b2877b93ebc388538cbd0464ee83`.
The worktree contains earlier changes; baseline and revised prompt copies freeze
the inputs for this comparison. The authoring core and syntax rules stay unchanged.

A separate Sol agent creates synthetic state, trace, and comparison fixtures from
the baseline syntax references, without access to the new guidance. Each fixture
has source facts, reader context, plausible semantic defects, and valid features.
Its answer key stays outside the candidate review packets.

Before dispatch, the parent noted one evidence limit in the key: the state source
does not fully specify the activation trigger. The packet stayed unchanged.
Reviewers may flag that gap, but an invented trigger does not count as a correction.
`manifest.json` records the frozen prompt and fixture file hashes.

Two fresh Sol agents at medium effort receive the same packet and bounded task.
A receives the baseline catalogue and review process. B receives the revised
catalogue and specialist brief. Both propose minimal corrections; neither sees
the answer key or the other's result. No candidate may delegate.

Assess supported defects found and corrected, unsupported findings, introduced
errors, and preservation of correct features. Record missing checks. More findings
or longer prose alone do not count as improvement. A separate evaluator compares
anonymized outputs against the source and answer key, without seeing their guides.
The parent pressure-tests the evaluator's conclusions against the same evidence.

This tests the combined guidance package, not the isolated effect of any sentence
or of delegation itself: both arms use subagents. It is one paired test on seeded
examples, not evidence of statistical significance, visual quality, human
comprehension, or autonomous first-draft generation quality. No renders or live
interaction checks are supplied for these snippet-only cases.

## Results

| Check | A: baseline guidance | B: specialist guidance |
| --- | --- | --- |
| Seeded state defects corrected | 2 of 2 | 2 of 2 |
| Seeded trace defects corrected | 3 of 3 | 3 of 3 |
| Seeded comparison defects corrected | 3 of 3 | 3 of 3 |
| Supported control features preserved | Yes | Yes |
| Acknowledgement scope kept within explicit source evidence | Yes | No: prose also guarantees enqueueing |
| Render or interaction quality established | No | No |

For blind adjudication, `blind/first.md` copies B and `blind/second.md` copies A.
The evaluator found A narrowly better supported. The parent checked this against
the packet: storage precedes acknowledgement, but enqueueing's order is unspecified.
B's stronger acknowledgement claim is unsupported; A's split preserves that gap.
This does not prove the real system enqueues before or after storage or reply.

Both reviewers added a true retirement qualification as a material finding.
The original stop-issuance action was correct. Treat this as useful clarification,
not a ninth seeded defect or proof that every possible caveat belongs in a figure.

**Conclusion: no demonstrated improvement from the new guidance in this probe.**
Both arms corrected all seeded errors, so these examples cannot distinguish
their basic defect coverage. The additional evidence-limit issue favors A.
This result does not establish that the new guidance causes regressions; one
model sample per arm cannot separate prompt effects from generation variation.

Retain the compact catalogue checks as explicit, inspectable guidance, without
claiming a measured quality gain. Keep specialist delegation optional and tied to
a named uncertainty. Do not add automatic per-figure agents or a new skill layer.
Architecture and cause guidance were not exercised by these cases.

## Post-evaluation corrections

The live trace guide now checks which actions in a bundled event each downstream
event requires. It recommends splitting when a dependency would imply unsupported
order. This transfers to acknowledgements, transactions, batched work, and other
compound events without embedding the test's names or expected answers.

The live specialist brief now asks for a named uncertainty before delegation and
allows direct resolution by the author. R3 says to consider selective review.
The frozen `revised/` copies remain the exact tested guidance; these final edits
are subsequent corrections, not A/B-proven improvements.

The evaluator received the final wording for a separate bounded review after
completing blind adjudication. Final wording review is recorded below.

The Sol reviewer found no material issue in the final brief, five catalogue
sections, or R3 integration. It checked optional delegation, source limits,
syntax references, and transfer beyond the synthetic cases. It did not claim
an experimental result for the post-evaluation wording.

## Implementation checks

- Existing skill, format-guide, and prose-review suites: 107 tests passed.
- Packaged specialist brief matches the source file.
- Seven changed prompt references passed doccheck with no errors or warnings.
- Evaluation documents passed structural doccheck; the source-facts paragraph
  in the comparison fixture has one length warning. Preserve this frozen input.
- `git diff --check` passed. No runtime code, commits, or publication changed.
