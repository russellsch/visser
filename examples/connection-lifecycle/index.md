---
format: visser/1
docId: 7a94392a-cf3b-4fc2-8044-23c6609be447
title: A pooled connection can only close after it drains
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [TCP, connection pools]
  new: [the draining state in this illustrative pool]
  mustUnderstand: [why close waits for in-flight requests, which failures skip draining]
visibility: private
---

<!-- vs:id overview -->
# A pooled connection can only close after it drains

<!-- vs:id p_claim -->
In this illustrative pool, a connection that is asked to close first stops
accepting new requests, then waits for the requests it already carries. Only
an empty connection closes cleanly. A transport failure is the exception: it
goes straight to closed and fails the requests it was carrying.

<!-- vs:id p_scope -->
The states and events below describe a teaching design, not a particular
library. The diagram shows which transitions the design permits; it does not
prove that an implementation never reaches another state.

{% graph id="lifecycle" mode="state" title="Close waits for in-flight requests" question="Which events move a connection toward closed, and which guard delays it?" %}
Draining sits between open and closed. A request never starts on a draining
connection.

{% state id="st_idle" label="Idle" initial=true %}
No socket exists yet. The pool may create one when demand appears.
{% /state %}

{% state id="st_connecting" label="Connecting" %}
A socket and handshake are in progress. No request is sent until the handshake
completes.
{% /state %}

{% state id="st_open" label="Open" %}
The connection accepts new requests. The count of in-flight requests can be
zero or more.
{% /state %}

{% state id="st_draining" label="Draining" %}
The connection accepts no new requests. It stays here while at least one
request is still in flight.
{% /state %}

{% state id="st_closed" label="Closed" terminal=true %}
The socket is released. A closed connection is never reused; the pool creates
a new one instead.
{% /state %}

{% transition id="tr_dial" from="st_idle" to="st_connecting" event="demand" label="demand: dial" action="open socket" %}
The pool dials only when a request is waiting and no idle connection exists.
{% /transition %}

{% transition id="tr_retry" from="st_connecting" to="st_connecting" event="handshake timeout" label="timeout: retry" guard="attempts < 3" action="redial" %}
A handshake timeout redials the same connection object. After the third
attempt the guard is false and the failure transition applies instead.
{% /transition %}

{% transition id="tr_ready" from="st_connecting" to="st_open" event="handshake done" label="handshake done" %}
The connection becomes available to the pool.
{% /transition %}

{% transition id="tr_close" from="st_open" to="st_draining" event="close requested" label="close requested" action="stop accepting requests" %}
Close is a request, not an immediate action. The pool removes the connection
from the set that new requests can choose.
{% /transition %}

{% transition id="tr_drained" from="st_draining" to="st_closed" event="last response" label="last response" guard="in-flight = 0" action="release socket" %}
The guard is what makes close graceful: the socket is released only when no
request still depends on it.
{% /transition %}

{% transition id="tr_fail" from="st_open" to="st_closed" event="transport error" label="transport error" action="fail in-flight requests" %}
A broken socket cannot drain. Its in-flight requests fail immediately, which
is why callers still need their own retry policy.
{% /transition %}

{% transition id="tr_giveup" from="st_connecting" to="st_closed" event="handshake timeout" label="timeout: give up" guard="attempts = 3" %}
The third timeout ends the attempt instead of retrying.
{% /transition %}
{% /graph %}

<!-- vs:id h_consequences -->
## What this means for callers

<!-- vs:id l_consequences -->
- A graceful shutdown can take as long as the slowest in-flight request.
- A transport error bypasses draining, so a request can fail during shutdown.
- Retrying a failed request selects a different connection; it never revives a
  closed one.
