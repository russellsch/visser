# Reader task

You are an experienced engineer familiar with queues and network failures, but
new to JetStream. Use only the supplied explanation and its rendered images.
Do not consult source code, external documentation, author notes, or other versions.

First use the main path with optional details closed:

1. Worker A reports that its work finished, but its acknowledgement never reached
   the server. What can happen next, and what does it depend on?
2. What changes when a retry deadline expires, when the delivery-attempt limit
   is reached, and when a stream retention limit applies?
3. How does explicitly rejecting a delivery differ from sending no acknowledgement?
4. Trace the central diagram. Which orderings are required, and which describe
   just the chosen example? Identify any unclear arrow, label, or boundary.

For each answer, name the visible phrase or figure part that supports it and
state uncertainty. Do not fill gaps from prior knowledge. Inspect the supplied
desktop and narrow images for legibility and reading order, without claiming
interaction checks from screenshots.

After the main-path answers, inspect the supplied detail text and images.
Name the new question a detail answers, or explain why it adds nothing useful.
Report qualifications that change an earlier answer. Do not recommend a change
merely to produce a finding.
