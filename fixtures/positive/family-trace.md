---
format: visser/1
docId: 7b0c5e2a-7777-4a77-8a77-777777777777
title: Login outcomes
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Login outcomes

{% trace id="login" title="A login ends in success or lockout" question="What happens after the password check?" %}
The two branches exclude each other.

{% actor id="a_user" label="User" /%}
{% actor id="a_auth" label="Auth service" /%}

{% branch id="b_ok" label="Password correct" condition="hash matches" exclusiveWith=["b_bad"] /%}
{% branch id="b_bad" label="Password wrong" condition="hash differs" exclusiveWith=["b_ok"] /%}

{% event id="ev_submit" actor="a_user" to="a_auth" label="Submits password" kind="send" %}
The request carries the password.
{% /event %}

{% event id="ev_check" actor="a_auth" label="Checks hash" kind="compute" after=["ev_submit"] %}
Constant-time comparison.
{% /event %}

{% event id="ev_token" actor="a_auth" to="a_user" label="Issues token" kind="send" after=["ev_check"] branch="b_ok" %}
Success path.
{% /event %}

{% event id="ev_count" actor="a_auth" label="Counts failure" kind="state-change" after=["ev_check"] branch="b_bad" %}
Failure path.
{% /event %}
{% /trace %}

{% trace id="timed" title="Timed retry" question="How long does one retry take?" scale="time" timeUnit="ms" %}
Times are measured on one host.

{% actor id="a_client" label="Client" /%}

{% event id="tv_send" actor="a_client" label="Sends" kind="send" time=0 %}
{% /event %}

{% event id="tv_retry" actor="a_client" label="Retries" kind="send" time=250 duration=10 after=["tv_send"] %}
{% /event %}
{% /trace %}
