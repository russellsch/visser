---
format: visser/1
docId: 0b6f3c2a-7d41-4e59-9a1b-2c3d4e5f6a7b
title: Term auto-link fixture
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id h_title -->
# A reference packet names a target

{% definition id="def_target" term="target" aliases=["targets"] %}
A target is one addressable part of a document.
{% /definition %}

{% definition id="def_packet" term="reference packet" aliases=["reference packets", "packet"] %}
A reference packet names one target by document ID and target ID.
{% /definition %}

{% definition id="def_state" term="state" auto=false %}
A state is one resolver answer for a packet.
{% /definition %}

<!-- vs:id p_intro -->
An agent sends a reference packet with each edit. The packet names one
target, and the state of the packet can change. The
{% term ref="def_state" %}state{% /term %} is the answer of the resolver.

<!-- vs:id l_rules -->
- Each target has one ID.
- Two targets never share an ID. Use `target` in code as a plain word.

<!-- vs:id t_terms -->
| Word | Meaning |
|---|---|
| target | one part |
| packet | one reference |

{% graph id="g_flow" mode="architecture" title="Where a packet goes" question="Which part reads the reference packet?" %}
The agent sends the packet, and the resolver reads it.

{% node id="n_agent" role="external" label="Agent" /%}

{% node id="n_resolver" role="process" label="Packet resolver" %}
Finds the target of each packet.
{% /node %}

{% edge id="e_send" from="n_agent" to="n_resolver" kind="call" label="send a reference packet" /%}
{% /graph %}
