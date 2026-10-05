# Author notes (outside the reader document)

## Scope and source

- Reader profile comes from the trial request: an experienced engineer who knows queues and network failures, but is new to JetStream.
- Pinned source: `nats-io/nats-server` v2.12.0, commit `fc6ec648d806652d282d2f0edb6cb9f22c895572`, at `/tmp/visser-nats-evaluation`.
- Scenario assumptions: one `LimitsPolicy` stream; one durable pull consumer with `AckExplicit`; workers A and B; A completes an external effect; A's ACK fails before the server receives it; the message remains stored; B submits or has a valid pull request. The trace is illustrative, not an observed incident.
- Excluded: clustering, replication, source execution, tests, and an exhaustive JetStream reference.

## Outline and expected answers

| Section | Reader question | Intended answer | Form | Approximate main-path words |
|---|---|---|---|---:|
| Boundary | Who knows completion? | The consumer tracks pending ACKs, while the external system holds the effect. | Small architecture | 140 |
| Lost ACK | How can B get the same message? | Timeout can queue redelivery; a valid pull can take it if it remains stored and no ACK clears pending state first. | Ordinal trace | 170 |
| Timing | Which control alters retry timing? | AckWait and BackOff govern timeout; a received NAK uses its own immediate or delayed path. | Table and prose | 120 |
| Limit | Does MaxDeliver erase the message? | It caps consumer delivery attempts; LimitsPolicy retention is separate. | Prose | 100 |

The key distinction is server knowledge versus external completion. A countercase is a late ACK before B receives the message; the consumer can clear queued redelivery. Another countercase is stream removal before redelivery; the consumer cannot load the message.

## Self-review R1–R4

- R1 meaning: checked the pending-entry creation, ACK removal, timeout queue, redelivery priority, pull recipient, NAK path, max-delivery check, and LimitsPolicy ACK guard against captured excerpts. Corrected the claim that expiry guarantees B a copy: it also needs stored data, pull demand, and no timely late ACK.
- R2 terms: defined JetStream, ACK, and NAK. Changed the ACK definition so it describes the protocol message without claiming that processing occurred.
- R3 figure structure: the architecture shows responsibility without chronology. The trace uses explicit `after` prerequisites and states its hypothetical inputs. The source check passed. Rendered visual inspection remains for the parent.
- R4 depth: the sole authored edge body explains why the lost ACK matters; the sole authored event body explains pending state. They add mechanism beyond the labels. Interaction checks remain for the parent.
- `visser check --review` reports `ok: 55 targets`, `review: 0 prompts`. It also warns that this author notes file is undeclared and is not read into the document.
- `visser build` succeeded with the development toolkit. No R5 cold read or independent source-aware review was performed by this author.

## Source limits

The captured NATS code supports server behavior. It does not establish whether the external work is idempotent, what B's business logic does, or a precise time at which B receives a message. The text treats those as application choices or scenario conditions.
