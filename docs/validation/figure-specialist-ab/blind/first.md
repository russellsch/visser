# Figure review

The source facts and reader questions supplied with the three synthetic snippets were reviewed in one pass. Each correction below keeps the figure's existing valid IDs and puts decision-changing conditions in the visible figure text.

## Case S — Key rotation lifecycle

Material findings:

- **`t_activate` — wrong guard and trigger.** A reader could conclude that one approval plus the window opening activates the request. The source permits activation only after **two distinct approvers** have recorded approval **and** the scheduled activation window is open. Use activation as the event and state both prerequisites in the guard; the facts do not identify a separate initiating actor.
- **`t_timeout` — invented Pending exit.** A reader could conclude that a Pending request is rejected automatically after 30 minutes. The source says Pending has no automatic expiry and waits for operator action. Remove this transition and say that Pending can end through explicit rejection or guarded activation.
- **`t_retire` / visible explanation — incomplete retirement effect.** A reader could infer that retirement invalidates previously issued tokens. The source says it stops new issuance under the key while existing tokens remain valid until their own expiry. Keep the correct retirement transition and action, and add the remaining effect to visible prose.

The Draft → Pending submission, explicit Pending → Rejected operator action, initial Draft, and terminal Rejected and Retired states are supported and should remain. The diagram states permitted transitions; it does not establish that a waiting request will eventually activate or be rejected.

Minimally corrected snippet:

```markdown
{% graph id="rotation_lifecycle" mode="state" title="Key rotation request" question="Which events end Pending, and when may activation occur?" %}
Pending ends through explicit operator rejection or activation after two distinct approvers have recorded approval and the scheduled activation window is open. Pending has no automatic expiry. Retirement stops new token issuance under the key; tokens already issued remain valid until their own expiry.

{% state id="s_draft" label="Draft" initial=true /%}
{% state id="s_pending" label="Pending" /%}
{% state id="s_active" label="Active" /%}
{% state id="s_rejected" label="Rejected" terminal=true /%}
{% state id="s_retired" label="Retired" terminal=true /%}

{% transition id="t_submit" from="s_draft" to="s_pending" event="operator submits" label="submit" /%}
{% transition id="t_activate" from="s_pending" to="s_active" event="activation" label="activate" guard="two distinct approvers have recorded approval and scheduled activation window is open" /%}
{% transition id="t_reject" from="s_pending" to="s_rejected" event="operator rejects" label="reject" /%}
{% transition id="t_retire" from="s_active" to="s_retired" event="operator retires key" label="retire" action="stop issuing new tokens" /%}
{% /graph %}
```

## Case T — Invoice screening

Material findings:

- **`e_fraud` — false order.** A reader could conclude that fraud results always follow tax results. The source says the workers can finish in either order. Make `e_fraud` depend on `e_store`, independently of `e_tax`.
- **`e_decide` — missing join.** A reader could conclude that the decision worker may evaluate after tax alone. The source requires both results. Make it depend on both `e_tax` and `e_fraud`.
- **`e_reply` — false completion prerequisite.** A reader could conclude that `202 Accepted` means screening and the decision have completed. The source says the API replies after storing and enqueueing, without waiting for either check or decision. Make the reply depend only on `e_store` and state its limited meaning visibly.

The store-and-enqueue event, two exclusive Held/Ready branches, and their conditions are supported. The corrected partial order allows the reply to occur before or after worker results; it imposes no timing guarantee beyond its prerequisite.

Minimally corrected snippet:

```markdown
{% trace id="invoice_screening" title="Invoice screening" question="What precedes the reply and the decision?" %}
The 202 reply means the API has stored the invoice and enqueued both checks; it does not report a tax result, fraud result, or decision. Tax and fraud may finish in either order. The decision waits for both results, then marks one submission Held if either fails or Ready if both pass.

{% actor id="a_api" label="Invoice API" /%}
{% actor id="a_tax" label="Tax worker" /%}
{% actor id="a_fraud" label="Fraud worker" /%}
{% actor id="a_decision" label="Decision worker" /%}

{% event id="e_store" actor="a_api" label="Stores invoice and enqueues checks" kind="state-change" /%}
{% event id="e_tax" actor="a_tax" label="Tax result arrives" kind="return" after=["e_store"] /%}
{% event id="e_fraud" actor="a_fraud" label="Fraud result arrives" kind="return" after=["e_store"] /%}
{% event id="e_decide" actor="a_decision" label="Evaluates results" kind="compute" after=["e_tax", "e_fraud"] /%}
{% event id="e_reply" actor="a_api" label="Replies 202 Accepted" kind="return" after=["e_store"] /%}

{% branch id="b_held" label="Held" condition="either result fails" exclusiveWith=["b_ready"] /%}
{% branch id="b_ready" label="Ready" condition="both results pass" exclusiveWith=["b_held"] /%}
{% event id="e_held" actor="a_decision" label="Marks invoice Held" kind="state-change" after=["e_decide"] branch="b_held" /%}
{% event id="e_ready" actor="a_decision" label="Marks invoice Ready" kind="state-change" after=["e_decide"] branch="b_ready" /%}
{% /trace %}
```

## Case C — Message transport choice

Material findings:

- **`x_spool_host` — false host-loss availability.** A reader could conclude the spool continues accepting publishes after its host is lost. The source says it survives process restarts on the same host but loses availability with that host. Correct the host-loss cell; the process-restart distinction can remain as useful context.
- **`x_spool_latency` — mismatched measurement.** A reader could compare the spool's displayed 14 ms directly with the queue's 23 ms at 500 messages/s. The 14 ms spool p95 was measured at **100 messages/s**; there is no spool measurement at the target 500 messages/s. Remove `value=14` and `valueStatus="measured"` from the target-load cell and say the target-load value is unmeasured. Keep the 100 messages/s measurement clearly qualified as context.
- **`x_queue_pressure` — false absence of throttling.** A reader could conclude producers are never throttled. The source says the queue returns 429 responses above its configured 600 messages/s request rate. State that condition and effect.

The queue's measured 23 ms p95 at 500 messages/s and availability after one host loss within its tested region are supported. The spool's producer wait at 80% disk use is supported. These differences do not establish a latency ranking at the target load because the spool value is missing.

Minimally corrected snippet:

```markdown
{% compare id="transport_choice" title="Transport behavior" question="How do host loss, target-load latency, and producer pressure differ?" %}
At the target 500 messages/s with 1 KiB messages, the managed queue has a measured 23 ms publish p95; the spool has no measured publish p95 at that load, so these data do not establish which is faster there. The spool loses availability with its host; the queue remains available after one host loss within its tested region. Producer pressure appears as waiting at the spool's 80% disk threshold or 429 responses above the queue's configured 600 messages/s request rate.

{% option id="o_spool" label="Local disk spool" /%}
{% option id="o_queue" label="Regional managed queue" /%}

{% criterion id="c_host" label="After one host is lost" /%}
{% criterion id="c_latency" label="Publish p95 at 500 messages/s, 1 KiB" units="ms" /%}
{% criterion id="c_pressure" label="Producer pressure" /%}

{% cell id="x_spool_host" option="o_spool" criterion="c_host" %}
Loses availability when its host is lost. It survives process restarts on the same host.
{% /cell %}
{% cell id="x_queue_host" option="o_queue" criterion="c_host" %}
Remains available within the tested region after one host is lost.
{% /cell %}

{% cell id="x_spool_latency" option="o_spool" criterion="c_latency" %}
Not measured at 500 messages/s. The measured publish p95 was 14 ms at 100 messages/s.
{% /cell %}
{% cell id="x_queue_latency" option="o_queue" criterion="c_latency" value=23 valueStatus="measured" /%}

{% cell id="x_spool_pressure" option="o_spool" criterion="c_pressure" %}
Producers wait when disk use reaches the configured 80% threshold.
{% /cell %}
{% cell id="x_queue_pressure" option="o_queue" criterion="c_pressure" %}
The queue returns 429 responses to producers above its configured 600 messages/s request rate.
{% /cell %}
{% /compare %}
```

Visual layout at desktop and narrow widths, rendered geometry, and interaction behavior were not checked because no renders or interactive artifact were supplied. These snippet-only cases were not checked as complete Visser documents.
