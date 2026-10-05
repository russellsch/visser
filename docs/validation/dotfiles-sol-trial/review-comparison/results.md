# Paired prompt review probe

The goal is to improve Visser's reusable authoring process. The dotfiles document
is a test fixture, not a delivery target.

Two fresh native `gpt-6-sol` agents at medium effort received the same frozen
draft, source checkout, optional screenshots, and review task. Each received one
guide. Neither received previous findings, expected answers, revised output,
the other guide, or the identity of its guide version. Both performed source-aware
R1–R4 review; neither performed a source-blind cold read.

- Draft SHA-256: `50987012808b4fff91862f0f420b99cfa20b9f3610acb06fbda5280c91967045`.
- Guide A SHA-256: `084d730c16b98e24a3b82a94515c7924812dfebf006fa1f3bfcccb3e4fa40cda`.
- Guide B SHA-256: `29e22ffd21ba6a5aaffd583596e17380d30d66c7d42386ca4413bee4d977abb7`.
- A uses the previous guide. B uses the amended guide.
- Source commit: `abc1e037fdd7d223e796a0703caa23034a9e21dd`.

Compare findings against source evidence and the existing DF01–DF08 observations.
Reject unsupported criticism and distinguish missing facts from useful optional
detail. Finding count alone is not quality. New valid findings remain relevant.

This is one paired probe, not a statistical benchmark or a generation comparison.
It can reveal review behavior; it cannot establish reliable first-draft improvement.

## Results

| Observation | Guide A | Guide B | Pressure test |
| --- | --- | --- | --- |
| Font override omitted from worked example | Found | Found | Valid: `install.sh:16-18` honors an explicit flag. |
| Target-home and elevation conditions unclear | Found | Missed | Valid: `common.sh:90-123`; reject A's narrow "passwordless sudo" wording. The predicate is `sudo -n true`. |
| Existing target replacement unstated | Missed | Found | Valid: `zsh/install.sh:141-160`; qualify regular files/symlinks versus real directories. |
| Additional configuration paths unnamed | Found | Missed | Supported by `zsh/install.sh:147-160`; task-relevant completeness, not a requirement to enumerate every file in all explanations. |
| Link verification scope ambiguous | Missed | Found | `update.sh:124-147` checks link type and destination string, not destination existence. Useful clarification; the original wording is ambiguous, not an explicit false existence guarantee. |
| Repeated framing before drawing | Missed | Found | Original 320 px screenshot supports this; preserve the distinct question and legend. |
| Snapshot detail repeats introduction | Missed | Found | Valid R4 concern: `d_revision` repeats the visible commit boundary. Remove redundant depth rather than inventing content. |

Neither pass reported the earlier macOS package-rule overgeneralization or the
complete update/version-scope issue. Both missed some supported findings.
Neither performed interactions or a full mobile-flow check. Both read the source
without executing its scripts and inspected the two permitted screenshots.

The revised guide elicited relevant new checks in this probe. The previous guide
also found gaps that the revised guide missed. Retain the focused additions, but
do not claim one pass guarantees coverage or that more findings prove superiority.

The reusable process now separates an independent source-aware review for
consequential claims from a source-blind comprehension review. These evaluate
different failure modes. The former can share R2–R4 work; it does not require
one agent per stage. This orchestration paragraph was added after the probe and
was not tested by this paired comparison.

A separate bounded Sol review of that paragraph found no material issue. It
confirmed the consequential-claim scope, shared R1–R4 reviewer option, and clear
separation between source verification and reader comprehension. That wording
review does not establish the workflow's effectiveness on future explanations.

No additional fixture corrections were made from these results. The fixture
preserves useful failures for later evaluations instead of becoming the product.
