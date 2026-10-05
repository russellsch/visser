# Packet: shared function and a long name

This packet is invented for evaluation. The public Order API accepts a charge
request. The Charge Retry Worker reads that request and calls the External
Payment Provider. The API and worker deploy together as the Order Service.
The provider is operated outside that service. The worker owns retries; the
API does not retry provider calls. A receipt writer stores the result after
the worker receives it. No other shared deployment or owner is established.

Reader task: identify who retries a failed provider call. Explain which nodes
share a deployment boundary and which external edge crosses it. Predict what
changes if the provider is unavailable. The overview must answer the boundary
question at 320 CSS px. A focused figure may explain the retry branch.

Accept a source-supported Order Service group with its API and worker. Keep
the provider outside. Preserve "Charge Retry Worker" where "worker" alone
would be ambiguous. Reject a "Misc" wrapper around the provider and writer,
or an answer that exists only after opening a viewer.
