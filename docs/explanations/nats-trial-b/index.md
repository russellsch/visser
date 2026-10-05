---
format: visser/1
docId: a0fadfa2-db19-4a68-af6f-1d8e0ddb07b6
title: "Why JetStream can redeliver completed work"
kind: teaching
capturedAt: 2026-10-05T01:49:33Z
reader:
  profile: experienced engineer who knows queues and network failures
  knows: [queues, network failures, external side effects]
  new: [JetStream, durable pull consumers, ACK policy]
  mustUnderstand:
    - "Explain why JetStream can redeliver after a worker finishes external work."
    - "Predict when a second worker can receive the same stream message."
    - "Distinguish delivery attempts from stream retention."
    - "Explain how AckWait, BackOff, and NAK affect retry timing."
visibility: private
---

<!-- vs:id overview -->
# Why JetStream can redeliver completed work

{% definition id="def_jetstream" term="JetStream" %}
JetStream is the NATS server feature that stores messages in streams and delivers them through consumers.
{% /definition %}

{% definition id="def_ack" term="ACK" aliases=["ACKs"] %}
An ACK is a worker's message that tells the consumer to stop redelivery for a message.
{% /definition %}

{% definition id="def_nak" term="NAK" aliases=["NAKs"] %}
A NAK is a worker's negative acknowledgement that asks the consumer to redeliver a message.
{% /definition %}

<!-- vs:id p_scope -->
This example has one JetStream stream with `LimitsPolicy`, one durable pull consumer with `AckExplicit`, and two workers. The stream stores the message; the consumer tracks deliveries and answers the workers' requests for messages. `AckExplicit` requires the worker to acknowledge each delivery. An ACK tells the consumer to stop waiting only if the server receives it. {% cite ref="src_ack_policy" /%} {% cite ref="src_delivery" /%} {% cite ref="src_ack_state" /%}

<!-- vs:id p_answer -->
If worker A finishes the external work but its ACK does not reach JetStream, the consumer still has a pending ACK. The server cannot infer external completion from that work. When the ACK deadline expires, the consumer queues a retry if it has not reached the delivery limit. Worker B can receive it if the message remains in the stream and B has a valid pull request. B may repeat the external effect unless the application prevents it. {% cite ref="src_delivery" /%} {% cite ref="src_expiry" /%} {% cite ref="src_max" /%} {% cite ref="src_redeliver" /%} {% cite ref="src_pull" /%}

<!-- vs:id h_owners -->
## The stream and consumer know different things

{% graph id="g_ownership" mode="architecture" title="Storage, delivery, and external work" question="Which component knows that the work is complete?" %}
The consumer tracks delivery and ACK state. The external system sees the worker's effect. Neither record automatically proves the other. The ACK arrow is an attempt; it can fail before receipt.

{% node id="n_stream" label="Stream" role="storage" evidence=["src_retention"] /%}
{% node id="n_consumer" label="Durable pull consumer" role="process" evidence=["src_delivery"] /%}
{% node id="n_worker_a" label="Worker A" role="process" /%}
{% node id="n_worker_b" label="Worker B" role="process" /%}
{% node id="n_external" label="External system" role="external" /%}

{% edge id="e_load" from="n_consumer" to="n_stream" kind="data" label="loads stored message" evidence=["src_redeliver"] /%}
{% edge id="e_pull_a" from="n_worker_a" to="n_consumer" kind="call" label="requests next message" /%}
{% edge id="e_deliver_a" from="n_consumer" to="n_worker_a" kind="data" label="delivers message" evidence=["src_delivery"] /%}
{% edge id="e_effect" from="n_worker_a" to="n_external" kind="call" label="performs external work" /%}
{% edge id="e_ack" from="n_worker_a" to="n_consumer" kind="control" label="ACK attempt; may be lost" /%}
{% edge id="e_pull_b" from="n_worker_b" to="n_consumer" kind="call" label="requests next message" /%}
{% edge id="e_deliver_b" from="n_consumer" to="n_worker_b" kind="data" label="can redeliver message" evidence=["src_pull", "src_redeliver"] /%}
{% /graph %}

<!-- vs:id p_boundary -->
The durable consumer keeps a pending entry when it delivers under `AckExplicit`. A received ACK removes that entry. The stream holds the message under its own retention rules. These are separate records. {% cite ref="src_delivery" /%} {% cite ref="src_ack_state" /%} {% cite ref="src_retention" /%}

<!-- vs:id h_trace -->
## A lost ACK leaves work pending

{% trace id="t_lost_ack" title="One message, two possible workers" question="How can B receive work that A already finished?" %}
This trace assumes that A completes the external work and its ACK fails before JetStream receives it. B can request a message while A is working; redelivery still needs an expired pending ACK, a valid pull request, and a message that remains in the stream.

{% actor id="a_consumer" entity="n_consumer" /%}
{% actor id="a_worker_a" entity="n_worker_a" /%}
{% actor id="a_worker_b" entity="n_worker_b" /%}
{% actor id="a_external" entity="n_external" /%}

{% event id="ev_first" actor="a_consumer" to="a_worker_a" label="Delivers message to A" kind="send" evidence=["src_delivery"] /%}
{% event id="ev_work" actor="a_worker_a" to="a_external" label="Starts external work" kind="call" after=["ev_first"] /%}
{% event id="ev_pull" actor="a_worker_b" to="a_consumer" label="B requests next message" kind="call" after=["ev_first"] /%}
{% event id="ev_effect" actor="a_external" label="External effect completes" kind="state-change" after=["ev_work"] /%}
{% event id="ev_lost" actor="a_worker_a" label="A's ACK is lost before receipt" kind="failure" after=["ev_effect"] /%}
{% event id="ev_timeout" actor="a_consumer" label="ACK deadline expires" kind="wait" after=["ev_lost"] evidence=["src_expiry"] /%}
{% event id="ev_queue" actor="a_consumer" label="Queues redelivery" kind="state-change" after=["ev_timeout"] evidence=["src_expiry"] /%}
{% event id="ev_second" actor="a_consumer" to="a_worker_b" label="Redelivers stored message" kind="send" after=["ev_queue", "ev_pull"] evidence=["src_redeliver", "src_pull"] /%}
{% /trace %}

<!-- vs:id p_trace_condition -->
The trace shows one possible order: B requests a message while A is working, then waits for a delivery. A later pull request would also work; either worker could receive the retry. The retry needs both a queued message and a valid pull request. If the stream has already removed the message, the consumer cannot load it for redelivery. {% cite ref="src_expiry" /%} {% cite ref="src_pull" /%} {% cite ref="src_redeliver" /%}

<!-- vs:id p_late_ack -->
If a late ACK reaches the consumer before B receives the message, the consumer can clear both pending state and queued redelivery. Expiry alone does not guarantee a second delivery. {% cite ref="src_ack_state" /%}

<!-- vs:id h_controls -->
## Timing and delivery limits change the next attempt

<!-- vs:id tbl_controls -->
| Control | Effect in this case |
|---|---|
| `AckWait` | The consumer waits for an ACK after delivery. When the pending entry expires, it queues redelivery. {% cite ref="src_expiry" /%} |
| `BackOff` | Its first interval replaces `AckWait`. Later intervals set later timeout deadlines. {% cite ref="src_time_default" /%} {% cite ref="src_expiry" /%} |
| `NAK` | A received NAK queues redelivery without waiting for the ordinary timeout. A NAK with a delay schedules a later retry. {% cite ref="src_ack_dispatch" /%} {% cite ref="src_nak" /%} |
| `MaxDeliver` | The consumer stops new delivery attempts when it reaches the configured count. Its unset value means no delivery limit. {% cite ref="src_max" /%} {% cite ref="src_max_default" /%} |

<!-- vs:id p_nak_condition -->
The lost ACK in the trace is not a NAK. The server can act on a NAK only when it receives that NAK. `BackOff` governs timeout redelivery; the NAK path handles immediate or explicit-delay retry separately. {% cite ref="src_ack_dispatch" /%} {% cite ref="src_nak" /%}

<!-- vs:id h_retention -->
## A delivery limit does not erase the stream message

<!-- vs:id p_retention -->
`MaxDeliver` limits the consumer's attempts for one message. It does not prove that the external work completed. Under `LimitsPolicy`, an ACK does not remove that message from the stream. The stream has separate storage limits, such as `MaxMsgs`, `MaxBytes`, and `MaxAge`. {% cite ref="src_max" /%} {% cite ref="src_retention" /%} {% cite ref="src_stream_limits" /%}

<!-- vs:id p_application -->
The application must decide how to handle repeated external work. For example, it can record a stable work identifier in the external system and reject a second application of that identifier. The consumer's ACK state records delivery confirmation; it does not record the external effect. {% cite ref="src_ack_state" /%}

{% source id="src_ack_policy" kind="git" title="Explicit ACK policy" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=330 end=340 capturedAt="2026-10-05T01:50:17Z" excerptSha256="22e7f6bafe337642527e4468880c4fe00cc3ba7c7959a96562c1538a04915717" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
// AckPolicy determines how the consumer should acknowledge delivered messages.
type AckPolicy int

const (
	// AckNone requires no acks for delivered messages.
	AckNone AckPolicy = iota
	// AckAll when acking a sequence number, this implicitly acks all sequences below this one as well.
	AckAll
	// AckExplicit requires ack or nack for all messages.
	AckExplicit
)
```
{% /source %}

{% source id="src_max_default" kind="git" title="MaxDeliver default" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=568 end=574 capturedAt="2026-10-05T01:50:30Z" excerptSha256="4727318c8b258c019c6b33b1219c84ee5df3c2a3c68c0a2bf4e40e82830a734b" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
	// Setup default of -1, meaning no limit for MaxDeliver.
	if config.MaxDeliver == 0 || config.MaxDeliver < -1 {
		if pedantic && config.MaxDeliver < -1 {
			return NewJSPedanticError(errors.New("max_deliver must be set to -1"))
		}
		config.MaxDeliver = -1
	}
```
{% /source %}

{% source id="src_time_default" kind="git" title="AckWait and BackOff defaults" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=629 end=639 capturedAt="2026-10-05T01:50:32Z" excerptSha256="01ca49c1885c9efb2495b78cc333b6d06e55e56a7c4f5d3fda3be5154c583ec1" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
	// Setup proper default for ack wait if we are in explicit ack mode.
	if config.AckWait == 0 && (config.AckPolicy == AckExplicit || config.AckPolicy == AckAll) {
		config.AckWait = JsAckWaitDefault
	}
	// If BackOff was specified that will override the AckWait and the MaxDeliver.
	if len(config.BackOff) > 0 {
		if pedantic && config.AckWait != config.BackOff[0] {
			return NewJSPedanticError(errors.New("first backoff value has to equal batch AckWait"))
		}
		config.AckWait = config.BackOff[0]
	}
```
{% /source %}

{% source id="src_max" kind="git" title="Delivery limit handling" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=2146 end=2174 capturedAt="2026-10-05T01:50:36Z" excerptSha256="f727375bf969744d46a61a0121148d4f9dca733b6a32595258128c3117dedf56" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
func (o *consumer) hasMaxDeliveries(seq uint64) bool {
	if o.maxdc == 0 {
		return false
	}
	if dc := o.deliveryCount(seq); dc >= o.maxdc {
		// We have hit our max deliveries for this sequence.
		// Only send the advisory once.
		if dc == o.maxdc {
			o.notifyDeliveryExceeded(seq, dc)
		}
		// Determine if we signal to start flow of messages again.
		if o.maxp > 0 && len(o.pending) >= o.maxp {
			o.signalNewMessages()
		}
		// Make sure to remove from pending.
		if p, ok := o.pending[seq]; ok && p != nil {
			delete(o.pending, seq)
			o.updateDelivered(p.Sequence, seq, dc, p.Timestamp)
		}
		// Ensure redelivered state is set, if not already.
		if o.rdc == nil {
			o.rdc = make(map[uint64]uint64)
		}
		o.rdc[seq] = dc
		return true
	}
	return false
}

```
{% /source %}

{% source id="src_ack_dispatch" kind="git" title="ACK and NAK dispatch" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=2529 end=2556 capturedAt="2026-10-05T01:50:38Z" excerptSha256="0a4e13a1ab5d7be759f63f97a7964974deb2cea3d464447e97c76eaf17c068ad" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
func (o *consumer) processAck(subject, reply string, hdr int, rmsg []byte) {
	defer atomic.AddInt64(&o.awl, -1)

	var msg []byte
	if hdr > 0 {
		msg = rmsg[hdr:]
	} else {
		msg = rmsg
	}

	sseq, dseq, dc := ackReplyInfo(subject)

	skipAckReply := sseq == 0

	switch {
	case len(msg) == 0, bytes.Equal(msg, AckAck), bytes.Equal(msg, AckOK):
		if !o.processAckMsg(sseq, dseq, dc, reply, true) {
			// We handle replies for acks in updateAcks
			skipAckReply = true
		}
	case bytes.HasPrefix(msg, AckNext):
		o.processAckMsg(sseq, dseq, dc, _EMPTY_, true)
		o.processNextMsgRequest(reply, msg[len(AckNext):])
		skipAckReply = true
	case bytes.HasPrefix(msg, AckNak):
		o.processNak(sseq, dseq, dc, msg)
	case bytes.Equal(msg, AckProgress):
		o.progressUpdate(sseq)
```
{% /source %}

{% source id="src_nak" kind="git" title="NAK handling" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=2853 end=2927 capturedAt="2026-10-05T01:50:42Z" excerptSha256="bbd345251c9cfecdfd644aa3d2ea810ad065ac6a16515e369c2485915d62046a" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
func (o *consumer) processNak(sseq, dseq, dc uint64, nak []byte) {
	o.mu.Lock()
	defer o.mu.Unlock()

	// Check for out of range.
	if dseq <= o.adflr || dseq > o.dseq {
		return
	}
	// If we are explicit ack make sure this is still on our pending list.
	if _, ok := o.pending[sseq]; !ok {
		return
	}

	// Deliver an advisory
	e := JSConsumerDeliveryNakAdvisory{
		TypedEvent: TypedEvent{
			Type: JSConsumerDeliveryNakAdvisoryType,
			ID:   nuid.Next(),
			Time: time.Now().UTC(),
		},
		Stream:      o.stream,
		Consumer:    o.name,
		ConsumerSeq: dseq,
		StreamSeq:   sseq,
		Deliveries:  dc,
		Domain:      o.srv.getOpts().JetStreamDomain,
	}

	o.sendAdvisory(o.nakEventT, e)

	// Check to see if we have delays attached.
	if len(nak) > len(AckNak) {
		arg := bytes.TrimSpace(nak[len(AckNak):])
		if len(arg) > 0 {
			var d time.Duration
			var err error
			if arg[0] == '{' {
				var nd ConsumerNakOptions
				if err = json.Unmarshal(arg, &nd); err == nil {
					d = nd.Delay
				}
			} else {
				d, err = time.ParseDuration(string(arg))
			}
			if err != nil {
				// Treat this as normal NAK.
				o.srv.Warnf("JetStream consumer '%s > %s > %s' bad NAK delay value: %q", o.acc.Name, o.stream, o.name, arg)
			} else {
				// We have a parsed duration that the user wants us to wait before retrying.
				// Make sure we are not on the rdq.
				o.removeFromRedeliverQueue(sseq)
				if p, ok := o.pending[sseq]; ok {
					// now - ackWait is expired now, so offset from there.
					p.Timestamp = time.Now().Add(-o.cfg.AckWait).Add(d).UnixNano()
					// Update store system which will update followers as well.
					o.updateDelivered(p.Sequence, sseq, dc, p.Timestamp)
					if o.ptmr != nil {
						// Want checkPending to run and figure out the next timer ttl.
						// TODO(dlc) - We could optimize this maybe a bit more and track when we expect the timer to fire.
						o.resetPtmr(10 * time.Millisecond)
					}
				}
				// Nothing else for use to do now so return.
				return
			}
		}
	}

	// If already queued up also ignore.
	if !o.onRedeliverQueue(sseq) {
		o.addToRedeliverQueue(sseq)
	}

	o.signalNewMessages()
}
```
{% /source %}

{% source id="src_ack_state" kind="git" title="Explicit ACK pending state" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=3279 end=3350 capturedAt="2026-10-05T01:58:35Z" excerptSha256="e73e9bbad19d72ab9e46d9950afa7474bd1b0b6ee2b3817c54db85f77402b39a" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
func (o *consumer) processAckMsg(sseq, dseq, dc uint64, reply string, doSample bool) bool {
	o.mu.Lock()
	if o.closed {
		o.mu.Unlock()
		return false
	}

	mset := o.mset
	if mset == nil || mset.closed.Load() {
		o.mu.Unlock()
		return false
	}

	// Check if this ack is above the current pointer to our next to deliver.
	if sseq >= o.sseq {
		// Let's make sure this is valid.
		// This is only received on the consumer leader, so should never be higher
		// than the last stream sequence. But could happen if we've just become
		// consumer leader, and we are not up-to-date on the stream yet.
		var ss StreamState
		mset.store.FastState(&ss)
		if sseq > ss.LastSeq {
			o.srv.Warnf("JetStream consumer '%s > %s > %s' ACK sequence %d past last stream sequence of %d",
				o.acc.Name, o.stream, o.name, sseq, ss.LastSeq)
			// FIXME(dlc) - For 2.11 onwards should we return an error here to the caller?
		}
		// Even though another leader must have delivered a message with this sequence, we must not adjust
		// the current pointer. This could otherwise result in a stuck consumer, where messages below this
		// sequence can't be redelivered, and we'll have incorrect pending state and ack floors.
		o.mu.Unlock()
		return false
	}

	// Let the owning stream know if we are interest or workqueue retention based.
	// If this consumer is clustered (o.node != nil) this will be handled by
	// processReplicatedAck after the ack has propagated.
	ackInPlace := o.node == nil && o.retention != LimitsPolicy

	var sgap, floor uint64
	var needSignal bool

	switch o.cfg.AckPolicy {
	case AckExplicit:
		if p, ok := o.pending[sseq]; ok {
			if doSample {
				o.sampleAck(sseq, dseq, dc)
			}
			if o.maxp > 0 && len(o.pending) >= o.maxp {
				needSignal = true
			}
			delete(o.pending, sseq)
			// Use the original deliver sequence from our pending record.
			dseq = p.Sequence

			// Only move floors if we matched an existing pending.
			if len(o.pending) == 0 {
				o.adflr = o.dseq - 1
				o.asflr = o.sseq - 1
			} else if dseq == o.adflr+1 {
				o.adflr, o.asflr = dseq, sseq
				for ss := sseq + 1; ss < o.sseq; ss++ {
					if p, ok := o.pending[ss]; ok {
						if p.Sequence > 0 {
							o.adflr, o.asflr = p.Sequence-1, ss-1
						}
						break
					}
				}
			}
		}
		delete(o.rdc, sseq)
		o.removeFromRedeliverQueue(sseq)
```
{% /source %}

{% source id="src_redeliver" kind="git" title="Redelivery before new messages" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=4394 end=4426 capturedAt="2026-10-05T01:50:48Z" excerptSha256="68c52700ca2b0b96b0a7657caf3423c20b0cdc02c492149efd8e1cb3501beb98" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
func (o *consumer) getNextMsg() (*jsPubMsg, uint64, error) {
	if o.mset == nil || o.mset.store == nil {
		return nil, 0, errBadConsumer
	}
	// Process redelivered messages before looking at possibly "skip list" (deliver last per subject)
	if o.hasRedeliveries() {
		var seq, dc uint64
		for seq = o.getNextToRedeliver(); seq > 0; seq = o.getNextToRedeliver() {
			dc = o.incDeliveryCount(seq)
			if o.maxdc > 0 && dc > o.maxdc {
				// Only send once
				if dc == o.maxdc+1 {
					o.notifyDeliveryExceeded(seq, dc-1)
				}
				// Make sure to remove from pending.
				if p, ok := o.pending[seq]; ok && p != nil {
					delete(o.pending, seq)
					o.updateDelivered(p.Sequence, seq, dc, p.Timestamp)
				}
				continue
			}
			pmsg := getJSPubMsgFromPool()
			sm, err := o.mset.store.LoadMsg(seq, &pmsg.StoreMsg)
			if sm == nil || err != nil {
				pmsg.returnToPool()
				pmsg, dc = nil, 0
				// Adjust back deliver count.
				o.decDeliveryCount(seq)
			}
			// Message was scheduled for redelivery but was removed in the meantime.
			if err == ErrStoreMsgNotFound || err == errDeletedMsg {
				// This is a race condition where the message is still in o.pending and
				// scheduled for redelivery, but it has been removed from the stream.
```
{% /source %}

{% source id="src_pull" kind="git" title="Pull request chooses recipient" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=4908 end=4920 capturedAt="2026-10-05T01:50:51Z" excerptSha256="ddb4a7d2201c4a1a29b86fed44a95621d5b3664641354e97fadccab96f5a2b52" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
		}
		// Calculate payload size. This can be calculated on client side.
		// We do not include transport subject here since not generally known on client.
		sz = len(pmsg.subj) + len(ackReply) + len(pmsg.hdr) + len(pmsg.msg)

		if o.isPushMode() {
			dsubj = o.dsubj
		} else if wr := o.nextWaiting(sz); wr != nil {
			wrn, wrb = wr.n, wr.b
			dsubj = wr.reply
			if o.cfg.PriorityPolicy == PriorityPinnedClient {
				// FIXME(jrm): Can we make this prettier?
				if len(pmsg.hdr) == 0 {
```
{% /source %}

{% source id="src_delivery" kind="git" title="Delivery tracks pending ACK" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=5207 end=5226 capturedAt="2026-10-05T01:50:54Z" excerptSha256="7eb3437dfd1d83501188a61dcb5c1526dd6e264b3f5f8976299df31d80b16a77" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
	ap := o.cfg.AckPolicy

	// Cant touch pmsg after this sending so capture what we need.
	seq, ts := pmsg.seq, pmsg.ts

	// Update delivered first.
	o.updateDelivered(dseq, seq, dc, ts)

	if ap == AckExplicit || ap == AckAll {
		o.trackPending(seq, dseq)
	} else if ap == AckNone {
		o.adflr = dseq
		o.asflr = seq
	}

	// Send message.
	if o.replicateDeliveries() {
		o.addReplicatedQueuedMsg(pmsg)
	} else {
		o.outq.send(pmsg)
```
{% /source %}

{% source id="src_expiry" kind="git" title="Pending timeout and redelivery" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/consumer.go" start=5488 end=5568 capturedAt="2026-10-05T01:50:56Z" excerptSha256="61a9985dbc29fc688a6310159497e56a98a15e62be6afe74b94498b7a6b05b79" originFileSha256="4223bb830230ca8e2a7e549a56021351c2051eb0e0e31f46f7b9b7627b4ba745" %}
```go
	var state StreamState
	mset.store.FastState(&state)
	fseq := state.FirstSeq

	now := time.Now().UnixNano()
	ttl := int64(o.cfg.AckWait)
	next := int64(o.ackWait(0))
	// However, if there is backoff, initializes with the largest backoff.
	// It will be adjusted as needed.
	if l := len(o.cfg.BackOff); l > 0 {
		next = int64(o.cfg.BackOff[l-1])
	}

	// Since we can update timestamps, we have to review all pending.
	// We will now bail if we see an ack pending inbound to us via o.awl.
	var expired []uint64
	check := len(o.pending) > 1024
	for seq, p := range o.pending {
		if check && atomic.LoadInt64(&o.awl) > 0 {
			o.resetPtmr(100 * time.Millisecond)
			return
		}
		// Check if these are no longer valid.
		if seq < fseq || seq <= o.asflr {
			delete(o.pending, seq)
			delete(o.rdc, seq)
			o.removeFromRedeliverQueue(seq)
			shouldUpdateState = true
			// Check if we need to move ack floors.
			if seq > o.asflr {
				o.asflr = seq
			}
			if p.Sequence > o.adflr {
				o.adflr = p.Sequence
			}
			continue
		}
		elapsed, deadline := now-p.Timestamp, ttl
		if len(o.cfg.BackOff) > 0 {
			// This is ok even if o.rdc is nil, we would get dc == 0, which is what we want.
			dc := int(o.rdc[seq])
			if dc < 0 {
				// Prevent consumer backoff from going backwards.
				dc = 0
			}
			// This will be the index for the next backoff, will set to last element if needed.
			nbi := dc + 1
			if dc+1 >= len(o.cfg.BackOff) {
				dc = len(o.cfg.BackOff) - 1
				nbi = dc
			}
			deadline = int64(o.cfg.BackOff[dc])
			// Set `next` to the next backoff (if smaller than current `next` value).
			if nextBackoff := int64(o.cfg.BackOff[nbi]); nextBackoff < next {
				next = nextBackoff
			}
		}
		if elapsed >= deadline {
			// We will check if we have hit our max deliveries. Previously we would do this on getNextMsg() which
			// worked well for push consumers, but with pull based consumers would require a new pull request to be
			// present to process and redelivered could be reported incorrectly.
			if !o.onRedeliverQueue(seq) && !o.hasMaxDeliveries(seq) {
				expired = append(expired, seq)
			}
		} else if deadline-elapsed < next {
			// Update when we should fire next.
			next = deadline - elapsed
		}
	}

	if len(expired) > 0 {
		// We need to sort.
		slices.Sort(expired)
		o.addToRedeliverQueue(expired...)
		// Now we should update the timestamp here since we are redelivering.
		// We will use an incrementing time to preserve order for any other redelivery.
		off := now - o.pending[expired[0]].Timestamp
		for _, seq := range expired {
			if p, ok := o.pending[seq]; ok {
				p.Timestamp += off
			}
```
{% /source %}

{% source id="src_retention" kind="git" title="LimitsPolicy ACK retention" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/stream.go" start=7504 end=7518 capturedAt="2026-10-05T01:51:00Z" excerptSha256="bc3d3cd9864c9249c2409f3c4515210ebba71e0491e6417414edc1bb5dfe0b8e" originFileSha256="ba526281ac6df251f5b5591bbcaf02a923475370a335c2246abf1188ad0483af" %}
```go
// ackMsg is called into from a consumer when we have a WorkQueue or Interest Retention Policy.
// Returns whether the message at seq was removed as a result of the ACK.
// (Or should be removed in the case of clustered streams, since it requires a message delete proposal)
func (mset *stream) ackMsg(o *consumer, seq uint64) bool {
	if seq == 0 {
		return false
	}

	// Don't make this RLock(). We need to have only 1 running at a time to gauge interest across all consumers.
	mset.mu.Lock()
	if mset.closed.Load() || mset.cfg.Retention == LimitsPolicy {
		mset.mu.Unlock()
		return false
	}

```
{% /source %}

{% source id="src_stream_limits" kind="git" title="Stream retention limits" language="go" repository="https://github.com/nats-io/nats-server.git" commit="fc6ec648d806652d282d2f0edb6cb9f22c895572" file="server/stream.go" start=48 end=65 capturedAt="2026-10-05T01:53:16Z" excerptSha256="aed4817443ea517e963fcb7cd807b7b84bdc98927e01521278531aae39167f0b" originFileSha256="ba526281ac6df251f5b5591bbcaf02a923475370a335c2246abf1188ad0483af" %}
```go

// StreamConfig will determine the name, subjects and retention policy
// for a given stream. If subjects is empty the name will be used.
type StreamConfig struct {
	Name         string           `json:"name"`
	Description  string           `json:"description,omitempty"`
	Subjects     []string         `json:"subjects,omitempty"`
	Retention    RetentionPolicy  `json:"retention"`
	MaxConsumers int              `json:"max_consumers"`
	MaxMsgs      int64            `json:"max_msgs"`
	MaxBytes     int64            `json:"max_bytes"`
	MaxAge       time.Duration    `json:"max_age"`
	MaxMsgsPer   int64            `json:"max_msgs_per_subject"`
	MaxMsgSize   int32            `json:"max_msg_size,omitempty"`
	Discard      DiscardPolicy    `json:"discard"`
	Storage      StorageType      `json:"storage"`
	Replicas     int              `json:"num_replicas"`
	NoAck        bool             `json:"no_ack,omitempty"`
```
{% /source %}
