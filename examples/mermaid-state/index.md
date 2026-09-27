---
format: visser/1
docId: fc51c531-4784-4722-893c-9368c8965549
title: A card payment is captured only after an explicit amount check
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [card authorization and capture]
  new: [the capture check in this illustrative flow]
  mustUnderstand: [which states are final, why capture can be refused]
visibility: private
---

<!-- vs:id pay_overview -->
# A card payment is captured only after an explicit amount check

<!-- vs:id pay_claim -->
Authorization reserves an amount; capture moves money. Between the two, the
service checks the requested capture amount against the authorized amount. A
capture above the authorized amount is refused, and the payment stays
authorized rather than failing.

<!-- vs:id pay_limits -->
This is an illustrative lifecycle. Real card networks add partial captures,
authorization expiry, and refunds, which are not shown.

{% mermaid id="pay_lifecycle" title="The capture check keeps an oversized capture from failing the payment" question="Which transitions are possible after authorization?" %}
Captured, Declined, and Voided are final. The diamond is a decision, not a
state that a payment waits in.

```mermaid
stateDiagram-v2
  state CaptureCheck <<choice>>
  [*] --> Pending
  Pending --> Authorized : issuer approves
  Pending --> Declined : issuer declines
  Authorized --> CaptureCheck : capture requested
  CaptureCheck --> Captured : amount at most authorized
  CaptureCheck --> Authorized : amount above authorized, capture refused
  Authorized --> Voided : void before capture
  Captured --> [*]
  Declined --> [*]
  Voided --> [*]
```
{% /mermaid %}

<!-- vs:id pay_void -->
A void is possible only from Authorized. Once a payment is captured, returning
money is a refund, which is a separate payment in this design.
