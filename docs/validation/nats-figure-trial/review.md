# NATS rendered figure trial

## Objective and frozen source

Test whether selective figure-specialist review improves a real Visser explanation.
Improve shared prompts or rendering only where evidence supports a reusable change.
The NATS explanation is an evaluation artifact, not a publication or implementation task.

Source: `nats-io/nats-server`, tag `v2.12.0`, commit
`fc6ec648d806652d282d2f0edb6cb9f22c895572`, cloned read-only to
`/tmp/visser-nats-evaluation`. No NATS code or source scripts are executed.

Scope: one LimitsPolicy stream, one durable pull consumer using AckExplicit,
two workers, and an illustrative lost acknowledgement after external processing.
Exclude clustering, replication, and claims of exactly-once external side effects.

## Protocol

1. A Sol author creates a source-grounded draft and performs normal self-review.
   A separate Sol source reviewer derives expected answers without seeing it.
2. Render the draft at desktop and narrow widths. Ordinary source-aware review
   produces version A, with supported corrections and appropriate rendered checks.
3. Fork A. A fresh figure specialist reviews the central figure and its context,
   including current renders, and produces version B if corrections are supported.
4. Compare source correctness, rendered relationships, readable labels, useful
   depth, and return navigation. Fresh readers receive neutral tasks without
   source notes, expected answers, or version identities.
5. Pressure-test findings before making shared prompt or Visser changes.

This evaluates the incremental value and cost of an additional specialist stage.
It does not isolate specialization from the effect of an additional reviewer.
One example and model readers do not establish statistical or human-comprehension
benefits. Record unperformed checks and keep intermediate artifacts immutable.

## Results

Version A is the ordinary source-aware review of the initial Sol draft. Version B
is A plus a separate Sol specialist pass on the central trace. Both used the same
renderer during the comparison. A and B were CLI-forked into
`docs/explanations/nats-trial-a` and `docs/explanations/nats-trial-b`, because the
fork command confines destinations to configured document roots.

| Observation | A | B | Assessment |
| --- | --- | --- | --- |
| Core source-backed reader questions | Answered | Answered | No observed comprehension gain on these tasks. |
| Failed ACK arrow reaches consumer lane | Yes | No | B better distinguishes loss from receipt; A reader flagged the arrow. |
| B's pull appears to require retry queueing first | Yes | No | B removes that dependency and joins pull with queueing before redelivery. |
| Invocation distinct from completed external effect | One call event | Separate call and completion | B preserves the scenario's completion assumption more clearly. |
| Crossing lines | Present | More demanding | B reader reported interlaced lines; parent observed a message route crossing another event box. |
| Initial 320 px view shows complete relationship | No | No | Pan/zoom is intentional and tested, but a static first view cannot establish mobile comprehension. |
| Authored explanation depth | None after ordinary review | None added | No evidence of a specialist gain in useful clickable depth. |

Reader one received B; reader two received A. Neither saw sources, expected
answers, author rationale, other versions, or review records. Both inspected four
screenshots and a main-path extract. Both distinguished server knowledge, expiry,
delivery limits, retention, NAK, and late-ACK conditions. They did not test live
interactions. Their responses also distinguished the example's schedule from the
general behavior, though both found some visual ordering ambiguous.

The parent checked findings against the independent source oracle. The failure
arrow and request-order issues are supported reader confusions, not proof that
the original prose asserted false behavior. B's explicit completion is an
illustrative scenario fact, not a new guarantee from NATS. Both variants retain
an order from lost ACK to deadline for the selected scenario; neither figure is
an exhaustive model of all executions. The ownership map's read-direction arrow
also remains a potential ambiguity outside the selected specialist scope.

**Conclusion:** selective review produced useful semantic figure corrections,
but did not establish an overall visual or comprehension win. Keep it optional
for named uncertainties. Do not enable automatic per-figure agents. The added
cost here was one source-aware specialist pass and one fresh reader per variant;
token billing was not measured. Neither variant is treated as a polished NATS
publication. Preserve their remaining failures as evaluation evidence.

The trial produced reusable changes: trace connection keys, coherent actor header
geometry, an initially visible mobile gesture hint, and a catalogue check for
failed-message geometry. These are more defensible than a claim that one extra
agent reliably improves every figure.

## Shared renderer correction during the trial

The user identified unexplained solid versus dashed trace connections. The
existing legend described failure and wait boxes but omitted connection meanings.
A separate Sol worker added conditional, static keys for prerequisite arrows,
message-destination arrows, and actor lifelines. Destination arrows do not prove
receipt. The worker also corrected actor header width to match widened lanes.

These fixes apply to both A and B and do not count as specialist-review gains.
An independent Sol code review found no material defect; the parent inspected
desktop and 320 px viewer renders. The parent narrowed the destination wording
from a universal "receipt unconfirmed" to a limitation on what the arrow proves.

The first capture falsely clipped desktop figures because their drawing viewports
extend beyond the prose-column bounds. The harness now captures the drawing
viewport and separate section context. Its mobile list click initially occurred
inside the viewer's 500 ms post-gesture guard; waiting beyond that guard resolved
the failure. Neither harness problem warranted a runtime change.

The first successful draft and A probes each covered desktop, 390 px, 320 px,
dark mode, and forced colors without page errors or horizontal document overflow.
The 320 px probe tested first-tap entry without selection, CDP touch pan/pinch,
and return with the article viewBox restored. This is browser emulation, not a
physical-device test. Final artifacts must be checked again after corrections.

## Final pressure test

The key now says "event order" rather than "required order". A solid connection
orders events in the shown trace; it does not independently establish causation
or a universal system prerequisite. The existing gesture hint moves before the
figure, because both reader screenshots otherwise hid it below the initial view.
These follow-ups happened after the blind reads and are not counted as measured
reader improvements. An independent Sol review found no material issue in the
final wording, hint placement, or generic failed-message guidance.

The parent reran B validation through the user shim after the specialist checked
it directly with the repository CLI. B has advisory warnings for the opening's
length, the descriptive lost-ACK label, and a long sentence. These remain visible
evaluation limitations; no warning was suppressed or treated as a structural error.

## Final verification

- 117 tests passed across trace compilation, encoding, rendering, viewer behavior,
  skill packaging, and format-guide suites. Typecheck passed.
- Final A and B render probes each passed five contexts: 1440 px, 390 px, 320 px,
  dark mode, and forced colors. No page errors or horizontal document overflow.
- At 320 px, both figures opened by touch without selection, accepted emulated
  pan/pinch, and restored the article viewBox on return. The gesture hint was
  within the initial viewport. Final variants contain no authored explanation
  bodies, so these probes do not establish added detail value or detail interaction.
- Parent inspected the final desktop key and mobile hint. The independent code
  review and tests cover wide single-slot and multi-slot actor header alignment.
- Explicit changed-document checks and `git diff --check` passed. The NATS
  checkout stayed clean. No NATS code ran; no commit, push, or publication occurred.
- `final-manifest.json` records final product source and variant hashes. The
  `readers/` captures preserve exactly what the blind readers saw before the
  final wording and hint corrections. Final captures are in `render-a-release/`
  and `render-b-release/`; “release” here is a local output label, not publication.
