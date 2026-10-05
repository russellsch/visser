# Staged authoring review probe

These supplied facts and drafts are fictional. They test the authoring review
instructions. They are not executable Visser bundles or real-system claims.
No screenshots or interaction results are supplied. Do not infer visual or
runtime inspection from these textual figure descriptions.

## Reader and tasks

The reader is a backend engineer familiar with APIs, HTTP requests, queues,
workers, and databases. They do not know these systems' local policy terms.

Tasks:

- Explain what a successful submission proves and who owns retry behavior.
- Explain which policy a queued job uses after a policy update.
- Predict the image dimensions and information loss for a 1200 × 800 input.

## A — Billing facts

S1: The Order API adds a pending job to the queue. It returns HTTP 202 after
the enqueue operation succeeds. This does not establish payment success.
S2: The Charge Worker reads queued jobs and calls the external Payment Provider.
S3: The worker resends an uncertain charge with the same order ID. The provider
deduplicates that ID for 24 hours. No behavior after 24 hours is specified.
S4: API and worker deploy together as Order Service. The provider has a separate
owner. Neither source specifies retry intervals or the maximum queue length.

### Draft main path and figure specification

Title: A successful submission completes payment.
Order API → Charge Worker → Payment Provider, all inside an Order Service group.
Edge labels: "sends data" and "retries". Left-to-right placement means first,
second, third. All nodes use amber emphasis because they are important.

The Charge Worker prevents duplicate charges. Its current policy makes this safe.

### Draft optional bodies

Charge Worker: The Charge Worker processes charges. See S2.
Payment Provider: Retries after 24 hours have no stated deduplication guarantee.
Order Service: This group contains the Order Service components.

## B — Policy facts

S5: At submission, the API stores a policy revision ID in each job. The worker
loads that revision. Later policy changes do not change already queued jobs.
S6: The project calls that revision the "settlement window". It is a policy
revision identifier, not a duration. Its exact identifier must remain unchanged
in source excerpts.

### Draft

The worker applies the current policy to the request. This makes it consistent.
Definition: A settlement window is the window used during settlement.
Queue click: This queue stores queued work.

## C — Image facts

S7: This example decodes an image and stretches it directly to 224 × 224 pixels.
It does not crop or pad. A non-square input changes proportions. Downsampling
an input larger than 224 pixels on either axis loses fine detail. The method
does not specify a file-size reduction or an output byte count.

### Draft main path and figure specification

Title: Resize preserves image detail.
1200 × 800 image → 1200 × 800 pixels → 224 × 224 pixels.
Labels: "decode" and "resize". Next sentence: The output is much smaller.
Definition: HTTP is the Hypertext Transfer Protocol used by web APIs.

### Draft optional body

Resize: Direct stretching changes proportions. Downsampling loses fine detail.
The horizontal factor is 224/1200 and the vertical factor is 224/800.

## D — Control cases

S8: Receipt Writer writes receipts into Receipt Store. No failure or retention
behavior is supplied. The reader's only question is which component stores them.

Draft: Receipt Writer writes receipts into Receipt Store.
There is no diagram or clickable body.

S9: A source-inspection link beside an exact configuration excerpt opens that
excerpt for verification. It is explicitly labeled "Source" and claims no extra
explanation. The main paragraph already explains the supported behavior.

S10: The architecture figure contains two distinct labels: "Pending payment
reconciliation worker" and "Completed payment reconciliation worker". The
source distinguishes these roles. No render is supplied.

## Review request

Apply the default staged review to the supplied drafts and facts. Return concrete
findings with source references, the misleading interpretation, and the smallest
correction. Identify controls that should remain. State which stages cannot be
established from this packet. Do not invent a finding to fill a stage.
