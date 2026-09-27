---
format: visser/1
docId: 1b0c5e2a-1111-4a11-8a11-111111111111
title: Connection lifecycle
kind: architecture
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Connection lifecycle

{% graph id="conn_states" mode="state" title="A connection closes once" question="Which events move a connection between states?" %}
A connection opens, may idle, and closes exactly once.

{% state id="st_opening" label="Opening" initial=true %}
The socket is being established.
{% /state %}

{% state id="st_open" label="Open" %}
Requests can be sent.
{% /state %}

{% state id="st_closed" label="Closed" terminal=true %}
No further transitions.
{% /state %}

{% transition id="tr_connect" from="st_opening" to="st_open" event="connected" label="handshake completes" action="start keepalive" %}
The keepalive timer starts here.
{% /transition %}

{% transition id="tr_retry" from="st_opening" to="st_opening" event="timeout" label="retry" guard="attempts < 3" %}
A self-transition: the connection retries.
{% /transition %}

{% transition id="tr_close" from="st_open" to="st_closed" event="close" label="caller closes" %}
No guard is stated in the source material.
{% /transition %}
{% /graph %}
