# Figure review

These are source-aware text findings for the supplied snippets. Rendered visual clarity, mobile layout, and interaction behavior were not checked because no renders or running document were supplied. The snippets are intentionally incomplete documents; syntax, frontmatter, and source-capture checks are outside this review.

## Case S — Key rotation lifecycle

| Target | Likely wrong interpretation | Supporting fact | Smallest correction |
| --- | --- | --- | --- |
| `t_activate` | One approval is enough, or opening the window itself activates the key even if the approvals have not arrived. | Activation is permitted only after **two distinct approvers** have recorded approval **and** the scheduled activation window is open. | Put both prerequisites in the guard and use a neutral activation event. State both conditions in the visible figure text. |
| `t_timeout` | A Pending request is automatically rejected after 30 minutes. | Pending has no automatic expiry; it can wait until an operator acts. | Remove the timeout transition and state that Pending does not expire automatically. |
| `t_retire` and figure text | Retirement invalidates tokens that were issued under the key. | Retirement stops new issuance; already issued tokens remain valid until their own expiry. | Keep the stop-issuance action and state the existing-token qualification in visible text. |

The rejection transition is correct and remains an explicit operator action. The diagram describes permitted transitions; it does not claim every Pending request eventually ends.

```markdown
{% graph id="rotation_lifecycle" mode="state" title="Key rotation request" question="Which events end Pending, and when may activation occur?" %}
Pending ends only when an operator rejects the request or activation occurs after two distinct approvers have approved and the scheduled activation window is open. Pending has no automatic expiry. Retiring an Active key stops new token issuance; tokens already issued remain valid until their own expiry.

{% state id="s_draft" label="Draft" initial=true /%}
{% state id="s_pending" label="Pending" /%}
{% state id="s_active" label="Active" /%}
{% state id="s_rejected" label="Rejected" terminal=true /%}
{% state id="s_retired" label="Retired" terminal=true /%}

{% transition id="t_submit" from="s_draft" to="s_pending" event="operator submits" label="submit" /%}
{% transition id="t_activate" from="s_pending" to="s_active" event="activation" label="activate: two distinct approvals and window open" guard="two distinct approvers have recorded approval and scheduled activation window is open" /%}
{% transition id="t_reject" from="s_pending" to="s_rejected" event="operator rejects" label="reject" /%}
{% transition id="t_retire" from="s_active" to="s_retired" event="operator retires key" label="retire" action="stop issuing new tokens" /%}
{% /graph %}
```

## Case T — Invoice screening

| Target | Likely wrong interpretation | Supporting fact | Smallest correction |
| --- | --- | --- | --- |
| `e_reply` after `e_decide` | A 202 reply confirms that screening and the decision are complete. | The API replies after storing the invoice; it does not wait for either check or the decision. | Make `e_reply` depend on `e_store` only, and say what the reply establishes. |
| `e_fraud` after `e_tax` | Fraud must finish after tax. | Tax and fraud workers may finish in either order. | Give each result its own enqueue prerequisite without an order between results. |
| `e_decide` after `e_tax` only | The decision may use the tax result alone. | The decision worker evaluates only after **both** results arrive. | Make `e_decide` depend on both `e_tax` and `e_fraud`. |
| `e_store` combined store/enqueue event | The reply necessarily waits for both checks to be enqueued. | The facts establish that the reply follows storage, but do not specify its order relative to enqueueing. | Split storage and enqueueing so the reply depends only on storage and check results depend on enqueueing. Do not impose an unsupported order between storage and enqueueing. |

The Held and Ready branches correctly encode mutually exclusive outcomes and their conditions. There is no supported order between the reply and either result; a check may complete before or after the reply.

```markdown
{% trace id="invoice_screening" title="Invoice screening" question="What precedes the reply and the decision?" %}
The 202 reply confirms the invoice was stored; it does not confirm either check or a decision. The API also enqueues both checks. Tax and fraud results may arrive in either order. The decision waits for both. The reply has no stated order relative to enqueueing or the check results.

{% actor id="a_api" label="Invoice API" /%}
{% actor id="a_tax" label="Tax worker" /%}
{% actor id="a_fraud" label="Fraud worker" /%}
{% actor id="a_decision" label="Decision worker" /%}

{% event id="e_store" actor="a_api" label="Stores invoice" kind="state-change" /%}
{% event id="e_enqueue" actor="a_api" label="Enqueues tax and fraud checks" kind="send" /%}
{% event id="e_reply" actor="a_api" label="Replies 202 Accepted" kind="return" after=["e_store"] /%}
{% event id="e_tax" actor="a_tax" label="Tax result arrives" kind="return" after=["e_enqueue"] /%}
{% event id="e_fraud" actor="a_fraud" label="Fraud result arrives" kind="return" after=["e_enqueue"] /%}
{% event id="e_decide" actor="a_decision" label="Evaluates both results" kind="compute" after=["e_tax", "e_fraud"] /%}

{% branch id="b_held" label="Held" condition="either result fails" exclusiveWith=["b_ready"] /%}
{% branch id="b_ready" label="Ready" condition="both results pass" exclusiveWith=["b_held"] /%}
{% event id="e_held" actor="a_decision" label="Marks invoice Held" kind="state-change" after=["e_decide"] branch="b_held" /%}
{% event id="e_ready" actor="a_decision" label="Marks invoice Ready" kind="state-change" after=["e_decide"] branch="b_ready" /%}
{% /trace %}
```

## Case C — Message transport choice

| Target | Likely wrong interpretation | Supporting fact | Smallest correction |
| --- | --- | --- | --- |
| `x_spool_host` | The local spool stays available after its host is lost. | It survives process restarts **on the same host**, but loses availability when that host is lost. | Say that a host loss makes it unavailable; retain the distinct process-restart behavior as context. |
| `x_spool_latency` | The spool's publish p95 is 14 ms at the target 500 messages/s. | The 14 ms p95 was measured at **100 messages/s**; no measurement exists at 500 messages/s. | Remove the target-load value and measured status. State that target-load latency is unmeasured, while retaining the 100 messages/s observation with its load. |
| `x_queue_pressure` | Producers never encounter queue throttling. | Above the configured 600 messages/s request rate, the queue returns 429 responses. | State the threshold and 429 behavior. |

The regional queue host-loss statement, its measured 23 ms p95 at 500 messages/s, and the spool's 80% disk threshold behavior are supported and remain. The comparison does not establish a spool latency at the target load or a single overall winner.

```markdown
{% compare id="transport_choice" title="Transport behavior" question="How do host loss, target-load latency, and producer pressure differ?" %}
At the target 500 messages/s with 1 KiB messages, managed-queue publish p95 was measured at 23 ms; spool publish p95 was not measured. A spool host loss removes its availability, while the managed queue remains available after one host loss within the tested region. The two transports apply different producer pressure at their stated thresholds.

{% option id="o_spool" label="Local disk spool" /%}
{% option id="o_queue" label="Regional managed queue" /%}

{% criterion id="c_host" label="After one host is lost" /%}
{% criterion id="c_latency" label="Publish p95 at 500 messages/s, 1 KiB" units="ms" /%}
{% criterion id="c_pressure" label="Producer pressure" /%}

{% cell id="x_spool_host" option="o_spool" criterion="c_host" %}
Unavailable when its host is lost. It survives a process restart on that same host.
{% /cell %}
{% cell id="x_queue_host" option="o_queue" criterion="c_host" %}
Remains available within the tested region after one host is lost.
{% /cell %}

{% cell id="x_spool_latency" option="o_spool" criterion="c_latency" %}
Not measured at 500 messages/s. At 100 messages/s with 1 KiB messages, measured publish p95 was 14 ms.
{% /cell %}
{% cell id="x_queue_latency" option="o_queue" criterion="c_latency" value=23 valueStatus="measured" /%}

{% cell id="x_spool_pressure" option="o_spool" criterion="c_pressure" %}
Producers wait when disk use reaches the configured 80% threshold.
{% /cell %}
{% cell id="x_queue_pressure" option="o_queue" criterion="c_pressure" %}
Above the configured 600 messages/s request rate, producers receive 429 responses.
{% /cell %}
{% /compare %}
```
