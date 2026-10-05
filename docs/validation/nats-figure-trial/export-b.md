<!-- visser-text/1 docId=a0fadfa2-db19-4a68-af6f-1d8e0ddb07b6 -->

<!-- vs:target overview -->
# Why JetStream can redeliver completed work

<!-- vs:target def_jetstream -->
**Definition: JetStream**

JetStream is the NATS server feature that stores messages in streams and delivers them through consumers.

<!-- vs:target def_ack -->
**Definition: ACK**

An ACK is a worker's message that tells the consumer to stop redelivery for a message.

<!-- vs:target def_nak -->
**Definition: NAK**

A NAK is a worker's negative acknowledgement that asks the consumer to redeliver a message.

<!-- vs:target p_scope -->
This example has one JetStream stream with `LimitsPolicy`, one durable pull consumer with `AckExplicit`, and two workers. The stream stores the message; the consumer tracks deliveries and answers the workers' requests for messages. `AckExplicit` requires the worker to acknowledge each delivery. An ACK tells the consumer to stop waiting only if the server receives it. [cite: src_ack_policy] [cite: src_delivery] [cite: src_ack_state]

<!-- vs:target p_answer -->
If worker A finishes the external work but its ACK does not reach JetStream, the consumer still has a pending ACK. The server cannot infer external completion from that work. When the ACK deadline expires, the consumer queues a retry if it has not reached the delivery limit. Worker B can receive it if the message remains in the stream and B has a valid pull request. B may repeat the external effect unless the application prevents it. [cite: src_delivery] [cite: src_expiry] [cite: src_max] [cite: src_redeliver] [cite: src_pull]

<!-- vs:target h_owners -->
## The stream and consumer know different things

<!-- vs:target g_ownership -->
**graph (architecture): Storage, delivery, and external work**

Question: Which component knows that the work is complete?

The consumer tracks delivery and ACK state. The external system sees the worker's effect. Neither record automatically proves the other. The ACK arrow is an attempt; it can fail before receipt.

<!-- vs:target n_stream -->
Node Stream (storage)
Evidence: LimitsPolicy ACK retention (src_retention)

<!-- vs:target n_consumer -->
Node Durable pull consumer (process)
Evidence: Delivery tracks pending ACK (src_delivery)

<!-- vs:target n_worker_a -->
Node Worker A (process)

<!-- vs:target n_worker_b -->
Node Worker B (process)

<!-- vs:target n_external -->
Node External system (external)

<!-- vs:target e_load -->
Durable pull consumer --[data; loads stored message]--> Stream
Evidence: Redelivery before new messages (src_redeliver)

<!-- vs:target e_pull_a -->
Worker A --[call; requests next message]--> Durable pull consumer

<!-- vs:target e_deliver_a -->
Durable pull consumer --[data; delivers message]--> Worker A
Evidence: Delivery tracks pending ACK (src_delivery)

<!-- vs:target e_effect -->
Worker A --[call; performs external work]--> External system

<!-- vs:target e_ack -->
Worker A --[control; ACK attempt; may be lost]--> Durable pull consumer

<!-- vs:target e_pull_b -->
Worker B --[call; requests next message]--> Durable pull consumer

<!-- vs:target e_deliver_b -->
Durable pull consumer --[data; can redeliver message]--> Worker B
Evidence: Pull request chooses recipient (src_pull), Redelivery before new messages (src_redeliver)

<!-- vs:target p_boundary -->
The durable consumer keeps a pending entry when it delivers under `AckExplicit`. A received ACK removes that entry. The stream holds the message under its own retention rules. These are separate records. [cite: src_delivery] [cite: src_ack_state] [cite: src_retention]

<!-- vs:target h_trace -->
## A lost ACK leaves work pending

<!-- vs:target t_lost_ack -->
**trace: One message, two possible workers**

Question: How can B receive work that A already finished?

Ordering, not duration.

This trace assumes that A completes the external work and its ACK fails before JetStream receives it. B can request a message while A is working; redelivery still needs an expired pending ACK, a valid pull request, and a message that remains in the stream.

<!-- vs:target a_consumer -->
Actor Durable pull consumer (entity: n_consumer)

<!-- vs:target a_worker_a -->
Actor Worker A (entity: n_worker_a)

<!-- vs:target a_worker_b -->
Actor Worker B (entity: n_worker_b)

<!-- vs:target a_external -->
Actor External system (entity: n_external)

<!-- vs:target ev_first -->
Event Delivers message to A (send; actor: Durable pull consumer)
after: (none)
Durable pull consumer --[message; Delivers message to A]--> Worker A
Evidence: Delivery tracks pending ACK (src_delivery)

<!-- vs:target ev_work -->
Event Starts external work (call; actor: Worker A)
after: Delivers message to A (ev_first)
Worker A --[message; Starts external work]--> External system

<!-- vs:target ev_pull -->
Event B requests next message (call; actor: Worker B)
after: Delivers message to A (ev_first)
Worker B --[message; B requests next message]--> Durable pull consumer

<!-- vs:target ev_effect -->
Event External effect completes (state-change; actor: External system)
after: Starts external work (ev_work)

<!-- vs:target ev_lost -->
Event A's ACK is lost before receipt (failure; actor: Worker A)
after: External effect completes (ev_effect)

<!-- vs:target ev_timeout -->
Event ACK deadline expires (wait; actor: Durable pull consumer)
after: A's ACK is lost before receipt (ev_lost)
Evidence: Pending timeout and redelivery (src_expiry)

<!-- vs:target ev_queue -->
Event Queues redelivery (state-change; actor: Durable pull consumer)
after: ACK deadline expires (ev_timeout)
Evidence: Pending timeout and redelivery (src_expiry)

<!-- vs:target ev_second -->
Event Redelivers stored message (send; actor: Durable pull consumer)
after: Queues redelivery (ev_queue), B requests next message (ev_pull)
Durable pull consumer --[message; Redelivers stored message]--> Worker B
Evidence: Redelivery before new messages (src_redeliver)
Evidence: Pull request chooses recipient (src_pull)

<!-- vs:target p_trace_condition -->
The trace shows one possible order: B requests a message while A is working, then waits for a delivery. A later pull request would also work; either worker could receive the retry. The retry needs both a queued message and a valid pull request. If the stream has already removed the message, the consumer cannot load it for redelivery. [cite: src_expiry] [cite: src_pull] [cite: src_redeliver]

<!-- vs:target p_late_ack -->
If a late ACK reaches the consumer before B receives the message, the consumer can clear both pending state and queued redelivery. Expiry alone does not guarantee a second delivery. [cite: src_ack_state]

<!-- vs:target h_controls -->
## Timing and delivery limits change the next attempt

<!-- vs:target tbl_controls -->
| Control | Effect in this case |
|---|---|
| `AckWait` | The consumer waits for an ACK after delivery. When the pending entry expires, it queues redelivery. [cite: src_expiry] |
| `BackOff` | Its first interval replaces `AckWait`. Later intervals set later timeout deadlines. [cite: src_time_default] [cite: src_expiry] |
| `NAK` | A received NAK queues redelivery without waiting for the ordinary timeout. A NAK with a delay schedules a later retry. [cite: src_ack_dispatch] [cite: src_nak] |
| `MaxDeliver` | The consumer stops new delivery attempts when it reaches the configured count. Its unset value means no delivery limit. [cite: src_max] [cite: src_max_default] |

<!-- vs:target p_nak_condition -->
The lost ACK in the trace is not a NAK. The server can act on a NAK only when it receives that NAK. `BackOff` governs timeout redelivery; the NAK path handles immediate or explicit-delay retry separately. [cite: src_ack_dispatch] [cite: src_nak]

<!-- vs:target h_retention -->
## A delivery limit does not erase the stream message

<!-- vs:target p_retention -->
`MaxDeliver` limits the consumer's attempts for one message. It does not prove that the external work completed. Under `LimitsPolicy`, an ACK does not remove that message from the stream. The stream has separate storage limits, such as `MaxMsgs`, `MaxBytes`, and `MaxAge`. [cite: src_max] [cite: src_retention] [cite: src_stream_limits]

<!-- vs:target p_application -->
The application must decide how to handle repeated external work. For example, it can record a stable work identifier in the external system and reject a second application of that identifier. The consumer's ACK state records delivery confirmation; it does not record the external effect. [cite: src_ack_state]

<!-- vs:target src_ack_policy -->
**Source: Explicit ACK policy**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 330
end: 340
excerptSha256: 22e7f6bafe337642527e4468880c4fe00cc3ba7c7959a96562c1538a04915717
capturedAt: 2026-10-05T01:50:17Z

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

<!-- vs:target src_delivery -->
**Source: Delivery tracks pending ACK**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 5207
end: 5226
excerptSha256: 7eb3437dfd1d83501188a61dcb5c1526dd6e264b3f5f8976299df31d80b16a77
capturedAt: 2026-10-05T01:50:54Z

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

<!-- vs:target src_ack_state -->
**Source: Explicit ACK pending state**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 3279
end: 3350
excerptSha256: e73e9bbad19d72ab9e46d9950afa7474bd1b0b6ee2b3817c54db85f77402b39a
capturedAt: 2026-10-05T01:58:35Z

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

<!-- vs:target src_expiry -->
**Source: Pending timeout and redelivery**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 5488
end: 5568
excerptSha256: 61a9985dbc29fc688a6310159497e56a98a15e62be6afe74b94498b7a6b05b79
capturedAt: 2026-10-05T01:50:56Z

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

<!-- vs:target src_max -->
**Source: Delivery limit handling**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 2146
end: 2174
excerptSha256: f727375bf969744d46a61a0121148d4f9dca733b6a32595258128c3117dedf56
capturedAt: 2026-10-05T01:50:36Z

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

<!-- vs:target src_redeliver -->
**Source: Redelivery before new messages**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 4394
end: 4426
excerptSha256: 68c52700ca2b0b96b0a7657caf3423c20b0cdc02c492149efd8e1cb3501beb98
capturedAt: 2026-10-05T01:50:48Z

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

<!-- vs:target src_pull -->
**Source: Pull request chooses recipient**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 4908
end: 4920
excerptSha256: ddb4a7d2201c4a1a29b86fed44a95621d5b3664641354e97fadccab96f5a2b52
capturedAt: 2026-10-05T01:50:51Z

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

<!-- vs:target src_retention -->
**Source: LimitsPolicy ACK retention**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/stream.go
start: 7504
end: 7518
excerptSha256: bc3d3cd9864c9249c2409f3c4515210ebba71e0491e6417414edc1bb5dfe0b8e
capturedAt: 2026-10-05T01:51:00Z

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

<!-- vs:target src_time_default -->
**Source: AckWait and BackOff defaults**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 629
end: 639
excerptSha256: 01ca49c1885c9efb2495b78cc333b6d06e55e56a7c4f5d3fda3be5154c583ec1
capturedAt: 2026-10-05T01:50:32Z

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

<!-- vs:target src_ack_dispatch -->
**Source: ACK and NAK dispatch**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 2529
end: 2556
excerptSha256: 0a4e13a1ab5d7be759f63f97a7964974deb2cea3d464447e97c76eaf17c068ad
capturedAt: 2026-10-05T01:50:38Z

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

<!-- vs:target src_nak -->
**Source: NAK handling**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 2853
end: 2927
excerptSha256: bbd345251c9cfecdfd644aa3d2ea810ad065ac6a16515e369c2485915d62046a
capturedAt: 2026-10-05T01:50:42Z

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

<!-- vs:target src_max_default -->
**Source: MaxDeliver default**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/consumer.go
start: 568
end: 574
excerptSha256: 4727318c8b258c019c6b33b1219c84ee5df3c2a3c68c0a2bf4e40e82830a734b
capturedAt: 2026-10-05T01:50:30Z

```go
	// Setup default of -1, meaning no limit for MaxDeliver.
	if config.MaxDeliver == 0 || config.MaxDeliver < -1 {
		if pedantic && config.MaxDeliver < -1 {
			return NewJSPedanticError(errors.New("max_deliver must be set to -1"))
		}
		config.MaxDeliver = -1
	}
```

<!-- vs:target src_stream_limits -->
**Source: Stream retention limits**

kind: git
language: go
repository: https://github.com/nats-io/nats-server.git
commit: fc6ec648d806652d282d2f0edb6cb9f22c895572
file: server/stream.go
start: 48
end: 65
excerptSha256: aed4817443ea517e963fcb7cd807b7b84bdc98927e01521278531aae39167f0b
capturedAt: 2026-10-05T01:53:16Z

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
