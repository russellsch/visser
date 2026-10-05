# Synthetic figure review packet

All organizations, systems, measurements, and incidents below are fictional and explicitly synthetic. Each fenced block is a **snippet only**, not a complete compilable Visser document. Review the figure against the supplied facts and the reader's question. Preserve accurate distinctions when proposing a revision.

## Case S — Key rotation lifecycle (`state`)

**Source facts (synthetic):** A key rotation request starts in Draft. Submission moves it to Pending. An operator may reject a Pending request explicitly, ending that request. Activation is permitted only after two distinct approvers have recorded approval and the scheduled activation window is open. A Pending request has no automatic expiry; it can wait until an operator acts. An operator may retire an Active key. Retirement stops issuing new tokens under that key; tokens already issued remain valid until their own expiry.

**Reader and question:** A release engineer reviewing the approval gate asks, “Which events can end a Pending request, and what must be true before activation?”

**Adjacent prose:** The diagram is intended to summarize the request's permitted lifecycle. The team will use it in an operations guide beside the approval procedure.

```markdown
{% graph id="rotation_lifecycle" mode="state" title="Key rotation request" question="Which events end Pending, and when may activation occur?" %}
{% state id="s_draft" label="Draft" initial=true /%}
{% state id="s_pending" label="Pending" /%}
{% state id="s_active" label="Active" /%}
{% state id="s_rejected" label="Rejected" terminal=true /%}
{% state id="s_retired" label="Retired" terminal=true /%}

{% transition id="t_submit" from="s_draft" to="s_pending" event="operator submits" label="submit" /%}
{% transition id="t_activate" from="s_pending" to="s_active" event="activation window opens" label="activate" guard="at least one approval recorded" /%}
{% transition id="t_reject" from="s_pending" to="s_rejected" event="operator rejects" label="reject" /%}
{% transition id="t_timeout" from="s_pending" to="s_rejected" event="30-minute timeout" label="automatic rejection" /%}
{% transition id="t_retire" from="s_active" to="s_retired" event="operator retires key" label="retire" action="stop issuing new tokens" /%}
{% /graph %}
```

## Case T — Invoice screening (`trace`)

**Source facts (synthetic):** On invoice submission, the API stores the invoice and enqueues both tax and fraud checks. It replies `202 Accepted` after the store; the reply does not wait for either check or the decision. The two workers may finish in either order. The decision worker evaluates only after both results arrive. It marks the invoice Held if either result fails, or Ready if both pass. These are mutually exclusive outcomes for one submission.

**Reader and question:** An integration engineer asks, “What can the client know from the 202 reply, and which results must arrive before a decision?”

**Adjacent prose:** The trace depicts one submission and the possible decision outcomes. It is meant to clarify prerequisites across the API and workers.

```markdown
{% trace id="invoice_screening" title="Invoice screening" question="What precedes the reply and the decision?" %}
{% actor id="a_api" label="Invoice API" /%}
{% actor id="a_tax" label="Tax worker" /%}
{% actor id="a_fraud" label="Fraud worker" /%}
{% actor id="a_decision" label="Decision worker" /%}

{% event id="e_store" actor="a_api" label="Stores invoice and enqueues checks" kind="state-change" /%}
{% event id="e_tax" actor="a_tax" label="Tax result arrives" kind="return" after=["e_store"] /%}
{% event id="e_fraud" actor="a_fraud" label="Fraud result arrives" kind="return" after=["e_tax"] /%}
{% event id="e_decide" actor="a_decision" label="Evaluates results" kind="compute" after=["e_tax"] /%}
{% event id="e_reply" actor="a_api" label="Replies 202 Accepted" kind="return" after=["e_decide"] /%}

{% branch id="b_held" label="Held" condition="either result fails" exclusiveWith=["b_ready"] /%}
{% branch id="b_ready" label="Ready" condition="both results pass" exclusiveWith=["b_held"] /%}
{% event id="e_held" actor="a_decision" label="Marks invoice Held" kind="state-change" after=["e_decide"] branch="b_held" /%}
{% event id="e_ready" actor="a_decision" label="Marks invoice Ready" kind="state-change" after=["e_decide"] branch="b_ready" /%}
{% /trace %}
```

## Case C — Message transport choice (`compare`)

**Source facts (synthetic):** The team compares a local disk spool with a regional managed queue for 1 KiB messages. The spool survives process restarts on the same host but loses availability when that host is lost. The managed queue remains available after one host is lost within its tested region. At 100 messages/s, the measured spool publish p95 was 14 ms. No spool publish latency was measured at 500 messages/s. At 500 messages/s, the measured managed queue publish p95 was 23 ms. When the spool disk reaches its configured 80% threshold, producers wait. Above its configured 600 messages/s request rate, the managed queue returns 429 responses to producers.

**Reader and question:** A service owner choosing a transport asks, “How do host loss, latency at the target 500 messages/s load, and producer pressure differ?”

**Adjacent prose:** The decision note will use this comparison beside a separate rollout plan. The target load is 500 messages/s with 1 KiB messages.

```markdown
{% compare id="transport_choice" title="Transport behavior" question="How do host loss, target-load latency, and producer pressure differ?" %}
{% option id="o_spool" label="Local disk spool" /%}
{% option id="o_queue" label="Regional managed queue" /%}

{% criterion id="c_host" label="After one host is lost" /%}
{% criterion id="c_latency" label="Publish p95 at 500 messages/s, 1 KiB" units="ms" /%}
{% criterion id="c_pressure" label="Producer pressure" /%}

{% cell id="x_spool_host" option="o_spool" criterion="c_host" %}
Keeps accepting publishes after the host is lost.
{% /cell %}
{% cell id="x_queue_host" option="o_queue" criterion="c_host" %}
Remains available within the tested region after one host is lost.
{% /cell %}

{% cell id="x_spool_latency" option="o_spool" criterion="c_latency" value=14 valueStatus="measured" %}
Measured publish p95.
{% /cell %}
{% cell id="x_queue_latency" option="o_queue" criterion="c_latency" value=23 valueStatus="measured" %}
Measured publish p95 at the target load.
{% /cell %}

{% cell id="x_spool_pressure" option="o_spool" criterion="c_pressure" %}
Producers wait when disk use reaches the configured 80% threshold.
{% /cell %}
{% cell id="x_queue_pressure" option="o_queue" criterion="c_pressure" %}
Producers are never throttled, even above the configured request rate.
{% /cell %}
{% /compare %}
```
