# Synthetic figure review answer key

This key applies only to [packet.md](packet.md). All facts are fictional and synthetic. The packet contains snippet-only native figures, so missing document frontmatter and source tags are outside this evaluation. Credit grounded semantic corrections; do not require identical wording or IDs.

## Case S — State

1. `t_activate` permits activation with one approval. The facts require **two distinct approvers** and an open activation window. An acceptable correction changes the guard to both conditions, or splits the approvals and window into accurate state transitions without weakening either requirement.
2. `t_timeout` invents automatic rejection after 30 minutes. The facts say Pending has no automatic expiry. Remove that transition. Preserve `t_reject`, because explicit operator rejection is supported.

**Control to preserve:** `t_retire` correctly models an operator action that stops new token issuance, and `s_rejected` is terminal for this request. Do not “fix” retirement by claiming existing tokens are immediately revoked.

**Evidence limit:** The source states activation prerequisites but does not fully
specify which event attempts activation when approvals arrive after the window
opens. A reviewer may flag that gap. Do not reward an invented scheduler or
operator command as a source-established correction.

## Case T — Trace

1. `e_fraud` depends on `e_tax`, imposing an order the facts do not require. Both should depend on `e_store`; neither check should be a prerequisite of the other.
2. `e_decide` names only `e_tax` as a prerequisite. The decision requires both `e_tax` and `e_fraud` results. Use `after=["e_tax", "e_fraud"]`.
3. `e_reply` depends on `e_decide`, incorrectly making the client wait for screening. It should depend on `e_store` and have no dependency on the checks or decision.

**Control to preserve:** The Held and Ready branches correctly express mutually exclusive outcomes and their conditions. Both outcome events correctly follow evaluation. The `202 Accepted` label is correct; it acknowledges stored submission, not a completed decision.

## Case C — Compare

1. `x_spool_host` says the local spool keeps accepting after host loss. The facts support only survival of a **process restart on the same host**. Correct the host-loss cell to unavailable or unable to publish after that host is lost. A separate process-restart criterion is also acceptable if it does not obscure host loss.
2. `x_spool_latency` puts the 14 ms measurement under the 500 messages/s criterion. That measurement was taken at 100 messages/s, and no spool p95 at 500 messages/s was supplied. Remove the cell so the pair displays Not provided, or explicitly separate the two loads into comparable criteria. Do not relabel 14 ms as an estimate at 500 messages/s.
3. `x_queue_pressure` claims producers are never throttled. The facts say the queue returns 429 above 600 messages/s. State that condition and consequence.

**Control to preserve:** `x_queue_host` accurately limits host-loss availability to the tested region. `x_spool_pressure` accurately describes producer waiting at the 80% disk threshold. `x_queue_latency` correctly gives a measured 23 ms p95 at 500 messages/s for 1 KiB messages.
