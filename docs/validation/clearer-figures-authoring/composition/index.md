---
format: visser/1
docId: 9f99c895-6337-4c36-af63-c682ab252af7
title: Clearer figures — composition checks
kind: reference
capturedAt: 2026-10-04T00:00:00Z
visibility: private
---

<!-- vs:id overview -->
# Clearer figures — composition checks

<!-- vs:id introduction -->
These constructed examples use the fixed evaluation packets. They check the new visual language, not a real service or human comprehension.

<!-- vs:id boundary_answer -->
## The worker owns charge retries

<!-- vs:id boundary_claim -->
The Order API and Charge Retry Worker deploy together. Only the worker retries calls to the External Payment Provider. A provider outage prevents those calls from succeeding; the packet does not establish a retry schedule or guarantee eventual success.

{% graph id="boundary" mode="architecture" title="Shared deployment ends at the provider call" question="Who owns charge retries, and which call crosses the service boundary?" %}
The Order Service boundary means shared deployment. It does not imply a security boundary.
{% group id="g_service" label="Order Service" %}
The API accepts requests; the worker owns provider retries. Shared deployment does not transfer retry ownership to the API.
{% /group %}
{% node id="n_api" label="Order API" role="interface" group="g_service" /%}
{% node id="n_worker" label="Charge Retry Worker" role="process" group="g_service" emphasis="teal" %}
Retries failed provider calls. The supplied packet does not specify backoff or a retry limit.
{% /node %}
{% node id="n_provider" label="External Payment Provider" role="external" /%}
{% node id="n_writer" label="Receipt Writer" role="process" /%}
{% edge id="e_request" from="n_api" to="n_worker" kind="data" label="supplies charge request" /%}
{% edge id="e_charge" from="n_worker" to="n_provider" kind="call" label="calls and retries provider" emphasis="teal" %}
This call crosses the Order Service deployment boundary. Provider operation is outside the service.
{% /edge %}
{% edge id="e_receipt" from="n_worker" to="n_writer" kind="data" label="supplies received result" /%}
{% /graph %}

<!-- vs:id causal_answer -->
## Two conditions support the inferred mechanism

<!-- vs:id causal_claim -->
The investigation infers that hot-key expiry together with a rising read rate increased backend reads. Neither observed condition alone establishes this cause. Without the read-rate rise, the proposed combined mechanism is not established by this packet.

{% graph id="causality" mode="cause" title="Inference remains visibly qualified" question="Which links are inferred rather than directly observed?" %}
The dashed links express the inferred joint contribution, not two independently sufficient causes.
{% factor id="f_expiry" label="Hot key expires" basis="observed" /%}
{% factor id="f_rate" label="Read rate rises" basis="observed" /%}
{% factor id="f_reads" label="Backend reads increase" basis="inferred" emphasis="violet" /%}
{% factor id="f_limit" label="Connections reach limit" basis="observed" /%}
{% causal-link id="c_expiry" from="f_expiry" to="f_reads" label="contributes with rising read rate" basis="inferred" emphasis="violet" /%}
{% causal-link id="c_rate" from="f_rate" to="f_reads" label="contributes with hot-key expiry" basis="inferred" /%}
{% causal-link id="c_limit" from="f_reads" to="f_limit" label="may explain connection saturation" basis="inferred" /%}
{% /graph %}

<!-- vs:id loss_answer -->
## Only oversized inputs lose spatial detail

<!-- vs:id loss_claim -->
Resize caps the longer side at 224 pixels. It discards fine spatial detail only if an input side exceeds 224 pixels. A 200 by 180 pixel image loses no pixels at this step. The packet states no other loss.

{% transform id="resize" title="Resize has a conditional loss" question="When does resize discard spatial detail?" %}
Decode and batching have no stated loss. Only resize can discard spatial detail, when either input side exceeds 224 pixels.
{% stage id="st_photo" label="Photo" representation="encoded image" /%}
{% stage id="st_pixels" label="Pixel array" representation="pixels" /%}
{% stage id="st_resized" label="Size-capped pixels" representation="pixels" /%}
{% stage id="st_batch" label="Batch" representation="pixel arrays" /%}
{% conversion id="cv_decode" from="st_photo" to="st_pixels" label="decodes" /%}
{% conversion id="cv_resize" from="st_pixels" to="st_resized" label="resizes only above 224 px" condition="Either side exceeds 224 pixels" loss="fine spatial detail when resized" emphasis="amber" %}
Both sides at or below 224 pixels pass without discarding pixels. This example makes no claim about the resampling method.
{% /conversion %}
{% conversion id="cv_batch" from="st_resized" to="st_batch" label="adds to batch" /%}
{% /transform %}

<!-- vs:id neutral_answer -->
## Neutral control

<!-- vs:id neutral_claim -->
The Receipt Writer stores the receipt in the Receipt Store. A sentence answers this packet without adding a group, emphasis, or steps.
