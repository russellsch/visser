<!-- visser-text/1 docId=9f99c895-6337-4c36-af63-c682ab252af7 -->

<!-- vs:target overview -->
# Clearer figures — composition checks

<!-- vs:target introduction -->
These constructed examples use the fixed evaluation packets. They check the new visual language, not a real service or human comprehension.

<!-- vs:target boundary_answer -->
## The worker owns charge retries

<!-- vs:target boundary_claim -->
The Order API and Charge Retry Worker deploy together. Only the worker retries calls to the External Payment Provider. A provider outage prevents those calls from succeeding; the packet does not establish a retry schedule or guarantee eventual success.

<!-- vs:target boundary -->
**graph (architecture): Shared deployment ends at the provider call**

Question: Who owns charge retries, and which call crosses the service boundary?

The Order Service boundary means shared deployment. It does not imply a security boundary.

<!-- vs:target g_service -->
Group Order Service
The API accepts requests; the worker owns provider retries. Shared deployment does not transfer retry ownership to the API.

<!-- vs:target n_api -->
Node Order API (interface) (group: g_service)

<!-- vs:target n_worker -->
Node Charge Retry Worker (process) (group: g_service)
emphasis: teal
Retries failed provider calls. The supplied packet does not specify backoff or a retry limit.

<!-- vs:target n_provider -->
Node External Payment Provider (external)

<!-- vs:target n_writer -->
Node Receipt Writer (process)

<!-- vs:target e_request -->
Order API --[data; supplies charge request]--> Charge Retry Worker

<!-- vs:target e_charge -->
Charge Retry Worker --[call; calls and retries provider]--> External Payment Provider
emphasis: teal
This call crosses the Order Service deployment boundary. Provider operation is outside the service.

<!-- vs:target e_receipt -->
Charge Retry Worker --[data; supplies received result]--> Receipt Writer

<!-- vs:target causal_answer -->
## Two conditions support the inferred mechanism

<!-- vs:target causal_claim -->
The investigation infers that hot-key expiry together with a rising read rate increased backend reads. Neither observed condition alone establishes this cause. Without the read-rate rise, the proposed combined mechanism is not established by this packet.

<!-- vs:target causality -->
**graph (cause): Inference remains visibly qualified**

Question: Which links are inferred rather than directly observed?

The dashed links express the inferred joint contribution, not two independently sufficient causes.

<!-- vs:target f_expiry -->
Factor Hot key expires (basis: observed)

<!-- vs:target f_rate -->
Factor Read rate rises (basis: observed)

<!-- vs:target f_reads -->
Factor Backend reads increase (basis: inferred)
emphasis: violet

<!-- vs:target f_limit -->
Factor Connections reach limit (basis: observed)

<!-- vs:target c_expiry -->
Hot key expires --[causal; contributes with rising read rate]--> Backend reads increase (basis: inferred)
emphasis: violet

<!-- vs:target c_rate -->
Read rate rises --[causal; contributes with hot-key expiry]--> Backend reads increase (basis: inferred)

<!-- vs:target c_limit -->
Backend reads increase --[causal; may explain connection saturation]--> Connections reach limit (basis: inferred)

<!-- vs:target loss_answer -->
## Only oversized inputs lose spatial detail

<!-- vs:target loss_claim -->
Resize caps the longer side at 224 pixels. It discards fine spatial detail only if an input side exceeds 224 pixels. A 200 by 180 pixel image loses no pixels at this step. The packet states no other loss.

<!-- vs:target resize -->
**transform: Resize has a conditional loss**

Question: When does resize discard spatial detail?

Decode and batching have no stated loss. Only resize can discard spatial detail, when either input side exceeds 224 pixels.

<!-- vs:target st_photo -->
Stage Photo
representation: encoded image

<!-- vs:target st_pixels -->
Stage Pixel array
representation: pixels

<!-- vs:target st_resized -->
Stage Size-capped pixels
representation: pixels

<!-- vs:target st_batch -->
Stage Batch
representation: pixel arrays

<!-- vs:target cv_decode -->
Photo --[conversion; decodes]--> Pixel array

<!-- vs:target cv_resize -->
Pixel array --[conversion; resizes only above 224 px]--> Size-capped pixels
loss: fine spatial detail when resized
condition: Either side exceeds 224 pixels
emphasis: amber
Both sides at or below 224 pixels pass without discarding pixels. This example makes no claim about the resampling method.

<!-- vs:target cv_batch -->
Size-capped pixels --[conversion; adds to batch]--> Batch

<!-- vs:target neutral_answer -->
## Neutral control

<!-- vs:target neutral_claim -->
The Receipt Writer stores the receipt in the Receipt Store. A sentence answers this packet without adding a group, emphasis, or steps.
