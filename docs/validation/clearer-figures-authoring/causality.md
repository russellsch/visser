# Packet: basis versus attention

This packet is invented for evaluation. A log shows that a hot key expired.
A second log shows that the read rate rose. Neither observation alone proves
the cause of a connection pool stall. The investigation infers that
simultaneous misses increased backend reads. A pool metric directly shows
that active connections reached the configured limit. The link from stalled
connections to user timeouts is supported by matching request records.

Reader task: name the inferred links, distinguish it from the observed facts,
and predict what happens if the read rate does not rise. The main path must
state that both conditions are needed. A causal diagram must preserve basis
through labels and line patterns in colour and greyscale. Text view must
identify the same basis.

Authored emphasis may point to the simultaneous-miss mechanism. It must not
use teal for observed, violet for inferred, and amber for hypothetical. Reject
an accent that makes an inferred link look directly observed. Omitting
emphasis entirely is acceptable.
